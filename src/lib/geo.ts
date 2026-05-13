/**
 * Check if coordinates are within a city's bounding box.
 */
export function isInCityBounds(
  lat: number,
  lng: number,
  bounds: { south: number; north: number; west: number; east: number }
): boolean {
  return lat >= bounds.south && lat <= bounds.north && lng >= bounds.west && lng <= bounds.east
}

/**
 * Compute a lat/lng bounding box around a center point.
 * Used for geographic feed filtering — posts outside the box are excluded.
 *
 * @param lat Center latitude
 * @param lng Center longitude
 * @param radiusKm Radius in kilometers
 * @returns Bounding box { minLat, maxLat, minLng, maxLng }
 */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  // 1° latitude ≈ 111 km everywhere
  const dLat = radiusKm / 111
  // 1° longitude ≈ 111 * cos(latitude) km
  // Clamp cos to a minimum to avoid division by zero at the poles (lat ≈ ±90°)
  const cosLat = Math.max(Math.cos(lat * Math.PI / 180), 1e-10)
  const dLng = radiusKm / (111 * cosLat)
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  }
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if ([lat1, lon1, lat2, lon2].some(v => v == null || isNaN(v))) return 0
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
