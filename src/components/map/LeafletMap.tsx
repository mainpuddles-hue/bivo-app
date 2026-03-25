import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, Platform } from 'react-native'
import { CATEGORIES } from '@/lib/constants'
import type { Post, PostType, Event, CityEvent, LocalPlace } from '@/lib/types'
import {
  svgMarker, buildPostPopup, buildEventPopup, buildCityEventPopup, buildPlacePopup,
  PLACE_CATS, CITY_EVENT_CATS,
} from './MapPopupCard'

const HELSINKI_CENTER: [number, number] = [60.1699, 24.9384]
const DEFAULT_ZOOM = 13

const HKI = { south: 60.14, north: 60.27, west: 24.83, east: 25.20 } as const

const isInHelsinki = (lat: number, lng: number): boolean => {
  if (lat < HKI.south || lat > HKI.north || lng < HKI.west || lng > HKI.east) return false
  if (lat > 60.24 && lng < 24.88) return false
  if (lat > 60.26 && lng < 24.96) return false
  return true
}

const NEIGHBORHOOD_COORDS: Record<string, [number, number]> = {
  'Kallio': [60.1844, 24.9496], 'Sörnäinen': [60.1870, 24.9700],
  'Vallila': [60.1930, 24.9530], 'Kamppi': [60.1686, 24.9316],
  'Töölö': [60.1810, 24.9220], 'Kruununhaka': [60.1730, 24.9560],
  'Katajanokka': [60.1673, 24.9625], 'Punavuori': [60.1609, 24.9406],
  'Arabia': [60.2037, 24.9756], 'Herttoniemi': [60.1950, 25.0320],
  'Hakaniemi': [60.1790, 24.9510], 'Pasila': [60.1985, 24.9310],
  'Lauttasaari': [60.1580, 24.8770], 'Ruoholahti': [60.1620, 24.9080],
  'Jätkäsaari': [60.1570, 24.9120], 'Hermanni': [60.1880, 24.9620],
  'Alppiharju': [60.1890, 24.9510], 'Käpylä': [60.2100, 24.9490],
  'Kumpula': [60.2060, 24.9600], 'Toukola': [60.2000, 24.9670],
  'Ullanlinna': [60.1570, 24.9480], 'Eira': [60.1550, 24.9380],
  'Munkkiniemi': [60.1970, 24.8770], 'Vuosaari': [60.2090, 25.1450],
  'Malmi': [60.2490, 25.0110], 'Oulunkylä': [60.2290, 24.9590],
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

export interface LeafletMapProps {
  posts: Post[]
  events: Event[]
  cityEvents: CityEvent[]
  places: LocalPlace[]
  selectedArea: string | null
  userPos: [number, number] | null
  radiusKm: number | null
  flyTo: { lat: number; lng: number; zoom: number } | null
  onFlyComplete?: () => void
  onMapInteraction?: () => void
  isDark: boolean
  t: (key: string) => string
}

export function LeafletMap({ posts, events, cityEvents, places, selectedArea, userPos, radiusKm, flyTo, onFlyComplete, onMapInteraction, isDark, t }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const leafletRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const layersRef = useRef<any[]>([])
  const userLayerRef = useRef<any>(null)
  const initialFitDone = useRef(false)
  const [mapReady, setMapReady] = useState(false)

  const loadScript = useCallback((src: string) =>
    new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.onload = () => resolve()
      s.onerror = () => reject(new Error(`Failed to load ${src}`))
      document.head.appendChild(s)
    }), [])

  // (1) Map init — runs once
  useEffect(() => {
    if (Platform.OS !== 'web' || !mapRef.current || typeof window === 'undefined') return
    let cancelled = false

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'; link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    if (!document.getElementById('leaflet-cluster-css')) {
      const link2 = document.createElement('link')
      link2.id = 'leaflet-cluster-css'; link2.rel = 'stylesheet'
      link2.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css'
      document.head.appendChild(link2)
      const link3 = document.createElement('link')
      link3.id = 'leaflet-cluster-css2'; link3.rel = 'stylesheet'
      link3.href = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css'
      document.head.appendChild(link3)
    }
    if (!document.getElementById('pulse-css')) {
      const style = document.createElement('style')
      style.id = 'pulse-css'
      style.textContent = '@keyframes userPulse{0%{transform:scale(1);opacity:0.6}100%{transform:scale(2.5);opacity:0}}.leaflet-popup-styled .leaflet-popup-content-wrapper{padding:0;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.15);}.leaflet-popup-styled .leaflet-popup-content{margin:13px 20px;}.leaflet-popup-styled .leaflet-popup-tip{display:none;}'
      document.head.appendChild(style)
    }

    const init = async () => {
      try {
        if (!(window as any).L) await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js')
        if (!(window as any).L?.MarkerClusterGroup) await loadScript('https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js')
      } catch { return }
      if (cancelled || !mapRef.current) return
      const L = (window as any).L
      leafletRef.current = L

      const map = L.map(mapRef.current, { zoomControl: false }).setView(HELSINKI_CENTER, DEFAULT_ZOOM)
      tileLayerRef.current = L.tileLayer(isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map)
      L.control.zoom({ position: 'bottomright' }).addTo(map)

      map.on('popupopen', () => {
        setTimeout(() => {
          const links = document.querySelectorAll('.leaflet-popup-content a[data-route]')
          links.forEach((a: Element) => {
            a.addEventListener('click', (ev: globalThis.Event) => {
              ev.preventDefault()
              const route = (a as HTMLElement).getAttribute('data-route')
              if (route) window.dispatchEvent(new CustomEvent('map-navigate', { detail: route }))
            })
          })
        }, 50)
      })

      if (onMapInteraction) {
        const handler = () => onMapInteraction()
        map.on('movestart', handler)
        map.on('zoomstart', handler)
      }

      mapInstanceRef.current = map
      setMapReady(true)
    }
    init()

    return () => { cancelled = true; setMapReady(false); if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; leafletRef.current = null; tileLayerRef.current = null; initialFitDone.current = false } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // (1b) Swap tile layer on dark mode change
  useEffect(() => {
    const map = mapInstanceRef.current
    const L = leafletRef.current
    if (!map || !L || !tileLayerRef.current) return
    map.removeLayer(tileLayerRef.current)
    tileLayerRef.current = L.tileLayer(isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map)
  }, [isDark])

  // (2) Update markers
  useEffect(() => {
    const map = mapInstanceRef.current
    const L = leafletRef.current
    if (!map || !L || !mapReady) return

    for (const layer of layersRef.current) { map.removeLayer(layer) }
    layersRef.current = []

    const bdr = isDark ? '#121212' : 'white'
    const popupTheme = { isDark, borderColor: bdr }
    const createClusterIcon = (color: string) => (cluster: any) => {
      const count = cluster.getChildCount()
      const size = count < 10 ? 32 : count < 50 ? 40 : 48
      const ring = count < 10 ? 4 : count < 50 ? 5 : 6
      return L.divIcon({
        className: '',
        html: `<div style="width:${size+ring*2}px;height:${size+ring*2}px;border-radius:50%;background:${color}33;display:flex;align-items:center;justify-content:center;">
          <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:2px solid ${bdr};box-shadow:0 2px 6px rgba(0,0,0,0.25);">
            <span style="color:white;font-size:${count<10?12:count<50?13:14}px;font-weight:700;">${count}</span>
          </div>
        </div>`,
        iconSize: [size+ring*2, size+ring*2], iconAnchor: [(size+ring*2)/2, (size+ring*2)/2],
      })
    }

    // ── Post markers ──
    const postCluster = L.MarkerClusterGroup ? new L.MarkerClusterGroup({ maxClusterRadius: 50, spiderfyOnMaxZoom: true, iconCreateFunction: createClusterIcon('rgba(45,107,94,0.9)') }) : L.layerGroup()
    posts.forEach((p) => {
      if (!p.latitude || !p.longitude) return
      const cat = CATEGORIES[p.type as PostType]
      const color = cat?.color ?? '#2D6B5E'
      const svgIcon = svgMarker(cat?.icon ?? 'MapPin', 16)
      const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], p.latitude, p.longitude)) : ''
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:36px;height:44px">
          <div style="position:absolute;top:0;left:1px;width:34px;height:34px;border-radius:50%;background:${color};border:2.5px solid ${bdr};display:flex;align-items:center;justify-content:center">${svgIcon}</div>
          <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:7px solid ${bdr}"></div>
        </div>`,
        iconSize: [36, 44], iconAnchor: [18, 44],
      })
      const marker = L.marker([p.latitude, p.longitude], { icon })
      marker.bindPopup(buildPostPopup(p, dist, popupTheme, t), { maxWidth: 300, autoPanPadding: [80, 60] })
      postCluster.addLayer(marker)
    })
    map.addLayer(postCluster)
    layersRef.current.push(postCluster)

    // ── Event markers ──
    const eventCluster = L.MarkerClusterGroup ? new L.MarkerClusterGroup({ maxClusterRadius: 45, spiderfyOnMaxZoom: true, iconCreateFunction: createClusterIcon('rgba(43,138,98,0.9)') }) : L.layerGroup()
    events.forEach((e) => {
      if (!e.location_lat || !e.location_lng) return
      const calSvg = svgMarker('CalendarDays', 18)
      const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], e.location_lat, e.location_lng)) : ''
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:36px;height:44px">
          <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#1B9E6B,#3AE6A0);border:2.5px solid ${bdr};display:flex;align-items:center;justify-content:center">${calSvg}</div>
          <div style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${bdr}"></div>
        </div>`,
        iconSize: [36, 44], iconAnchor: [18, 44],
      })
      const evMarker = L.marker([e.location_lat, e.location_lng], { icon })
      evMarker.bindPopup(buildEventPopup(e, dist, popupTheme), { maxWidth: 300, className: 'leaflet-popup-styled' })
      eventCluster.addLayer(evMarker)
    })
    map.addLayer(eventCluster)
    layersRef.current.push(eventCluster)

    // ── City event markers ──
    const cityCluster = L.MarkerClusterGroup ? new L.MarkerClusterGroup({ maxClusterRadius: 45, spiderfyOnMaxZoom: true, iconCreateFunction: createClusterIcon('rgba(142,68,173,0.9)') }) : L.layerGroup()
    cityEvents.forEach((ce) => {
      if (!ce.latitude || !ce.longitude) return
      const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], ce.latitude, ce.longitude)) : ''
      const catCfg = CITY_EVENT_CATS[ce.category] ?? CITY_EVENT_CATS.other
      const catColor = catCfg.color
      const catSvg = svgMarker(catCfg.icon, 16)
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:36px;height:44px">
          <div style="width:36px;height:36px;border-radius:14px;background:linear-gradient(135deg,${catColor},${catColor}dd);border:2.5px solid ${bdr};display:flex;align-items:center;justify-content:center">${catSvg}</div>
          <div style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${bdr}"></div>
        </div>`,
        iconSize: [36, 44], iconAnchor: [18, 44],
      })
      const ceMarker = L.marker([ce.latitude, ce.longitude], { icon })
      ceMarker.bindPopup(buildCityEventPopup(ce, dist, popupTheme), { maxWidth: 300, className: 'leaflet-popup-styled' })
      cityCluster.addLayer(ceMarker)
    })
    map.addLayer(cityCluster)
    layersRef.current.push(cityCluster)

    // ── Place markers ──
    const placeCluster = L.MarkerClusterGroup ? new L.MarkerClusterGroup({ maxClusterRadius: 60, spiderfyOnMaxZoom: true, iconCreateFunction: createClusterIcon('rgba(201,139,46,0.9)') }) : L.layerGroup()
    places.forEach((pl) => {
      if (!pl.latitude || !pl.longitude) return
      const pCat = PLACE_CATS[pl.category] ?? PLACE_CATS.other
      const pColor = pCat.color
      const pSvg = svgMarker(pCat.icon, 13)
      const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], pl.latitude, pl.longitude)) : ''
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:30px;height:36px;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.2));">
          <div style="width:26px;height:26px;border-radius:6px;background:${pColor};opacity:${isDark?'0.9':'0.85'};border:2px solid ${bdr};display:flex;align-items:center;justify-content:center;margin:0 auto;">${pSvg}</div>
          <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ${pColor};margin:-1px auto 0;opacity:0.85;"></div>
        </div>`,
        iconSize: [30, 36], iconAnchor: [15, 36],
      })
      const marker = L.marker([pl.latitude, pl.longitude], { icon })
      marker.bindPopup(buildPlacePopup(pl, dist, popupTheme), { maxWidth: 320, className: 'leaflet-popup-styled' })
      placeCluster.addLayer(marker)
    })
    map.addLayer(placeCluster)
    layersRef.current.push(placeCluster)

    // ── Fit bounds on first data load ──
    if (!initialFitDone.current) {
      const allLatLngs: [number, number][] = [
        ...posts.filter(p => p.latitude && p.longitude && isInHelsinki(p.latitude, p.longitude)).map(p => [p.latitude!, p.longitude!] as [number, number]),
        ...events.filter(e => e.location_lat && e.location_lng && isInHelsinki(e.location_lat, e.location_lng)).map(e => [e.location_lat!, e.location_lng!] as [number, number]),
        ...cityEvents.filter(c => c.latitude && c.longitude && isInHelsinki(c.latitude!, c.longitude!)).map(c => [c.latitude!, c.longitude!] as [number, number]),
        ...places.filter(p => isInHelsinki(p.latitude, p.longitude)).slice(0, 50).map(p => [p.latitude, p.longitude] as [number, number]),
      ]
      if (allLatLngs.length > 2) {
        try { map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40], maxZoom: 14 }) } catch {}
      }
      initialFitDone.current = true
    }
  }, [posts, events, cityEvents, places, userPos, radiusKm, isDark, t, mapReady])

  // (3) User position + radius circle
  useEffect(() => {
    const map = mapInstanceRef.current
    const L = leafletRef.current
    if (!map || !L) return
    if (userLayerRef.current) { map.removeLayer(userLayerRef.current); userLayerRef.current = null }
    if (!userPos) return

    const group = L.layerGroup()
    const userIcon = L.divIcon({
      className: '',
      html: `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
        <div style="width:18px;height:18px;border-radius:50%;background:#3B82F4;border:3px solid white;box-shadow:0 1px 6px rgba(59,130,244,0.4);"></div>
        <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(59,130,244,0.15);animation:userPulse 2.5s ease-out infinite;"></div>
      </div>`,
      iconSize: [40, 40], iconAnchor: [20, 20],
    })
    L.marker(userPos, { icon: userIcon, interactive: false }).addTo(group)
    if (radiusKm) {
      L.circle(userPos, { radius: radiusKm * 1000, color: '#4285F4', weight: 2, dashArray: '6 4', fillColor: '#4285F4', fillOpacity: isDark ? 0.12 : 0.08, interactive: false }).addTo(group)
    }
    group.addTo(map)
    userLayerRef.current = group
  }, [userPos, radiusKm, isDark])

  // Fly to selected area
  useEffect(() => {
    if (!selectedArea || !mapInstanceRef.current) return
    const coords = NEIGHBORHOOD_COORDS[selectedArea]
    if (coords) mapInstanceRef.current.flyTo(coords, 15, { duration: 1 })
  }, [selectedArea])

  // Fly to search result
  useEffect(() => {
    if (!flyTo || !mapInstanceRef.current) return
    const map = mapInstanceRef.current
    map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom, { duration: 1 })
    const done = () => { onFlyComplete?.(); map.off('moveend', done) }
    map.on('moveend', done)
    return () => { map.off('moveend', done) }
  }, [flyTo, onFlyComplete])

  if (Platform.OS !== 'web') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Kartta vaatii web-ymp\u00E4rist\u00F6n</Text></View>
  return <div ref={mapRef as any} style={{ width: '100%', height: '100%' }} />
}
