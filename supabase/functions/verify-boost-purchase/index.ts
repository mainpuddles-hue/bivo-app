// Supabase Edge Function: verify-boost-purchase
// Validates IAP receipts (Apple/Google/sandbox) and credits boost balance.
// Products: com.tackbird.boost_1 (1), boost_3 (3), boost_5 (5)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://tackbird.fi',
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
    const body = await req.json()
    const { platform, product_id, receipt_data, transaction_id } = body

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
      // Only allow sandbox in development/staging — block in production
      const env = Deno.env.get('ENVIRONMENT') ?? 'production'
      if (env !== 'development' && env !== 'staging') {
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
      // Google Play: accept and log for manual verification (MVP)
      // Full Google validation requires OAuth2 service account setup
      receipt_valid = true
      validation_details = {
        mode: 'android_deferred',
        note: 'Receipt logged for manual verification',
        receipt_data_length: receipt_data?.length ?? 0,
      }
      console.log('[verify-boost-purchase] Android receipt logged for manual verification:', {
        user_id: user.id,
        product_id,
        transaction_id,
      })
    }

    if (!receipt_valid) {
      return new Response(JSON.stringify({ error: 'Receipt validation failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 9. Upsert user_boosts: increment balance by credits
    const { data: currentBoost } = await supabase
      .from('user_boosts')
      .select('balance')
      .eq('user_id', user.id)
      .single()

    const newBalance = (currentBoost?.balance ?? 0) + credits

    await supabase
      .from('user_boosts')
      .upsert({
        user_id: user.id,
        balance: newBalance,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

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
  let res = await fetch('https://buy.itunes.apple.com/verifyReceipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  let result = await res.json()

  // Status 21007 means receipt is from sandbox — retry against sandbox endpoint
  if (result.status === 21007) {
    res = await fetch('https://sandbox.itunes.apple.com/verifyReceipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    result = await res.json()
    details.environment = 'sandbox'
  } else {
    details.environment = 'production'
  }

  details.apple_status = result.status
  return result.status === 0
}
