// ── Adapter Factory ──
// Returns the correct country-specific adapter based on config type string.
// Uses lazy require() to avoid loading all adapters at startup.

import type { IdentityAdapter, BusinessAdapter, EventsAdapter, PlacesAdapter } from './types'

// Re-export types for convenience
export type { IdentityAdapter, BusinessAdapter, EventsAdapter, PlacesAdapter } from './types'
export type {
  IdentityBranding,
  BusinessIdFormat,
  BusinessValidationResult,
  EventsFetchParams,
  CityEventResult,
  PlacesFetchParams,
  PlaceResult,
} from './types'

// ── Identity Adapters ──

const IDENTITY_ADAPTERS: Record<string, () => IdentityAdapter> = {
  suomifi: () => require('./identity/suomifi').default,
  bankid: () => require('./identity/bankid').default,
  smartid: () => require('./identity/smartid').default,
  eidas: () => require('./identity/eidas').default,
  manual: () => require('./identity/manual').default,
}

export function getIdentityAdapter(type: string): IdentityAdapter {
  const factory = IDENTITY_ADAPTERS[type] ?? IDENTITY_ADAPTERS.manual
  return factory()
}

// ── Business Adapters ──

const BUSINESS_ADAPTERS: Record<string, () => BusinessAdapter> = {
  prh: () => require('./business/prh').default,
  bolagsverket: () => require('./business/bolagsverket').default,
  ebr: () => require('./business/ebr').default,
  brreg: () => require('./business/brreg').default,
  handelsregister: () => require('./business/handelsregister').default,
  manual: () => require('./business/manual').default,
}

export function getBusinessAdapter(type: string): BusinessAdapter {
  const factory = BUSINESS_ADAPTERS[type] ?? BUSINESS_ADAPTERS.manual
  return factory()
}

// ── Events Adapters ──

const EVENTS_ADAPTERS: Record<string, () => EventsAdapter> = {
  linkedevents: () => require('./events/linkedevents').default,
  eventbrite: () => require('./events/eventbrite').default,
  manual: () => require('./events/manual').default,
}

export function getEventsAdapter(type: string): EventsAdapter {
  const factory = EVENTS_ADAPTERS[type] ?? EVENTS_ADAPTERS.manual
  return factory()
}

// ── Places Adapters ──

const PLACES_ADAPTERS: Record<string, () => PlacesAdapter> = {
  palvelukartta: () => require('./places/palvelukartta').default,
  osm: () => require('./places/osm').default,
  manual: () => require('./places/manual').default,
}

export function getPlacesAdapter(type: string): PlacesAdapter {
  const factory = PLACES_ADAPTERS[type] ?? PLACES_ADAPTERS.manual
  return factory()
}
