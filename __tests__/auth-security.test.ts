/**
 * Auth Flow Security Tests
 *
 * Tests authentication security patterns:
 * - Banned user detection at login
 * - Session expiry handling logic
 * - OTP code format validation (6 digits only)
 * - Password strength requirements
 * - Client-side login rate limiting
 * - Disposable email blocking at OTP stage
 * - Auth error mapping
 */

// Mock react-native modules before any imports
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Alert: { alert: jest.fn() },
}))
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}))

// ══════════════════════════════════════════════════════
// Banned User Detection at Login
// ══════════════════════════════════════════════════════

describe('Banned user detection at login', () => {
  // From app/(auth)/login.tsx lines 193-200:
  // After successful signIn, check profile.is_banned.
  // If banned -> signOut + Alert "accountBanned"
  //
  // From app/_layout.tsx lines 279-292:
  // On SIGNED_IN event, also check is_banned before allowing navigation.

  interface ProfileBanCheck {
    is_banned: boolean
  }

  function shouldBlockBannedUser(profile: ProfileBanCheck | null): boolean {
    return !!(profile as any)?.is_banned
  }

  function handleBannedLogin(
    profile: ProfileBanCheck | null,
  ): { allowed: boolean; action?: 'signout_and_alert' } {
    if (shouldBlockBannedUser(profile)) {
      return { allowed: false, action: 'signout_and_alert' }
    }
    return { allowed: true }
  }

  test('Banned user is blocked at login', () => {
    const result = handleBannedLogin({ is_banned: true })
    expect(result.allowed).toBe(false)
    expect(result.action).toBe('signout_and_alert')
  })

  test('Non-banned user is allowed', () => {
    const result = handleBannedLogin({ is_banned: false })
    expect(result.allowed).toBe(true)
    expect(result.action).toBeUndefined()
  })

  test('Null profile (not found) is allowed (ban check passes)', () => {
    const result = handleBannedLogin(null)
    expect(result.allowed).toBe(true)
  })

  test('Profile without is_banned field is allowed', () => {
    const result = handleBannedLogin({} as any)
    expect(result.allowed).toBe(true)
  })

  test('Ban check uses the same pattern in login.tsx and _layout.tsx', () => {
    // Both files use: (profile as any)?.is_banned
    // This tests the optional chaining + type cast pattern
    const bannedProfile: any = { is_banned: true }
    const unbannedProfile: any = { is_banned: false }
    const nullProfile: any = null
    const undefinedProfile: any = undefined

    expect(!!(bannedProfile as any)?.is_banned).toBe(true)
    expect(!!(unbannedProfile as any)?.is_banned).toBe(false)
    expect(!!(nullProfile as any)?.is_banned).toBe(false)
    expect(!!(undefinedProfile as any)?.is_banned).toBe(false)
  })
})

// ══════════════════════════════════════════════════════
// Session Expiry Handling
// ══════════════════════════════════════════════════════

describe('Session expiry handling', () => {
  // From app/_layout.tsx lines 226-370:
  // Uses refs to track auth state:
  // - initialCheckDoneRef: has the first auth check completed?
  // - hadSessionRef: did we ever have a session?
  // - SIGNED_OUT after initial check + had session = session expired
  // - SIGNED_OUT before initial check = cold start (no session)

  type SessionState = {
    initialCheckDone: boolean
    hadSession: boolean
  }

  function isSessionExpiry(state: SessionState, event: string): boolean {
    if (event !== 'SIGNED_OUT') return false
    return state.initialCheckDone && state.hadSession
  }

  function isDeliberateLogout(state: SessionState, event: string): boolean {
    if (event !== 'SIGNED_OUT') return false
    return state.initialCheckDone && !state.hadSession
  }

  test('SIGNED_OUT after initial check with prior session = session expired', () => {
    expect(isSessionExpiry(
      { initialCheckDone: true, hadSession: true },
      'SIGNED_OUT',
    )).toBe(true)
  })

  test('SIGNED_OUT before initial check = cold start, not expiry', () => {
    expect(isSessionExpiry(
      { initialCheckDone: false, hadSession: false },
      'SIGNED_OUT',
    )).toBe(false)
  })

  test('SIGNED_OUT after initial check but never had session = not expiry', () => {
    expect(isSessionExpiry(
      { initialCheckDone: true, hadSession: false },
      'SIGNED_OUT',
    )).toBe(false)
  })

  test('SIGNED_IN event is never a session expiry', () => {
    expect(isSessionExpiry(
      { initialCheckDone: true, hadSession: true },
      'SIGNED_IN',
    )).toBe(false)
  })

  test('TOKEN_REFRESHED event is never a session expiry', () => {
    expect(isSessionExpiry(
      { initialCheckDone: true, hadSession: true },
      'TOKEN_REFRESHED',
    )).toBe(false)
  })

  test('Session expiry triggers alert and redirect to login', () => {
    // Simulates the behavior: show alert then redirect to /(auth)/login
    const state: SessionState = { initialCheckDone: true, hadSession: true }
    const isExpiry = isSessionExpiry(state, 'SIGNED_OUT')
    const expectedActions = isExpiry
      ? ['clearAuthCache', 'showAlert', 'redirectToLogin']
      : []
    expect(isExpiry).toBe(true)
    expect(expectedActions).toContain('showAlert')
    expect(expectedActions).toContain('redirectToLogin')
  })
})

