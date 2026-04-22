// Supabase Edge Function: stripe-connect-onboard
// Creates Stripe Connect Express account for service providers/lenders.
// Allows them to receive payouts from marketplace transactions.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const stripe = new Stripe(getEnvOrThrow('STRIPE_SECRET_KEY'), { apiVersion: '2024-04-10' })

    // Authenticate
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

    let body
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { return_url } = body

    // Check if user already has a Connect account
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_connect_account_id, stripe_connect_onboarded, email, name')
      .eq('id', user.id)
      .single()

    let accountId = profile?.stripe_connect_account_id

    if (!accountId) {
      // Create new Connect Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'FI',
        email: profile?.email ?? user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: { supabase_user_id: user.id },
      })
      accountId = account.id

      // Save account ID to profile. If this fails, return error to prevent
      // the user from proceeding with an unlinked account. The Stripe account
      // is already created but can be reclaimed via metadata on next attempt.
      const { error: linkError } = await supabase
        .from('profiles')
        .update({ stripe_connect_account_id: accountId })
        .eq('id', user.id)
      if (linkError) {
        console.error(
          `[stripe-connect-onboard] CRITICAL: failed to link Connect account ${accountId} to user ${user.id}:`,
          linkError.message,
        )
        return new Response(
          JSON.stringify({ error: 'Failed to link payment account. Please try again.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // Create Account Link for onboarding UI
    // Validate return_url to prevent open redirect — only allow tackbird:// scheme
    const safeReturnUrl = (typeof return_url === 'string' && return_url.startsWith('tackbird://'))
      ? return_url
      : 'tackbird://payment-settings'
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: safeReturnUrl,
      return_url: safeReturnUrl,
      type: 'account_onboarding',
    })

    return new Response(
      JSON.stringify({ url: accountLink.url, account_id: accountId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[stripe-connect-onboard]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
