/**
 * Map Constants Tests
 *
 * Validates the map layer constants used by the Explore screen:
 * - POST_SUBCATS conditional lainaa based on FEATURES.LENDING
 * - All subcategory entries have required fields (labelKey for i18n)
 * - Layer colors are valid hex
 * - PLACE_TYPES covers all place subcategory types
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

import { FEATURES } from '../src/lib/featureFlags'
import {
  LAYER_COLORS,
  PLACE_TYPES,
  POST_SUBCATS,
  EVENT_SUBCATS,
  PLACE_SUBCATS,
} from '../src/components/map/constants'

// ══════════════════════════════════════════════════════
// POST_SUBCATS and FEATURES.LENDING
// ══════════════════════════════════════════════════════

describe('POST_SUBCATS and FEATURES.LENDING', () => {
  test('when FEATURES.LENDING is false, POST_SUBCATS does not include lainaa', () => {
    if (!FEATURES.LENDING) {
      const lainaaEntry = POST_SUBCATS.find(s => s.key === 'lainaa')
      expect(lainaaEntry).toBeUndefined()
    }
  })

  test('when FEATURES.LENDING is true, POST_SUBCATS includes lainaa', () => {
    if (FEATURES.LENDING) {
      const lainaaEntry = POST_SUBCATS.find(s => s.key === 'lainaa')
      expect(lainaaEntry).toBeDefined()
      expect(lainaaEntry!.labelKey).toBeTruthy()
      expect(lainaaEntry!.color).toBeTruthy()
    }
  })

  test('POST_SUBCATS always includes core post types regardless of flags', () => {
    const coreTypes = ['tarvitsen', 'tarjoan', 'ilmaista', 'nappaa', 'tapahtuma']
    for (const type of coreTypes) {
      const entry = POST_SUBCATS.find(s => s.key === type)
      expect(entry).toBeDefined()
    }
  })

  test('POST_SUBCATS starts with "all" entry (key=null)', () => {
    expect(POST_SUBCATS[0].key).toBeNull()
  })
})

// ══════════════════════════════════════════════════════
// Subcategory Entries: Required Fields (labelKey for i18n)
// ══════════════════════════════════════════════════════

describe('POST_SUBCATS entries have required fields', () => {
  for (const entry of POST_SUBCATS) {
    const name = entry.key ?? 'all'

    test(`${name} has a labelKey`, () => {
      expect(typeof entry.labelKey).toBe('string')
      expect(entry.labelKey.length).toBeGreaterThan(0)
    })

    if (entry.key !== null) {
      test(`${name} has a color`, () => {
        expect(entry).toHaveProperty('color')
        expect(typeof entry.color).toBe('string')
        expect(entry.color!.length).toBeGreaterThan(0)
      })
    }
  }
})

describe('EVENT_SUBCATS entries have required fields', () => {
  for (const entry of EVENT_SUBCATS) {
    const name = entry.key ?? 'all'

    test(`${name} has key and labelKey`, () => {
      expect(entry).toHaveProperty('key')
      expect(typeof entry.labelKey).toBe('string')
      expect(entry.labelKey.length).toBeGreaterThan(0)
    })
  }

  test('EVENT_SUBCATS starts with "all" entry (key=null)', () => {
    expect(EVENT_SUBCATS[0].key).toBeNull()
  })
})

describe('PLACE_SUBCATS entries have required fields', () => {
  for (const entry of PLACE_SUBCATS) {
    const name = entry.key ?? 'all'

    test(`${name} has key and labelKey`, () => {
      expect(entry).toHaveProperty('key')
      expect(typeof entry.labelKey).toBe('string')
      expect(entry.labelKey.length).toBeGreaterThan(0)
    })
  }

  test('PLACE_SUBCATS starts with "all" entry (key=null)', () => {
    expect(PLACE_SUBCATS[0].key).toBeNull()
  })
})

// ══════════════════════════════════════════════════════
// Layer Colors
// ══════════════════════════════════════════════════════

describe('LAYER_COLORS are valid hex', () => {
  const hexPattern = /^#[0-9A-Fa-f]{6}$/

  test('post layer color is valid hex', () => {
    expect(LAYER_COLORS.post).toMatch(hexPattern)
  })

  test('event layer color is valid hex', () => {
    expect(LAYER_COLORS.event).toMatch(hexPattern)
  })

  test('place layer color is valid hex', () => {
    expect(LAYER_COLORS.place).toMatch(hexPattern)
  })

  test('all three layers have unique colors', () => {
    const colors = [LAYER_COLORS.post, LAYER_COLORS.event, LAYER_COLORS.place]
    expect(new Set(colors).size).toBe(3)
  })
})

describe('POST_SUBCATS colors are valid hex', () => {
  const hexPattern = /^#[0-9A-Fa-f]{6}$/

  for (const entry of POST_SUBCATS) {
    if (entry.color) {
      test(`${entry.key ?? 'all'} color ${entry.color} is valid hex`, () => {
        expect(entry.color).toMatch(hexPattern)
      })
    }
  }
})

// ══════════════════════════════════════════════════════
// PLACE_TYPES Coverage
// ══════════════════════════════════════════════════════

describe('PLACE_TYPES covers required place types', () => {
  test('PLACE_TYPES is a non-empty array', () => {
    expect(PLACE_TYPES.length).toBeGreaterThan(0)
  })

  const expectedPlaceTypes = [
    'restaurant', 'cafe', 'bar', 'shop', 'library',
    'health', 'sport', 'culture', 'other',
  ]

  for (const type of expectedPlaceTypes) {
    test(`PLACE_TYPES covers type: ${type}`, () => {
      expect(PLACE_TYPES).toContain(type)
    })
  }

  test('all PLACE_SUBCATS keys (except null) are in PLACE_TYPES', () => {
    const placeSubKeys = PLACE_SUBCATS
      .map(s => s.key)
      .filter((k): k is string => k !== null)

    for (const key of placeSubKeys) {
      expect(PLACE_TYPES).toContain(key)
    }
  })
})
