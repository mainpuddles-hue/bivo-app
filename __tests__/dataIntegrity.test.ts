/**
 * Data Model Integrity Tests
 *
 * Validates that core data constants are consistent and well-formed:
 * - PostType values have matching CATEGORIES entries
 * - CATEGORIES entries have all required fields
 * - Category colors are valid hex codes
 * - NEIGHBORHOODS array is populated
 * - POST_SELECT constant includes required fields
 * - Feature flags are all booleans
 * - BoostTier type aligns with IAP tier calculations
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

import { CATEGORIES, NEIGHBORHOODS, POST_SELECT } from '../src/lib/constants'
import { FEATURES } from '../src/lib/featureFlags'
import { getDiscountedPrice, getBoostDurationHours } from '../src/lib/iap'
import type { PostType, BoostTier } from '../src/lib/types'

// ══════════════════════════════════════════════════════
// PostType <-> CATEGORIES Alignment
// ══════════════════════════════════════════════════════

describe('PostType and CATEGORIES alignment', () => {
  const allPostTypes: PostType[] = ['tarvitsen', 'tarjoan', 'ilmaista', 'lainaa', 'tapahtuma']

  test('every PostType value has a corresponding CATEGORIES entry', () => {
    for (const type of allPostTypes) {
      expect(CATEGORIES).toHaveProperty(type)
    }
  })

  test('CATEGORIES has no extra keys beyond PostType values', () => {
    const categoryKeys = Object.keys(CATEGORIES)
    for (const key of categoryKeys) {
      expect(allPostTypes).toContain(key)
    }
  })

  test('CATEGORIES has exactly 5 entries (one per PostType)', () => {
    expect(Object.keys(CATEGORIES)).toHaveLength(5)
  })
})

// ══════════════════════════════════════════════════════
// CATEGORIES Required Fields
// ══════════════════════════════════════════════════════

describe('CATEGORIES required fields', () => {
  const requiredFields = ['label', 'subtitle', 'icon', 'color', 'bgLight', 'bgDark'] as const

  for (const [type, category] of Object.entries(CATEGORIES)) {
    for (const field of requiredFields) {
      test(`${type} has required field: ${field}`, () => {
        expect(category).toHaveProperty(field)
        expect(typeof category[field]).toBe('string')
        expect(category[field].length).toBeGreaterThan(0)
      })
    }
  }
})

// ══════════════════════════════════════════════════════
// Category Colors
// ══════════════════════════════════════════════════════

describe('Category colors are valid hex', () => {
  const hexPattern = /^#[0-9A-Fa-f]{6}$/

  for (const [type, category] of Object.entries(CATEGORIES)) {
    test(`${type} color is valid hex: ${category.color}`, () => {
      expect(category.color).toMatch(hexPattern)
    })

    test(`${type} bgLight is valid hex: ${category.bgLight}`, () => {
      expect(category.bgLight).toMatch(hexPattern)
    })

    test(`${type} bgDark is valid hex: ${category.bgDark}`, () => {
      expect(category.bgDark).toMatch(hexPattern)
    })
  }

  test('each category has a unique color', () => {
    const colors = Object.values(CATEGORIES).map(c => c.color)
    expect(new Set(colors).size).toBe(colors.length)
  })
})

// ══════════════════════════════════════════════════════
// NEIGHBORHOODS
// ══════════════════════════════════════════════════════

describe('NEIGHBORHOODS array', () => {
  test('is non-empty', () => {
    expect(NEIGHBORHOODS.length).toBeGreaterThan(0)
  })

  test('contains well-known Helsinki neighborhoods', () => {
    expect(NEIGHBORHOODS).toContain('Kallio')
    expect(NEIGHBORHOODS).toContain('Töölö')
    expect(NEIGHBORHOODS).toContain('Kamppi')
  })

  test('all entries are non-empty strings', () => {
    for (const n of NEIGHBORHOODS) {
      expect(typeof n).toBe('string')
      expect(n.length).toBeGreaterThan(0)
    }
  })

  test('no duplicate neighborhoods', () => {
    const unique = new Set(NEIGHBORHOODS)
    expect(unique.size).toBe(NEIGHBORHOODS.length)
  })
})

// ══════════════════════════════════════════════════════
// POST_SELECT
// ══════════════════════════════════════════════════════

describe('POST_SELECT constant', () => {
  test('exists and is a non-empty string', () => {
    expect(typeof POST_SELECT).toBe('string')
    expect(POST_SELECT.length).toBeGreaterThan(0)
  })

  const requiredFields = [
    'id', 'user_id', 'type', 'title', 'description', 'location',
    'image_url', 'is_pro_listing', 'is_active', 'like_count',
    'comment_count', 'created_at', 'updated_at', 'tags',
    'latitude', 'longitude', 'expires_at',
  ]

  for (const field of requiredFields) {
    test(`includes required field: ${field}`, () => {
      expect(POST_SELECT).toContain(field)
    })
  }

  test('includes user relation with profile fields', () => {
    expect(POST_SELECT).toContain('user:profiles')
    expect(POST_SELECT).toContain('name')
    expect(POST_SELECT).toContain('avatar_url')
  })

  test('includes post images relation', () => {
    expect(POST_SELECT).toContain('images:post_images')
  })

  test('includes user_badges for trust level computation', () => {
    expect(POST_SELECT).toContain('user_badges')
    expect(POST_SELECT).toContain('badge_type')
  })

  test('includes urgency fields', () => {
    expect(POST_SELECT).toContain('is_urgent')
    expect(POST_SELECT).toContain('urgency_hours')
  })
})

// ══════════════════════════════════════════════════════
// Feature Flags
// ══════════════════════════════════════════════════════

describe('Feature flags are all booleans', () => {
  test('FEATURES object exists', () => {
    expect(FEATURES).toBeDefined()
    expect(typeof FEATURES).toBe('object')
  })

  for (const [key, value] of Object.entries(FEATURES)) {
    test(`FEATURES.${key} is boolean`, () => {
      expect(typeof value).toBe('boolean')
    })
  }

  test('BOOSTS feature flag exists and is disabled (pivot)', () => {
    expect(FEATURES).toHaveProperty('BOOSTS')
    expect(FEATURES.BOOSTS).toBe(false)
  })

  test('LENDING feature flag exists', () => {
    expect(FEATURES).toHaveProperty('LENDING')
  })

})

// ══════════════════════════════════════════════════════
// BoostTier <-> IAP Tier Calculations
// ══════════════════════════════════════════════════════

describe('BoostTier matches IAP tier calculations', () => {
  const boostTiers: BoostTier[] = ['free', 'pro', 'business']

  test('all three BoostTier values produce valid discounted prices', () => {
    for (const tier of boostTiers) {
      const price = getDiscountedPrice(199, tier)
      expect(price).toBeGreaterThan(0)
      expect(Number.isFinite(price)).toBe(true)
    }
  })

  test('all three BoostTier values produce valid durations', () => {
    for (const tier of boostTiers) {
      const hours = getBoostDurationHours(tier)
      expect(hours).toBeGreaterThan(0)
      expect(Number.isFinite(hours)).toBe(true)
    }
  })

  test('tier hierarchy: free < pro < business for duration', () => {
    expect(getBoostDurationHours('free')).toBeLessThan(getBoostDurationHours('pro'))
    expect(getBoostDurationHours('pro')).toBeLessThan(getBoostDurationHours('business'))
  })

  test('tier hierarchy: free > pro > business for price', () => {
    const base = 799
    expect(getDiscountedPrice(base, 'free')).toBeGreaterThan(getDiscountedPrice(base, 'pro'))
    expect(getDiscountedPrice(base, 'pro')).toBeGreaterThan(getDiscountedPrice(base, 'business'))
  })
})
