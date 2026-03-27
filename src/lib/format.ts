export type TFunction = (key: string, params?: Record<string, string | number>) => string

const LOCALE_MAP: Record<string, string> = {
  fi: 'fi-FI',
  en: 'en-GB',
  sv: 'sv-SE',
}

export function resolveLocale(locale: string): string {
  return LOCALE_MAP[locale] || locale
}

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
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)

  if (diffSec < 60) return t('time.justNow')
  if (diffMin < 60) return t('time.minutesAgo', { count: diffMin })
  if (diffHour < 24) {
    return diffHour === 1 ? t('time.oneHourAgo') : t('time.hoursAgo', { count: diffHour })
  }
  if (diffDay < 7) {
    return diffDay === 1 ? t('time.oneDayAgo') : t('time.daysAgo', { count: diffDay })
  }
  if (diffWeek < 5) {
    return diffWeek === 1 ? t('time.oneWeekAgo') : t('time.weeksAgo', { count: diffWeek })
  }

  return date.toLocaleDateString(resolveLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
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
