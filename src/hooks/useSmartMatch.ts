import { useState, useEffect, useCallback, useRef } from 'react'
import { useSupabase } from '@/hooks/useSupabase'

// ── Types ──

interface SmartMatch {
  postId: string
  postTitle: string
  matchedTags: string[]
  posterName: string
  matchScore: number // 0-100 percentage
  matchedNeedId: string // which tarvitsen post it matched
  matchedNeedTitle: string
}

interface ScoredCandidate {
  post: TarjoanPost
  needPost: TarvitsenPost
  score: number
  matchedTags: string[]
}

interface TarvitsenPost {
  id: string
  title: string
  tags: string[]
  location: string | null
  created_at: string
}

interface TarjoanPost {
  id: string
  title: string
  tags: string[]
  location: string | null
  user_id: string
  created_at: string
  user?: {
    name: string
    naapurusto: string
    response_rate: number
  } | null
  user_badges?: { badge_type: string }[]
}

// ── Scoring helpers ──

/** Jaccard similarity: |A ∩ B| / |A ∪ B| */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  const setA = new Set(a.map(s => s.toLowerCase()))
  const setB = new Set(b.map(s => s.toLowerCase()))
  let intersection = 0
  for (const item of setA) {
    if (setB.has(item)) intersection++
  }
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

/** Extract meaningful words (3+ chars) from a title for fuzzy matching */
function extractTitleWords(title: string): Set<string> {
  const stopWords = new Set([
    'ja', 'tai', 'on', 'ei', 'se', 'the', 'and', 'or', 'is', 'not',
    'ett', 'och', 'for', 'med', 'som', 'att', 'den', 'det', 'har',
    'olen', 'olen', 'haluan', 'tarvitsen', 'tarjoan', 'haen', 'etsin',
  ])
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-zäöåA-ZÄÖÅ0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stopWords.has(w))
  )
}

/** Category match bonus: check if tarjoan tags contain words from tarvitsen title */
function categoryMatchScore(needTitle: string, offerTags: string[]): number {
  if (offerTags.length === 0) return 0
  const titleWords = extractTitleWords(needTitle)
  if (titleWords.size === 0) return 0
  const tagWords = new Set(offerTags.map(t => t.toLowerCase()))
  let matches = 0
  for (const word of titleWords) {
    for (const tag of tagWords) {
      if (tag.includes(word) || word.includes(tag)) {
        matches++
        break
      }
    }
  }
  return Math.min(1, matches / titleWords.size)
}

/** Neighborhood proximity: 1.0 if same, 0.0 if different */
function neighborhoodProximity(needLocation: string | null, offerLocation: string | null): number {
  if (!needLocation || !offerLocation) return 0
  return needLocation.toLowerCase().trim() === offerLocation.toLowerCase().trim() ? 1.0 : 0.0
}

/** Poster quality: trust_level/3 + response_rate/100 (capped at 1.0) */
function posterQualityScore(
  badges: { badge_type: string }[] | undefined,
  responseRate: number
): number {
  // Derive trust level from badges
  let trustLevel = 1
  if (badges?.some(b => b.badge_type === 'trusted')) trustLevel = 3
  else if (badges?.some(b => b.badge_type === 'verified')) trustLevel = 2

  const trustScore = trustLevel / 3
  const responseScore = Math.min(100, Math.max(0, responseRate)) / 100
  return Math.min(1.0, (trustScore + responseScore) / 2)
}

/** Recency: 1/(1 + days_old/7) — half-life of 7 days */
function recencyScore(createdAt: string): number {
  const daysOld = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  return 1 / (1 + daysOld / 7)
}

