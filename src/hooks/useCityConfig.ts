import { useState, useEffect } from 'react'
import { useSupabase } from './useSupabase'

export interface City {
  id: string
  name: string
  center_lat: number
  center_lng: number
  bounds_south: number
  bounds_north: number
  bounds_west: number
  bounds_east: number
  linkedevents_url: string | null
  timezone: string
  currency: string
}

export interface CityConfig {
  city: City | null
  neighborhoods: string[]
  neighborhoodCoords: Record<string, { lat: number; lng: number; isDense: boolean }>
  loading: boolean
}

export function useCityConfig(cityId: string | null) {
  const supabase = useSupabase()
  const [config, setConfig] = useState<CityConfig>({
    city: null, neighborhoods: [], neighborhoodCoords: {}, loading: true,
  })

  useEffect(() => {
    if (!cityId) { setConfig(c => ({ ...c, loading: false })); return }
    let mounted = true

    async function load() {
      const cid = cityId!
      const [{ data: city }, { data: neighborhoods }] = await Promise.all([
        supabase.from('cities').select('*').eq('id', cid).single(),
        supabase.from('city_neighborhoods').select('name, center_lat, center_lng, is_dense').eq('city_id', cid).order('name'),
      ])

      if (!mounted) return

      const names = (neighborhoods ?? []).map((n: any) => n.name)
      const coords: Record<string, { lat: number; lng: number; isDense: boolean }> = {}
      for (const n of (neighborhoods ?? []) as any[]) {
        coords[n.name] = { lat: n.center_lat, lng: n.center_lng, isDense: n.is_dense ?? false }
      }

      setConfig({
        city: city as any as City ?? null,
        neighborhoods: names,
        neighborhoodCoords: coords,
        loading: false,
      })
    }

    load()
    return () => { mounted = false }
  }, [cityId, supabase])

  return config
}
