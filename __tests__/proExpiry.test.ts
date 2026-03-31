/**
 * Pro Expiry Utility Unit Tests
 *
 * Tests clearExpiredPro():
 * - Expired pro with grace period (3 days)
 * - Non-expired pro
 * - No pro at all
 * - Active Stripe subscription overrides expiry
 * - Missing fields handling
 * - Database update behavior
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

import { clearExpiredPro } from '../src/lib/proExpiry'

// ── Mock Supabase client ─────────────────────────────

function createMockSupabase() {
  const updateFn = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ data: null, error: null }),
  })
  return {
    from: jest.fn().mockReturnValue({
      update: updateFn,
    }),
    _updateFn: updateFn,
  }
}

// ══════════════════════════════════════════════════════
// clearExpiredPro — Non-Pro users
// ══════════════════════════════════════════════════════

describe('clearExpiredPro: Non-Pro users', () => {
  test('Does nothing when is_pro is false', async () => {
    const supabase = createMockSupabase()
    const data = {
      is_pro: false,
      pro_expires_at: null,
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).not.toHaveBeenCalled()
    expect(data.is_pro).toBe(false)
  })

  test('Does nothing when is_pro is false even with old expiry date', async () => {
    const supabase = createMockSupabase()
    const data = {
      is_pro: false,
      pro_expires_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════
// clearExpiredPro — Pro with no expiry date
// ══════════════════════════════════════════════════════

describe('clearExpiredPro: Pro without expiry date', () => {
  test('Does nothing when pro_expires_at is null', async () => {
    const supabase = createMockSupabase()
    const data = {
      is_pro: true,
      pro_expires_at: null,
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).not.toHaveBeenCalled()
    expect(data.is_pro).toBe(true)
  })
})

// ══════════════════════════════════════════════════════
// clearExpiredPro — Active Pro (not expired)
// ══════════════════════════════════════════════════════

describe('clearExpiredPro: Active Pro', () => {
  test('Does nothing when pro expires in the future', async () => {
    const supabase = createMockSupabase()
    const data = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).not.toHaveBeenCalled()
    expect(data.is_pro).toBe(true)
    expect(data.pro_expires_at).not.toBeNull()
  })

  test('Does nothing when pro expired yesterday (within 3-day grace)', async () => {
    const supabase = createMockSupabase()
    const data = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).not.toHaveBeenCalled()
    expect(data.is_pro).toBe(true)
  })

  test('Does nothing when pro expired 2 days ago (within 3-day grace)', async () => {
    const supabase = createMockSupabase()
    const data = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).not.toHaveBeenCalled()
    expect(data.is_pro).toBe(true)
  })
})

// ══════════════════════════════════════════════════════
// clearExpiredPro — Expired Pro (past grace period)
// ══════════════════════════════════════════════════════

describe('clearExpiredPro: Expired Pro past grace period', () => {
  test('Clears pro when expired 4 days ago (beyond 3-day grace)', async () => {
    const supabase = createMockSupabase()
    const data: Record<string, any> = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    // Should update database
    expect(supabase.from).toHaveBeenCalledWith('profiles')

    // Should mutate local data
    expect(data.is_pro).toBe(false)
    expect(data.pro_expires_at).toBeNull()
  })

  test('Clears pro when expired 10 days ago', async () => {
    const supabase = createMockSupabase()
    const data: Record<string, any> = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(data.is_pro).toBe(false)
    expect(data.pro_expires_at).toBeNull()
  })

  test('Clears pro when expired 100 days ago', async () => {
    const supabase = createMockSupabase()
    const data: Record<string, any> = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() - 100 * 86400000).toISOString(),
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(data.is_pro).toBe(false)
    expect(data.pro_expires_at).toBeNull()
  })

  test('Updates database with correct userId', async () => {
    const supabase = createMockSupabase()
    const eqFn = jest.fn().mockResolvedValue({ data: null, error: null })
    supabase.from.mockReturnValue({
      update: jest.fn().mockReturnValue({ eq: eqFn }),
    })

    const data: Record<string, any> = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    }

    await clearExpiredPro(supabase as any, 'user-42', data)

    expect(eqFn).toHaveBeenCalledWith('id', 'user-42')
  })

  test('Updates database with is_pro=false and pro_expires_at=null', async () => {
    const supabase = createMockSupabase()
    const updateFn = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })
    supabase.from.mockReturnValue({ update: updateFn })

    const data: Record<string, any> = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(updateFn).toHaveBeenCalledWith({
      is_pro: false,
      pro_expires_at: null,
    })
  })
})

// ══════════════════════════════════════════════════════
// clearExpiredPro — Stripe subscription override
// ══════════════════════════════════════════════════════

describe('clearExpiredPro: Stripe subscription override', () => {
  test('Does NOT clear expired pro when stripe_subscription_id exists', async () => {
    const supabase = createMockSupabase()
    const data: Record<string, any> = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      stripe_subscription_id: 'sub_1234567890',
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).not.toHaveBeenCalled()
    expect(data.is_pro).toBe(true)
    expect(data.pro_expires_at).not.toBeNull()
  })

  test('Clears pro when stripe_subscription_id is null', async () => {
    const supabase = createMockSupabase()
    const data: Record<string, any> = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      stripe_subscription_id: null,
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).toHaveBeenCalled()
    expect(data.is_pro).toBe(false)
  })

  test('Clears pro when stripe_subscription_id is undefined', async () => {
    const supabase = createMockSupabase()
    const data: Record<string, any> = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).toHaveBeenCalled()
    expect(data.is_pro).toBe(false)
  })

  test('Clears pro when stripe_subscription_id is empty string (falsy)', async () => {
    const supabase = createMockSupabase()
    const data: Record<string, any> = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      stripe_subscription_id: '',
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).toHaveBeenCalled()
    expect(data.is_pro).toBe(false)
  })
})

// ══════════════════════════════════════════════════════
// clearExpiredPro — Grace period boundary
// ══════════════════════════════════════════════════════

describe('clearExpiredPro: Grace period boundary', () => {
  test('Exactly at grace period boundary (3 days + 1ms) triggers clearing', async () => {
    const supabase = createMockSupabase()
    const data: Record<string, any> = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() - 3 * 86400000 - 1).toISOString(),
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(data.is_pro).toBe(false)
  })

  test('Just under grace period boundary (3 days - 1s) does NOT trigger', async () => {
    const supabase = createMockSupabase()
    const data: Record<string, any> = {
      is_pro: true,
      pro_expires_at: new Date(Date.now() - 3 * 86400000 + 1000).toISOString(),
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).not.toHaveBeenCalled()
    expect(data.is_pro).toBe(true)
  })
})

// ══════════════════════════════════════════════════════
// clearExpiredPro — Missing fields
// ══════════════════════════════════════════════════════

describe('clearExpiredPro: Missing fields', () => {
  test('Does nothing when data is empty object', async () => {
    const supabase = createMockSupabase()
    const data: Record<string, any> = {}

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).not.toHaveBeenCalled()
  })

  test('Does nothing when is_pro is undefined', async () => {
    const supabase = createMockSupabase()
    const data: Record<string, any> = {
      pro_expires_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    }

    await clearExpiredPro(supabase as any, 'user-1', data)

    expect(supabase.from).not.toHaveBeenCalled()
  })
})
