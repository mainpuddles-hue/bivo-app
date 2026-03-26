declare const __DEV__: boolean

import type { EventsAdapter, EventsFetchParams, CityEventResult } from '../types'

const DEFAULT_BASE_URL = 'https://api.hel.fi/linkedevents/v1'

interface LinkedEvent {
  id: string
  name: { fi?: string; en?: string; sv?: string }
  description: { fi?: string; en?: string; sv?: string }
  short_description: { fi?: string; en?: string; sv?: string }
  start_time: string
  end_time: string | null
  location: {
    name?: { fi?: string; en?: string; sv?: string }
    street_address?: { fi?: string }
    position?: { coordinates?: [number, number] } | null
  } | null
  images: { url: string }[]
  info_url: { fi?: string; en?: string } | null
  offers: { is_free: boolean; price?: { fi?: string } }[]
  keywords: { name?: { fi?: string; en?: string }; id?: string }[]
  provider?: { fi?: string; en?: string }
}

interface LinkedEventResponse {
  meta: { count: number; next: string | null }
  data: LinkedEvent[]
}

function mapCategory(keywords: LinkedEvent['keywords']): string {
  const ids = keywords.map(k => k.id ?? '').join(',')
  if (ids.includes('yso:p1235') || ids.includes('yso:p11185')) return 'music'
  if (ids.includes('yso:p2739') || ids.includes('yso:p6062')) return 'sport'
  if (ids.includes('yso:p2625') || ids.includes('yso:p1808')) return 'culture'
  if (ids.includes('yso:p5121') || ids.includes('yso:p20421')) return 'food'
  if (ids.includes('yso:p4354') || ids.includes('yso:p1278')) return 'family'
  if (ids.includes('yso:p2149')) return 'nature'
  if (ids.includes('yso:p360')) return 'theatre'
  if (ids.includes('yso:p19327')) return 'exhibition'
  if (ids.includes('yso:p1304') || ids.includes('yso:p13389')) return 'education'
  if (ids.includes('yso:p3670') || ids.includes('yso:p1537')) return 'festival'
  return 'other'
}

function getLocalizedText(
  obj: { fi?: string; en?: string; sv?: string } | null | undefined,
  locale: string,
): string | null {
  if (!obj) return null
  if (locale === 'fi') return obj.fi || obj.en || null
  if (locale === 'sv') return obj.sv || obj.en || obj.fi || null
  return obj.en || obj.fi || null
}

function mapEvent(e: LinkedEvent, locale: string): CityEventResult {
  const coords = e.location?.position?.coordinates
  return {
    id: `le-${e.id}`,
    source: 'linkedevents',
    name: getLocalizedText(e.name, locale) ?? '',
    description: getLocalizedText(e.short_description, locale) ??
      (getLocalizedText(e.description, locale)?.slice(0, 500) ?? null),
    startTime: e.start_time,
    endTime: e.end_time ?? null,
    locationName: getLocalizedText(e.location?.name, locale),
    latitude: coords ? coords[1] : null,
    longitude: coords ? coords[0] : null,
    imageUrl: e.images?.[0]?.url ?? null,
    infoUrl: e.info_url?.fi || e.info_url?.en || null,
    category: mapCategory(e.keywords),
    isFree: e.offers?.some(o => o.is_free) ?? false,
    organizer: getLocalizedText(e.provider, locale),
  }
}

// Cache per base URL
const cache = new Map<string, { events: CityEventResult[]; fetchedAt: number }>()
const CACHE_TTL = 30 * 60 * 1000 // 30 min

/**
 * LinkedEvents API adapter (Finland — Helsinki, Espoo, Tampere, etc.).
 *
 * Cities using LinkedEvents:
 * - Helsinki: https://api.hel.fi/linkedevents/v1
 * - Espoo: https://api.hel.fi/linkedevents/v1 (same instance, different locations)
 * - Tampere: https://linkedevents.tampere.fi/v1
 * - Turku: https://linkedevents.turku.fi/v1
 * - Oulu: https://linkedevents.oulu.fi/v1
 *
 * Configurable base URL per city via city_configs.linkedevents_url
 */
const linkedeventsAdapter: EventsAdapter = {
  type: 'linkedevents',
  name: 'LinkedEvents',

  async fetchEvents(params: EventsFetchParams): Promise<CityEventResult[]> {
    const { lat, lng, radius = 10, limit = 100, locale = 'fi' } = params

    // Build bbox from center + radius
    const dLat = radius / 111
    const dLng = radius / (111 * Math.cos(lat * Math.PI / 180))
    const bbox = `${(lng - dLng).toFixed(4)},${(lat - dLat).toFixed(4)},${(lng + dLng).toFixed(4)},${(lat + dLat).toFixed(4)}`

    const baseUrl = DEFAULT_BASE_URL
    const cacheKey = `${baseUrl}-${bbox}-${limit}`

    // Check cache
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return cached.events
    }

    const today = new Date().toISOString().split('T')[0]
    const url = `${baseUrl}/event/?start=${today}&sort=start_time&page_size=${limit}&include=location,keywords&super_event_type=none&language=${locale}&bbox=${bbox}`

    try {
      const res = await fetch(url)
      if (!res.ok) {
        if (__DEV__) console.log(`[linkedevents] fetch failed: ${res.status}`)
        return []
      }

      const json: LinkedEventResponse = await res.json()
      const events = json.data
        .filter(e => e.name?.fi || e.name?.en)
        .map(e => mapEvent(e, locale))

      cache.set(cacheKey, { events, fetchedAt: Date.now() })
      return events
    } catch (err) {
      if (__DEV__) console.log('[linkedevents] adapter error:', err)
      return []
    }
  },
}

export default linkedeventsAdapter
