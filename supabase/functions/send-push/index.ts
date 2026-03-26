// Supabase Edge Function: send-push
// Intelligent push notification sender with priority routing, batching,
// quiet hours, and urgent auto-matching.
//
// Priority levels:
//   immediate: urgent_help, new_message, booking_paid → send NOW
//   batch: like, follow, thanks, comment → batch every 15 min
//
// Quiet hours: 22:00-07:00 Helsinki time → delay until 07:00
// Exception: urgent_help always sends immediately

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Expo push notification API
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

// Helsinki timezone offset (EET = UTC+2, EEST = UTC+3)
function getHelsinkiHour(): number {
  const now = new Date()
  // Simple offset: March-October is EEST (UTC+3), November-February is EET (UTC+2)
  const month = now.getUTCMonth()
  const offset = (month >= 2 && month <= 9) ? 3 : 2
  return (now.getUTCHours() + offset) % 24
}

function isQuietHours(): boolean {
  const hour = getHelsinkiHour()
  return hour >= 22 || hour < 7
}

// Notification types and their priority
const IMMEDIATE_TYPES = new Set([
  'urgent_help', 'juuri_nyt', 'new_message', 'booking_paid',
  'service_paid', 'booking_confirmed', 'service_confirmed',
])

const BATCH_TYPES = new Set([
  'post_like', 'post_comment', 'new_follower', 'thanks_received',
  'forum_reply', 'badge_earned', 'review_received',
])

interface PushPayload {
  user_id: string          // recipient
  title: string
  body: string
  type: string             // notification type
  data?: Record<string, string>  // deep link data
  post_id?: string         // for urgent matching
}

interface ExpoPushResult {
  success: boolean
  tokenInvalid: boolean
}

async function sendExpoPush(token: string, title: string, body: string, data?: Record<string, string>): Promise<ExpoPushResult> {
  // Validate token format before sending
  if (!token || (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken['))) {
    return { success: false, tokenInvalid: true }
  }

  const message = {
    to: token,
    sound: 'default',
    title,
    body,
    data: data ?? {},
    badge: 1,
  }

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(message),
    })

    if (!res.ok) return { success: false, tokenInvalid: false }

    // Check Expo's response for token errors
    // Expo returns { data: { status: 'ok' | 'error', message?, details? } }
    const result = await res.json()
    const pushResult = result?.data

    if (pushResult?.status === 'error') {
      // Expo returns 'DeviceNotRegistered' when the token is expired/invalid
      const isDeviceNotRegistered = pushResult?.details?.error === 'DeviceNotRegistered'
      const isInvalidToken = pushResult?.details?.error === 'InvalidCredentials'
        || pushResult?.message?.includes('is not a registered push notification recipient')
      return { success: false, tokenInvalid: isDeviceNotRegistered || isInvalidToken }
    }

    return { success: true, tokenInvalid: false }
  } catch {
    return { success: false, tokenInvalid: false }
  }
}

/** Remove an expired/invalid push token from the user's profile */
async function removeInvalidToken(supabase: any, userId: string) {
  await supabase
    .from('profiles')
    .update({ push_token: null })
    .eq('id', userId)
    .catch(() => {})
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const body = await req.json()
    const { user_id, title, body: pushBody, type, data, post_id } = body as PushPayload

    if (!user_id || !title || !pushBody || !type) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    // === URGENT AUTO-MATCH: If this is an urgent post, find and notify nearby helpers ===
    if ((type === 'urgent_help' || type === 'juuri_nyt') && post_id) {
      // Fetch the post to get neighborhood
      const { data: post } = await supabase
        .from('posts')
        .select('title, location, user_id, user:profiles!posts_user_id_fkey(naapurusto)')
        .eq('id', post_id)
        .single()

      if (post) {
        const neighborhood = (post as any).user?.naapurusto

        // Find users in same neighborhood with push tokens (exclude post creator)
        const { data: neighbors } = await supabase
          .from('profiles')
          .select('id, push_token, name')
          .eq('naapurusto', neighborhood)
          .neq('id', (post as any).user_id)
          .not('push_token', 'is', null)
          .limit(50)

        // Send push to all neighbors immediately (urgent = no quiet hours)
        const sent: string[] = []
        const invalidTokenUserIds: string[] = []
        for (const neighbor of (neighbors ?? [])) {
          if (neighbor.push_token) {
            const result = await sendExpoPush(
              neighbor.push_token,
              `🚨 ${title}`,
              pushBody,
              { post_id: post_id!, type: 'urgent', screen: 'post' },
            )
            if (result.success) {
              sent.push(neighbor.id)
            } else if (result.tokenInvalid) {
              invalidTokenUserIds.push(neighbor.id)
            }
          }
        }

        // Clean up expired/invalid tokens in the background
        for (const uid of invalidTokenUserIds) {
          await removeInvalidToken(supabase, uid)
        }

        return new Response(
          JSON.stringify({ sent: sent.length, type: 'urgent_broadcast', neighborhood }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }

    // === STANDARD PUSH: Single user notification ===

    // Get recipient's push token
    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token, language')
      .eq('id', user_id)
      .single()

    if (!profile?.push_token) {
      return new Response(
        JSON.stringify({ sent: false, reason: 'no_push_token' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Check priority
    const isImmediate = IMMEDIATE_TYPES.has(type)
    const isBatch = BATCH_TYPES.has(type)

    // Quiet hours check (except urgent)
    if (isQuietHours() && !IMMEDIATE_TYPES.has(type)) {
      // Store for later delivery (cron job or next app open)
      // For now, skip sending but don't lose the notification (it's already in notifications table)
      return new Response(
        JSON.stringify({ sent: false, reason: 'quiet_hours', queued: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Batch notifications: check if we should batch
    if (isBatch) {
      // Check how many similar notifications in last 15 minutes
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .eq('type', type)
        .eq('is_read', false)
        .gte('created_at', new Date(Date.now() - 15 * 60000).toISOString())

      if ((count ?? 0) > 1) {
        // Batch: send summary instead of individual
        const result = await sendExpoPush(
          profile.push_token,
          title,
          `${count} uutta ilmoitusta`,
          data,
        )
        // Clean up invalid token if detected
        if (result.tokenInvalid) {
          await removeInvalidToken(supabase, user_id)
        }
        return new Response(
          JSON.stringify({ sent: result.success, type: 'batched', count }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }

    // Send individual push
    const result = await sendExpoPush(profile.push_token, title, pushBody, data)

    // Clean up expired/invalid push tokens so we don't keep trying to send to them
    if (result.tokenInvalid) {
      await removeInvalidToken(supabase, user_id)
    }

    return new Response(
      JSON.stringify({ sent: result.success, type: isImmediate ? 'immediate' : 'standard' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[send-push] Error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
