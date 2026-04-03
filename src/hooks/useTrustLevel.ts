import { useState, useEffect, useMemo, useRef } from 'react'
import { useSupabase } from '@/hooks/useSupabase'
import { TRUST_TIERS, TIER_2_REQUIREMENTS, TIER_3_REQUIREMENTS } from '@/lib/constants'
import type { TrustLevel, TrustSignals, TrustPermissions } from '@/lib/types'

interface TrustResult {
  level: TrustLevel
  signals: TrustSignals
  permissions: TrustPermissions
  tier: typeof TRUST_TIERS[TrustLevel]
  loading: boolean
  /** What the user needs to reach the next tier */
  nextTierHints: string[]
  /** Continuous trust score 0-100 from server RPC */
  score: number
  /** Factor breakdown from server RPC */
  factors: Record<string, number>
}

function computeTrustLevel(signals: TrustSignals): TrustLevel {
  // Tier 3: Luotettu kumppani
  if (
    signals.idVerified &&
    signals.reviewCount >= TIER_3_REQUIREMENTS.minReviews &&
    signals.avgRating >= TIER_3_REQUIREMENTS.minAvgRating &&
    signals.responseRate >= TIER_3_REQUIREMENTS.minResponseRate &&
    signals.accountAgeDays >= TIER_3_REQUIREMENTS.minAccountAgeDays &&
    !signals.hasActiveReports
  ) {
    return 3
  }

  // Tier 2: Vahvistettu
  if (
    signals.idVerified &&
    signals.accountAgeDays >= TIER_2_REQUIREMENTS.minAccountAgeDays
  ) {
    return 2
  }

  // Tier 1: Peruskäyttäjä
  return 1
}

function getNextTierHints(level: TrustLevel, signals: TrustSignals): string[] {
  if (level >= 3) return []

  if (level === 1) {
    const hints: string[] = []
    if (!signals.idVerified) hints.push('trust.hintVerifyId')
    if (signals.accountAgeDays < TIER_2_REQUIREMENTS.minAccountAgeDays) {
      hints.push('trust.hintAccountAge')
    }
    return hints
  }

  // level === 2, hints for tier 3
  const hints: string[] = []
  if (signals.reviewCount < TIER_3_REQUIREMENTS.minReviews) {
    hints.push('trust.hintMoreReviews')
  }
  if (signals.avgRating < TIER_3_REQUIREMENTS.minAvgRating) {
    hints.push('trust.hintBetterRating')
  }
  if (signals.responseRate < TIER_3_REQUIREMENTS.minResponseRate) {
    hints.push('trust.hintResponseRate')
  }
  if (signals.hasActiveReports) {
    hints.push('trust.hintNoReports')
  }
  return hints
}

const DEFAULT_SIGNALS: TrustSignals = {
  emailVerified: false,
  idVerified: false,
  reviewCount: 0,
  avgRating: 0,
  responseRate: 0,
  accountAgeDays: 0,
  hasActiveReports: false,
}

