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

export function getRateLimitMessage(action: string): string {
  const config = LIMITS[action]
  if (!config) return ''
  const minutes = Math.ceil(config.windowMs / 60000)
  return `Liian monta toimintoa. Odota hetki ja yrit\u00e4 uudelleen. (Max ${config.maxActions}/${minutes}min)`
}
