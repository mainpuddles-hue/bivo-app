// TODO: i18n — All label strings in this file (PLACE_LABEL, POST_SUBCATS,
// EVENT_SUBCATS, PLACE_SUBCATS, TIME_FILTERS) are hardcoded in Finnish.
// They should be internationalized in a future pass. Since this is a plain
// constants file (not a React component), it cannot use the useI18n() hook.
// Approach: add a `labelKey` field mapping to i18n translation keys, and
// resolve translations in the consuming components.

export const LAYER_COLORS = {
  post: '#2D6B5E',
  event: '#8E44AD',
  place: '#78716C',
} as const

export const PLACE_LABEL: Record<string, string> = {
  restaurant: 'Ravintola', cafe: 'Kahvila', bar: 'Baari', shop: 'Kauppa',
  library: 'Kirjasto', health: 'Terveys', sport: 'Urheilu', culture: 'Kulttuuri',
  hotel: 'Hotelli', attraction: 'Nähtävyys', service: 'Palvelu',
  fast_food: 'Pikaruoka', pub: 'Pubi', other: 'Muu',
}

import { FEATURES } from '@/lib/featureFlags'

export const POST_SUBCATS = [
  { key: null, label: 'Kaikki tyypit', color: LAYER_COLORS.post },
  { key: 'tarvitsen', label: 'Tarvitsen', color: '#C75B3A' },
  { key: 'tarjoan', label: 'Tarjoan', color: '#7C5CBF' },
  { key: 'ilmaista', label: 'Ilmaista', color: '#3B7DD8' },
  { key: 'nappaa', label: 'Nappaa', color: '#E8A050' },
  ...(FEATURES.LENDING ? [{ key: 'lainaa' as const, label: 'Lainaa', color: '#C98B2E' }] : []),
  { key: 'tapahtuma', label: 'Tapahtuma', color: '#2B8A62' },
]

export const EVENT_SUBCATS = [
  { key: null, label: 'Kaikki kategoriat' },
  { key: 'culture', label: 'Kulttuuri' },
  { key: 'music', label: 'Musiikki' },
  { key: 'sport', label: 'Urheilu' },
  { key: 'family', label: 'Perhe' },
  { key: 'theatre', label: 'Teatteri' },
  { key: 'exhibition', label: 'Näyttely' },
  { key: 'food', label: 'Ruoka' },
  { key: 'other', label: 'Muu' },
]

export const PLACE_SUBCATS = [
  { key: null, label: 'Kaikki paikat' },
  { key: 'restaurant', label: 'Ravintolat' },
  { key: 'cafe', label: 'Kahvilat' },
  { key: 'bar', label: 'Baarit' },
  { key: 'shop', label: 'Kaupat' },
  { key: 'culture', label: 'Kulttuuri' },
  { key: 'sport', label: 'Urheilu' },
  { key: 'library', label: 'Kirjastot' },
  { key: 'health', label: 'Terveys' },
]

export const TIME_FILTERS = [
  { key: 'all' as const, label: 'Kaikki' },
  { key: 'today' as const, label: 'Tänään' },
  { key: 'tomorrow' as const, label: 'Huomenna' },
  { key: 'week' as const, label: 'Tällä vkolla' },
]

export const PLACES_INITIAL_LIMIT = 8

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}
