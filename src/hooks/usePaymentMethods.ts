import { useState, useEffect, useCallback } from 'react'
import { Platform, Linking } from 'react-native'
import { useSupabase } from '@/hooks/useSupabase'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

export function usePaymentMethods(userId: string | null) {
  const supabase = useSupabase()
  const [isConnectOnboarded, setIsConnectOnboarded] = useState(false)
  const [connectAccountId, setConnectAccountId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let mounted = true

    ;(async () => {
      try {
        const { data } = await supabase.from('profiles')
          .select('stripe_customer_id, stripe_connect_account_id, stripe_connect_onboarded')
          .eq('id', userId)
          .single()
        if (!mounted) return
        if (data) {
          setIsConnectOnboarded((data as any).stripe_connect_onboarded ?? false)
          setConnectAccountId((data as any).stripe_connect_account_id ?? null)
        }
      } catch {
        // Silently fail
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => { mounted = false }
  }, [userId, supabase])

  const startConnectOnboarding = useCallback(async () => {
    if (!userId) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const res = await fetch(`${FUNCTIONS_URL}/stripe-connect-onboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          user_id: userId,
          return_url: 'tackbird://payment-settings',
        }),
      })

      if (res.ok) {
        const { url } = await res.json()
        if (url) await Linking.openURL(url)
      }
    } catch {
      // Silently fail — user can retry
    }
  }, [userId, supabase])

  const refreshStatus = useCallback(async () => {
    if (!userId) return
    try {
      const { data } = await supabase.from('profiles')
        .select('stripe_connect_account_id, stripe_connect_onboarded')
        .eq('id', userId)
        .single()
      if (data) {
        setIsConnectOnboarded((data as any).stripe_connect_onboarded ?? false)
        setConnectAccountId((data as any).stripe_connect_account_id ?? null)
      }
    } catch {
      // Silently fail — user can retry
    }
  }, [userId, supabase])

  const availableMethods = {
    card: true, // Always available via Stripe
    applePay: Platform.OS === 'ios',
    googlePay: Platform.OS === 'android',
  }

  return {
    isConnectOnboarded,
    connectAccountId,
    availableMethods,
    loading,
    startConnectOnboarding,
    refreshStatus,
  }
}
