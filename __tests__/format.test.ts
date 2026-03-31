/**
 * Format Utility Unit Tests
 *
 * Tests all formatting functions:
 * - resolveLocale() — locale mapping
 * - formatPrice() — EUR currency formatting
 * - formatTimeAgo() — relative time strings
 * - formatDateRange() — date range display
 * - formatEventDate() / formatEventDateShort() / formatDateHeader()
 * - Edge cases: null, undefined, NaN, invalid dates, future dates
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}))

import {
  resolveLocale,
  formatPrice,
  formatTimeAgo,
  formatDateRange,
  formatEventDate,
  formatEventDateShort,
  formatDateHeader,
} from '../src/lib/format'
import type { TFunction } from '../src/lib/format'

// ── Mock translation function ────────────────────────

function createMockT(): TFunction {
  return (key: string, params?: Record<string, string | number>): string => {
    if (params?.count !== undefined) return `${key}:${params.count}`
    return key
  }
}

const t = createMockT()

// ══════════════════════════════════════════════════════
// resolveLocale
// ══════════════════════════════════════════════════════

describe('resolveLocale', () => {
  test('Maps fi to fi-FI', () => {
    expect(resolveLocale('fi')).toBe('fi-FI')
  })

  test('Maps en to en-GB', () => {
    expect(resolveLocale('en')).toBe('en-GB')
  })

  test('Maps sv to sv-SE', () => {
    expect(resolveLocale('sv')).toBe('sv-SE')
  })

  test('Returns unknown locale as-is (passthrough)', () => {
    expect(resolveLocale('de')).toBe('de')
    expect(resolveLocale('ja')).toBe('ja')
    expect(resolveLocale('fr-FR')).toBe('fr-FR')
  })

  test('Returns empty string for empty string input', () => {
    expect(resolveLocale('')).toBe('')
  })
})

// ══════════════════════════════════════════════════════
// formatPrice
// ══════════════════════════════════════════════════════

describe('formatPrice', () => {
  test('Formats a positive number as EUR currency', () => {
    const result = formatPrice(10, 'fi')
    // Should contain "10" and the EUR symbol or "EUR"
    expect(result).toMatch(/10/)
  })

  test('Formats zero as valid currency', () => {
    const result = formatPrice(0, 'fi')
    expect(result).toMatch(/0/)
    expect(result).not.toBe('\u2013')
  })

  test('Formats negative numbers as valid currency', () => {
    const result = formatPrice(-5, 'fi')
    // Negative numbers are valid and should not return dash
    expect(result).not.toBe('\u2013')
    expect(result).toMatch(/5/)
  })

  test('Returns dash for null', () => {
    expect(formatPrice(null)).toBe('\u2013')
  })

  test('Returns dash for undefined', () => {
    expect(formatPrice(undefined)).toBe('\u2013')
  })

  test('Returns dash for NaN', () => {
    expect(formatPrice(NaN)).toBe('\u2013')
  })

  test('Returns dash for Infinity', () => {
    expect(formatPrice(Infinity)).toBe('\u2013')
    expect(formatPrice(-Infinity)).toBe('\u2013')
  })

  test('Returns dash for non-number types', () => {
    expect(formatPrice('abc' as any)).toBe('\u2013')
  })

  test('Defaults to fi locale', () => {
    const result = formatPrice(10)
    expect(typeof result).toBe('string')
    expect(result).not.toBe('\u2013')
  })

  test('Formats with different locales', () => {
    const fi = formatPrice(1234.56, 'fi')
    const en = formatPrice(1234.56, 'en')
    const sv = formatPrice(1234.56, 'sv')

    // All should be valid non-dash strings
    expect(fi).not.toBe('\u2013')
    expect(en).not.toBe('\u2013')
    expect(sv).not.toBe('\u2013')
  })

  test('Handles large numbers', () => {
    const result = formatPrice(999999.99, 'fi')
    expect(result).not.toBe('\u2013')
    expect(result).toMatch(/999/)
  })

  test('Handles very small decimals', () => {
    const result = formatPrice(0.01, 'fi')
    expect(result).not.toBe('\u2013')
  })
})

// ══════════════════════════════════════════════════════
// formatTimeAgo
// ══════════════════════════════════════════════════════

describe('formatTimeAgo', () => {
  test('Returns empty string for empty input', () => {
    expect(formatTimeAgo('', t, 'fi')).toBe('')
  })

  test('Returns original string for invalid date', () => {
    expect(formatTimeAgo('not-a-date', t, 'fi')).toBe('not-a-date')
  })

  test('Returns time.justNow for a date just seconds ago', () => {
    const tenSecondsAgo = new Date(Date.now() - 10000).toISOString()
    expect(formatTimeAgo(tenSecondsAgo, t, 'fi')).toBe('time.justNow')
  })

  test('Returns minutesAgo for dates 1-59 minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString()
    expect(formatTimeAgo(fiveMinAgo, t, 'fi')).toBe('time.minutesAgo:5')
  })

  test('Returns oneHourAgo for exactly 1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
    expect(formatTimeAgo(oneHourAgo, t, 'fi')).toBe('time.oneHourAgo')
  })

  test('Returns hoursAgo for 2-23 hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000).toISOString()
    expect(formatTimeAgo(threeHoursAgo, t, 'fi')).toBe('time.hoursAgo:3')
  })

  test('Returns oneDayAgo for exactly 1 day ago', () => {
    const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString()
    expect(formatTimeAgo(oneDayAgo, t, 'fi')).toBe('time.oneDayAgo')
  })

  test('Returns daysAgo for 2-6 days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600000).toISOString()
    expect(formatTimeAgo(threeDaysAgo, t, 'fi')).toBe('time.daysAgo:3')
  })

  test('Returns oneWeekAgo for exactly 1 week ago', () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 3600000).toISOString()
    expect(formatTimeAgo(oneWeekAgo, t, 'fi')).toBe('time.oneWeekAgo')
  })

  test('Returns weeksAgo for 2-4 weeks ago', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 3600000).toISOString()
    expect(formatTimeAgo(twoWeeksAgo, t, 'fi')).toBe('time.weeksAgo:2')
  })

  test('Returns formatted date for dates older than 5 weeks', () => {
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 3600000).toISOString()
    const result = formatTimeAgo(twoMonthsAgo, t, 'fi')
    // Should be a localized date string, not a translation key
    expect(result).not.toMatch(/^time\./)
  })

  test('Returns time.justNow for future dates', () => {
    const future = new Date(Date.now() + 3600000).toISOString()
    expect(formatTimeAgo(future, t, 'fi')).toBe('time.justNow')
  })
})

// ══════════════════════════════════════════════════════
// formatDateRange
// ══════════════════════════════════════════════════════

describe('formatDateRange', () => {
  test('Returns dash for empty start', () => {
    expect(formatDateRange('', '2024-06-15', 'fi')).toBe('\u2013')
  })

  test('Returns dash for empty end', () => {
    expect(formatDateRange('2024-06-10', '', 'fi')).toBe('\u2013')
  })

  test('Returns dash for invalid start date', () => {
    expect(formatDateRange('invalid', '2024-06-15', 'fi')).toBe('\u2013')
  })

  test('Returns dash for invalid end date', () => {
    expect(formatDateRange('2024-06-10', 'invalid', 'fi')).toBe('\u2013')
  })

  test('Formats same-day range', () => {
    const result = formatDateRange('2024-06-15T10:00:00Z', '2024-06-15T18:00:00Z', 'fi')
    expect(result).toContain('\u2014') // em dash separator
    expect(typeof result).toBe('string')
  })

  test('Formats multi-day range', () => {
    const result = formatDateRange('2024-06-10T10:00:00Z', '2024-06-15T18:00:00Z', 'fi')
    expect(result).toContain('\u2014') // em dash separator
  })

  test('Formats range across different months', () => {
    const result = formatDateRange('2024-05-28T10:00:00Z', '2024-06-15T18:00:00Z', 'fi')
    expect(result).toContain('\u2014')
    expect(typeof result).toBe('string')
  })

  test('Works with all supported locales', () => {
    for (const locale of ['fi', 'en', 'sv']) {
      const result = formatDateRange('2024-06-10', '2024-06-15', locale)
      expect(result).toContain('\u2014')
    }
  })
})

// ══════════════════════════════════════════════════════
// formatEventDate
// ══════════════════════════════════════════════════════

describe('formatEventDate', () => {
  test('Returns formatted date string', () => {
    const result = formatEventDate('2024-06-15T10:00:00Z', 'fi')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  test('Returns original string for invalid date', () => {
    expect(formatEventDate('not-a-date', 'fi')).toBe('not-a-date')
  })

  test('Defaults to fi locale', () => {
    const result = formatEventDate('2024-06-15T10:00:00Z')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════
// formatEventDateShort
// ══════════════════════════════════════════════════════

describe('formatEventDateShort', () => {
  test('Returns short date string', () => {
    const result = formatEventDateShort('2024-06-15T10:00:00Z', 'fi')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  test('Returns original string for invalid date', () => {
    expect(formatEventDateShort('invalid', 'en')).toBe('invalid')
  })

  test('Short format is shorter than full format', () => {
    const full = formatEventDate('2024-06-15T10:00:00Z', 'fi')
    const short = formatEventDateShort('2024-06-15T10:00:00Z', 'fi')
    expect(short.length).toBeLessThanOrEqual(full.length)
  })
})

// ══════════════════════════════════════════════════════
// formatDateHeader
// ══════════════════════════════════════════════════════

describe('formatDateHeader', () => {
  test('Returns empty string for empty input', () => {
    expect(formatDateHeader('', 'fi')).toBe('')
  })

  test('Returns original string for invalid date', () => {
    expect(formatDateHeader('not-a-date', 'fi')).toBe('not-a-date')
  })

  test('Returns formatted date header for valid date', () => {
    const result = formatDateHeader('2024-06-15T10:00:00Z', 'fi')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  test('Works across all locales', () => {
    for (const locale of ['fi', 'en', 'sv']) {
      const result = formatDateHeader('2024-06-15T10:00:00Z', locale)
      expect(result).not.toBe('')
      expect(result).not.toBe('2024-06-15T10:00:00Z')
    }
  })
})
