import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@/lib/supabase/client'

type AnalyticsEvent =
  | 'app_opened'
  | 'post_created' | 'post_viewed' | 'post_liked' | 'post_saved'
  | 'message_sent' | 'booking_created' | 'payment_completed'
  | 'search_performed' | 'profile_viewed'
  | 'group_joined' | 'forum_posted'
  | 'notification_opened' | 'referral_shared'
  | 'retention_d1' | 'retention_d7' | 'retention_d30' | 'retention_d90'
  | 'onboarding_slide' | 'onboarding_city_selected' | 'onboarding_neighborhood_selected'
  | 'onboarding_invite_code' | 'onboarding_completed'
  | 'auth_register_start' | 'auth_register_success' | 'auth_login_success'
  | 'boost_purchased' | 'boost_used' | 'boost_screen_viewed'

interface EventProps {
  [key: string]: string | number | boolean | null
}

let _userId: string | null = null

export function setAnalyticsUser(userId: string | null) {
  _userId = userId
}

/**
 * Track an analytics event. Fire-and-forget — never blocks UI.
 * Events stored in Supabase `analytics_events` table.
 */
export function trackEvent(event: AnalyticsEvent, props?: EventProps) {
  if (!_userId) return

  const supabase = createClient()
  const payload = {
    user_id: _userId,
    event,
    properties: props ?? {},
    created_at: new Date().toISOString(),
  }
  ;(supabase.from('analytics_events') as any).insert(payload)
    .then(() => {})
    .catch(() => {
      // Queue locally for retry on next app launch
      AsyncStorage.getItem('analytics_queue').then(raw => {
        const queue = raw ? JSON.parse(raw) : []
        queue.push(payload)
        // Keep max 100 events to avoid unbounded storage
        AsyncStorage.setItem('analytics_queue', JSON.stringify(queue.slice(-100))).catch(() => {})
      }).catch(() => {})
    })
}

/** Flush queued analytics events (call on app start after auth) */
export async function flushAnalyticsQueue() {
  try {
    const raw = await AsyncStorage.getItem('analytics_queue')
    if (!raw) return
    const queue = JSON.parse(raw)
    if (!queue.length) return
    const supabase = createClient()
    await (supabase.from('analytics_events') as any).insert(queue)
    await AsyncStorage.removeItem('analytics_queue')
  } catch {} // Best effort
}

const RETENTION_TRACKED_KEY = 'tackbird_retention_last_tracked'

/**
 * Track D1/D7/D30/D90 retention events.
 * Call once per day after auth resolves. Uses AsyncStorage to avoid duplicate tracking.
 */
export async function trackRetention(userId: string) {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const lastTracked = await AsyncStorage.getItem(RETENTION_TRACKED_KEY)
    if (lastTracked === today) return // Already tracked today

    const supabase = createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('created_at')
      .eq('id', userId)
      .single()

    if (!(profile as any)?.created_at) return

    const regDate = new Date((profile as any).created_at)
    const daysSinceReg = Math.floor((Date.now() - regDate.getTime()) / 86400000)

    if (daysSinceReg === 1) trackEvent('retention_d1')
    else if (daysSinceReg === 7) trackEvent('retention_d7')
    else if (daysSinceReg === 30) trackEvent('retention_d30')
    else if (daysSinceReg === 90) trackEvent('retention_d90')

    await AsyncStorage.setItem(RETENTION_TRACKED_KEY, today)
  } catch {
    // Non-critical — ignore
  }
}
