declare const __DEV__: boolean

import type { PlacesAdapter, PlacesFetchParams, PlaceResult } from '../types'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

// Map OSM amenity/shop tags to TackBird place categories
const OSM_CATEGORY_MAP: Record<string, string> = {
  // Food & drink
  restaurant: 'restaurant',
  cafe: 'cafe',
  bar: 'bar',
  pub: 'bar',
  fast_food: 'fast_food',
  food_court: 'restaurant',
  ice_cream: 'cafe',
  biergarten: 'bar',

  // Culture
  museum: 'culture',
  theatre: 'culture',
  cinema: 'culture',
  art_gallery: 'culture',
  arts_centre: 'culture',
  community_centre: 'culture',

  // Libraries
  library: 'library',

  // Sports
  gym: 'sport',
  sports_centre: 'sport',
  swimming_pool: 'sport',
  pitch: 'sport',
  stadium: 'sport',
  fitness_centre: 'sport',

  // Health
  hospital: 'health',
  clinic: 'health',
  doctors: 'health',
  dentist: 'health',
  pharmacy: 'health',

  // Education
  school: 'service',
  university: 'service',
  kindergarten: 'service',
  college: 'service',

  // Services
  bank: 'service',
  post_office: 'service',
  police: 'service',
  townhall: 'service',

  // Hotels
  hotel: 'hotel',
  hostel: 'hotel',
  guest_house: 'hotel',

  // Shops
  supermarket: 'shop',
  convenience: 'shop',
  bakery: 'shop',
  butcher: 'shop',
  marketplace: 'shop',
  clothes: 'shop',
  electronics: 'shop',
  hairdresser: 'shop',
  laundry: 'shop',
}

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags: Record<string, string>
}

interface OverpassResponse {
  elements: OverpassElement[]
}

function resolveCategory(tags: Record<string, string>): string {
  // Check amenity first, then shop, then tourism, then leisure
  const amenity = tags.amenity
  if (amenity && OSM_CATEGORY_MAP[amenity]) return OSM_CATEGORY_MAP[amenity]

  const shop = tags.shop
  if (shop) return 'shop'

  const tourism = tags.tourism
  if (tourism === 'hotel' || tourism === 'hostel' || tourism === 'guest_house') return 'hotel'
  if (tourism === 'museum') return 'culture'

  const leisure = tags.leisure
  if (leisure === 'fitness_centre' || leisure === 'sports_centre' || leisure === 'swimming_pool') return 'sport'
  if (leisure === 'park' || leisure === 'garden') return 'nature'

  return 'other'
}

// Cache per location
const cache = new Map<string, { places: PlaceResult[]; fetchedAt: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

/**
 * OpenStreetMap Overpass API places adapter (international).
 *
 * Free, no API key required. Rate-limited — use responsibly.
 * API: https://overpass-api.de/api/interpreter
 *
 * Queries nearby amenities, shops, tourism, and leisure nodes within radius.
 */
const osmAdapter: PlacesAdapter = {
  type: 'osm',
  name: 'OpenStreetMap',

  async fetchPlaces(params: PlacesFetchParams): Promise<PlaceResult[]> {
    const { lat, lng, radius = 1000, category, limit = 200 } = params

    const cacheKey = `osm-${lat.toFixed(3)}-${lng.toFixed(3)}-${radius}-${category ?? 'all'}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return cached.places
    }

    // Build Overpass query
    // Query for amenity, shop, tourism, and leisure nodes
    let amenityFilter = ''
    if (category) {
      // Find OSM tags that map to this category
      const osmTags = Object.entries(OSM_CATEGORY_MAP)
        .filter(([_, cat]) => cat === category)
        .map(([tag]) => tag)

      if (osmTags.length > 0) {
        const tagRegex = osmTags.join('|')
        amenityFilter = `["amenity"~"${tagRegex}"]`
      }
    }

    const query = `
      [out:json][timeout:10];
      (
        node(around:${radius},${lat},${lng})${amenityFilter || '[amenity]'};
        ${!amenityFilter ? `node(around:${radius},${lat},${lng})[shop];` : ''}
        ${!amenityFilter ? `node(around:${radius},${lat},${lng})[tourism~"hotel|hostel|museum"];` : ''}
        ${!amenityFilter ? `node(around:${radius},${lat},${lng})[leisure~"fitness_centre|sports_centre|swimming_pool"];` : ''}
      );
      out body ${limit};
    `.trim()

    try {
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      })

      if (!res.ok) {
        if (__DEV__) console.log(`[osm] Overpass returned ${res.status}`)
        return []
      }

      const data: OverpassResponse = await res.json()
      const places: PlaceResult[] = []

      for (const el of data.elements) {
        const elLat = el.lat ?? el.center?.lat
        const elLng = el.lon ?? el.center?.lon
        if (!elLat || !elLng) continue

        const tags = el.tags
        const name = tags.name || tags['name:en'] || tags['name:fi'] || ''
        if (!name) continue

        const placeCategory = resolveCategory(tags)

        places.push({
          id: `osm-${el.type[0]}${el.id}`,
          source: 'osm',
          name,
          category: placeCategory,
          subcategory: tags.amenity || tags.shop || tags.tourism || tags.leisure || null,
          address: [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ') || null,
          latitude: elLat,
          longitude: elLng,
          phone: tags.phone || tags['contact:phone'] || null,
          website: tags.website || tags['contact:website'] || null,
          openingHours: tags.opening_hours || null,
        })
      }

      cache.set(cacheKey, { places, fetchedAt: Date.now() })
      return places
    } catch (err) {
      if (__DEV__) console.log('[osm] Overpass query error:', err)
      return []
    }
  },
}

export default osmAdapter
