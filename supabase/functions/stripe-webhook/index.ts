// Supabase Edge Function: stripe-webhook
// Handles Stripe webhook events to update booking statuses and create payment records.
// Verifies webhook signature for security.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  try {
    // Verify Stripe webhook signature
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      return new Response('Missing signature', { status: 400 })
    }

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err: any) {
      console.error('[webhook] Signature verification failed:', err.message)
      return new Response(`Webhook Error: ${err.message}`, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Handle events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const { buyer_id, seller_id, post_id, type } = session.metadata ?? {}
        const bookingId = session.metadata?.booking_id

        if (!buyer_id || !type) break

        // Determine which booking table to update
        const bookingTable = type === 'rental' ? 'rental_bookings' : 'service_bookings'

        // Update booking status to 'paid'
        if (bookingId) {
          await supabase
            .from(bookingTable)
            .update({ status: 'paid', stripe_session_id: session.id })
            .eq('id', bookingId)
        } else if (session.id) {
          // Fallback: find by session ID
          await supabase
            .from(bookingTable)
            .update({ status: 'paid' })
            .eq('stripe_session_id', session.id)
        }

        // Create payment record
        await supabase.from('payments').insert({
          user_id: buyer_id,
          amount: session.amount_total ?? 0,
          description: session.metadata?.description ?? `TackBird ${type}`,
          status: 'paid',
          type,
          post_id: post_id || null,
          booking_id: bookingId || null,
          stripe_session_id: session.id,
        })

        // Send notification to seller
        if (seller_id) {
          await supabase.from('notifications').insert({
            user_id: seller_id,
            from_user_id: buyer_id,
            type: type === 'rental' ? 'booking_paid' : 'service_paid',
            title: type === 'rental' ? 'Varaus maksettu!' : 'Palvelu maksettu!',
            body: `Summa: ${((session.amount_total ?? 0) / 100).toFixed(2)}€`,
            link_type: bookingTable,
            link_id: bookingId || null,
          })
        }

        console.log(`[webhook] ${type} payment completed: ${session.id}`)
        break
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        const bookingId = session.metadata?.booking_id
        const type = session.metadata?.type

        if (bookingId && type) {
          const table = type === 'rental' ? 'rental_bookings' : 'service_bookings'
          await supabase.from(table).update({ status: 'cancelled' }).eq('id', bookingId)
        }

        console.log(`[webhook] Session expired: ${session.id}`)
        break
      }

      case 'account.updated': {
        // Stripe Connect account status update
        const account = event.data.object as Stripe.Account
        if (account.charges_enabled && account.payouts_enabled) {
          // Provider is fully onboarded
          await supabase
            .from('profiles')
            .update({ stripe_connect_onboarded: true })
            .eq('stripe_connect_account_id', account.id)

          console.log(`[webhook] Connect account onboarded: ${account.id}`)
        }
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const paymentIntentId = typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id

        if (paymentIntentId) {
          // Update payment record
          await supabase
            .from('payments')
            .update({ status: 'refunded' })
            .eq('stripe_session_id', paymentIntentId)

          // Find and update booking
          for (const table of ['rental_bookings', 'service_bookings']) {
            await supabase
              .from(table)
              .update({ status: 'refunded' })
              .eq('stripe_session_id', paymentIntentId)
          }
        }

        console.log(`[webhook] Refund processed: ${charge.id}`)
        break
      }

      default:
        console.log(`[webhook] Unhandled event: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[webhook] Error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
