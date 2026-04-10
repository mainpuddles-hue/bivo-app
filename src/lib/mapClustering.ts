interface MapItem {
  id: string
  latitude: number
  longitude: number
  type: string
  [key: string]: any
}

interface Cluster {
  id: string
  latitude: number
  longitude: number
  count: number
  items: MapItem[]
}

/**
 * Simple grid-based clustering for map markers.
 * Groups items within the same grid cell at the given zoom level.
 */
export function clusterMarkers(items: MapItem[], zoomLevel: number): (MapItem | Cluster)[] {
  if (zoomLevel >= 15) return items // No clustering at high zoom

  const gridSize = 0.01 * Math.pow(2, 13 - Math.min(zoomLevel, 13)) // Adaptive grid
  const grid = new Map<string, MapItem[]>()

  for (const item of items) {
    if (item.latitude == null || item.longitude == null) continue
    const key = `${Math.floor(item.latitude / gridSize)}_${Math.floor(item.longitude / gridSize)}`
    const cell = grid.get(key)
    if (cell) cell.push(item)
    else grid.set(key, [item])
  }

  const result: (MapItem | Cluster)[] = []
  for (const [, cell] of grid) {
    if (cell.length === 1) {
      result.push(cell[0])
    } else {
      const avgLat = cell.reduce((s, i) => s + i.latitude, 0) / cell.length
      const avgLng = cell.reduce((s, i) => s + i.longitude, 0) / cell.length
      result.push({
        id: `cluster-${cell[0].id}`,
        latitude: avgLat,
        longitude: avgLng,
        count: cell.length,
        items: cell,
      })
    }
  }
  return result
}

export function isCluster(item: any): item is Cluster {
  return 'count' in item && 'items' in item
}

export type { Cluster }
