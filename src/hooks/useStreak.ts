import { useState, useEffect, useCallback, useRef } from 'react'
import { useSupabase } from './useSupabase'

interface StreakData {
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
  multiplier: number  // 1x, 2x (7+ days), 3x (30+ days)
}

// PERF: Defer streak DB write by this many ms
const STREAK_WRITE_DELAY_MS = 3000

export function useStreak(userId: string | null) {
  const supabase = useSupabase()
  const [streak, setStreak] = useState<StreakData>({
    currentStreak: 0, longestStreak: 0, lastActiveDate: null, multiplier: 1,
  })
  const streakRef = useRef(streak)
  streakRef.current = streak

  useEffect(() => {
    if (!userId) return
    supabase.from('profiles')
      .select('current_streak, longest_streak, last_active_date')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          const cs = (data as any).current_streak ?? 0
          const newStreak = {
            currentStreak: cs,
            longestStreak: (data as any).longest_streak ?? 0,
            lastActiveDate: (data as any).last_active_date,
            multiplier: cs >= 30 ? 3 : cs >= 7 ? 2 : 1,
          }
          setStreak(newStreak)
          streakRef.current = newStreak
        }
      })
  }, [userId, supabase])

  const recordActivity = useCallback(async () => {
    if (!userId) return
    const today = new Date().toISOString().slice(0, 10)

    // PERF: Use ref for fresh data to avoid stale closure
    const current = streakRef.current

    // If already recorded today, skip
    if (current.lastActiveDate === today) return

    // PERF: Defer the DB write — don't block initial render
    await new Promise(resolve => setTimeout(resolve, STREAK_WRITE_DELAY_MS))

    // Re-check after delay (might have been updated)
    if (streakRef.current.lastActiveDate === today) return

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    let newStreak: number

    if (current.lastActiveDate === yesterday) {
      // Continue streak
      newStreak = current.currentStreak + 1
    } else if (!current.lastActiveDate || current.lastActiveDate < yesterday) {
      // Streak broken — reset to 1
      newStreak = 1
    } else {
      newStreak = current.currentStreak
    }

    const newLongest = Math.max(current.longestStreak, newStreak)
    const multiplier = newStreak >= 30 ? 3 : newStreak >= 7 ? 2 : 1

    await (supabase.from('profiles') as any).update({
      current_streak: newStreak,
      longest_streak: newLongest,
      last_active_date: today,
    }).eq('id', userId)

    const updated = {
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastActiveDate: today,
      multiplier,
    }
    setStreak(updated)
    streakRef.current = updated
  }, [userId, supabase])

  return { ...streak, recordActivity }
}
