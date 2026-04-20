// Supabase Edge Function: verify-boost-purchase
// Validates IAP receipts (Apple/Google/sandbox) and credits boost balance.
// Products: com.tackbird.boost_1 (1), boost_3 (3), boost_5 (5)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function getEnvOrThrow(key: string): string {
  const val = Deno.env.get(key)
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PRODUCT_CREDITS: Record<string, number> = {
  'com.tackbird.boost_1': 1,
  'com.tackbird.boost_3': 3,
  'com.tackbird.boost_5': 5,
}

const VALID_PLATFORMS = ['ios', 'android', 'sandbox'] as const

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
    const { platform, product_id, receipt_data, transaction_id } = body

    // 2b. Validate receipt_data size (prevent storage DoS)
    const MAX_RECEIPT_SIZE = 65536
    if (receipt_data && (typeof receipt_data !== 'string' || receipt_data.length > MAX_RECEIPT_SIZE)) {
      return new Response(JSON.stringify({ error: 'receipt_data invalid or too large' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Validate platform
    if (!VALID_PLATFORMS.includes(platform)) {
      return new Response(JSON.stringify({ error: 'Invalid platform' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Validate product_id and map to credits
    const credits = PRODUCT_CREDITS[product_id]
    if (!credits) {
      return new Response(JSON.stringify({ error: 'Invalid product_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!transaction_id) {
      return new Response(JSON.stringify({ error: 'Missing transaction_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. Idempotency check: if transaction_id already processed, return existing result
    const { data: existingPurchase } = await supabase
      .from('boost_purchases')
      .select('id, credits_granted, created_at')
      .eq('transaction_id', transaction_id)
      .single()

    if (existingPurchase) {
      // Already processed — fetch current balance and return
      const { data: boostRow } = await supabase
        .from('user_boosts')
        .select('balance')
        .eq('user_id', user.id)
        .single()

      return new Response(JSON.stringify({
        success: true,
        new_balance: boostRow?.balance ?? 0,
        credits_granted: existingPurchase.credits_granted,
        already_processed: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 6-8. Receipt validation per platform
    let receipt_valid = false
    let validation_details: Record<string, unknown> = {}

    if (platform === 'sandbox') {
      // Only allow sandbox when explicitly enabled via env var — blocks production abuse
      const sandboxAllowed = Deno.env.get('SANDBOX_ALLOWED') === 'true'
      if (!sandboxAllowed) {
        return new Response(JSON.stringify({ error: 'Sandbox not available' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      receipt_valid = true
      validation_details = { mode: 'sandbox', skipped: true }
    } else if (platform === 'ios') {
      // Apple receipt validation
      receipt_valid = await validateAppleReceipt(receipt_data, validation_details)
    } else if (platform === 'android') {
      // Google Play: do NOT auto-grant credits — flag for manual review.
      // Full Google validation requires OAuth2 service account setup.
      receipt_valid = false
      validation_details = {
        mode: 'android_pending_review',
        note: 'Receipt requires manual verification before credits are granted',
        receipt_data_length: receipt_data?.length ?? 0,
        receipt_data_preview: typeof receipt_data === 'string' ? receipt_data.slice(0, 200) : null,
      }
      console.log('[verify-boost-purchase] Android receipt pending manual review:', {
        user_id: user.id,
        product_id,
        transaction_id,
        receipt_data_length: receipt_data?.length ?? 0,
      })
    }

    if (!receipt_valid) {
      // For Android pending review, store the purchase record and return pending status
      if (platform === 'android') {
        await supabase
          .from('boost_purchases')
          .insert({
            user_id: user.id,
            platform,
            product_id,
            transaction_id,
            receipt_data: receipt_data ?? null,
            credits_granted: 0,
            validation_details,
            created_at: new Date().toISOString(),
          })

        return new Response(JSON.stringify({
          success: false,
          verification_status: 'pending_review',
          credits_granted: 0,
          message: 'Android purchase is pending manual verification. Credits will be granted after review.',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ error: 'Receipt validation failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 9. Atomic balance increment via RPC, with read-then-write fallback.
    // The RPC `increment_boost_balance` does `SET balance = balance + p_credits`
    // atomically in SQL, preventing lost updates from concurrent requests.
    let newBalance: number = credits // safe default — overwritten on success

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'increment_boost_balance',
      { p_user_id: user.id, p_credits: credits }
    )

    if (!rpcError && rpcResult !== null && typeof rpcResult === 'number') {
      newBalance = rpcResult
    } else {
      // Fallback: use conditional upsert with optimistic concurrency.
      // First check if user_boosts row exists.
      const { data: currentBoost } = await supabase
        .from('user_boosts')
        .select('balance')
        .eq('user_id', user.id)
        .single()

      if (currentBoost) {
        // Row exists: conditional update (optimistic lock on current balance)
        const { data: updated, error: updateError } = await supabase
          .from('user_boosts')
          .update({
            balance: currentBoost.balance + credits,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('balance', currentBoost.balance)
          .select('balance')
          .single()

        if (updateError || !updated) {
          // Concurrent modification — retry once with fresh read
          const { data: retry } = await supabase
            .from('user_boosts')
            .select('balance')
            .eq('user_id', user.id)
            .single()
          const retryBalance = (retry?.balance ?? 0) + credits
          await supabase
            .from('user_boosts')
            .update({ balance: retryBalance, updated_at: new Date().toISOString() })
            .eq('user_id', user.id)
          newBalance = retryBalance
        } else {
          newBalance = updated.balance
        }
      } else {
        // No row yet: insert new record
        const { error: insertErr } = await supabase
          .from('user_boosts')
          .insert({
            user_id: user.id,
            balance: credits,
            updated_at: new Date().toISOString(),
          })

        if (insertErr) {
          // Race: another request just inserted — update instead
          await supabase.rpc('increment_boost_balance', { p_user_id: user.id, p_credits: credits })
            .then(({ data }) => { newBalance = typeof data === 'number' ? data : credits })
        }
        newBalance = newBalance! ?? credits
      }
    }

    // 10. Insert boost_purchases record
    await supabase
      .from('boost_purchases')
      .insert({
        user_id: user.id,
        platform,
        product_id,
        transaction_id,
        receipt_data: receipt_data ?? null,
        credits_granted: credits,
        validation_details,
        created_at: new Date().toISOString(),
      })

    // 11. Return success
    return new Response(JSON.stringify({
      success: true,
      new_balance: newBalance,
      credits_granted: credits,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[verify-boost-purchase]', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

/**
 * Validate Apple IAP receipt.
 * Tries production endpoint first; if status 21007, retries against sandbox.
 */
async function validateAppleReceipt(
  receiptData: string,
  details: Record<string, unknown>,
): Promise<boolean> {
  const sharedSecret = Deno.env.get('APPLE_SHARED_SECRET')
  if (!sharedSecret) {
    console.error('[verify-boost-purchase] APPLE_SHARED_SECRET not configured')
    details.error = 'Apple shared secret not configured'
    return false
  }

  const payload = {
    'receipt-data': receiptData,
    'password': sharedSecret,
  }

  // Try production first
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  let res: Response
  try {
    res = await fetch('https://buy.itunes.apple.com/verifyReceipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch (err: any) {
    clearTimeout(timeout)
    console.error('[verify-boost-purchase] Apple production validation fetch failed:', err.message)
    details.error = 'Apple production validation timed out or failed'
    return false
  }
  let result = await res.json()

  // Status 21007 means receipt is from sandbox — only allow when SANDBOX_ALLOWED is set
  if (result.status === 21007) {
    const sandboxAllowed = Deno.env.get('SANDBOX_ALLOWED') === 'true'
    if (!sandboxAllowed) {
      details.error = 'Sandbox receipt rejected in production'
      details.apple_status = 21007
      return false
    }
    const sandboxController = new AbortController()
    const sandboxTimeout = setTimeout(() => sandboxController.abort(), 15000)
    try {
      res = await fetch('https://sandbox.itunes.apple.com/verifyReceipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: sandboxController.signal,
      })
      clearTimeout(sandboxTimeout)
    } catch (err: any) {
      clearTimeout(sandboxTimeout)
      console.error('[verify-boost-purchase] Apple sandbox validation fetch failed:', err.message)
      details.error = 'Apple sandbox validation timed out or failed'
      return false
    }
    result = await res.json()
    details.environment = 'sandbox'
  } else {
    details.environment = 'production'
  }

  details.apple_status = result.status
  return result.status === 0
}
