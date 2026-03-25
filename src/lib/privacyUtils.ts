interface LocationPrivacy {
  latitude: number | null
  longitude: number | null
  location: string | null
}

/**
 * Apply location_accuracy setting to coordinates.
 * 'exact' -> show as-is
 * 'area' -> round to 2 decimal places (~1.1km precision)
 * 'city' -> remove coordinates entirely, keep only city/neighborhood
 */
export function applyLocationAccuracy(
  accuracy: string | undefined,
  lat: number | null,
  lng: number | null,
  location: string | null,
): LocationPrivacy {
  switch (accuracy) {
    case 'area':
      return {
        latitude: lat != null ? Math.round(lat * 100) / 100 : null,
        longitude: lng != null ? Math.round(lng * 100) / 100 : null,
        location,
      }
    case 'city':
      return {
        latitude: null,
        longitude: null,
        location: location ? location.split(',').pop()?.trim() ?? location : null,
      }
    case 'exact':
    default:
      return { latitude: lat, longitude: lng, location }
  }
}

/**
 * Check if a profile should be visible to the viewer.
 * 'everyone' -> always visible
 * 'neighbors' -> only if same neighborhood
 * 'hidden' -> never visible (except to self)
 */
export function isProfileVisible(
  visibility: string | undefined,
  profileNeighborhood: string | null,
  viewerNeighborhood: string | null,
  isSelf: boolean,
): boolean {
  if (isSelf) return true
  switch (visibility) {
    case 'hidden': return false
    case 'neighbors': return !!profileNeighborhood && profileNeighborhood === viewerNeighborhood
    case 'everyone':
    default: return true
  }
}
