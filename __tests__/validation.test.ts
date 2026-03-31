/**
 * Validation Utility Unit Tests
 *
 * Tests:
 * - isValidUUID() with valid UUIDs, invalid strings, empty, null, undefined
 * - UUID v4 format compliance
 * - Edge cases: uppercase, mixed case, partial matches
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

import { isValidUUID } from '../src/lib/validation'

// ══════════════════════════════════════════════════════
// isValidUUID — Valid UUIDs
// ══════════════════════════════════════════════════════

describe('isValidUUID: Valid UUIDs', () => {
  test('Standard UUID v4 lowercase is valid', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  test('Standard UUID v4 uppercase is valid', () => {
    expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  test('Mixed case UUID is valid', () => {
    expect(isValidUUID('550e8400-E29B-41d4-A716-446655440000')).toBe(true)
  })

  test('All-zeros UUID is valid format', () => {
    expect(isValidUUID('00000000-0000-0000-0000-000000000000')).toBe(true)
  })

  test('All-f UUID is valid format', () => {
    expect(isValidUUID('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(true)
  })

  test('UUID v1 format is valid', () => {
    expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true)
  })

  test('Multiple different valid UUIDs', () => {
    const validUUIDs = [
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      '123e4567-e89b-12d3-a456-426614174000',
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    ]
    for (const uuid of validUUIDs) {
      expect(isValidUUID(uuid)).toBe(true)
    }
  })
})

// ══════════════════════════════════════════════════════
// isValidUUID — Invalid inputs
// ══════════════════════════════════════════════════════

describe('isValidUUID: Invalid inputs', () => {
  test('Returns false for null', () => {
    expect(isValidUUID(null)).toBe(false)
  })

  test('Returns false for undefined', () => {
    expect(isValidUUID(undefined)).toBe(false)
  })

  test('Returns false for empty string', () => {
    expect(isValidUUID('')).toBe(false)
  })

  test('Returns false for plain string', () => {
    expect(isValidUUID('hello')).toBe(false)
    expect(isValidUUID('not-a-uuid')).toBe(false)
  })

  test('Returns false for UUID without dashes', () => {
    expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false)
  })

  test('Returns false for UUID with wrong dash positions', () => {
    expect(isValidUUID('550e840-0e29b-41d4-a716-446655440000')).toBe(false)
  })

  test('Returns false for too short UUID', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false)
  })

  test('Returns false for too long UUID', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false)
  })

  test('Returns false for UUID with invalid characters', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000g')).toBe(false)
    expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000z')).toBe(false)
  })

  test('Returns false for UUID with spaces', () => {
    expect(isValidUUID(' 550e8400-e29b-41d4-a716-446655440000')).toBe(false)
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000 ')).toBe(false)
    expect(isValidUUID('550e8400 -e29b-41d4-a716-446655440000')).toBe(false)
  })

  test('Returns false for UUID with braces', () => {
    expect(isValidUUID('{550e8400-e29b-41d4-a716-446655440000}')).toBe(false)
  })

  test('Returns false for number input', () => {
    expect(isValidUUID(12345 as any)).toBe(false)
  })

  test('Returns false for UUID with wrong segment lengths', () => {
    // 8-4-4-4-12 is correct; test incorrect lengths
    expect(isValidUUID('550e840-0e29b-41d4-a716-446655440000')).toBe(false) // 7-5-4-4-12
    expect(isValidUUID('550e84001-e29b-41d4-a716-44665544000')).toBe(false) // 9-4-4-4-11
  })
})

// ══════════════════════════════════════════════════════
// isValidUUID — Regex specifics
// ══════════════════════════════════════════════════════

describe('isValidUUID: Regex behavior', () => {
  test('Regex is case-insensitive (A-F and a-f both valid)', () => {
    expect(isValidUUID('ABCDEF01-2345-6789-ABCD-EF0123456789')).toBe(true)
    expect(isValidUUID('abcdef01-2345-6789-abcd-ef0123456789')).toBe(true)
  })

  test('Does not partially match (anchored with ^ and $)', () => {
    expect(isValidUUID('prefix-550e8400-e29b-41d4-a716-446655440000')).toBe(false)
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000-suffix')).toBe(false)
  })
})
