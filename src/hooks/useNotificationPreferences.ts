import { useState, useEffect, useCallback } from 'react'
import { Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSupabase } from '@/hooks/useSupabase'

export type NotificationType = 'messages' | 'reviews' | 'rentals' | 'system' | 'marketing' | 'nearby_posts' | 'events' | 'likes' | 'comments' | 'follows'

interface NotificationPreferences {
  messages: boolean
  reviews: boolean
  rentals: boolean
  system: boolean
  marketing: boolean
  nearby_posts: boolean
  events: boolean
  likes: boolean
  comments: boolean
  follows: boolean
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  messages: true,
  reviews: true,
  rentals: true,
  system: true,
  marketing: false,
  nearby_posts: true,
  events: true,
  likes: true,
  comments: true,
  follows: true,
}

const CACHE_KEY = 'bivo-notification-prefs'

export function useNotificationPreferences() {
  const supabase = useSupabase()
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  // Load preferences: try Supabase first, fall back to AsyncStorage cache
  useEffect(() => {
    let mounted = true

    async function load() {
      // Load cached preferences first for fast display
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY)
        if (cached && mounted) {
          setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(cached) })
        }
      } catch { /* ignore cache errors */ }

      // Then fetch from Supabase
      let user: any = null
      try {
        const { data } = await supabase.auth.getUser()
        user = data?.user
      } catch {
        if (mounted) setLoading(false)
        return
      }
      if (!user || !mounted) {
        if (mounted) setLoading(false)
        return
      }
      if (mounted) setUserId(user.id)

      try {
        const { data } = await supabase
          .from('notification_preferences')
          .select('type, enabled')
          .eq('user_id', user.id)

        if (data && data.length > 0 && mounted) {
          const prefs = { ...DEFAULT_PREFERENCES }
          for (const row of data as { type: string; enabled: boolean }[]) {
            if (row.type in prefs) {
              prefs[row.type as NotificationType] = row.enabled
            }
          }
          setPreferences(prefs)
          // Update cache
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(prefs))
        }
      } catch {
        // Network error — cached values are already set
      }

      if (mounted) setLoading(false)
    }

    load()
    return () => { mounted = false }
  }, [supabase])

  const updatePreference = useCallback(async (type: NotificationType, enabled: boolean) => {
    // Use functional updater to avoid stale closure when multiple toggles
    // fire before the first upsert completes.
    let originalValue = enabled // fallback; overwritten by updater
    setPreferences(prev => {
      originalValue = prev[type]
      const next = { ...prev, [type]: enabled }
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {})
      return next
    })

    if (!userId) return

    // upsert() returns { error } instead of throwing for RLS/schema errors —
    // the previous try/catch only caught network errors, so silent RLS
    // denies left the UI stuck in the wrong state.
    const { error: upsertError } = await (supabase.from('notification_preferences') as any).upsert(
      { user_id: userId, type, enabled },
      { onConflict: 'user_id,type' }
    )

    if (upsertError) {
      // Revert using functional updater to get fresh state
      setPreferences(prev => {
        const reverted = { ...prev, [type]: originalValue }
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(reverted)).catch(() => {})
        return reverted
      })
      Alert.alert('Error', 'Notification preference update failed. Please try again.')
    }
  }, [userId, supabase])

  return { preferences, loading, updatePreference }
}
