import type { Notification } from './types'

// Priority tiers — higher = more important
const TYPE_PRIORITY: Record<string, number> = {
  // Urgent / time-sensitive
  urgent_help: 100,
  juuri_nyt: 95,

  // Direct interactions
  new_message: 90,
  booking_confirmed: 85,
  booking_paid: 85,
  service_confirmed: 85,

  // Personal engagement
  thanks_received: 80,
  thanks: 80, // alternate key used by ThanksButton
  review_received: 75,
  forum_reply: 70,

  // Social
  post_comment: 65,
  comment: 65, // alternate key — backward compat
  post_like: 55,
  new_follower: 50,

  // Informational
  event_reminder: 45,
  badge_earned: 40,

  // System
  system: 20,
  marketing: 10,
}

export interface PrioritizedNotification extends Notification {
  priority: number
  isGrouped?: boolean
  groupCount?: number
  groupNames?: string[]
}

/**
 * Score a notification's priority.
 * Unread notifications get a 50-point boost.
 * Recent notifications (< 1h) get a 20-point boost.
 */
function scoreNotification(notif: Notification): number {
  const basePriority = TYPE_PRIORITY[notif.type] ?? 30
  const unreadBoost = notif.is_read ? 0 : 50
  const hoursAgo = (Date.now() - new Date(notif.created_at).getTime()) / 3600000
  const recencyBoost = hoursAgo < 1 ? 20 : hoursAgo < 6 ? 10 : 0
  return basePriority + unreadBoost + recencyBoost
}

/**
 * Group similar notifications (e.g., "3 people liked your post")
 * and sort by priority score.
 */
export function prioritizeNotifications(notifications: Notification[]): PrioritizedNotification[] {
  // Group: same type + same link_id within 24h
  const groups = new Map<string, Notification[]>()

  for (const n of notifications) {
    // Group key: type + link_id (if exists)
    const key = n.link_id ? `${n.type}:${n.link_id}` : `single:${n.id}`
    const existing = groups.get(key)
    if (existing) {
      existing.push(n)
    } else {
      groups.set(key, [n])
    }
  }

  const result: PrioritizedNotification[] = []

  for (const [, group] of groups) {
    if (group.length === 1) {
      result.push({ ...group[0], priority: scoreNotification(group[0]) })
    } else {
      // Use the most recent notification as the representative
      const sorted = [...group].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      const representative = sorted[0]
      // Collect names from from_user for grouped display
      const groupNames = sorted
        .map(n => n.from_user?.name)
        .filter((name): name is string => !!name)
        .filter((name, i, arr) => arr.indexOf(name) === i) // unique names
      result.push({
        ...representative,
        priority: scoreNotification(representative) + Math.min(20, group.length * 5), // bonus for group size
        isGrouped: true,
        groupCount: group.length,
        groupNames,
      })
    }
  }

  // Sort by priority descending
  return result.sort((a, b) => b.priority - a.priority)
}
