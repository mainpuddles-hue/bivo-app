import { useState, useEffect, useCallback, useRef } from 'react'
import { Platform } from 'react-native'
import { createClient } from '@/lib/supabase/client'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function usePushNotifications(userId: string | null) {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    let mounted = true

    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window

    setIsSupported(supported)
    if (!supported) return

    function registerSW() {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          if (!mounted) return
          registrationRef.current = reg
          return reg.pushManager.getSubscription()
        })
        .then((sub) => {
          if (!mounted) return
          setIsSubscribed(!!sub)
        })
        .catch(() => {})
    }

    if (document.readyState === 'complete') {
      registerSW()
    } else {
      window.addEventListener('load', registerSW, { once: true })
    }

    return () => {
      mounted = false
      window.removeEventListener('load', registerSW)
    }
  }, [])

  const subscribe = useCallback(async () => {
    if (!isSupported || !userId) return

    setIsLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setIsLoading(false)
        return
      }

      let registration = registrationRef.current
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw.js')
        registrationRef.current = registration
      }

      await navigator.serviceWorker.ready

      const vapidKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        setIsLoading(false)
        return
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })

      const subJson = subscription.toJSON()

      // Save directly to Supabase (bypasses API route auth issues)
      const supabase = createClient()
      const { error } = await (supabase.from('push_subscriptions') as any).upsert({
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subJson.keys?.p256dh ?? '',
        auth: subJson.keys?.auth ?? '',
      }, { onConflict: 'endpoint' })

      if (error) {
        await subscription.unsubscribe()
        setIsLoading(false)
        return
      }

      setIsSubscribed(true)
    } catch (err) {
      console.error('[push] subscribe failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isSupported, userId])

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !userId) return

    setIsLoading(true)
    try {
      const registration = registrationRef.current
      if (!registration) { setIsLoading(false); return }

      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()

        const supabase = createClient()
        await (supabase.from('push_subscriptions') as any)
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', endpoint)
      }

      setIsSubscribed(false)
    } catch (err) {
      console.error('[push] unsubscribe failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isSupported, userId])

  return { isSupported, isSubscribed, isLoading, subscribe, unsubscribe }
}
