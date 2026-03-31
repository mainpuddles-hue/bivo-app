/**
 * IAP (In-App Purchase) Module Unit Tests
 *
 * Tests:
 * - BOOST_PRODUCTS array integrity
 * - getDiscountedPrice() for free/pro/business tiers
 * - getBoostDurationHours() for all tiers
 * - formatBoostPrice() formatting
 * - isSandboxMode() dev detection
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
  BOOST_PRODUCTS,
  getDiscountedPrice,
  getBoostDurationHours,
  formatBoostPrice,
  isSandboxMode,
} from '../src/lib/iap'

// ══════════════════════════════════════════════════════
// BOOST_PRODUCTS — Array integrity
// ══════════════════════════════════════════════════════

describe('BOOST_PRODUCTS', () => {
  test('Contains exactly 3 products', () => {
    expect(BOOST_PRODUCTS).toHaveLength(3)
  })

  test('Product IDs follow com.tackbird.boost_N pattern', () => {
    expect(BOOST_PRODUCTS[0].id).toBe('com.tackbird.boost_1')
    expect(BOOST_PRODUCTS[1].id).toBe('com.tackbird.boost_3')
    expect(BOOST_PRODUCTS[2].id).toBe('com.tackbird.boost_5')
  })

  test('Credits match the product names (1, 3, 5)', () => {
    expect(BOOST_PRODUCTS[0].credits).toBe(1)
    expect(BOOST_PRODUCTS[1].credits).toBe(3)
    expect(BOOST_PRODUCTS[2].credits).toBe(5)
  })

  test('Prices are in cents and increase with credits', () => {
    expect(BOOST_PRODUCTS[0].priceCents).toBe(199)
    expect(BOOST_PRODUCTS[1].priceCents).toBe(499)
    expect(BOOST_PRODUCTS[2].priceCents).toBe(799)

    // Prices should increase monotonically
    for (let i = 1; i < BOOST_PRODUCTS.length; i++) {
      expect(BOOST_PRODUCTS[i].priceCents).toBeGreaterThan(BOOST_PRODUCTS[i - 1].priceCents)
    }
  })

  test('Per-credit price decreases with larger packs (volume discount)', () => {
    const perCredit = BOOST_PRODUCTS.map(p => p.priceCents / p.credits)
    // 199/1 = 199, 499/3 = 166.33, 799/5 = 159.8
    for (let i = 1; i < perCredit.length; i++) {
      expect(perCredit[i]).toBeLessThan(perCredit[i - 1])
    }
  })

  test('All products have a label string', () => {
    for (const product of BOOST_PRODUCTS) {
      expect(typeof product.label).toBe('string')
      expect(product.label.length).toBeGreaterThan(0)
    }
  })

  test('All prices are positive integers', () => {
    for (const product of BOOST_PRODUCTS) {
      expect(Number.isInteger(product.priceCents)).toBe(true)
      expect(product.priceCents).toBeGreaterThan(0)
    }
  })

  test('All credits are positive integers', () => {
    for (const product of BOOST_PRODUCTS) {
      expect(Number.isInteger(product.credits)).toBe(true)
      expect(product.credits).toBeGreaterThan(0)
    }
  })
})

// ══════════════════════════════════════════════════════
// getDiscountedPrice
// ══════════════════════════════════════════════════════

describe('getDiscountedPrice', () => {
  test('Free tier gets no discount (100%)', () => {
    expect(getDiscountedPrice(100, 'free')).toBe(100)
    expect(getDiscountedPrice(199, 'free')).toBe(199)
    expect(getDiscountedPrice(499, 'free')).toBe(499)
  })

  test('Pro tier gets 20% discount', () => {
    expect(getDiscountedPrice(100, 'pro')).toBe(80)
    expect(getDiscountedPrice(199, 'pro')).toBe(159)  // Math.round(199 * 0.80) = 159.2 => 159
    expect(getDiscountedPrice(499, 'pro')).toBe(399)  // Math.round(499 * 0.80) = 399.2 => 399
  })

  test('Business tier gets 30% discount', () => {
    expect(getDiscountedPrice(100, 'business')).toBe(70)
    expect(getDiscountedPrice(199, 'business')).toBe(139)  // Math.round(199 * 0.70) = 139.3 => 139
    expect(getDiscountedPrice(499, 'business')).toBe(349)  // Math.round(499 * 0.70) = 349.3 => 349
  })

  test('Returns rounded integer for all tiers', () => {
    const testPrices = [100, 199, 333, 499, 799, 1000]
    const tiers: Array<'free' | 'pro' | 'business'> = ['free', 'pro', 'business']

    for (const price of testPrices) {
      for (const tier of tiers) {
        const result = getDiscountedPrice(price, tier)
        expect(Number.isInteger(result)).toBe(true)
      }
    }
  })

  test('Zero price stays zero for all tiers', () => {
    expect(getDiscountedPrice(0, 'free')).toBe(0)
    expect(getDiscountedPrice(0, 'pro')).toBe(0)
    expect(getDiscountedPrice(0, 'business')).toBe(0)
  })

  test('Discount ordering: business < pro < free', () => {
    const base = 1000
    const free = getDiscountedPrice(base, 'free')
    const pro = getDiscountedPrice(base, 'pro')
    const business = getDiscountedPrice(base, 'business')

    expect(business).toBeLessThan(pro)
    expect(pro).toBeLessThan(free)
  })

  test('Handles rounding edge cases', () => {
    // 333 * 0.80 = 266.4 => 266
    expect(getDiscountedPrice(333, 'pro')).toBe(266)
    // 333 * 0.70 = 233.1 => 233
    expect(getDiscountedPrice(333, 'business')).toBe(233)
    // 1 * 0.80 = 0.8 => 1
    expect(getDiscountedPrice(1, 'pro')).toBe(1)
    // 1 * 0.70 = 0.7 => 1
    expect(getDiscountedPrice(1, 'business')).toBe(1)
  })
})

// ══════════════════════════════════════════════════════
// getBoostDurationHours
// ══════════════════════════════════════════════════════

describe('getBoostDurationHours', () => {
  test('Free tier gets 24 hours (1 day)', () => {
    expect(getBoostDurationHours('free')).toBe(24)
  })

  test('Pro tier gets 72 hours (3 days)', () => {
    expect(getBoostDurationHours('pro')).toBe(72)
  })

  test('Business tier gets 168 hours (7 days)', () => {
    expect(getBoostDurationHours('business')).toBe(168)
  })

  test('Duration ordering: business > pro > free', () => {
    const free = getBoostDurationHours('free')
    const pro = getBoostDurationHours('pro')
    const business = getBoostDurationHours('business')

    expect(business).toBeGreaterThan(pro)
    expect(pro).toBeGreaterThan(free)
  })

  test('Pro is 3x free duration', () => {
    expect(getBoostDurationHours('pro')).toBe(getBoostDurationHours('free') * 3)
  })

  test('Business is 7x free duration', () => {
    expect(getBoostDurationHours('business')).toBe(getBoostDurationHours('free') * 7)
  })
})

// ══════════════════════════════════════════════════════
// formatBoostPrice
// ══════════════════════════════════════════════════════

describe('formatBoostPrice', () => {
  test('Formats 199 cents as 1,99 EUR', () => {
    expect(formatBoostPrice(199)).toBe('1,99 \u20AC')
  })

  test('Formats 499 cents as 4,99 EUR', () => {
    expect(formatBoostPrice(499)).toBe('4,99 \u20AC')
  })

  test('Formats 799 cents as 7,99 EUR', () => {
    expect(formatBoostPrice(799)).toBe('7,99 \u20AC')
  })

  test('Formats 0 cents as 0,00 EUR', () => {
    expect(formatBoostPrice(0)).toBe('0,00 \u20AC')
  })

  test('Formats 100 cents as 1,00 EUR', () => {
    expect(formatBoostPrice(100)).toBe('1,00 \u20AC')
  })

  test('Uses comma as decimal separator (Finnish style)', () => {
    expect(formatBoostPrice(199)).toContain(',')
    expect(formatBoostPrice(199)).not.toMatch(/\d\.\d/)
  })

  test('Ends with Euro sign', () => {
    expect(formatBoostPrice(199)).toMatch(/\u20AC$/)
  })

  test('Formats all BOOST_PRODUCTS prices correctly', () => {
    expect(formatBoostPrice(BOOST_PRODUCTS[0].priceCents)).toBe('1,99 \u20AC')
    expect(formatBoostPrice(BOOST_PRODUCTS[1].priceCents)).toBe('4,99 \u20AC')
    expect(formatBoostPrice(BOOST_PRODUCTS[2].priceCents)).toBe('7,99 \u20AC')
  })

  test('Handles large amounts', () => {
    expect(formatBoostPrice(10000)).toBe('100,00 \u20AC')
    expect(formatBoostPrice(99999)).toBe('999,99 \u20AC')
  })
})

// ══════════════════════════════════════════════════════
// isSandboxMode
// ══════════════════════════════════════════════════════

describe('isSandboxMode', () => {
  test('Returns true in __DEV__ mode (test environment)', () => {
    // In Jest environment, __DEV__ is typically true
    expect(isSandboxMode()).toBe(true)
  })
})
