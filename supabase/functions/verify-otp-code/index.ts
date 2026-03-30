// Edge Function: verify-otp-code
// Verifies a 6-digit OTP code against the otp_codes table

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { email, code, type = 'signup' } = await req.json()

    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Email and code required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanCode = code.trim()

    // ── Brute-force protection ──────────────────────────────────
    // Count failed verification attempts in the last 15 minutes for this email.
    // Uses the verify_attempts column on otp_codes rows as a cumulative counter.
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

    const { data: recentOtps } = await supabase
      .from('otp_codes')
      .select('verify_attempts')
      .eq('email', cleanEmail)
      .eq('type', type)
      .gte('created_at', fifteenMinAgo)

    const totalAttempts = (recentOtps ?? []).reduce(
      (sum: number, row: any) => sum + (row.verify_attempts ?? 0),
      0,
    )

    if (totalAttempts >= 5) {
      console.warn(`[verify-otp-code] Brute-force blocked for ${cleanEmail} (${totalAttempts} attempts in 15 min)`)
      return new Response(JSON.stringify({
        error: 'too_many_attempts',
        verified: false,
        message: 'Too many failed attempts. Please wait 15 minutes before trying again.',
      }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find valid (unused, not expired) code
    const { data: otpRecord, error: findError } = await supabase
      .from('otp_codes')
      .select('id, expires_at')
      .eq('email', cleanEmail)
      .eq('code', cleanCode)
      .eq('type', type)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (findError) throw findError

    if (!otpRecord) {
      // Increment verify_attempts on the most recent OTP for this email
      const { data: latestOtp } = await supabase
        .from('otp_codes')
        .select('id, verify_attempts')
        .eq('email', cleanEmail)
        .eq('type', type)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestOtp) {
        await supabase
          .from('otp_codes')
          .update({ verify_attempts: (latestOtp.verify_attempts ?? 0) + 1 })
          .eq('id', latestOtp.id)
      }

      return new Response(JSON.stringify({ error: 'invalid_code', verified: false }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Mark code as used
    await supabase.from('otp_codes').update({ used: true }).eq('id', otpRecord.id)

    // Mark email as verified in profiles
    if (type === 'signup') {
      await supabase.from('profiles')
        .update({ onboarding_completed: false }) // trigger onboarding
        .eq('email', cleanEmail)
    }

    // For recovery: generate a recovery link so the client can establish a session
    if (type === 'recovery') {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: cleanEmail,
      })
      if (linkError || !linkData?.properties?.hashed_token) {
        console.error('[verify-otp-code] generateLink error:', linkError?.message)
        // Still return verified=true so user isn't stuck, but without session token
        return new Response(JSON.stringify({ verified: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        verified: true,
        token_hash: linkData.properties.hashed_token,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ verified: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[verify-otp-code]', err.message)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