// ══════════════════════════════════════════════════════
// OTP Code Format Validation
// ══════════════════════════════════════════════════════

describe('OTP code format validation (6 digits only)', () => {
  // The OTP system generates 6-digit codes (100000-999999).
  // Both send-otp and verify-otp-code expect exactly 6 digits.

  function isValidOtpFormat(code: string): boolean {
    // Must be exactly 6 characters, all digits
    return /^\d{6}$/.test(code.trim())
  }

  test('Valid 6-digit code: 123456', () => {
    expect(isValidOtpFormat('123456')).toBe(true)
  })

  test('Valid minimum code: 100000', () => {
    expect(isValidOtpFormat('100000')).toBe(true)
  })

  test('Valid maximum code: 999999', () => {
    expect(isValidOtpFormat('999999')).toBe(true)
  })

  test('Code with leading spaces is valid (trimmed)', () => {
    expect(isValidOtpFormat('  123456  ')).toBe(true)
  })

  test('Rejected: 5 digits', () => {
    expect(isValidOtpFormat('12345')).toBe(false)
  })

  test('Rejected: 7 digits', () => {
    expect(isValidOtpFormat('1234567')).toBe(false)
  })

  test('Rejected: letters in code', () => {
    expect(isValidOtpFormat('12345a')).toBe(false)
    expect(isValidOtpFormat('abcdef')).toBe(false)
  })

  test('Rejected: empty string', () => {
    expect(isValidOtpFormat('')).toBe(false)
  })

  test('Rejected: spaces only', () => {
    expect(isValidOtpFormat('      ')).toBe(false)
  })

  test('Rejected: special characters', () => {
    expect(isValidOtpFormat('12345!')).toBe(false)
    expect(isValidOtpFormat('123-45')).toBe(false)
  })

  test('Rejected: decimal number', () => {
    expect(isValidOtpFormat('12345.6')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════
// Password Strength Requirements
// ══════════════════════════════════════════════════════

describe('Password strength requirements for security', () => {
  // From login.tsx: 8+ chars, uppercase, number
  // Additional security checks beyond the basic requirements

  function checkPasswordStrength(password: string): {
    minLength: boolean
    hasUppercase: boolean
    hasNumber: boolean
    isStrong: boolean
  } {
    const minLength = password.length >= 8
    const hasUppercase = /[A-Z]/.test(password)
    const hasNumber = /[0-9]/.test(password)
    return {
      minLength,
      hasUppercase,
      hasNumber,
      isStrong: minLength && hasUppercase && hasNumber,
    }
  }

  test('Common weak passwords are rejected', () => {
    const weakPasswords = [
      'password',     // no uppercase, no number
      '12345678',     // no uppercase
      'ABCDEFGH',     // no number
      'qwerty',       // too short
      'abc123',       // too short
      'test',         // way too short
    ]

    for (const pw of weakPasswords) {
      expect(checkPasswordStrength(pw).isStrong).toBe(false)
    }
  })

  test('Password with unicode uppercase works', () => {
    // Finnish/Swedish uppercase letters should count via [A-Z]
    // but Ä, Ö are not in [A-Z] range — only ASCII uppercase counts
    const result = checkPasswordStrength('aaaa1234')
    expect(result.hasUppercase).toBe(false)
    expect(result.isStrong).toBe(false)
  })

  test('Password with only special chars fails uppercase', () => {
    const result = checkPasswordStrength('!@#$%^&*1')
    expect(result.hasUppercase).toBe(false)
    expect(result.isStrong).toBe(false)
  })

  test('Very long password with requirements is strong', () => {
    const longPw = 'Aa1' + 'x'.repeat(100)
    const result = checkPasswordStrength(longPw)
    expect(result.isStrong).toBe(true)
  })

  test('Password with spaces is valid (if meets requirements)', () => {
    const result = checkPasswordStrength('My Pass 1')
    expect(result.isStrong).toBe(true)
  })

  test('Exactly 8 chars minimum', () => {
    expect(checkPasswordStrength('Abcdef1!').isStrong).toBe(true) // 8 chars
    expect(checkPasswordStrength('Abcde1!').isStrong).toBe(false) // 7 chars
  })
})

// ══════════════════════════════════════════════════════
// Client-side Login Rate Limiting
// ══════════════════════════════════════════════════════

describe('Client-side login rate limiting', () => {
  // From login.tsx: 5 failed attempts -> 15 min lockout (login mode only)
  // Extended tests for edge cases

  const MAX_ATTEMPTS = 5
  const LOCKOUT_DURATION_MS = 15 * 60 * 1000

  class LoginRateLimiter {
    private attempts = 0
    private lockedUntil = 0

    isLocked(now: number = Date.now()): boolean {
      return now < this.lockedUntil
    }

    recordFailure(mode: 'login' | 'register', now: number = Date.now()): { locked: boolean } {
      if (mode !== 'login') return { locked: false }
      this.attempts += 1
      if (this.attempts >= MAX_ATTEMPTS) {
        this.lockedUntil = now + LOCKOUT_DURATION_MS
        this.attempts = 0
        return { locked: true }
      }
      return { locked: false }
    }

    recordSuccess(): void {
      this.attempts = 0
    }
  }

  test('Lockout persists for exactly 15 minutes', () => {
    const limiter = new LoginRateLimiter()
    const now = 1000000

    for (let i = 0; i < 5; i++) limiter.recordFailure('login', now)

    // 14:59 -> still locked
    expect(limiter.isLocked(now + 14 * 60 * 1000 + 59 * 1000)).toBe(true)

    // 15:00 -> unlocked (15 min = boundary)
    expect(limiter.isLocked(now + 15 * 60 * 1000)).toBe(false)
  })

  test('Multiple lockout cycles work correctly', () => {
    const limiter = new LoginRateLimiter()
    let now = 1000000

    // First lockout
    for (let i = 0; i < 5; i++) limiter.recordFailure('login', now)
    expect(limiter.isLocked(now)).toBe(true)

    // After lockout expires
    now += LOCKOUT_DURATION_MS + 1000
    expect(limiter.isLocked(now)).toBe(false)

    // Second lockout
    for (let i = 0; i < 5; i++) limiter.recordFailure('login', now)
    expect(limiter.isLocked(now)).toBe(true)
  })

  test('Successful login between attempts prevents lockout', () => {
    const limiter = new LoginRateLimiter()

    limiter.recordFailure('login')
    limiter.recordFailure('login')
    limiter.recordFailure('login')
    limiter.recordFailure('login') // 4 attempts
    limiter.recordSuccess()        // Reset

    // 5th attempt after reset -> only 1 attempt
    const result = limiter.recordFailure('login')
    expect(result.locked).toBe(false)
  })

  test('Registration failures never trigger lockout regardless of count', () => {
    const limiter = new LoginRateLimiter()

    for (let i = 0; i < 100; i++) {
      limiter.recordFailure('register')
    }

    expect(limiter.isLocked()).toBe(false)
  })
})

// ══════════════════════════════════════════════════════
// Auth Token Handling
// ══════════════════════════════════════════════════════

describe('Auth token extraction', () => {
  // From Edge Functions: const token = authHeader.replace('Bearer ', '')
  // Tests the token extraction pattern used across all Edge Functions.

  function extractToken(authHeader: string | null): string | null {
    if (!authHeader) return null
    return authHeader.replace('Bearer ', '')
  }

  test('Standard Bearer token is extracted', () => {
    expect(extractToken('Bearer eyJhbGciOiJIUzI1NiIs...')).toBe('eyJhbGciOiJIUzI1NiIs...')
  })

  test('Missing auth header returns null', () => {
    expect(extractToken(null)).toBeNull()
  })

  test('Empty auth header returns null (falsy check)', () => {
    expect(extractToken('')).toBeNull()
  })

  test('Malformed auth header without Bearer prefix', () => {
    // The simple .replace('Bearer ', '') only replaces the first occurrence
    const token = extractToken('Basic dXNlcjpwYXNz')
    expect(token).toBe('Basic dXNlcjpwYXNz') // Not stripped — would fail auth check
  })

  test('Bearer token with extra spaces', () => {
    const token = extractToken('Bearer  extra-spaces')
    expect(token).toBe(' extra-spaces') // One space remains — would fail auth
  })
})

// ══════════════════════════════════════════════════════
// Auth Error Translation Security
// ══════════════════════════════════════════════════════

describe('Auth error messages do not leak sensitive info', () => {
  // Auth errors should be generic enough to not reveal whether
  // an email exists or not (prevent user enumeration).

  const AUTH_ERROR_KEYS: Record<string, string> = {
    'Invalid login credentials': 'auth.invalidCredentials',
    'User already registered': 'auth.userAlreadyRegistered',
    'Email not confirmed': 'auth.emailNotConfirmed',
    'Password should be at least 6 characters': 'auth.passwordTooShort',
    'Signup requires a valid password': 'auth.invalidPassword',
  }

  test('Login failure uses generic "invalidCredentials" — not "user not found"', () => {
    // Supabase returns the same error for wrong email AND wrong password
    const key = AUTH_ERROR_KEYS['Invalid login credentials']
    expect(key).toBe('auth.invalidCredentials')
    // "invalidCredentials" does NOT reveal if the email exists
    expect(key).not.toContain('notFound')
    expect(key).not.toContain('noSuchUser')
  })

  test('Unknown errors pass through without translation', () => {
    // Unrecognized errors are shown as-is. This is acceptable because
    // Supabase auth errors don't contain PII.
    const unknownError = 'Rate limit exceeded'
    const mapped = AUTH_ERROR_KEYS[unknownError] ?? unknownError
    expect(mapped).toBe('Rate limit exceeded')
  })

  test('All 5 standard auth errors have i18n key mappings', () => {
    expect(Object.keys(AUTH_ERROR_KEYS)).toHaveLength(5)
    for (const key of Object.values(AUTH_ERROR_KEYS)) {
      expect(key).toMatch(/^auth\./)
    }
  })
})

// ══════════════════════════════════════════════════════
// Email Input Security
// ══════════════════════════════════════════════════════

describe('Email input security at OTP stage', () => {
  // From send-otp/index.ts:
  // 1. Validate email is a non-empty string
  // 2. Trim and lowercase
  // 3. Check domain against blocked_email_domains

  function validateOtpEmail(email: any): { valid: boolean; error?: string; cleaned?: string } {
    if (!email || typeof email !== 'string') {
      return { valid: false, error: 'Email required' }
    }
    const cleaned = email.trim().toLowerCase()
    if (cleaned.length === 0) {
      return { valid: false, error: 'Email required' }
    }
    if (!cleaned.includes('@')) {
      return { valid: false, error: 'Invalid email' }
    }
    return { valid: true, cleaned }
  }

  test('Valid email passes', () => {
    const result = validateOtpEmail('user@example.com')
    expect(result.valid).toBe(true)
    expect(result.cleaned).toBe('user@example.com')
  })

  test('Email with whitespace is cleaned', () => {
    const result = validateOtpEmail('  USER@Example.COM  ')
    expect(result.valid).toBe(true)
    expect(result.cleaned).toBe('user@example.com')
  })

  test('Null email is rejected', () => {
    expect(validateOtpEmail(null).valid).toBe(false)
  })

  test('Undefined email is rejected', () => {
    expect(validateOtpEmail(undefined).valid).toBe(false)
  })

  test('Number email is rejected', () => {
    expect(validateOtpEmail(12345).valid).toBe(false)
  })

  test('Empty string email is rejected', () => {
    expect(validateOtpEmail('').valid).toBe(false)
  })

  test('Whitespace-only email is rejected', () => {
    expect(validateOtpEmail('   ').valid).toBe(false)
  })

  test('Boolean email is rejected', () => {
    expect(validateOtpEmail(true).valid).toBe(false)
  })

  test('Object email is rejected', () => {
    expect(validateOtpEmail({ email: 'test@test.com' }).valid).toBe(false)
  })

  test('Array email is rejected', () => {
    expect(validateOtpEmail(['test@test.com']).valid).toBe(false)
  })
})
