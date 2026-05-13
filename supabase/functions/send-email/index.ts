// Sends transactional emails via Supabase's built-in email service
// Types: booking_confirmation, payment_receipt, booking_reminder, welcome, password_reset, refund_confirmation

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://bivoapp.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiting constants
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
// Fallback in-memory store (lost on container restart — DB check is primary)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()

/** Escape HTML special characters to prevent XSS in email templates */
function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const TEMPLATES: Record<string, (data: any) => { subject: string; html: string }> = {
  booking_confirmation: (data) => ({
    subject: `Varaus vahvistettu: ${escapeHtml(data.post_title)}`,
    html: `
      <h2>Varauksesi on vahvistettu!</h2>
      <p><strong>${escapeHtml(data.post_title)}</strong></p>
      <p>Päivämäärä: ${escapeHtml(data.dates)}</p>
      <p>Summa: ${escapeHtml(data.amount)}€</p>
      <p>Viesti palveluntarjoajalle löytyy Bivo-sovelluksesta.</p>
      <br>
      <p>— Bivo</p>
    `,
  }),
  payment_receipt: (data) => ({
    subject: `Maksukuitti: ${escapeHtml(data.amount)}€`,
    html: `
      <h2>Maksu onnistui</h2>
      <p><strong>${escapeHtml(data.description)}</strong></p>
      <p>Summa: ${escapeHtml(data.amount)}€</p>
      <p>Päivämäärä: ${escapeHtml(data.date)}</p>
      <p>Stripe-viite: ${escapeHtml(data.stripe_id)}</p>
      <br>
      <p>— Bivo</p>
    `,
  }),
  welcome: (data) => ({
    subject: 'Tervetuloa Bivoon!',
    html: `
      <h2>Tervetuloa ${escapeHtml(data.name)}!</h2>
      <p>Naapurustosi odottaa sinua.</p>
      <p>Aloita luomalla ensimmäinen postaus tai selaamalla naapuruston ilmoituksia.</p>
      <br>
      <p>— Bivo</p>
    `,
  }),
  password_reset: (data) => ({
    subject: 'Vaihda salasanasi — Bivo',
    html: `
      <h2>Salasanan vaihto</h2>
      <p>Klikkaa alla olevaa linkkiä vaihtaaksesi salasanasi:</p>
      <p><a href="${escapeHtml(data.reset_url)}" style="display:inline-block;padding:12px 24px;background:#2D6B5E;color:#fff;text-decoration:none;border-radius:8px;">Vaihda salasana</a></p>
      <p>Jos et pyytänyt tätä, voit ohittaa tämän viestin.</p>
      <br>
      <p>— Bivo</p>
    `,
  }),
  refund_confirmation: (data) => ({
    subject: `Hyvitys käsitelty: ${escapeHtml(data.amount)}€`,
    html: `
      <h2>Hyvityksesi on käsitelty</h2>
      <p><strong>${escapeHtml(data.description)}</strong></p>
      <p>Summa: ${escapeHtml(data.amount)}€</p>
      <p>Hyvitys näkyy tililläsi 5–10 arkipäivän kuluessa.</p>
      <br>
      <p>— Bivo</p>
    `,
  }),
  booking_reminder: (data) => ({
    subject: `Muistutus: ${escapeHtml(data.post_title)} huomenna`,
    html: `
      <h2>Varauksesi on huomenna!</h2>
      <p><strong>${escapeHtml(data.post_title)}</strong></p>
      <p>Päivämäärä: ${escapeHtml(data.date)}</p>
      <p>Muista palauttaa tavara sovittuna aikana.</p>
      <p><a href="https://bivoapp.io" style="display:inline-block;padding:12px 24px;background:#2D6B5E;color:#fff;text-decoration:none;border-radius:8px;">Avaa Bivo</a></p>
      <br>
      <p>— Bivo</p>
    `,
  }),
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── Auth check ─────────────────────────────────────────────
    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Rate limiting: max 5 emails per hour per user (DB-backed, atomic) ──
    // Insert the rate-limit log entry FIRST (optimistically), then count.
    // If count > limit, delete the entry and reject. This closes the race
    // window where two concurrent requests both pass a SELECT count check.
    const now = Date.now()
    const oneHourAgo = new Date(now - RATE_LIMIT_WINDOW_MS).toISOString()

    // Optimistic insert — reserve a slot
    const { data: rateLimitEntry, error: rlInsertError } = await supabase
      .from('notifications')
      .insert({
        user_id: user.id,
        type: 'email_sent',
        title: 'Email: rate_limit_reserve',
        body: 'pending',
        is_read: true,
      })
      .select('id')
      .single()

    if (rlInsertError) {
      console.error('[send-email] Rate limit insert failed:', rlInsertError.message)
      // Fall through — don't block email on rate-limit bookkeeping failure
    }

    // Now count how many (including the one we just inserted)
    const { count: recentCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('type', 'email_sent')
      .gte('created_at', oneHourAgo)

    if ((recentCount ?? 0) > RATE_LIMIT_MAX) {
      // Over limit — delete the optimistic entry and reject
      if (rateLimitEntry?.id) {
        await supabase.from('notifications').delete().eq('id', rateLimitEntry.id)
      }
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 5 emails per hour.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fallback: in-memory guard for burst protection within same container
    const entry = rateLimitMap.get(user.id)
    if (entry && (now - entry.windowStart) < RATE_LIMIT_WINDOW_MS) {
      if (entry.count >= RATE_LIMIT_MAX) {
        if (rateLimitEntry?.id) {
          await supabase.from('notifications').delete().eq('id', rateLimitEntry.id)
        }
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 5 emails per hour.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      entry.count++
    } else {
      rateLimitMap.set(user.id, { count: 1, windowStart: now })
    }

    let body
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { to_email, template, data } = body

    if (!to_email || !template || !TEMPLATES[template]) {
      // Clean up rate-limit reservation on validation failure
      if (rateLimitEntry?.id) {
        await supabase.from('notifications').delete().eq('id', rateLimitEntry.id).catch(() => {})
      }
      return new Response(JSON.stringify({ error: 'Missing fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Authorization: users can only send transactional emails to their own address.
    // Fetch caller's email from profile and compare.
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .maybeSingle()
    const callerEmail = callerProfile?.email ?? user.email
    if (!callerEmail || to_email.toLowerCase() !== callerEmail.toLowerCase()) {
      if (rateLimitEntry?.id) {
        await supabase.from('notifications').delete().eq('id', rateLimitEntry.id).catch(() => {})
      }
      return new Response(JSON.stringify({ error: 'Can only send to your own email' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { subject, html } = TEMPLATES[template](data ?? {})

    // Send via Resend API
    const resendApiKey = getEnvOrThrow('RESEND_API_KEY')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    let resendRes: Response
    try {
      resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Bivo <onboarding@resend.dev>', to: to_email, subject, html }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
    } catch (fetchErr: any) {
      clearTimeout(timeout)
      console.error('[send-email] Resend fetch failed:', fetchErr.message)
      if (rateLimitEntry?.id) {
        await supabase.from('notifications').delete().eq('id', rateLimitEntry.id).catch(() => {})
      }
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!resendRes.ok) {
      const resendErr = await resendRes.json().catch(() => ({}))
      console.error('[send-email] Resend error:', resendErr?.statusCode || resendErr?.name || 'unknown')
      if (rateLimitEntry?.id) {
        await supabase.from('notifications').delete().eq('id', rateLimitEntry.id).catch(() => {})
      }
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update the optimistic rate-limit entry with actual template info
    if (rateLimitEntry?.id) {
      await supabase.from('notifications')
        .update({ title: `Email: ${template}`, body: to_email })
        .eq('id', rateLimitEntry.id)
        .catch(() => {}) // Non-critical
    }

    return new Response(
      JSON.stringify({ sent: true, template }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[send-email]', err.message)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
