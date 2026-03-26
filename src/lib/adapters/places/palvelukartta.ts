declare const __DEV__: boolean

import type { PlacesAdapter, PlacesFetchParams, PlaceResult } from '../types'

const BASE_URL = 'https://api.hel.fi/servicemap/v2'

interface PalvelukarttaUnit {
  id: number
  name: { fi?: string; en?: string; sv?: string }
  street_address: { fi?: string; en?: string; sv?: string }
  www: { fi?: string; en?: string } | null
  phone: string | null
  location: { type: string; coordinates: [number, number] } | null
  opening_hours: { fi?: string; en?: string } | null
  services: number[]
}

interface PalvelukarttaResponse {
  count: number
  next: string | null
  results: PalvelukarttaUnit[]
}

// Name-based heuristic patterns for category inference
const NAME_PATTERNS: [RegExp, string][] = [
  [/ravintola|restaurant|ruokala|dining/i, 'restaurant'],
  [/kahvila|café|cafe|coffee/i, 'cafe'],
  [/baari|bar\b|pub\b/i, 'bar'],
  [/pikaruoka|fast.?food|burger|pizza|kebab|grilli/i, 'fast_food'],
  [/museo|museum|teatteri|theatre|theater|galleria|gallery|kulttuuritalo|taidetalo/i, 'culture'],
  [/kirjasto|library|biblio/i, 'library'],
  [/liikunta|sport|urheil|uimahalli|jäähalli|kuntosali|gym|stadion|kenttä/i, 'sport'],
  [/terveysasema|health|sairaala|hospital|hammaslääkäri|neuvola|klinikka|clinic/i, 'health'],
  [/koulu|school|päiväkoti|daycare|opisto/i, 'service'],
  [/hotelli|hotel|hostel|majatalo/i, 'hotel'],
  [/kauppa|shop|store|market|tori\b/i, 'shop'],
]

function mapCategory(services: number[], name: string): string {
  const s = new Set(services)
  if (s.has(476) || s.has(477) || s.has(478)) return 'restaurant'
  if (s.has(479) || s.has(480)) return 'cafe'
  if (s.has(481)) return 'bar'
  if (s.has(482) || s.has(483)) return 'fast_food'
  if (s.has(337) || s.has(25) || s.has(26)) return 'culture'
  if (s.has(813) || s.has(814) || s.has(815)) return 'library'
  if (s.has(697) || s.has(698) || s.has(699) || s.has(331)) return 'sport'
  if (s.has(265) || s.has(266) || s.has(267)) return 'health'
  if (s.has(1) || s.has(2) || s.has(3)) return 'service'

  const lowerName = name.toLowerCase()
  for (const [pattern, category] of NAME_PATTERNS) {
    if (pattern.test(lowerName)) return category
  }
  return 'other'
}

// Cache per location
const cache = new Map<string, { places: PlaceResult[]; fetchedAt: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

/**
 * Helsinki Palvelukartta (Service Map) places adapter.
 *
 * Open API: https://api.hel.fi/servicemap/v2/
 * No API key required. Returns units (places/services) in Helsinki metro area.
 */
const palvelukarttaAdapter: PlacesAdapter = {
  type: 'palvelukartta',
  name: 'Palvelukartta',

  async fetchPlaces(params: PlacesFetchParams): Promise<PlaceResult[]> {
    const { lat, lng, radius = 1000, limit = 200 } = params

    const cacheKey = `pk-${lat.toFixed(3)}-${lng.toFixed(3)}-${radius}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return cached.places
    }

    const allPlaces: PlaceResult[] = []

    try {
      let url: string | null = `${BASE_URL}/unit/?lat=${lat}&lon=${lng}&distance=${radius}&page_size=${Math.min(limit, 100)}&format=json&include=location`

      for (let page = 0; page < 2 && url; page++) {
        const res = await fetch(url)
        if (!res.ok) {
          if (__DEV__) console.log(`[palvelukartta] fetch failed: ${res.status}, page ${page}`)
          break
        }
        const json: PalvelukarttaResponse = await res.json()

        for (const unit of json.results) {
          if (!unit.location?.coordinates) continue
          const [unitLng, unitLat] = unit.location.coordinates
          if (!unitLat || !unitLng) continue

          const name = unit.name?.fi || unit.name?.en || ''
          if (!name) continue

          allPlaces.push({
            id: `pk-${unit.id}`,
            source: 'palvelukartta',
            name,
            category: mapCategory(unit.services, name),
            subcategory: null,
            address: unit.street_address?.fi || null,
            latitude: unitLat,
            longitude: unitLng,
            phone: unit.phone || null,
            website: unit.www?.fi || unit.www?.en || null,
            openingHours: unit.opening_hours?.fi || unit.opening_hours?.en || null,
          })
        }

        url = json.next
        if (allPlaces.length >= limit) break
      }
    } catch (err) {
      if (__DEV__) console.log('[palvelukartta] adapter error:', err)
    }

    cache.set(cacheKey, { places: allPlaces, fetchedAt: Date.now() })
    return allPlaces
  },
}

export default palvelukarttaAdapter
