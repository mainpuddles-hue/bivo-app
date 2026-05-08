import { useEffect, useState } from 'react'
import * as Location from 'expo-location'
import { useSupabase } from '@/hooks/useSupabase'
import { getCachedUserId } from '@/lib/authCache'

interface FeedLocation {
  latitude: number
  longitude: number
  source: 'gps' | 'address'
}

/**
 * Returns the user's location for feed filtering and distance calculations.
 *
 * Priority:
 *   1. GPS (foreground permission) — most accurate, live position
 *   2. Address from onboarding — stored in buildings table via user_buildings
 *
 * The `source` field tells callers where the coordinates came from,
 * so the UI can show "GPS" vs address-based location.
 *
 * Returns `null` until a position is resolved. If both GPS and address
 * fail, returns null — callers must handle this (show all posts).
 */
export function useFeedLocation(): FeedLocation | null {
  const [userLocation, setUserLocation] = useState<FeedLocation | null>(null)
  const supabase = useSupabase()

  useEffect(() => {
    let cancelled = false

    async function getLocation() {
      // 1. Try GPS first
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted' && !cancelled) {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          if (!cancelled) {
            setUserLocation({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              source: 'gps',
            })
            return // GPS succeeded, done
          }
        }
      } catch {
        // GPS failed — fall through to address
      }

      // 2. Fall back to address from onboarding (stored in buildings table)
      if (cancelled) return
      try {
        const userId = await getCachedUserId()
        if (!userId || cancelled) return

        const { data } = await supabase
          .from('user_buildings')
          .select('building:buildings(lat, lng)')
          .eq('user_id', userId)
          .single() as any

        if (!cancelled && data?.building?.lat && data?.building?.lng) {
          setUserLocation({
            latitude: data.building.lat,
            longitude: data.building.lng,
            source: 'address',
          })
        }
      } catch {
        // Address lookup failed — location stays null
      }
    }

    getLocation()
    return () => { cancelled = true }
  }, [supabase])

  return userLocation
}
