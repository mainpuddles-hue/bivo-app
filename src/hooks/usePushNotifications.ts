import { useState, useEffect, useCallback, useRef } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { createClient } from '@/lib/supabase/client'

const PROJECT_ID = '504a9107-9e8e-4e5d-90fe-ea7564166e33'

async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Oletuskanava',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2D6B5E',
  })
}

export function usePushNotifications(userId: string | null) {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const notificationListener = useRef<Notifications.EventSubscription | null>(null)

  // Web — return no-op early
  if (Platform.OS === 'web') {
    return {
      isSupported: false,
      isSubscribed: false,
      isLoading: false,
      token: null,
      subscribe: async () => {},
      unsubscribe: async () => {},
    }
  }

  // Check support + existing token on mount
  useEffect(() => {
    // Physical device check via Constants (simulators have no push support)
    const isDevice = Constants.executionEnvironment !== 'storeClient'
      ? true // dev client or standalone — allow
      : true // Expo Go on physical device
    setIsSupported(isDevice)
    if (!userId) return

    let mounted = true

    async function checkExistingToken() {
      try {
        await setupAndroidChannel()

        const { status } = await Notifications.getPermissionsAsync()
        if (status !== 'granted') return

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ?? PROJECT_ID

        const pushToken = (
          await Notifications.getExpoPushTokenAsync({ projectId })
        ).data

        if (!mounted) return
        setToken(pushToken)
        setIsSubscribed(true)
      } catch {
        // Token not available yet — user hasn't subscribed or on simulator
      }
    }

    checkExistingToken()

    // Listener: notification received while app is foregrounded
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log('[push] received:', notification.request.identifier)
      })

    return () => {
      mounted = false
      notificationListener.current?.remove()
    }
  }, [userId])

  const subscribe = useCallback(async () => {
    if (!userId) return

    setIsLoading(true)
    try {
      await setupAndroidChannel()

      const { status: existing } = await Notifications.getPermissionsAsync()
      let finalStatus = existing

      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }

      if (finalStatus !== 'granted') {
        setIsLoading(false)
        return
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? PROJECT_ID

      const pushToken = (
        await Notifications.getExpoPushTokenAsync({ projectId })
      ).data

      // Store token in Supabase profiles table
      const supabase = createClient()
      const { error } = await (supabase.from('profiles') as any)
        .update({ push_token: pushToken })
        .eq('id', userId)

      if (error) {
        console.error('[push] failed to save token:', error.message)
        setIsLoading(false)
        return
      }

      setToken(pushToken)
      setIsSubscribed(true)
    } catch (err) {
      console.error('[push] subscribe failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const unsubscribe = useCallback(async () => {
    if (!userId) return

    setIsLoading(true)
    try {
      // Remove token from Supabase
      const supabase = createClient()
      await (supabase.from('profiles') as any)
        .update({ push_token: null })
        .eq('id', userId)

      setToken(null)
      setIsSubscribed(false)
    } catch (err) {
      console.error('[push] unsubscribe failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  return { isSupported, isSubscribed, isLoading, token, subscribe, unsubscribe }
}
