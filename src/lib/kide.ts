declare const __DEV__: boolean

import type { CityEvent } from './types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''
const PROXY_URL = `${SUPABASE_URL}/functions/v1/kide-proxy`

interface KideProduct {
  id: string
  name: string
  place: string | null
  companyName: string | null
  dateActualFrom: string | null
  dateActualUntil: string | null
  mediaFilename: string | null
  minPrice: number | null
  maxPrice: number | null
  hasFreeInventoryItems: boolean
  salesStarted: boolean
  salesOngoing: boolean
  salesEnded: boolean
  availability: number | null
  productType: number | null
  description: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  categories: string[] | null
}

interface KideResponse {
  model: KideProduct[]
  totalCount?: number
}

const KIDE_IMAGE_CDN = 'https://portalvhdsp62n0t1m56t1.blob.core.windows.net/peninsulamedia'

function mapCategory(product: KideProduct): string {
  const name = product.name?.toLowerCase() ?? ''
  const cats = (product.categories ?? []).map(c => c.toLowerCase())
  const all = [name, ...cats].join(' ')

  if (all.includes('music') || all.includes('musiik') || all.includes('concert') || all.includes('konsertti') || all.includes('dj') || all.includes('club') || all.includes('klubi')) return 'music'
  if (all.includes('sport') || all.includes('urheilu') || all.includes('liikunta')) return 'sport'
  if (all.includes('theatre') || all.includes('teatteri') || all.includes('näytelmä') || all.includes('taide') || all.includes('art')) return 'culture'
  if (all.includes('ruoka') || all.includes('food') || all.includes('ravintola') || all.includes('brunch')) return 'food'
  if (all.includes('festival') || all.includes('festivaali')) return 'festival'
  if (all.includes('stand') || all.includes('comedy') || all.includes('komedia')) return 'culture'
  if (all.includes('party') || all.includes('bileet') || all.includes('jatkot') || all.includes('sitsit')) return 'music'
  return 'other'
}

function mapEvent(p: KideProduct): CityEvent | null {
  if (!p.dateActualFrom) return null

  const imageUrl = p.mediaFilename ? `${KIDE_IMAGE_CDN}/${p.mediaFilename}` : null

  const minEur = p.minPrice != null ? p.minPrice / 100 : null
  const maxEur = p.maxPrice != null ? p.maxPrice / 100 : null
  const isFree = p.hasFreeInventoryItems || (minEur === 0 && maxEur === 0)
  let priceInfo: string | null = null
  if (!isFree && minEur != null) {
    priceInfo = minEur === maxEur || maxEur == null
      ? `${minEur.toFixed(0)} €`
      : `${minEur.toFixed(0)}–${maxEur.toFixed(0)} €`
  }

  return {
    id: `kide-${p.id}`,
    source: 'kide' as const,
    source_id: p.id,
    name_fi: p.name,
    name_en: p.name,
    name_sv: null,
    description_fi: p.description?.slice(0, 500) ?? null,
    description_en: null,
    description_sv: null,
    start_time: p.dateActualFrom,
    end_time: p.dateActualUntil ?? null,
    location_name: p.place ?? null,
    location_address: p.address ?? null,
    latitude: p.latitude ?? null,
    longitude: p.longitude ?? null,
    image_url: imageUrl,
    info_url: `https://kide.app/events/${p.id}`,
    category: mapCategory(p),
    is_free: isFree,
    price_info: priceInfo,
    organizer: p.companyName ?? null,
    neighborhood: null,
    tags: (p.categories ?? []).slice(0, 3),
    synced_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}

let cache: { events: CityEvent[]; fetchedAt: number } | null = null
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

export function invalidateKideCache() {
  cache = null
}

export async function fetchKideEvents(): Promise<CityEvent[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return cache.events
  }

  try {
    const res = await fetch(`${PROXY_URL}?city=Helsinki`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    })
    if (!res.ok) {
      if (__DEV__) console.log(`[kide] fetch failed: ${res.status} ${res.statusText}`)
      return cache?.events ?? []
    }
    const json: KideResponse = await res.json()
    const products = json.model ?? []
    const events = products
      .map(mapEvent)
      .filter((e): e is CityEvent => e !== null)

    cache = { events, fetchedAt: Date.now() }
    if (__DEV__) console.log(`[kide] fetched ${events.length} events`)
    return events
  } catch (err) {
    if (__DEV__) console.log('[kide] fetch error:', err)
    return cache?.events ?? []
  }
}
