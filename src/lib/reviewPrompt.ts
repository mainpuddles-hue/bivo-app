import { Platform } from 'react-native'
import * as StoreReview from 'expo-store-review'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { STORAGE_KEYS } from './storageKeys'

/**
 * Smart App Store / Google Play review prompt.
 *
 * Rules (Apple & Google guidelines):
 * - Max 3 prompts per year
 * - Only after meaningful actions (post created, 5th login, etc.)
 * - At least 14 days between prompts
 * - Never on first session
 *
 * Usage:
 *   import { maybeRequestReview } from '@/lib/reviewPrompt'
 *   await maybeRequestReview('post_created')
 */

const MIN_DAYS_BETWEEN = 14
const MAX_PROMPTS_PER_YEAR = 3

// Actions that qualify for review prompt
const QUALIFYING_ACTIONS = new Set([
  'post_created',       // Just created content
  'fifth_app_open',     // 5th time opening the app
  'first_thanks',       // First thanks received
  'booking_completed',  // Completed a transaction
])

export async function maybeRequestReview(action: string): Promise<void> {
  if (Platform.OS === 'web') return
  if (!QUALIFYING_ACTIONS.has(action)) return

  try {
    const isAvailable = await StoreReview.isAvailableAsync()
    if (!isAvailable) return

    const lastPromptStr = await AsyncStorage.getItem(STORAGE_KEYS.REVIEW_LAST_PROMPT)
    const promptCountStr = await AsyncStorage.getItem(STORAGE_KEYS.REVIEW_PROMPT_COUNT)
    const yearStartStr = await AsyncStorage.getItem(STORAGE_KEYS.REVIEW_YEAR_START)

    const now = Date.now()
    const lastPrompt = lastPromptStr ? parseInt(lastPromptStr, 10) : 0
    let promptCount = promptCountStr ? parseInt(promptCountStr, 10) : 0
    const yearStart = yearStartStr ? parseInt(yearStartStr, 10) : now

    // Reset yearly counter
    const oneYear = 365 * 24 * 60 * 60 * 1000
    if (now - yearStart > oneYear) {
      promptCount = 0
      await AsyncStorage.setItem(STORAGE_KEYS.REVIEW_YEAR_START, String(now))
    }

    // Check limits
    if (promptCount >= MAX_PROMPTS_PER_YEAR) return
    if (lastPrompt > 0 && now - lastPrompt < MIN_DAYS_BETWEEN * 24 * 60 * 60 * 1000) return

    // Request review
    await StoreReview.requestReview()

    // Track
    await AsyncStorage.setItem(STORAGE_KEYS.REVIEW_LAST_PROMPT, String(now))
    await AsyncStorage.setItem(STORAGE_KEYS.REVIEW_PROMPT_COUNT, String(promptCount + 1))
    if (!yearStartStr) {
      await AsyncStorage.setItem(STORAGE_KEYS.REVIEW_YEAR_START, String(now))
    }
  } catch {
    // Non-critical — never fail on review prompt
  }
}
