declare const __DEV__: boolean

import type { EventsAdapter, EventsFetchParams, CityEventResult } from '../types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

/**
 * Eventbrite API adapter (international).
 *
 * Eventbrite API v3: https://www.eventbriteapi.com/v3/
 * Requires OAuth token or private API key stored in Edge Function env.
 *
 * The client calls our Edge Function proxy which adds the API key.
 * This avoids exposing the Eventbrite API key in the mobile app.
 *
 * Setup: Set EVENTBRITE_API_KEY in Supabase Edge Function secrets.
 */

interface EventbriteEvent {
  id: string
  name: { text: string }
  description: { text: string } | null
  start: { utc: string; local: string }
  end: { utc: string; local: string } | null
  venue?: {
    name: string
    address?: { localized_address_display: string }
    latitude?: string
    longitude?: string
  }
  logo?: { url: string }
  url: string
  is_free: boolean
  organizer?: { name: string }
  category_id?: string
}

function mapCategory(categoryId?: string): string {
  // Eventbrite category IDs: https://www.eventbrite.com/platform/api#/reference/categories
  const map: Record<string, string> = {
    '103': 'music',
    '101': 'business',
    '110': 'food',
    '105': 'culture',
    '108': 'sport',
    '109': 'travel',
    '104': 'film',
    '107': 'health',
    '102': 'science',
    '111': 'charity',
    '106': 'fashion',
    '112': 'government',
    '113': 'family',
    '115': 'education',
    '199': 'other',
  }
  return map[categoryId ?? ''] ?? 'other'
}

const eventbriteAdapter: EventsAdapter = {
  type: 'eventbrite',
  name: 'Eventbrite',

  async fetchEvents(params: EventsFetchParams): Promise<CityEventResult[]> {
    const { lat, lng, radius = 10, limit = 50 } = params

    try {
      // Call Edge Function proxy that adds the API key
      const res = await fetch(`${FUNCTIONS_URL}/eventbrite-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lng,
          radius: `${radius}km`,
          limit,
        }),
      })

      if (!res.ok) {
        if (__DEV__) console.log(`[eventbrite] proxy returned ${res.status}`)
        return []
      }

      const data = await res.json()
      const events: EventbriteEvent[] = data.events ?? []

      return events.map((e): CityEventResult => ({
        id: `eb-${e.id}`,
        source: 'eventbrite',
        name: e.name?.text ?? '',
        description: e.description?.text?.slice(0, 500) ?? null,
        startTime: e.start.utc,
        endTime: e.end?.utc ?? null,
        locationName: e.venue?.name ?? null,
        latitude: e.venue?.latitude ? parseFloat(e.venue.latitude) : null,
        longitude: e.venue?.longitude ? parseFloat(e.venue.longitude) : null,
        imageUrl: e.logo?.url ?? null,
        infoUrl: e.url ?? null,
        category: mapCategory(e.category_id),
        isFree: e.is_free,
        organizer: e.organizer?.name ?? null,
      }))
    } catch (err) {
      if (__DEV__) console.log('[eventbrite] adapter error:', err)
      // TODO: Set up EVENTBRITE_API_KEY in Edge Function env
      return []
    }
  },
}

export default eventbriteAdapter
