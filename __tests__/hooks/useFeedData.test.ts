/**
 * useFeedData Hook Unit Tests
 *
 * Tests:
 * - Returns posts array
 * - Handles loading state
 * - Handles error state
 * - Filters posts by category
 * - Handles empty response
 * - Properly cleans up on unmount (mounted ref)
 */

// ── Mocks ────────────────────────────────────────────

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Dimensions: { get: jest.fn(() => ({ width: 390, height: 844 })) },
  StyleSheet: {
    create: (styles: any) => styles,
    flatten: (style: any) => style,
  },
}))

jest.mock('@react-native-async-storage/async-storage', () => {
  const mockImpl = {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  }
  return {
    __esModule: true,
    default: mockImpl,
    ...mockImpl,
  }
})

// Create stable mock objects outside of jest.mock to avoid re-render loops
const mockQueryChain: any = {}
const mockSupabaseInstance = {
  from: jest.fn(() => mockQueryChain),
  channel: jest.fn(),
  removeChannel: jest.fn(),
  rpc: jest.fn(),
}

jest.mock('@/hooks/useSupabase', () => ({
  useSupabase: () => mockSupabaseInstance,
}))

jest.mock('@/hooks/feed/useFeedLocation', () => ({
  useFeedLocation: () => null,
}))

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isConnected: true }),
}))

jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'fi',
    setLocale: jest.fn(),
  }),
}))

jest.mock('@/lib/linkedevents', () => ({
  fetchHelsinkiEvents: jest.fn().mockResolvedValue([]),
  prefetchHelsinkiEvents: jest.fn().mockResolvedValue(undefined),
  setLinkedEventsBaseUrl: jest.fn(),
}))

jest.mock('@/lib/ticketmaster', () => ({
  fetchTicketmasterEvents: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/kide', () => ({
  fetchKideEvents: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/meteli', () => ({
  fetchMetelihEvents: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/palvelukartta', () => ({
  fetchHelsinkiPlaces: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/authCache', () => ({
  getCachedUserId: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/seedContent', () => ({
  getSeedPosts: jest.fn().mockReturnValue([]),
}))

jest.mock('@/lib/feedAlgorithm', () => ({
  rankFeed: jest.fn((posts: any[]) => posts),
}))

jest.mock('@/lib/featureFlags', () => ({
  FEATURES: { LENDING: false },
}))

jest.mock('@/lib/privacyUtils', () => ({
  applyLocationAccuracy: jest.fn((_a: any, lat: any, lng: any, loc: any) => ({
    latitude: lat,
    longitude: lng,
    location: loc,
  })),
}))

jest.mock('@/lib/errorUtils', () => ({
  getNetworkAwareErrorSync: jest.fn(
    (err: any, t: any, _isConnected: boolean) => t('feed.loadError'),
  ),
}))

jest.mock('@/lib/geo', () => ({
  haversineKm: jest.fn(() => 0),
}))

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}))

// useFocusEffect: noop to avoid re-render loops in test environment
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
}))

// ── Setup rendering helpers ──────────────────────────

import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useFeedData } from '../../src/hooks/useFeedData'

// Helper to set up a fresh chainable query mock
function setupQueryChain(data: any[] | null = [], error: any = null) {
  Object.assign(mockQueryChain, {
    select: jest.fn().mockReturnValue(mockQueryChain),
    eq: jest.fn().mockReturnValue(mockQueryChain),
    in: jest.fn().mockReturnValue(mockQueryChain),
    not: jest.fn().mockReturnValue(mockQueryChain),
    or: jest.fn().mockReturnValue(mockQueryChain),
    gte: jest.fn().mockReturnValue(mockQueryChain),
    lte: jest.fn().mockReturnValue(mockQueryChain),
    order: jest.fn().mockReturnValue(mockQueryChain),
    range: jest.fn().mockReturnValue(mockQueryChain),
    limit: jest.fn().mockReturnValue(mockQueryChain),
    maybeSingle: jest.fn().mockResolvedValue({ data: data?.[0] ?? null, error }),
    then: (resolve: any, reject: any) =>
      Promise.resolve({ data, error }).then(resolve, reject),
  })
}

// Suppress console.error for act() warnings — useFeedData has many async effects
const originalError = console.error
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('not wrapped in act')) return
    originalError.apply(console, args)
  }
})
afterAll(() => {
  console.error = originalError
})

// ── Tests ────────────────────────────────────────────

