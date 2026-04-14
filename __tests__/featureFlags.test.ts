/**
 * Feature Flags — Comprehensive Tests
 *
 * Tests the FEATURES object from src/lib/featureFlags.ts:
 * - All flags have expected boolean values for MVP launch
 * - BOOSTS is enabled (IAP-based boost feature)
 * - The FEATURES object is frozen / immutable (as const)
 * - All flag keys are boolean type
 * - No unexpected keys exist
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

// ══════════════════════════════════════════════════════
// Expected flag values for MVP launch
// ══════════════════════════════════════════════════════

describe('Feature flag expected values', () => {
  test('LENDING is false (lainaa category hidden)', () => {
    expect(FEATURES.LENDING).toBe(false)
  })

  test('PAYMENTS is false (Stripe payments disabled)', () => {
    expect(FEATURES.PAYMENTS).toBe(false)
  })

  test('PRO_SUBSCRIPTION is false (Pro tier disabled)', () => {
    expect(FEATURES.PRO_SUBSCRIPTION).toBe(false)
  })

  test('BUSINESS_ACCOUNT is false (business tier disabled)', () => {
    expect(FEATURES.BUSINESS_ACCOUNT).toBe(false)
  })

  test('AD_CAMPAIGNS is false (ad campaigns disabled)', () => {
    expect(FEATURES.AD_CAMPAIGNS).toBe(false)
  })

  test('IDENTITY_VERIFICATION is false (Suomi.fi disabled)', () => {
    expect(FEATURES.IDENTITY_VERIFICATION).toBe(false)
  })

  test('EVENTS_TAPAHTUMA_TYPE is true (tapahtuma post type enabled)', () => {
    expect(FEATURES.EVENTS_TAPAHTUMA_TYPE).toBe(true)
  })

  test('BOOSTS is true (IAP-based boost feature enabled)', () => {
    expect(FEATURES.BOOSTS).toBe(true)
  })
})

// ══════════════════════════════════════════════════════
// All flag keys are boolean
// ══════════════════════════════════════════════════════

describe('Feature flag types', () => {
  test('Every feature flag value is a boolean', () => {
    const keys = Object.keys(FEATURES) as (keyof typeof FEATURES)[]
    for (const key of keys) {
      expect(typeof FEATURES[key]).toBe('boolean')
    }
  })

  test('No flag value is null or undefined', () => {
    const keys = Object.keys(FEATURES) as (keyof typeof FEATURES)[]
    for (const key of keys) {
      expect(FEATURES[key]).not.toBeNull()
      expect(FEATURES[key]).not.toBeUndefined()
    }
  })
})

// ══════════════════════════════════════════════════════
// FEATURES object immutability (as const)
// ══════════════════════════════════════════════════════

describe('Feature flag immutability', () => {
  test('FEATURES object cannot be mutated at runtime', () => {
    // FEATURES is a Proxy with a set trap that throws.
    // Verify that attempting to write throws an error.
    const originalValue = FEATURES.LENDING

    expect(() => {
      ;(FEATURES as any).LENDING = true
    }).toThrow('Use fetchRemoteFlags() to update flags')

    // Value should still be the original
    expect(FEATURES.LENDING).toBe(originalValue)
    expect(typeof FEATURES.LENDING).toBe('boolean')
  })

  test('No new keys can be added to FEATURES', () => {
    const originalKeys = Object.keys(FEATURES)

    // Proxy set trap throws for any assignment including new keys
    expect(() => {
      ;(FEATURES as any).NEW_FLAG = true
    }).toThrow('Use fetchRemoteFlags() to update flags')

    // Verify the known keys are still present and unchanged
    expect(originalKeys.length).toBeGreaterThanOrEqual(9)
    expect(Object.keys(FEATURES)).toEqual(originalKeys)
  })
})

// ══════════════════════════════════════════════════════
// Known flag inventory
// ══════════════════════════════════════════════════════

describe('Feature flag inventory', () => {
  const EXPECTED_KEYS = [
    'LENDING',
    'PAYMENTS',
    'PRO_SUBSCRIPTION',
    'BUSINESS_ACCOUNT',
    'AD_CAMPAIGNS',
    'IDENTITY_VERIFICATION',
    'EVENTS_TAPAHTUMA_TYPE',
    'BOOSTS',
  ]

  test('All expected keys exist in FEATURES', () => {
    for (const key of EXPECTED_KEYS) {
      expect(FEATURES).toHaveProperty(key)
    }
  })

  test('FEATURES has exactly the expected number of keys', () => {
    expect(Object.keys(FEATURES)).toHaveLength(EXPECTED_KEYS.length)
  })

  test('No unexpected keys in FEATURES', () => {
    const actualKeys = Object.keys(FEATURES)
    for (const key of actualKeys) {
      expect(EXPECTED_KEYS).toContain(key)
    }
  })

  test('Disabled features count matches MVP plan (6 disabled)', () => {
    const disabled = Object.values(FEATURES).filter(v => v === false)
    expect(disabled).toHaveLength(6)
  })

  test('Enabled features count matches MVP plan (3 enabled)', () => {
    const enabled = Object.values(FEATURES).filter(v => v === true)
    expect(enabled).toHaveLength(3)
  })
})
