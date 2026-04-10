import { useState, useEffect, useCallback } from 'react'
import { Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSupabase } from '@/hooks/useSupabase'

export type NotificationType = 'messages' | 'reviews' | 'rentals' | 'system' | 'marketing' | 'nearby_posts' | 'events' | 'likes' | 'comments' | 'follows' | 'nappaa'

export interface NotificationPreferences {
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
  nappaa: boolean
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
  nappaa: true,
}

const CACHE_KEY = 'tackbird-notification-prefs'

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
    // Capture original value BEFORE optimistic update for correct rollback
    const originalValue = preferences[type]

    // Optimistic update — keep updater pure and persist outside it so that
    // React 19 StrictMode's double-invoke doesn't write to storage twice.
    const nextOptimistic = { ...preferences, [type]: enabled }
    setPreferences(nextOptimistic)
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(nextOptimistic)).catch(() => {})

    if (!userId) return

    // upsert() returns { error } instead of throwing for RLS/schema errors —
    // the previous try/catch only caught network errors, so silent RLS
    // denies left the UI stuck in the wrong state.
    const { error: upsertError } = await (supabase.from('notification_preferences') as any).upsert(
      { user_id: userId, type, enabled },
      { onConflict: 'user_id,type' }
    )

    if (upsertError) {
      // Revert to the captured original value
      const reverted = { ...preferences, [type]: originalValue }
      setPreferences(reverted)
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(reverted)).catch(() => {})
      Alert.alert('Error', 'Notification preference update failed. Please try again.')
    }
  }, [userId, supabase, preferences])

  return { preferences, loading, updatePreference }
}
