declare const __DEV__: boolean

import AsyncStorage from '@react-native-async-storage/async-storage'

interface RateLimitConfig {
  maxActions: number
  windowMs: number  // time window in milliseconds
}

const LIMITS: Record<string, RateLimitConfig> = {
  post_create: { maxActions: 5, windowMs: 3600000 },      // 5 posts per hour
  comment: { maxActions: 20, windowMs: 3600000 },          // 20 comments per hour
  message: { maxActions: 50, windowMs: 3600000 },          // 50 messages per hour
  like: { maxActions: 100, windowMs: 3600000 },             // 100 likes per hour
  report: { maxActions: 10, windowMs: 3600000 },            // 10 reports per hour
  forum_post: { maxActions: 5, windowMs: 3600000 },         // 5 forum posts per hour
  group_post: { maxActions: 10, windowMs: 3600000 },        // 10 group posts per hour
  search: { maxActions: 30, windowMs: 60000 },              // 30 searches per minute
  'event-chat-send': { maxActions: 50, windowMs: 3600000 }, // 50 event chat messages per hour
}

const storageKey = (action: string) => `rate_limit_${action}`

async function readTimestamps(action: string, now: number, windowMs: number): Promise<number[]> {
  const stored = await AsyncStorage.getItem(storageKey(action))
  const timestamps: number[] = stored ? JSON.parse(stored) : []
  return timestamps.filter(t => now - t < windowMs)
}

/**
 * Read-only check: are we under the rate limit for this action right now?
 * Does NOT mutate the counter — call `recordRateLimit(action)` only after the
 * action actually succeeds, so failed attempts (network error, RLS denial,
 * validation failure) don't burn slots and lock the user out for an hour.
 *
 * In `__DEV__` we always return true. The limiter exists to slow down abuse
 * in production, but in dev it just locks the developer out after a handful
 * of debugging retries — the kind of cycle this refactor was trying to fix
 * in the first place.
 */
export async function checkRateLimit(action: string): Promise<boolean> {
  if (__DEV__) return true
  const config = LIMITS[action]
  if (!config) return true // No limit configured

  try {
    const valid = await readTimestamps(action, Date.now(), config.windowMs)
    return valid.length < config.maxActions
  } catch (err) {
    if (__DEV__) console.warn('[rateLimiter] checkRateLimit error:', err)
    return true // Allow on error — don't block users due to rate limiter bugs
  }
}

/**
 * Record that the action just succeeded. Append a timestamp to the action's
 * sliding window. Call this only after the mutation succeeded server-side.
 */
export async function recordRateLimit(action: string): Promise<void> {
  const config = LIMITS[action]
  if (!config) return

  try {
    const now = Date.now()
    const valid = await readTimestamps(action, now, config.windowMs)
    valid.push(now)
    await AsyncStorage.setItem(storageKey(action), JSON.stringify(valid))
  } catch (err) {
    if (__DEV__) console.warn('[rateLimiter] recordRateLimit error:', err)
  }
}

/**
 * Reset the action's counter. Useful in dev when a string of failed attempts
 * (each one a slot) has artificially locked the user out, and also exposed as
 * a recovery hook for screens that want to surface a "try again" affordance.
 */
export async function clearRateLimit(action: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(action))
  } catch (err) {
    if (__DEV__) console.warn('[rateLimiter] clearRateLimit error:', err)
  }
}

/**
 * Returns a locale-aware rate limit message.
 * Pass the t() function from useI18n() for localized text.
 * Falls back to English if t is not provided.
 */
export function getRateLimitMessage(action: string, t?: (key: string, params?: Record<string, string | number>) => string): string {
  const config = LIMITS[action]
  if (!config) return ''
  const minutes = Math.ceil(config.windowMs / 60000)
  if (t) {
    return t('common.rateLimitExceeded', { max: config.maxActions, minutes })
  }
  return `Too many actions. Wait a moment and try again. (Max ${config.maxActions}/${minutes}min)`
}
