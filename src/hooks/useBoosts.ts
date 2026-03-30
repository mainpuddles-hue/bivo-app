import { useState, useEffect, useCallback } from 'react'
import { Alert } from 'react-native'
import { useSupabase } from '@/hooks/useSupabase'
import { useI18n } from '@/lib/i18n'
import { BOOST_PRODUCTS, isSandboxMode } from '@/lib/iap'
import type { BoostTier } from '@/lib/types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

interface ActiveBoost {
  id: string
  post_id: string
  boost_start: string
  boost_end: string
  boost_type: string
  is_active: boolean
}

export function useBoosts(userId: string | null) {
  const supabase = useSupabase()
  const { t } = useI18n()

  const [balance, setBalance] = useState(0)
  const [tier, setTier] = useState<BoostTier>('free')
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)
  const [activeBoosts, setActiveBoosts] = useState<ActiveBoost[]>([])

  // Fetch balance
  const fetchBalance = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    try {
      const { data } = await supabase
        .from('user_boosts')
        .select('balance, tier, monthly_grants_remaining')
        .eq('user_id', userId)
        .single()
      if (data) {
        setBalance((data as any).balance ?? 0)
        setTier(((data as any).tier as BoostTier) ?? 'free')
      }

      // Fetch active boosts
      const { data: boosts } = await supabase
        .from('post_boosts')
        .select('id, post_id, boost_start, boost_end, boost_type, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .gt('boost_end', new Date().toISOString())
      setActiveBoosts((boosts as ActiveBoost[] | null) ?? [])
    } catch {
      // Silently fail — data will be empty defaults
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      await fetchBalance()
      if (!mounted) return
    }
    run()
    return () => { mounted = false }
  }, [fetchBalance])

  // Purchase boosts (sandbox or real IAP)
  const purchaseBoost = useCallback(async (productId: string) => {
    if (purchasing) return
    setPurchasing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const product = BOOST_PRODUCTS.find(p => p.id === productId)
      if (!product) throw new Error('Invalid product')

      if (isSandboxMode()) {
        // Sandbox: call Edge Function directly with platform='sandbox'
        const res = await fetch(`${FUNCTIONS_URL}/verify-boost-purchase`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            platform: 'sandbox',
            product_id: productId,
            receipt_data: 'sandbox_receipt',
            transaction_id: `sandbox_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? t('boost.purchaseFailed'))
        }
        const result = await res.json()
        setBalance(result.new_balance ?? balance + product.credits)
        Alert.alert(t('boost.title'), t('boost.purchaseSuccess', { count: product.credits }))
      } else {
        // Real IAP: use react-native-iap
        try {
          const RNIap = require('react-native-iap')
          await RNIap.requestPurchase({ sku: productId })
          // Purchase listener handles the receipt verification
        } catch (iapErr: any) {
          if (iapErr.code !== 'E_USER_CANCELLED') {
            throw iapErr
          }
        }
      }
      await fetchBalance()
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message ?? t('boost.purchaseFailed'))
    } finally {
      setPurchasing(false)
    }
  }, [purchasing, supabase, t, balance, fetchBalance])

  // Use boost on a post
  const useBoostOnPost = useCallback(async (postId: string): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const res = await fetch(`${FUNCTIONS_URL}/use-boost`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ post_id: postId }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? t('boost.boostFailed'))
      }

      const result = await res.json()
      setBalance(result.remaining_balance ?? Math.max(0, balance - 1))
      return true
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message ?? t('boost.boostFailed'))
      return false
    }
  }, [supabase, t, balance])

  return {
    balance,
    tier,
    loading,
    purchasing,
    activeBoosts,
    purchaseBoost,
    useBoostOnPost,
    refreshBalance: fetchBalance,
  }
}
