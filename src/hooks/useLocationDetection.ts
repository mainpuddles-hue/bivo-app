import { useState, useEffect } from 'react'
import * as Location from 'expo-location'
import { useSupabase } from './useSupabase'

export interface DetectedLocation {
  country: string | null      // ISO: 'FI', 'SE', 'EE'
  countryName: string | null  // 'Suomi', 'Sverige'
  city: string | null         // 'Helsinki', 'Stockholm'
  lat: number | null
  lng: number | null
  isSupported: boolean        // true if country is active in countries table
  isWaitlist: boolean         // true if country is in waitlist
  loading: boolean
  permissionDenied: boolean   // true if user denied location permission
}

const INITIAL_STATE: DetectedLocation = {
  country: null,
  countryName: null,
  city: null,
  lat: null,
  lng: null,
  isSupported: false,
  isWaitlist: false,
  loading: true,
  permissionDenied: false,
}

export function useLocationDetection(userId: string | null) {
  const supabase = useSupabase()
  const [location, setLocation] = useState<DetectedLocation>(INITIAL_STATE)

  useEffect(() => {
    let mounted = true

    async function detect() {
      try {
        // Get GPS permission + coordinates
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          // If permission denied, assume Finland (don't block Finnish users)
          if (mounted) {
            setLocation(l => ({
              ...l,
              isSupported: true,
              loading: false,
              permissionDenied: true,
            }))
          }
          return
        }

        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        })
        const { latitude, longitude } = pos.coords

        // Reverse geocode via Nominatim (free, no API key)
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'TackBirdMobile/1.0',
              'Accept-Language': 'en',
            },
          }
        )
        const data = await res.json()
        const countryCode =
          data?.address?.country_code?.toUpperCase() ?? null
        const cityName =
          data?.address?.city ??
          data?.address?.town ??
          data?.address?.municipality ??
          null

        // Check if country is supported in our countries table
        let isSupported = false
        let isWaitlist = false
        let countryDisplayName: string | null = null

        try {
          const { data: countryData } = await (supabase
            .from('countries') as any)
            .select('id, name, is_active, is_waitlist')
            .eq('id', countryCode)
            .maybeSingle()

          isSupported = (countryData as any)?.is_active ?? false
          isWaitlist = (countryData as any)?.is_waitlist ?? false
          countryDisplayName = (countryData as any)?.name ?? null
        } catch {
          // If countries table doesn't exist or query fails,
          // fall back to checking if country is Finland
          isSupported = countryCode === 'FI'
        }

        // If no country name from DB, use geocode result
        if (!countryDisplayName) {
          countryDisplayName = data?.address?.country ?? null
        }

        if (mounted) {
          setLocation({
            country: countryCode,
            countryName: countryDisplayName,
            city: cityName,
            lat: latitude,
            lng: longitude,
            isSupported,
            isWaitlist,
            loading: false,
            permissionDenied: false,
          })
        }

        // Save to profile (non-blocking, best-effort)
        if (userId && countryCode) {
          (supabase.from('profiles') as any)
            .update({
              detected_country: countryCode,
              detected_city: cityName,
            })
            .eq('id', userId)
            .then(() => {})
            .catch(() => {})
        }
      } catch {
        // On any error, assume Finland (don't block users)
        if (mounted) {
          setLocation(l => ({
            ...l,
            isSupported: true,
            loading: false,
          }))
        }
      }
    }

    detect()
    return () => {
      mounted = false
    }
  }, [userId, supabase])

  return location
}
