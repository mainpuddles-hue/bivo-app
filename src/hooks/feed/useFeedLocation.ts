import { useEffect, useState } from 'react'
import * as Location from 'expo-location'

interface FeedLocation {
  latitude: number
  longitude: number
}

/**
 * Requests foreground location permission once on mount and caches the
 * first returned position. Used by the feed to sort by distance and by
 * the discovery section (nearby places) to query within a radius.
 *
 * Returns `null` until the position is resolved (permission granted +
 * GPS fix acquired). Silently returns `null` forever if the user denies
 * the permission — callers must handle `null` as "unknown location".
 *
 * Extracted from useFeedData.ts — kept as a standalone hook so it can
 * be used anywhere a screen needs "best-effort current position".
 */
export function useFeedLocation(): FeedLocation | null {
  const [userLocation, setUserLocation] = useState<FeedLocation | null>(null)

  useEffect(() => {
    let cancelled = false
    async function getLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted' || cancelled) return
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        if (!cancelled) {
          setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
        }
      } catch {
        // Silently fail — distance won't be shown
      }
    }
    getLocation()
    return () => { cancelled = true }
  }, [])

  return userLocation
}
