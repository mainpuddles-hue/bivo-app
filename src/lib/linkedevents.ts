import type { CityEvent } from './types'

const BASE_URL = 'https://api.hel.fi/linkedevents/v1'

interface LinkedEventResponse {
  meta: { count: number; next: string | null }
  data: LinkedEvent[]
}

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
    id?: string
  } | null
  images: { url: string }[]
  info_url: { fi?: string; en?: string } | null
  offers: { is_free: boolean; price?: { fi?: string } }[]
  keywords: { name?: { fi?: string }; id?: string }[]
  provider?: { fi?: string }
  publisher?: string
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

function mapEvent(e: LinkedEvent): CityEvent {
  const coords = e.location?.position?.coordinates
  return {
    id: `le-${e.id}`,
    source: 'linkedevents',
    source_id: e.id,
    name_fi: e.name?.fi || e.name?.en || '',
    name_en: e.name?.en || null,
    name_sv: e.name?.sv || null,
    description_fi: e.short_description?.fi || e.description?.fi?.slice(0, 500) || null,
    description_en: e.short_description?.en || e.description?.en?.slice(0, 500) || null,
    description_sv: e.short_description?.sv || e.description?.sv?.slice(0, 500) || null,
    start_time: e.start_time,
    end_time: e.end_time || null,
    location_name: e.location?.name?.fi || null,
    location_address: e.location?.street_address?.fi || null,
    latitude: coords ? coords[1] : null,
    longitude: coords ? coords[0] : null,
    image_url: e.images?.[0]?.url || null,
    info_url: e.info_url?.fi || e.info_url?.en || null,
    category: mapCategory(e.keywords),
    is_free: e.offers?.some(o => o.is_free) ?? false,
    price_info: e.offers?.find(o => o.price?.fi)?.price?.fi || null,
    organizer: e.provider?.fi || null,
    neighborhood: null,
    tags: e.keywords?.slice(0, 5).map(k => k.name?.fi ?? '').filter(Boolean) || [],
    synced_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}

// ── Cache ──
let cache: { events: CityEvent[]; fetchedAt: number } | null = null
const CACHE_TTL = 30 * 60 * 1000 // 30 min

// Background fetch promise to prevent duplicate requests
let pendingFetch: Promise<CityEvent[]> | null = null

function buildUrl(page_size: number): string {
  const today = new Date().toISOString().split('T')[0]
  return `${BASE_URL}/event/?start=${today}&sort=start_time&page_size=${page_size}&include=location,keywords&super_event_type=none&language=fi`
}

async function fetchPage(url: string): Promise<{ events: CityEvent[]; next: string | null }> {
  const res = await fetch(url)
  if (!res.ok) return { events: [], next: null }
  const json: LinkedEventResponse = await res.json()
  const events = json.data
    .filter(e => e.name?.fi || e.name?.en)
    .map(mapEvent)
  return { events, next: json.meta.next }
}

/**
 * Fast first page (100 events in ~500ms), then background-load more pages.
 * Returns first page immediately, updates cache as more pages load.
 */
export async function fetchHelsinkiEvents(): Promise<CityEvent[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.events
  }

  // Prevent duplicate concurrent fetches
  if (pendingFetch) return pendingFetch

  pendingFetch = (async () => {
    try {
      // Fast: fetch first page only (100 events, ~500ms)
      const first = await fetchPage(buildUrl(100))
      cache = { events: first.events, fetchedAt: Date.now() }

      // Background: load 4 more pages without blocking
      if (first.next) {
        loadMorePages(first.next, 4).catch(() => {})
      }

      return first.events
    } finally {
      pendingFetch = null
    }
  })()

  return pendingFetch
}

async function loadMorePages(startUrl: string, maxPages: number) {
  let url: string | null = startUrl
  const more: CityEvent[] = []

  for (let i = 0; i < maxPages && url; i++) {
    try {
      const page = await fetchPage(url)
      more.push(...page.events)
      url = page.next
    } catch {
      break
    }
  }

  if (more.length > 0 && cache) {
    cache = { events: [...cache.events, ...more], fetchedAt: cache.fetchedAt }
  }
}

/**
 * Pre-warm the cache. Call this early (e.g., from feed screen) so
 * the map/events screen has data ready instantly.
 */
export function prefetchHelsinkiEvents() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) return
  fetchHelsinkiEvents().catch(() => {})
}
