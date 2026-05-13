// Bivo Edge Function: extend-rental
//
// Luo Stripe Checkout -session vuokra-ajan pidennykselle.
// Pidennys on normaali maksu (ei auth hold) koska vuokra on jo aktiivinen.
// Webhook päivittää end_date + days onnistuneen maksun jälkeen.
//
// Max kokonaiskesto 6 vrk (Stripe auth hold cap).

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

const COMMISSION_RATE = 0.10
const MAX_RENTAL_DAYS = 6
const STRIPE_MIN_CHARGE_CENTS = 50

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

    const rentalId: unknown = body?.rentalId
    const extraDays: unknown = body?.extraDays
    if (typeof rentalId !== 'string' || typeof extraDays !== 'number' || extraDays < 1 || extraDays > 3) {
      return new Response(JSON.stringify({ error: 'Puutteelliset tiedot pidennyspyynnössä.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: booking, error: bkError } = await supabase
      .from('rental_bookings')
      .select(`
        id, item_id, borrower_id, lender_id, status, days, daily_fee, total_fee,
        end_date, start_date
      `)
      .eq('id', rentalId)
      .maybeSingle()
    if (bkError || !booking) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (booking.borrower_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (booking.status !== 'confirmed' && booking.status !== 'paid') {
      return new Response(JSON.stringify({ error: 'Lainaa ei voi pidentää, koska se ei ole aktiivinen.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const totalDays = booking.days + extraDays
    if (totalDays > MAX_RENTAL_DAYS) {
      return new Response(JSON.stringify({
        error: `Vuokra-aika voi olla enintään ${MAX_RENTAL_DAYS} vuorokautta. Voit pidentää vielä ${MAX_RENTAL_DAYS - booking.days} päivällä.`,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const extensionFee = Number(booking.daily_fee) * extraDays
    const amountCents = Math.round(extensionFee * 100)
    if (amountCents < STRIPE_MIN_CHARGE_CENTS) {
      return new Response(JSON.stringify({ error: 'Summa alle Stripen minimin (0,50 €)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const commissionCents = Math.round(amountCents * COMMISSION_RATE)

    const { data: buyerProfile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email, name')
      .eq('id', user.id)
      .single()

    let customerId: string | undefined = buyerProfile?.stripe_customer_id ?? undefined
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: buyerProfile?.email ?? user.email,
        name: buyerProfile?.name ?? undefined,
        metadata: { supabase_user_id: user.id },
      }, { idempotencyKey: `bivo_customer_${user.id}` })
      customerId = customer.id
      await supabase.from('profiles').update({ stripe_customer_id: customer.id }).eq('id', user.id)
    }

    const { data: lenderProfile } = await supabase
      .from('profiles')
      .select('stripe_connect_account_id, stripe_connect_onboarded')
      .eq('id', booking.lender_id)
      .single()

    if (!lenderProfile?.stripe_connect_account_id || !lenderProfile?.stripe_connect_onboarded) {
      return new Response(JSON.stringify({
        error: 'Omistajan maksutiedot puuttuvat',
        error_code: 'lender_not_onboarded',
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const [y, m, d] = booking.end_date.split('-').map(Number)
    const newEndDate = new Date(y, m - 1, d)
    newEndDate.setDate(newEndDate.getDate() + extraDays)
    const newEndStr = `${newEndDate.getFullYear()}-${String(newEndDate.getMonth() + 1).padStart(2, '0')}-${String(newEndDate.getDate()).padStart(2, '0')}`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      currency: 'eur',
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: amountCents,
          product_data: { name: `Bivo-pidennys · ${extraDays} vrk lisää` },
        },
        quantity: 1,
      }],
      metadata: {
        booking_id: booking.id,
        type: 'extension',
        extra_days: String(extraDays),
        new_end_date: newEndStr,
        new_total_days: String(totalDays),
      },
      success_url: 'bivo://payment/extend-success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'bivo://payment/cancel',
      payment_method_types: ['card'],
      payment_intent_data: {
        application_fee_amount: commissionCents,
        transfer_data: {
          destination: lenderProfile.stripe_connect_account_id,
        },
      },
    }, {
      idempotencyKey: `bivo_extend_${booking.id}_${extraDays}`,
    })

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[extend-rental]', err.message)
    return new Response(
      JSON.stringify({ error: 'Sisäinen virhe' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
