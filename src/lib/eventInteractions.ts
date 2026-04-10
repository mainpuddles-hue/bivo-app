declare const __DEV__: boolean

import AsyncStorage from '@react-native-async-storage/async-storage'

const CLICK_HISTORY_KEY = 'event_click_history'
const MAX_INTERACTIONS = 100

export interface EventInteraction {
  eventId: string
  category: string
  timestamp: number
}

/**
 * Track an event click/save. Stores to AsyncStorage, keeping last 100 interactions max.
 */
export async function trackEventClick(eventId: string, category: string): Promise<void> {
  try {
    const history = await getClickHistory()
    const entry: EventInteraction = { eventId, category, timestamp: Date.now() }
    history.push(entry)

    // Keep only the most recent MAX_INTERACTIONS entries
    const trimmed = history.length > MAX_INTERACTIONS
      ? history.slice(history.length - MAX_INTERACTIONS)
      : history

    await AsyncStorage.setItem(CLICK_HISTORY_KEY, JSON.stringify(trimmed))
  } catch {
    if (__DEV__) console.warn('[eventInteractions] Failed to track event click')
  }
}

/**
 * Get the full click history from AsyncStorage.
 */
export async function getClickHistory(): Promise<EventInteraction[]> {
  try {
    const raw = await AsyncStorage.getItem(CLICK_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as EventInteraction[]
  } catch {
    return []
  }
}

/**
 * Get the set of categories the user has interacted with in the last N days.
 * Used by the diversity bonus to identify "stale" categories.
 */
export function getRecentCategories(history: EventInteraction[], daysBack: number = 14): Set<string> {
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000
  const recent = new Set<string>()
  for (const entry of history) {
    if (entry.timestamp >= cutoff) {
      recent.add(entry.category)
    }
  }
  return recent
}
