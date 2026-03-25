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
      amount,              // cents (e.g., 2990 = 29.90€)
      description,
      type,                // 'rental' | 'service'
      post_id,
      seller_id,
      metadata = {},
      application_fee_amount, // 10% commission in cents
      success_url,
      cancel_url,
    } = body

    if (!amount || !type || !seller_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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

    // Build Checkout Session params
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      customer: customerId,
      currency: 'eur',
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: amount,
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

    // If provider has Connect account, use destination charges with commission
    if (sellerProfile?.stripe_connect_account_id) {
      sessionParams.payment_intent_data = {
        application_fee_amount: application_fee_amount ?? Math.round(amount * 0.10),
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
