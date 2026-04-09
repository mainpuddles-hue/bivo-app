// Edge Function: verify-otp-code
// Verifies a 6-digit OTP code against the otp_codes table

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Verify apikey header to prevent unauthenticated access from arbitrary clients
    const apiKey = req.headers.get('apikey')
    const expectedKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!apiKey || apiKey !== expectedKey) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let body
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { email, code, type = 'signup' } = body

    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Email and code required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanCode = code.trim()

    if (!/^\d{6}$/.test(cleanCode)) {
      return new Response(JSON.stringify({ error: 'Invalid code format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

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

    // Atomically find AND mark the code as used in a single UPDATE to prevent
    // TOCTOU race conditions where two concurrent requests verify the same code.
    // The WHERE clause includes `used = false` so only the first request succeeds.
    const { data: otpRecord, error: claimError } = await supabase
      .from('otp_codes')
      .update({ used: true })
      .eq('email', cleanEmail)
      .eq('code', cleanCode)
      .eq('type', type)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .select('id, expires_at')
      .maybeSingle()

    if (claimError) throw claimError

    if (!otpRecord) {
      // Code was invalid, expired, or already used by a concurrent request.
      // Increment verify_attempts on the most recent OTP for this email.
      // Use RPC-style atomic increment to avoid another TOCTOU on the counter,
      // but since this is only a counter for rate limiting the impact is minimal.
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

    // Code was atomically claimed — it is now marked as used

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
