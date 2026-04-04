declare const __DEV__: boolean

import { getRecentCategories, type EventInteraction } from './eventInteractions'

/**
 * All event interest categories available in TackBird.
 */
export const EVENT_CATEGORIES = [
  'music', 'sport', 'culture', 'food', 'family', 'nature',
  'theatre', 'exhibition', 'education', 'festival', 'other', 'underground',
] as const

export type EventCategory = (typeof EVENT_CATEGORIES)[number]

export interface RankedEvent {
  id: string
  title: string
  date: string
  category: string
  location?: string | null
  isFree?: boolean
  infoUrl?: string | null
  isCity?: boolean
  latitude?: number
  longitude?: number
  score: number
  breakdown?: {
    interestMatch: number
    interaction: number
    recency: number
    distance: number
    diversity: number
  }
}

interface EventInput {
  id: string
  title: string
  date: string
  category: string
  latitude?: number
  longitude?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

// ── Weights (must sum to 1.0) ──────────────────────────────────────────
const W_INTEREST = 0.30
const W_INTERACTION = 0.25
const W_RECENCY = 0.20
const W_DISTANCE = 0.15
const W_DIVERSITY = 0.10

// ── Scoring Functions ──────────────────────────────────────────────────

/**
 * Interest profile matching (30%).
 * 1.0 if the event's category is in the user's explicit interests, 0.0 otherwise.
 */
function scoreInterestMatch(eventCategory: string, userInterests: string[]): number {
  if (userInterests.length === 0) return 0.5 // Neutral if no preferences set
  return userInterests.includes(eventCategory) ? 1.0 : 0.0
}

/**
 * Interaction tracking (25%).
 * Score based on how often the user clicks on events of this category.
 * The most-clicked category gets 1.0, others proportionally less.
 */
function scoreInteraction(
  eventCategory: string,
  clickHistory: { category: string; timestamp: number }[],
): number {
  if (clickHistory.length === 0) return 0.0

  const counts = new Map<string, number>()
  for (const entry of clickHistory) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1)
  }

  const categoryCount = counts.get(eventCategory) ?? 0
  if (categoryCount === 0) return 0.0

  let maxCount = 0
  for (const c of counts.values()) {
    if (c > maxCount) maxCount = c
  }

  return maxCount > 0 ? categoryCount / maxCount : 0.0
}

/**
 * Recency score (20%).
 * Events happening sooner score higher.
 * Today = 1.0, tomorrow = 0.8, this week = 0.5, later = 0.2
 */
function scoreRecency(eventDate: string, now?: number): number {
  const currentMs = now ?? Date.now()
  const eventMs = new Date(eventDate).getTime()
  if (isNaN(eventMs)) return 0.2

  const diffMs = eventMs - currentMs
  // Past events get minimum score
  if (diffMs < 0) return 0.1

  const diffHours = diffMs / 3600000

  if (diffHours <= 24) return 1.0       // Today
  if (diffHours <= 48) return 0.8       // Tomorrow
  if (diffHours <= 168) return 0.5      // This week (7 days)
  return 0.2                            // Later
}

/**
 * Distance score (15%).
 * Closer events score higher. Returns neutral 0.5 if location unavailable.
 * <1km = 1.0, 1-3km = 0.7, 3-5km = 0.4, >5km = 0.2
 */
function scoreDistance(
  eventLat: number | undefined,
  eventLng: number | undefined,
  userLocation: { latitude: number; longitude: number } | null,
): number {
  if (!userLocation || eventLat == null || eventLng == null) return 0.5

  const km = haversineKm(userLocation.latitude, userLocation.longitude, eventLat, eventLng)

  if (km < 1) return 1.0
  if (km < 3) return 0.7
  if (km < 5) return 0.4
  return 0.2
}

/**
 * Diversity bonus (10%).
 * Boost categories the user hasn't interacted with recently to encourage discovery.
 * Categories NOT in the recent interaction set get 1.0; already-interacted get 0.0.
 */
function scoreDiversity(
  eventCategory: string,
  recentCategories: Set<string>,
): number {
  if (recentCategories.size === 0) return 0.5 // Neutral if no history
  return recentCategories.has(eventCategory) ? 0.0 : 1.0
}

// ── Haversine Distance ─────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth radius in km
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180)
}

// ── Main Export ────────────────────────────────────────────────────────

/**
 * Rank events for a user based on five weighted factors:
 * - Interest profile matching (30%)
 * - Interaction tracking (25%)
 * - Recency score (20%)
 * - Distance score (15%)
 * - Diversity bonus (10%)
 *
 * Returns events sorted by score (highest first).
 */
export function rankEvents(
  events: EventInput[],
  userInterests: string[],
  clickHistory: { category: string; timestamp: number }[],
  userLocation: { latitude: number; longitude: number } | null,
): RankedEvent[] {
  const now = Date.now()
  const recentCategories = getRecentCategories(
    clickHistory.map((h) => ({ eventId: '', ...h })) satisfies EventInteraction[],
    14,
  )

  const ranked: RankedEvent[] = events.map((event) => {
    const interestMatch = scoreInterestMatch(event.category, userInterests)
    const interaction = scoreInteraction(event.category, clickHistory)
    const recency = scoreRecency(event.date, now)
    const distance = scoreDistance(event.latitude, event.longitude, userLocation)
    const diversity = scoreDiversity(event.category, recentCategories)

    const score =
      interestMatch * W_INTEREST +
      interaction * W_INTERACTION +
      recency * W_RECENCY +
      distance * W_DISTANCE +
      diversity * W_DIVERSITY

    const result: RankedEvent = {
      ...event,
      score,
    }

    if (__DEV__) {
      result.breakdown = { interestMatch, interaction, recency, distance, diversity }
    }

    return result
  })

  return ranked.sort((a, b) => b.score - a.score)
}
