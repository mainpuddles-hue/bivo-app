import { FEATURES } from '@/lib/featureFlags'

export const LAYER_COLORS = {
  post: '#1A1D1F',
  event: '#8E44AD',
  place: '#78716C',
} as const

// Place labels use i18n keys — resolve in consuming component via t(`map.place.${key}`)
export const PLACE_TYPES = [
  'restaurant', 'cafe', 'bar', 'shop', 'library', 'health',
  'sport', 'culture', 'hotel', 'attraction', 'service',
  'fast_food', 'pub', 'other',
] as const

export const POST_SUBCATS = [
  { key: null, labelKey: 'map.allTypes', color: LAYER_COLORS.post },
  { key: 'tarvitsen', labelKey: 'categories.tarvitsen', color: '#C75B3A' },
  { key: 'tarjoan', labelKey: 'categories.tarjoan', color: '#7C5CBF' },
  { key: 'ilmaista', labelKey: 'categories.ilmaista', color: '#3B7DD8' },
  { key: 'nappaa', labelKey: 'categories.nappaa', color: '#D48B30' },
  ...(FEATURES.LENDING ? [{ key: 'lainaa' as const, labelKey: 'categories.lainaa', color: '#B07A20' }] : []),
  { key: 'tapahtuma', labelKey: 'categories.tapahtuma', color: '#2B8A62' },
]

export const EVENT_SUBCATS = [
  { key: null, labelKey: 'map.allCategories' },
  { key: 'culture', labelKey: 'map.eventCat.culture' },
  { key: 'music', labelKey: 'map.eventCat.music' },
  { key: 'sport', labelKey: 'map.eventCat.sport' },
  { key: 'family', labelKey: 'map.eventCat.family' },
  { key: 'theatre', labelKey: 'map.eventCat.theatre' },
  { key: 'exhibition', labelKey: 'map.eventCat.exhibition' },
  { key: 'food', labelKey: 'map.eventCat.food' },
  { key: 'other', labelKey: 'map.eventCat.other' },
]

export const PLACE_SUBCATS = [
  { key: null, labelKey: 'map.allPlaces' },
  { key: 'restaurant', labelKey: 'map.place.restaurant' },
  { key: 'cafe', labelKey: 'map.place.cafe' },
  { key: 'bar', labelKey: 'map.place.bar' },
  { key: 'shop', labelKey: 'map.place.shop' },
  { key: 'culture', labelKey: 'map.place.culture' },
  { key: 'sport', labelKey: 'map.place.sport' },
  { key: 'library', labelKey: 'map.place.library' },
  { key: 'health', labelKey: 'map.place.health' },
]

export const TIME_FILTERS = [
  { key: 'all' as const, labelKey: 'map.timeAll' },
  { key: 'today' as const, labelKey: 'map.timeToday' },
  { key: 'tomorrow' as const, labelKey: 'map.timeTomorrow' },
  { key: 'week' as const, labelKey: 'map.timeThisWeek' },
]

export const PLACES_INITIAL_LIMIT = 20

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}
