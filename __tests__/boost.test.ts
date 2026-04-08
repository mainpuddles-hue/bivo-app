/**
 * Boost System Tests
 *
 * Tests the complete TackBird boost system:
 * - IAP product definitions and pricing
 * - Tier-based discounts (Free, Pro, Business)
 * - Boost duration by tier
 * - Feed algorithm boost scoring
 * - Boosted post cap enforcement in feed
 * - Price formatting
 * - Edge cases
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

import {
  BOOST_PRODUCTS,
  getDiscountedPrice,
  getBoostDurationHours,
  formatBoostPrice,
} from '../src/lib/iap'
import { scorePost, rankFeed } from '../src/lib/feedAlgorithm'
import type { Post, BoostTier } from '../src/lib/types'

// ── Helpers ──────────────────────────────────────────

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    user_id: 'user-1',
    type: 'tarjoan',
    title: 'Test post',
    description: 'A test post',
    location: 'Kallio',
    image_url: null,
    hub_pickup_id: null,
    expires_at: null,
    daily_fee: null,
    service_price: null,
    event_date: null,
    latitude: null,
    longitude: null,
    is_pro_listing: false,
    tags: [],
    is_active: true,
    like_count: 0,
    comment_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

const baseFeedContext = {
  userNeighborhood: 'Kallio',
  followedIds: [] as string[],
  now: Date.now(),
}

// ══════════════════════════════════════════════════════
// Product Pricing
// ══════════════════════════════════════════════════════

describe('Boost Product Pricing', () => {
  test('1 boost costs 199 cents', () => {
    const product = BOOST_PRODUCTS.find(p => p.credits === 1)
    expect(product).toBeDefined()
    expect(product!.priceCents).toBe(199)
  })

  test('3 boosts cost 499 cents', () => {
    const product = BOOST_PRODUCTS.find(p => p.credits === 3)
    expect(product).toBeDefined()
    expect(product!.priceCents).toBe(499)
  })

  test('5 boosts cost 799 cents', () => {
    const product = BOOST_PRODUCTS.find(p => p.credits === 5)
    expect(product).toBeDefined()
    expect(product!.priceCents).toBe(799)
  })

  test('bulk packages have lower per-unit cost', () => {
    const single = BOOST_PRODUCTS.find(p => p.credits === 1)!
    const triple = BOOST_PRODUCTS.find(p => p.credits === 3)!
    const fiver = BOOST_PRODUCTS.find(p => p.credits === 5)!

    const perUnitSingle = single.priceCents / single.credits
    const perUnitTriple = triple.priceCents / triple.credits
    const perUnitFiver = fiver.priceCents / fiver.credits

    expect(perUnitTriple).toBeLessThan(perUnitSingle)
    expect(perUnitFiver).toBeLessThan(perUnitTriple)
  })

  test('exactly 3 products are defined', () => {
    expect(BOOST_PRODUCTS).toHaveLength(3)
  })
})

// ══════════════════════════════════════════════════════
// Product IDs
// ══════════════════════════════════════════════════════

describe('Boost Product IDs', () => {
  test('all product IDs follow com.tackbird.boost_N pattern', () => {
    for (const product of BOOST_PRODUCTS) {
      expect(product.id).toMatch(/^com\.tackbird\.boost_\d+$/)
    }
  })

  test('product IDs match their credit count', () => {
    for (const product of BOOST_PRODUCTS) {
      const idNumber = parseInt(product.id.split('_')[1], 10)
      expect(idNumber).toBe(product.credits)
    }
  })

  test('all product IDs are unique', () => {
    const ids = BOOST_PRODUCTS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ══════════════════════════════════════════════════════
// Tier Discounts
// ══════════════════════════════════════════════════════

describe('Tier Discounts', () => {
  test('free tier gets no discount (100% price)', () => {
    expect(getDiscountedPrice(199, 'free')).toBe(199)
    expect(getDiscountedPrice(499, 'free')).toBe(499)
    expect(getDiscountedPrice(799, 'free')).toBe(799)
  })

  test('Pro tier gets 20% off', () => {
    expect(getDiscountedPrice(199, 'pro')).toBe(Math.round(199 * 0.80))
    expect(getDiscountedPrice(499, 'pro')).toBe(Math.round(499 * 0.80))
    expect(getDiscountedPrice(799, 'pro')).toBe(Math.round(799 * 0.80))
  })

  test('Business tier gets 30% off', () => {
    expect(getDiscountedPrice(199, 'business')).toBe(Math.round(199 * 0.70))
    expect(getDiscountedPrice(499, 'business')).toBe(Math.round(499 * 0.70))
    expect(getDiscountedPrice(799, 'business')).toBe(Math.round(799 * 0.70))
  })

  test('Pro discount is less than Business discount', () => {
    const baseCents = 799
    const proPrice = getDiscountedPrice(baseCents, 'pro')
    const bizPrice = getDiscountedPrice(baseCents, 'business')
    expect(bizPrice).toBeLessThan(proPrice)
  })

  test('discounts produce integer cents (no fractional cents)', () => {
    for (const product of BOOST_PRODUCTS) {
      const tiers: BoostTier[] = ['free', 'pro', 'business']
      for (const tier of tiers) {
        const price = getDiscountedPrice(product.priceCents, tier)
        expect(Number.isInteger(price)).toBe(true)
      }
    }
  })

  test('negative prices are impossible — all discounted prices are positive', () => {
    for (const product of BOOST_PRODUCTS) {
      const tiers: BoostTier[] = ['free', 'pro', 'business']
      for (const tier of tiers) {
        const price = getDiscountedPrice(product.priceCents, tier)
        expect(price).toBeGreaterThan(0)
      }
    }
  })
})

// ══════════════════════════════════════════════════════
// Boost Duration
// ══════════════════════════════════════════════════════

describe('Boost Duration by Tier', () => {
  test('free tier = 24 hours', () => {
    expect(getBoostDurationHours('free')).toBe(24)
  })

  test('Pro tier = 72 hours (3 days)', () => {
    expect(getBoostDurationHours('pro')).toBe(72)
  })

  test('Business tier = 168 hours (7 days)', () => {
    expect(getBoostDurationHours('business')).toBe(168)
  })

  test('higher tiers get longer duration', () => {
    const freeDuration = getBoostDurationHours('free')
    const proDuration = getBoostDurationHours('pro')
    const bizDuration = getBoostDurationHours('business')

    expect(proDuration).toBeGreaterThan(freeDuration)
    expect(bizDuration).toBeGreaterThan(proDuration)
  })

  test('Business duration is exactly 7x free duration', () => {
    expect(getBoostDurationHours('business')).toBe(getBoostDurationHours('free') * 7)
  })

  test('Pro duration is exactly 3x free duration', () => {
    expect(getBoostDurationHours('pro')).toBe(getBoostDurationHours('free') * 3)
  })
})

// ══════════════════════════════════════════════════════
// Unknown Tier Defaults
// ══════════════════════════════════════════════════════

describe('Edge Case: Unknown Tier Defaults', () => {
  test('unknown tier defaults to free pricing (no discount)', () => {
    // Force an unknown string — should fall through to the default return
    const price = getDiscountedPrice(199, 'unknown_tier' as BoostTier)
    expect(price).toBe(199)
  })

  test('unknown tier defaults to free duration (24h)', () => {
    const duration = getBoostDurationHours('unknown_tier' as BoostTier)
    expect(duration).toBe(24)
  })
})

// ══════════════════════════════════════════════════════
// Price Formatting
// ══════════════════════════════════════════════════════

describe('Price Formatting', () => {
  test('formats cents to euros with comma separator', () => {
    expect(formatBoostPrice(199)).toBe('1,99 \u20AC')
    expect(formatBoostPrice(499)).toBe('4,99 \u20AC')
    expect(formatBoostPrice(799)).toBe('7,99 \u20AC')
  })

  test('formats discounted prices correctly', () => {
    const proPriceFor1 = getDiscountedPrice(199, 'pro') // 159
    expect(formatBoostPrice(proPriceFor1)).toBe('1,59 \u20AC')

    const bizPriceFor5 = getDiscountedPrice(799, 'business') // 559
    expect(formatBoostPrice(bizPriceFor5)).toBe('5,59 \u20AC')
  })

  test('formats zero cents correctly', () => {
    expect(formatBoostPrice(0)).toBe('0,00 \u20AC')
  })

  test('formats round euro amounts correctly', () => {
    expect(formatBoostPrice(100)).toBe('1,00 \u20AC')
    expect(formatBoostPrice(1000)).toBe('10,00 \u20AC')
  })
})

// ══════════════════════════════════════════════════════
// Feed Algorithm: Boost Scoring
// ══════════════════════════════════════════════════════

describe('Feed Algorithm: Boost Scoring', () => {
  test('boosted post gets 1.4x score multiplier', () => {
    const post = makePost({ id: 'boosted-1' })
    const regularScore = scorePost(post, baseFeedContext)

    const boostedCtx = {
      ...baseFeedContext,
      boostedPostIds: new Set(['boosted-1']),
    }
    const boostedScore = scorePost(post, boostedCtx)

    expect(boostedScore).toBeCloseTo(regularScore * 1.4, 5)
  })

  test('non-boosted post is unaffected when boostedPostIds is present', () => {
    const post = makePost({ id: 'normal-1' })
    const scoreWithout = scorePost(post, baseFeedContext)

    const ctxWithBoostSet = {
      ...baseFeedContext,
      boostedPostIds: new Set(['other-post']),
    }
    const scoreWith = scorePost(post, ctxWithBoostSet)

    expect(scoreWith).toBe(scoreWithout)
  })

  test('boost multiplier is 1.4x regardless of other factors', () => {
    // A post with high engagement should still get the same 1.4x boost multiplier
    const engagedPost = makePost({ id: 'engaged-1', like_count: 20, comment_count: 10 })
    const regularScore = scorePost(engagedPost, baseFeedContext)

    const boostedCtx = {
      ...baseFeedContext,
      boostedPostIds: new Set(['engaged-1']),
    }
    const boostedScore = scorePost(engagedPost, boostedCtx)

    expect(boostedScore).toBeCloseTo(regularScore * 1.4, 5)
  })

  test('boosted post ranks higher in feed than identical non-boosted post', () => {
    const postA = makePost({ id: 'a', title: 'Normal' })
    const postB = makePost({ id: 'b', title: 'Boosted' })

    const ctx = {
      ...baseFeedContext,
      boostedPostIds: new Set(['b']),
    }

    const ranked = rankFeed([postA, postB], ctx)
    const indexA = ranked.findIndex(p => p.id === 'a')
    const indexB = ranked.findIndex(p => p.id === 'b')

    expect(indexB).toBeLessThan(indexA)
  })
})

// ══════════════════════════════════════════════════════
// Boosted Cap Enforcement
// ══════════════════════════════════════════════════════

describe('Boosted Cap Enforcement', () => {
  test('max 2 boosted posts in top 10 positions', () => {
    // Create 15 posts: 5 boosted, 10 regular
    const posts: Post[] = []
    const boostedIds = new Set<string>()

    for (let i = 0; i < 5; i++) {
      const id = `boosted-${i}`
      boostedIds.add(id)
      posts.push(makePost({
        id,
        // Give boosted posts high engagement to ensure they score high
        like_count: 20,
        comment_count: 10,
      }))
    }
    for (let i = 0; i < 10; i++) {
      posts.push(makePost({
        id: `regular-${i}`,
        like_count: 0,
        comment_count: 0,
        // Make them older so they rank lower
        created_at: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
      }))
    }

    const ctx = {
      ...baseFeedContext,
      boostedPostIds: boostedIds,
    }

    const ranked = rankFeed(posts, ctx)
    const top10 = ranked.slice(0, 10)
    const boostedInTop10 = top10.filter(p => boostedIds.has(p.id))

    expect(boostedInTop10.length).toBeLessThanOrEqual(2)
  })

  test('excess boosted posts are pushed below position 10', () => {
    const posts: Post[] = []
    const boostedIds = new Set<string>()

    // 4 boosted posts with very high scores
    for (let i = 0; i < 4; i++) {
      const id = `boosted-${i}`
      boostedIds.add(id)
      posts.push(makePost({
        id,
        like_count: 20,
        comment_count: 10,
      }))
    }
    // 10 regular posts
    for (let i = 0; i < 10; i++) {
      posts.push(makePost({
        id: `regular-${i}`,
        created_at: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
      }))
    }

    const ctx = {
      ...baseFeedContext,
      boostedPostIds: boostedIds,
    }

    const ranked = rankFeed(posts, ctx)
    const top10 = ranked.slice(0, 10)
    const boostedInTop10 = top10.filter(p => boostedIds.has(p.id))

    // At most 2 boosted in top 10
    expect(boostedInTop10.length).toBeLessThanOrEqual(2)

    // The remaining boosted posts should still exist in the feed
    const allBoostedInFeed = ranked.filter(p => boostedIds.has(p.id))
    expect(allBoostedInFeed.length).toBe(4)
  })

  test('when no boosted posts, cap enforcement is a no-op', () => {
    const posts = Array.from({ length: 15 }, (_, i) =>
      makePost({
        id: `post-${i}`,
        created_at: new Date(Date.now() - i * 3600000).toISOString(),
      })
    )

    const ranked = rankFeed(posts, baseFeedContext)
    expect(ranked).toHaveLength(15)
  })

  test('with 2 or fewer boosted posts, all can appear in top 10', () => {
    const posts: Post[] = []
    const boostedIds = new Set<string>()

    // 2 boosted posts
    for (let i = 0; i < 2; i++) {
      const id = `boosted-${i}`
      boostedIds.add(id)
      posts.push(makePost({
        id,
        like_count: 20,
        comment_count: 10,
      }))
    }
    // 10 regular posts
    for (let i = 0; i < 10; i++) {
      posts.push(makePost({
        id: `regular-${i}`,
        created_at: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
      }))
    }

    const ctx = {
      ...baseFeedContext,
      boostedPostIds: boostedIds,
    }

    const ranked = rankFeed(posts, ctx)
    const top10 = ranked.slice(0, 10)
    const boostedInTop10 = top10.filter(p => boostedIds.has(p.id))

    // Both should be in top 10 since there are only 2
    expect(boostedInTop10.length).toBe(2)
  })
})
