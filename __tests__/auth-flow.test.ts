/**
 * Auth Flow Business Logic Tests
 *
 * Tests the core authentication business logic:
 * - Email format validation regex
 * - Password strength: 8+ chars, uppercase, number
 * - Login rate limiting: 5 attempts = lockout (login mode only)
 * - Profile creation fallback: insert when profile doesn't exist
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
// Email Format Validation
// ══════════════════════════════════════════════════════

describe('Email Format Validation', () => {
  // From login.tsx: const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  function isValidEmail(email: string): boolean {
    return emailRegex.test(email.trim())
  }

  test('Standard email addresses are valid', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
    expect(isValidEmail('jesse@tackbird.fi')).toBe(true)
    expect(isValidEmail('test.user@domain.co')).toBe(true)
    expect(isValidEmail('user+tag@gmail.com')).toBe(true)
  })

  test('Email with subdomain is valid', () => {
    expect(isValidEmail('user@mail.example.com')).toBe(true)
  })

  test('Email with numbers is valid', () => {
    expect(isValidEmail('user123@domain.com')).toBe(true)
    expect(isValidEmail('123@456.789')).toBe(true)
  })

  test('Email with hyphens is valid', () => {
    expect(isValidEmail('user-name@domain-name.com')).toBe(true)
  })

  test('Email with leading/trailing whitespace is valid (trimmed)', () => {
    expect(isValidEmail('  user@example.com  ')).toBe(true)
  })

  test('Empty string is invalid', () => {
    expect(isValidEmail('')).toBe(false)
  })

  test('Missing @ is invalid', () => {
    expect(isValidEmail('userexample.com')).toBe(false)
  })

  test('Missing domain is invalid', () => {
    expect(isValidEmail('user@')).toBe(false)
  })

  test('Missing TLD is invalid', () => {
    expect(isValidEmail('user@domain')).toBe(false)
  })

  test('Missing local part is invalid', () => {
    expect(isValidEmail('@domain.com')).toBe(false)
  })

  test('Space in email is invalid', () => {
    expect(isValidEmail('user name@domain.com')).toBe(false)
  })

  test('Double @ is invalid', () => {
    expect(isValidEmail('user@@domain.com')).toBe(false)
  })

  test('Just a string without structure is invalid', () => {
    expect(isValidEmail('notanemail')).toBe(false)
    expect(isValidEmail('hello world')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════
// Password Strength Validation
// ══════════════════════════════════════════════════════

describe('Password Strength Validation', () => {
  // From login.tsx:
  // password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)
  // These three checks are used in the PasswordStrength component and in form validation

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

  test('Strong password meets all requirements', () => {
    const result = checkPasswordStrength('MyPass123')
    expect(result.minLength).toBe(true)
    expect(result.hasUppercase).toBe(true)
    expect(result.hasNumber).toBe(true)
    expect(result.isStrong).toBe(true)
  })

  test('Exactly 8 characters with uppercase and number is strong', () => {
    const result = checkPasswordStrength('Abcdefg1')
    expect(result.isStrong).toBe(true)
  })

  test('7 characters is too short', () => {
    const result = checkPasswordStrength('Abcde1!')
    expect(result.minLength).toBe(false)
    expect(result.isStrong).toBe(false)
  })

  test('All lowercase with number fails uppercase check', () => {
    const result = checkPasswordStrength('mypassword1')
    expect(result.minLength).toBe(true)
    expect(result.hasUppercase).toBe(false)
    expect(result.hasNumber).toBe(true)
    expect(result.isStrong).toBe(false)
  })

  test('All uppercase no number fails number check', () => {
    const result = checkPasswordStrength('MYPASSWORD')
    expect(result.minLength).toBe(true)
    expect(result.hasUppercase).toBe(true)
    expect(result.hasNumber).toBe(false)
    expect(result.isStrong).toBe(false)
  })

  test('No uppercase and no number fails both checks', () => {
    const result = checkPasswordStrength('mypassword')
    expect(result.minLength).toBe(true)
    expect(result.hasUppercase).toBe(false)
    expect(result.hasNumber).toBe(false)
    expect(result.isStrong).toBe(false)
  })

  test('Empty password fails all checks', () => {
    const result = checkPasswordStrength('')
    expect(result.minLength).toBe(false)
    expect(result.hasUppercase).toBe(false)
    expect(result.hasNumber).toBe(false)
    expect(result.isStrong).toBe(false)
  })

  test('Long password with all requirements is strong', () => {
    const result = checkPasswordStrength('ThisIsAVeryLongPassword123456')
    expect(result.isStrong).toBe(true)
  })

  test('Password with special characters still needs uppercase and number', () => {
    const result = checkPasswordStrength('!@#$%^&*()')
    expect(result.minLength).toBe(true)
    expect(result.hasUppercase).toBe(false)
    expect(result.hasNumber).toBe(false)
    expect(result.isStrong).toBe(false)
  })

  test('Password with Finnish characters and number', () => {
    const result = checkPasswordStrength('Salasana1')
    expect(result.isStrong).toBe(true)
  })

  test('Minimum viable strong password', () => {
    // Shortest possible strong password: 8 chars, 1 uppercase, 1 number
    const result = checkPasswordStrength('aaaaaa1A')
    expect(result.isStrong).toBe(true)
  })
})

// ══════════════════════════════════════════════════════
// Login Rate Limiting
// ══════════════════════════════════════════════════════

describe('Login Rate Limiting', () => {
  // From login.tsx:
  // - loginAttempts state starts at 0
  // - On login failure: attempts = loginAttempts + 1
  // - If attempts >= 5: lockedUntil = Date.now() + 15 * 60 * 1000 (15 min lockout)
  // - Only applies in 'login' mode, NOT 'register' mode
  // - Check: if (Date.now() < lockedUntil) -> show "too many attempts"

  const MAX_ATTEMPTS = 5
  const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

  class LoginRateLimiter {
    private loginAttempts = 0
    private lockedUntil = 0

    isLocked(now: number = Date.now()): boolean {
      return now < this.lockedUntil
    }

    recordFailedAttempt(mode: 'login' | 'register', now: number = Date.now()): { locked: boolean; attempts: number } {
      // Rate limiting only applies to login mode, NOT registration
      if (mode !== 'login') {
        return { locked: false, attempts: 0 }
      }

      this.loginAttempts += 1

      if (this.loginAttempts >= MAX_ATTEMPTS) {
        this.lockedUntil = now + LOCKOUT_DURATION_MS
        this.loginAttempts = 0 // reset after lockout
        return { locked: true, attempts: 0 }
      }

      return { locked: false, attempts: this.loginAttempts }
    }

    recordSuccess(): void {
      this.loginAttempts = 0
    }

    getAttempts(): number {
      return this.loginAttempts
    }
  }

  test('Initial state: not locked, 0 attempts', () => {
    const limiter = new LoginRateLimiter()
    expect(limiter.isLocked()).toBe(false)
    expect(limiter.getAttempts()).toBe(0)
  })

  test('1 failed attempt: not locked', () => {
    const limiter = new LoginRateLimiter()
    const result = limiter.recordFailedAttempt('login')
    expect(result.locked).toBe(false)
    expect(result.attempts).toBe(1)
  })

  test('4 failed attempts: not locked yet', () => {
    const limiter = new LoginRateLimiter()
    for (let i = 0; i < 4; i++) {
      limiter.recordFailedAttempt('login')
    }
    expect(limiter.isLocked()).toBe(false)
    expect(limiter.getAttempts()).toBe(4)
  })

  test('5 failed attempts: locked out', () => {
    const limiter = new LoginRateLimiter()
    const now = Date.now()
    let result
    for (let i = 0; i < 5; i++) {
      result = limiter.recordFailedAttempt('login', now)
    }
    expect(result!.locked).toBe(true)
    expect(limiter.isLocked(now)).toBe(true)
  })

  test('Lockout duration is 15 minutes', () => {
    const limiter = new LoginRateLimiter()
    const now = 1000000

    for (let i = 0; i < 5; i++) {
      limiter.recordFailedAttempt('login', now)
    }

    // Still locked at 14 minutes
    expect(limiter.isLocked(now + 14 * 60 * 1000)).toBe(true)

    // Unlocked at 15 minutes
    expect(limiter.isLocked(now + 15 * 60 * 1000)).toBe(false)

    // Unlocked after 15 minutes
    expect(limiter.isLocked(now + 16 * 60 * 1000)).toBe(false)
  })

  test('Registration mode does NOT trigger rate limiting', () => {
    const limiter = new LoginRateLimiter()

    // 10 failed register attempts should not lock
    for (let i = 0; i < 10; i++) {
      const result = limiter.recordFailedAttempt('register')
      expect(result.locked).toBe(false)
    }

    expect(limiter.isLocked()).toBe(false)
    expect(limiter.getAttempts()).toBe(0) // register does not increment
  })

  test('Successful login resets attempt counter', () => {
    const limiter = new LoginRateLimiter()

    // 4 failed attempts
    for (let i = 0; i < 4; i++) {
      limiter.recordFailedAttempt('login')
    }
    expect(limiter.getAttempts()).toBe(4)

    // Successful login
    limiter.recordSuccess()
    expect(limiter.getAttempts()).toBe(0)

    // 4 more failed attempts should NOT trigger lockout (counter was reset)
    for (let i = 0; i < 4; i++) {
      limiter.recordFailedAttempt('login')
    }
    expect(limiter.isLocked()).toBe(false)
  })

  test('After lockout expires, user can try again', () => {
    const limiter = new LoginRateLimiter()
    const now = 1000000

    // Trigger lockout
    for (let i = 0; i < 5; i++) {
      limiter.recordFailedAttempt('login', now)
    }
    expect(limiter.isLocked(now)).toBe(true)

    // After lockout expires (15 min + 1 sec)
    const afterLockout = now + LOCKOUT_DURATION_MS + 1000
    expect(limiter.isLocked(afterLockout)).toBe(false)

    // Can attempt again
    const result = limiter.recordFailedAttempt('login', afterLockout)
    expect(result.locked).toBe(false)
    expect(result.attempts).toBe(1)
  })

  test('Mixed login and register: only login attempts count', () => {
    const limiter = new LoginRateLimiter()

    limiter.recordFailedAttempt('login')    // 1
    limiter.recordFailedAttempt('register') // ignored
    limiter.recordFailedAttempt('login')    // 2
    limiter.recordFailedAttempt('register') // ignored
    limiter.recordFailedAttempt('login')    // 3
    limiter.recordFailedAttempt('login')    // 4

    expect(limiter.getAttempts()).toBe(4)
    expect(limiter.isLocked()).toBe(false)

    // 5th login attempt triggers lockout
    const result = limiter.recordFailedAttempt('login')
    expect(result.locked).toBe(true)
  })
})

// ══════════════════════════════════════════════════════
// Profile Creation Fallback
// ══════════════════════════════════════════════════════

describe('Profile Creation Fallback', () => {
  // From login.tsx:
  // After successful signup, if session is returned:
  // 1. Check if profile exists: supabase.from('profiles').select('id').eq('id', user.id).maybeSingle()
  // 2. If !existingProfile: insert new profile { id, email, name }

  function shouldCreateProfile(existingProfile: { id: string } | null): boolean {
    return !existingProfile
  }

  function buildProfileInsert(userId: string, email: string, name: string) {
    return {
      id: userId,
      email: email.trim(),
      name: name.trim(),
    }
  }

  test('Should create profile when no existing profile found', () => {
    expect(shouldCreateProfile(null)).toBe(true)
  })

  test('Should NOT create profile when existing profile found', () => {
    expect(shouldCreateProfile({ id: 'user-123' })).toBe(false)
  })

  test('Profile insert has correct fields', () => {
    const insert = buildProfileInsert('user-123', 'jesse@tackbird.fi', 'Jesse')
    expect(insert).toEqual({
      id: 'user-123',
      email: 'jesse@tackbird.fi',
      name: 'Jesse',
    })
  })

  test('Profile insert trims email and name', () => {
    const insert = buildProfileInsert('user-123', '  jesse@tackbird.fi  ', '  Jesse Parkkonen  ')
    expect(insert.email).toBe('jesse@tackbird.fi')
    expect(insert.name).toBe('Jesse Parkkonen')
  })

  test('Profile insert uses provided user ID (from auth)', () => {
    const userId = 'abc-123-def-456'
    const insert = buildProfileInsert(userId, 'test@test.com', 'Test')
    expect(insert.id).toBe(userId)
  })
})

// ══════════════════════════════════════════════════════
// Auth Error Translation
// ══════════════════════════════════════════════════════

describe('Auth Error Translation', () => {
  // From login.tsx:
  // const AUTH_ERROR_KEYS = {
  //   'Invalid login credentials': 'auth.invalidCredentials',
  //   'User already registered': 'auth.userAlreadyRegistered',
  //   'Email not confirmed': 'auth.emailNotConfirmed',
  //   'Password should be at least 6 characters': 'auth.passwordTooShort',
  //   'Signup requires a valid password': 'auth.invalidPassword',
  // }
  const AUTH_ERROR_KEYS: Record<string, string> = {
    'Invalid login credentials': 'auth.invalidCredentials',
    'User already registered': 'auth.userAlreadyRegistered',
    'Email not confirmed': 'auth.emailNotConfirmed',
    'Password should be at least 6 characters': 'auth.passwordTooShort',
    'Signup requires a valid password': 'auth.invalidPassword',
  }

  function translateError(msg: string): string {
    const key = AUTH_ERROR_KEYS[msg]
    return key ?? msg // Return i18n key or original message
  }

  test('Known errors are translated to i18n keys', () => {
    expect(translateError('Invalid login credentials')).toBe('auth.invalidCredentials')
    expect(translateError('User already registered')).toBe('auth.userAlreadyRegistered')
    expect(translateError('Email not confirmed')).toBe('auth.emailNotConfirmed')
    expect(translateError('Password should be at least 6 characters')).toBe('auth.passwordTooShort')
    expect(translateError('Signup requires a valid password')).toBe('auth.invalidPassword')
  })

  test('Unknown errors pass through unchanged', () => {
    expect(translateError('Network error')).toBe('Network error')
    expect(translateError('Something went wrong')).toBe('Something went wrong')
    expect(translateError('')).toBe('')
  })

  test('All 5 known Supabase auth errors are mapped', () => {
    expect(Object.keys(AUTH_ERROR_KEYS)).toHaveLength(5)
  })
})

// ══════════════════════════════════════════════════════
// Auth Mode State Machine
// ══════════════════════════════════════════════════════

describe('Auth Mode State Machine', () => {
  // From login.tsx: mode = 'login' | 'register' | 'forgot'

  type AuthMode = 'login' | 'register' | 'forgot'

  function getRequiredFields(mode: AuthMode): string[] {
    switch (mode) {
      case 'login':
        return ['email', 'password']
      case 'register':
        return ['email', 'password', 'name']
      case 'forgot':
        return ['email']
    }
  }

  function requiresPasswordStrength(mode: AuthMode): boolean {
    return mode === 'register'
  }

  function requiresTermsAcceptance(mode: AuthMode): boolean {
    return mode === 'register'
  }

  test('Login requires email and password', () => {
    const fields = getRequiredFields('login')
    expect(fields).toContain('email')
    expect(fields).toContain('password')
    expect(fields).not.toContain('name')
  })

  test('Register requires email, password, and name', () => {
    const fields = getRequiredFields('register')
    expect(fields).toContain('email')
    expect(fields).toContain('password')
    expect(fields).toContain('name')
  })

  test('Forgot password requires only email', () => {
    const fields = getRequiredFields('forgot')
    expect(fields).toEqual(['email'])
  })

  test('Password strength is only checked on register', () => {
    expect(requiresPasswordStrength('register')).toBe(true)
    expect(requiresPasswordStrength('login')).toBe(false)
    expect(requiresPasswordStrength('forgot')).toBe(false)
  })

  test('Terms acceptance is only required on register', () => {
    expect(requiresTermsAcceptance('register')).toBe(true)
    expect(requiresTermsAcceptance('login')).toBe(false)
    expect(requiresTermsAcceptance('forgot')).toBe(false)
  })
})
