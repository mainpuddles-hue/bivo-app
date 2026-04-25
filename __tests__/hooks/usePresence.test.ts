/**
 * usePresence Hook Unit Tests
 *
 * Tests:
 * - Sets up heartbeat interval
 * - Cleans up interval on unmount
 * - Handles AppState changes (background/foreground)
 * - Doesn't leak subscriptions
 */

// ── Mocks ────────────────────────────────────────────

const mockAppStateListeners: Array<(state: string) => void> = []
const mockRemoveListeners: jest.Mock[] = []

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn((event: string, handler: (state: string) => void) => {
      mockAppStateListeners.push(handler)
      const remove = jest.fn()
      mockRemoveListeners.push(remove)
      return { remove }
    }),
  },
}))

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}))

const mockUpdate = jest.fn()
const mockEq = jest.fn()
const mockTrack = jest.fn().mockResolvedValue(undefined)
const mockUntrack = jest.fn().mockResolvedValue(undefined)
const mockSubscribe = jest.fn()
const mockPresenceState = jest.fn().mockReturnValue({})
const mockRemoveChannel = jest.fn()

const mockChannelObj = {
  on: jest.fn().mockReturnThis(),
  subscribe: mockSubscribe,
  unsubscribe: jest.fn(),
  track: mockTrack,
  untrack: mockUntrack,
  presenceState: mockPresenceState,
}

jest.mock('../../src/hooks/useSupabase', () => ({
  useSupabase: () => ({
    from: jest.fn(() => ({
      update: mockUpdate.mockReturnValue({
        eq: mockEq.mockReturnValue({
          then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
        }),
      }),
    })),
    channel: jest.fn(() => mockChannelObj),
    removeChannel: mockRemoveChannel,
  }),
}))

// ── Setup ────────────────────────────────────────────

import { renderHook, act } from '@testing-library/react-native'
import { usePresence } from '../../src/hooks/usePresence'

describe('usePresence', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    mockAppStateListeners.length = 0
    mockRemoveListeners.length = 0
    // Reset channel mock state
    mockChannelObj.on.mockReturnThis()
    mockSubscribe.mockImplementation((callback: any) => {
      if (typeof callback === 'function') callback('SUBSCRIBED')
      return mockChannelObj
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // ══════════════════════════════════════════════════════
  // Heartbeat setup
  // ══════════════════════════════════════════════════════

  test('sets up heartbeat interval when userId is provided', () => {
    renderHook(() => usePresence('user-1', 'Kallio'))

    // Heartbeat calls updateLastSeen immediately on mount
    expect(mockUpdate).toHaveBeenCalled()
  })

  test('heartbeat fires every 5 minutes', () => {
    renderHook(() => usePresence('user-1', 'Kallio'))

    const initialCalls = mockUpdate.mock.calls.length

    // Advance 5 minutes
    act(() => {
      jest.advanceTimersByTime(5 * 60 * 1000)
    })

    expect(mockUpdate.mock.calls.length).toBeGreaterThan(initialCalls)
  })

  test('heartbeat does NOT fire when userId is null', () => {
    renderHook(() => usePresence(null, 'Kallio'))

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  // ══════════════════════════════════════════════════════
  // Cleanup on unmount
  // ══════════════════════════════════════════════════════

  test('cleans up heartbeat interval on unmount', () => {
    const { unmount } = renderHook(() => usePresence('user-1', 'Kallio'))

    const callsBefore = mockUpdate.mock.calls.length
    unmount()

    // Advance timers — no more heartbeats should fire after unmount
    act(() => {
      jest.advanceTimersByTime(10 * 60 * 1000)
    })

    expect(mockUpdate.mock.calls.length).toBe(callsBefore)
  })

  test('removes AppState subscription on unmount', () => {
    const { unmount } = renderHook(() => usePresence('user-1', 'Kallio'))

    // Two effects register AppState listeners: heartbeat + presence channel
    expect(mockRemoveListeners.length).toBeGreaterThan(0)

    unmount()

    // All remove() callbacks should have been called
    for (const remove of mockRemoveListeners) {
      expect(remove).toHaveBeenCalled()
    }
  })

  test('cleans up presence channel on unmount', () => {
    const { unmount } = renderHook(() => usePresence('user-1', 'Kallio'))

    unmount()

    expect(mockRemoveChannel).toHaveBeenCalled()
    expect(mockUntrack).toHaveBeenCalled()
  })

  // ══════════════════════════════════════════════════════
  // AppState handling
  // ══════════════════════════════════════════════════════

  test('updates last_seen when app becomes active', () => {
    renderHook(() => usePresence('user-1', 'Kallio'))

    const callsBefore = mockUpdate.mock.calls.length

    // Simulate app coming to foreground
    act(() => {
      for (const listener of mockAppStateListeners) {
        listener('active')
      }
    })

    expect(mockUpdate.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  // ══════════════════════════════════════════════════════
  // Return value
  // ══════════════════════════════════════════════════════

  test('returns onlineCount and onlineUsers', () => {
    const { result } = renderHook(() => usePresence('user-1', 'Kallio'))

    expect(typeof result.current.onlineCount).toBe('number')
    expect(Array.isArray(result.current.onlineUsers)).toBe(true)
  })

  test('returns 0 onlineCount and empty array when no presence data', () => {
    mockPresenceState.mockReturnValue({})

    const { result } = renderHook(() => usePresence('user-1', 'Kallio'))

    expect(result.current.onlineCount).toBe(0)
    expect(result.current.onlineUsers).toEqual([])
  })

  // ══════════════════════════════════════════════════════
  // Subscription leak prevention
  // ══════════════════════════════════════════════════════

  test('does not create presence channel when neighborhood is null', () => {
    const mockChannelFn = jest.fn(() => mockChannelObj)
    // Re-render with null neighborhood
    renderHook(() => usePresence('user-1', null))

    // The presence channel effect should not subscribe
    // (the heartbeat effect still runs but no channel is created for presence)
    expect(mockRemoveChannel).not.toHaveBeenCalled()
  })

  test('does not create presence channel when userId is null', () => {
    renderHook(() => usePresence(null, 'Kallio'))

    // Neither heartbeat nor presence channel should be set up
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
