// Supabase Edge Function: use-boost
// Atomically deducts one boost credit and activates a boost on a post.
// Boost duration depends on user tier: free=24h, pro=72h, business=168h

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.fi',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Boost duration in hours by tier
const BOOST_DURATION_HOURS: Record<string, number> = {
  free: 24,
  pro: 72,
  business: 168,
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = getEnvOrThrow('SUPABASE_URL')
    const supabaseServiceKey = getEnvOrThrow('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Auth: verify JWT token
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

    // 2. Parse body
    let body
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { post_id } = body

    if (!post_id) {
      return new Response(JSON.stringify({ error: 'Missing post_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Verify user owns the post
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, user_id, is_active')
      .eq('id', post_id)
      .single()

    if (postError || !post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (post.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not your post' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Verify post is active
    if (!post.is_active) {
      return new Response(JSON.stringify({ error: 'Post is not active' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. Check no active boost exists for this post
    const now = new Date().toISOString()
    const { data: activeBoost } = await supabase
      .from('post_boosts')
      .select('id, boost_end')
      .eq('post_id', post_id)
      .gt('boost_end', now)
      .limit(1)
      .single()

    if (activeBoost) {
      return new Response(JSON.stringify({
        error: 'Post already has an active boost',
        boost_end: activeBoost.boost_end,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 6. Get user's tier from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro, is_business')
      .eq('id', user.id)
      .single()

    let tier = 'free'
    if (profile?.is_business) {
      tier = 'business'
    } else if (profile?.is_pro) {
      tier = 'pro'
    }

    // 7. Calculate boost duration
    const durationHours = BOOST_DURATION_HOURS[tier]
    const boostStart = new Date()
    const boostEnd = new Date(boostStart.getTime() + durationHours * 60 * 60 * 1000)

    // 8. Atomic balance decrement
    // Try RPC first (true atomic SQL decrement with WHERE balance > 0),
    // fall back to optimistic concurrency with the same guard.
    let remainingBalance: number

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'decrement_boost_balance',
      { p_user_id: user.id }
    )

    if (!rpcError && rpcResult !== null) {
      // RPC succeeded — returns new balance, or -1 if balance was already 0
      remainingBalance = typeof rpcResult === 'number' ? rpcResult : -1

      if (remainingBalance < 0) {
        // Balance was already 0 — no rollback needed because the RPC should
        // use `WHERE balance > 0`. If an older RPC version went to -1, fix it.
        await supabase
          .from('user_boosts')
          .update({ balance: 0, updated_at: new Date().toISOString() })
          .eq('user_id', user.id)
          .lt('balance', 0)

        return new Response(JSON.stringify({ error: 'No boost credits available' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      // Fallback: optimistic concurrency control via conditional update.
      // The WHERE clause includes `balance > 0` to prevent going negative.
      const { data: currentBoost } = await supabase
        .from('user_boosts')
        .select('balance')
        .eq('user_id', user.id)
        .single()

      if (!currentBoost || currentBoost.balance <= 0) {
        return new Response(JSON.stringify({ error: 'No boost credits available' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Only update if balance hasn't changed AND is still positive (optimistic lock)
      const { data: updated, error: updateError } = await supabase
        .from('user_boosts')
        .update({
          balance: currentBoost.balance - 1,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('balance', currentBoost.balance)
        .gt('balance', 0)
        .select('balance')
        .single()

      if (updateError || !updated) {
        return new Response(JSON.stringify({ error: 'Concurrent modification — please retry' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      remainingBalance = updated.balance
    }

    // 10. Insert post_boosts record
    const { error: insertError } = await supabase
      .from('post_boosts')
      .insert({
        post_id,
        user_id: user.id,
        tier,
        boost_start: boostStart.toISOString(),
        boost_end: boostEnd.toISOString(),
        duration_hours: durationHours,
        created_at: boostStart.toISOString(),
      })

    if (insertError) {
      // Rollback the balance decrement
      await supabase
        .from('user_boosts')
        .update({
          balance: remainingBalance + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)

      console.error('[use-boost] Failed to insert post_boosts:', insertError.message)
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 11. Return success
    return new Response(JSON.stringify({
      success: true,
      boost_end: boostEnd.toISOString(),
      remaining_balance: remainingBalance,
      tier,
      duration_hours: durationHours,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[use-boost]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
