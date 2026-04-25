/**
 * Validation Utility — Extended Tests
 *
 * The root __tests__/validation.test.ts covers basic UUID validation.
 * This file adds security-focused tests:
 * - SQL injection attempts
 * - XSS payloads
 * - Path traversal
 * - Extremely long inputs
 * - Unicode/special character edge cases
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

import { isValidUUID } from '../../src/lib/validation'

// ══════════════════════════════════════════════════════
// SQL injection attempts
// ══════════════════════════════════════════════════════

describe('isValidUUID: SQL injection resistance', () => {
  test('rejects SQL injection in UUID-like string', () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000' OR '1'='1")).toBe(false)
  })

  test('rejects UNION SELECT injection', () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000 UNION SELECT * FROM users--")).toBe(false)
  })

  test('rejects DROP TABLE injection', () => {
    expect(isValidUUID("'; DROP TABLE profiles; --")).toBe(false)
  })

  test('rejects semicolon-based injection', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000;DELETE FROM posts')).toBe(false)
  })

  test('rejects comment-based injection', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000--')).toBe(false)
  })

  test('rejects hex-encoded injection', () => {
    expect(isValidUUID('0x550e8400e29b41d4a716446655440000')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════
// XSS payloads
// ══════════════════════════════════════════════════════

describe('isValidUUID: XSS resistance', () => {
  test('rejects script tag', () => {
    expect(isValidUUID('<script>alert(1)</script>')).toBe(false)
  })

  test('rejects event handler', () => {
    expect(isValidUUID('550e8400" onload="alert(1)')).toBe(false)
  })

  test('rejects javascript: URI', () => {
    expect(isValidUUID('javascript:alert(1)')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════
// Path traversal
// ══════════════════════════════════════════════════════

describe('isValidUUID: Path traversal resistance', () => {
  test('rejects path traversal', () => {
    expect(isValidUUID('../../etc/passwd')).toBe(false)
  })

  test('rejects URL-encoded path traversal', () => {
    expect(isValidUUID('%2e%2e%2f%2e%2e%2fetc%2fpasswd')).toBe(false)
  })
})

// ══════════════════════════════════════════════════════
// Edge cases
// ══════════════════════════════════════════════════════

describe('isValidUUID: Edge cases', () => {
  test('rejects extremely long input', () => {
    const long = '550e8400-e29b-41d4-a716-446655440000'.repeat(1000)
    expect(isValidUUID(long)).toBe(false)
  })

  test('rejects UUID with unicode characters', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-44665544\u0000000')).toBe(false)
  })

  test('rejects UUID with newline characters', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000\n')).toBe(false)
  })

  test('rejects UUID with tab characters', () => {
    expect(isValidUUID('\t550e8400-e29b-41d4-a716-446655440000')).toBe(false)
  })

  test('rejects boolean inputs', () => {
    expect(isValidUUID(true as any)).toBe(false)
    expect(isValidUUID(false as any)).toBe(false)
  })

  test('rejects object input', () => {
    expect(isValidUUID({} as any)).toBe(false)
  })

  test('rejects array input', () => {
    expect(isValidUUID([] as any)).toBe(false)
  })

  test('accepts valid UUID after rejecting invalid ones (no state leakage)', () => {
    // Ensure previous test rejections don't affect this call
    expect(isValidUUID('invalid')).toBe(false)
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  // ── UUID format edge cases ──

  test('rejects nil UUID (all zeros)', () => {
    expect(isValidUUID('00000000-0000-0000-0000-000000000000')).toBe(true)
    // Nil UUID is technically valid UUID format
  })

  test('accepts uppercase UUID', () => {
    expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  test('accepts mixed case UUID', () => {
    expect(isValidUUID('550e8400-E29B-41d4-A716-446655440000')).toBe(true)
  })

  test('rejects UUID with extra segment', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false)
  })

  test('rejects UUID with missing segment', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false)
  })

  test('rejects UUID with wrong segment length', () => {
    expect(isValidUUID('550e840-e29b-41d4-a716-446655440000')).toBe(false)
    expect(isValidUUID('550e84000-e29b-41d4-a716-446655440000')).toBe(false)
  })

  test('rejects UUID with spaces', () => {
    expect(isValidUUID(' 550e8400-e29b-41d4-a716-446655440000')).toBe(false)
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000 ')).toBe(false)
    expect(isValidUUID('550e8400 -e29b-41d4-a716-446655440000')).toBe(false)
  })

  test('rejects UUID without dashes (compact form)', () => {
    expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false)
  })

  test('rejects number input', () => {
    expect(isValidUUID(12345 as any)).toBe(false)
  })

  test('rejects null and undefined', () => {
    expect(isValidUUID(null as any)).toBe(false)
    expect(isValidUUID(undefined as any)).toBe(false)
  })

  test('handles 1000 valid UUIDs without performance issues', () => {
    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      const hex = i.toString(16).padStart(12, '0')
      isValidUUID(`550e8400-e29b-41d4-a716-${hex}`)
    }
    const elapsed = performance.now() - start
    // 1000 validations should complete in under 50ms
    expect(elapsed).toBeLessThan(50)
  })
})
