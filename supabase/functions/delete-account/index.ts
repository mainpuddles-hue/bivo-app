// Supabase Edge Function: delete-account
//
// Fully deletes the authenticated caller's account including the auth.users
// row (which requires service_role and is NOT possible from the client or
// from a plain RPC). The function:
//
//   1. Verifies the caller via the Authorization: Bearer <jwt> header
//   2. Cleans up ~20 related tables (posts marked inactive; messages
//      anonymized; likes/comments/follows/saves/etc. deleted)
//   3. Anonymizes the profiles row (PII cleared)
//   4. Calls auth.admin.deleteUser(userId) to remove the auth record
//
// The caller can only delete THEIR OWN account — the userId is derived
// from the verified JWT, never from the request body, so there is no way
// to use this endpoint to delete a different user.
//
// Mirrors the GDPR / "right to erasure" requirement documented in
// app/settings.tsx. Replaces the previous RPC+client-side fallback which
// left the auth.users row dangling (so the email could still be used to
// sign in after "deletion").

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface CleanupResult {
  table: string
  ok: boolean
  error?: string
}

async function cleanupUserData(
  supabase: SupabaseClient,
  uid: string,
  deletedUserLabel: string,
): Promise<CleanupResult[]> {
  // All mutations run in parallel — Promise.allSettled so a failure in one
  // table doesn't abort the rest. Order does NOT matter because we use
  // service_role (RLS bypassed) and there are no pre-existing FKs that
  // would require a specific sequence.
  const ops: { table: string; promise: Promise<any> }[] = [
    // Posts: keep rows for transaction history but deactivate them
    { table: 'posts', promise: supabase.from('posts').update({ is_active: false }).eq('user_id', uid) },
    // Post engagement
    { table: 'post_likes', promise: supabase.from('post_likes').delete().eq('user_id', uid) },
    { table: 'post_comments', promise: supabase.from('post_comments').delete().eq('user_id', uid) },
    { table: 'post_boosts', promise: supabase.from('post_boosts').delete().eq('user_id', uid) },
    // Social graph
    { table: 'user_follows_follower', promise: supabase.from('user_follows').delete().eq('follower_id', uid) },
    { table: 'user_follows_followed', promise: supabase.from('user_follows').delete().eq('followed_id', uid) },
    { table: 'thanks', promise: supabase.from('thanks').delete().eq('from_user_id', uid) },
    { table: 'reviews_reviewer', promise: supabase.from('reviews').delete().eq('reviewer_id', uid) },
    // Saved items
    { table: 'saved_posts', promise: supabase.from('saved_posts').delete().eq('user_id', uid) },
    { table: 'saved_events', promise: supabase.from('saved_events').delete().eq('user_id', uid) },
    // Messages — anonymize content but keep rows so the other party's
    // conversation history isn't silently mutated
    { table: 'messages', promise: supabase.from('messages').update({ content: null, image_url: null }).eq('sender_id', uid) },
    { table: 'conversation_members', promise: supabase.from('conversation_members').delete().eq('user_id', uid) },
    // Groups & activities
    { table: 'group_members', promise: supabase.from('group_members').delete().eq('user_id', uid) },
    { table: 'group_post_likes', promise: supabase.from('group_post_likes').delete().eq('user_id', uid) },
    { table: 'activity_members', promise: supabase.from('activity_members').delete().eq('user_id', uid) },
    { table: 'community_event_participants', promise: supabase.from('community_event_participants').delete().eq('user_id', uid) },
    { table: 'event_attendees', promise: supabase.from('event_attendees').delete().eq('user_id', uid) },
    // Forum
    { table: 'forum_votes', promise: supabase.from('forum_votes').delete().eq('user_id', uid) },
    // Notifications & gamification
    { table: 'notifications', promise: supabase.from('notifications').delete().eq('user_id', uid) },
    { table: 'notification_preferences', promise: supabase.from('notification_preferences').delete().eq('user_id', uid) },
    { table: 'user_points', promise: supabase.from('user_points').delete().eq('user_id', uid) },
    { table: 'user_boosts', promise: supabase.from('user_boosts').delete().eq('user_id', uid) },
    { table: 'boost_purchases', promise: supabase.from('boost_purchases').delete().eq('user_id', uid) },
    { table: 'user_badges', promise: supabase.from('user_badges').delete().eq('user_id', uid) },
    // Profile — anonymize all PII before the auth row is removed
    {
      table: 'profiles',
      promise: supabase.from('profiles').update({
        name: deletedUserLabel,
        bio: null,
        avatar_url: null,
        push_token: null,
        naapurusto: null,
        email: null,
        business_name: null,
        business_phone: null,
        business_website: null,
        invite_code: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
      }).eq('id', uid),
    },
  ]

  const settled = await Promise.allSettled(ops.map(o => o.promise))
  return settled.map((res, i) => {
    if (res.status === 'fulfilled') {
      const errorFromSupabase = (res.value as any)?.error
      if (errorFromSupabase) {
        return { table: ops[i].table, ok: false, error: errorFromSupabase.message ?? 'unknown' }
      }
      return { table: ops[i].table, ok: true }
    }
    return { table: ops[i].table, ok: false, error: String(res.reason ?? 'rejected') }
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')

    // ── Auth: verify the caller's JWT ─────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Service-role client — used for both verifying the JWT and for the
    // cleanup work. The JWT is passed explicitly to getUser() so the
    // client's own session isn't affected.
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const uid = user.id

    // Optional: accept a localized "deleted user" label from the body so
    // the anonymized profile.name reads naturally in the caller's UI.
    let deletedUserLabel = 'Poistettu käyttäjä'
    try {
      const body = await req.json().catch(() => null)
      if (body && typeof body.deletedUserLabel === 'string' && body.deletedUserLabel.length > 0 && body.deletedUserLabel.length <= 64) {
        deletedUserLabel = body.deletedUserLabel
      }
    } catch {
      // Empty body is fine
    }

    // ── 1. Clean up related tables ─────────────────────
    const cleanupResults = await cleanupUserData(supabase, uid, deletedUserLabel)
    const failures = cleanupResults.filter(r => !r.ok)
    if (failures.length > 0) {
      console.warn(`[delete-account] ${failures.length} cleanup operation(s) failed for user ${uid}:`, failures)
    }

    // ── 2. Delete the auth.users row ───────────────────
    // This is the key step that was missing from the previous client-side
    // fallback — without it the email address stayed bound to a valid
    // auth record and could be used to sign in again.
    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(uid)
    if (deleteAuthError) {
      console.error(`[delete-account] Failed to delete auth.users row for ${uid}:`, deleteAuthError.message)
      return new Response(
        JSON.stringify({
          error: 'Account data cleaned up but auth record deletion failed',
          details: deleteAuthError.message,
          cleanup_failures: failures,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.log(`[delete-account] Successfully deleted user ${uid} (${failures.length} cleanup warnings)`)

    return new Response(
      JSON.stringify({
        success: true,
        cleanup_failures: failures.length > 0 ? failures : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[delete-account]', err?.message ?? err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
