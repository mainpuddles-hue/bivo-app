// Edge Function: send-otp
// Generates a 6-digit OTP code, saves to DB, sends via Resend API
// Works without domain verification using onboarding@resend.dev

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

function generateCode(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return String(array[0] % 900000 + 100000)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const resendApiKey = getEnvOrThrow('RESEND_API_KEY')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let body
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { email, type = 'signup' } = body

    const validTypes = ['signup', 'recovery']
    if (!validTypes.includes(type)) {
      return new Response(JSON.stringify({ error: 'Invalid type' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cleanEmail = email.trim().toLowerCase()

    // Block disposable email domains
    const emailDomain = cleanEmail.split('@')[1]
    if (emailDomain) {
      const { data: blockedDomain } = await supabase
        .from('blocked_email_domains')
        .select('domain')
        .eq('domain', emailDomain)
        .maybeSingle()

      if (blockedDomain) {
        return new Response(JSON.stringify({ error: 'This email provider is not supported' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Rate limit: max 3 OTP requests per email in 10 minutes
    const { count } = await supabase
      .from('otp_codes')
      .select('id', { count: 'exact', head: true })
      .eq('email', cleanEmail)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())

    if ((count ?? 0) >= 3) {
      return new Response(JSON.stringify({ error: 'Too many requests. Try again in 10 minutes.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Invalidate previous codes for this email+type
    await supabase.from('otp_codes').update({ used: true })
      .eq('email', cleanEmail).eq('type', type).eq('used', false)

    // Generate and save new code
    const code = generateCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min

    const { error: insertError } = await supabase.from('otp_codes').insert({
      email: cleanEmail,
      code,
      type,
      expires_at: expiresAt,
    })
    if (insertError) throw insertError

    // Send via Resend API
    const emailHtml = `<!DOCTYPE html>
<html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F4F0;font-family:-apple-system,BlinkMacSystemFont,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F0;padding:32px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="background:#2D6B5E;padding:28px 32px;border-radius:16px 16px 0 0">
<h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:1.7px">TACKBIRD</h1>
<p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px">Naapurustosi ilmoitustaulu</p>
</td></tr>
<tr><td style="background:#fff;padding:36px 32px;font-size:15px;line-height:1.6;color:#1A1A2E">
<h2 style="margin:0 0 16px;font-size:20px">${type === 'recovery' ? 'Nollaa salasanasi' : 'Vahvista sahkopostisi'}</h2>
<p>${type === 'recovery' ? 'Syota tama koodi TackBird-sovellukseen:' : 'Tervetuloa TackBirdiin! Syota tama koodi sovellukseen:'}</p>
<div style="margin:28px 0;text-align:center;background:#F5F4F0;border-radius:12px;padding:24px">
<span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#2D6B5E">${code}</span>
</div>
<p style="font-size:13px;color:#8B8680">Koodi vanhenee 10 minuutissa.</p>
</td></tr>
<tr><td style="background:#ECEAE4;padding:20px 32px;border-radius:0 0 16px 16px;font-size:12px;color:#8B8680;text-align:center">
<p style="margin:0">Jos et pyytanyt tata koodia, voit jattaa taman viestin huomiotta.</p>
</td></tr></table></td></tr></table></body></html>`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'TackBird <onboarding@resend.dev>',
        to: cleanEmail,
        subject: type === 'recovery' ? 'TackBird — Nollaa salasanasi' : 'TackBird — Vahvistuskoodi',
        html: emailHtml,
      }),
    })

    if (!resendRes.ok) {
      const resendErr = await resendRes.json().catch(() => ({}))
      console.error('[send-otp] Resend error:', JSON.stringify(resendErr))
      return new Response(JSON.stringify({ error: 'Failed to send email', details: resendErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ sent: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[send-otp]', err.message)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
