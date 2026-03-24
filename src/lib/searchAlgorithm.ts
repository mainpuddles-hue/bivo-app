interface SearchResult {
  id: string
  type: string
  title: string
  description: string
  location: string | null
  like_count: number
  comment_count: number
  is_active: boolean
  created_at: string
  user?: { naapurusto?: string }
}

interface SearchContext {
  query: string
  userNeighborhood: string | null
}

export function scoreSearchResult(item: SearchResult, ctx: SearchContext): number {
  const q = ctx.query.toLowerCase()
  const title = (item.title || '').toLowerCase()
  const desc = (item.description || '').toLowerCase()

  let score = 0

  // Title exact match (highest value)
  if (title === q) score += 100
  // Title starts with query
  else if (title.startsWith(q)) score += 80
  // Title contains query
  else if (title.includes(q)) score += 60

  // Description contains query
  if (desc.includes(q)) score += 30

  // Word-level matching for multi-word queries
  const words = q.split(/\s+/).filter(w => w.length > 2)
  if (words.length > 1) {
    const titleWords = words.filter(w => title.includes(w)).length
    const descWords = words.filter(w => desc.includes(w)).length
    score += (titleWords / words.length) * 40
    score += (descWords / words.length) * 15
  }

  // Engagement boost (0-20 points)
  const interactions = (item.like_count ?? 0) + (item.comment_count ?? 0)
  score += Math.min(20, interactions * 2)

  // Recency boost (0-15 points, newer = better)
  const daysOld = (Date.now() - new Date(item.created_at).getTime()) / 86400000
  score += Math.max(0, 15 - daysOld * 0.5)

  // Same neighborhood boost
  if (ctx.userNeighborhood && item.user?.naapurusto === ctx.userNeighborhood) {
    score += 10
  }

  // Active post boost
  if (item.is_active) score += 5

  return score
}

export function rankSearchResults<T extends SearchResult>(results: T[], ctx: SearchContext): T[] {
  return [...results].sort((a, b) => scoreSearchResult(b, ctx) - scoreSearchResult(a, ctx))
}
