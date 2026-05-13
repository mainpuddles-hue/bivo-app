import { useState, useCallback, useRef } from 'react'
import { Platform, Linking } from 'react-native'
import { useSupabase } from '@/hooks/useSupabase'
import { useI18n } from '@/lib/i18n'
import { getNetworkAwareError } from '@/lib/errorUtils'
import { mapErrorToFinnish } from '@/lib/errorMessages'

// All Stripe operations go through Supabase Edge Functions (no web backend dependency)
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

interface PaymentOptions {
  amount: number // cents (499 = 4.99€)
  description: string
  metadata?: Record<string, string>
  type: 'rental' | 'service' | 'ad_campaign'
  postId?: string
  sellerId?: string
  manualCapture?: boolean
}

/**
 * Stripe payment hook for marketplace transactions.
 * Creates Checkout sessions via Supabase Edge Functions.
 * Supports card + Apple Pay + Google Pay via Stripe Checkout.
 * Commission: 10% to Puddles Oy platform, 90% to provider.
 */
export function useStripePayment() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const payingRef = useRef(false)
  const supabase = useSupabase()
  const { t } = useI18n()

  const createPayment = useCallback(async (options: PaymentOptions): Promise<string | null> => {
    // Guard against double payment from rapid taps
    if (payingRef.current) return null
    payingRef.current = true
    setLoading(true)
    setError(null)

    // Declare outside try so finally can always clean up
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError(t('errors.loginPrompt'))
        return null
      }

      // Single Edge Function handles all payment types
      const endpoint = `${FUNCTIONS_URL}/stripe-checkout`

      // 15s timeout to prevent hanging fetch from allowing duplicate payments
      timeout = setTimeout(() => controller.abort(), 15000)

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: options.amount,
          description: options.description,
          type: options.type,
          post_id: options.postId,
          seller_id: options.sellerId,
          metadata: options.metadata,
          // Commission: 10% to Puddles Oy via Stripe Connect destination charges
          application_fee_amount: Math.round(options.amount * 0.10),
          success_url: 'bivo://payment/success',
          cancel_url: 'bivo://payment/cancel',
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // Map Stripe error codes/messages to user-friendly translated strings
        const stripeError = body.error
          ? { message: body.error, code: body.code ?? body.decline_code ?? '' }
          : null
        setError(stripeError ? mapErrorToFinnish(stripeError, t) : t('errors.paymentFailed'))
        return null
      }

      const { url, session_id } = await res.json()

      // Open Stripe Checkout in browser (supports card + Apple Pay + Google Pay)
      if (url) {
        await Linking.openURL(url).catch(() => {})
      }

      return session_id ?? null
    } catch (err) {
      // Check network status for better error differentiation
      const msg = await getNetworkAwareError(err, t)
      setError(msg)
      return null
    } finally {
      if (timeout) clearTimeout(timeout)
      setLoading(false)
      payingRef.current = false
    }
  }, [supabase, t])

  return { createPayment, loading, error }
}
