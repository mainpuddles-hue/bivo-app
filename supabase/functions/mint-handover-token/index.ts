// Bivo Edge Function: mint-handover-token
//
// Lender kutsuu — generoi satunnaisen tokenin joka tallennetaan
// rental_bookings.handover_token-kenttään 2h voimassaoloajalla.
// Token piirretään QR-koodiksi mobiilissa.
//
// Borrower skannaa QR:n → verify-handover-token vahvistaa ja siirtää
// pickup_state:n 'in_use'-tilaan (tavara on nyt borrowerilla).
//
// Token on satunnainen 256-bit hex-jono, ei JWT. Yksinkertaisempi ja
// turvallisempi kuin oma JWT-signature-handling: tokenin voi peruuttaa
// hetkessä tyhjentämällä kentän.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000  // 2 tuntia

function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
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

    let body: any
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const bookingId: unknown = body?.booking_id
    if (typeof bookingId !== 'string') {
      return new Response(JSON.stringify({ error: 'booking_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: bk, error: bkError } = await supabase
      .from('rental_bookings')
      .select('id, lender_id, status, pickup_state, handover_token, handover_token_expires_at')
      .eq('id', bookingId)
      .maybeSingle()
    if (bkError || !bk) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (bk.lender_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Vain omistaja voi näyttää nouto-QR-koodin.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (bk.status !== 'confirmed') {
      return new Response(JSON.stringify({
        error: 'QR-koodia voi näyttää vasta, kun pyyntö on hyväksytty.',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (!['awaiting_lender_dropoff', 'awaiting_borrower_pickup'].includes(bk.pickup_state)) {
      return new Response(JSON.stringify({
        error: 'Nouto-QR-koodia ei voi enää näyttää tässä vaiheessa.',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Tarkista onko olemassaoleva token vielä voimassa — jos on, palauta sama
    // (idempotency: useat klikkaukset eivät kuluta uutta tokenia)
    const now = Date.now()
    if (
      bk.handover_token &&
      bk.handover_token_expires_at &&
      new Date(bk.handover_token_expires_at).getTime() > now + 60_000  // vähintään 1 min jäljellä
    ) {
      return new Response(
        JSON.stringify({
          token: bk.handover_token,
          expires_at: bk.handover_token_expires_at,
          booking_id: bk.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const newToken = randomToken()
    const expiresAt = new Date(now + TOKEN_TTL_MS).toISOString()

    const { error: updErr } = await (supabase.from('rental_bookings') as any)
      .update({
        handover_token: newToken,
        handover_token_expires_at: expiresAt,
        // Vaihdetaan pickup_state odottamaan borrowerin saapumista
        pickup_state: 'awaiting_borrower_pickup',
      })
      .eq('id', bookingId)

    if (updErr) {
      console.error('[mint-handover-token] update failed:', updErr.message)
      return new Response(JSON.stringify({ error: 'QR-koodin luonti epäonnistui.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        token: newToken,
        expires_at: expiresAt,
        booking_id: bk.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[mint-handover-token]', err?.message ?? err)
    return new Response(
      JSON.stringify({ error: 'Sisäinen virhe' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
