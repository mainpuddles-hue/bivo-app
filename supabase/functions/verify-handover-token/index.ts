// Bivo Edge Function: verify-handover-token
//
// Borrower skannasi lenderin QR-koodin → POST {booking_id, token} →
// vahvistaa että token vastaa rental_bookings.handover_token-arvoa ja
// että borrower on oikea käyttäjä. Onnistuessa pickup_state='in_use'.
//
// Constant-time vertailu estää timing-attackit. Token tyhjennetään
// käytön jälkeen jotta sitä ei voi käyttää uudelleen.

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

// Constant-time string compare (estää timing-attackit).
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
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
    const handoverToken: unknown = body?.token
    if (typeof bookingId !== 'string' || typeof handoverToken !== 'string') {
      return new Response(JSON.stringify({ error: 'Puutteelliset tiedot QR-koodin vahvistuksessa.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: bk, error: bkError } = await supabase
      .from('rental_bookings')
      .select('id, borrower_id, lender_id, status, pickup_state, handover_token, handover_token_expires_at, item_id')
      .eq('id', bookingId)
      .maybeSingle()
    if (bkError || !bk) {
      return new Response(JSON.stringify({ error: 'Vuokrausta ei löytynyt' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (bk.borrower_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Vain lainaaja voi skannata noudon QR-koodin.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (bk.status !== 'confirmed') {
      return new Response(JSON.stringify({
        error: 'Noutoa ei voi vahvistaa tässä vaiheessa.',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (bk.pickup_state !== 'awaiting_borrower_pickup') {
      return new Response(JSON.stringify({
        error: 'QR-koodin skannaus ei ole mahdollinen tässä vaiheessa.',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (!bk.handover_token || !bk.handover_token_expires_at) {
      return new Response(JSON.stringify({ error: 'Omistaja ei ole vielä näyttänyt QR-koodia.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (new Date(bk.handover_token_expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({
        error: 'QR-koodi on vanhentunut. Pyydä omistajaa näyttämään uusi.',
      }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (!safeCompare(bk.handover_token, handoverToken)) {
      return new Response(JSON.stringify({
        error: 'QR-koodi ei vastaa tätä vuokrausta. Tarkista, että näytätte oikeaa lainaa.',
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Onnistui — siirrä pickup_state:'in_use' ja tyhjennä token (yksi käyttökerta)
    const { error: updErr } = await (supabase.from('rental_bookings') as any)
      .update({
        pickup_state: 'in_use',
        handover_token: null,
        handover_token_expires_at: null,
      })
      .eq('id', bookingId)

    if (updErr) {
      console.error('[verify-handover-token] update failed:', updErr.message)
      return new Response(JSON.stringify({ error: 'Tilan päivitys epäonnistui' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        verified: true,
        booking_id: bk.id,
        item_id: bk.item_id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[verify-handover-token]', err?.message ?? err)
    return new Response(
      JSON.stringify({ error: 'Sisäinen virhe' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
