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

export async function checkRateLimit(action: string): Promise<boolean> {
  const config = LIMITS[action]
  if (!config) return true // No limit configured

  const key = `rate_limit_${action}`
  const now = Date.now()

  try {
    const stored = await AsyncStorage.getItem(key)
    const timestamps: number[] = stored ? JSON.parse(stored) : []

    // Remove expired timestamps
    const valid = timestamps.filter(t => now - t < config.windowMs)

    if (valid.length >= config.maxActions) {
      return false // Rate limited
    }

    valid.push(now)
    await AsyncStorage.setItem(key, JSON.stringify(valid))
    return true
  } catch (err) {
    if (__DEV__) console.warn('[rateLimiter] checkRateLimit error:', err)
    return true // Allow on error — don't block users due to rate limiter bugs
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
