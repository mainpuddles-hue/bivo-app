import { useMemo } from 'react'
import {
  getIdentityAdapter,
  getBusinessAdapter,
  getEventsAdapter,
  getPlacesAdapter,
} from '@/lib/adapters'
import type {
  IdentityAdapter,
  BusinessAdapter,
  EventsAdapter,
  PlacesAdapter,
} from '@/lib/adapters'

interface CountryAdapterConfig {
  identity_verification: string
  business_validation: string
  events_api: string
  places_api: string
}

interface CountryAdapters {
  identity: IdentityAdapter
  business: BusinessAdapter
  events: EventsAdapter
  places: PlacesAdapter
}

/**
 * Hook that resolves the correct country-specific adapters
 * based on the user's country configuration.
 *
 * @param countryConfig - The country_configs row for the user's country.
 *   Pass null to fall back to manual adapters for all services.
 *
 * @example
 * ```tsx
 * const { identity, business, events, places } = useCountryAdapters(countryConfig)
 *
 * // Identity verification branding
 * const branding = identity.getBranding()
 *
 * // Business ID format hint
 * const format = business.getIdFormat()
 *
 * // Fetch events
 * const events = await events.fetchEvents({ cityId, lat, lng })
 * ```
 */
export function useCountryAdapters(countryConfig: CountryAdapterConfig | null): CountryAdapters {
  const identityType = countryConfig?.identity_verification ?? 'manual'
  const businessType = countryConfig?.business_validation ?? 'manual'
  const eventsType = countryConfig?.events_api ?? 'manual'
  const placesType = countryConfig?.places_api ?? 'manual'

  const identity = useMemo(
    () => getIdentityAdapter(identityType),
    [identityType],
  )

  const business = useMemo(
    () => getBusinessAdapter(businessType),
    [businessType],
  )

  const events = useMemo(
    () => getEventsAdapter(eventsType),
    [eventsType],
  )

  const places = useMemo(
    () => getPlacesAdapter(placesType),
    [placesType],
  )

  return { identity, business, events, places }
}
