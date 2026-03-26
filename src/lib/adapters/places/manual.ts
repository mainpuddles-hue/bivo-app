import type { PlacesAdapter, PlacesFetchParams, PlaceResult } from '../types'

/**
 * Manual/fallback places adapter.
 *
 * For countries/cities without a places API integration.
 * Returns an empty array — the map will show only user-created content.
 */
const manualPlacesAdapter: PlacesAdapter = {
  type: 'manual',
  name: 'Manual',

  async fetchPlaces(_params: PlacesFetchParams): Promise<PlaceResult[]> {
    return []
  },
}

export default manualPlacesAdapter
