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
      .maybeSingle()

    if (existingPurchase) {
      // Already processed — fetch current balance and return
      const { data: boostRow } = await supabase
        .from('user_boosts')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle()

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
      // Google Play receipt validation via Android Publisher API
      receipt_valid = await validateGooglePlayReceipt(
        product_id,
        receipt_data,
        validation_details,
      )
    }

    if (!receipt_valid) {
      return new Response(JSON.stringify({
        error: 'Receipt validation failed',
        details: validation_details,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 9. Insert purchase record FIRST as an atomic lock — prevents double-credit
    // from concurrent requests with the same transaction_id. The unique constraint
    // on transaction_id ensures only one request succeeds here.
    const { error: purchaseInsertError } = await supabase
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

    if (purchaseInsertError) {
      // Unique constraint violation = concurrent request already processing this transaction
      if (purchaseInsertError.code === '23505') {
        const { data: boostRow } = await supabase
          .from('user_boosts')
          .select('balance')
          .eq('user_id', user.id)
          .maybeSingle()
        return new Response(JSON.stringify({
          success: true,
          new_balance: boostRow?.balance ?? 0,
          credits_granted: credits,
          already_processed: true,
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      console.error('[verify-boost-purchase] purchase record insert failed:', purchaseInsertError.message)
      return new Response(JSON.stringify({ error: 'Failed to record purchase' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 10. Atomic balance increment via RPC, with read-then-write fallback.
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
      const { data: currentBoost } = await supabase
        .from('user_boosts')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle()

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
          // Concurrent modification — retry with optimistic lock on fresh read
          const { data: retry } = await supabase
            .from('user_boosts')
            .select('balance')
            .eq('user_id', user.id)
            .maybeSingle()
          const retryBalance = (retry?.balance ?? 0) + credits
          const { data: retryUpdated } = await supabase
            .from('user_boosts')
            .update({ balance: retryBalance, updated_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('balance', retry?.balance ?? 0) // optimistic lock on retry too
            .select('balance')
            .maybeSingle()
          newBalance = retryUpdated?.balance ?? retryBalance
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
          // Race: another request just inserted — use RPC or optimistic update
          const { data: rpcRetry } = await supabase.rpc(
            'increment_boost_balance',
            { p_user_id: user.id, p_credits: credits }
          )
          newBalance = typeof rpcRetry === 'number' ? rpcRetry : credits
        }
      }
    }

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

/**
 * Validate Google Play purchase token via Android Publisher API.
 *
 * Requires GOOGLE_PLAY_SERVICE_ACCOUNT_KEY env var containing the JSON service
 * account key (base64-encoded) with androidpublisher scope access.
 *
 * If credentials are not configured:
 * - In production (SANDBOX_ALLOWED != 'true'), rejects the purchase.
 * - In development (SANDBOX_ALLOWED == 'true'), logs a warning and accepts.
 */
async function validateGooglePlayReceipt(
  productId: string,
  purchaseToken: string,
  details: Record<string, unknown>,
): Promise<boolean> {
  const PACKAGE_NAME = 'com.tackbird.app'

  if (!purchaseToken || typeof purchaseToken !== 'string') {
    details.error = 'Missing or invalid purchase token'
    return false
  }

  const serviceAccountKeyBase64 = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_KEY')
  if (!serviceAccountKeyBase64) {
    const isProduction = Deno.env.get('SANDBOX_ALLOWED') !== 'true'
    if (isProduction) {
      console.error(
        '[verify-boost-purchase] GOOGLE_PLAY_SERVICE_ACCOUNT_KEY not configured — rejecting Android purchase in production'
      )
      details.error = 'Google Play service account not configured'
      details.mode = 'rejected_no_credentials'
      return false
    }
    // Development/sandbox: warn but accept
    console.warn(
      '[verify-boost-purchase] GOOGLE_PLAY_SERVICE_ACCOUNT_KEY not configured — accepting Android purchase in dev mode'
    )
    details.mode = 'dev_no_credentials'
    details.warning = 'Accepted without verification (credentials not configured, sandbox mode)'
    return true
  }

  // Decode service account key JSON
  let serviceAccountKey: {
    client_email: string
    private_key: string
    token_uri?: string
  }
  try {
    const decoded = atob(serviceAccountKeyBase64)
    serviceAccountKey = JSON.parse(decoded)
  } catch (err: any) {
    console.error('[verify-boost-purchase] Failed to decode GOOGLE_PLAY_SERVICE_ACCOUNT_KEY:', err.message)
    details.error = 'Invalid service account key format'
    return false
  }

  // Generate JWT for Google OAuth2
  const accessToken = await getGoogleAccessToken(serviceAccountKey)
  if (!accessToken) {
    details.error = 'Failed to obtain Google access token'
    return false
  }

  // Call Android Publisher API to verify purchase
  const apiUrl =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/products/${productId}/tokens/${purchaseToken}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  let res: Response
  try {
    res = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)
  } catch (err: any) {
    clearTimeout(timeout)
    console.error('[verify-boost-purchase] Google Play API fetch failed:', err.message)
    details.error = 'Google Play API request failed or timed out'
    return false
  }

  if (!res.ok) {
    const errorBody = await res.text()
    console.error('[verify-boost-purchase] Google Play API error:', res.status, errorBody)
    details.error = `Google Play API returned ${res.status}`
    details.google_api_error = errorBody.slice(0, 500)
    return false
  }

  const purchaseData = await res.json()
  details.google_purchase_state = purchaseData.purchaseState
  details.google_consumption_state = purchaseData.consumptionState
  details.google_order_id = purchaseData.orderId
  details.google_acknowledged = purchaseData.acknowledgementState

  // purchaseState: 0 = Purchased, 1 = Canceled, 2 = Pending
  if (purchaseData.purchaseState !== 0) {
    details.error = `Purchase state is ${purchaseData.purchaseState} (expected 0 = purchased)`
    return false
  }

  // consumptionState: 0 = Not consumed, 1 = Consumed
  // For one-time boost products, we expect NOT consumed (0) since we haven't consumed it yet.
  // If it's already consumed (1), someone already used this token.
  if (purchaseData.consumptionState === 1) {
    details.error = 'Purchase already consumed'
    return false
  }

  details.mode = 'google_play_verified'
  return true
}

/**
 * Generate a Google OAuth2 access token from a service account key using JWT.
 * Implements the "two-legged OAuth" flow for server-to-server auth.
 */
async function getGoogleAccessToken(
  serviceAccount: { client_email: string; private_key: string; token_uri?: string }
): Promise<string | null> {
  const tokenUri = serviceAccount.token_uri || 'https://oauth2.googleapis.com/token'
  const scope = 'https://www.googleapis.com/auth/androidpublisher'
  const now = Math.floor(Date.now() / 1000)

  // Create JWT header and claims
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: serviceAccount.client_email,
    scope,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }

  const encodedHeader = base64urlEncode(JSON.stringify(header))
  const encodedClaims = base64urlEncode(JSON.stringify(claims))
  const unsignedJwt = `${encodedHeader}.${encodedClaims}`

  // Sign JWT with RSA-SHA256
  let signature: string
  try {
    const privateKey = await importPKCS8Key(serviceAccount.private_key)
    const signatureBuffer = await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      privateKey,
      new TextEncoder().encode(unsignedJwt),
    )
    signature = base64urlEncodeBuffer(new Uint8Array(signatureBuffer))
  } catch (err: any) {
    console.error('[verify-boost-purchase] JWT signing failed:', err.message)
    return null
  }

  const jwt = `${unsignedJwt}.${signature}`

  // Exchange JWT for access token
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const errorText = await res.text()
      console.error('[verify-boost-purchase] Google token exchange failed:', res.status, errorText)
      return null
    }

    const tokenData = await res.json()
    return tokenData.access_token || null
  } catch (err: any) {
    clearTimeout(timeout)
    console.error('[verify-boost-purchase] Google token exchange request failed:', err.message)
    return null
  }
}

/**
 * Import a PEM-encoded PKCS8 private key for use with Web Crypto API.
 */
async function importPKCS8Key(pem: string): Promise<CryptoKey> {
  // Strip PEM header/footer and whitespace
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/** Base64url encode a string (no padding). */
function base64urlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Base64url encode a Uint8Array (no padding). */
function base64urlEncodeBuffer(buffer: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
