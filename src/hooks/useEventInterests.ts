import { useState, useEffect, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { EVENT_CATEGORIES, type EventCategory } from '@/lib/eventAlgorithm'

const STORAGE_KEY = 'event_interests'

/**
 * Hook to manage user event interest categories.
 * Persists to AsyncStorage under key 'event_interests'.
 *
 * Returns:
 * - interests: string[] — currently selected categories
 * - toggleInterest(cat) — add or remove a category
 * - hasInterest(cat) — check if a category is selected
 * - loading — true until initial load completes
 * - categories — all available event categories
 */
export function useEventInterests() {
  const [interests, setInterests] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Load from AsyncStorage on mount
  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY)
        if (raw && mounted) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            setInterests(parsed.filter((v: unknown) => typeof v === 'string'))
          }
        }
      } catch {
        // Ignore load errors — start with empty interests
      }
      if (mounted) setLoading(false)
    }

    load()
    return () => { mounted = false }
  }, [])

  const toggleInterest = useCallback(async (category: string) => {
    setInterests((prev) => {
      const next = prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]

      // Persist asynchronously — fire and forget
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {})
      return next
    })
  }, [])

  const hasInterest = useCallback(
    (category: string): boolean => interests.includes(category),
    [interests],
  )

  return {
    interests,
    toggleInterest,
    hasInterest,
    loading,
    categories: EVENT_CATEGORIES as readonly EventCategory[],
  }
}
