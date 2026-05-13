// Bivo Edge Function: create-setup-session
//
// Luo Stripe Checkout Session "setup"-moodissa, joka tallentaa kortin
// borrowerin Stripe Customeriin ilman veloitusta. Mobiili avaa palautetun
// URLin expo-web-browser:llä. Kortti on käytettävissä myöhemmin
// off_session-maksuihin (deposit hold, late fee jne.).

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

    let body: { return_url?: string } = {}
    try { body = await req.json() } catch { /* tyhjä body sallittu */ }

    const rawReturn = typeof body.return_url === 'string' ? body.return_url : ''
    const safeReturnUrl = rawReturn.startsWith('bivo://') ? rawReturn : 'bivo://payment/card-added'

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email, name')
      .eq('id', user.id)
      .single()

    let customerId: string | undefined = profile?.stripe_customer_id ?? undefined
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email,
        name: profile?.name ?? undefined,
        metadata: { supabase_user_id: user.id },
      }, { idempotencyKey: `bivo_customer_${user.id}` })
      customerId = customer.id
      await supabase.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', user.id)
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      currency: 'eur',
      payment_method_types: ['card'],
      success_url: safeReturnUrl,
      cancel_url: 'bivo://payment/cancel',
      metadata: { supabase_user_id: user.id, type: 'card_setup' },
    }, { idempotencyKey: `bivo_setup_${user.id}_${Date.now()}` })

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[create-setup-session]', err.message)
    return new Response(
      JSON.stringify({ error: 'Sisäinen virhe' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
