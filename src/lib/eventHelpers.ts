import type { CityEvent, CommunityEvent, TableCategory } from './types'
import { TABLE_CATEGORIES } from './constants'

export function getCityEventName(event: CityEvent, locale: string): string {
  if (locale === 'en' && event.name_en) return event.name_en
  if (locale === 'sv' && event.name_sv) return event.name_sv
  return event.name_fi
}

/** Check if event is a quick "table" event */
export function isTableEvent(event: CommunityEvent): boolean {
  return event.event_type === 'table'
}

/** Check if event/table has already ended (timezone-safe — compares at end of day local time) */
export function isExpiredEvent(event: CommunityEvent): boolean {
  const endDate = new Date(event.event_end_date ?? event.event_date)
  // If date has no time component (T00:00:00Z), consider expired at end of that day in local timezone
  const endStr = event.event_end_date ?? event.event_date
  if (endStr && !endStr.includes('T')) {
    // Date-only string: set to end of day local time
    endDate.setHours(23, 59, 59, 999)
  }
  return endDate < new Date()
}

/** Get table category emoji */
export function getTableCategoryEmoji(category: string): string {
  return TABLE_CATEGORIES[category as TableCategory]?.emoji ?? '📌'
}

/** Get table category color */
export function getTableCategoryColor(category: string): string {
  return TABLE_CATEGORIES[category as TableCategory]?.color ?? '#6B7280'
}

/**
 * Get human-readable time remaining until event starts, or "in progress" / "expired".
 * Returns e.g. "45 min", "2 h", "Tomorrow 15:00"
 */
export function getTableTimeRemaining(event: CommunityEvent, t: (key: string, params?: Record<string, any>) => string): string {
  const now = new Date()
  const start = new Date(event.event_date)
  const diffMs = start.getTime() - now.getTime()

  if (diffMs <= 0) {
    // Event has started — check if still in progress via event_end_date
    if (event.event_end_date) {
      const end = new Date(event.event_end_date)
      if (end.getTime() > now.getTime()) {
        return t('tables.inProgress') ?? t('tables.expiresIn')
      }
    }
    return t('tables.expired')
  }

  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 60) return `${diffMin} min`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours} h`

  return start.toLocaleDateString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}
