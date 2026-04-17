/**
 * i18n Integrity Tests
 *
 * Validates that all three locale files (fi, en, sv) are consistent:
 * - Same top-level keys
 * - Same nested keys (deep comparison)
 * - No empty string values
 * - No obvious copy-paste errors (duplicate values within a namespace)
 * - All interpolation placeholders present in all locales
 * - Boost translations exist in all locales
 */

// Mock react-native modules before any imports
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

import fi from '../src/lib/i18n/fi.json'
import en from '../src/lib/i18n/en.json'
import sv from '../src/lib/i18n/sv.json'

type TranslationValue = string | Record<string, string | Record<string, string>>
type TranslationFile = Record<string, Record<string, TranslationValue>>

const locales: Record<string, TranslationFile> = { fi, en, sv }
const localeNames = Object.keys(locales)

// ── Helpers ──────────────────────────────────────────

/** Recursively collect all keys in dot notation */
function getDeepKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const value = obj[key]
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getDeepKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys.sort()
}

/** Extract interpolation placeholders like {{count}}, {{name}}, {area} */
function getPlaceholders(str: string): string[] {
  const doubleMatch = str.match(/\{\{(\w+)\}\}/g) || []
  const singleMatch = str.match(/\{(\w+)\}/g) || []
  return [...doubleMatch, ...singleMatch].sort()
}

/** Recursively collect all leaf string values grouped by namespace */
function getValuesByNamespace(obj: Record<string, unknown>, prefix = ''): Map<string, string[]> {
  const result = new Map<string, string[]>()
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const namespace = prefix ? `${prefix}.${key}` : key
      const nested = getValuesByNamespace(value as Record<string, unknown>, namespace)
      for (const [ns, vals] of nested) {
        if (!result.has(ns)) result.set(ns, [])
        result.get(ns)!.push(...vals)
      }
    } else if (typeof value === 'string') {
      const namespace = prefix || '(root)'
      if (!result.has(namespace)) result.set(namespace, [])
      result.get(namespace)!.push(value)
    }
  }
  return result
}

/** Get a nested value by dot path */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

// ══════════════════════════════════════════════════════
// Top-Level Key Consistency
// ══════════════════════════════════════════════════════

describe('i18n: top-level key consistency', () => {
  const fiTopKeys = Object.keys(fi).sort()
  const enTopKeys = Object.keys(en).sort()
  const svTopKeys = Object.keys(sv).sort()

  test('fi and en have the same top-level keys', () => {
    expect(fiTopKeys).toEqual(enTopKeys)
  })

  test('fi and sv have the same top-level keys', () => {
    expect(fiTopKeys).toEqual(svTopKeys)
  })

  test('all three locales have at least 10 top-level namespaces', () => {
    expect(fiTopKeys.length).toBeGreaterThanOrEqual(10)
  })
})

// ══════════════════════════════════════════════════════
// Deep Key Consistency
// ══════════════════════════════════════════════════════

describe('i18n: deep key consistency (all nested keys match)', () => {
  const fiKeys = getDeepKeys(fi as unknown as Record<string, unknown>)
  const enKeys = getDeepKeys(en as unknown as Record<string, unknown>)
  const svKeys = getDeepKeys(sv as unknown as Record<string, unknown>)

  test('fi and en have the same full key set', () => {
    const fiOnly = fiKeys.filter(k => !enKeys.includes(k))
    const enOnly = enKeys.filter(k => !fiKeys.includes(k))
    expect(fiOnly).toEqual([])
    expect(enOnly).toEqual([])
  })

  test('fi and sv have the same full key set (allowing small gaps for MVP)', () => {
    const fiOnly = fiKeys.filter(k => !svKeys.includes(k))
    const svOnly = svKeys.filter(k => !fiKeys.includes(k))
    // Allow up to 5% missing keys in sv (secondary locale, may lag behind)
    const maxGap = Math.ceil(fiKeys.length * 0.05)
    expect(fiOnly.length).toBeLessThanOrEqual(maxGap)
    expect(svOnly).toEqual([])
  })

  test('key count is consistent across primary locales (fi/en)', () => {
    expect(fiKeys.length).toBe(enKeys.length)
    // sv may lag slightly behind — within 5%
    expect(svKeys.length).toBeGreaterThan(fiKeys.length * 0.95)
  })
})

// ══════════════════════════════════════════════════════
// No Empty String Values
// ══════════════════════════════════════════════════════

describe('i18n: no empty string values', () => {
  for (const [localeName, locale] of Object.entries(locales)) {
    test(`${localeName} has no empty string values`, () => {
      const keys = getDeepKeys(locale as unknown as Record<string, unknown>)
      const emptyKeys: string[] = []
      for (const key of keys) {
        const value = getByPath(locale as unknown as Record<string, unknown>, key)
        if (typeof value === 'string' && value.trim() === '') {
          emptyKeys.push(key)
        }
      }
      expect(emptyKeys).toEqual([])
    })
  }
})

