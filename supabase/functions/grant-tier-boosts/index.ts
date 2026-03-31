// Supabase Edge Function: grant-tier-boosts
// Monthly cron function that grants free boost credits to Pro and Business users.
// Pro users: 2 credits/month, Business users: 5 credits/month.
// Idempotent: checks last_grant_at to avoid double-granting within the same month.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.fi',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TIER_CREDITS = {
  pro: 2,
  business: 5,
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')

    // ── Auth: require cron secret or admin JWT ─────────────────
    const cronSecret = req.headers.get('x-cron-secret')
    const expectedSecret = Deno.env.get('CRON_SECRET')

    if (!expectedSecret || cronSecret !== expectedSecret) {
      // Fallback: check for admin JWT
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const authSupabase = createClient(supabaseUrl, supabaseServiceKey)
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: userError } = await authSupabase.auth.getUser(token)
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Check if user is admin
      const { data: profile } = await authSupabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      if (!profile?.is_admin) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // ── Pro users ──────────────────────────────────────────────
    const { data: proUsers, error: proError } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_pro', true)

    if (proError) {
      console.error('[grant-tier-boosts] Failed to query Pro users:', proError.message)
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let proGranted = 0
    let proSkipped = 0

    for (const profile of proUsers ?? []) {
      const granted = await grantCreditsIfNeeded(
        supabase,
        profile.id,
        TIER_CREDITS.pro,
        currentMonth,
        now,
      )
      if (granted) {
        proGranted++
      } else {
        proSkipped++
      }
    }

    // ── Business users ─────────────────────────────────────────
    const { data: businessUsers, error: bizError } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_business', true)

    if (bizError) {
      console.error('[grant-tier-boosts] Failed to query Business users:', bizError.message)
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let bizGranted = 0
    let bizSkipped = 0

    for (const profile of businessUsers ?? []) {
      const granted = await grantCreditsIfNeeded(
        supabase,
        profile.id,
        TIER_CREDITS.business,
        currentMonth,
        now,
      )
      if (granted) {
        bizGranted++
      } else {
        bizSkipped++
      }
    }

    // ── Summary ────────────────────────────────────────────────
    const summary = {
      month: currentMonth,
      pro: {
        total: proUsers?.length ?? 0,
        granted: proGranted,
        skipped: proSkipped,
        credits_each: TIER_CREDITS.pro,
      },
      business: {
        total: businessUsers?.length ?? 0,
        granted: bizGranted,
        skipped: bizSkipped,
        credits_each: TIER_CREDITS.business,
      },
      total_credits_granted:
        proGranted * TIER_CREDITS.pro + bizGranted * TIER_CREDITS.business,
    }

    console.log(
      `[grant-tier-boosts] Granted ${summary.total_credits_granted} credits: ` +
      `${proGranted}/${proUsers?.length ?? 0} Pro users (${TIER_CREDITS.pro} each), ` +
      `${bizGranted}/${businessUsers?.length ?? 0} Business users (${TIER_CREDITS.business} each)`
    )

    return new Response(JSON.stringify({ success: true, summary }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[grant-tier-boosts]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

/**
 * Grant boost credits to a user if they haven't been granted this month.
 * Returns true if credits were granted, false if skipped (already granted).
 */
async function grantCreditsIfNeeded(
  supabase: any,
  userId: string,
  credits: number,
  currentMonth: string,
  now: Date,
): Promise<boolean> {
  // Check existing boost record
  const { data: existing } = await supabase
    .from('user_boosts')
    .select('balance, last_grant_at')
    .eq('user_id', userId)
    .single()

  // Idempotency: check if already granted this month
  if (existing?.last_grant_at) {
    const lastGrant = new Date(existing.last_grant_at)
    const lastGrantMonth = `${lastGrant.getFullYear()}-${String(lastGrant.getMonth() + 1).padStart(2, '0')}`
    if (lastGrantMonth === currentMonth) {
      return false // Already granted this month
    }
  }

  const newBalance = (existing?.balance ?? 0) + credits

  // Upsert: insert if no row exists, update if it does
  const { error } = await supabase
    .from('user_boosts')
    .upsert({
      user_id: userId,
      balance: newBalance,
      last_grant_at: now.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id' })

  if (error) {
    console.error(`[grant-tier-boosts] Failed to grant to ${userId}:`, error.message)
    return false
  }

  return true
}
