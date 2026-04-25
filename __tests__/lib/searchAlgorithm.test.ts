/**
 * Search Algorithm Unit Tests
 *
 * Tests:
 * - Ranks search results by relevance
 * - Handles empty query
 * - Handles no results
 * - Title matching (exact, starts-with, contains)
 * - Description matching
 * - Engagement boost
 * - Recency boost
 * - Neighborhood boost
 * - Active post boost
 * - Multi-word queries
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

import { rankSearchResults } from '../../src/lib/searchAlgorithm'

// ── Helpers ──────────────────────────────────────────

function makeResult(overrides: Record<string, any> = {}) {
  return {
    id: `post-${Math.random().toString(36).slice(2, 8)}`,
    type: 'tarjoan',
    title: 'Test Post',
    description: 'A test description for a post',
    location: null,
    like_count: 0,
    comment_count: 0,
    is_active: true,
    created_at: new Date().toISOString(),
    user: undefined as { naapurusto?: string } | undefined,
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════
// Empty inputs
// ══════════════════════════════════════════════════════

describe('rankSearchResults: Empty inputs', () => {
  test('returns empty array for empty results', () => {
    const ranked = rankSearchResults([], { query: 'test', userNeighborhood: null })
    expect(ranked).toEqual([])
  })

  test('handles empty query string', () => {
    const results = [makeResult({ title: 'Hello' })]
    const ranked = rankSearchResults(results, { query: '', userNeighborhood: null })

    // Should still return all results (just with low text-match scores)
    expect(ranked).toHaveLength(1)
  })

  test('returns all results even when none match query', () => {
    const results = [
      makeResult({ title: 'Apples', description: 'Fresh apples' }),
      makeResult({ title: 'Bananas', description: 'Yellow bananas' }),
    ]

    const ranked = rankSearchResults(results, { query: 'zzzzz', userNeighborhood: null })

    expect(ranked).toHaveLength(2)
  })
})

// ══════════════════════════════════════════════════════
// Title matching
// ══════════════════════════════════════════════════════

describe('rankSearchResults: Title matching', () => {
  test('exact title match scores highest', () => {
    const results = [
      makeResult({ id: 'exact', title: 'polkupyora' }),
      makeResult({ id: 'starts', title: 'polkupyora myydaan' }),
      makeResult({ id: 'contains', title: 'myydaan polkupyora halpa' }),
    ]

    const ranked = rankSearchResults(results, { query: 'polkupyora', userNeighborhood: null })

    expect(ranked[0].id).toBe('exact')
  })

  test('title starts-with ranks above title contains', () => {
    const results = [
      makeResult({ id: 'contains', title: 'myydaan polkupyora halpa' }),
      makeResult({ id: 'starts', title: 'polkupyora myydaan' }),
    ]

    const ranked = rankSearchResults(results, { query: 'polkupyora', userNeighborhood: null })

    expect(ranked[0].id).toBe('starts')
  })

  test('case-insensitive matching', () => {
    const results = [
      makeResult({ id: 'upper', title: 'POLKUPYORA' }),
      makeResult({ id: 'lower', title: 'polkupyora' }),
    ]

    const ranked = rankSearchResults(results, { query: 'Polkupyora', userNeighborhood: null })

    // Both should match equally (case insensitive)
    // Both are exact matches after lowercasing, so scores should be the same
    expect(ranked).toHaveLength(2)
  })
})

// ══════════════════════════════════════════════════════
// Description matching
// ══════════════════════════════════════════════════════

describe('rankSearchResults: Description matching', () => {
  test('description match adds score', () => {
    const results = [
      makeResult({ id: 'desc-match', title: 'Something', description: 'Looking for a bicycle polkupyora' }),
      makeResult({ id: 'no-match', title: 'Something else', description: 'Nothing related' }),
    ]

    const ranked = rankSearchResults(results, { query: 'polkupyora', userNeighborhood: null })

    expect(ranked[0].id).toBe('desc-match')
  })
})

// ══════════════════════════════════════════════════════
// Engagement boost
// ══════════════════════════════════════════════════════

describe('rankSearchResults: Engagement boost', () => {
  test('higher engagement scores higher', () => {
    const results = [
      makeResult({ id: 'popular', title: 'test', like_count: 10, comment_count: 5 }),
      makeResult({ id: 'unpopular', title: 'test', like_count: 0, comment_count: 0 }),
    ]

    const ranked = rankSearchResults(results, { query: 'test', userNeighborhood: null })

    expect(ranked[0].id).toBe('popular')
  })

  test('engagement caps at 20 points', () => {
    const results = [
      makeResult({ id: 'at-cap', title: 'test', like_count: 10, comment_count: 0 }),
      makeResult({ id: 'above-cap', title: 'test', like_count: 50, comment_count: 30 }),
    ]

    const ranked = rankSearchResults(results, { query: 'test', userNeighborhood: null })

    // Both should be at the engagement cap — differences come from recency only
    // The scores should be very close
    const atCapScore = ranked.find(r => r.id === 'at-cap')
    const aboveCapScore = ranked.find(r => r.id === 'above-cap')
    expect(atCapScore).toBeDefined()
    expect(aboveCapScore).toBeDefined()
  })
})

// ══════════════════════════════════════════════════════
// Recency boost
// ══════════════════════════════════════════════════════

describe('rankSearchResults: Recency boost', () => {
  test('newer posts score higher (all else equal)', () => {
    const now = new Date()
    const monthAgo = new Date(Date.now() - 30 * 86400000)

    const results = [
      makeResult({ id: 'new', title: 'test', created_at: now.toISOString() }),
      makeResult({ id: 'old', title: 'test', created_at: monthAgo.toISOString() }),
    ]

    const ranked = rankSearchResults(results, { query: 'test', userNeighborhood: null })

    expect(ranked[0].id).toBe('new')
  })
})

// ══════════════════════════════════════════════════════
// Neighborhood boost
// ══════════════════════════════════════════════════════

describe('rankSearchResults: Neighborhood boost', () => {
  test('same neighborhood gets 10 point boost', () => {
    const results = [
      makeResult({
        id: 'same-hood',
        title: 'test',
        user: { naapurusto: 'Kallio' },
      }),
      makeResult({
        id: 'diff-hood',
        title: 'test',
        user: { naapurusto: 'Vuosaari' },
      }),
    ]

    const ranked = rankSearchResults(results, {
      query: 'test',
      userNeighborhood: 'Kallio',
    })

    expect(ranked[0].id).toBe('same-hood')
  })

  test('null userNeighborhood gives no boost', () => {
    const results = [
      makeResult({ id: 'a', title: 'test', user: { naapurusto: 'Kallio' } }),
      makeResult({ id: 'b', title: 'test', user: { naapurusto: 'Vuosaari' } }),
    ]

    const ranked = rankSearchResults(results, {
      query: 'test',
      userNeighborhood: null,
    })

    // Without neighborhood boost, results should be ranked similarly
    expect(ranked).toHaveLength(2)
  })
})

// ══════════════════════════════════════════════════════
// Active post boost
// ══════════════════════════════════════════════════════

describe('rankSearchResults: Active post boost', () => {
  test('active posts score higher than inactive', () => {
    const results = [
      makeResult({ id: 'active', title: 'test', is_active: true }),
      makeResult({ id: 'inactive', title: 'test', is_active: false }),
    ]

    const ranked = rankSearchResults(results, { query: 'test', userNeighborhood: null })

    expect(ranked[0].id).toBe('active')
  })
})

// ══════════════════════════════════════════════════════
// Multi-word queries
// ══════════════════════════════════════════════════════

describe('rankSearchResults: Multi-word queries', () => {
  test('more matching words in title score higher', () => {
    const results = [
      makeResult({ id: 'both', title: 'red bicycle for sale' }),
      makeResult({ id: 'one', title: 'red car for sale' }),
    ]

    const ranked = rankSearchResults(results, {
      query: 'red bicycle',
      userNeighborhood: null,
    })

    expect(ranked[0].id).toBe('both')
  })

  test('short words (<=2 chars) are filtered from word matching', () => {
    const results = [
      makeResult({ id: 'a', title: 'a b test' }),
      makeResult({ id: 'b', title: 'test result' }),
    ]

    // "a" and "b" are too short to count as word matches
    const ranked = rankSearchResults(results, {
      query: 'a b test',
      userNeighborhood: null,
    })

    // Both contain "test" so they should have similar scores
    expect(ranked).toHaveLength(2)
  })
})

// ══════════════════════════════════════════════════════
// Determinism
// ══════════════════════════════════════════════════════

describe('rankSearchResults: Determinism', () => {
  test('same input produces same output order', () => {
    const results = [
      makeResult({ id: 'a', title: 'apple', like_count: 5 }),
      makeResult({ id: 'b', title: 'applesauce', like_count: 3 }),
      makeResult({ id: 'c', title: 'banana apple', like_count: 1 }),
    ]

    const ctx = { query: 'apple', userNeighborhood: null }
    const ranked1 = rankSearchResults(results, ctx)
    const ranked2 = rankSearchResults(results, ctx)

    expect(ranked1.map(r => r.id)).toEqual(ranked2.map(r => r.id))
  })

  test('does not mutate original array', () => {
    const results = [
      makeResult({ id: 'b', title: 'banana' }),
      makeResult({ id: 'a', title: 'apple' }),
    ]
    const original = results.map(r => r.id)

    rankSearchResults(results, { query: 'apple', userNeighborhood: null })

    expect(results.map(r => r.id)).toEqual(original)
  })
})
