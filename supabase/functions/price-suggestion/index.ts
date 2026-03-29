// Supabase Edge Function: price-suggestion
// Returns price range suggestions for services and rentals based on
// completed transactions in the same neighborhood and category.
//
// Example: "Siivous Kalliossa: 25-40€" based on 5 completed bookings.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PriceSuggestion {
  min: number
  max: number
  median: number
  count: number   // number of transactions used
  category: string
  neighborhood: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const body = await req.json()
    const { type, tags, neighborhood } = body
    // type: 'tarjoan' (service) or 'lainaa' (rental)
    // tags: ['siivous', 'kodinhoito'] etc.
    // neighborhood: 'Kallio' etc.

    if (!type) {
      return new Response(JSON.stringify({ error: 'type required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let prices: number[] = []

    if (type === 'tarjoan') {
      // Look at completed service bookings
      let query = supabase
        .from('service_bookings')
        .select('service_price, post:posts!service_bookings_post_id_fkey(tags, user:profiles!posts_user_id_fkey(naapurusto))')
        .eq('status', 'completed')
        .not('service_price', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100)

      const { data: bookings } = await query

      if (bookings) {
        for (const b of bookings as any[]) {
          const bookingNh = b.post?.user?.naapurusto
          const bookingTags = b.post?.tags ?? []

          // Score relevance
          let relevant = false

          // Same neighborhood = relevant
          if (neighborhood && bookingNh === neighborhood) relevant = true

          // Overlapping tags = relevant
          if (tags?.length > 0 && bookingTags.some((t: string) => tags.includes(t))) relevant = true

          // No filters = use all
          if (!neighborhood && (!tags || tags.length === 0)) relevant = true

          if (relevant) prices.push(b.service_price)
        }
      }

      // Also check active posts with service_price (even without completed bookings)
      if (prices.length < 3) {
        let postQuery = supabase
          .from('posts')
          .select('service_price, tags, user:profiles!posts_user_id_fkey(naapurusto)')
          .eq('type', 'tarjoan')
          .eq('is_active', true)
          .not('service_price', 'is', null)
          .order('created_at', { ascending: false })
          .limit(50)

        const { data: posts } = await postQuery

        if (posts) {
          for (const p of posts as any[]) {
            const postNh = p.user?.naapurusto
            const postTags = p.tags ?? []

            let relevant = false
            if (neighborhood && postNh === neighborhood) relevant = true
            if (tags?.length > 0 && postTags.some((t: string) => tags.includes(t))) relevant = true
            if (!neighborhood && (!tags || tags.length === 0)) relevant = true

            if (relevant && p.service_price) prices.push(p.service_price)
          }
        }
      }
    } else if (type === 'lainaa') {
      // Look at rental bookings and active posts with daily_fee
      let query = supabase
        .from('posts')
        .select('daily_fee, tags, user:profiles!posts_user_id_fkey(naapurusto)')
        .eq('type', 'lainaa')
        .eq('is_active', true)
        .not('daily_fee', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)

      const { data: posts } = await query

      if (posts) {
        for (const p of posts as any[]) {
          const postNh = p.user?.naapurusto
          const postTags = p.tags ?? []

          let relevant = false
          if (neighborhood && postNh === neighborhood) relevant = true
          if (tags?.length > 0 && postTags.some((t: string) => tags.includes(t))) relevant = true
          if (!neighborhood && (!tags || tags.length === 0)) relevant = true

          if (relevant && p.daily_fee) prices.push(p.daily_fee)
        }
      }
    }

    if (prices.length < 2) {
      return new Response(
        JSON.stringify({ suggestion: null, reason: 'not_enough_data', count: prices.length }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Calculate statistics
    prices.sort((a, b) => a - b)
    const min = prices[0]
    const max = prices[prices.length - 1]
    const median = prices[Math.floor(prices.length / 2)]

    // Remove outliers (below 10th or above 90th percentile)
    const p10 = prices[Math.floor(prices.length * 0.1)]
    const p90 = prices[Math.floor(prices.length * 0.9)]

    const suggestion: PriceSuggestion = {
      min: Math.round(p10 * 100) / 100,
      max: Math.round(p90 * 100) / 100,
      median: Math.round(median * 100) / 100,
      count: prices.length,
      category: type,
      neighborhood: neighborhood ?? null,
    }

    return new Response(
      JSON.stringify({ suggestion }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[price-suggestion]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
