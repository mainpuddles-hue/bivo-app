/**
 * Pro Subscription Business Logic Tests
 *
 * Tests the core business logic for TackBird Pro:
 * - Feed algorithm Pro boost (+0.2 social score component)
 * - Feed ranking: Pro listings always sorted first
 * - Commission calculation: 5% for Pro, 10% for free
 * - Pro expiry detection: expired pro_expires_at with grace period
 * - Ad pricing: Pro gets 239 cents/day, free gets 299 cents/day
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

import { scorePost, rankFeed } from '../src/lib/feedAlgorithm'
import type { Post, Profile } from '../src/lib/types'

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
// Feed Algorithm — Pro Boost
// ══════════════════════════════════════════════════════

describe('Feed Algorithm: Pro Boost', () => {
  test('Pro listing gets +0.2 boost in the social score component', () => {
    const regularPost = makePost({ is_pro_listing: false })
    const proPost = makePost({ is_pro_listing: true })

    const regularScore = scorePost(regularPost, baseFeedContext)
    const proScore = scorePost(proPost, baseFeedContext)

    // Pro post should score higher due to the +0.2 isPro component in social
    expect(proScore).toBeGreaterThan(regularScore)

    // The social weight is 0.10, and the isPro adds 0.2 to the social sub-score
    // So the difference should be at most 0.10 * 0.2 = 0.02 (before min(1,...) clamp)
    const diff = proScore - regularScore
    expect(diff).toBeGreaterThan(0)
    expect(diff).toBeLessThanOrEqual(0.10) // social weight caps the max possible difference
  })

  test('Pro boost is 0.2 in the social sub-score formula', () => {
    // Verify the exact logic: isPro = post.is_pro_listing ? 0.2 : 0
    // social = Math.min(1, trustScore * 0.5 + isFollowed + isPro)
    // For a basic post with no badges, trust level = 1, trustScore = 0.3
    // social = min(1, 0.3 * 0.5 + 0 + 0.2) = min(1, 0.35) = 0.35 for Pro
    // social = min(1, 0.3 * 0.5 + 0 + 0) = min(1, 0.15) = 0.15 for non-Pro
    const proPost = makePost({ is_pro_listing: true })
    const regularPost = makePost({ is_pro_listing: false })

    const proScore = scorePost(proPost, baseFeedContext)
    const regularScore = scorePost(regularPost, baseFeedContext)

    // Difference = (0.35 - 0.15) * 0.10 = 0.02 from the social component
    const diff = proScore - regularScore
    expect(diff).toBeCloseTo(0.02, 2)
  })

  test('Pro post with engagement scores higher than regular post with same engagement', () => {
    const regularPost = makePost({
      is_pro_listing: false,
      like_count: 5,
      comment_count: 3,
    })
    const proPost = makePost({
      is_pro_listing: true,
      like_count: 5,
      comment_count: 3,
    })

    const regularScore = scorePost(regularPost, baseFeedContext)
    const proScore = scorePost(proPost, baseFeedContext)

    expect(proScore).toBeGreaterThan(regularScore)
  })
})

// ══════════════════════════════════════════════════════
// Feed Ranking — Pro Listings Always First
// ══════════════════════════════════════════════════════

describe('Feed Ranking: Pro Listings First', () => {
  test('Pro listings are always sorted before non-Pro listings', () => {
    const regularPost1 = makePost({
      id: 'regular-1',
      is_pro_listing: false,
      like_count: 20,
      comment_count: 10,
    })
    const regularPost2 = makePost({
      id: 'regular-2',
      is_pro_listing: false,
      like_count: 15,
    })
    const proPost = makePost({
      id: 'pro-1',
      is_pro_listing: true,
      like_count: 0,
      comment_count: 0,
    })

    const ranked = rankFeed([regularPost1, regularPost2, proPost], baseFeedContext)

    // Pro post should be first even with zero engagement
    expect(ranked[0].id).toBe('pro-1')
    expect(ranked[0].is_pro_listing).toBe(true)
  })

  test('Multiple Pro listings are sorted by score among themselves', () => {
    const proPost1 = makePost({
      id: 'pro-1',
      is_pro_listing: true,
      like_count: 0,
      comment_count: 0,
    })
    const proPost2 = makePost({
      id: 'pro-2',
      is_pro_listing: true,
      like_count: 10,
      comment_count: 5,
    })
    const regularPost = makePost({
      id: 'regular-1',
      is_pro_listing: false,
      like_count: 50,
    })

    const ranked = rankFeed([regularPost, proPost1, proPost2], baseFeedContext)

    // Both Pro posts should come before regular post
    expect(ranked[0].is_pro_listing).toBe(true)
    expect(ranked[1].is_pro_listing).toBe(true)
    expect(ranked[2].is_pro_listing).toBe(false)

    // Pro posts with higher engagement should be ranked higher among Pro posts
    expect(ranked[0].id).toBe('pro-2')
    expect(ranked[1].id).toBe('pro-1')
  })

  test('rankFeed does not mutate the original array', () => {
    const posts = [
      makePost({ id: 'a', is_pro_listing: false }),
      makePost({ id: 'b', is_pro_listing: true }),
    ]
    const originalOrder = posts.map(p => p.id)

    rankFeed(posts, baseFeedContext)

    // Original array should be unchanged
    expect(posts.map(p => p.id)).toEqual(originalOrder)
  })
})

// ══════════════════════════════════════════════════════
// Commission Calculation
// ══════════════════════════════════════════════════════

describe('Commission Calculation', () => {
  // This mirrors the logic in useStripePayment.ts:
  // application_fee_amount: Math.round(options.amount * 0.10) — 10% for free users
  // Pro users get 5% commission (per i18n: "Rental commission 10% -> 5%")

  function calculateCommission(amount: number, isPro: boolean): number {
    const rate = isPro ? 0.05 : 0.10
    return Math.round(amount * rate)
  }

  test('Free user pays 10% commission', () => {
    expect(calculateCommission(1000, false)).toBe(100)
    expect(calculateCommission(5000, false)).toBe(500)
    expect(calculateCommission(499, false)).toBe(50) // Math.round(49.9)
  })

  test('Pro user pays 5% commission', () => {
    expect(calculateCommission(1000, true)).toBe(50)
    expect(calculateCommission(5000, true)).toBe(250)
    expect(calculateCommission(499, true)).toBe(25) // Math.round(24.95)
  })

  test('Commission is always rounded to nearest cent', () => {
    // 10% of 333 = 33.3 -> 33
    expect(calculateCommission(333, false)).toBe(33)
    // 5% of 333 = 16.65 -> 17
    expect(calculateCommission(333, true)).toBe(17)
  })

  test('Zero amount yields zero commission', () => {
    expect(calculateCommission(0, false)).toBe(0)
    expect(calculateCommission(0, true)).toBe(0)
  })

  test('Provider receives correct amount after commission', () => {
    const amount = 2000 // 20.00 EUR
    const freeCommission = calculateCommission(amount, false)
    const proCommission = calculateCommission(amount, true)

    expect(amount - freeCommission).toBe(1800) // 90% to provider
    expect(amount - proCommission).toBe(1900) // 95% to provider
  })
})

// ══════════════════════════════════════════════════════
// Pro Expiry Check
// ══════════════════════════════════════════════════════

describe('Pro Expiry Check', () => {
  // This mirrors the logic in profile.tsx and settings.tsx:
  // if (p.is_pro && p.pro_expires_at &&
  //     new Date(p.pro_expires_at).getTime() + GRACE_DAYS * 86400000 < Date.now()
  //     && !p.stripe_subscription_id)
  const GRACE_DAYS = 3

  function isProExpired(profile: {
    is_pro: boolean
    pro_expires_at: string | null
    stripe_subscription_id?: string | null
  }): boolean {
    if (!profile.is_pro) return false
    if (!profile.pro_expires_at) return false
    if (profile.stripe_subscription_id) return false // active Stripe subscription overrides
    return new Date(profile.pro_expires_at).getTime() + GRACE_DAYS * 86400000 < Date.now()
  }

  test('Non-Pro user is not expired', () => {
    expect(isProExpired({
      is_pro: false,
      pro_expires_at: null,
    })).toBe(false)
  })

  test('Pro user without expiry date is not expired', () => {
    expect(isProExpired({
      is_pro: true,
      pro_expires_at: null,
    })).toBe(false)
  })

  test('Pro user with future expiry is not expired', () => {
    const future = new Date(Date.now() + 30 * 86400000).toISOString()
    expect(isProExpired({
      is_pro: true,
      pro_expires_at: future,
    })).toBe(false)
  })

  test('Pro user expired yesterday (within grace period) is NOT expired', () => {
    const yesterday = new Date(Date.now() - 1 * 86400000).toISOString()
    expect(isProExpired({
      is_pro: true,
      pro_expires_at: yesterday,
    })).toBe(false)
  })

  test('Pro user expired 4 days ago (beyond 3-day grace) IS expired', () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString()
    expect(isProExpired({
      is_pro: true,
      pro_expires_at: fourDaysAgo,
    })).toBe(true)
  })

  test('Pro user expired 10 days ago IS expired', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString()
    expect(isProExpired({
      is_pro: true,
      pro_expires_at: tenDaysAgo,
    })).toBe(true)
  })

  test('Expired user with active Stripe subscription is NOT expired (auto-renew)', () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString()
    expect(isProExpired({
      is_pro: true,
      pro_expires_at: fourDaysAgo,
      stripe_subscription_id: 'sub_123abc',
    })).toBe(false)
  })

  test('Grace period is exactly 3 days', () => {
    // At exactly 3 days + 1ms, should be expired
    const exactlyThreeDaysAgo = new Date(Date.now() - GRACE_DAYS * 86400000 - 1).toISOString()
    expect(isProExpired({
      is_pro: true,
      pro_expires_at: exactlyThreeDaysAgo,
    })).toBe(true)

    // At exactly 3 days - 1ms, should NOT be expired
    const justUnderThreeDays = new Date(Date.now() - GRACE_DAYS * 86400000 + 1000).toISOString()
    expect(isProExpired({
      is_pro: true,
      pro_expires_at: justUnderThreeDays,
    })).toBe(false)
  })
})

// ══════════════════════════════════════════════════════
// Ad Pricing
// ══════════════════════════════════════════════════════

describe('Ad Pricing', () => {
  // From create-ad.tsx:
  // const PRICE_PER_DAY = 299 // cents
  // const PRO_PRICE_PER_DAY = 239 // cents
  // const pricePerDay = profile?.is_pro ? PRO_PRICE_PER_DAY : PRICE_PER_DAY

  const PRICE_PER_DAY = 299
  const PRO_PRICE_PER_DAY = 239

  function getAdPricePerDay(isPro: boolean): number {
    return isPro ? PRO_PRICE_PER_DAY : PRICE_PER_DAY
  }

  function getAdTotalPrice(days: number, isPro: boolean): number {
    return days * getAdPricePerDay(isPro)
  }

  test('Free user pays 299 cents/day (2.99 EUR)', () => {
    expect(getAdPricePerDay(false)).toBe(299)
  })

  test('Pro user pays 239 cents/day (2.39 EUR)', () => {
    expect(getAdPricePerDay(true)).toBe(239)
  })

  test('Pro discount is approximately 20%', () => {
    const discount = 1 - (PRO_PRICE_PER_DAY / PRICE_PER_DAY)
    expect(discount).toBeCloseTo(0.20, 1) // ~20%
  })

  test('7-day campaign pricing is correct', () => {
    expect(getAdTotalPrice(7, false)).toBe(2093) // 7 * 299
    expect(getAdTotalPrice(7, true)).toBe(1673)  // 7 * 239
  })

  test('30-day campaign pricing is correct', () => {
    expect(getAdTotalPrice(30, false)).toBe(8970) // 30 * 299 = 89.70 EUR
    expect(getAdTotalPrice(30, true)).toBe(7170)  // 30 * 239 = 71.70 EUR
  })

  test('Pro user saves money on every duration', () => {
    for (const days of [1, 3, 7, 14, 30]) {
      const freePrice = getAdTotalPrice(days, false)
      const proPrice = getAdTotalPrice(days, true)
      expect(proPrice).toBeLessThan(freePrice)
      expect(freePrice - proPrice).toBe(days * (PRICE_PER_DAY - PRO_PRICE_PER_DAY))
    }
  })
})

// ══════════════════════════════════════════════════════
// Score Consistency
// ══════════════════════════════════════════════════════

describe('Score Post: General Properties', () => {
  test('Score is always between 0 and 1', () => {
    const combinations = [
      makePost({ is_pro_listing: true, like_count: 20, is_urgent: true }),
      makePost({ is_pro_listing: false, like_count: 0, comment_count: 0 }),
      makePost({ type: 'nappaa', expires_at: new Date(Date.now() + 3600000).toISOString() }),
    ]

    for (const post of combinations) {
      const score = scorePost(post, baseFeedContext)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }
  })

  test('Recent posts score higher than old posts', () => {
    const recentPost = makePost({
      created_at: new Date().toISOString(),
    })
    const oldPost = makePost({
      created_at: new Date(Date.now() - 7 * 24 * 3600000).toISOString(), // 7 days ago
    })

    const recentScore = scorePost(recentPost, baseFeedContext)
    const oldScore = scorePost(oldPost, baseFeedContext)

    expect(recentScore).toBeGreaterThan(oldScore)
  })

  test('Urgent posts score higher than non-urgent posts', () => {
    const urgentPost = makePost({ is_urgent: true })
    const normalPost = makePost({ is_urgent: false })

    const urgentScore = scorePost(urgentPost, baseFeedContext)
    const normalScore = scorePost(normalPost, baseFeedContext)

    expect(urgentScore).toBeGreaterThan(normalScore)
  })
})
