import { useState, useCallback } from 'react'
import { Platform, Linking } from 'react-native'
import { useSupabase } from '@/hooks/useSupabase'

const WEB_BACKEND = 'https://tackbird-v2.vercel.app'

interface PaymentOptions {
  amount: number // cents (499 = 4.99€)
  description: string
  metadata?: Record<string, string>
  type: 'rental' | 'service' | 'ad_campaign'
  postId?: string
  sellerId?: string
}

/**
 * Stripe payment hook for physical goods/services (rentals, ads).
 * Creates a Checkout session via the web backend and opens it in browser.
 * Works on iOS, Android, and web — no native Stripe SDK required.
 */
export function useStripePayment() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = useSupabase()

  const createPayment = useCallback(async (options: PaymentOptions): Promise<string | null> => {
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Kirjaudu sisään maksaaksesi')
        setLoading(false)
        return null
      }

      // Determine the correct API endpoint
      const endpointMap: Record<string, string> = {
        rental: `${WEB_BACKEND}/api/stripe/rental-checkout`,
        service: `${WEB_BACKEND}/api/stripe/service-checkout`,
        ad_campaign: `${WEB_BACKEND}/api/stripe/ad-checkout`,
      }
      const endpoint = endpointMap[options.type] ?? endpointMap.service

      // Create Stripe Checkout session via web backend
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: options.amount,
          description: options.description,
          post_id: options.postId,
          seller_id: options.sellerId,
          metadata: options.metadata,
          // Commission: 10% to Puddles Oy via Stripe Connect
          application_fee_amount: Math.round(options.amount * 0.10),
          // Return URLs
          success_url: Platform.OS === 'web'
            ? `${window.location.origin}/payment/success`
            : 'tackbird://payment/success',
          cancel_url: Platform.OS === 'web'
            ? `${window.location.origin}/payment/cancel`
            : 'tackbird://payment/cancel',
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Maksu epäonnistui')
        setLoading(false)
        return null
      }

      const { url, session_id } = await res.json()

      // Open Stripe Checkout in browser
      if (url) {
        if (Platform.OS === 'web') {
          window.location.href = url
        } else {
          await Linking.openURL(url)
        }
      }

      setLoading(false)
      return session_id ?? null
    } catch (err) {
      setError('Maksuyhteys epäonnistui')
      setLoading(false)
      return null
    }
  }, [supabase])

  return { createPayment, loading, error }
}