describe('useFeedData', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Default: supabase.from() returns empty data for any table
    setupQueryChain([])

    // Default: channel mock that does nothing
    const mockChannelObj = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
      untrack: jest.fn().mockResolvedValue(undefined),
    }
    mockSupabaseInstance.channel.mockReturnValue(mockChannelObj)
    mockSupabaseInstance.removeChannel.mockReturnValue(undefined)
  })

  test('returns posts as an empty array initially', () => {
    const { result } = renderHook(() => useFeedData())
    expect(Array.isArray(result.current.posts)).toBe(true)
    expect(result.current.posts).toEqual([])
  })

  test('loading is true initially', () => {
    const { result } = renderHook(() => useFeedData())
    expect(result.current.loading).toBe(true)
  })

  test('loading becomes false after fetch completes', async () => {
    const { result } = renderHook(() => useFeedData())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  test('error is null when fetch succeeds', async () => {
    const { result } = renderHook(() => useFeedData())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBeNull()
  })

  test('returns expected shape with all fields', () => {
    const { result } = renderHook(() => useFeedData())

    expect(Array.isArray(result.current.posts)).toBe(true)
    expect(typeof result.current.loading).toBe('boolean')
    expect(typeof result.current.refreshing).toBe('boolean')
    expect(typeof result.current.hasMore).toBe('boolean')
    expect(typeof result.current.hasNewPosts).toBe('boolean')
    expect(typeof result.current.newPostCount).toBe('number')
    expect(result.current.activeFilter).toBeNull()
    expect(result.current.sortBy).toBe('recommended')
    expect(result.current.showFollowing).toBe(false)
    expect(typeof result.current.handleRefresh).toBe('function')
    expect(typeof result.current.handleLoadMore).toBe('function')
    expect(typeof result.current.handleFilterChange).toBe('function')
    expect(typeof result.current.handleSortChange).toBe('function')
    expect(typeof result.current.setShowFollowing).toBe('function')
    expect(result.current.currentUserId).toBeNull()
    expect(Array.isArray(result.current.followedIds)).toBe(true)
    expect(Array.isArray(result.current.cityEvents)).toBe(true)
    expect(Array.isArray(result.current.nearbyPlaces)).toBe(true)
  })

  test('handleFilterChange updates the activeFilter state', async () => {
    const { result } = renderHook(() => useFeedData())

    await act(async () => {
      result.current.handleFilterChange('tarvitsen')
      await new Promise(r => setTimeout(r, 10))
    })

    expect(result.current.activeFilter).toBe('tarvitsen')
  })

  test('handleFilterChange(null) clears the filter', async () => {
    const { result } = renderHook(() => useFeedData())

    await act(async () => {
      result.current.handleFilterChange('tarvitsen')
      await new Promise(r => setTimeout(r, 10))
    })
    expect(result.current.activeFilter).toBe('tarvitsen')

    await act(async () => {
      result.current.handleFilterChange(null)
      await new Promise(r => setTimeout(r, 10))
    })
    expect(result.current.activeFilter).toBeNull()
  })

  test('handleSortChange updates sortBy state', async () => {
    const { result } = renderHook(() => useFeedData())

    await act(async () => {
      result.current.handleSortChange('newest')
      await new Promise(r => setTimeout(r, 10))
    })

    expect(result.current.sortBy).toBe('newest')
  })

  test('handleSortChange clears existing posts', async () => {
    const { result } = renderHook(() => useFeedData())

    await act(async () => {
      result.current.handleSortChange('popular')
    })

    // After sort change, posts should be cleared
    expect(result.current.posts).toEqual([])
    expect(result.current.sortBy).toBe('popular')
  })

  test('setShowFollowing toggles the following filter', async () => {
    const { result } = renderHook(() => useFeedData())

    expect(result.current.showFollowing).toBe(false)

    await act(async () => {
      result.current.setShowFollowing(true)
    })

    expect(result.current.showFollowing).toBe(true)
  })

  test('cleans up channel on unmount', () => {
    const { unmount } = renderHook(() => useFeedData())

    unmount()

    expect(mockSupabaseInstance.removeChannel).toHaveBeenCalled()
  })

  test('handles empty response gracefully', async () => {
    setupQueryChain([])

    const { result } = renderHook(() => useFeedData())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.posts).toEqual([])
    expect(result.current.error).toBeNull()
  })

  // ── Error path tests ──

  test('sets error string when Supabase query fails', async () => {
    setupQueryChain(null, { message: 'connection refused', code: 'PGRST000' })

    const { result } = renderHook(() => useFeedData())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).not.toBeNull()
    expect(typeof result.current.error).toBe('string')
    expect(result.current.posts).toEqual([])
  })

  test('posts remain empty array after error (no partial data)', async () => {
    setupQueryChain(null, { message: 'timeout' })

    const { result } = renderHook(() => useFeedData())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(Array.isArray(result.current.posts)).toBe(true)
    expect(result.current.posts).toHaveLength(0)
  })

  // ── Rapid state change tests ──

  test('rapid filter changes settle to final value', async () => {
    const { result } = renderHook(() => useFeedData())

    await act(async () => {
      result.current.handleFilterChange('ilmaista')
      result.current.handleFilterChange('tarjoan')
      result.current.handleFilterChange('tarvitsen')
      await new Promise(r => setTimeout(r, 10))
    })

    // Should settle to the last value
    expect(result.current.activeFilter).toBe('tarvitsen')
  })

  test('rapid sort changes settle to final value', async () => {
    const { result } = renderHook(() => useFeedData())

    await act(async () => {
      result.current.handleSortChange('newest')
      result.current.handleSortChange('popular')
      result.current.handleSortChange('nearest')
      await new Promise(r => setTimeout(r, 10))
    })

    expect(result.current.sortBy).toBe('nearest')
  })

  test('filter then clear filter results in null', async () => {
    const { result } = renderHook(() => useFeedData())

    await act(async () => {
      result.current.handleFilterChange('ilmaista')
      await new Promise(r => setTimeout(r, 10))
    })
    expect(result.current.activeFilter).toBe('ilmaista')

    await act(async () => {
      result.current.handleFilterChange(null)
      await new Promise(r => setTimeout(r, 10))
    })
    expect(result.current.activeFilter).toBeNull()
  })

  // ── Return type contract tests ──

  test('all function fields remain callable after re-render', async () => {
    const { result, rerender } = renderHook(() => useFeedData())

    rerender({})

    // All handler functions must still be valid functions after re-render
    expect(typeof result.current.handleRefresh).toBe('function')
    expect(typeof result.current.handleLoadMore).toBe('function')
    expect(typeof result.current.handleFilterChange).toBe('function')
    expect(typeof result.current.handleSortChange).toBe('function')

    // Calling them should not throw
    await act(async () => {
      expect(() => result.current.handleFilterChange('ilmaista')).not.toThrow()
      await new Promise(r => setTimeout(r, 10))
    })
    expect(result.current.activeFilter).toBe('ilmaista')
  })
})
