// Supabase Edge Function: ads-scheduler
// Cron job to manage advertisement lifecycle:
// 1. Activate ads where start_date <= now AND status = 'paid'
// 2. Deactivate ads where end_date < now AND status = 'active'
// 3. Clean up stale pending_payment ads older than 1 hour
// Called by pg_cron every 15 minutes.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

serve(async (req) => {
  try {
    // Verify cron secret to prevent unauthorized invocations
    const authHeader = req.headers.get('Authorization')
    const cronSecret = Deno.env.get('CRON_SECRET')
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const now = new Date().toISOString()
    let activated = 0
    let deactivated = 0
    let cleaned = 0

    // 1. Activate paid ads whose start_date has arrived
    const { data: toActivate, error: activateErr } = await supabase
      .from('advertisements')
      .update({ status: 'active' })
      .eq('status', 'paid')
      .lte('start_date', now)
      .select('id')

    if (activateErr) {
      console.error('[ads-scheduler] activate error:', activateErr.message)
    } else {
      activated = toActivate?.length ?? 0
    }

    // 2. Deactivate expired active ads
    const { data: toDeactivate, error: deactivateErr } = await supabase
      .from('advertisements')
      .update({ status: 'ended' })
      .eq('status', 'active')
      .lt('end_date', now)
      .select('id')

    if (deactivateErr) {
      console.error('[ads-scheduler] deactivate error:', deactivateErr.message)
    } else {
      deactivated = toDeactivate?.length ?? 0
    }

    // 3. Clean up stale pending_payment ads (older than 1 hour — payment never completed)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: toClear, error: clearErr } = await supabase
      .from('advertisements')
      .delete()
      .eq('status', 'pending_payment')
      .lt('created_at', oneHourAgo)
      .select('id')

    if (clearErr) {
      console.error('[ads-scheduler] cleanup error:', clearErr.message)
    } else {
      cleaned = toClear?.length ?? 0
    }

    const summary = `activated=${activated} deactivated=${deactivated} cleaned=${cleaned}`
    console.log(`[ads-scheduler] ${summary}`)

    return new Response(
      JSON.stringify({ ok: true, activated, deactivated, cleaned }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[ads-scheduler]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
