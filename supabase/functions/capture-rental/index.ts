// Supabase Edge Function: capture-rental
//
// Slice 1.5: lender confirms a paid rental booking → we capture the
// previously authorized rental PaymentIntent. The funds (minus platform
// commission) move to the lender's Stripe Connect account on capture.
//
// Authorization model: only the lender of the booking can call this
// (the borrower already paid; the lender is the one who decides whether
// to release it). Caller is verified server-side via the JWT and
// rental_bookings.lender_id.
//
// Idempotency: if the PI is already captured (succeeded), we still
// advance booking.status to 'confirmed' and return success. If the PI
// doesn't exist or is in an un-capturable state, return 409.

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
    if (typeof bookingId !== 'string') {
      return new Response(JSON.stringify({ error: 'booking_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: bk, error: bkError } = await supabase
      .from('rental_bookings')
      .select('id, lender_id, status, stripe_payment_intent_id, pickup_method')
      .eq('id', bookingId)
      .maybeSingle()
    if (bkError || !bk) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (bk.lender_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!bk.stripe_payment_intent_id) {
      return new Response(JSON.stringify({ error: 'No PaymentIntent attached to booking' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!['paid', 'pending'].includes(bk.status)) {
      return new Response(JSON.stringify({ error: `Cannot capture in status '${bk.status}'` }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Capture the PaymentIntent. If it's already in 'succeeded' (someone
    // captured it earlier — duplicate webhook, manual ops, race), fall
    // through to the booking-status update so the system converges.
    let pi: Stripe.PaymentIntent | null = null
    try {
      pi = await stripe.paymentIntents.capture(bk.stripe_payment_intent_id)
    } catch (err: any) {
      if (err?.code === 'payment_intent_unexpected_state' && err?.payment_intent?.status === 'succeeded') {
        pi = err.payment_intent
      } else {
        console.error('[capture-rental] capture failed:', err?.message)
        return new Response(JSON.stringify({ error: err?.message ?? 'Capture failed' }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Advance booking status. Webhook will also see payment_intent.succeeded
    // and try to do this — both writes converge to the same row, so the
    // race is benign.
    const { error: updErr } = await (supabase.from('rental_bookings') as any)
      .update({
        status: 'confirmed',
        // Slice 2/3: when the lender confirms a hub or gardi booking,
        // bump pickup_state into 'awaiting_lender_dropoff' so the next
        // micro-state button shows up. Address bookings keep
        // pickup_state='pending_method' (the legacy default).
        ...(bk.pickup_method === 'hub' || bk.pickup_method === 'gardi'
          ? { pickup_state: 'awaiting_lender_dropoff' }
          : {}),
      })
      .eq('id', bookingId)
    if (updErr) {
      console.error('[capture-rental] booking update failed:', updErr.message)
      // PI is captured but booking row didn't update. Operator needs to
      // reconcile. Surface 502 so client retries (idempotent above).
      return new Response(JSON.stringify({ error: 'Booking update failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        captured: true,
        payment_intent_id: pi?.id ?? bk.stripe_payment_intent_id,
        amount_captured: pi?.amount_received ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[capture-rental]', err?.message ?? err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
