import { isToday, isYesterday } from './dateHelpers'

export type TFunction = (key: string, params?: Record<string, string | number>) => string

const LOCALE_MAP: Record<string, string> = {
  fi: 'fi-FI',
  en: 'en-GB',
  sv: 'sv-SE',
}

export function resolveLocale(locale: string): string {
  return LOCALE_MAP[locale] || locale
}

// Cache Intl.DateTimeFormat per (locale + options signature) — creating a
// new formatter on every call is surprisingly expensive on Android (~0.5-2ms
// per instance). Cached here for formatTimeAgo's weekday/numeric paths.
const dtFormatCache = new Map<string, Intl.DateTimeFormat>()
function getDTFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let fmt = dtFormatCache.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, options)
    dtFormatCache.set(key, fmt)
  }
  return fmt
}

/**
 * Apple HIG-style relative time formatting:
 * - < 1 min: "juuri nyt"
 * - < 60 min: "5 min sitten"
 * - Same calendar day (today): "5 t sitten"
 * - Yesterday: "Eilen"
 * - Within last 7 days: short weekday (locale-aware, e.g. "ma")
 * - Same year: "12.3."
 * - Older: "12.3.2025"
 *
 * Uses isToday/isYesterday from dateHelpers.ts and cached Intl.DateTimeFormat
 * for performance in feed lists (50+ items).
 */
export function formatTimeAgo(dateStr: string, t: TFunction, locale: string): string {
  if (!dateStr) return ''
  const now = new Date()
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 0) return t('time.justNow') // future dates
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)

  if (diffSec < 60) return t('time.justNow')
  if (diffMin < 60) return t('time.minutesAgo', { count: diffMin })

  // Today: relative hour count
  if (isToday(dateStr)) {
    return diffHour === 1 ? t('time.oneHourAgo') : t('time.hoursAgo', { count: diffHour })
  }

  // Yesterday
  if (isYesterday(dateStr)) return t('common.yesterday')

  // Within last 6 days: short weekday (ma, ti, ke...).
  // Note: 7-day window is avoided because if now=Mon 02:00 and the date is
  // last Mon 23:00, diffDay=6 and they share the same weekday — showing "ma"
  // would look like "today" to the user. The 6-day cutoff guarantees a
  // different weekday label than the current day.
  const resolvedLocale = resolveLocale(locale)
  const diffDay = Math.floor(diffMs / 86400000)
  if (diffDay < 6) {
    return getDTFormat(resolvedLocale, { weekday: 'short' }).format(date)
  }

  // Same year: 12.3.
  if (date.getFullYear() === now.getFullYear()) {
    return getDTFormat(resolvedLocale, { day: 'numeric', month: 'numeric' }).format(date)
  }

  // Older: include year
  return getDTFormat(resolvedLocale, { day: 'numeric', month: 'numeric', year: 'numeric' }).format(date)
}

export function formatPrice(amount: number | null | undefined, locale = 'fi'): string {
  if (amount == null || typeof amount !== 'number' || !isFinite(amount)) return '\u2013'
  return amount.toLocaleString(resolveLocale(locale), {
    style: 'currency',
    currency: 'EUR',
  })
}

export function formatEventDate(dateStr: string, locale = 'fi'): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString(resolveLocale(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatEventDateShort(dateStr: string, locale = 'fi'): string {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString(resolveLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  })
}

export function formatDateHeader(dateStr: string, locale: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString(resolveLocale(locale), {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export function formatDateRange(start: string, end: string, locale: string): string {
  if (!start || !end) return '\u2013'
  const startDate = new Date(start)
  const endDate = new Date(end)
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return '\u2013'
  const localeStr = resolveLocale(locale)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const s = startDate.toLocaleDateString(localeStr, opts)
  const e = endDate.toLocaleDateString(localeStr, opts)
  return `${s} \u2014 ${e}`
}