// In-memory cache: stores trust results per userId with a 5-minute TTL.
// This prevents redundant DB queries + RPC calls when navigating between
// screens that all import useTrustLevel (profile, create, post detail, public profile).
const trustCache = new Map<string, {
  signals: TrustSignals
  score: number
  factors: Record<string, number>
  serverTier: TrustLevel | null
  fetchedAt: number
}>()

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export function useTrustLevel(userId?: string | null): TrustResult {
  const [signals, setSignals] = useState<TrustSignals>(DEFAULT_SIGNALS)
  const [loading, setLoading] = useState(true)
  const [score, setScore] = useState(0)
  const [factors, setFactors] = useState<Record<string, number>>({})
  const [serverTier, setServerTier] = useState<TrustLevel | null>(null)
  const fetchingForRef = useRef<string | null>(null) // Track which userId is being fetched

  const supabase = useSupabase()

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let mounted = true

    // Check in-memory cache first
    const cached = trustCache.get(userId)
    if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
      setSignals(cached.signals)
      setScore(cached.score)
      setFactors(cached.factors)
      setServerTier(cached.serverTier)
      setLoading(false)
      return
    }

    // Prevent duplicate concurrent fetches for the SAME userId
    // But allow fetches for a DIFFERENT userId (e.g., navigating to another profile)
    if (fetchingForRef.current === userId) return
    fetchingForRef.current = userId

    async function fetchSignals() {
      try {
        const [profileRes, badgesRes, reviewsRes, reportsRes] = await Promise.all([
          supabase.from('profiles').select('response_rate, created_at').eq('id', userId!).single(),
          supabase.from('user_badges').select('badge_type').eq('user_id', userId!),
          supabase.from('reviews').select('rating').eq('reviewed_id', userId!),
          supabase.from('reports').select('id').eq('reported_id', userId!).eq('status', 'open')
            .then(res => res.error ? { data: [], error: res.error } : res),
        ])

        if (!mounted) return

        const profile = profileRes.data as any
        const badges = (badgesRes.data ?? []) as { badge_type: string }[]
        const reviews = (reviewsRes.data ?? []) as { rating: number }[]
        const reports = reportsRes.data ?? []

        const accountAgeDays = profile?.created_at
          ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000)
          : 0

        const avgRating = reviews.length > 0
          ? reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / reviews.length
          : 0

        const newSignals: TrustSignals = {
          emailVerified: !!profile?.created_at, // email is on auth.users, not profiles; use account existence as proxy
          idVerified: badges.some(b => b.badge_type === 'verified'),
          reviewCount: reviews.length,
          avgRating: Math.round(avgRating * 10) / 10,
          responseRate: profile?.response_rate ?? 0,
          accountAgeDays,
          hasActiveReports: reports.length > 0,
        }

        setSignals(newSignals)

        // After existing signal fetching, call the DB function for comprehensive score
        let newScore = 0
        let newFactors: Record<string, number> = {}
        let newServerTier: TrustLevel | null = null

        try {
          const { data: trustData } = await (supabase.rpc as any)('calculate_trust_score', { p_user_id: userId })
          if (mounted && trustData && (trustData as any[]).length > 0) {
            const result = (trustData as any[])[0]
            if (typeof result.score === 'number') {
              newScore = result.score
              setScore(newScore)
            }
            if (result.factors && typeof result.factors === 'object') {
              newFactors = result.factors
              setFactors(newFactors)
            }
            if (result.tier && (result.tier === 1 || result.tier === 2 || result.tier === 3)) {
              newServerTier = result.tier as TrustLevel
              setServerTier(newServerTier)
            }
          }
        } catch {
          // Intentional: RPC unavailable — use client-side computation only
        }

        // Evict oldest entries if cache exceeds max size
        if (trustCache.size >= 200) {
          const keysIter = trustCache.keys()
          for (let i = 0; i < 50; i++) {
            const oldest = keysIter.next()
            if (oldest.done) break
            trustCache.delete(oldest.value)
          }
        }

        // Cache the result
        trustCache.set(userId!, {
          signals: newSignals,
          score: newScore,
          factors: newFactors,
          serverTier: newServerTier,
          fetchedAt: Date.now(),
        })
      } catch {
        // Intentional: graceful fallback — keep default signals (tier 1) and score 0
      } finally {
        if (fetchingForRef.current === userId) fetchingForRef.current = null
        if (mounted) setLoading(false)
      }
    }

    fetchSignals()
    return () => { mounted = false }
  }, [userId, supabase])

  const clientLevel = useMemo(() => computeTrustLevel(signals), [signals])
  // Prefer server-computed tier when available (handles downgrades)
  const level = serverTier ?? clientLevel
  const tier = TRUST_TIERS[level]
  const permissions = tier.permissions
  const nextTierHints = useMemo(() => getNextTierHints(level, signals), [level, signals])

  return { level, signals, permissions, tier, loading, nextTierHints, score, factors }
}

/** Invalidate the trust cache for a specific user (e.g., after verification) */
export function invalidateTrustCache(userId: string) {
  trustCache.delete(userId)
}
