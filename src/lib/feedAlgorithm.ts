import type { Post } from './types'
import { computeTrustLevelFromBadges } from './trustUtils'

interface FeedContext {
  userNeighborhood: string | null
  followedIds: string[]
  now?: number
  personalScores?: Map<string, number> // post_id -> personalization score from DB
}

/**
 * Score a post for feed ranking. Higher = more relevant.
 *
 * Factors (weights sum to 1.0):
 * - Recency decay (0.25): 1/(1 + hours/24) — half-life 24h
 * - Engagement (0.20): normalized likes + comments
 * - Urgency (0.20): is_urgent or nappaa expiring soon
 * - Proximity (0.10): same neighborhood bonus
 * - Trust + social (0.10): trust level + following bonus
 * - Personalization (0.15): from collaborative filtering / interaction history
 */
export function scorePost(post: Post, ctx: FeedContext): number {
  const now = ctx.now ?? Date.now()

  // Recency: exponential decay, half-life 24 hours
  const hoursOld = (now - new Date(post.created_at).getTime()) / 3600000
  const recency = 1 / (1 + hoursOld / 24)

  // Engagement: normalize to 0-1 (cap at 20 interactions)
  const interactions = (post.like_count ?? 0) + (post.comment_count ?? 0) * 2
  const engagement = Math.min(1, interactions / 20)

  // Urgency: urgent posts or nappaa expiring within 8h
  let urgency = 0
  if (post.is_urgent) urgency = 1.0
  else if (post.type === 'nappaa' && post.expires_at) {
    const timeLeft = new Date(post.expires_at).getTime() - now
    if (timeLeft > 0 && timeLeft < 8 * 3600000) urgency = 0.8
  }

  // Proximity: same neighborhood
  let proximity = 0
  if (ctx.userNeighborhood && post.location) {
    if (post.location.toLowerCase().includes(ctx.userNeighborhood.toLowerCase())) proximity = 1.0
  }
  if (ctx.userNeighborhood && post.user?.naapurusto === ctx.userNeighborhood) proximity = Math.max(proximity, 0.8)

  // Trust + Social
  const trustLevel = computeTrustLevelFromBadges(post.user?.user_badges)
  const trustScore = trustLevel === 3 ? 1.0 : trustLevel === 2 ? 0.7 : 0.3
  const isFollowed = ctx.followedIds.includes(post.user_id) ? 0.3 : 0
  const isPro = post.is_pro_listing ? 0.2 : 0
  const social = Math.min(1, trustScore * 0.5 + isFollowed + isPro)

  // Personalization: from collaborative filtering
  const personalScore = ctx.personalScores?.get(post.id) ?? 0

  // Weighted sum
  return recency * 0.25 + engagement * 0.20 + urgency * 0.20 + proximity * 0.10 + social * 0.10 + personalScore * 0.15
}

/**
 * Sort posts by relevance score, with Pro listings always first.
 */
export function rankFeed(posts: Post[], ctx: FeedContext): Post[] {
  return [...posts].sort((a, b) => {
    // Pro listings always on top
    if (a.is_pro_listing && !b.is_pro_listing) return -1
    if (!a.is_pro_listing && b.is_pro_listing) return 1
    // Then by score
    return scorePost(b, ctx) - scorePost(a, ctx)
  })
}