// ══════════════════════════════════════════════════════
// No Duplicate Values Within a Namespace (copy-paste detection)
// ══════════════════════════════════════════════════════

describe('i18n: no suspicious duplicate values within a namespace', () => {
  for (const [localeName, locale] of Object.entries(locales)) {
    test(`${localeName} has no namespaces with >50% duplicate values`, () => {
      const valuesByNs = getValuesByNamespace(locale as unknown as Record<string, unknown>)
      const suspiciousNamespaces: string[] = []

      for (const [ns, values] of valuesByNs) {
        // Skip tiny namespaces where duplicates are natural (e.g., "yes"/"yes")
        if (values.length < 6) continue

        const uniqueValues = new Set(values)
        const dupeRatio = 1 - uniqueValues.size / values.length

        // Flag if more than 50% of values in a namespace are duplicates
        if (dupeRatio > 0.5) {
          suspiciousNamespaces.push(`${ns} (${Math.round(dupeRatio * 100)}% dupes)`)
        }
      }

      expect(suspiciousNamespaces).toEqual([])
    })
  }
})

// ══════════════════════════════════════════════════════
// Interpolation Placeholder Consistency
// ══════════════════════════════════════════════════════

describe('i18n: interpolation placeholders match across locales', () => {
  const fiKeys = getDeepKeys(fi as unknown as Record<string, unknown>)

  test('all placeholders in fi exist in en and sv', () => {
    const mismatches: string[] = []

    for (const key of fiKeys) {
      const fiValue = getByPath(fi as unknown as Record<string, unknown>, key)
      const enValue = getByPath(en as unknown as Record<string, unknown>, key)
      const svValue = getByPath(sv as unknown as Record<string, unknown>, key)

      if (typeof fiValue !== 'string') continue

      const fiPlaceholders = getPlaceholders(fiValue)
      if (fiPlaceholders.length === 0) continue

      if (typeof enValue === 'string') {
        const enPlaceholders = getPlaceholders(enValue)
        if (JSON.stringify(fiPlaceholders) !== JSON.stringify(enPlaceholders)) {
          mismatches.push(`${key}: fi=${fiPlaceholders.join(',')} en=${enPlaceholders.join(',')}`)
        }
      }

      if (typeof svValue === 'string') {
        const svPlaceholders = getPlaceholders(svValue)
        if (JSON.stringify(fiPlaceholders) !== JSON.stringify(svPlaceholders)) {
          mismatches.push(`${key}: fi=${fiPlaceholders.join(',')} sv=${svPlaceholders.join(',')}`)
        }
      }
    }

    expect(mismatches).toEqual([])
  })
})

// ══════════════════════════════════════════════════════
// Boost Translations
// ══════════════════════════════════════════════════════

describe('i18n: boost translations exist in all locales', () => {
  test('fi has boost namespace', () => {
    expect(fi).toHaveProperty('boost')
    expect(typeof fi.boost).toBe('object')
  })

  test('en has boost namespace', () => {
    expect(en).toHaveProperty('boost')
    expect(typeof en.boost).toBe('object')
  })

  test('sv has boost namespace', () => {
    expect(sv).toHaveProperty('boost')
    expect(typeof sv.boost).toBe('object')
  })

  const requiredBoostKeys = [
    'title', 'subtitle', 'balance', 'buyBoosts', 'boost1', 'boost3', 'boost5',
    'boostThis', 'boostActive', 'boostSuccess', 'boostFailed', 'noBalance',
    'alreadyBoosted', 'purchaseSuccess', 'purchaseFailed', 'activeBoosts',
    'tierFree', 'tierPro', 'tierBusiness', 'duration',
    'hours24', 'days3', 'days7',
  ]

  for (const key of requiredBoostKeys) {
    test(`boost.${key} exists in all locales`, () => {
      for (const [localeName, locale] of Object.entries(locales)) {
        const boostNs = (locale as Record<string, Record<string, string>>).boost
        expect(boostNs).toHaveProperty(key)
        expect(typeof boostNs[key]).toBe('string')
        expect(boostNs[key].length).toBeGreaterThan(0)
      }
    })
  }

  test('boost namespace has the same keys in all locales', () => {
    const fiBoostKeys = Object.keys(fi.boost).sort()
    const enBoostKeys = Object.keys(en.boost).sort()
    const svBoostKeys = Object.keys(sv.boost).sort()

    expect(fiBoostKeys).toEqual(enBoostKeys)
    expect(fiBoostKeys).toEqual(svBoostKeys)
  })

  test('boost.balance uses {{count}} placeholder in all locales', () => {
    for (const [localeName, locale] of Object.entries(locales)) {
      const balance = (locale as Record<string, Record<string, string>>).boost.balance
      expect(balance).toContain('{{count}}')
    }
  })

  test('boost.purchaseSuccess uses {{count}} placeholder in all locales', () => {
    for (const [localeName, locale] of Object.entries(locales)) {
      const purchaseSuccess = (locale as Record<string, Record<string, string>>).boost.purchaseSuccess
      expect(purchaseSuccess).toContain('{{count}}')
    }
  })
})