// ── Semantic matching via Edge Function ──

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`

interface SemanticMatch {
  post_id: string
  score: number
  title?: string
  user_name?: string
}

// Cache semantic match results per post_id for 10 minutes to avoid calling
// the Edge Function on every mount/re-render of the feed screen.
const semanticCache = new Map<string, { matches: SemanticMatch[]; fetchedAt: number }>()
const SEMANTIC_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

async function fetchSemanticMatches(
  supabase: ReturnType<typeof import('@/lib/supabase/client').createClient>,
  postId: string,
  neighborhood: string | null,
): Promise<SemanticMatch[]> {
  // Check cache first
  const cached = semanticCache.get(postId)
  if (cached && (Date.now() - cached.fetchedAt) < SEMANTIC_CACHE_TTL) {
    return cached.matches
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) { clearTimeout(timeout); return [] }

    const res = await fetch(`${FUNCTIONS_URL}/semantic-match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        post_id: postId,
        match_type: 'tarjoan',
        threshold: 0.5,
        limit: 5,
        neighborhood,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) return []
    const { matches } = await res.json()
    const result = (matches ?? []) as SemanticMatch[]

    // Evict oldest entries if cache exceeds max size
    if (semanticCache.size >= 200) {
      const keysIter = semanticCache.keys()
      for (let i = 0; i < 50; i++) {
        const oldest = keysIter.next()
        if (oldest.done) break
        semanticCache.delete(oldest.value)
      }
    }

    // Cache the result
    semanticCache.set(postId, { matches: result, fetchedAt: Date.now() })

    return result
  } catch {
    clearTimeout(timeout) // Prevent timer leak on error
    return []
  }
}

// ── Weights ──
const WEIGHT_TAG_OVERLAP = 0.30
const WEIGHT_CATEGORY_MATCH = 0.25
const WEIGHT_NEIGHBORHOOD = 0.20
const WEIGHT_POSTER_QUALITY = 0.15
const WEIGHT_RECENCY = 0.10

const MIN_SCORE_THRESHOLD = 0.3
const MAX_MATCHES = 5

function scoreCandidate(need: TarvitsenPost, offer: TarjoanPost): ScoredCandidate {
  const needTags = need.tags ?? []
  const offerTags = offer.tags ?? []

  // Individual signal scores (all 0-1)
  const tagOverlap = jaccardSimilarity(needTags, offerTags)
  const catMatch = categoryMatchScore(need.title, offerTags)
  const neighborhoodScore = neighborhoodProximity(need.location, offer.user?.naapurusto ?? offer.location)
  const posterQuality = posterQualityScore(offer.user_badges, offer.user?.response_rate ?? 0)
  const recency = recencyScore(offer.created_at)

  // Weighted sum
  const score =
    tagOverlap * WEIGHT_TAG_OVERLAP +
    catMatch * WEIGHT_CATEGORY_MATCH +
    neighborhoodScore * WEIGHT_NEIGHBORHOOD +
    posterQuality * WEIGHT_POSTER_QUALITY +
    recency * WEIGHT_RECENCY

  // Compute matched tags for display
  const needTagsLower = new Set(needTags.map(t => t.toLowerCase()))
  const matchedTags = offerTags.filter(t => needTagsLower.has(t.toLowerCase()))

  return { post: offer, needPost: need, score, matchedTags }
}

// ── Hook ──

