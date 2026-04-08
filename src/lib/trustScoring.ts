declare const __DEV__: boolean

interface TrustFactors {
  completedTransactions: number
  cancelledTransactions: number
  averageRating: number
  reviewCount: number
  accountAgeDays: number
  hasVerifiedIdentity: boolean
  responseRate: number
  reportCount: number
}

/**
 * Calculate dynamic trust score (0-100) based on user behavior.
 * Higher = more trustworthy.
 */
export function calculateDynamicTrustScore(factors: TrustFactors): number {
  let score = 50 // Base score

  // Completed transactions (+2 each, max +20)
  score += Math.min(factors.completedTransactions * 2, 20)

  // Cancelled transactions (-5 each, max -15)
  score -= Math.min(factors.cancelledTransactions * 5, 15)

  // Average rating (0-5 stars → 0-15 points)
  if (factors.reviewCount > 0) {
    score += (factors.averageRating / 5) * 15
  }

  // Account age (logarithmic, max +10)
  score += Math.min(Math.log2(factors.accountAgeDays + 1) * 1.5, 10)

  // Identity verified (+10)
  if (factors.hasVerifiedIdentity) score += 10

  // Response rate (0-1 → 0-5)
  score += factors.responseRate * 5

  // Reports (-10 each, max -20)
  score -= Math.min(factors.reportCount * 10, 20)

  // Clamp to 0-100
  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * Trust level label based on score
 */
export function getTrustLabel(score: number): 'new' | 'basic' | 'trusted' | 'verified' | 'star' {
  if (score >= 85) return 'star'
  if (score >= 70) return 'verified'
  if (score >= 50) return 'trusted'
  if (score >= 30) return 'basic'
  return 'new'
}
