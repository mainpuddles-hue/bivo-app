// Supabase Edge Function: locker-assign
//
// Issues a PIN for one direction (pickup or dropoff) of a Gardi-pickup
// rental booking. Hashes the PIN at rest (locker_assignments.pin_hash),
// returns the plaintext exactly once to the calling participant, and
// mirrors the plaintext + expiry onto rental_bookings so the booking-detail
// LockerPinCard can render it on subsequent loads (the rental_bookings
// row is RLS-scoped to the booking participants — borrower + lender —
// so plaintext exposure is bounded to the same two people who already
// see the booking).
//
// Idempotency: voids any existing un-used / un-expired assignment for
// the same (booking_id, direction) before issuing the new one. So a
// re-call within the active window replaces the prior PIN cleanly.
//
// For provider='gardi' the function will route through the real Gardi
// REST API in slice 4. Slice 3.5 only handles 'mock', and the audit row
// + hashed storage matches what the real flow will use unchanged.

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

// PIN validity window — 48h gives borrowers a realistic pickup buffer
// and lenders a realistic dropoff window without forcing same-day rush.
const PIN_TTL_MS = 48 * 60 * 60 * 1000

function generatePin(): string {
  // Cryptographic random 4-digit PIN. Math.random is NOT acceptable for
  // this — it's seedable / predictable in some V8 builds. Two bytes give
  // ~16 bits of entropy; we modulo to 10000 so the distribution is
  // slightly uneven for the highest digits, but the entropy is still
  // 13.3 bits which is fine against online brute force (Gardi rate
  // limits) but trivially brute-forceable offline if the hash leaked
  // — that's why expires_at is short.
  const arr = new Uint8Array(2)
  crypto.getRandomValues(arr)
  const num = (((arr[0] << 8) | arr[1]) % 10000)
  return num.toString().padStart(4, '0')
}

function generateSalt(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hashPin(pin: string, salt: string): Promise<string> {
  // PBKDF2 with SHA-256, 10k iterations. PINs are short — full bcrypt is
  // overkill in Deno and adds a WASM dep. PBKDF2 is in SubtleCrypto
  // natively and resists offline cracking enough for the 48h plaintext
  // window. Format: ${salt}:${derivedKeyHex}.
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 10_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  )
  const hex = Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `${salt}:${hex}`
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
    const direction: unknown = body?.direction
    if (typeof bookingId !== 'string' || (direction !== 'pickup' && direction !== 'dropoff')) {
      return new Response(JSON.stringify({ error: 'booking_id (uuid) and direction (pickup|dropoff) required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate booking + caller is a participant + Gardi flow
    const { data: bk, error: bkError } = await supabase
      .from('rental_bookings')
      .select('id, borrower_id, lender_id, pickup_method, locker_id, locker_provider')
      .eq('id', bookingId)
      .maybeSingle()
    if (bkError || !bk) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const isParticipant = bk.borrower_id === user.id || bk.lender_id === user.id
    if (!isParticipant) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (bk.pickup_method !== 'gardi') {
      return new Response(JSON.stringify({ error: 'Booking is not a Gardi pickup' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!bk.locker_id) {
      return new Response(JSON.stringify({ error: 'No locker assigned to booking' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // For 'mock' provider we generate the PIN ourselves. For 'gardi' the
    // implementation in slice 4 will call the real API and read the PIN
    // back. The shape of locker_assignments + rental_bookings columns is
    // identical between the two providers — only the source of PIN bytes
    // changes.
    if (bk.locker_provider !== 'mock') {
      return new Response(JSON.stringify({ error: 'Real Gardi provider not yet implemented' }), {
        status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + PIN_TTL_MS)

    // Void any prior un-used / un-expired assignments for the same
    // (booking, direction). Idempotent — re-calling within the window
    // produces a fresh PIN and invalidates the previous one.
    await (supabase.from('locker_assignments') as any)
      .update({ voided_at: now.toISOString() })
      .eq('booking_id', bookingId)
      .eq('direction', direction)
      .is('used_at', null)
      .is('voided_at', null)

    const pin = generatePin()
    const salt = generateSalt()
    const pinHash = await hashPin(pin, salt)
    const pinLast4 = pin // for 4-digit PINs, last4 is the whole PIN

    const { error: insertError } = await (supabase.from('locker_assignments') as any).insert({
      booking_id: bookingId,
      locker_id: bk.locker_id,
      direction,
      pin_hash: pinHash,
      pin_last4: pinLast4,
      issued_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    if (insertError) {
      console.error('[locker-assign] audit insert failed:', insertError.message)
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Mirror plaintext + expiry onto rental_bookings so the LockerPinCard
    // on the booking-detail screen can render the PIN without re-calling
    // this function. The columns are RLS-scoped to participants, so
    // plaintext exposure is the same two people that are already on the
    // booking. Cleared on used_at via a future locker-mark-used function
    // (slice 4).
    const update: Record<string, any> = {}
    if (direction === 'pickup') {
      update.locker_pickup_pin = pin
      update.locker_pickup_pin_expires_at = expiresAt.toISOString()
    } else {
      update.locker_dropoff_pin = pin
      update.locker_dropoff_pin_expires_at = expiresAt.toISOString()
    }
    const { error: updError } = await (supabase.from('rental_bookings') as any)
      .update(update)
      .eq('id', bookingId)
    if (updError) {
      console.error('[locker-assign] booking update failed:', updError.message)
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        pin,
        expires_at: expiresAt.toISOString(),
        locker_id: bk.locker_id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[locker-assign]', err?.message ?? err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
