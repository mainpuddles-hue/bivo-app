import type { Post } from './types'
import { computeTrustLevelFromBadges } from './trustUtils'

interface FeedContext {
  userNeighborhood: string | null
  followedIds: string[]
  now?: number
  personalScores?: Map<string, number> // post_id -> personalization score from DB
  boostedPostIds?: Set<string>
  /** Post types the user selected during onboarding. Boosts matching posts. */
  preferredTypes?: string[]
}

/**
 * Score a post for feed ranking. Higher = more relevant.
 *
 * Factors (weights sum to 1.0):
 * - Recency decay (0.20): 1/(1 + hours/24) — half-life 24h
 * - Engagement (0.20): normalized likes + comments
 * - Urgency (0.20): is_urgent flag
 * - Proximity (0.10): same neighborhood bonus
 * - Trust + social (0.10): trust level + following bonus
 * - Personalization (0.15): from collaborative filtering / interaction history
 * - Time-of-day relevance (0.05): boost category types by time of day
 */
export function scorePost(post: Post, ctx: FeedContext): number {
  const now = ctx.now ?? Date.now()
  if (!Number.isFinite(now)) return 0

  // Recency: exponential decay, half-life 24 hours
  const createdMs = post.created_at ? new Date(post.created_at).getTime() : NaN
  if (isNaN(createdMs)) return 0 // Skip corrupted posts with invalid dates
  const hoursOld = Math.max(0, (now - createdMs) / 3600000)
  const recency = 1 / (1 + hoursOld / 24)

  // Engagement: normalize to 0-1 (cap at 20 interactions)
  const interactions = (post.like_count ?? 0) + (post.comment_count ?? 0) * 2
  const engagement = Math.min(1, Math.max(0, interactions / 20))

  // Urgency: urgent posts
  let urgency = 0
  if (post.is_urgent) urgency = 1.0

  // Proximity: same neighborhood
  let proximity = 0
  if (ctx.userNeighborhood && post.location) {
    if (post.location.toLowerCase().includes(ctx.userNeighborhood.toLowerCase())) proximity = 1.0
  }
  if (ctx.userNeighborhood && post.user?.naapurusto?.toLowerCase() === ctx.userNeighborhood.toLowerCase()) proximity = Math.max(proximity, 0.8)

  // Trust + Social
  const trustLevel = computeTrustLevelFromBadges(post.user?.user_badges)
  const trustScore = trustLevel === 3 ? 1.0 : trustLevel === 2 ? 0.7 : 0.3
  const isFollowed = ctx.followedIds.includes(post.user_id) ? 0.3 : 0
  const isPro = post.is_pro_listing ? 0.2 : 0
  const social = Math.min(1, trustScore * 0.5 + isFollowed + isPro)

  // Personalization: from collaborative filtering
  const personalScore = ctx.personalScores?.get(post.id) ?? 0

  // Time-of-day relevance
  const hour = new Date().getHours()
  let timeRelevance = 0.5 // neutral
  if (hour >= 6 && hour < 10) {
    // Morning: boost needs
    timeRelevance = post.type === 'tarvitsen' ? 0.8 : 0.5
  } else if (hour >= 10 && hour < 17) {
    // Daytime: boost services
    timeRelevance = post.type === 'tarjoan' ? 0.8 : 0.5
  } else if (hour >= 17 && hour < 22) {
    // Evening: boost free items
    timeRelevance = post.type === 'ilmaista' ? 0.8 : 0.5
  }

  // Boost: multiplicative 1.4x instead of additive 0.5 — keeps score proportional
  // A low-quality boosted post won't dominate a high-quality organic one
  const boostMultiplier = ctx.boostedPostIds?.has(post.id) ? 1.4 : 1.0

  // Preferred types from onboarding: gentle 1.15x boost for matching categories
  // so user sees more of what they're interested in without being exclusionary
  const preferredBoost = ctx.preferredTypes && ctx.preferredTypes.includes(post.type) ? 1.15 : 1.0

  // Weighted sum (base 0.0–1.0, boosted up to 1.4)
  const baseScore = recency * 0.20 + engagement * 0.20 + urgency * 0.20 + proximity * 0.10 + social * 0.10 + personalScore * 0.15 + timeRelevance * 0.05
  return baseScore * boostMultiplier * preferredBoost
}

/**
 * Limit boosted posts to max 2 in the top 10 positions.
 * Excess boosted posts are pushed to position 11+.
 */
function enforceBoostedCap(posts: Post[], boostedIds: Set<string>): Post[] {
  if (boostedIds.size === 0) return posts
  const MAX_BOOSTED_IN_TOP = 2
  const TOP_N = 10

  const result = [...posts]
  const top = result.slice(0, TOP_N)
  const rest = result.slice(TOP_N)

  let boostedCount = 0
  const overflow: Post[] = []
  const filtered: Post[] = []

  for (const p of top) {
    if (boostedIds.has(p.id)) {
      boostedCount++
      if (boostedCount > MAX_BOOSTED_IN_TOP) {
        overflow.push(p)
        continue
      }
    }
    filtered.push(p)
  }

  // Pad filtered back to TOP_N with non-boosted posts from rest, then append overflow after
  const filler = rest.splice(0, TOP_N - filtered.length)
  return [...filtered, ...filler, ...overflow, ...rest]
}

/**
 * Sort posts by relevance score, with Pro listings always first.
 */
export function rankFeed(posts: Post[], ctx: FeedContext): Post[] {
  const sorted = [...posts].sort((a, b) => {
    // Pro listings always on top
    if (a.is_pro_listing && !b.is_pro_listing) return -1
    if (!a.is_pro_listing && b.is_pro_listing) return 1
    // Then by score
    return scorePost(b, ctx) - scorePost(a, ctx)
  })

  // Cap boosted posts in top positions to avoid feed domination
  if (ctx.boostedPostIds && ctx.boostedPostIds.size > 0) {
    return enforceBoostedCap(sorted, ctx.boostedPostIds)
  }

  return sorted
}
