// Sends transactional emails via Supabase's built-in email service
// Types: booking_confirmation, payment_receipt, booking_reminder, welcome

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// In-memory rate limit store: userId -> { count, windowStart }
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()

const TEMPLATES: Record<string, (data: any) => { subject: string; html: string }> = {
  booking_confirmation: (data) => ({
    subject: `Varaus vahvistettu: ${data.post_title}`,
    html: `
      <h2>Varauksesi on vahvistettu!</h2>
      <p><strong>${data.post_title}</strong></p>
      <p>Päivämäärä: ${data.dates}</p>
      <p>Summa: ${data.amount}€</p>
      <p>Viesti palveluntarjoajalle löytyy TackBird-sovelluksesta.</p>
      <br>
      <p>— TackBird</p>
    `,
  }),
  payment_receipt: (data) => ({
    subject: `Maksukuitti: ${data.amount}€`,
    html: `
      <h2>Maksu onnistui</h2>
      <p><strong>${data.description}</strong></p>
      <p>Summa: ${data.amount}€</p>
      <p>Päivämäärä: ${data.date}</p>
      <p>Stripe-viite: ${data.stripe_id}</p>
      <br>
      <p>— TackBird</p>
    `,
  }),
  welcome: (data) => ({
    subject: 'Tervetuloa TackBirdiin!',
    html: `
      <h2>Tervetuloa ${data.name}!</h2>
      <p>Naapurustosi odottaa sinua.</p>
      <p>Aloita luomalla ensimmäinen postaus tai selaamalla naapuruston ilmoituksia.</p>
      <br>
      <p>— TackBird</p>
    `,
  }),
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── Auth check ─────────────────────────────────────────────
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

    // ── Rate limiting: max 5 emails per hour per user ──────────
    const now = Date.now()
    const ONE_HOUR = 60 * 60 * 1000
    const entry = rateLimitMap.get(user.id)
    if (entry && (now - entry.windowStart) < ONE_HOUR) {
      if (entry.count >= 5) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 5 emails per hour.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      entry.count++
    } else {
      rateLimitMap.set(user.id, { count: 1, windowStart: now })
    }

    const body = await req.json()
    const { to_email, template, data } = body

    if (!to_email || !template || !TEMPLATES[template]) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { subject, html } = TEMPLATES[template](data ?? {})

    // Send via Resend API
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'TackBird <onboarding@resend.dev>', to: to_email, subject, html }),
    })

    if (!resendRes.ok) {
      const resendErr = await resendRes.json().catch(() => ({}))
      console.error('[send-email] Resend error:', JSON.stringify(resendErr))
      return new Response(JSON.stringify({ error: 'Failed to send email' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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
