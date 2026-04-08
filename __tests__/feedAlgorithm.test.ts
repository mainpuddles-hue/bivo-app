/**
 * Feed Algorithm Unit Tests
 *
 * Tests scorePost(), rankFeed(), and enforceBoostedCap() logic:
 * - Recency decay, engagement, urgency, proximity, trust, personalization
 * - Boost multiplier (1.4x)
 * - Pro listings sorted above non-Pro
 * - Boosted cap: max 2 boosted posts in top 10
 * - Edge cases: null values, empty arrays, missing fields
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

import { scorePost, rankFeed } from '../src/lib/feedAlgorithm'
import type { Post } from '../src/lib/types'

// ── Helpers ──────────────────────────────────────────

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    user_id: 'user-1',
    type: 'tarjoan',
    title: 'Test post',
    description: 'A test post',
    location: null,
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

const NOW = Date.now()

const baseCtx = {
  userNeighborhood: null as string | null,
  followedIds: [] as string[],
  now: NOW,
}

// ══════════════════════════════════════════════════════
// scorePost — Recency
// ══════════════════════════════════════════════════════

describe('scorePost: Recency decay', () => {
  test('A just-created post has higher score than a 24h old post', () => {
    const fresh = makePost({ created_at: new Date(NOW).toISOString() })
    const dayOld = makePost({ created_at: new Date(NOW - 24 * 3600000).toISOString() })

    expect(scorePost(fresh, baseCtx)).toBeGreaterThan(scorePost(dayOld, baseCtx))
  })

  test('A 24h old post has higher score than a 7d old post', () => {
    const dayOld = makePost({ created_at: new Date(NOW - 24 * 3600000).toISOString() })
    const weekOld = makePost({ created_at: new Date(NOW - 7 * 24 * 3600000).toISOString() })

    expect(scorePost(dayOld, baseCtx)).toBeGreaterThan(scorePost(weekOld, baseCtx))
  })

  test('Recency decays monotonically as age increases', () => {
    const ages = [0, 1, 6, 12, 24, 48, 168] // hours
    const scores = ages.map(h =>
      scorePost(makePost({ created_at: new Date(NOW - h * 3600000).toISOString() }), baseCtx)
    )

    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThan(scores[i - 1])
    }
  })
})

// ══════════════════════════════════════════════════════
// scorePost — Engagement
// ══════════════════════════════════════════════════════

describe('scorePost: Engagement', () => {
  test('More likes + comments produce a higher score', () => {
    const low = makePost({ like_count: 0, comment_count: 0 })
    const mid = makePost({ like_count: 3, comment_count: 1 })
    const high = makePost({ like_count: 10, comment_count: 5 })

    const sLow = scorePost(low, baseCtx)
    const sMid = scorePost(mid, baseCtx)
    const sHigh = scorePost(high, baseCtx)

    expect(sMid).toBeGreaterThan(sLow)
    expect(sHigh).toBeGreaterThan(sMid)
  })

  test('Engagement caps at 20 interactions (normalized to 1)', () => {
    const atCap = makePost({ like_count: 20, comment_count: 0 })
    const aboveCap = makePost({ like_count: 50, comment_count: 20 })

    // Both should produce the same engagement component
    expect(scorePost(atCap, baseCtx)).toBeCloseTo(scorePost(aboveCap, baseCtx), 5)
  })

  test('Comments count double: 1 comment = 2 interactions', () => {
    // 5 likes + 0 comments = 5 interactions
    const likesOnly = makePost({ like_count: 5, comment_count: 0 })
    // 1 like + 2 comments = 1 + 4 = 5 interactions
    const commentsOnly = makePost({ like_count: 1, comment_count: 2 })

    expect(scorePost(likesOnly, baseCtx)).toBeCloseTo(scorePost(commentsOnly, baseCtx), 5)
  })
})

// ══════════════════════════════════════════════════════
// scorePost — Urgency
// ══════════════════════════════════════════════════════

describe('scorePost: Urgency', () => {
  test('Urgent posts get urgency=1.0 (full weight)', () => {
    const urgent = makePost({ is_urgent: true })
    const normal = makePost({ is_urgent: false })

    const diff = scorePost(urgent, baseCtx) - scorePost(normal, baseCtx)
    // urgency weight = 0.20, urgency=1.0 vs 0 => diff = 0.20
    expect(diff).toBeCloseTo(0.20, 2)
  })

  test('Nappaa expiring within 8h gets urgency=0.8', () => {
    const expiresIn4h = makePost({
      type: 'nappaa',
      expires_at: new Date(NOW + 4 * 3600000).toISOString(),
    })
    const noExpiry = makePost({ type: 'nappaa', expires_at: null })

    const diff = scorePost(expiresIn4h, baseCtx) - scorePost(noExpiry, baseCtx)
    // urgency weight = 0.20, urgency=0.8 vs 0 => diff = 0.16
    expect(diff).toBeCloseTo(0.16, 2)
  })

  test('Nappaa expiring in more than 8h gets urgency=0', () => {
    const expiresIn24h = makePost({
      type: 'nappaa',
      expires_at: new Date(NOW + 24 * 3600000).toISOString(),
    })
    const noExpiry = makePost({ type: 'nappaa', expires_at: null })

    expect(scorePost(expiresIn24h, baseCtx)).toBeCloseTo(scorePost(noExpiry, baseCtx), 5)
  })

  test('Already expired nappaa gets urgency=0 (timeLeft < 0)', () => {
    const expired = makePost({
      type: 'nappaa',
      expires_at: new Date(NOW - 3600000).toISOString(),
    })
    const noExpiry = makePost({ type: 'nappaa', expires_at: null })

    expect(scorePost(expired, baseCtx)).toBeCloseTo(scorePost(noExpiry, baseCtx), 5)
  })
})

// ══════════════════════════════════════════════════════
// scorePost — Proximity
// ══════════════════════════════════════════════════════

describe('scorePost: Proximity', () => {
  test('Post in user neighborhood gets proximity bonus via location match', () => {
    const ctx = { ...baseCtx, userNeighborhood: 'Kallio' }
    const local = makePost({ location: 'Kallio' })
    const distant = makePost({ location: 'Vuosaari' })

    expect(scorePost(local, ctx)).toBeGreaterThan(scorePost(distant, ctx))
  })

  test('Post by user in same naapurusto gets 0.8 proximity', () => {
    const ctx = { ...baseCtx, userNeighborhood: 'Kallio' }
    const sameHood = makePost({
      location: null,
      user: {
        id: 'u1', email: null, name: 'Test', avatar_url: null, bio: '',
        naapurusto: 'Kallio', response_rate: 0, is_hub: false, is_pro: false,
        pro_expires_at: null, profile_visibility: 'everyone' as const,
        location_accuracy: 'area' as const, notifications_enabled: true,
        language: 'fi', onboarding_completed: true, is_admin: false,
        is_business: false, business_name: null, business_vat_id: null,
        stripe_connect_onboarded: false, created_at: '', updated_at: '',
      },
    })
    const differentHood = makePost({ location: null })

    expect(scorePost(sameHood, ctx)).toBeGreaterThan(scorePost(differentHood, ctx))
  })

  test('No proximity bonus when userNeighborhood is null', () => {
    const ctx = { ...baseCtx, userNeighborhood: null }
    const localPost = makePost({ location: 'Kallio' })
    const noLocationPost = makePost({ location: null })

    // Both should score the same on the proximity component
    expect(scorePost(localPost, ctx)).toBeCloseTo(scorePost(noLocationPost, ctx), 5)
  })

  test('Location match is case-insensitive', () => {
    const ctx = { ...baseCtx, userNeighborhood: 'kallio' }
    const upperCase = makePost({ location: 'KALLIO, Helsinki' })
    const noLocation = makePost({ location: null })

    expect(scorePost(upperCase, ctx)).toBeGreaterThan(scorePost(noLocation, ctx))
  })
})

// ══════════════════════════════════════════════════════
// scorePost — Boost bonus
// ══════════════════════════════════════════════════════

describe('scorePost: Boost bonus', () => {
  test('Boosted post gets 1.4x score multiplier', () => {
    const boostedCtx = {
      ...baseCtx,
      boostedPostIds: new Set(['post-1']),
    }
    const unboostedCtx = {
      ...baseCtx,
      boostedPostIds: new Set<string>(),
    }

    const post = makePost({ id: 'post-1' })
    const boostedScore = scorePost(post, boostedCtx)
    const unboostedScore = scorePost(post, unboostedCtx)
    expect(boostedScore).toBeCloseTo(unboostedScore * 1.4, 5)
  })

  test('Non-boosted post gets 0 boost bonus', () => {
    const ctx = {
      ...baseCtx,
      boostedPostIds: new Set(['other-post']),
    }
    const post = makePost({ id: 'post-1' })
    const ctxNoBoosted = { ...baseCtx }

    expect(scorePost(post, ctx)).toBeCloseTo(scorePost(post, ctxNoBoosted), 5)
  })

  test('Boosted post score is 1.4x base score (multiplicative)', () => {
    const ctx = {
      ...baseCtx,
      userNeighborhood: 'Kallio',
      boostedPostIds: new Set(['post-1']),
    }
    const ctxNoBoosted = {
      ...baseCtx,
      userNeighborhood: 'Kallio',
    }
    const post = makePost({
      id: 'post-1',
      is_urgent: true,
      like_count: 20,
      comment_count: 10,
      location: 'Kallio',
    })

    const boostedScore = scorePost(post, ctx)
    const baseScore = scorePost(post, ctxNoBoosted)
    // With 1.4x multiplier, boosted score should be 1.4 * base
    expect(boostedScore).toBeCloseTo(baseScore * 1.4, 5)
  })
})

// ══════════════════════════════════════════════════════
// scorePost — Personalization
// ══════════════════════════════════════════════════════

describe('scorePost: Personalization', () => {
  test('Post with high personalization score ranks higher', () => {
    const personalCtx = {
      ...baseCtx,
      personalScores: new Map([['post-1', 0.9]]),
    }
    const post = makePost({ id: 'post-1' })

    expect(scorePost(post, personalCtx)).toBeGreaterThan(scorePost(post, baseCtx))
  })

  test('Personalization defaults to 0 when map has no entry', () => {
    const ctx = {
      ...baseCtx,
      personalScores: new Map([['other-post', 0.9]]),
    }
    const post = makePost({ id: 'post-1' })

    expect(scorePost(post, ctx)).toBeCloseTo(scorePost(post, baseCtx), 5)
  })
})

// ══════════════════════════════════════════════════════
// scorePost — Following bonus
// ══════════════════════════════════════════════════════

describe('scorePost: Following bonus', () => {
  test('Post from a followed user scores higher', () => {
    const followingCtx = {
      ...baseCtx,
      followedIds: ['user-1'],
    }
    const post = makePost({ user_id: 'user-1' })

    expect(scorePost(post, followingCtx)).toBeGreaterThan(scorePost(post, baseCtx))
  })
})

// ══════════════════════════════════════════════════════
// scorePost — Edge cases
// ══════════════════════════════════════════════════════

describe('scorePost: Edge cases', () => {
  test('Post with null like_count and comment_count scores without error', () => {
    const post = makePost({ like_count: undefined as any, comment_count: undefined as any })
    const score = scorePost(post, baseCtx)
    expect(typeof score).toBe('number')
    expect(isNaN(score)).toBe(false)
  })

  test('Post with no user field scores without error', () => {
    const post = makePost()
    delete (post as any).user
    const score = scorePost(post, baseCtx)
    expect(typeof score).toBe('number')
    expect(isNaN(score)).toBe(false)
  })

  test('Score is deterministic for same input', () => {
    const post = makePost({ like_count: 5, comment_count: 2 })
    const ctx = { ...baseCtx, now: 1700000000000 }
    const s1 = scorePost(post, ctx)
    const s2 = scorePost(post, ctx)
    expect(s1).toBe(s2)
  })

  test('ctx.now defaults to Date.now() if omitted', () => {
    const ctx = { userNeighborhood: null, followedIds: [] as string[] }
    const post = makePost()
    const score = scorePost(post, ctx)
    expect(typeof score).toBe('number')
    expect(score).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════
// rankFeed
// ══════════════════════════════════════════════════════

describe('rankFeed: Sorting', () => {
  test('Returns posts sorted by score descending', () => {
    const posts = [
      makePost({ id: 'old', created_at: new Date(NOW - 7 * 24 * 3600000).toISOString(), like_count: 0 }),
      makePost({ id: 'new', created_at: new Date(NOW).toISOString(), like_count: 10 }),
      makePost({ id: 'mid', created_at: new Date(NOW - 24 * 3600000).toISOString(), like_count: 5 }),
    ]

    const ranked = rankFeed(posts, baseCtx)
    expect(ranked[0].id).toBe('new')
    expect(ranked[ranked.length - 1].id).toBe('old')
  })

  test('Pro listings always come before non-Pro regardless of score', () => {
    const posts = [
      makePost({ id: 'popular', is_pro_listing: false, like_count: 20, comment_count: 10, is_urgent: true }),
      makePost({ id: 'pro', is_pro_listing: true, like_count: 0, comment_count: 0 }),
    ]

    const ranked = rankFeed(posts, baseCtx)
    expect(ranked[0].id).toBe('pro')
    expect(ranked[1].id).toBe('popular')
  })

  test('Multiple Pro listings sorted by score among themselves', () => {
    const posts = [
      makePost({ id: 'pro-low', is_pro_listing: true, like_count: 0 }),
      makePost({ id: 'pro-high', is_pro_listing: true, like_count: 15, comment_count: 5 }),
      makePost({ id: 'regular', is_pro_listing: false, like_count: 50 }),
    ]

    const ranked = rankFeed(posts, baseCtx)
    expect(ranked[0].id).toBe('pro-high')
    expect(ranked[1].id).toBe('pro-low')
    expect(ranked[2].id).toBe('regular')
  })

  test('Does not mutate the original array', () => {
    const posts = [
      makePost({ id: 'b' }),
      makePost({ id: 'a', is_pro_listing: true }),
    ]
    const original = [...posts]
    rankFeed(posts, baseCtx)
    expect(posts.map(p => p.id)).toEqual(original.map(p => p.id))
  })

  test('Empty array returns empty array', () => {
    expect(rankFeed([], baseCtx)).toEqual([])
  })

  test('Single post returns array with that post', () => {
    const post = makePost({ id: 'only' })
    const ranked = rankFeed([post], baseCtx)
    expect(ranked).toHaveLength(1)
    expect(ranked[0].id).toBe('only')
  })
})

// ══════════════════════════════════════════════════════
// enforceBoostedCap (tested via rankFeed)
// ══════════════════════════════════════════════════════

describe('rankFeed: enforceBoostedCap', () => {
  test('Max 2 boosted posts in top 10 positions', () => {
    // Create 15 posts: 5 are boosted, all boosted get 1.4x so they naturally rise
    const posts: Post[] = []
    for (let i = 0; i < 15; i++) {
      posts.push(makePost({
        id: `post-${i}`,
        created_at: new Date(NOW - i * 3600000).toISOString(), // each 1h apart
        like_count: 15 - i,
      }))
    }

    const boostedIds = new Set(['post-0', 'post-1', 'post-2', 'post-3', 'post-4'])
    const ctx = { ...baseCtx, boostedPostIds: boostedIds }

    const ranked = rankFeed(posts, ctx)
    const top10 = ranked.slice(0, 10)
    const boostedInTop10 = top10.filter(p => boostedIds.has(p.id))

    expect(boostedInTop10.length).toBeLessThanOrEqual(2)
  })

  test('When only 1 boosted post exists, it stays in top 10', () => {
    const posts: Post[] = []
    for (let i = 0; i < 12; i++) {
      posts.push(makePost({
        id: `post-${i}`,
        created_at: new Date(NOW - i * 3600000).toISOString(),
      }))
    }

    const boostedIds = new Set(['post-0'])
    const ctx = { ...baseCtx, boostedPostIds: boostedIds }

    const ranked = rankFeed(posts, ctx)
    const top10 = ranked.slice(0, 10)
    const boostedInTop10 = top10.filter(p => boostedIds.has(p.id))

    expect(boostedInTop10.length).toBe(1)
  })

  test('When exactly 2 boosted posts in top 10, no overflow happens', () => {
    const posts: Post[] = []
    for (let i = 0; i < 12; i++) {
      posts.push(makePost({
        id: `post-${i}`,
        created_at: new Date(NOW - i * 3600000).toISOString(),
      }))
    }

    const boostedIds = new Set(['post-0', 'post-1'])
    const ctx = { ...baseCtx, boostedPostIds: boostedIds }

    const ranked = rankFeed(posts, ctx)
    const top10 = ranked.slice(0, 10)
    const boostedInTop10 = top10.filter(p => boostedIds.has(p.id))

    expect(boostedInTop10.length).toBe(2)
  })

  test('When no boosted posts, feed is unchanged', () => {
    const posts: Post[] = []
    for (let i = 0; i < 5; i++) {
      posts.push(makePost({
        id: `post-${i}`,
        created_at: new Date(NOW - i * 3600000).toISOString(),
        like_count: 5 - i,
      }))
    }

    const ctx1 = { ...baseCtx }
    const ctx2 = { ...baseCtx, boostedPostIds: new Set<string>() }

    const ranked1 = rankFeed(posts, ctx1)
    const ranked2 = rankFeed(posts, ctx2)

    expect(ranked1.map(p => p.id)).toEqual(ranked2.map(p => p.id))
  })

  test('Overflow boosted posts are pushed after position 10, not lost', () => {
    const posts: Post[] = []
    for (let i = 0; i < 15; i++) {
      posts.push(makePost({
        id: `post-${i}`,
        created_at: new Date(NOW - i * 3600000).toISOString(),
      }))
    }

    const boostedIds = new Set(['post-0', 'post-1', 'post-2', 'post-3'])
    const ctx = { ...baseCtx, boostedPostIds: boostedIds }

    const ranked = rankFeed(posts, ctx)

    // All 15 posts should still be in the result
    expect(ranked).toHaveLength(15)

    // All boosted posts should still appear somewhere
    for (const id of boostedIds) {
      expect(ranked.some(p => p.id === id)).toBe(true)
    }
  })
})
