// Supabase Edge Function: verify-phone-otp
// Verifies 6-digit phone OTP and marks profile as phone_verified.
// Max 5 attempts per OTP code.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'invalid_request_body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { phone, code } = body
    if (!phone || !code) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cleanPhone = (phone ?? '').replace(/[\s\-()]/g, '')
    const cleanCode = String(code).trim()

    // Find latest unverified OTP for this user + phone
    const { data: verification } = await supabase
      .from('phone_verifications')
      .select('id, code, expires_at, attempts')
      .eq('user_id', user.id)
      .eq('phone', cleanPhone)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!verification) {
      return new Response(JSON.stringify({ error: 'no_pending_verification' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Max 5 attempts per OTP
    if ((verification.attempts ?? 0) >= 5) {
      return new Response(JSON.stringify({ error: 'too_many_attempts' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Increment attempts
    await supabase
      .from('phone_verifications')
      .update({ attempts: (verification.attempts ?? 0) + 1 })
      .eq('id', verification.id)

    // Check expiry
    if (new Date(verification.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'code_expired' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify code
    if (cleanCode !== verification.code) {
      return new Response(JSON.stringify({ error: 'invalid_code' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Mark OTP as verified
    await supabase
      .from('phone_verifications')
      .update({ verified: true })
      .eq('id', verification.id)

    // Update profile
    await supabase
      .from('profiles')
      .update({
        phone: cleanPhone,
        phone_verified: true,
        phone_verified_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    return new Response(JSON.stringify({ success: true, phone: cleanPhone }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[verify-phone-otp]', err.message)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
