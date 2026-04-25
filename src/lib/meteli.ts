declare const __DEV__: boolean

import type { CityEvent } from './types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''
const PROXY_URL = `${SUPABASE_URL}/functions/v1/meteli-proxy`

interface MetelihEvent {
  id: string
  title: string
  date: string | null
  time: string | null
  venue: string | null
  city: string | null
  price: string | null
  imageUrl: string | null
  detailUrl: string | null
  ticketUrl: string | null
}

interface MetelihResponse {
  events: MetelihEvent[]
  count: number
  city: string
  scrapedAt: string
}

/** Parse Finnish date "24.04" or "24.04.2026" into ISO string */
function parseFinnishDate(dateStr: string, timeStr: string | null): string | null {
  const parts = dateStr.split('.')
  if (parts.length < 2) return null
  const day = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1
  const year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear()
  if (isNaN(day) || isNaN(month)) return null

  const d = new Date(year, month, day)
  // If date is in the past and no year was specified, assume next year
  if (!parts[2] && d.getTime() < Date.now() - 86400000) {
    d.setFullYear(d.getFullYear() + 1)
  }

  if (timeStr) {
    const [h, m] = timeStr.split(':').map(Number)
    if (!isNaN(h) && !isNaN(m)) d.setHours(h, m, 0, 0)
  }

  return d.toISOString()
}

function mapEvent(e: MetelihEvent): CityEvent | null {
  const startTime = e.date ? parseFinnishDate(e.date, e.time) : null
  if (!startTime) return null

  // Parse price
  let isFree = false
  let priceInfo: string | null = null
  if (e.price) {
    const numMatch = e.price.match(/(\d+[,.]?\d*)/)
    if (numMatch) {
      const amount = parseFloat(numMatch[1].replace(',', '.'))
      isFree = amount === 0
      priceInfo = e.price
    }
  }

  return {
    id: e.id,
    source: 'meteli' as any, // extended source
    source_id: e.id.replace('meteli-', ''),
    name_fi: e.title,
    name_en: e.title,
    name_sv: null,
    description_fi: null,
    description_en: null,
    description_sv: null,
    start_time: startTime,
    end_time: null,
    location_name: e.venue,
    location_address: null,
    latitude: null,
    longitude: null,
    image_url: e.imageUrl,
    info_url: e.detailUrl ?? e.ticketUrl,
    category: 'music', // Meteli.net is primarily a music site
    is_free: isFree,
    price_info: priceInfo,
    organizer: null,
    neighborhood: null,
    tags: ['meteli.net'],
    synced_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}

let cache: { events: CityEvent[]; fetchedAt: number } | null = null
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

export function invalidateMetelihCache() {
  cache = null
}

export async function fetchMetelihEvents(): Promise<CityEvent[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.events
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(`${PROXY_URL}?city=helsinki`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!res.ok) {
      if (__DEV__) console.log(`[meteli] fetch failed: ${res.status}`)
      return cache?.events ?? []
    }
    const json: MetelihResponse = await res.json()
    const events = json.events
      .map(mapEvent)
      .filter((e): e is CityEvent => e !== null)

    cache = { events, fetchedAt: Date.now() }
    if (__DEV__) console.log(`[meteli] fetched ${events.length} events from ${json.count} scraped`)
    return events
  } catch (err) {
    if (__DEV__) console.log('[meteli] fetch error:', err)
    return cache?.events ?? []
  }
}
