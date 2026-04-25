declare const __DEV__: boolean

import type { CityEvent } from './types'

const DEFAULT_BASE_URL = 'https://api.hel.fi/linkedevents/v1'
let BASE_URL = DEFAULT_BASE_URL

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

/**
 * Set the LinkedEvents API base URL for the current city.
 * Pass null to reset to Helsinki default.
 */
export function setLinkedEventsBaseUrl(url: string | null) {
  BASE_URL = url || DEFAULT_BASE_URL
  // Clear caches when city changes
  invalidateEventsCache()
}

function buildUrl(page_size: number, baseUrl?: string): string {
  const today = new Date().toISOString().split('T')[0]
  const url = baseUrl || BASE_URL
  return `${url}/event/?start=${today}&sort=start_time&page_size=${page_size}&include=location,keywords&super_event_type=none&language=fi`
}

async function fetchPage(url: string): Promise<{ events: CityEvent[]; next: string | null }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)
  const res = await fetch(url, { signal: controller.signal })
  clearTimeout(timeoutId)
  if (!res.ok) {
    if (__DEV__) console.log(`[linkedevents] fetchPage failed: ${res.status} ${res.statusText}`, url)
    return { events: [], next: null }
  }
  const json: LinkedEventResponse = await res.json()
  const events = json.data
    .filter(e => e.name?.fi || e.name?.en)
    .map(mapEvent)
  return { events, next: json.meta.next }
}

/**
 * Fast first page (100 events in ~500ms), then background-load more pages.
 * Returns first page immediately, updates cache as more pages load.
 * @param apiUrl Optional LinkedEvents API base URL. Defaults to current city's URL.
 */
export async function fetchHelsinkiEvents(apiUrl?: string): Promise<CityEvent[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.events
  }

  // Prevent duplicate concurrent fetches
  if (pendingFetch) return pendingFetch

  pendingFetch = (async () => {
    try {
      // Fast: fetch first page only (100 events, ~500ms)
      const first = await fetchPage(buildUrl(100, apiUrl))
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

let loadingMore = false
async function loadMorePages(startUrl: string, maxPages: number) {
  if (loadingMore) return // Prevent concurrent background page loads
  loadingMore = true
  try {
    let url: string | null = startUrl
    const more: CityEvent[] = []

    for (let i = 0; i < maxPages && url; i++) {
      try {
        const page = await fetchPage(url)
        more.push(...page.events)
        url = page.next
      } catch (err) {
        if (__DEV__) console.log('[linkedevents] loadMorePages error:', err)
        break
      }
    }

    if (more.length > 0 && cache) {
      cache = { events: [...cache.events, ...more], fetchedAt: cache.fetchedAt }
    }
  } finally {
    loadingMore = false
  }
}

// ── Neighborhood-specific event fetch (bbox) ──

const bboxCache = new Map<string, { events: CityEvent[]; fetchedAt: number }>()
const BBOX_CACHE_TTL = 30 * 60 * 1000 // 30 min

export function invalidateEventsCache(): void {
  bboxCache.clear()
  cache = null
}

// ── Paginated nearby events with loadMore support ──

interface NearbyEventsState {
  events: CityEvent[]
  nextUrl: string | null
  totalCount: number
  fetchedAt: number
  loading: boolean
}

const nearbyState = new Map<string, NearbyEventsState>()

function buildBbox(lat: number, lng: number, radiusKm: number): string {
  const dLat = radiusKm / 111
  const dLng = radiusKm / (111 * Math.cos(lat * Math.PI / 180))
  return `${(lng - dLng).toFixed(4)},${(lat - dLat).toFixed(4)},${(lng + dLng).toFixed(4)},${(lat + dLat).toFixed(4)}`
}

function nearbyKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)}-${lng.toFixed(3)}`
}

/**
 * Fetch first page of nearby events. Fast (~500ms).
 * Call loadMoreNearbyEvents() to get subsequent pages.
 */
export async function fetchNearbyEvents(
  lat: number,
  lng: number,
  radiusKm: number = 5,
): Promise<CityEvent[]> {
  const key = nearbyKey(lat, lng)
  const existing = nearbyState.get(key)
  if (existing && Date.now() - existing.fetchedAt < BBOX_CACHE_TTL) {
    return existing.events
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    const bbox = buildBbox(lat, lng, radiusKm)
    const baseUrl = BASE_URL
    const url = `${baseUrl}/event/?start=${today}&sort=start_time&page_size=100&include=location&language=fi&bbox=${bbox}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!res.ok) return []
    const json: LinkedEventResponse = await res.json()
    const events = json.data
      .filter(e => (e.name?.fi || e.name?.en) && e.location?.name?.fi !== 'Internet')
      .map(mapEvent)

    nearbyState.set(key, {
      events,
      nextUrl: json.meta.next,
      totalCount: json.meta.count,
      fetchedAt: Date.now(),
      loading: false,
    })

    return events
  } catch (err) {
    if (__DEV__) console.log('[linkedevents] nearby fetch error:', err)
    return []
  }
}

/**
 * Load next page of events for a location. Returns ALL events so far (including previous pages).
 * Returns null if no more pages or already loading.
 */
export async function loadMoreNearbyEvents(lat: number, lng: number): Promise<CityEvent[] | null> {
  const key = nearbyKey(lat, lng)
  const state = nearbyState.get(key)
  if (!state || !state.nextUrl || state.loading) return null

  state.loading = true
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(state.nextUrl, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!res.ok) { state.loading = false; return null }
    const json: LinkedEventResponse = await res.json()
    const newEvents = json.data
      .filter(e => (e.name?.fi || e.name?.en) && e.location?.name?.fi !== 'Internet')
      .map(mapEvent)

    state.events = [...state.events, ...newEvents]
    state.nextUrl = json.meta.next
    state.loading = false
    return state.events
  } catch (err) {
    if (__DEV__) console.log('[linkedevents] loadMoreNearbyEvents error:', err)
    state.loading = false
    return null
  }
}

/** Check if more pages are available */
export function hasMoreNearbyEvents(lat: number, lng: number): boolean {
  const state = nearbyState.get(nearbyKey(lat, lng))
  return !!state?.nextUrl
}

/** Get total count from API */
export function getNearbyEventsTotal(lat: number, lng: number): number {
  const state = nearbyState.get(nearbyKey(lat, lng))
  return state?.totalCount ?? 0
}

/**
 * Pre-warm the cache. Call this early (e.g., from feed screen) so
 * the map/events screen has data ready instantly.
 * @param apiUrl Optional LinkedEvents API base URL for the current city.
 */
export function prefetchHelsinkiEvents(apiUrl?: string) {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) return
  fetchHelsinkiEvents(apiUrl).catch(() => {})
}