export function useSmartMatch(userId: string | null) {
  const [matches, setMatches] = useState<SmartMatch[]>([])
  const supabase = useSupabase()
  const dismissedRef = useRef(new Set<string>())

  const evaluateMatches = useCallback(async (
    userNeeds: TarvitsenPost[],
    offers: TarjoanPost[],
    dismissed: Set<string>,
    neighborhood?: string | null,
    currentUserId?: string | null,
  ) => {
    if (userNeeds.length === 0 || offers.length === 0) return

    const allCandidates: ScoredCandidate[] = []

    for (const need of userNeeds) {
      for (const offer of offers) {
        // Skip own posts — compare user IDs (need.id is the POST id, not user_id)
        // The neq('user_id', userId) filter on the query already excludes user's own offers,
        // but this is a safety check in case of data inconsistencies
        if (currentUserId && offer.user_id === currentUserId) continue
        // Skip dismissed
        if (dismissed.has(offer.id)) continue

        const candidate = scoreCandidate(need, offer)
        if (candidate.score >= MIN_SCORE_THRESHOLD) {
          allCandidates.push(candidate)
        }
      }
    }

    // Enhance with semantic matches from the edge function (non-blocking)
    try {
      const semanticResults = await Promise.all(
        userNeeds.slice(0, 3).map(need =>
          fetchSemanticMatches(supabase, need.id, neighborhood ?? null)
            .then(matches => matches.map(m => ({ ...m, needId: need.id, needTitle: need.title })))
        )
      )

      for (const results of semanticResults) {
        for (const sm of results) {
          if (dismissed.has(sm.post_id)) continue
          // Check if we already have this candidate with a higher score
          const existing = allCandidates.find(c => c.post.id === sm.post_id)
          if (existing && existing.score >= sm.score) continue

          // If semantic match found a post not in our tag-based results, add it
          if (!existing) {
            const matchedOffer = offers.find(o => o.id === sm.post_id)
            if (matchedOffer) {
              allCandidates.push({
                post: matchedOffer,
                needPost: { id: sm.needId, title: sm.needTitle, tags: [], location: null, created_at: '' },
                score: sm.score,
                matchedTags: [],
              })
            } else {
              // Semantic match found a post we didn't fetch — create a placeholder
              allCandidates.push({
                post: {
                  id: sm.post_id,
                  title: sm.title ?? '',
                  tags: [],
                  location: null,
                  user_id: '',
                  created_at: '',
                  user: { name: sm.user_name ?? '?', naapurusto: '', response_rate: 0 },
                  user_badges: [],
                },
                needPost: { id: sm.needId, title: sm.needTitle, tags: [], location: null, created_at: '' },
                score: sm.score,
                matchedTags: [],
              })
            }
          } else {
            // Update score to the higher one from semantic matching
            existing.score = Math.max(existing.score, sm.score)
          }
        }
      }
    } catch {
      // Semantic matching failed — continue with tag-based matches only
    }

    // Sort by score descending, take top N
    allCandidates.sort((a, b) => b.score - a.score)

    // Deduplicate by offer post id (keep best score)
    const seen = new Set<string>()
    const deduped: ScoredCandidate[] = []
    for (const c of allCandidates) {
      if (!seen.has(c.post.id)) {
        seen.add(c.post.id)
        deduped.push(c)
      }
    }

    const topMatches = deduped.slice(0, MAX_MATCHES).map<SmartMatch>(c => ({
      postId: c.post.id,
      postTitle: c.post.title,
      matchedTags: c.matchedTags,
      posterName: c.post.user?.name ?? '?',
      matchScore: Math.round(c.score * 100),
      matchedNeedId: c.needPost.id,
      matchedNeedTitle: c.needPost.title,
    }))

    setMatches(topMatches)
  }, [supabase])

  useEffect(() => {
    if (!userId) return

    let cancelled = false

    const fetchAndEvaluate = async () => {
      // 1. Fetch user's recent tarvitsen posts (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data: needs } = await (supabase
        .from('posts')
        .select('id, title, tags, location, created_at')
        .eq('user_id', userId)
        .eq('type', 'tarvitsen')
        .eq('is_active', true)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(10) as any)

      if (cancelled) return
      if (!needs?.length) {
        setMatches([])
        return
      }

      const userNeeds = needs as TarvitsenPost[]

      // 2. Fetch tarjoan posts from last 14 days
      const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString()
      const { data: offers } = await (supabase
        .from('posts')
        .select(`
          id, title, tags, location, user_id, created_at,
          user:profiles!posts_user_id_fkey(name, naapurusto, response_rate),
          user_badges:user_badges!user_badges_user_id_fkey(badge_type)
        `)
        .eq('type', 'tarjoan')
        .eq('is_active', true)
        .neq('user_id', userId)
        .gte('created_at', fourteenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(100) as any)

      if (cancelled) return

      const offerPosts = (offers ?? []).map((o: any) => ({
        ...o,
        user: Array.isArray(o.user) ? o.user[0] : o.user,
        user_badges: Array.isArray(o.user_badges) ? o.user_badges : [],
      })) as TarjoanPost[]

      // Also fetch user neighborhood for semantic matching
      let neighborhood: string | null = null
      const { data: profileData } = await (supabase
        .from('profiles')
        .select('naapurusto')
        .eq('id', userId)
        .maybeSingle() as any)
      if (profileData?.naapurusto) neighborhood = profileData.naapurusto

      await evaluateMatches(userNeeds, offerPosts, dismissedRef.current, neighborhood, userId)
    }

    fetchAndEvaluate()

    // Re-evaluate every 60 seconds instead of using a realtime channel
    const interval = setInterval(() => {
      if (!cancelled) fetchAndEvaluate().catch(() => {})
    }, 60000)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [userId, supabase, evaluateMatches])

  const dismissMatch = useCallback((postId: string) => {
    dismissedRef.current.add(postId)
    setMatches(prev => prev.filter(m => m.postId !== postId))
  }, [])

  return { matches, dismissMatch }
}
