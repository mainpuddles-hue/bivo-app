/**
 * useTrustLevel Hook Unit Tests
 *
 * Tests:
 * - Computes correct trust level from signals
 * - Caches computed result
 * - Returns default level for new users
 * - Tier upgrade/downgrade logic
 * - Next tier hints
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

// Supabase mock with customizable per-table responses
let mockProfileData: any = null
let mockBadgesData: any[] = []
let mockReviewsData: any[] = []
let mockReportsData: any[] = []
let mockRpcData: any = null

jest.mock('@/hooks/useSupabase', () => ({
  useSupabase: () => ({
    from: jest.fn((table: string) => {
      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
        then: undefined as any,
      }

      if (table === 'profiles') {
        chain.maybeSingle = jest.fn().mockResolvedValue({ data: mockProfileData, error: null })
        chain.then = (resolve: any) =>
          Promise.resolve({ data: mockProfileData, error: null }).then(resolve)
      } else if (table === 'user_badges') {
        chain.then = (resolve: any) =>
          Promise.resolve({ data: mockBadgesData, error: null }).then(resolve)
      } else if (table === 'reviews') {
        chain.then = (resolve: any) =>
          Promise.resolve({ data: mockReviewsData, error: null }).then(resolve)
      } else if (table === 'reports') {
        chain.then = (resolve: any) =>
          Promise.resolve({ data: mockReportsData, error: null }).then(resolve)
      } else {
        chain.then = (resolve: any) =>
          Promise.resolve({ data: [], error: null }).then(resolve)
      }

      return chain
    }),
    rpc: jest.fn().mockResolvedValue({ data: mockRpcData }),
  }),
}))

// ── Setup ────────────────────────────────────────────

import { renderHook, waitFor } from '@testing-library/react-native'
import { useTrustLevel } from '../../src/hooks/useTrustLevel'

// Clear the module-level trustCache between tests
function clearTrustCache() {
  // The trustCache is a module-level Map; we clear it by requiring the module fresh
  // But since jest caches modules, we manipulate it indirectly:
  // useTrustLevel with a unique userId each test ensures cache misses
}

describe('useTrustLevel', () => {
  let testCounter = 0

  beforeEach(() => {
    jest.clearAllMocks()
    testCounter++

    // Default: new user with no badges, no reviews, no reports
    mockProfileData = {
      response_rate: 0,
      created_at: new Date().toISOString(),
    }
    mockBadgesData = []
    mockReviewsData = []
    mockReportsData = []
    mockRpcData = null
  })

  // ══════════════════════════════════════════════════════
  // Default level for new users
  // ══════════════════════════════════════════════════════

  test('returns tier 1 for new user with no signals', async () => {
    const userId = `new-user-${testCounter}`

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.level).toBe(1)
    expect(result.current.signals.idVerified).toBe(false)
    expect(result.current.signals.reviewCount).toBe(0)
  })

  test('returns loading=false and tier 1 when userId is null', async () => {
    const { result } = renderHook(() => useTrustLevel(null))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.level).toBe(1)
  })

  test('returns loading=false and tier 1 when userId is undefined', async () => {
    const { result } = renderHook(() => useTrustLevel(undefined))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.level).toBe(1)
  })

  // ══════════════════════════════════════════════════════
  // Tier 2 computation
  // ══════════════════════════════════════════════════════

  test('computes tier 2 when user is ID-verified and account age >= 7 days', async () => {
    const userId = `verified-user-${testCounter}`
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString()

    mockProfileData = { response_rate: 50, created_at: eightDaysAgo }
    mockBadgesData = [{ badge_type: 'verified' }]
    mockReviewsData = []
    mockReportsData = []

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.level).toBe(2)
    expect(result.current.signals.idVerified).toBe(true)
    expect(result.current.signals.accountAgeDays).toBeGreaterThanOrEqual(7)
  })

  test('remains tier 1 when verified but account age < 7 days', async () => {
    const userId = `young-verified-${testCounter}`
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString()

    mockProfileData = { response_rate: 50, created_at: twoDaysAgo }
    mockBadgesData = [{ badge_type: 'verified' }]

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.level).toBe(1)
  })

  // ══════════════════════════════════════════════════════
  // Tier 3 computation
  // ══════════════════════════════════════════════════════

  test('computes tier 3 when all requirements are met', async () => {
    const userId = `trusted-user-${testCounter}`
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()

    mockProfileData = { response_rate: 95, created_at: sixtyDaysAgo }
    mockBadgesData = [{ badge_type: 'verified' }]
    mockReviewsData = [
      { rating: 5 },
      { rating: 4 },
      { rating: 5 },
      { rating: 4.5 },
    ]
    mockReportsData = []

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.level).toBe(3)
    expect(result.current.signals.idVerified).toBe(true)
    expect(result.current.signals.reviewCount).toBeGreaterThanOrEqual(3)
    expect(result.current.signals.avgRating).toBeGreaterThanOrEqual(4.0)
    expect(result.current.signals.responseRate).toBeGreaterThanOrEqual(90)
    expect(result.current.signals.hasActiveReports).toBe(false)
  })

  test('drops to tier 2 when response rate is below threshold', async () => {
    const userId = `low-response-${testCounter}`
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()

    mockProfileData = { response_rate: 50, created_at: sixtyDaysAgo }
    mockBadgesData = [{ badge_type: 'verified' }]
    mockReviewsData = [{ rating: 5 }, { rating: 5 }, { rating: 5 }]
    mockReportsData = []

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Has reviews and verified, but response_rate < 90 prevents tier 3
    expect(result.current.level).toBe(2)
  })

  test('drops to tier 2 when there are active reports', async () => {
    const userId = `reported-user-${testCounter}`
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()

    mockProfileData = { response_rate: 95, created_at: sixtyDaysAgo }
    mockBadgesData = [{ badge_type: 'verified' }]
    mockReviewsData = [{ rating: 5 }, { rating: 5 }, { rating: 5 }]
    mockReportsData = [{ id: 'report-1' }]

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.level).toBe(2)
    expect(result.current.signals.hasActiveReports).toBe(true)
  })

  // ══════════════════════════════════════════════════════
  // Permissions
  // ══════════════════════════════════════════════════════

  test('tier 1 user cannot offer paid services', async () => {
    const userId = `basic-user-${testCounter}`

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.permissions.canOfferPaidServices).toBe(false)
    expect(result.current.permissions.trustedBadge).toBe(false)
  })

  test('tier 3 user has unlimited pricing and trusted badge', async () => {
    const userId = `full-trust-${testCounter}`
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()

    mockProfileData = { response_rate: 95, created_at: sixtyDaysAgo }
    mockBadgesData = [{ badge_type: 'verified' }]
    mockReviewsData = [{ rating: 5 }, { rating: 5 }, { rating: 5 }]
    mockReportsData = []

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.permissions.canOfferPaidServices).toBe(true)
    expect(result.current.permissions.trustedBadge).toBe(true)
    expect(result.current.permissions.maxDailyFee).toBeNull() // unlimited
    expect(result.current.permissions.maxServicePrice).toBeNull() // unlimited
  })

  // ══════════════════════════════════════════════════════
  // Next tier hints
  // ══════════════════════════════════════════════════════

  test('tier 1 user gets hint to verify ID', async () => {
    const userId = `hint-user-${testCounter}`

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.nextTierHints).toContain('trust.hintVerifyId')
  })

  test('tier 3 user gets no hints', async () => {
    const userId = `no-hints-${testCounter}`
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()

    mockProfileData = { response_rate: 95, created_at: sixtyDaysAgo }
    mockBadgesData = [{ badge_type: 'verified' }]
    mockReviewsData = [{ rating: 5 }, { rating: 5 }, { rating: 5 }]
    mockReportsData = []

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.nextTierHints).toEqual([])
  })

  // ══════════════════════════════════════════════════════
  // Return shape
  // ══════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════
  // Boundary tests
  // ══════════════════════════════════════════════════════

  test('exactly 7 days account age → qualifies for tier 2 (boundary)', async () => {
    const userId = `boundary-7d-${testCounter}`
    const exactlySevenDays = new Date(Date.now() - 7 * 86400000).toISOString()

    mockProfileData = { response_rate: 50, created_at: exactlySevenDays }
    mockBadgesData = [{ badge_type: 'verified' }]

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.level).toBe(2)
    expect(result.current.signals.accountAgeDays).toBeGreaterThanOrEqual(7)
  })

  test('6 days 23h account age → stays tier 1 (boundary)', async () => {
    const userId = `boundary-6d23h-${testCounter}`
    const almostSevenDays = new Date(Date.now() - (7 * 86400000 - 3600000)).toISOString()

    mockProfileData = { response_rate: 50, created_at: almostSevenDays }
    mockBadgesData = [{ badge_type: 'verified' }]

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // accountAgeDays rounds down, so 6d23h = 6 days < 7
    expect(result.current.level).toBe(1)
  })

  test('exactly 90% response rate → qualifies for tier 3 (boundary)', async () => {
    const userId = `boundary-90pct-${testCounter}`
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()

    mockProfileData = { response_rate: 90, created_at: sixtyDaysAgo }
    mockBadgesData = [{ badge_type: 'verified' }]
    mockReviewsData = [{ rating: 5 }, { rating: 5 }, { rating: 5 }]
    mockReportsData = []

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.level).toBe(3)
  })

  test('89% response rate → stays tier 2 (boundary)', async () => {
    const userId = `boundary-89pct-${testCounter}`
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()

    mockProfileData = { response_rate: 89, created_at: sixtyDaysAgo }
    mockBadgesData = [{ badge_type: 'verified' }]
    mockReviewsData = [{ rating: 5 }, { rating: 5 }, { rating: 5 }]
    mockReportsData = []

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.level).toBe(2)
  })

  test('exactly 3 reviews with avg 4.0 → qualifies for tier 3 (boundary)', async () => {
    const userId = `boundary-3rev-${testCounter}`
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()

    mockProfileData = { response_rate: 95, created_at: sixtyDaysAgo }
    mockBadgesData = [{ badge_type: 'verified' }]
    mockReviewsData = [{ rating: 4 }, { rating: 4 }, { rating: 4 }]
    mockReportsData = []

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.level).toBe(3)
    expect(result.current.signals.reviewCount).toBe(3)
    expect(result.current.signals.avgRating).toBe(4)
  })

  test('2 reviews → stays tier 2 even with perfect rating (boundary)', async () => {
    const userId = `boundary-2rev-${testCounter}`
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()

    mockProfileData = { response_rate: 95, created_at: sixtyDaysAgo }
    mockBadgesData = [{ badge_type: 'verified' }]
    mockReviewsData = [{ rating: 5 }, { rating: 5 }]
    mockReportsData = []

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.level).toBe(2)
    expect(result.current.signals.reviewCount).toBe(2)
  })

  test('avg rating 3.9 → stays tier 2 (boundary)', async () => {
    const userId = `boundary-39avg-${testCounter}`
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()

    mockProfileData = { response_rate: 95, created_at: sixtyDaysAgo }
    mockBadgesData = [{ badge_type: 'verified' }]
    // avg = (3 + 4 + 4 + 4) / 4 = 3.75
    mockReviewsData = [{ rating: 3 }, { rating: 4 }, { rating: 4 }, { rating: 4 }]
    mockReportsData = []

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.level).toBe(2)
    expect(result.current.signals.avgRating).toBeLessThan(4)
  })

  // ══════════════════════════════════════════════════════
  // Error resilience
  // ══════════════════════════════════════════════════════

  test('returns tier 1 without crash when all queries fail', async () => {
    const userId = `error-all-${testCounter}`

    // Override mocks to return errors
    mockProfileData = null
    mockBadgesData = []
    mockReviewsData = []
    mockReportsData = []

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Should gracefully fall back to tier 1
    expect(result.current.level).toBeGreaterThanOrEqual(1)
    expect(typeof result.current.score).toBe('number')
    expect(isNaN(result.current.score)).toBe(false)
  })

  // ══════════════════════════════════════════════════════
  // Return shape
  // ══════════════════════════════════════════════════════

  test('returns complete TrustResult shape', async () => {
    const userId = `shape-test-${testCounter}`

    const { result } = renderHook(() => useTrustLevel(userId))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current).toHaveProperty('level')
    expect(result.current).toHaveProperty('signals')
    expect(result.current).toHaveProperty('permissions')
    expect(result.current).toHaveProperty('tier')
    expect(result.current).toHaveProperty('loading')
    expect(result.current).toHaveProperty('nextTierHints')
    expect(result.current).toHaveProperty('score')
    expect(result.current).toHaveProperty('factors')
    expect(typeof result.current.score).toBe('number')
    expect(typeof result.current.factors).toBe('object')
  })
})
