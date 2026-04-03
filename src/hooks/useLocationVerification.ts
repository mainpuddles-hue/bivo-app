declare const __DEV__: boolean

import { useState, useCallback } from 'react'
import * as Location from 'expo-location'
import { haversineKm } from '@/lib/geo'

// Approximate center coordinates for Helsinki neighborhoods
const NEIGHBORHOOD_CENTERS: Record<string, { lat: number; lng: number }> = {
  Kallio: { lat: 60.1841, lng: 24.9514 },
  Sörnäinen: { lat: 60.1877, lng: 24.9697 },
  Vallila: { lat: 60.1942, lng: 24.9542 },
  Hermanni: { lat: 60.1909, lng: 24.9653 },
  Alppiharju: { lat: 60.1900, lng: 24.9450 },
  Pasila: { lat: 60.1989, lng: 24.9311 },
  Käpylä: { lat: 60.2103, lng: 24.9426 },
  Kumpula: { lat: 60.2067, lng: 24.9628 },
  Toukola: { lat: 60.2019, lng: 24.9697 },
  Arabia: { lat: 60.2082, lng: 24.9799 },
  Kruununhaka: { lat: 60.1728, lng: 24.9558 },
  Katajanokka: { lat: 60.1678, lng: 24.9672 },
  Punavuori: { lat: 60.1625, lng: 24.9397 },
  Ullanlinna: { lat: 60.1586, lng: 24.9472 },
  Eira: { lat: 60.1558, lng: 24.9372 },
  Töölö: { lat: 60.1783, lng: 24.9225 },
  Meilahti: { lat: 60.1881, lng: 24.9081 },
  Munkkiniemi: { lat: 60.1972, lng: 24.8781 },
  Lauttasaari: { lat: 60.1603, lng: 24.8778 },
  Ruoholahti: { lat: 60.1642, lng: 24.9133 },
  Jätkäsaari: { lat: 60.1572, lng: 24.9167 },
  Kamppi: { lat: 60.1686, lng: 24.9322 },
  Hakaniemi: { lat: 60.1789, lng: 24.9508 },
  Merihaka: { lat: 60.1762, lng: 24.9611 },
  Kulosaari: { lat: 60.1878, lng: 24.9897 },
  Herttoniemi: { lat: 60.1953, lng: 25.0331 },
  Laajasalo: { lat: 60.1742, lng: 25.0528 },
  Vuosaari: { lat: 60.2094, lng: 25.1422 },
  Mellunmäki: { lat: 60.2369, lng: 25.1086 },
  Kontula: { lat: 60.2356, lng: 25.0839 },
  Malmi: { lat: 60.2486, lng: 25.0103 },
  Tapanila: { lat: 60.2611, lng: 25.0058 },
  Pukinmäki: { lat: 60.2383, lng: 24.9903 },
  Oulunkylä: { lat: 60.2267, lng: 24.9603 },
  Maunula: { lat: 60.2233, lng: 24.9350 },
  Pitäjänmäki: { lat: 60.2222, lng: 24.8639 },
  Haaga: { lat: 60.2183, lng: 24.8931 },
  Viikki: { lat: 60.2256, lng: 25.0158 },
  Suutarila: { lat: 60.2756, lng: 25.0064 },
  Tapulikaupunki: { lat: 60.2625, lng: 25.0297 },
}

export type VerificationStatus = 'idle' | 'checking' | 'verified' | 'unverified' | 'error'

export function useLocationVerification() {
  const [status, setStatus] = useState<VerificationStatus>('idle')
  const [distanceKm, setDistanceKm] = useState<number | null>(null)

  /**
   * Verify user is near the selected neighborhood.
   * @param neighborhood Name of the neighborhood
   * @param coords Optional override coords from DB (for non-Helsinki cities)
   */
  const verify = useCallback(async (neighborhood: string, coords?: { lat: number; lng: number }): Promise<boolean> => {
    const center = coords ?? NEIGHBORHOOD_CENTERS[neighborhood]
    if (!center) {
      setStatus('error')
      return false
    }

    setStatus('checking')

    try {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync()
      if (permStatus !== 'granted') {
        setStatus('error')
        return false
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const dist = haversineKm(loc.coords.latitude, loc.coords.longitude, center.lat, center.lng)
      setDistanceKm(dist)

      if (dist <= 2) {
        setStatus('verified')
        return true
      } else {
        setStatus('unverified')
        return false
      }
    } catch (err) {
      if (__DEV__) console.warn('[locationVerification] verify failed:', err)
      setStatus('error')
      return false
    }
  }, [])

  return { status, distanceKm, verify }
}
