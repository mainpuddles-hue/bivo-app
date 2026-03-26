import { useState, useEffect, useCallback } from 'react'
import { useSupabase } from './useSupabase'

interface StreakData {
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
  multiplier: number  // 1x, 2x (7+ days), 3x (30+ days)
}

export function useStreak(userId: string | null) {
  const supabase = useSupabase()
  const [streak, setStreak] = useState<StreakData>({
    currentStreak: 0, longestStreak: 0, lastActiveDate: null, multiplier: 1,
  })

  useEffect(() => {
    if (!userId) return
    supabase.from('profiles')
      .select('current_streak, longest_streak, last_active_date')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          const cs = (data as any).current_streak ?? 0
          setStreak({
            currentStreak: cs,
            longestStreak: (data as any).longest_streak ?? 0,
            lastActiveDate: (data as any).last_active_date,
            multiplier: cs >= 30 ? 3 : cs >= 7 ? 2 : 1,
          })
        }
      })
  }, [userId, supabase])

  const recordActivity = useCallback(async () => {
    if (!userId) return
    const today = new Date().toISOString().slice(0, 10)

    // If already recorded today, skip
    if (streak.lastActiveDate === today) return

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    let newStreak: number

    if (streak.lastActiveDate === yesterday) {
      // Continue streak
      newStreak = streak.currentStreak + 1
    } else if (!streak.lastActiveDate || streak.lastActiveDate < yesterday) {
      // Streak broken — reset to 1
      newStreak = 1
    } else {
      newStreak = streak.currentStreak
    }

    const newLongest = Math.max(streak.longestStreak, newStreak)
    const multiplier = newStreak >= 30 ? 3 : newStreak >= 7 ? 2 : 1

    await (supabase.from('profiles') as any).update({
      current_streak: newStreak,
      longest_streak: newLongest,
      last_active_date: today,
    }).eq('id', userId)

    setStreak({
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastActiveDate: today,
      multiplier,
    })
  }, [userId, streak, supabase])

  return { ...streak, recordActivity }
}
