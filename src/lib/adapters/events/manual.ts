import type { EventsAdapter, EventsFetchParams, CityEventResult } from '../types'

/**
 * Manual/fallback events adapter.
 *
 * For countries/cities without an events API integration.
 * Returns an empty array — the app will only show community-created events.
 */
const manualEventsAdapter: EventsAdapter = {
  type: 'manual',
  name: 'Manual',

  async fetchEvents(_params: EventsFetchParams): Promise<CityEventResult[]> {
    return []
  },
}

export default manualEventsAdapter
