import type { TrustLevel, UserBadge } from './types'

/**
 * Display-only trust level estimate from badges alone (for UI rendering in lists/cards).
 * This is NOT the authoritative trust calculation — the server-side trust score
 * considers additional signals (reviews, activity, verification status).
 * Full client-side trust evaluation with all signals is in useTrustLevel hook.
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
