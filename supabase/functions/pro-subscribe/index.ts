// Supabase Edge Function: pro-subscribe
// Creates a Stripe Checkout session for Pro subscription.
// Monthly: 4.99€, Yearly: 39.99€
// On success: webhook updates profiles.is_pro = true, pro_expires_at

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.fi',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PRICES = {
  monthly: { amount: 499, interval: 'month' as const, name: 'TackBird Pro Monthly' },
  yearly: { amount: 3999, interval: 'year' as const, name: 'TackBird Pro Yearly' },
  business_monthly: { amount: 2999, interval: 'month' as const, name: 'TackBird Business Monthly' },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { plan } = body // 'monthly' | 'yearly' | 'business_monthly'
    // Validate plan — only allow known plans
    const validPlans = ['monthly', 'yearly', 'business_monthly'] as const
    if (!validPlans.includes(plan)) {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const price = PRICES[plan as keyof typeof PRICES]

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id, email, name, is_pro, is_business')
      .eq('id', user.id)
      .single()

    // Prevent duplicate subscriptions
    if (profile?.stripe_subscription_id) {
      try {
        const existingSub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
        if (existingSub.status === 'active' || existingSub.status === 'trialing') {
          return new Response(JSON.stringify({ error: 'Active subscription already exists' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      } catch {
        // Subscription not found in Stripe — proceed
      }
    }

    let customerId = profile?.stripe_customer_id
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email,
        name: profile?.name,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      await supabase.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', user.id)
    }

    // Create Checkout session for subscription
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: price.amount,
          recurring: { interval: price.interval },
          product_data: { name: price.name },
        },
        quantity: 1,
      }],
      metadata: { user_id: user.id, plan: plan ?? 'monthly' },
      subscription_data: {
        metadata: { user_id: user.id, plan: plan ?? 'monthly' },
      },
      success_url: 'tackbird://payment/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'tackbird://payment/cancel',
    })

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[pro-subscribe]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
