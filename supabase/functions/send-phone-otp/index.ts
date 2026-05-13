// Supabase Edge Function: send-phone-otp
// Sends a 6-digit OTP for phone number verification.
// Delivery: Twilio SMS if configured, otherwise Resend email as fallback.
// Rate limited: max 3 per phone per hour, max 5 per user per day.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://bivoapp.io',
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

    const { phone } = body

    // Validate Finnish phone number (+358...)
    const cleanPhone = (phone ?? '').replace(/[\s\-()]/g, '')
    if (!/^\+358\d{6,10}$/.test(cleanPhone)) {
      return new Response(JSON.stringify({ error: 'invalid_phone' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Rate limit: max 3 OTPs per phone per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: phoneCount } = await supabase
      .from('phone_verifications')
      .select('*', { count: 'exact', head: true })
      .eq('phone', cleanPhone)
      .gte('created_at', oneHourAgo)

    if ((phoneCount ?? 0) >= 3) {
      return new Response(JSON.stringify({ error: 'rate_limited' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Rate limit: max 5 OTPs per user per day
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: userCount } = await supabase
      .from('phone_verifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', oneDayAgo)

    if ((userCount ?? 0) >= 5) {
      return new Response(JSON.stringify({ error: 'daily_limit' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate 6-digit OTP (cryptographically random)
    const randomBytes = new Uint32Array(1)
    crypto.getRandomValues(randomBytes)
    const otp = String(100000 + (randomBytes[0] % 900000))
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    // Store OTP
    const { error: insertError } = await supabase.from('phone_verifications').insert({
      user_id: user.id,
      phone: cleanPhone,
      code: otp,
      expires_at: expiresAt,
      verified: false,
      attempts: 0,
    })
    if (insertError) throw insertError

    // Delivery: prefer Twilio SMS, fallback to Resend email
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER')
    const resendKey = Deno.env.get('RESEND_API_KEY')

    let deliveryMethod = 'none'

    if (twilioSid && twilioToken && twilioFrom) {
      // Primary: send via Twilio SMS
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: cleanPhone,
            From: twilioFrom,
            Body: `Bivo: Vahvistuskoodisi on ${otp}. Koodi vanhenee 10 minuutissa.`,
          }).toString(),
          signal: controller.signal,
        },
      )
      clearTimeout(timeout)

      if (!twilioRes.ok) {
        const errBody = await twilioRes.text().catch(() => 'unknown')
        console.error('[send-phone-otp] Twilio error:', twilioRes.status, errBody)
        return new Response(JSON.stringify({ error: 'sms_send_failed' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      deliveryMethod = 'sms'
    } else if (resendKey && user.email) {
      // Fallback: send via Resend email
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Bivo <noreply@bivoapp.io>',
          to: [user.email],
          subject: `Bivo — Puhelinvahvistuskoodi: ${otp}`,
          html: `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
            <h2 style="margin:0 0 16px">Puhelinvahvistus</h2>
            <p>Vahvistuskoodisi numeroon <strong>${cleanPhone}</strong>:</p>
            <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px;background:#f5f5f5;border-radius:12px;margin:16px 0">${otp}</div>
            <p style="color:#666;font-size:13px">Koodi vanhenee 10 minuutissa. Jos et pyytänyt tätä koodia, voit jättää viestin huomiotta.</p>
          </div>`,
        }),
      })

      if (!emailRes.ok) {
        const errBody = await emailRes.text().catch(() => 'unknown')
        console.error('[send-phone-otp] Resend error:', emailRes.status, errBody)
        return new Response(JSON.stringify({ error: 'sms_send_failed' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      deliveryMethod = 'email'
    } else {
      console.error('[send-phone-otp] No delivery method configured (need TWILIO_* or RESEND_API_KEY)')
      return new Response(JSON.stringify({ error: 'sms_not_configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, expires_in: 600, delivery: deliveryMethod }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[send-phone-otp]', err.message)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
