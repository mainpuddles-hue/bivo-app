declare const __DEV__: boolean

import { useState, useEffect, useCallback, useRef } from 'react'
import { Platform, Alert } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@/lib/supabase/client'

const PROJECT_ID = '504a9107-9e8e-4e5d-90fe-ea7564166e33'

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
    lightColor: '#2D6B5E',
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

  useEffect(() => {
    // Skip on web — push notifications are not supported
    if (isWeb) return

    const supported = !isExpoGo()
    setIsSupported(supported)
    if (!userId || !supported) return

    let mounted = true

    async function checkExistingToken() {
      try {
        await setupAndroidChannel()
        const { status } = await Notifications.getPermissionsAsync()
        if (status !== 'granted') return

        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? PROJECT_ID
        const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data

        if (!mounted) return
        setToken(pushToken)
        setIsSubscribed(true)
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

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        if (__DEV__) console.log('[push] received:', notification.request.identifier)
      })

    return () => {
      mounted = false
      notificationListener.current?.remove()
    }
  }, [userId])

  const subscribe = useCallback(async () => {
    if (isWeb || !userId) return

    if (isExpoGo()) {
      Alert.alert(
        'Push Notifications',
        'Push notifications require a native build (EAS Build). They are not available in Expo Go.'
      )
      return
    }

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

      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? PROJECT_ID

      let pushToken: string
      try {
        pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data
      } catch {
        Alert.alert(
          'Push Notifications',
          'Failed to create push token. Make sure you are using a native build (EAS Build).'
        )
        setIsLoading(false)
        return
      }

      await saveTokenToBackend(userId, pushToken)
      setToken(pushToken)
      setIsSubscribed(true)
    } catch (err) {
      if (__DEV__) console.error('[push] subscribe failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const unsubscribe = useCallback(async () => {
    if (isWeb || !userId) return
    setIsLoading(true)
    try {
      await saveTokenToBackend(userId, null)
      setToken(null)
      setIsSubscribed(false)
    } catch (err) {
      if (__DEV__) console.error('[push] unsubscribe failed:', err)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  return { isSupported, isSubscribed, isLoading, token, subscribe, unsubscribe }
}
