import { isValidUUID } from '@/lib/validation'

/** Valid deep link routes and their parameter requirements */
const VALID_ROUTES: Record<string, { params?: string[]; validate?: (params: Record<string, string>) => boolean }> = {
  '/': {},
  '/(tabs)': {},
  '/(auth)/login': {},
  '/onboarding': {},
  '/notifications': {},
  '/settings': {},
  '/search': {},
  '/saved': {},
  '/map': {},
  '/bookings': {},
  '/pro': {},
  '/forum': {},
  '/groups': {},
  '/activities': {},
  '/leaderboard': {},
  '/admin': {},
  '/help': {},
  '/about': {},
  '/privacy': {},
  '/terms': {},
  '/blocked': {},
  '/boosts': {},
  '/create-ad': {},
  '/create-event': {},
  '/upgrade-business': {},
  '/organization': {},
  '/payment-settings': {},
  '/payment-history': {},
  '/community-events': {},
  '/verify-otp': {},
  '/payment/success': {},
  '/payment/cancel': {},
  '/verification/success': {},
  '/verification/error': {},
  '/auth/callback': {},
  '/post/:id': {
    params: ['id'],
    validate: (p) => isValidUUID(p.id),
  },
  '/messages/:id': {
    params: ['id'],
    validate: (p) => isValidUUID(p.id),
  },
  '/profile/:userId': {
    params: ['userId'],
    validate: (p) => isValidUUID(p.userId),
  },
  '/event/:id': {
    params: ['id'],
    validate: (p) => isValidUUID(p.id),
  },
  '/booking/:id': {
    params: ['id'],
    validate: (p) => isValidUUID(p.id),
  },
  '/groups/:id': {
    params: ['id'],
    validate: (p) => isValidUUID(p.id),
  },
}

/**
 * Validate a deep link path.
 * Returns true if the route exists and params are valid.
 *
 * @example
 * isValidDeepLink('/post/123e4567-e89b-12d3-a456-426614174000') // true
 * isValidDeepLink('/post/not-a-uuid') // false
 * isValidDeepLink('/nonexistent') // false
 */
export function isValidDeepLink(path: string): boolean {
  // Exact match
  if (VALID_ROUTES[path]) return true

  // Dynamic route match
  for (const [pattern, config] of Object.entries(VALID_ROUTES)) {
    if (!pattern.includes(':')) continue

    const patternParts = pattern.split('/')
    const pathParts = path.split('/')

    if (patternParts.length !== pathParts.length) continue

    let match = true
    const extractedParams: Record<string, string> = {}

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        extractedParams[patternParts[i].slice(1)] = pathParts[i]
      } else if (patternParts[i] !== pathParts[i]) {
        match = false
        break
      }
    }

    if (match) {
      if (config.validate) {
        return config.validate(extractedParams)
      }
      return true
    }
  }

  return false
}
