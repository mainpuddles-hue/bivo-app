export type TFunction = (key: string, params?: Record<string, string | number>) => string

const LOCALE_MAP: Record<string, string> = {
  fi: 'fi-FI',
  en: 'en-GB',
  sv: 'sv-SE',
}

export function resolveLocale(locale: string): string {
  return LOCALE_MAP[locale] || locale
}

/**
 * Apple HIG-style relative time formatting:
 * - < 1 min: "juuri nyt"
 * - < 60 min: "5 min sitten"
 * - Same calendar day (today): "5 t sitten" (iOS uses relative within today)
 * - Yesterday: "Eilen"
 * - Within last 7 days: weekday name (lokalisoitu, esim. "ma")
 * - Same year: "12.3."
 * - Older: "12.3.2025"
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

  // Calendar day comparison (not just 24h delta)
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const today = startOfDay(now)
  const dateDay = startOfDay(date)
  const diffDay = Math.round((today.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24))

  // Recent (today): relative
  if (diffSec < 60) return t('time.justNow')
  if (diffMin < 60) return t('time.minutesAgo', { count: diffMin })
  if (diffDay === 0) {
    return diffHour === 1 ? t('time.oneHourAgo') : t('time.hoursAgo', { count: diffHour })
  }

  // Yesterday
  if (diffDay === 1) return t('common.yesterday') ?? 'Eilen'

  // Within last 7 days: short weekday (ma, ti, ke...)
  if (diffDay < 7) {
    return date.toLocaleDateString(resolveLocale(locale), { weekday: 'short' })
  }

  // Same year: 12.3. (Finnish-style short date)
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(resolveLocale(locale), {
      day: 'numeric',
      month: 'numeric',
    })
  }

  // Older: include year
  return date.toLocaleDateString(resolveLocale(locale), {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
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
