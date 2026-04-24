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

interface RankedEvent {
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
  source?: string
  imageUrl?: string | null
  score: number
  breakdown?: {
    interestMatch: number
    interaction: number
    recency: number
    distance: number
    diversity: number
    timeOfDay: number
    imageBonus: number
  }
}

interface EventInput {
  id: string
  title: string
  date: string
  category: string
  latitude?: number
  longitude?: number
  source?: string
  isFree?: boolean
  imageUrl?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

// ── Weights (must sum to 1.0) ──────────────────────────────────────────
const W_INTEREST    = 0.25
const W_INTERACTION = 0.20
const W_RECENCY     = 0.18
const W_DISTANCE    = 0.12
const W_DIVERSITY   = 0.08
const W_TIME_OF_DAY = 0.10
const W_IMAGE_BONUS = 0.07

// ── Scoring Functions ──────────────────────────────────────────────────

/**
 * Interest profile matching (25%).
 * 1.0 if the event's category is in the user's explicit interests, 0.0 otherwise.
 */
function scoreInterestMatch(eventCategory: string, userInterests: string[]): number {
  if (userInterests.length === 0) return 0.5 // Neutral if no preferences set
  return userInterests.includes(eventCategory) ? 1.0 : 0.0
}

/**
 * Interaction tracking with time decay (20%).
 * Recent clicks weigh more than old clicks.
 */
function scoreInteraction(
  eventCategory: string,
  clickHistory: { category: string; timestamp: number }[],
): number {
  if (clickHistory.length === 0) return 0.0

  const now = Date.now()
  const DECAY_HALF_LIFE = 7 * 24 * 60 * 60 * 1000 // 7 days

  const weightedCounts = new Map<string, number>()
  for (const entry of clickHistory) {
    const age = now - entry.timestamp
    const weight = Math.pow(0.5, age / DECAY_HALF_LIFE)
    weightedCounts.set(entry.category, (weightedCounts.get(entry.category) ?? 0) + weight)
  }

  const categoryScore = weightedCounts.get(eventCategory) ?? 0
  if (categoryScore === 0) return 0.0

  let maxScore = 0
  for (const s of weightedCounts.values()) {
    if (s > maxScore) maxScore = s
  }

  return maxScore > 0 ? categoryScore / maxScore : 0.0
}

/**
 * Recency score (18%).
 * Smooth exponential decay — events happening sooner score higher.
 */
function scoreRecency(eventDate: string, now?: number): number {
  const currentMs = now ?? Date.now()
  const eventMs = new Date(eventDate).getTime()
  if (isNaN(eventMs)) return 0.2

  const diffMs = eventMs - currentMs
  if (diffMs < -86400000) return 0.05 // Past by > 24h
  if (diffMs < 0) return 0.3          // Just passed (might still be ongoing)

  const diffHours = diffMs / 3600000
  // Smooth decay: score = 1 / (1 + hours/24)
  return 1 / (1 + diffHours / 24)
}

/**
 * Distance score (12%).
 * Smooth decay based on distance.
 */
function scoreDistance(
  eventLat: number | undefined,
  eventLng: number | undefined,
  userLocation: { latitude: number; longitude: number } | null,
): number {
  if (!userLocation || eventLat == null || eventLng == null) return 0.5

  const km = haversineKm(userLocation.latitude, userLocation.longitude, eventLat, eventLng)
  // Smooth decay: score = 1 / (1 + km/3)
  return 1 / (1 + km / 3)
}

/**
 * Diversity bonus (8%).
 * Boost categories the user hasn't interacted with recently to encourage discovery.
 */
function scoreDiversity(
  eventCategory: string,
  recentCategories: Set<string>,
): number {
  if (recentCategories.size === 0) return 0.5
  return recentCategories.has(eventCategory) ? 0.0 : 1.0
}

/**
 * Time-of-day matching (10%).
 * Boosts categories that match typical consumption patterns by hour.
 * Music/clubs higher in evening, family/sport higher during day.
 */
function scoreTimeOfDay(eventCategory: string, eventDate: string): number {
  const eventTime = new Date(eventDate)
  if (isNaN(eventTime.getTime())) return 0.5

  const hour = eventTime.getHours()
  const currentHour = new Date().getHours()

  // If event is today, boost events that align with current time
  const isToday = eventTime.toDateString() === new Date().toDateString()
  if (!isToday) return 0.5 // Neutral for future dates

  // Evening (18-03): music, underground, festival
  if (currentHour >= 18 || currentHour < 3) {
    if (['music', 'underground', 'festival', 'culture', 'theatre'].includes(eventCategory)) return 1.0
    if (['food'].includes(eventCategory)) return 0.8
    return 0.3
  }
  // Afternoon (12-18): sport, exhibition, food, culture
  if (currentHour >= 12) {
    if (['sport', 'exhibition', 'food', 'culture', 'nature'].includes(eventCategory)) return 1.0
    if (['music', 'festival'].includes(eventCategory)) return 0.7
    return 0.5
  }
  // Morning (6-12): sport, education, family, nature
  if (currentHour >= 6) {
    if (['sport', 'education', 'family', 'nature'].includes(eventCategory)) return 1.0
    if (['exhibition', 'food'].includes(eventCategory)) return 0.7
    return 0.3
  }
  return 0.5
}

/**
 * Image bonus (7%).
 * Events with images are more engaging — boost them.
 */
function scoreImageBonus(imageUrl: string | null | undefined): number {
  return imageUrl ? 1.0 : 0.0
}

// ── Haversine Distance ─────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
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
 * Rank events for a user based on seven weighted factors:
 * - Interest profile matching (25%)
 * - Interaction tracking with time decay (20%)
 * - Recency with smooth decay (18%)
 * - Distance with smooth decay (12%)
 * - Time-of-day matching (10%)
 * - Diversity bonus (8%)
 * - Image bonus (7%)
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
    const timeOfDay = scoreTimeOfDay(event.category, event.date)
    const imageBonus = scoreImageBonus(event.imageUrl)

    let score =
      interestMatch * W_INTEREST +
      interaction * W_INTERACTION +
      recency * W_RECENCY +
      distance * W_DISTANCE +
      diversity * W_DIVERSITY +
      timeOfDay * W_TIME_OF_DAY +
      imageBonus * W_IMAGE_BONUS

    // Source quality boost: Kide/Ticketmaster events tend to be higher quality
    if (event.source === 'kide' || event.source === 'ticketmaster') {
      score *= 1.05
    }

    const result: RankedEvent = {
      ...event,
      score,
    }

    if (__DEV__) {
      result.breakdown = { interestMatch, interaction, recency, distance, diversity, timeOfDay, imageBonus }
    }

    return result
  })

  return ranked.sort((a, b) => b.score - a.score)
}
