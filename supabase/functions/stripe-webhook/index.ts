// Supabase Edge Function: stripe-webhook
// Handles Stripe webhook events to update booking statuses and create payment records.
// Verifies webhook signature for security.
// NOTE: No CORS headers — this endpoint is server-to-server (Stripe calling us).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

serve(async (req) => {
  // Webhook endpoint is server-to-server only — reject OPTIONS (no browser should call this)
  if (req.method === 'OPTIONS') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const stripe = new Stripe(getEnvOrThrow('STRIPE_SECRET_KEY'), { apiVersion: '2024-04-10' })
    const webhookSecret = getEnvOrThrow('STRIPE_WEBHOOK_SECRET')

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

        // Extract payment_intent ID for refund lookups later
        const sessionPaymentIntent = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : (session.payment_intent as any)?.id ?? null

        // Update booking status to 'paid'. Stripe expects webhooks to
        // return 2xx even if the downstream DB write fails — otherwise
        // Stripe would retry forever. We surface DB errors to the logs
        // so operators can reconcile manually if RLS/schema issues ever
        // prevent the update.
        if (bookingId) {
          const { error: updateErr } = await supabase
            .from(bookingTable)
            .update({
              status: 'paid',
              stripe_session_id: session.id,
              stripe_payment_intent_id: sessionPaymentIntent,
            })
            .eq('id', bookingId)
          if (updateErr) {
            console.error(`[webhook] CRITICAL: failed to mark ${bookingTable} ${bookingId} as paid:`, updateErr.message)
          }
        } else if (session.id) {
          // Fallback: find by session ID
          const { error: updateErr } = await supabase
            .from(bookingTable)
            .update({
              status: 'paid',
              stripe_payment_intent_id: sessionPaymentIntent,
            })
            .eq('stripe_session_id', session.id)
          if (updateErr) {
            console.error(`[webhook] CRITICAL: failed to mark ${bookingTable} by session ${session.id} as paid:`, updateErr.message)
          }
        }

        // Idempotency: don't insert duplicate payment records
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id')
          .eq('stripe_session_id', session.id)
          .maybeSingle()
        if (!existingPayment) {
          await supabase.from('payments').insert({
            user_id: buyer_id,
            amount: session.amount_total ?? 0,
            description: session.metadata?.description ?? `TackBird ${type}`,
            status: 'paid',
            type,
            post_id: post_id || null,
            booking_id: bookingId || null,
            stripe_session_id: session.id,
            stripe_payment_intent_id: sessionPaymentIntent,
          })
        }

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
          // paymentIntentId is a pi_xxx, not a cs_xxx (session ID).
          // First, try to look up the Checkout Session that created this PaymentIntent
          // so we can match on stripe_session_id (cs_xxx) stored in our tables.
          let sessionId: string | null = null
          try {
            const sessions = await stripe.checkout.sessions.list({
              payment_intent: paymentIntentId,
              limit: 1,
            })
            sessionId = sessions.data?.[0]?.id ?? null
          } catch (e: any) {
            console.warn(`[webhook] Could not look up session for ${paymentIntentId}: ${e.message}`)
          }

          if (sessionId) {
            // Primary path: match on the session ID stored in our records
            await supabase
              .from('payments')
              .update({ status: 'refunded' })
              .eq('stripe_session_id', sessionId)

            for (const table of ['rental_bookings', 'service_bookings']) {
              await supabase
                .from(table)
                .update({ status: 'refunded' })
                .eq('stripe_session_id', sessionId)
            }
          } else {
            // Fallback: try matching on payment_intent_id column if it exists,
            // or log a warning so it can be handled manually.
            const { data: paymentByPI, error: piError } = await supabase
              .from('payments')
              .update({ status: 'refunded' })
              .eq('stripe_payment_intent_id', paymentIntentId)
              .select('id')

            if (piError) {
              console.error(`[webhook] Refund update failed for pi=${paymentIntentId}:`, piError.message)
            } else if (!paymentByPI?.length) {
              console.error(`[webhook] CRITICAL: No payment record found for refund pi=${paymentIntentId} — refund processed in Stripe but not recorded in DB`)
            }

            for (const table of ['rental_bookings', 'service_bookings']) {
              await supabase
                .from(table)
                .update({ status: 'refunded' })
                .eq('stripe_payment_intent_id', paymentIntentId)
            }
          }
        }

        console.log(`[webhook] Refund processed: ${charge.id}`)
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.user_id
        if (userId) {
          const isActive = subscription.status === 'active' || subscription.status === 'trialing'
          const expiresAt = new Date(subscription.current_period_end * 1000).toISOString()

          // Determine subscription type from plan metadata or amount
          const plan = subscription.metadata?.plan ?? ''
          const isBusiness = plan === 'business_monthly' ||
            (subscription.items?.data?.[0]?.price?.unit_amount ?? 0) >= 2999

          if (isBusiness) {
            // Business subscription
            await supabase.from('profiles').update({
              is_business: isActive,
              is_pro: isActive,
              pro_expires_at: expiresAt,
              stripe_subscription_id: subscription.id,
            }).eq('id', userId)
          } else {
            // Pro subscription (monthly or yearly)
            await supabase.from('profiles').update({
              is_pro: isActive,
              pro_expires_at: expiresAt,
              stripe_subscription_id: subscription.id,
            }).eq('id', userId)
          }

          console.log(`[webhook] Subscription ${subscription.status} (${isBusiness ? 'business' : 'pro'}) for user ${userId}`)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.user_id
        if (userId) {
          // Determine subscription type from plan metadata or amount
          const plan = subscription.metadata?.plan ?? ''
          const isBusiness = plan === 'business_monthly' ||
            (subscription.items?.data?.[0]?.price?.unit_amount ?? 0) >= 2999

          if (isBusiness) {
            await supabase.from('profiles').update({
              is_business: false,
              is_pro: false,
              pro_expires_at: null,
              stripe_subscription_id: null,
            }).eq('id', userId)
          } else {
            await supabase.from('profiles').update({
              is_pro: false,
              pro_expires_at: null,
            }).eq('id', userId)
          }

          // Clear is_pro_listing on all user's posts
          await supabase.from('posts').update({ is_pro_listing: false }).eq('user_id', userId).eq('is_pro_listing', true)

          console.log(`[webhook] Subscription cancelled (${isBusiness ? 'business' : 'pro'}) for user ${userId}`)
        }
        break
      }

      default:
        console.log(`[webhook] Unhandled event: ${event.type}`)
    }

    // Log successful webhook processing
    await supabase.from('webhook_events').insert({
      event_type: event.type,
      payload: { id: event.id, type: event.type },
      status: 'completed',
      attempts: 1,
    }).catch((err: any) => {
      console.error(`[webhook] CRITICAL: Failed to log webhook event ${event.id} (${event.type}):`, err?.message ?? err)
    })

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[webhook]', err.message)

    // Log failed webhook for retry
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      if (supabaseUrl && supabaseKey) {
        const sb = createClient(supabaseUrl, supabaseKey)
        await sb.from('webhook_events').insert({
          event_type: 'unknown',
          payload: { error: err.message },
          status: 'failed',
          last_error: err.message,
        }).catch(() => {})
      }
    } catch {} // Best effort

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
