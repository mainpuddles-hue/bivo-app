// Bivo Edge Function: cancel-rental-payment
//
// Peruuttaa auth-holdatun PaymentIntentin kun booking hylätään tai peruutetaan.
// Kutsutaan lib/rentals.ts:stä rejectRental() ja cancelRental() -funktioista
// ENNEN DB-statuksen päivitystä, jotta borrowerin kortti vapautuu heti
// eikä jää holdiin 7 päiväksi.
//
// Myös capture-rental käyttää tätä auto-reject-flowssa kilpailevien
// bookingien PI:den peruutukseen.
//
// Kutsuja: booking:n borrower TAI lender (molemmat saavat peruuttaa
// pending-tilan pyynnön). Palvelinpuolella lenderin rooli on "reject",
// borrowerin "cancel" — molemmat vapauttavat holdin.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const stripe = new Stripe(getEnvOrThrow('STRIPE_SECRET_KEY'), { apiVersion: '2024-04-10' })

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
    const newStatus: unknown = body?.new_status
    if (typeof bookingId !== 'string') {
      return new Response(JSON.stringify({ error: 'booking_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (newStatus !== 'rejected' && newStatus !== 'cancelled') {
      return new Response(JSON.stringify({ error: 'new_status must be rejected or cancelled' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: booking, error: bkError } = await supabase
      .from('rental_bookings')
      .select('id, borrower_id, lender_id, status, stripe_payment_intent_id, deposit_status')
      .eq('id', bookingId)
      .maybeSingle()
    if (bkError || !booking) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Vain borrower tai lender saa peruuttaa
    if (booking.borrower_id !== user.id && booking.lender_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Pakota oikea status roolin mukaan: borrower peruuttaa, lender hylkää
    const correctStatus = user.id === booking.lender_id ? 'rejected' : 'cancelled'
    if (newStatus !== correctStatus) {
      return new Response(JSON.stringify({ error: `Expected new_status='${correctStatus}' for your role` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (booking.status !== 'pending') {
      return new Response(JSON.stringify({ error: `Booking is '${booking.status}', not 'pending'` }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Peruuta Stripe PI jos authorized
    let piCancelled = false
    if (booking.stripe_payment_intent_id && booking.deposit_status === 'authorized') {
      try {
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id)
        piCancelled = true
      } catch (err: any) {
        // PI voi olla jo canceled/expired — se on ok
        if (err?.code === 'payment_intent_unexpected_state') {
          piCancelled = true
        } else {
          console.error('[cancel-rental-payment] PI cancel failed:', err?.message)
          return new Response(JSON.stringify({ error: 'Maksun peruutus epäonnistui. Yritä uudelleen.' }), {
            status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    // Päivitä booking status + deposit_status
    const updateData: Record<string, unknown> = {
      status: newStatus,
      cancelled_at: new Date().toISOString(),
    }
    if (piCancelled && booking.deposit_status === 'authorized') {
      updateData.deposit_status = 'released'
    }

    const { error: updErr } = await (supabase.from('rental_bookings') as any)
      .update(updateData)
      .eq('id', bookingId)
    if (updErr) {
      console.error('[cancel-rental-payment] booking update failed:', updErr.message)
      return new Response(JSON.stringify({ error: 'Booking update failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        cancelled: true,
        pi_cancelled: piCancelled,
        new_status: newStatus,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[cancel-rental-payment]', err?.message ?? err)
    return new Response(
      JSON.stringify({ error: 'Sisäinen virhe' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
