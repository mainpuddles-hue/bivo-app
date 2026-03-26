// Supabase Edge Function: stripe-checkout
// Creates Stripe Checkout sessions for rental and service bookings.
// Commission: 10% to Puddles Oy (platform), 90% to provider via Connect.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authenticate user via JWT
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

    const body = await req.json()
    const {
      amount,              // cents (e.g., 2990 = 29.90€) — used as fallback only
      description,
      type,                // 'rental' | 'service'
      post_id,
      seller_id,
      metadata = {},
      application_fee_amount, // ignored — recalculated server-side
      success_url,
      cancel_url,
    } = body

    if (!amount || !type || !seller_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate amount is a positive integer (cents)
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: 'Amount must be a positive number' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Stripe minimum charge is 50 cents (0.50 EUR)
    if (amount < 50) {
      return new Response(JSON.stringify({ error: 'Amount below minimum (50 cents)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate type is one of the allowed values
    if (!['rental', 'service', 'ad_campaign'].includes(type)) {
      return new Response(JSON.stringify({ error: 'Invalid transaction type' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // --- Server-side amount validation — NEVER trust client ---
    // For ad_campaign type, post_id is optional (campaigns may not be tied to a post)
    let postData: any = null
    if (type === 'ad_campaign' && !post_id) {
      // Ad campaigns without a post_id: use the client-provided amount (validated above)
      // but still validate the seller exists
      const { data: sellerExists } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', seller_id)
        .single()
      if (!sellerExists) {
        return new Response(JSON.stringify({ error: 'Seller not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      // For rental/service, post_id is required
      if (!post_id) {
        return new Response(JSON.stringify({ error: 'post_id required for rental/service' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error: postError } = await supabase
        .from('posts')
        .select('daily_fee, service_price, user_id, is_active')
        .eq('id', post_id)
        .single()

      if (postError || !data) {
        return new Response(JSON.stringify({ error: 'Post not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Check if post was deleted or deactivated between booking creation and checkout
      if (!data.is_active) {
        return new Response(JSON.stringify({ error: 'Post is no longer active' }), {
          status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      postData = data
    }

    if (postData) {
      // Validate seller matches post owner
      if (postData.user_id !== seller_id) {
        return new Response(JSON.stringify({ error: 'Seller mismatch' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Prevent self-purchase
    if (user.id === seller_id) {
      return new Response(JSON.stringify({ error: 'Cannot purchase from yourself' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Recalculate amount server-side
    let validatedAmount: number
    if (type === 'service') {
      if (!postData?.service_price) {
        return new Response(JSON.stringify({ error: 'No service price' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      validatedAmount = Math.round(postData.service_price * 100) // cents
    } else if (type === 'rental') {
      const bookingDays = metadata?.booking_days ? parseInt(metadata.booking_days) : 0
      if (!postData?.daily_fee || bookingDays <= 0 || bookingDays > 365) {
        return new Response(JSON.stringify({ error: 'Invalid rental params' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const rentalFee = postData.daily_fee * bookingDays
      const serviceFee = Math.round(rentalFee * 0.10 * 100) / 100
      validatedAmount = Math.round((rentalFee + serviceFee) * 100) // cents
    } else {
      // ad_campaign: use client amount (already validated as positive integer above)
      validatedAmount = Math.round(amount)
    }

    // Final validation: ensure validated amount is still positive and within sane bounds
    if (validatedAmount <= 0 || validatedAmount > 1000000) { // max 10,000 EUR
      return new Response(JSON.stringify({ error: 'Amount out of allowed range' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Enforce commission server-side (10%)
    const validatedFee = Math.round(validatedAmount * 0.10)

    // --- Idempotency: check if booking already has a session ---
    if (metadata?.booking_id) {
      const table = type === 'rental' ? 'rental_bookings' : 'service_bookings'
      const { data: existing } = await supabase
        .from(table)
        .select('stripe_session_id, status')
        .eq('id', metadata.booking_id)
        .single()
      if (existing?.stripe_session_id && existing.status !== 'cancelled') {
        // Return existing session — don't create duplicate
        try {
          const existingSession = await stripe.checkout.sessions.retrieve(existing.stripe_session_id)
          if (existingSession.status === 'open') {
            return new Response(
              JSON.stringify({ url: existingSession.url, session_id: existingSession.id }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            )
          }
        } catch {} // Session expired, create new one
      }
    }

    // Get or create Stripe customer for the buyer
    let customerId: string | undefined
    const { data: buyerProfile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email, name')
      .eq('id', user.id)
      .single()

    if (buyerProfile?.stripe_customer_id) {
      customerId = buyerProfile.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email: buyerProfile?.email ?? user.email,
        name: buyerProfile?.name ?? undefined,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      await supabase.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', user.id)
    }

    // Get provider's Connect account (for destination charges)
    const { data: sellerProfile } = await supabase
      .from('profiles')
      .select('stripe_connect_account_id')
      .eq('id', seller_id)
      .single()

    // Build Checkout Session params — uses validatedAmount instead of client amount
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      customer: customerId,
      currency: 'eur',
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: validatedAmount,
          product_data: { name: description || 'TackBird Transaction' },
        },
        quantity: 1,
      }],
      metadata: {
        ...metadata,
        buyer_id: user.id,
        seller_id,
        post_id: post_id ?? '',
        type,
      },
      success_url: success_url || 'tackbird://payment/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancel_url || 'tackbird://payment/cancel',
      // Apple Pay + Google Pay enabled automatically in Stripe Checkout
      payment_method_types: ['card'],
    }

    // If provider has Connect account, use destination charges with validated commission
    if (sellerProfile?.stripe_connect_account_id) {
      sessionParams.payment_intent_data = {
        application_fee_amount: validatedFee,
        transfer_data: {
          destination: sellerProfile.stripe_connect_account_id,
        },
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[stripe-checkout] Error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message ?? 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
