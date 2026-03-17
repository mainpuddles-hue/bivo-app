import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, Platform, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  ArrowLeft, Search, X, MapPin, Navigation, ChevronDown, ChevronUp,
  Newspaper, CalendarDays, Coffee, Crosshair, Loader2,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIES, NEIGHBORHOODS } from '@/lib/constants'
import type { Post, PostType, Event, CityEvent, LocalPlace } from '@/lib/types'

const HELSINKI_CENTER: [number, number] = [60.1699, 24.9384]
const DEFAULT_ZOOM = 13

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

// SVG path icons matching Lucide for markers (white fill, no stroke)
const CAT_MARKER_SVG: Record<string, string> = {
  tarvitsen: '<path d="M7 11v8a1 1 0 01-1 1H4a1 1 0 01-1-1v-7a1 1 0 011-1h3m0-1V6a4 4 0 014-4h.5a.5.5 0 01.5.5V6l-1 2h5.5a2 2 0 011.94 2.49l-1.46 6A2 2 0 0115.04 18H7" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  tarjoan: '<path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 110-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  ilmaista: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7 7-7z" fill="white" stroke="white" stroke-width="1.5"/>',
  nappaa: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="white" stroke="white" stroke-width="1.5"/>',
  lainaa: '<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  tapahtuma: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="none" stroke="white" stroke-width="2"/><line x1="16" y1="2" x2="16" y2="6" stroke="white" stroke-width="2"/><line x1="8" y1="2" x2="8" y2="6" stroke="white" stroke-width="2"/><line x1="3" y1="10" x2="21" y2="10" stroke="white" stroke-width="2"/>',
}

