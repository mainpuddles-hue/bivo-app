/**
 * Rate Limiter Unit Tests
 *
 * Tests:
 * - checkRateLimit() — tracking, enforcement, reset behavior
 * - getRateLimitMessage() — message formatting
 * - Unknown action types pass through
 * - Error handling in AsyncStorage
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {}
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store[key] ?? null),
      setItem: jest.fn(async (key: string, value: string) => { store[key] = value }),
      removeItem: jest.fn(async (key: string) => { delete store[key] }),
      _store: store,
      _clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    },
  }
})

import AsyncStorage from '@react-native-async-storage/async-storage'
import { checkRateLimit, getRateLimitMessage } from '../src/lib/rateLimiter'

const mockGetItem = AsyncStorage.getItem as jest.Mock
const mockSetItem = AsyncStorage.setItem as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

// ══════════════════════════════════════════════════════
// checkRateLimit — Basic behavior
// ══════════════════════════════════════════════════════

describe('checkRateLimit: Basic behavior', () => {
  test('Allows first action when no history exists', async () => {
    mockGetItem.mockResolvedValue(null)
    mockSetItem.mockResolvedValue(undefined)

    const result = await checkRateLimit('post_create')
    expect(result).toBe(true)
  })

  test('Stores timestamp after allowed action', async () => {
    mockGetItem.mockResolvedValue(null)
    mockSetItem.mockResolvedValue(undefined)

    await checkRateLimit('post_create')

    expect(mockSetItem).toHaveBeenCalledWith(
      'rate_limit_post_create',
      expect.any(String)
    )

    // Parse the stored value — should be an array with one timestamp
    const storedValue = JSON.parse(mockSetItem.mock.calls[0][1])
    expect(Array.isArray(storedValue)).toBe(true)
    expect(storedValue).toHaveLength(1)
    expect(typeof storedValue[0]).toBe('number')
  })

  test('Unknown action type returns true (no limit)', async () => {
    const result = await checkRateLimit('unknown_action_xyz')
    expect(result).toBe(true)
    // Should not call AsyncStorage for unknown actions
    expect(mockGetItem).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════
// checkRateLimit — Rate limiting enforcement
// ══════════════════════════════════════════════════════

describe('checkRateLimit: Enforcement', () => {
  test('Blocks action when at limit (5 post_create in 1 hour)', async () => {
    const now = Date.now()
    // 5 timestamps all within the last hour
    const timestamps = Array.from({ length: 5 }, (_, i) => now - i * 1000)
    mockGetItem.mockResolvedValue(JSON.stringify(timestamps))

    const result = await checkRateLimit('post_create')
    expect(result).toBe(false)
    // Should NOT store a new timestamp
    expect(mockSetItem).not.toHaveBeenCalled()
  })

  test('Allows action when under limit', async () => {
    const now = Date.now()
    // Only 3 timestamps (limit is 5)
    const timestamps = [now - 1000, now - 2000, now - 3000]
    mockGetItem.mockResolvedValue(JSON.stringify(timestamps))
    mockSetItem.mockResolvedValue(undefined)

    const result = await checkRateLimit('post_create')
    expect(result).toBe(true)
  })

  test('Blocks messages when at 50/hour limit', async () => {
    const now = Date.now()
    const timestamps = Array.from({ length: 50 }, (_, i) => now - i * 1000)
    mockGetItem.mockResolvedValue(JSON.stringify(timestamps))

    const result = await checkRateLimit('message')
    expect(result).toBe(false)
  })

  test('Blocks likes when at 100/hour limit', async () => {
    const now = Date.now()
    const timestamps = Array.from({ length: 100 }, (_, i) => now - i * 100)
    mockGetItem.mockResolvedValue(JSON.stringify(timestamps))

    const result = await checkRateLimit('like')
    expect(result).toBe(false)
  })

  test('Blocks search when at 30/minute limit', async () => {
    const now = Date.now()
    // 30 searches within the last minute
    const timestamps = Array.from({ length: 30 }, (_, i) => now - i * 1000)
    mockGetItem.mockResolvedValue(JSON.stringify(timestamps))

    const result = await checkRateLimit('search')
    expect(result).toBe(false)
  })
})

// ══════════════════════════════════════════════════════
// checkRateLimit — Expired timestamps cleanup
// ══════════════════════════════════════════════════════

describe('checkRateLimit: Expired timestamp cleanup', () => {
  test('Expired timestamps are removed, allowing new actions', async () => {
    // 5 timestamps from 2 hours ago (expired for 1-hour window)
    const twoHoursAgo = Date.now() - 2 * 3600000
    const timestamps = Array.from({ length: 5 }, (_, i) => twoHoursAgo - i * 1000)
    mockGetItem.mockResolvedValue(JSON.stringify(timestamps))
    mockSetItem.mockResolvedValue(undefined)

    const result = await checkRateLimit('post_create')
    expect(result).toBe(true)

    // Should store only the new timestamp (old ones filtered out)
    const stored = JSON.parse(mockSetItem.mock.calls[0][1])
    expect(stored).toHaveLength(1)
  })

  test('Mix of valid and expired timestamps: only valid ones count', async () => {
    const now = Date.now()
    // 3 recent + 3 expired = 3 count toward limit
    const timestamps = [
      now - 1000, now - 2000, now - 3000,           // recent
      now - 7200000, now - 7200001, now - 7200002,   // 2 hours ago (expired)
    ]
    mockGetItem.mockResolvedValue(JSON.stringify(timestamps))
    mockSetItem.mockResolvedValue(undefined)

    const result = await checkRateLimit('post_create')
    expect(result).toBe(true) // only 3 valid, limit is 5

    // Should store 4 entries (3 valid + 1 new)
    const stored = JSON.parse(mockSetItem.mock.calls[0][1])
    expect(stored).toHaveLength(4)
  })
})

// ══════════════════════════════════════════════════════
// checkRateLimit — Error handling
// ══════════════════════════════════════════════════════

describe('checkRateLimit: Error handling', () => {
  test('Returns true (allows action) when AsyncStorage.getItem throws', async () => {
    mockGetItem.mockRejectedValue(new Error('Storage error'))

    const result = await checkRateLimit('post_create')
    expect(result).toBe(true)
  })

  test('Returns true when stored data is invalid JSON', async () => {
    mockGetItem.mockResolvedValue('not-valid-json')

    // JSON.parse will throw, caught in try/catch => returns true
    const result = await checkRateLimit('post_create')
    expect(result).toBe(true)
  })
})

// ══════════════════════════════════════════════════════
// getRateLimitMessage
// ══════════════════════════════════════════════════════

describe('getRateLimitMessage', () => {
  test('Returns message for known actions', () => {
    const msg = getRateLimitMessage('post_create')
    expect(typeof msg).toBe('string')
    expect(msg.length).toBeGreaterThan(0)
    expect(msg).toContain('5')   // maxActions
    expect(msg).toContain('60')  // minutes (60min = 1hr)
  })

  test('Returns message with correct limits for message action', () => {
    const msg = getRateLimitMessage('message')
    expect(msg).toContain('50')  // maxActions = 50
    expect(msg).toContain('60')  // 60 minutes
  })

  test('Returns message with correct limits for search action', () => {
    const msg = getRateLimitMessage('search')
    expect(msg).toContain('30')  // maxActions = 30
    expect(msg).toContain('1')   // 1 minute
  })

  test('Returns empty string for unknown action', () => {
    expect(getRateLimitMessage('unknown_action')).toBe('')
  })

  test('Message contains Finnish text', () => {
    const msg = getRateLimitMessage('post_create')
    expect(msg).toContain('Liian monta')
  })

  test('Returns messages for all known action types', () => {
    const knownActions = ['post_create', 'comment', 'message', 'like', 'report', 'forum_post', 'group_post', 'search']
    for (const action of knownActions) {
      const msg = getRateLimitMessage(action)
      expect(msg.length).toBeGreaterThan(0)
      expect(msg).toContain('Max')
    }
  })
})
