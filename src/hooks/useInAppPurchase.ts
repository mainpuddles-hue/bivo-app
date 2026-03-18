import { useState, useEffect, useCallback } from 'react'
import { Platform } from 'react-native'
import { createClient } from '@/lib/supabase/client'

// Product IDs — must match App Store Connect / Google Play Console
const PRO_MONTHLY = 'com.tackbird.mobile.pro_monthly'

// Graceful import — module won't exist on web or before native build
let IAP: any = null
try {
  if (Platform.OS !== 'web') IAP = require('react-native-iap')
} catch { /* not installed yet */ }

interface Product {
  productId: string
  title: string
  description: string
  localizedPrice: string
  price: string
  currency: string
}

export function useInAppPurchase(userId: string | null) {
  const [products, setProducts] = useState<Product[]>([])
  const [isPro, setIsPro] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAvailable, setIsAvailable] = useState(false)

  // Init IAP connection + fetch products
  useEffect(() => {
    if (!IAP || Platform.OS === 'web') return
    let purchaseListener: any = null

    async function init() {
      try {
        await IAP.initConnection()
        setIsAvailable(true)

        // Fetch subscription products
        const items = await IAP.getSubscriptions({ skus: [PRO_MONTHLY] })
        setProducts(items.map((p: any) => ({
          productId: p.productId,
          title: p.title ?? 'TackBird Pro',
          description: p.description ?? '',
          localizedPrice: p.localizedPrice ?? '4,99 €',
          price: p.price ?? '4.99',
          currency: p.currency ?? 'EUR',
        })))

        // Check existing subscription
        const available = await IAP.getAvailablePurchases()
        const hasPro = available.some((p: any) => p.productId === PRO_MONTHLY)
        if (hasPro) setIsPro(true)

        // Listen for purchase updates
        purchaseListener = IAP.purchaseUpdatedListener(async (purchase: any) => {
          if (purchase.productId === PRO_MONTHLY) {
            // Verify and activate Pro
            try {
              const supabase = createClient()
              await (supabase.from('profiles') as any)
                .update({ is_pro: true, pro_since: new Date().toISOString() })
                .eq('id', userId)
              setIsPro(true)

              // Acknowledge purchase (required by Google Play)
              if (Platform.OS === 'android') {
                await IAP.acknowledgePurchaseAndroid({ token: purchase.purchaseToken })
              }
              await IAP.finishTransaction({ purchase, isConsumable: false })
            } catch (err) {
              setError('Tilauksen aktivointi epäonnistui')
            }
            setPurchasing(false)
          }
        })
      } catch {
        // IAP not available (simulator, web, etc.)
        setIsAvailable(false)
      }
    }

    init()
    return () => {
      purchaseListener?.remove?.()
      IAP?.endConnection?.()
    }
  }, [userId])

  // Purchase Pro subscription
  const purchase = useCallback(async () => {
    if (!IAP || !isAvailable || purchasing) return
    setError(null)
    setPurchasing(true)
    try {
      await IAP.requestSubscription({ sku: PRO_MONTHLY })
      // purchaseUpdatedListener handles the rest
    } catch (err: any) {
      if (err?.code !== 'E_USER_CANCELLED') {
        setError('Osto epäonnistui')
      }
      setPurchasing(false)
    }
  }, [isAvailable, purchasing])

  // Restore previous purchases
  const restore = useCallback(async () => {
    if (!IAP || !isAvailable) return
    setError(null)
    setPurchasing(true)
    try {
      const available = await IAP.getAvailablePurchases()
      const hasPro = available.some((p: any) => p.productId === PRO_MONTHLY)
      if (hasPro) {
        const supabase = createClient()
        await (supabase.from('profiles') as any)
          .update({ is_pro: true })
          .eq('id', userId)
        setIsPro(true)
      } else {
        setError('Ei aiempia tilauksia')
      }
    } catch {
      setError('Palautus epäonnistui')
    }
    setPurchasing(false)
  }, [isAvailable, userId])

  return { products, isPro, purchasing, purchase, restore, error, isAvailable }
}
