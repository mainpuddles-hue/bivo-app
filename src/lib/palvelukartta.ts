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

// Map service IDs to place categories
function mapCategory(services: number[]): string {
  const s = new Set(services)
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
  return 'other'
}

function mapUnit(u: PalvelukarttaUnit): LocalPlace | null {
  if (!u.location?.coordinates) return null
  const [lng, lat] = u.location.coordinates
  if (!lat || !lng) return null

  return {
    id: `pk-${u.id}`,
    name: u.name?.fi || u.name?.en || '',
    category: mapCategory(u.services),
    subcategory: null,
    address: u.street_address?.fi || null,
    latitude: lat,
    longitude: lng,
    phone: u.phone || null,
    website: u.www?.fi || u.www?.en || null,
    opening_hours: null,
    image_url: u.picture_url || null,
    neighborhood: null,
    tags: [],
    created_at: new Date().toISOString(),
  } as unknown as LocalPlace
}

// Cache per neighborhood
const cache = new Map<string, { places: LocalPlace[]; fetchedAt: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

let pendingFetches = new Map<string, Promise<LocalPlace[]>>()

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
        const res = await fetch(url)
        if (!res.ok) break
        const json: PalvelukarttaResponse = await res.json()
        for (const unit of json.results) {
          const place = mapUnit(unit)
          if (place && place.name) allPlaces.push(place)
        }
        url = json.next
      }
    } catch (err) {
      console.log('[palvelukartta] fetch error:', err)
    }

    cache.set(cacheKey, { places: allPlaces, fetchedAt: Date.now() })
    return allPlaces
  })()

  pendingFetches.set(cacheKey, promise)
  promise.finally(() => pendingFetches.delete(cacheKey))

  return promise
}
