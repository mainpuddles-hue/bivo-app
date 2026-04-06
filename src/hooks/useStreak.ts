declare const __DEV__: boolean

import { useState, useEffect, useCallback, useRef } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSupabase } from './useSupabase'

interface StreakData {
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
  multiplier: number  // 1x, 2x (7+ days), 3x (30+ days)
}

const STREAK_CACHE_PREFIX = 'tackbird_streak_'

export function useStreak(userId: string | null) {
  const supabase = useSupabase()
  const [streak, setStreak] = useState<StreakData>({
    currentStreak: 0, longestStreak: 0, lastActiveDate: null, multiplier: 1,
  })
  const recordingRef = useRef(false) // Prevent concurrent recordActivity calls
  const streakRef = useRef(streak)
  streakRef.current = streak

  useEffect(() => {
    if (!userId) return
    let mounted = true

    async function fetchStreak() {
      try {
        const { data } = await supabase.from('profiles')
          .select('current_streak, longest_streak, last_active_date')
          .eq('id', userId!)
          .single()

        if (data && mounted) {
          const cs = (data as any).current_streak ?? 0
          setStreak({
            currentStreak: cs,
            longestStreak: (data as any).longest_streak ?? 0,
            lastActiveDate: (data as any).last_active_date,
            multiplier: cs >= 30 ? 3 : cs >= 7 ? 2 : 1,
          })
        }
      } catch {
        // Intentional: streak columns may not exist — show default values
      }
    }

    fetchStreak()
    return () => { mounted = false }
  }, [userId, supabase])

  const recordActivity = useCallback(async () => {
    if (!userId) return

    // Prevent concurrent calls (e.g., from multiple re-renders)
    if (recordingRef.current) return
    recordingRef.current = true

    try {
      const today = new Date().toLocaleDateString('sv-SE')

      // Check AsyncStorage first — avoid unnecessary DB write if already recorded today
      const cacheKey = `${STREAK_CACHE_PREFIX}${userId}`
      const cachedDate = await AsyncStorage.getItem(cacheKey)
      if (cachedDate === today) {
        recordingRef.current = false
        return
      }

      // Read from ref to avoid stale closure over streak state
      const currentStreak = streakRef.current

      // Also check in-memory state
      if (currentStreak.lastActiveDate === today) {
        // Update cache to match state
        await AsyncStorage.setItem(cacheKey, today).catch(() => {})
        recordingRef.current = false
        return
      }

      const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE')
      let newStreak: number

      if (currentStreak.lastActiveDate === yesterday) {
        // Continue streak
        newStreak = currentStreak.currentStreak + 1
      } else if (!currentStreak.lastActiveDate || currentStreak.lastActiveDate < yesterday) {
        // Streak broken — reset to 1
        newStreak = 1
      } else {
        newStreak = currentStreak.currentStreak
      }

      const newLongest = Math.max(currentStreak.longestStreak, newStreak)
      const multiplier = newStreak >= 30 ? 3 : newStreak >= 7 ? 2 : 1

      const { error: streakError } = await (supabase.from('profiles') as any).update({
        current_streak: newStreak,
        longest_streak: newLongest,
        last_active_date: today,
      }).eq('id', userId)
      if (streakError) {
        if (__DEV__) console.warn('[useStreak] streak update failed:', streakError.message)
        recordingRef.current = false
        return
      }

      // Cache today's date to prevent redundant DB writes on subsequent feed loads
      await AsyncStorage.setItem(cacheKey, today).catch(() => {})

      setStreak({
        currentStreak: newStreak,
        longestStreak: newLongest,
        lastActiveDate: today,
        multiplier,
      })
    } catch {
      // Intentional: streak update is non-critical — silently fail
    } finally {
      recordingRef.current = false
    }
  }, [userId, supabase])

  return { ...streak, recordActivity }
}
