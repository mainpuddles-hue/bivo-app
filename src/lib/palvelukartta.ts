declare const __DEV__: boolean

import type { LocalPlace } from './types'

const BASE_URL = 'https://api.hel.fi/servicemap/v2'

interface PalvelukarttaUnit {
  id: number
  name: { fi?: string; en?: string; sv?: string }
  street_address: { fi?: string; en?: string; sv?: string }
  description: { fi?: string; en?: string; sv?: string } | null
  www: { fi?: string; en?: string } | null
  phone: string | null
  picture_url: string | null
  location: { type: string; coordinates: [number, number] } | null
  opening_hours: { fi?: string; en?: string } | null
  services: number[]
}

interface PalvelukarttaResponse {
  count: number
  next: string | null
  results: PalvelukarttaUnit[]
}

// ── Name-based heuristic patterns for category inference ──

const NAME_PATTERNS: [RegExp, string][] = [
  // Restaurants & food
  [/ravintola|restaurant|ruokala|dining/i, 'restaurant'],
  [/kahvila|café|cafe|coffee/i, 'cafe'],
  [/baari|bar\b|pub\b/i, 'bar'],
  [/pikaruoka|fast.?food|burger|pizza|kebab|grilli/i, 'fast_food'],
  // Culture
  [/museo|museum|teatteri|theatre|theater|galleria|gallery|kulttuuritalo|taidetalo/i, 'culture'],
  // Libraries
  [/kirjasto|library|biblio/i, 'library'],
  // Sports
  [/liikunta|sport|urheil|uimahalli|jäähalli|kuntosali|gym|stadion|kenttä/i, 'sport'],
  // Health
  [/terveysasema|health|sairaala|hospital|hammaslääkäri|neuvola|klinikka|clinic/i, 'health'],
  // Education & services
  [/koulu|school|päiväkoti|daycare|opisto/i, 'service'],
  // Hotels
  [/hotelli|hotel|hostel|majatalo/i, 'hotel'],
  // Shops
  [/kauppa|shop|store|market|tori\b/i, 'shop'],
]

// Map service IDs to place categories, with name-based fallback
function mapCategory(services: number[], name: string): string {
  const s = new Set(services)

  // Try service ID matching first (these may be approximate)
  // Restaurants & food
  if (s.has(476) || s.has(477) || s.has(478)) return 'restaurant'
  if (s.has(479) || s.has(480)) return 'cafe'
  if (s.has(481)) return 'bar'
  if (s.has(482) || s.has(483)) return 'fast_food'
  // Culture
  if (s.has(337) || s.has(25) || s.has(26)) return 'culture'
  // Libraries
  if (s.has(813) || s.has(814) || s.has(815)) return 'library'
  // Sports
  if (s.has(697) || s.has(698) || s.has(699) || s.has(331)) return 'sport'
  // Health
  if (s.has(265) || s.has(266) || s.has(267)) return 'health'
  // Education
  if (s.has(1) || s.has(2) || s.has(3)) return 'service'

  // Fallback: infer category from unit name using text heuristics
  const lowerName = name.toLowerCase()
  for (const [pattern, category] of NAME_PATTERNS) {
    if (pattern.test(lowerName)) return category
  }

  return 'other'
}

function mapUnit(u: PalvelukarttaUnit): LocalPlace | null {
  if (!u.location?.coordinates) return null
  const [lng, lat] = u.location.coordinates
  if (!lat || !lng) return null

  const name = u.name?.fi || u.name?.en || ''

  // Extract description — prefer Finnish, fall back to English
  const description = u.description?.fi || u.description?.en || null

  // Extract opening hours text
  const openingHours = u.opening_hours?.fi || u.opening_hours?.en || null

  return {
    id: `pk-${u.id}`,
    source: 'palvelukartta',
    source_id: String(u.id),
    name,
    category: mapCategory(u.services, name),
    subcategory: null,
    description,
    address: u.street_address?.fi || null,
    latitude: lat,
    longitude: lng,
    phone: u.phone || null,
    website: u.www?.fi || u.www?.en || null,
    opening_hours: openingHours,
    image_url: u.picture_url || null,
    neighborhood: null,
    tags: [],
    synced_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}

// ── Cache per neighborhood with per-key invalidation ──

const cache = new Map<string, { places: LocalPlace[]; fetchedAt: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

const pendingFetches = new Map<string, Promise<LocalPlace[]>>()

/**
 * Invalidate cache entries matching a specific coordinate prefix.
 * Call with the lat/lng of a neighborhood center to clear only that area.
 */
export function invalidatePlacesCache(lat?: number, lng?: number): void {
  if (lat == null || lng == null) {
    // No coordinates: clear everything
    cache.clear()
    return
  }
  // Build the prefix that matches this neighborhood's cache keys
  const prefix = `${lat.toFixed(3)}-${lng.toFixed(3)}-`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }
}

export async function fetchHelsinkiPlaces(
  lat: number,
  lng: number,
  radiusMeters: number = 1000,
): Promise<LocalPlace[]> {
  const cacheKey = `${lat.toFixed(3)}-${lng.toFixed(3)}-${radiusMeters}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.places
  }

  // Prevent duplicate concurrent fetches
  const pending = pendingFetches.get(cacheKey)
  if (pending) return pending

  const promise = (async () => {
    const allPlaces: LocalPlace[] = []

    try {
      // Fetch 2 pages max (200 places)
      let url: string | null = `${BASE_URL}/unit/?lat=${lat}&lon=${lng}&distance=${radiusMeters}&page_size=100&format=json&include=location`

      for (let page = 0; page < 2 && url; page++) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId))
        if (!res.ok) {
          if (__DEV__) console.log(`[palvelukartta] pagination failed: ${res.status} ${res.statusText}, page ${page}`)
          break
        }
        const json: PalvelukarttaResponse = await res.json()
        for (const unit of (json.results ?? [])) {
          const place = mapUnit(unit)
          if (place && place.name) allPlaces.push(place)
        }
        url = json.next
      }
    } catch (err) {
      if (__DEV__) console.log('[palvelukartta] fetch error:', err)
    }

    cache.set(cacheKey, { places: allPlaces, fetchedAt: Date.now() })
    return allPlaces
  })()

  pendingFetches.set(cacheKey, promise)
  promise.finally(() => pendingFetches.delete(cacheKey))

  return promise
}
