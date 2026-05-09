declare const __DEV__: boolean

import AsyncStorage from '@react-native-async-storage/async-storage'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { clearAuthCache } from '@/lib/authCache'
import { createClient } from '@/lib/supabase/client'

/**
 * Keys whose value belongs to the *previous user* and would leak content to
 * the next user signing in on the same device. Drafts contain user-typed
 * post bodies and uploaded photo URIs; the push token routes the previous
 * user's notifications to whoever logs in next; cached feed / hidden post
 * lists encode what the previous user saw and engaged with.
 *
 * Keys NOT in this list are intentional device-scoped preferences that
 * should survive sign-out: theme, locale, language auto-detection,
 * unsupported-area dismissal, the feature-flag cache (flags aren't
 * per-user), and review-prompt counters (review fatigue is per-device).
 */
const USER_SCOPED_KEYS: readonly string[] = [
  STORAGE_KEYS.PUSH_TOKEN,
  STORAGE_KEYS.ONBOARDING_COMPLETE,
  STORAGE_KEYS.NOTIFICATION_PREFS_CACHE,
  STORAGE_KEYS.FEED_CACHE,
  STORAGE_KEYS.HIDDEN_POSTS,
  STORAGE_KEYS.PINNED_CONVERSATIONS,
  STORAGE_KEYS.DIGEST_DISMISSED,
  STORAGE_KEYS.WELCOME_TOAST_SHOWN,
  STORAGE_KEYS.POST_DRAFT,
  STORAGE_KEYS.STREAK_CACHE,
  STORAGE_KEYS.RETENTION_TRACKED,
  STORAGE_KEYS.SEARCH_HISTORY,
  STORAGE_KEYS.SAVED_SEARCHES,
  STORAGE_KEYS.ONBOARDING_FUNNEL,
] as const

/**
 * Clear every per-user piece of state from the device on sign-out:
 *  - in-memory auth cache
 *  - all user-scoped AsyncStorage keys
 *  - all rate-limit counters (`rate_limit_*` prefix)
 *  - every active Realtime channel (so the freshly-issued anon token
 *    isn't silently used to keep the previous user's channels alive)
 *
 * Failures are logged in dev only — sign-out should never block on
 * cleanup. Call this from the SIGNED_OUT auth event handler.
 */
export async function clearUserScopedState(): Promise<void> {
  clearAuthCache()

  try {
    const allKeys = await AsyncStorage.getAllKeys()
    const rateLimitKeys = allKeys.filter(k => k.startsWith(STORAGE_KEYS.RATE_LIMIT_PREFIX))
    const toRemove = [...USER_SCOPED_KEYS, ...rateLimitKeys]
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove)
    }
  } catch (e) {
    if (__DEV__) console.warn('[auth-cleanup] AsyncStorage clear failed:', (e as Error)?.message ?? e)
  }

  try {
    const client = createClient()
    const channels = client.getChannels()
    for (const ch of channels) {
      await client.removeChannel(ch).catch(() => {})
    }
  } catch (e) {
    if (__DEV__) console.warn('[auth-cleanup] realtime channel teardown failed:', (e as Error)?.message ?? e)
  }
}
