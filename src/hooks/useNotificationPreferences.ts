import { useState, useEffect, useCallback, useMemo } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@/lib/supabase/client'

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
  const supabase = useMemo(() => createClient(), [])
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
      const { data: { user } } = await supabase.auth.getUser()
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
    // Optimistic update
    setPreferences((prev) => {
      const next = { ...prev, [type]: enabled }
      // Update cache in background
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {})
      return next
    })

    if (!userId) return

    try {
      await (supabase.from('notification_preferences') as any).upsert(
        { user_id: userId, type, enabled },
        { onConflict: 'user_id,type' }
      )
    } catch {
      // Revert on failure
      setPreferences((prev) => {
        const reverted = { ...prev, [type]: !enabled }
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(reverted)).catch(() => {})
        return reverted
      })
    }
  }, [userId, supabase])

  return { preferences, loading, updatePreference }
}
