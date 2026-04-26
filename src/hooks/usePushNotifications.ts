declare const __DEV__: boolean

import { useState, useEffect, useCallback, useRef } from 'react'
import { Platform, Alert, AppState } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@/lib/supabase/client'

const PROJECT_ID = '504a9107-9e8e-4e5d-90fe-ea7564166e33'
const PUSH_PREF_KEY = 'tackbird-push-enabled'

const isWeb = Platform.OS === 'web'

function isExpoGo() {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient
}

async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1A1D1F',
  })
}

async function saveTokenToBackend(userId: string, pushToken: string | null) {
  const supabase = createClient()
  const { error } = await (supabase.from('profiles') as any)
    .update({ push_token: pushToken })
    .eq('id', userId)

  if (error) {
    // Fallback: store locally
    if (pushToken) {
      await AsyncStorage.setItem('push_token', pushToken)
    } else {
      await AsyncStorage.removeItem('push_token')
    }
    if (__DEV__) console.log('[push] saved token locally (backend failed):', error.message)
  }
}

export function usePushNotifications(userId: string | null) {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const notificationListener = useRef<Notifications.EventSubscription | null>(null)
  // Use ref to avoid stale closure in interval and to prevent re-render loop
  const tokenRef = useRef<string | null>(null)
  tokenRef.current = token

  useEffect(() => {
    // Skip on web — push notifications are not supported
    if (isWeb) return

    const supported = !isExpoGo()
    setIsSupported(supported)

    if (!userId) return

    let mounted = true

    async function checkExistingToken() {
      // Always load saved preference so the toggle starts in the right position
      const savedPref = await AsyncStorage.getItem(PUSH_PREF_KEY)
      if (savedPref === 'true' && mounted) {
        setIsSubscribed(true)
      }

      if (!supported) {
        if (__DEV__) console.warn('[push] Push notifications not available in Expo Go — build with EAS to test')
        return
      }

      try {
        await setupAndroidChannel()
        const { status } = await Notifications.getPermissionsAsync()
        if (status !== 'granted') return

        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? PROJECT_ID
        const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data

        if (!mounted) return
        setToken(pushToken)
        setIsSubscribed(true)
        await AsyncStorage.setItem(PUSH_PREF_KEY, 'true')
        // Save token to backend (may not be saved yet on first install)
        if (userId) await saveTokenToBackend(userId, pushToken)
        await AsyncStorage.setItem('push_token', pushToken)
      } catch {
        // Try local fallback
        const local = await AsyncStorage.getItem('push_token')
        if (local && mounted) {
          setToken(local)
          setIsSubscribed(true)
        }
      }
    }

    checkExistingToken()

    // Re-sync token when the app returns to the foreground.
    // The previous 24h setInterval almost never fired in practice because
    // mobile apps are rarely kept open for 24 hours — token rotation went
    // undetected. Listening on AppState is both cheaper and more correct.
    const lastSyncRef = { current: Date.now() }
    const MIN_SYNC_INTERVAL = 12 * 60 * 60 * 1000 // 12h
    const appStateSub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active' || !mounted || !userId) return
      if (Date.now() - lastSyncRef.current < MIN_SYNC_INTERVAL) return
      lastSyncRef.current = Date.now()
      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? PROJECT_ID
        const freshToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data
        if (mounted && freshToken && freshToken !== tokenRef.current) {
          await saveTokenToBackend(userId, freshToken)
          setToken(freshToken)
        }
      } catch {} // Non-critical
    })

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        if (__DEV__) console.log('[push] received:', notification.request.identifier)
      })

    return () => {
      mounted = false
      notificationListener.current?.remove()
      appStateSub.remove()
    }
  }, [userId]) // Removed `token` — use tokenRef to avoid re-render loop

  const subscribe = useCallback(async () => {
    if (isWeb || !userId) return

    // Always save the user's preference so the toggle persists
    setIsSubscribed(true)
    await AsyncStorage.setItem(PUSH_PREF_KEY, 'true')

    if (isExpoGo()) {
      // In Expo Go, push tokens can't be registered but we save the preference
      // so it works immediately when switching to a native build
      if (__DEV__) console.log('[push] Preference saved — push tokens require EAS Build')
      return
    }

    setIsLoading(true)
    try {
      await setupAndroidChannel()

      const { status: existing } = await Notifications.getPermissionsAsync()
      let finalStatus = existing

      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowSound: true,
            allowBadge: true,
            allowProvisional: true,
          },
        })
        finalStatus = status
      }

      if (finalStatus !== 'granted') {
        setIsLoading(false)
        return
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? PROJECT_ID

      let pushToken: string
      try {
        pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data
      } catch {
        // Token registration failed but preference is already saved
        setIsLoading(false)
        return
      }

      await saveTokenToBackend(userId, pushToken)
      setToken(pushToken)
    } catch (err) {
      if (__DEV__) console.error('[push] subscribe failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const unsubscribe = useCallback(async () => {
    if (isWeb || !userId) return

    setIsSubscribed(false)
    await AsyncStorage.setItem(PUSH_PREF_KEY, 'false')

    if (isExpoGo()) return

    setIsLoading(true)
    try {
      await saveTokenToBackend(userId, null)
      setToken(null)
    } catch (err) {
      if (__DEV__) console.error('[push] unsubscribe failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  return { isSupported, isSubscribed, isLoading, token, subscribe, unsubscribe }
}
