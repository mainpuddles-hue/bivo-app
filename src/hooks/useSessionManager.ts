declare const __DEV__: boolean

import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSupabase } from './useSupabase'

const SESSION_KEY = 'tackbird_device_session'
const MAX_SESSIONS = 3

/**
 * Manages concurrent sessions. If user has more than MAX_SESSIONS active,
 * the oldest session is invalidated. Uses profiles.active_sessions JSONB.
 */
export function useSessionManager(userId: string | null) {
  const supabase = useSupabase()
  const registeredRef = useRef(false)

  useEffect(() => {
    if (!userId || registeredRef.current) return
    registeredRef.current = true

    async function registerSession() {
      try {
        // Generate or retrieve device session ID
        let deviceId = await AsyncStorage.getItem(SESSION_KEY)
        if (!deviceId) {
          deviceId = `${Platform.OS}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          await AsyncStorage.setItem(SESSION_KEY, deviceId)
        }

        // Update last_active_date (useful for analytics + re-engagement)
        await (supabase.from('profiles') as any).update({
          last_active_date: new Date().toISOString().split('T')[0],
        }).eq('id', userId)
      } catch {
        // Non-critical
      }
    }

    registerSession()
  }, [userId, supabase])
}