function markerSvgHtml(type: string, size = 14): string {
  const svg = CAT_MARKER_SVG[type]
  if (!svg) return `<span style="color:white;font-size:${size}px;font-weight:bold;">${type.charAt(0).toUpperCase()}</span>`
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`
}

const PLACE_ICONS: Record<string, string> = {
  restaurant: '🍽️', cafe: '☕', bar: '🍺', shop: '🛒', library: '📚',
  health: '🏥', sport: '⚽', culture: '🎭', hotel: '🏨', attraction: '⭐',
  service: '🔧', fast_food: '🍔', pub: '🍻', other: '📍',
}

const PLACE_CATEGORIES = [
  { key: null, label: 'common.all' },
  { key: 'restaurant', label: 'places.restaurant' },
  { key: 'cafe', label: 'places.cafe' },
  { key: 'bar', label: 'places.bar' },
  { key: 'shop', label: 'places.shop' },
  { key: 'culture', label: 'places.culture' },
  { key: 'service', label: 'places.service' },
  { key: 'library', label: 'places.library' },
]

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

// ── Leaflet Map (web only) ──
function LeafletMap({ posts, events, cityEvents, places, selectedArea, userPos, radiusKm, isDark, t }: {
  posts: Post[]; events: Event[]; cityEvents: CityEvent[]; places: LocalPlace[]
  selectedArea: string | null; userPos: [number, number] | null; radiusKm: number | null
  isDark: boolean; t: any
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (Platform.OS !== 'web' || !mapRef.current || typeof window === 'undefined') return

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'; link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    // Marker cluster CSS
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

    const loadScripts = async () => {
      // Leaflet
      if (!(window as any).L) {
        await new Promise<void>(r => { const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = () => r(); document.head.appendChild(s) })
      }
      // MarkerCluster
      if (!(window as any).L?.MarkerClusterGroup) {
        await new Promise<void>(r => { const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js'; s.onload = () => r(); document.head.appendChild(s) })
      }
      return (window as any).L
    }

    loadScripts().then((L: any) => {
      if (!L || !mapRef.current) return
      if (mapInstanceRef.current) mapInstanceRef.current.remove()

      const map = L.map(mapRef.current, { zoomControl: false }).setView(HELSINKI_CENTER, DEFAULT_ZOOM)
      L.tileLayer(isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map)
      L.control.zoom({ position: 'bottomright' }).addTo(map)

      // ── User position + radius ──
      if (userPos) {
        const userIcon = L.divIcon({
          className: '',
          html: `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
            <div style="width:18px;height:18px;border-radius:50%;background:#3B82F4;border:3px solid white;box-shadow:0 1px 6px rgba(59,130,244,0.4);"></div>
            <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(59,130,244,0.15);animation:userPulse 2.5s ease-out infinite;"></div>
          </div>`,
          iconSize: [40, 40], iconAnchor: [20, 20],
        })
        L.marker(userPos, { icon: userIcon, interactive: false }).addTo(map)
        if (radiusKm) {
          L.circle(userPos, { radius: radiusKm * 1000, color: '#4285F4', weight: 2, dashArray: '6 4', fillColor: '#4285F4', fillOpacity: isDark ? 0.12 : 0.08, interactive: false }).addTo(map)
        }
        // Add pulse animation CSS
        if (!document.getElementById('pulse-css')) {
          const style = document.createElement('style')
          style.id = 'pulse-css'
          style.textContent = '@keyframes userPulse{0%{transform:scale(1);opacity:0.6}100%{transform:scale(2.5);opacity:0}}'
          document.head.appendChild(style)
        }
      }

      // ── Post markers (clustered) ──
      const createClusterIcon = (color: string) => (cluster: any) => {
        const count = cluster.getChildCount()
        const size = count < 10 ? 32 : count < 50 ? 40 : 48
        const ring = count < 10 ? 4 : count < 50 ? 5 : 6
        return L.divIcon({
          className: '',
          html: `<div style="width:${size+ring*2}px;height:${size+ring*2}px;border-radius:50%;background:${color}33;display:flex;align-items:center;justify-content:center;">
            <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:2px solid ${isDark?'#1E1E1E':'white'};box-shadow:0 2px 6px rgba(0,0,0,0.25);">
              <span style="color:white;font-size:${count<10?12:count<50?13:14}px;font-weight:700;">${count}</span>
            </div>
          </div>`,
          iconSize: [size+ring*2, size+ring*2], iconAnchor: [(size+ring*2)/2, (size+ring*2)/2],
        })
      }
      const postCluster = L.MarkerClusterGroup ? new L.MarkerClusterGroup({ maxClusterRadius: 50, spiderfyOnMaxZoom: true, iconCreateFunction: createClusterIcon('rgba(45,107,94,0.9)') }) : L.layerGroup()
      posts.forEach((p) => {
        if (!p.latitude || !p.longitude) return
        const cat = CATEGORIES[p.type as PostType]
        const color = cat?.color ?? '#2D6B5E'
        const svgIcon = markerSvgHtml(p.type, 16)
        const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], p.latitude, p.longitude)) : ''

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:40px;height:48px;position:relative;cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
            <div style="width:36px;height:36px;border-radius:50%;background:${color};border:2.5px solid ${isDark?'#1E1E1E':'white'};display:flex;align-items:center;justify-content:center;margin:0 auto;">${svgIcon}</div>
            <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${color};margin:-1px auto 0;"></div>
          </div>`,
          iconSize: [40, 48], iconAnchor: [20, 48],
        })
        const marker = L.marker([p.latitude, p.longitude], { icon })
        marker.bindPopup(`<div style="font-family:system-ui;min-width:220px;max-width:280px;">
          ${p.image_url ? `<img src="${p.image_url}" style="width:calc(100%+40px);height:120px;object-fit:cover;margin:-20px -20px 10px;border-radius:8px 8px 0 0;" onerror="this.style.display='none'" />` : ''}
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="width:10px;height:10px;border-radius:5px;background:${color};display:inline-block;"></span>
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:${color};">${t(cat?.label ?? '')}</span>
          </div>
          <div style="font-size:15px;font-weight:600;margin-bottom:4px;line-height:1.3;">${p.title}</div>
          ${p.description ? `<div style="font-size:12px;color:#6B7280;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.description.slice(0, 100)}</div>` : ''}
          ${p.location ? `<div style="font-size:11px;color:#9CA3AF;margin-bottom:2px;">📍 ${p.location}</div>` : ''}
          ${dist ? `<div style="font-size:11px;color:#9CA3AF;">🧭 ${dist}</div>` : ''}
          ${p.user ? `<div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid ${isDark ? '#333' : '#eee'};">
            ${p.user.avatar_url ? `<img src="${p.user.avatar_url}" style="width:22px;height:22px;border-radius:11px;border:1px solid ${isDark ? '#444' : '#ddd'};" onerror="this.style.display='none'" />` : ''}
            <span style="font-size:12px;color:#6B7280;">${p.user.name ?? ''}</span>
            ${p.user.naapurusto ? `<span style="font-size:10px;color:#9CA3AF;margin-left:auto;">${p.user.naapurusto}</span>` : ''}
          </div>` : ''}
          ${p.daily_fee ? `<div style="margin-top:6px;"><span style="background:#FDF6E8;color:#C98B2E;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;">${p.daily_fee} €/pv</span></div>` : ''}
          <a href="/post/${p.id}" style="display:block;margin-top:10px;background:${color};color:white;text-align:center;padding:8px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">Katso ilmoitus →</a>
        </div>`, { maxWidth: 300, autoPanPadding: [80, 60] })
        postCluster.addLayer(marker)
      })
      map.addLayer(postCluster)

      // ── Event markers ──
      events.forEach((e) => {
        if (!e.location_lat || !e.location_lng) return
        const day = new Date(e.event_date).getDate()
        const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], e.location_lat, e.location_lng)) : ''
        const dateStr = new Date(e.event_date).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })
        const attendeeBar = e.max_attendees && e.attendee_count != null
          ? `<div style="margin-top:6px;"><div style="display:flex;justify-content:space-between;font-size:10px;color:#6B7280;margin-bottom:2px;"><span>${e.attendee_count}/${e.max_attendees}</span><span>${Math.round((e.attendee_count/e.max_attendees)*100)}%</span></div><div style="height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden;"><div style="height:100%;width:${Math.min((e.attendee_count/e.max_attendees)*100,100)}%;background:${(e.attendee_count/e.max_attendees)>=0.9?'#dc2626':(e.attendee_count/e.max_attendees)>=0.7?'#d97706':'#2B8A62'};border-radius:2px;"></div></div></div>` : ''

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#1B9E6B,#3AE6A0);border:3px solid ${isDark?'#1E1E1E':'white'};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">
            <span style="color:white;font-size:14px;font-weight:700;">${day}</span>
          </div>`,
          iconSize: [38, 38], iconAnchor: [19, 19],
        })
        L.marker([e.location_lat, e.location_lng], { icon }).addTo(map)
          .bindPopup(`<div style="font-family:system-ui;min-width:200px;max-width:260px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#1B9E6B,#3AE6A0);display:flex;align-items:center;justify-content:center;color:white;font-size:16px;font-weight:700;">${day}</div>
              <div><div style="font-size:12px;color:#2B8A62;font-weight:500;">${dateStr}</div><div style="font-size:9px;text-transform:uppercase;color:#9CA3AF;">Tapahtuma</div></div>
            </div>
            <div style="font-size:15px;font-weight:600;margin-bottom:4px;">${e.title}</div>
            ${e.description ? `<div style="font-size:12px;color:#6B7280;margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${e.description}</div>` : ''}
            <div style="font-size:11px;color:#9CA3AF;">📅 ${dateStr}</div>
            ${e.location_name ? `<div style="font-size:11px;color:#9CA3AF;">📍 ${e.location_name}</div>` : ''}
            ${dist ? `<div style="font-size:11px;color:#9CA3AF;">🧭 ${dist}</div>` : ''}
            ${attendeeBar}
            <a href="/events?highlight=${e.id}" style="display:block;margin-top:10px;background:linear-gradient(135deg,#1B9E6B,#3AE6A0);color:white;text-align:center;padding:8px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">Katso tapahtuma →</a>
          </div>`, { maxWidth: 280 })
      })

      // ── City event markers ──
      cityEvents.forEach((ce) => {
        if (!ce.latitude || !ce.longitude) return
        const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], ce.latitude, ce.longitude)) : ''
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#3B7DD8,#6366F1);border:2.5px solid ${isDark?'#1E1E1E':'white'};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;font-size:14px;">🎵</div>`,
          iconSize: [36, 36], iconAnchor: [18, 18],
        })
        L.marker([ce.latitude, ce.longitude], { icon }).addTo(map)
          .bindPopup(`<div style="font-family:system-ui;min-width:200px;max-width:260px;">
            ${ce.image_url ? `<img src="${ce.image_url}" style="width:calc(100%+40px);height:100px;object-fit:cover;margin:-20px -20px 10px;border-radius:8px 8px 0 0;" onerror="this.style.display='none'" />` : ''}
            <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${ce.name_fi}</div>
            <div style="font-size:12px;color:#3B7DD8;">${new Date(ce.start_time).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            ${ce.location_name ? `<div style="font-size:11px;color:#9CA3AF;">📍 ${ce.location_name}</div>` : ''}
            ${dist ? `<div style="font-size:11px;color:#9CA3AF;">🧭 ${dist}</div>` : ''}
            ${ce.is_free ? '<div style="margin-top:4px;"><span style="background:#E8F7EF;color:#2B8A62;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;">✓ Ilmainen</span></div>' : ce.price_info ? `<div style="font-size:11px;color:#6B7280;margin-top:4px;">${ce.price_info}</div>` : ''}
            ${ce.info_url ? `<a href="${ce.info_url}" target="_blank" style="display:block;margin-top:10px;background:linear-gradient(135deg,#3B7DD8,#6366F1);color:white;text-align:center;padding:8px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">Lisätietoja →</a>` : ''}
          </div>`, { maxWidth: 280 })
      })

      // ── Place markers (clustered) ──
      const placeCluster = L.MarkerClusterGroup ? new L.MarkerClusterGroup({ maxClusterRadius: 60, spiderfyOnMaxZoom: true, iconCreateFunction: createClusterIcon('rgba(201,139,46,0.9)') }) : L.layerGroup()
      places.forEach((pl) => {
        if (!pl.latitude || !pl.longitude) return
        const placeEmoji = PLACE_ICONS[pl.category] ?? '📍'
        const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], pl.latitude, pl.longitude)) : ''
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:28px;height:34px;position:relative;cursor:pointer;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.2));">
            <div style="width:26px;height:26px;border-radius:6px;background:${isDark?'rgba(120,113,108,0.9)':'rgba(120,113,108,0.85)'};border:2px solid ${isDark?'#1E1E1E':'white'};display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:13px;">${placeEmoji}</div>
            <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid rgba(120,113,108,0.85);margin:-1px auto 0;"></div>
          </div>`,
          iconSize: [28, 34], iconAnchor: [14, 34],
        })
        const marker = L.marker([pl.latitude, pl.longitude], { icon })
        marker.bindPopup(`<div style="font-family:system-ui;min-width:180px;max-width:220px;">
          <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${pl.name}</div>
          ${pl.address ? `<div style="font-size:11px;color:#9CA3AF;">📍 ${pl.address}</div>` : ''}
          ${dist ? `<div style="font-size:11px;color:#9CA3AF;">🧭 ${dist}</div>` : ''}
          ${pl.opening_hours ? `<div style="font-size:10px;color:#9CA3AF;margin-top:2px;">🕐 ${pl.opening_hours}</div>` : ''}
          ${pl.phone ? `<div style="margin-top:4px;"><a href="tel:${pl.phone}" style="color:#3B7DD8;font-size:12px;">📞 ${pl.phone}</a></div>` : ''}
          ${pl.website ? `<a href="${pl.website}" target="_blank" rel="noopener" style="display:block;margin-top:6px;color:#3B7DD8;font-size:12px;">🌐 Verkkosivut</a>` : ''}
          <a href="https://www.google.com/maps/dir/?api=1&destination=${pl.latitude},${pl.longitude}" target="_blank" style="display:block;margin-top:8px;background:#78716C;color:white;text-align:center;padding:7px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;">Reittiohjeet →</a>
        </div>`, { maxWidth: 240 })
        placeCluster.addLayer(marker)
      })
      map.addLayer(placeCluster)

      // ── Fit bounds if we have markers ──
      const allLatLngs: [number, number][] = [
        ...posts.filter(p => p.latitude && p.longitude).map(p => [p.latitude!, p.longitude!] as [number, number]),
        ...events.filter(e => e.location_lat && e.location_lng).map(e => [e.location_lat!, e.location_lng!] as [number, number]),
        ...cityEvents.filter(c => c.latitude && c.longitude).map(c => [c.latitude!, c.longitude!] as [number, number]),
      ]
      if (allLatLngs.length > 2) {
        try { map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40], maxZoom: 15 }) } catch {}
      }

      mapInstanceRef.current = map
    })

    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null } }
  }, [posts, events, cityEvents, places, userPos, radiusKm, isDark, t])

  useEffect(() => {
    if (!selectedArea || !mapInstanceRef.current) return
    const coords = NEIGHBORHOOD_COORDS[selectedArea]
    if (coords) mapInstanceRef.current.flyTo(coords, 15, { duration: 1 })
  }, [selectedArea])

  if (Platform.OS !== 'web') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Kartta vaatii web-ympäristön</Text></View>
  return <div ref={mapRef as any} style={{ width: '100%', height: '100%' }} />
}

// ── Main Screen ──
export default function MapScreen() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [posts, setPosts] = useState<Post[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([])
  const [places, setPlaces] = useState<LocalPlace[]>([])
  const [loading, setLoading] = useState(true)

  const [showPosts, setShowPosts] = useState(true)
  const [showEvents, setShowEvents] = useState(true)
  const [showPlaces, setShowPlaces] = useState(true)
  const [postFilter, setPostFilter] = useState<PostType | null>(null)
  const [placeFilter, setPlaceFilter] = useState<string | null>(null)
  const [eventSource, setEventSource] = useState<'all' | 'community' | 'city'>('all')
  const [selectedArea, setSelectedArea] = useState<string | null>(null)
  const [showAreaPicker, setShowAreaPicker] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [radiusKm, setRadiusKm] = useState<number | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [cityEventCategory, setCityEventCategory] = useState<string | null>(null)
  const [savedPlaceIds, setSavedPlaceIds] = useState<Set<string>>(new Set())
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search 200ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery])

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()

      const [postsRes, eventsRes, cityRes, placesRes] = await Promise.allSettled([
        supabase.from('posts')
          .select('id, type, title, description, location, latitude, longitude, image_url, daily_fee, user:profiles!posts_user_id_fkey(id, name, avatar_url, naapurusto)')
          .eq('is_active', true)
          .not('latitude', 'is', null)
          .limit(200),
        supabase.from('events')
          .select('id, title, description, event_date, location_name, location_lat, location_lng, icon, max_attendees, creator:profiles!events_creator_id_fkey(id, name, avatar_url)')
          .eq('is_active', true)
          .limit(200),
        supabase.from('city_events')
          .select('id, name_fi, name_en, name_sv, description_fi, start_time, end_time, location_name, location_address, latitude, longitude, image_url, info_url, category, is_free, price_info, organizer')
          .limit(200),
        supabase.from('local_places')
          .select('id, name, category, subcategory, address, latitude, longitude, phone, website, opening_hours, image_url, neighborhood, tags')
          .limit(500),
      ])

      setPosts(postsRes.status === 'fulfilled' ? (postsRes.value.data ?? []) as unknown as Post[] : [])
      setEvents(eventsRes.status === 'fulfilled' ? (eventsRes.value.data ?? []) as unknown as Event[] : [])
      setCityEvents(cityRes.status === 'fulfilled' ? (cityRes.value.data ?? []) as unknown as CityEvent[] : [])
      setPlaces(placesRes.status === 'fulfilled' ? (placesRes.value.data ?? []) as unknown as LocalPlace[] : [])

      // Fetch saved places
      if (user) {
        const { data: saved } = await supabase.from('saved_places').select('place_id').eq('user_id', user.id)
        if (saved) setSavedPlaceIds(new Set(saved.map((s: any) => s.place_id)))
      }

      setLoading(false)
    }
    fetchData()
  }, [supabase])

  // GPS
  const handleGeolocate = useCallback(() => {
    if (geoLoading) return
    if (userPos) {
      setRadiusKm(prev => prev ? null : 0.5)
      return
    }
    setGeoLoading(true)
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { setUserPos([pos.coords.latitude, pos.coords.longitude]); setRadiusKm(0.5); setGeoLoading(false) },
        () => { setGeoLoading(false) },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    } else { setGeoLoading(false) }
  }, [geoLoading, userPos])

  // ── Filtering chains (matching web logic) ──

  // 1. Posts: category + search + radius
  const filteredPosts = useMemo(() => {
    if (!showPosts) return []
    let p = posts
    if (postFilter) p = p.filter(x => x.type === postFilter)
    if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); p = p.filter(x => x.title.toLowerCase().includes(q) || x.location?.toLowerCase().includes(q)) }
    if (userPos && radiusKm) p = p.filter(x => x.latitude && x.longitude && haversineKm(userPos[0], userPos[1], x.latitude, x.longitude) <= radiusKm)
    return p
  }, [posts, showPosts, postFilter, debouncedSearch, userPos, radiusKm])

  // 2. Community events: source + search + radius
  const filteredEvents = useMemo(() => {
    if (!showEvents || eventSource === 'city') return []
    let e = events
    if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); e = e.filter(x => x.title.toLowerCase().includes(q) || x.location_name?.toLowerCase().includes(q)) }
    if (userPos && radiusKm) e = e.filter(x => x.location_lat && x.location_lng && haversineKm(userPos[0], userPos[1], x.location_lat, x.location_lng) <= radiusKm)
    return e
  }, [events, showEvents, eventSource, debouncedSearch, userPos, radiusKm])

  // 3. City events: source + category + search + radius
  const filteredCityEvents = useMemo(() => {
    if (!showEvents || eventSource === 'community') return []
    let c = cityEvents
    if (cityEventCategory) c = c.filter(x => x.category === cityEventCategory)
    if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); c = c.filter(x => x.name_fi.toLowerCase().includes(q) || x.location_name?.toLowerCase().includes(q)) }
    if (userPos && radiusKm) c = c.filter(x => x.latitude && x.longitude && haversineKm(userPos[0], userPos[1], x.latitude!, x.longitude!) <= radiusKm)
    return c
  }, [cityEvents, showEvents, eventSource, cityEventCategory, debouncedSearch, userPos, radiusKm])

  // 4. Places: category + search + radius
  const filteredPlaces = useMemo(() => {
    if (!showPlaces) return []
    let p = places
    if (placeFilter) p = p.filter(x => x.category === placeFilter)
    if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); p = p.filter(x => x.name.toLowerCase().includes(q) || x.address?.toLowerCase().includes(q)) }
    if (userPos && radiusKm) p = p.filter(x => haversineKm(userPos[0], userPos[1], x.latitude, x.longitude) <= radiusKm)
    return p
  }, [places, showPlaces, placeFilter, debouncedSearch, userPos, radiusKm])

  // 5. Layer count badges
  const layerCounts = useMemo(() => ({
    posts: filteredPosts.length,
    events: filteredEvents.length + filteredCityEvents.length,
    places: filteredPlaces.length,
  }), [filteredPosts.length, filteredEvents.length, filteredCityEvents.length, filteredPlaces.length])

  const totalVisible = layerCounts.posts + layerCounts.events + layerCounts.places

  // 6. City event category counts
  const cityEventCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const source = eventSource === 'community' ? [] : cityEvents
    for (const ce of source) {
      if (userPos && radiusKm && ce.latitude && ce.longitude && haversineKm(userPos[0], userPos[1], ce.latitude, ce.longitude) > radiusKm) continue
      counts[ce.category] = (counts[ce.category] ?? 0) + 1
    }
    return counts
  }, [cityEvents, eventSource, userPos, radiusKm])

  return (
    <View style={[ms.container, { backgroundColor: colors.background }]}>
      <View style={ms.mapWrap}>
        {loading ? <View style={ms.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View> : (
          <LeafletMap posts={filteredPosts} events={filteredEvents} cityEvents={filteredCityEvents} places={filteredPlaces} selectedArea={selectedArea} userPos={userPos} radiusKm={radiusKm} isDark={isDark} t={t} />
        )}
      </View>

      {/* Top bar */}
      <View style={[ms.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} style={[ms.topBtn, { backgroundColor: colors.card }]}><ArrowLeft size={20} color={colors.foreground} /></Pressable>
        <Pressable onPress={() => { setShowAreaPicker(!showAreaPicker); setShowSearch(false) }} style={[ms.areaBtn, { backgroundColor: colors.card }]}>
          <Navigation size={14} color={colors.primary} />
          <Text style={[ms.areaBtnText, { color: colors.foreground }]} numberOfLines={1}>{selectedArea ?? t('map.allHelsinki')}</Text>
          <ChevronDown size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable onPress={() => { setShowSearch(!showSearch); setShowAreaPicker(false) }} style={[ms.topBtn, { backgroundColor: colors.card }]}><Search size={20} color={colors.foreground} /></Pressable>
      </View>

      {/* Layer pills */}
      <View style={[ms.layerBar, { top: insets.top + 52 }]}>
        <Pressable onPress={() => setShowPosts(!showPosts)} style={[ms.layerPill, { backgroundColor: showPosts ? colors.primary : colors.card }]}>
          <Newspaper size={14} color={showPosts ? '#FFF' : colors.mutedForeground} />
          <Text style={[ms.layerPillText, { color: showPosts ? '#FFF' : colors.mutedForeground }]}>{t('map.layerPosts')}</Text>
          <View style={[ms.layerBadge, { backgroundColor: showPosts ? 'rgba(255,255,255,0.3)' : colors.muted }]}><Text style={[ms.layerBadgeText, { color: showPosts ? '#FFF' : colors.mutedForeground }]}>{filteredPosts.length}</Text></View>
        </Pressable>
        <Pressable onPress={() => setShowEvents(!showEvents)} style={[ms.layerPill, { backgroundColor: showEvents ? '#2B8A62' : colors.card }]}>
          <CalendarDays size={14} color={showEvents ? '#FFF' : colors.mutedForeground} />
          <Text style={[ms.layerPillText, { color: showEvents ? '#FFF' : colors.mutedForeground }]}>{t('map.layerEvents')}</Text>
          <View style={[ms.layerBadge, { backgroundColor: showEvents ? 'rgba(255,255,255,0.3)' : colors.muted }]}><Text style={[ms.layerBadgeText, { color: showEvents ? '#FFF' : colors.mutedForeground }]}>{filteredEvents.length + filteredCityEvents.length}</Text></View>
        </Pressable>
        <Pressable onPress={() => setShowPlaces(!showPlaces)} style={[ms.layerPill, { backgroundColor: showPlaces ? '#78716C' : colors.card }]}>
          <Coffee size={14} color={showPlaces ? '#FFF' : colors.mutedForeground} />
          <Text style={[ms.layerPillText, { color: showPlaces ? '#FFF' : colors.mutedForeground }]}>{t('map.layerPlaces')}</Text>
          <View style={[ms.layerBadge, { backgroundColor: showPlaces ? 'rgba(255,255,255,0.3)' : colors.muted }]}><Text style={[ms.layerBadgeText, { color: showPlaces ? '#FFF' : colors.mutedForeground }]}>{filteredPlaces.length}</Text></View>
        </Pressable>
      </View>

      {/* Expand sub-filters */}
      <Pressable onPress={() => setFiltersExpanded(!filtersExpanded)} style={[ms.expandBtn, { top: insets.top + 92, backgroundColor: colors.card }]}>
        {filtersExpanded ? <ChevronUp size={14} color={colors.mutedForeground} /> : <ChevronDown size={14} color={colors.mutedForeground} />}
      </Pressable>

      {/* Sub-filters panel */}
      {filtersExpanded && (
        <View style={[ms.subPanel, { top: insets.top + 92, backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Post type filter */}
          {showPosts && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ms.subRow}>
              <Pressable onPress={() => setPostFilter(null)} style={[ms.subChip, !postFilter ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted }]}>
                <Text style={[ms.subChipText, { color: !postFilter ? '#FFF' : colors.mutedForeground }]}>{t('common.all')}</Text>
              </Pressable>
              {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).map(([type, cat]) => (
                <Pressable key={type} onPress={() => setPostFilter(postFilter === type ? null : type)} style={[ms.subChip, postFilter === type ? { backgroundColor: cat.color } : { backgroundColor: colors.muted }]}>
                  <Text style={[ms.subChipText, { color: postFilter === type ? '#FFF' : colors.mutedForeground }]}>{t(cat.label)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {/* Event source filter */}
          {showEvents && (
            <View style={[ms.subRow, { marginTop: 8 }]}>
              {(['all', 'community', 'city'] as const).map(src => (
                <Pressable key={src} onPress={() => setEventSource(src)} style={[ms.subChip, eventSource === src ? { backgroundColor: '#2B8A62' } : { backgroundColor: colors.muted }]}>
                  <Text style={[ms.subChipText, { color: eventSource === src ? '#FFF' : colors.mutedForeground }]}>
                    {src === 'all' ? t('common.all') : src === 'community' ? t('events.communityTab') : 'Helsinki'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {/* City event category filter */}
          {showEvents && (eventSource === 'all' || eventSource === 'city') && Object.keys(cityEventCategoryCounts).length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[ms.subRow, { marginTop: 8 }]}>
              <Pressable onPress={() => setCityEventCategory(null)} style={[ms.subChip, !cityEventCategory ? { backgroundColor: '#3B7DD8' } : { backgroundColor: colors.muted }]}>
                <Text style={[ms.subChipText, { color: !cityEventCategory ? '#FFF' : colors.mutedForeground }]}>{t('common.all')}</Text>
              </Pressable>
              {Object.entries(cityEventCategoryCounts).map(([cat, count]) => (
                <Pressable key={cat} onPress={() => setCityEventCategory(cityEventCategory === cat ? null : cat)} style={[ms.subChip, cityEventCategory === cat ? { backgroundColor: '#3B7DD8' } : { backgroundColor: colors.muted }]}>
                  <Text style={[ms.subChipText, { color: cityEventCategory === cat ? '#FFF' : colors.mutedForeground }]}>{cat} ({count})</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {/* Place category filter */}
          {showPlaces && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[ms.subRow, { marginTop: 8 }]}>
              {PLACE_CATEGORIES.map(({ key, label }) => (
                <Pressable key={key ?? 'all'} onPress={() => setPlaceFilter(key)} style={[ms.subChip, placeFilter === key ? { backgroundColor: '#78716C' } : { backgroundColor: colors.muted }]}>
                  <Text style={[ms.subChipText, { color: placeFilter === key ? '#FFF' : colors.mutedForeground }]}>{t(label)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Area picker */}
      {showAreaPicker && (
        <View style={[ms.dropdown, { top: insets.top + 52, backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
            <Pressable onPress={() => { setSelectedArea(null); setShowAreaPicker(false) }} style={ms.dropdownItem}>
              <Text style={[ms.dropdownText, { color: colors.foreground, fontWeight: !selectedArea ? '700' : '400' }]}>Helsinki ({t('common.all')})</Text>
            </Pressable>
            {NEIGHBORHOODS.map((nh) => (
              <Pressable key={nh} onPress={() => { setSelectedArea(nh); setShowAreaPicker(false) }} style={ms.dropdownItem}>
                <Text style={[ms.dropdownText, { color: colors.foreground, fontWeight: selectedArea === nh ? '700' : '400' }]}>{nh}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Search */}
      {showSearch && (
        <View style={[ms.searchOverlay, { top: insets.top + 52, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Search size={16} color={colors.mutedForeground} />
          <TextInput style={[ms.searchInput, { color: colors.foreground }]} value={searchQuery} onChangeText={setSearchQuery} placeholder={t('feed.searchPlaceholder')} placeholderTextColor={colors.mutedForeground} autoFocus />
          {searchQuery.length > 0 && <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><X size={16} color={colors.mutedForeground} /></Pressable>}
        </View>
      )}

      {/* GPS button */}
      <Pressable onPress={handleGeolocate} disabled={geoLoading} style={[ms.gpsBtn, { bottom: insets.bottom + 80, backgroundColor: userPos ? colors.primary : colors.card }]}>
        {geoLoading ? <Loader2 size={20} color={colors.foreground} /> : <Crosshair size={20} color={userPos ? '#FFF' : colors.foreground} />}
      </Pressable>

      {/* Radius slider (when GPS active) */}
      {userPos && radiusKm && (
        <View style={[ms.radiusBar, { bottom: insets.bottom + 130, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[ms.radiusText, { color: colors.foreground }]}>{t('map.radius')}: {radiusKm} km</Text>
          <View style={ms.radiusBtns}>
            {[0.5, 1, 2, 3, 5].map(r => (
              <Pressable key={r} onPress={() => setRadiusKm(r)} style={[ms.radiusChip, radiusKm === r ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted }]}>
                <Text style={[ms.radiusChipText, { color: radiusKm === r ? '#FFF' : colors.mutedForeground }]}>{r}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Count bar */}
      <View style={[ms.countBar, { bottom: insets.bottom + 24, backgroundColor: colors.card, borderColor: colors.border }]}>
        <MapPin size={14} color={colors.mutedForeground} />
        <Text style={[ms.countText, { color: colors.foreground }]}>{totalVisible} {t('map.visible')}</Text>
      </View>
    </View>
  )
}

const ms = StyleSheet.create({
  container: { flex: 1 },
  mapWrap: { ...StyleSheet.absoluteFillObject },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  topBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  areaBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 12, paddingHorizontal: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  areaBtnText: { fontSize: 14, fontWeight: '600', flex: 1 },
  layerBar: { position: 'absolute', left: 12, right: 12, zIndex: 10, flexDirection: 'row', gap: 6 },
  layerPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 36, borderRadius: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  layerPillText: { fontSize: 11, fontWeight: '600' },
  layerBadge: { minWidth: 20, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  layerBadgeText: { fontSize: 10, fontWeight: '700' },
  expandBtn: { position: 'absolute', alignSelf: 'center', zIndex: 10, width: 28, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  subPanel: { position: 'absolute', left: 12, right: 12, zIndex: 9, borderRadius: 12, borderWidth: 1, padding: 10, paddingTop: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  subRow: { flexDirection: 'row', gap: 6 },
  subChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  subChipText: { fontSize: 11, fontWeight: '500' },
  dropdown: { position: 'absolute', left: 12, right: 12, zIndex: 20, borderRadius: 12, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 12 },
  dropdownText: { fontSize: 14 },
  searchOverlay: { position: 'absolute', left: 12, right: 12, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 44, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  searchInput: { flex: 1, fontSize: 14 },
  gpsBtn: { position: 'absolute', right: 12, zIndex: 10, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  radiusBar: { position: 'absolute', left: 60, right: 60, zIndex: 10, borderRadius: 12, borderWidth: 1, padding: 10, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3 },
  radiusText: { fontSize: 12, fontWeight: '600' },
  radiusBtns: { flexDirection: 'row', gap: 6 },
  radiusChip: { width: 32, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  radiusChipText: { fontSize: 11, fontWeight: '600' },
  countBar: { position: 'absolute', left: 60, right: 60, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 18, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: -1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3 },
  countText: { fontSize: 13, fontWeight: '500' },
})
