declare const __DEV__: boolean

import type { CityEvent } from './types'

// TODO: Proxy Ticketmaster requests through a Supabase Edge Function
// (supabase/functions/ticketmaster-proxy) to avoid exposing the API key
// in the client bundle. The Edge Function should accept search params,
// add the API key server-side, and return results.
const API_KEY = process.env.EXPO_PUBLIC_TICKETMASTER_API_KEY ?? ''
const BASE_URL = 'https://app.ticketmaster.com/discovery/v2'

interface TMEvent {
  id: string
  name: string
  dates: { start: { localDate?: string; localTime?: string } }
  _embedded?: {
    venues?: {
      name?: string
      address?: { line1?: string }
      location?: { latitude?: string; longitude?: string }
    }[]
  }
  images?: { url: string; width?: number }[]
  url?: string
  priceRanges?: { min?: number; max?: number; currency?: string }[]
  classifications?: { genre?: { name?: string }; segment?: { name?: string } }[]
  info?: string
}

interface TMResponse {
  _embedded?: { events?: TMEvent[] }
  page?: { totalElements?: number; totalPages?: number }
}

function mapCategory(e: TMEvent): string {
  const segment = e.classifications?.[0]?.segment?.name?.toLowerCase() ?? ''
  if (segment.includes('music')) return 'music'
  if (segment.includes('sport')) return 'sport'
  if (segment.includes('art') || segment.includes('theatre')) return 'culture'
  if (segment.includes('family')) return 'family'
  return 'other'
}

function mapEvent(e: TMEvent): CityEvent | null {
  const venue = e._embedded?.venues?.[0]
  const lat = venue?.location?.latitude ? parseFloat(venue.location.latitude) : null
  const lng = venue?.location?.longitude ? parseFloat(venue.location.longitude) : null

  const startDate = e.dates?.start?.localDate
  if (!startDate) return null

  const startTime = e.dates?.start?.localTime
  const isoTime = startTime
    ? `${startDate}T${startTime}`
    : `${startDate}T00:00:00`

  const bestImage = e.images?.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))?.[0]?.url ?? null

  const priceRange = e.priceRanges?.[0]
  const isFree = false
  const priceInfo = priceRange
    ? `${priceRange.min ?? '?'}–${priceRange.max ?? '?'} ${priceRange.currency ?? 'EUR'}`
    : null

  return {
    id: `tm-${e.id}`,
    source: 'ticketmaster' as const,
    source_id: e.id,
    name_fi: e.name,
    name_en: e.name,
    name_sv: null,
    description_fi: e.info?.slice(0, 500) ?? null,
    description_en: e.info?.slice(0, 500) ?? null,
    description_sv: null,
    start_time: isoTime,
    end_time: null,
    location_name: venue?.name ?? null,
    location_address: venue?.address?.line1 ?? null,
    latitude: lat,
    longitude: lng,
    image_url: bestImage,
    info_url: e.url ?? null,
    category: mapCategory(e),
    is_free: isFree,
    price_info: priceInfo,
    organizer: null,
    neighborhood: null,
    tags: e.classifications?.map(c => c.genre?.name ?? '').filter(Boolean).slice(0, 3) ?? [],
    synced_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}

let cache: { events: CityEvent[]; fetchedAt: number } | null = null
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

export async function fetchTicketmasterEvents(): Promise<CityEvent[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.events
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    const allEvents: CityEvent[] = []

    // Fetch up to 3 pages (max 200 per page, usually ~100 total for Helsinki)
    for (let page = 0; page < 3; page++) {
      const url = `${BASE_URL}/events.json?city=Helsinki&countryCode=FI&startDateTime=${today}T00:00:00Z&size=200&page=${page}&sort=date,asc&apikey=${API_KEY}`
      const res = await fetch(url)
      if (!res.ok) {
        if (__DEV__) console.log(`[ticketmaster] pagination failed: ${res.status} ${res.statusText}, page ${page}`)
        break
      }
      const json: TMResponse = await res.json()
      const events = (json._embedded?.events ?? [])
        .map(mapEvent)
        .filter((e): e is CityEvent => e !== null)
      allEvents.push(...events)

      // Stop if no more pages
      const totalPages = json.page?.totalPages ?? 1
      if (page + 1 >= totalPages) break
    }

    cache = { events: allEvents, fetchedAt: Date.now() }
    return allEvents
  } catch (err) {
    if (__DEV__) console.log('[ticketmaster] fetch error:', err)
    return cache?.events ?? []
  }
}
