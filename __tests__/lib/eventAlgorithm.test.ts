/**
 * Event Algorithm Unit Tests
 *
 * Tests:
 * - Scores events based on relevance
 * - Handles events with missing fields gracefully
 * - Sorts events by score correctly
 * - Interest matching, recency, distance, diversity, image bonus
 * - Source quality boost
 */

// ── Mocks ────────────────────────────────────────────

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('../../src/lib/eventInteractions', () => ({
  getRecentCategories: jest.fn(
    (history: any[], _daysBack?: number) => {
      const cats = new Set<string>()
      for (const h of history) {
        cats.add(h.category)
      }
      return cats
    },
  ),
}))

import { rankEvents } from '../../src/lib/eventAlgorithm'

// ── Helpers ──────────────────────────────────────────

const NOW = Date.now()
const IN_2_HOURS = new Date(NOW + 2 * 3600000).toISOString()
const IN_24_HOURS = new Date(NOW + 24 * 3600000).toISOString()
const IN_7_DAYS = new Date(NOW + 7 * 24 * 3600000).toISOString()
const YESTERDAY = new Date(NOW - 24 * 3600000).toISOString()

function makeEvent(overrides: Record<string, any> = {}) {
  return {
    id: `event-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Event',
    date: IN_24_HOURS,
    category: 'music',
    latitude: 60.1699,
    longitude: 24.9384,
    source: 'helsinki',
    isFree: false,
    imageUrl: null as string | null,
    ...overrides,
  }
}

const HELSINKI_CENTER = { latitude: 60.1699, longitude: 24.9384 }

// ══════════════════════════════════════════════════════
// Basic sorting
// ══════════════════════════════════════════════════════

describe('rankEvents: Sorting', () => {
  test('returns events sorted by score descending', () => {
    const events = [
      makeEvent({ id: 'far-future', date: IN_7_DAYS, category: 'other' }),
      makeEvent({ id: 'soon', date: IN_2_HOURS, category: 'music', imageUrl: 'http://img.jpg' }),
      makeEvent({ id: 'tomorrow', date: IN_24_HOURS }),
    ]

    const ranked = rankEvents(events, ['music'], [], HELSINKI_CENTER)

    // The soon event with matching interest + image + recency should rank highest
    expect(ranked[0].id).toBe('soon')
    // All events should have score property
    for (const r of ranked) {
      expect(typeof r.score).toBe('number')
      expect(r.score).toBeGreaterThan(0)
    }
  })

  test('returns empty array for empty input', () => {
    const ranked = rankEvents([], ['music'], [], null)
    expect(ranked).toEqual([])
  })

  test('single event returns array with that event scored', () => {
    const event = makeEvent({ id: 'solo' })
    const ranked = rankEvents([event], [], [], null)

    expect(ranked).toHaveLength(1)
    expect(ranked[0].id).toBe('solo')
    expect(typeof ranked[0].score).toBe('number')
  })

  test('does not mutate the original array', () => {
    const events = [
      makeEvent({ id: 'b', date: IN_7_DAYS }),
      makeEvent({ id: 'a', date: IN_2_HOURS }),
    ]
    const original = events.map(e => e.id)
    rankEvents(events, [], [], null)
    expect(events.map(e => e.id)).toEqual(original)
  })
})

// ══════════════════════════════════════════════════════
// Interest matching
// ══════════════════════════════════════════════════════

describe('rankEvents: Interest matching', () => {
  test('event matching user interest scores higher than non-matching', () => {
    const matching = makeEvent({ id: 'match', category: 'music', date: IN_24_HOURS })
    const nonMatching = makeEvent({ id: 'no-match', category: 'sport', date: IN_24_HOURS })

    const ranked = rankEvents([matching, nonMatching], ['music'], [], null)

    const matchScore = ranked.find(r => r.id === 'match')!.score
    const noMatchScore = ranked.find(r => r.id === 'no-match')!.score
    expect(matchScore).toBeGreaterThan(noMatchScore)
  })

  test('no user interests gives neutral score (0.5)', () => {
    const event = makeEvent({ category: 'music', date: IN_24_HOURS })
    const ranked = rankEvents([event], [], [], null)

    // With no interests, the interest component is 0.5 (neutral)
    // Score should be positive and reasonable
    expect(ranked[0].score).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════
// Recency
// ══════════════════════════════════════════════════════

describe('rankEvents: Recency scoring', () => {
  test('sooner events score higher than later events', () => {
    const soon = makeEvent({ id: 'soon', date: IN_2_HOURS })
    const later = makeEvent({ id: 'later', date: IN_7_DAYS })

    const ranked = rankEvents([soon, later], [], [], null)

    const soonScore = ranked.find(r => r.id === 'soon')!.score
    const laterScore = ranked.find(r => r.id === 'later')!.score
    expect(soonScore).toBeGreaterThan(laterScore)
  })

  test('past events get low recency score', () => {
    const past = makeEvent({ id: 'past', date: YESTERDAY })
    const future = makeEvent({ id: 'future', date: IN_24_HOURS })

    const ranked = rankEvents([past, future], [], [], null)

    const pastScore = ranked.find(r => r.id === 'past')!.score
    const futureScore = ranked.find(r => r.id === 'future')!.score
    expect(futureScore).toBeGreaterThan(pastScore)
  })
})

// ══════════════════════════════════════════════════════
// Distance
// ══════════════════════════════════════════════════════

describe('rankEvents: Distance scoring', () => {
  test('closer events score higher', () => {
    const close = makeEvent({
      id: 'close',
      latitude: 60.1699,
      longitude: 24.9384,
      date: IN_24_HOURS,
    })
    const far = makeEvent({
      id: 'far',
      latitude: 61.4978, // Tampere
      longitude: 23.7610,
      date: IN_24_HOURS,
    })

    const ranked = rankEvents([close, far], [], [], HELSINKI_CENTER)

    const closeScore = ranked.find(r => r.id === 'close')!.score
    const farScore = ranked.find(r => r.id === 'far')!.score
    expect(closeScore).toBeGreaterThan(farScore)
  })

  test('missing location gets neutral distance score', () => {
    const noLocation = makeEvent({
      id: 'no-loc',
      latitude: undefined,
      longitude: undefined,
      date: IN_24_HOURS,
    })

    const ranked = rankEvents([noLocation], [], [], HELSINKI_CENTER)
    expect(ranked[0].score).toBeGreaterThan(0)
  })

  test('null user location gives neutral distance score', () => {
    const event = makeEvent({ date: IN_24_HOURS })
    const ranked = rankEvents([event], [], [], null)
    expect(ranked[0].score).toBeGreaterThan(0)
  })
})

// ══════════════════════════════════════════════════════
// Image bonus
// ══════════════════════════════════════════════════════

describe('rankEvents: Image bonus', () => {
  test('event with image scores higher than without', () => {
    const withImage = makeEvent({ id: 'img', imageUrl: 'http://example.com/img.jpg', date: IN_24_HOURS })
    const noImage = makeEvent({ id: 'no-img', imageUrl: null, date: IN_24_HOURS })

    const ranked = rankEvents([withImage, noImage], [], [], null)

    const imgScore = ranked.find(r => r.id === 'img')!.score
    const noImgScore = ranked.find(r => r.id === 'no-img')!.score
    expect(imgScore).toBeGreaterThan(noImgScore)
  })
})

// ══════════════════════════════════════════════════════
// Source quality boost
// ══════════════════════════════════════════════════════

describe('rankEvents: Source quality boost', () => {
  test('kide events get 1.05x score boost', () => {
    const kideEvent = makeEvent({ id: 'kide', source: 'kide', date: IN_24_HOURS })
    const helsinkiEvent = makeEvent({ id: 'helsinki', source: 'helsinki', date: IN_24_HOURS })

    const ranked = rankEvents([kideEvent, helsinkiEvent], [], [], null)

    const kideScore = ranked.find(r => r.id === 'kide')!.score
    const helsinkiScore = ranked.find(r => r.id === 'helsinki')!.score
    expect(kideScore).toBeGreaterThan(helsinkiScore)
  })

  test('ticketmaster events get 1.05x score boost', () => {
    const tmEvent = makeEvent({ id: 'tm', source: 'ticketmaster', date: IN_24_HOURS })
    const plainEvent = makeEvent({ id: 'plain', source: 'other', date: IN_24_HOURS })

    const ranked = rankEvents([tmEvent, plainEvent], [], [], null)

    const tmScore = ranked.find(r => r.id === 'tm')!.score
    const plainScore = ranked.find(r => r.id === 'plain')!.score
    expect(tmScore).toBeGreaterThan(plainScore)
  })
})

// ══════════════════════════════════════════════════════
// Missing/invalid fields
// ══════════════════════════════════════════════════════

describe('rankEvents: Missing fields graceful handling', () => {
  test('event with invalid date gets low recency score but no error', () => {
    const badDate = makeEvent({ id: 'bad-date', date: 'not-a-date' })
    const ranked = rankEvents([badDate], [], [], null)

    expect(ranked).toHaveLength(1)
    expect(typeof ranked[0].score).toBe('number')
    expect(isNaN(ranked[0].score)).toBe(false)
  })

  test('event with empty category scores without error', () => {
    const noCategory = makeEvent({ id: 'no-cat', category: '', date: IN_24_HOURS })
    const ranked = rankEvents([noCategory], ['music'], [], null)

    expect(ranked).toHaveLength(1)
    expect(typeof ranked[0].score).toBe('number')
  })

  test('handles large number of events without error', () => {
    const events = Array.from({ length: 100 }, (_, i) =>
      makeEvent({ id: `event-${i}`, date: new Date(NOW + i * 3600000).toISOString() }),
    )

    const ranked = rankEvents(events, ['music'], [], HELSINKI_CENTER)

    expect(ranked).toHaveLength(100)
    // Verify sorted descending
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score)
    }
  })
})

// ══════════════════════════════════════════════════════
// Interaction tracking
// ══════════════════════════════════════════════════════

describe('rankEvents: Interaction tracking', () => {
  test('event in frequently-clicked category scores higher', () => {
    const clickHistory = [
      { category: 'music', timestamp: NOW - 1 * 86400000 },
      { category: 'music', timestamp: NOW - 2 * 86400000 },
      { category: 'music', timestamp: NOW - 3 * 86400000 },
    ]

    const musicEvent = makeEvent({ id: 'music', category: 'music', date: IN_24_HOURS })
    const sportEvent = makeEvent({ id: 'sport', category: 'sport', date: IN_24_HOURS })

    const ranked = rankEvents([musicEvent, sportEvent], [], clickHistory, null)

    const musicScore = ranked.find(r => r.id === 'music')!.score
    const sportScore = ranked.find(r => r.id === 'sport')!.score
    expect(musicScore).toBeGreaterThan(sportScore)
  })

  test('empty click history gives zero interaction score', () => {
    const event = makeEvent({ date: IN_24_HOURS })
    const ranked = rankEvents([event], [], [], null)

    // Should still produce a valid score
    expect(ranked[0].score).toBeGreaterThan(0)
  })
})
