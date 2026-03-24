import type { TrustLevel, UserBadge } from './types'

/**
 * Quick trust level estimate from badges alone (for display in lists).
 * Full trust evaluation with all signals is in useTrustLevel hook.
 *
 * - Has 'trusted' badge → Tier 3
 * - Has 'verified' badge → Tier 2
 * - Otherwise → Tier 1
 */
export function computeTrustLevelFromBadges(badges?: UserBadge[]): TrustLevel {
  if (!badges || badges.length === 0) return 1
  if (badges.some(b => b.badge_type === 'trusted')) return 3
  if (badges.some(b => b.badge_type === 'verified')) return 2
  return 1
}
