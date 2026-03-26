import { createClient } from '@/lib/supabase/client'

type AnalyticsEvent =
  | 'app_opened'
  | 'post_created' | 'post_viewed' | 'post_liked' | 'post_saved'
  | 'message_sent' | 'booking_created' | 'payment_completed'
  | 'search_performed' | 'profile_viewed'
  | 'group_joined' | 'forum_posted'
  | 'notification_opened' | 'referral_shared'

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
  ;(supabase.from('analytics_events') as any).insert({
    user_id: _userId,
    event,
    properties: props ?? {},
    created_at: new Date().toISOString(),
  }).then(() => {}).catch(() => {}) // Never fail
}
