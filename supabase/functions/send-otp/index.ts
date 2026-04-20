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
  'Access-Control-Allow-Origin': 'https://tackbird.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateCode(): string {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return String(array[0] % 900000 + 100000)
}

// --- MX record validation for disposable email detection ---

// In-memory cache for MX lookup results (persists for function lifetime)
const mxCache = new Map<string, { hasMx: boolean; checkedAt: number }>()
const MX_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

// Known disposable email MX hosts — domains whose MX records point to these are likely disposable
const DISPOSABLE_MX_HOSTS = [
  'mx.yopmail.com',
  'mx1.guerrillamail.com',
  'mx2.guerrillamail.com',
  'mail.sharklasers.com',
  'mx.throwaway.email',
  'mx.tempail.com',
  'mx.mailinator.com',
  'mx1.tempmailo.com',
  'mx2.tempmailo.com',
  'mx.dispostable.com',
  'mx.trashmail.com',
  'mx.fakeinbox.com',
]

/**
 * Check if a domain has valid MX records using Deno's DNS resolver.
 * Returns false (reject) if:
 *   - Domain has no MX records at all
 *   - Domain's MX records point to known disposable email services
 * Returns true (allow) if:
 *   - Domain has valid MX records not matching disposable patterns
 *   - DNS lookup times out (fail-open to avoid blocking legitimate emails)
 *   - DNS lookup fails for any reason (fail-open)
 */
async function hasMxRecords(domain: string): Promise<boolean> {
  // Check cache first
  const cached = mxCache.get(domain)
  if (cached && Date.now() - cached.checkedAt < MX_CACHE_TTL) {
    return cached.hasMx
  }

  try {
    // Race DNS lookup against a 2-second timeout
    const result = await Promise.race([
      Deno.resolveDns(domain, 'MX'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ])

    // Timeout — fail open (allow the email)
    if (result === null) {
      mxCache.set(domain, { hasMx: true, checkedAt: Date.now() })
      return true
    }

    const mxRecords = result as Deno.MxRecord[]

    // No MX records → reject
    if (!mxRecords || mxRecords.length === 0) {
      mxCache.set(domain, { hasMx: false, checkedAt: Date.now() })
      return false
    }

    // Check if MX records point to known disposable services
    const isDisposable = mxRecords.some((mx) =>
      DISPOSABLE_MX_HOSTS.some((disposableHost) =>
        mx.exchange.toLowerCase().replace(/\.$/, '') === disposableHost
      )
    )

    if (isDisposable) {
      mxCache.set(domain, { hasMx: false, checkedAt: Date.now() })
      return false
    }

    // Valid MX records that are not known disposable hosts
    mxCache.set(domain, { hasMx: true, checkedAt: Date.now() })
    return true
  } catch {
    // DNS resolution failed (NXDOMAIN, SERVFAIL, etc.) — fail open to avoid
    // false positives for domains with temporary DNS issues
    mxCache.set(domain, { hasMx: true, checkedAt: Date.now() })
    return true
  }
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

    // Block disposable email domains — two-layer check:
    // 1. Static blocklist in DB (fast)
    // 2. MX record validation (catches unknown disposable domains)
    const emailDomain = cleanEmail.split('@')[1]
    if (emailDomain) {
      // Layer 1: Static blocklist check
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

      // Layer 2: MX record validation — reject domains with no MX records
      // or MX records pointing to known disposable email services
      const domainHasMx = await hasMxRecords(emailDomain)
      if (!domainHasMx) {
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

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    let resendRes: Response
    try {
      resendRes = await fetch('https://api.resend.com/emails', {
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
        signal: controller.signal,
      })
      clearTimeout(timeout)
    } catch (fetchErr: any) {
      clearTimeout(timeout)
      console.error('[send-otp] Resend fetch failed:', fetchErr.message)
      return new Response(JSON.stringify({ error: 'Failed to send verification code' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!resendRes.ok) {
      const resendErr = await resendRes.json().catch(() => ({}))
      console.error('[send-otp] Resend error:', JSON.stringify(resendErr))
      return new Response(JSON.stringify({ error: 'Failed to send verification code' }), {
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
