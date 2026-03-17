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

// Helsinki municipal bounds — must match backend HELSINKI_BOUNDS in geo.ts
const HKI = { south: 60.14, north: 60.29, west: 24.83, east: 25.22 } as const
const isInHelsinki = (lat: number, lng: number) =>
  lat >= HKI.south && lat <= HKI.north && lng >= HKI.west && lng <= HKI.east

/** Escape HTML entities to prevent XSS in Leaflet popup content */
function esc(str: string | null | undefined): string {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Validate URL scheme — only allow http/https in popup links */
function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try { const p = new URL(url); return (p.protocol === 'http:' || p.protocol === 'https:') ? url : null }
  catch { return null }
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

// City event category config matching web exactly
const CITY_EVENT_CATS: Record<string, { color: string; icon: string }> = {
  culture: { color: '#8E44AD', icon: 'Palette' },
  music: { color: '#E91E63', icon: 'Music' },
  sport: { color: '#27AE60', icon: 'Dumbbell' },
  family: { color: '#FF9800', icon: 'Users' },
  food: { color: '#E74C3C', icon: 'UtensilsCrossed' },
  nature: { color: '#4CAF50', icon: 'Leaf' },
  education: { color: '#2196F3', icon: 'GraduationCap' },
  theatre: { color: '#9C27B0', icon: 'Drama' },
  exhibition: { color: '#795548', icon: 'Frame' },
  festival: { color: '#FF5722', icon: 'PartyPopper' },
  market: { color: '#FF9800', icon: 'Store' },
  other: { color: '#607D8B', icon: 'CalendarDays' },
}

// Lucide SVG paths for markers (white stroke, matching web's MARKER_SVG)
const MARKER_SVG: Record<string, string> = {
  HandHelping: '<path d="M11 12h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 14"/><path d="m7 18 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 13 6 6"/>',
  Gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  Heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  Zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  BookOpen: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  CalendarDays: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  Music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  Dumbbell: '<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>',
  Users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  UtensilsCrossed: '<path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8"/><path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7"/><path d="m2.1 21.8 6.4-6.3"/><path d="m19 5-7 7"/>',
  Leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  GraduationCap: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  Drama: '<path d="M10 11h.01"/><path d="M14 6h.01"/><path d="M18 6h.01"/><path d="M6.5 13.1h.01"/><path d="M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3"/><path d="M17.4 12.9c-.8 6-2.7 8.1-4.2 9.1-1 .6-2.4-.3-2.6-1.5a43.7 43.7 0 0 1-.4-5.5"/><path d="M2 5c0 9 4 12 6 12s6-3 6-12c0-2-2-3-6-3S2 3 2 5"/>',
  Frame: '<line x1="22" x2="2" y1="6" y2="6"/><line x1="22" x2="2" y1="18" y2="18"/><line x1="6" x2="6" y1="2" y2="22"/><line x1="18" x2="18" y1="2" y2="22"/>',
  PartyPopper: '<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/>',
  Store: '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/>',
  Palette: '<circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
  Coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
  MapPin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
}

function svgMarker(iconName: string, size: number): string {
  const paths = MARKER_SVG[iconName]
  if (paths) return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>`
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
function LeafletMap({ posts, events, cityEvents, places, selectedArea, userPos, radiusKm, flyTo, onMapInteraction, isDark, t }: {
  posts: Post[]; events: Event[]; cityEvents: CityEvent[]; places: LocalPlace[]
  selectedArea: string | null; userPos: [number, number] | null; radiusKm: number | null
  flyTo: { lat: number; lng: number; zoom: number } | null
  onMapInteraction?: () => void
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
        const catIconName = cat?.icon ?? 'MapPin'
        const svgIcon = svgMarker(catIconName, 16)
        const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], p.latitude, p.longitude)) : ''
        const bdr = isDark ? '#121212' : 'white'

        const icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:36px;height:44px">
            <div style="position:absolute;top:0;left:1px;width:34px;height:34px;border-radius:50%;background:${color};border:2.5px solid ${bdr};display:flex;align-items:center;justify-content:center">${svgIcon}</div>
            <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:7px solid ${bdr}"></div>
          </div>`,
          iconSize: [36, 44], iconAnchor: [18, 44],
        })
        const marker = L.marker([p.latitude, p.longitude], { icon })
        marker.bindPopup(`<div style="font-family:system-ui;min-width:220px;max-width:280px;">
          ${p.image_url ? `<img src="${esc(p.image_url)}" style="width:calc(100%+40px);height:120px;object-fit:cover;margin:-20px -20px 10px;border-radius:8px 8px 0 0;" onerror="this.style.display='none'" />` : ''}
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <span style="width:10px;height:10px;border-radius:5px;background:${color};display:inline-block;"></span>
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:${color};">${esc(t(cat?.label ?? ''))}</span>
          </div>
          <div style="font-size:15px;font-weight:600;margin-bottom:4px;line-height:1.3;">${esc(p.title)}</div>
          ${p.description ? `<div style="font-size:12px;color:#6B7280;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.description.slice(0, 100))}</div>` : ''}
          ${p.location ? `<div style="font-size:11px;color:#9CA3AF;margin-bottom:2px;">📍 ${esc(p.location)}</div>` : ''}
          ${dist ? `<div style="font-size:11px;color:#9CA3AF;">🧭 ${dist}</div>` : ''}
          ${p.user ? `<div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid ${isDark ? '#333' : '#eee'};">
            ${p.user.avatar_url ? `<img src="${esc(p.user.avatar_url)}" style="width:22px;height:22px;border-radius:11px;border:1px solid ${isDark ? '#444' : '#ddd'};" onerror="this.style.display='none'" />` : ''}
            <span style="font-size:12px;color:#6B7280;">${esc(p.user.name ?? '')}</span>
            ${p.user.naapurusto ? `<span style="font-size:10px;color:#9CA3AF;margin-left:auto;">${esc(p.user.naapurusto)}</span>` : ''}
          </div>` : ''}
          ${p.daily_fee ? `<div style="margin-top:6px;"><span style="background:#FDF6E8;color:#C98B2E;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;">${p.daily_fee} €/pv</span></div>` : ''}
          <a href="/post/${esc(p.id)}" style="display:block;margin-top:10px;background:${color};color:white;text-align:center;padding:8px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">Katso ilmoitus →</a>
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

        const calSvg = svgMarker('CalendarDays', 18)
        const bdr = isDark ? '#121212' : 'white'
        const icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:36px;height:44px">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#1B9E6B,#3AE6A0);border:2.5px solid ${bdr};display:flex;align-items:center;justify-content:center">${calSvg}</div>
            <div style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${bdr}"></div>
          </div>`,
          iconSize: [36, 44], iconAnchor: [18, 44],
        })
        L.marker([e.location_lat, e.location_lng], { icon }).addTo(map)
          .bindPopup(`<div style="font-family:system-ui;min-width:200px;max-width:260px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#1B9E6B,#3AE6A0);display:flex;align-items:center;justify-content:center;color:white;font-size:16px;font-weight:700;">${day}</div>
              <div><div style="font-size:12px;color:#2B8A62;font-weight:500;">${dateStr}</div><div style="font-size:9px;text-transform:uppercase;color:#9CA3AF;">Tapahtuma</div></div>
            </div>
            <div style="font-size:15px;font-weight:600;margin-bottom:4px;">${esc(e.title)}</div>
            ${e.description ? `<div style="font-size:12px;color:#6B7280;margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(e.description)}</div>` : ''}
            <div style="font-size:11px;color:#9CA3AF;">📅 ${dateStr}</div>
            ${e.location_name ? `<div style="font-size:11px;color:#9CA3AF;">📍 ${esc(e.location_name)}</div>` : ''}
            ${dist ? `<div style="font-size:11px;color:#9CA3AF;">🧭 ${dist}</div>` : ''}
            ${attendeeBar}
            <a href="/events?highlight=${esc(e.id)}" style="display:block;margin-top:10px;background:linear-gradient(135deg,#1B9E6B,#3AE6A0);color:white;text-align:center;padding:8px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">Katso tapahtuma →</a>
          </div>`, { maxWidth: 280 })
      })

      // ── City event markers (clustered) ──
      const cityCluster = L.MarkerClusterGroup ? new L.MarkerClusterGroup({ maxClusterRadius: 45, spiderfyOnMaxZoom: true, iconCreateFunction: createClusterIcon('rgba(142,68,173,0.9)') }) : L.layerGroup()
      cityEvents.forEach((ce) => {
        if (!ce.latitude || !ce.longitude) return
        const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], ce.latitude, ce.longitude)) : ''
        const catCfg = CITY_EVENT_CATS[ce.category] ?? CITY_EVENT_CATS.other
        const catColor = catCfg.color
        const catSvg = svgMarker(catCfg.icon, 16)
        const bdr = isDark ? '#121212' : 'white'
        const icon = L.divIcon({
          className: '',
          html: `<div style="position:relative;width:36px;height:44px">
            <div style="width:36px;height:36px;border-radius:14px;background:linear-gradient(135deg,${catColor},${catColor}dd);border:2.5px solid ${bdr};display:flex;align-items:center;justify-content:center">${catSvg}</div>
            <div style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${bdr}"></div>
          </div>`,
          iconSize: [36, 44], iconAnchor: [18, 44],
        })
        const ceMarker = L.marker([ce.latitude, ce.longitude], { icon })
        const ceInfoUrl = safeUrl(ce.info_url)
        ceMarker
          .bindPopup(`<div style="font-family:system-ui;min-width:200px;max-width:260px;">
            ${ce.image_url ? `<img src="${esc(ce.image_url)}" style="width:calc(100%+40px);height:100px;object-fit:cover;margin:-20px -20px 10px;border-radius:8px 8px 0 0;" onerror="this.style.display='none'" />` : ''}
            <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${esc(ce.name_fi)}</div>
            <div style="font-size:12px;color:#3B7DD8;">${new Date(ce.start_time).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            ${ce.location_name ? `<div style="font-size:11px;color:#9CA3AF;">📍 ${esc(ce.location_name)}</div>` : ''}
            ${dist ? `<div style="font-size:11px;color:#9CA3AF;">🧭 ${dist}</div>` : ''}
            ${ce.is_free ? '<div style="margin-top:4px;"><span style="background:#E8F7EF;color:#2B8A62;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;">✓ Ilmainen</span></div>' : ce.price_info ? `<div style="font-size:11px;color:#6B7280;margin-top:4px;">${esc(ce.price_info)}</div>` : ''}
            ${ceInfoUrl ? `<a href="${esc(ceInfoUrl)}" target="_blank" rel="noopener" style="display:block;margin-top:10px;background:linear-gradient(135deg,#3B7DD8,#6366F1);color:white;text-align:center;padding:8px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">Lisätietoja →</a>` : ''}
          </div>`, { maxWidth: 280 })
        cityCluster.addLayer(ceMarker)
      })
      map.addLayer(cityCluster)

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
        const plWebsite = safeUrl(pl.website)
        marker.bindPopup(`<div style="font-family:system-ui;min-width:180px;max-width:220px;">
          <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${esc(pl.name)}</div>
          ${pl.address ? `<div style="font-size:11px;color:#9CA3AF;">📍 ${esc(pl.address)}</div>` : ''}
          ${dist ? `<div style="font-size:11px;color:#9CA3AF;">🧭 ${dist}</div>` : ''}
          ${pl.opening_hours ? `<div style="font-size:10px;color:#9CA3AF;margin-top:2px;">🕐 ${esc(pl.opening_hours)}</div>` : ''}
          ${pl.phone ? `<div style="margin-top:4px;"><a href="tel:${esc(pl.phone)}" style="color:#3B7DD8;font-size:12px;">📞 ${esc(pl.phone)}</a></div>` : ''}
          ${plWebsite ? `<a href="${esc(plWebsite)}" target="_blank" rel="noopener" style="display:block;margin-top:6px;color:#3B7DD8;font-size:12px;">🌐 Verkkosivut</a>` : ''}
          <a href="https://www.google.com/maps/dir/?api=1&amp;destination=${pl.latitude},${pl.longitude}" target="_blank" rel="noopener" style="display:block;margin-top:8px;background:#78716C;color:white;text-align:center;padding:7px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;">Reittiohjeet →</a>
        </div>`, { maxWidth: 240 })
        placeCluster.addLayer(marker)
      })
      map.addLayer(placeCluster)

      // ── Fit bounds — restrict to Helsinki metro area ──
      const allLatLngs: [number, number][] = [
        ...posts.filter(p => p.latitude && p.longitude && isInHelsinki(p.latitude, p.longitude)).map(p => [p.latitude!, p.longitude!] as [number, number]),
        ...events.filter(e => e.location_lat && e.location_lng && isInHelsinki(e.location_lat, e.location_lng)).map(e => [e.location_lat!, e.location_lng!] as [number, number]),
        ...cityEvents.filter(c => c.latitude && c.longitude && isInHelsinki(c.latitude!, c.longitude!)).map(c => [c.latitude!, c.longitude!] as [number, number]),
        ...places.filter(p => isInHelsinki(p.latitude, p.longitude)).slice(0, 50).map(p => [p.latitude, p.longitude] as [number, number]),
      ]
      if (allLatLngs.length > 2) {
        try { map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40], maxZoom: 14 }) } catch {}
      }

      mapInstanceRef.current = map
    })

    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null } }
  }, [posts, events, cityEvents, places, userPos, radiusKm, isDark, t])

  // Fly to selected area
  useEffect(() => {
    if (!selectedArea || !mapInstanceRef.current) return
    const coords = NEIGHBORHOOD_COORDS[selectedArea]
    if (coords) mapInstanceRef.current.flyTo(coords, 15, { duration: 1 })
  }, [selectedArea])

  // Fly to search result
  useEffect(() => {
    if (!flyTo || !mapInstanceRef.current) return
    mapInstanceRef.current.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom, { duration: 1 })
  }, [flyTo])

  // Collapse filters on map interaction
  useEffect(() => {
    if (!mapInstanceRef.current || !onMapInteraction) return
    const map = mapInstanceRef.current
    const handler = () => onMapInteraction()
    map.on('movestart', handler)
    map.on('zoomstart', handler)
    return () => { map.off('movestart', handler); map.off('zoomstart', handler) }
  }, [onMapInteraction])

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
  const [showAllPlaceCats, setShowAllPlaceCats] = useState(false)
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom: number } | null>(null)
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
          .not('longitude', 'is', null)
          .limit(200),
        supabase.from('events')
          .select('id, title, description, event_date, location_name, location_lat, location_lng, icon, max_attendees, creator:profiles!events_creator_id_fkey(id, name, avatar_url)')
          .eq('is_active', true)
          .gte('event_date', new Date().toISOString())
          .not('location_lat', 'is', null)
          .not('location_lng', 'is', null)
          .limit(200),
        supabase.from('city_events')
          .select('id, name_fi, name_en, name_sv, description_fi, start_time, end_time, location_name, location_address, latitude, longitude, image_url, info_url, category, is_free, price_info, organizer')
          .gte('start_time', new Date().toISOString())
          .gte('latitude', HKI.south).lte('latitude', HKI.north)
          .gte('longitude', HKI.west).lte('longitude', HKI.east)
          .limit(200),
        supabase.from('local_places')
          .select('id, name, category, subcategory, address, latitude, longitude, phone, website, opening_hours, image_url, neighborhood, tags')
          .gte('latitude', HKI.south).lte('latitude', HKI.north)
          .gte('longitude', HKI.west).lte('longitude', HKI.east)
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
    let p = posts.filter(x => x.latitude && x.longitude && isInHelsinki(x.latitude, x.longitude))
    if (postFilter) p = p.filter(x => x.type === postFilter)
    if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); p = p.filter(x => x.title.toLowerCase().includes(q) || x.location?.toLowerCase().includes(q)) }
    if (userPos && radiusKm) p = p.filter(x => x.latitude && x.longitude && haversineKm(userPos[0], userPos[1], x.latitude, x.longitude) <= radiusKm)
    return p
  }, [posts, showPosts, postFilter, debouncedSearch, userPos, radiusKm])

  // 2. Community events: source + search + radius
  const filteredEvents = useMemo(() => {
    if (!showEvents || eventSource === 'city') return []
    let e = events.filter(x => x.location_lat && x.location_lng && isInHelsinki(x.location_lat, x.location_lng))
    if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); e = e.filter(x => x.title.toLowerCase().includes(q) || x.location_name?.toLowerCase().includes(q)) }
    if (userPos && radiusKm) e = e.filter(x => x.location_lat && x.location_lng && haversineKm(userPos[0], userPos[1], x.location_lat, x.location_lng) <= radiusKm)
    return e
  }, [events, showEvents, eventSource, debouncedSearch, userPos, radiusKm])

  // 3. City events: source + category + search + radius + Helsinki only
  const filteredCityEvents = useMemo(() => {
    if (!showEvents || eventSource === 'community') return []
    let c = cityEvents.filter(x => x.latitude && x.longitude && isInHelsinki(x.latitude!, x.longitude!))
    if (cityEventCategory) c = c.filter(x => x.category === cityEventCategory)
    if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); c = c.filter(x => x.name_fi.toLowerCase().includes(q) || x.location_name?.toLowerCase().includes(q)) }
    if (userPos && radiusKm) c = c.filter(x => x.latitude && x.longitude && haversineKm(userPos[0], userPos[1], x.latitude!, x.longitude!) <= radiusKm)
    return c
  }, [cityEvents, showEvents, eventSource, cityEventCategory, debouncedSearch, userPos, radiusKm])

  // 4. Places: category + search + radius
  const filteredPlaces = useMemo(() => {
    if (!showPlaces) return []
    let p = places.filter(x => isInHelsinki(x.latitude, x.longitude))
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

  // 6. Search results for fly-to (max 8)
  const searchResults = useMemo(() => {
    if (!debouncedSearch || debouncedSearch.length < 2) return []
    const q = debouncedSearch.toLowerCase()
    const results: { type: string; name: string; lat: number; lng: number; category?: string }[] = []
    for (const p of filteredPosts) {
      if (results.length >= 8) break
      if (p.latitude && p.longitude && (p.title.toLowerCase().includes(q) || p.location?.toLowerCase().includes(q))) {
        results.push({ type: 'post', name: p.title, lat: p.latitude, lng: p.longitude, category: p.type })
      }
    }
    for (const e of filteredEvents) {
      if (results.length >= 8) break
      if (e.location_lat && e.location_lng && (e.title.toLowerCase().includes(q) || e.location_name?.toLowerCase().includes(q))) {
        results.push({ type: 'event', name: e.title, lat: e.location_lat, lng: e.location_lng })
      }
    }
    for (const ce of filteredCityEvents) {
      if (results.length >= 8) break
      if (ce.latitude && ce.longitude && (ce.name_fi.toLowerCase().includes(q) || ce.location_name?.toLowerCase().includes(q))) {
        results.push({ type: 'city_event', name: ce.name_fi, lat: ce.latitude, lng: ce.longitude, category: ce.category })
      }
    }
    for (const pl of filteredPlaces) {
      if (results.length >= 8) break
      if (pl.name.toLowerCase().includes(q) || pl.address?.toLowerCase().includes(q)) {
        results.push({ type: 'place', name: pl.name, lat: pl.latitude, lng: pl.longitude, category: pl.category })
      }
    }
    return results
  }, [debouncedSearch, filteredPosts, filteredEvents, filteredCityEvents, filteredPlaces])

  const handleSearchResultClick = useCallback((result: { lat: number; lng: number }) => {
    setFlyTo({ lat: result.lat, lng: result.lng, zoom: 17 })
    setShowSearch(false)
    setSearchQuery('')
    setFiltersExpanded(false)
  }, [])

  // 7. City event category counts
  const cityEventCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const source = eventSource === 'community' ? [] : cityEvents
    for (const ce of source) {
      if (!ce.latitude || !ce.longitude || !isInHelsinki(ce.latitude, ce.longitude)) continue
      if (userPos && radiusKm && haversineKm(userPos[0], userPos[1], ce.latitude, ce.longitude) > radiusKm) continue
      counts[ce.category] = (counts[ce.category] ?? 0) + 1
    }
    return counts
  }, [cityEvents, eventSource, userPos, radiusKm])

  // Track which layer's sub-filter is open (null = none, tap layer pill to toggle)
  const [activeSubFilter, setActiveSubFilter] = useState<'posts' | 'events' | 'places' | null>(null)

  const toggleLayer = (layer: 'posts' | 'events' | 'places') => {
    if (layer === 'posts') setShowPosts(!showPosts)
    else if (layer === 'events') setShowEvents(!showEvents)
    else setShowPlaces(!showPlaces)
  }

  const toggleSubFilter = (layer: 'posts' | 'events' | 'places') => {
    setActiveSubFilter(activeSubFilter === layer ? null : layer)
    setShowAreaPicker(false)
    setShowSearch(false)
  }

  return (
    <View style={[ms.container, { backgroundColor: colors.background }]}>
      {/* ── Map ── */}
      <View style={ms.mapWrap}>
        {loading ? <View style={ms.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View> : (
          <LeafletMap posts={filteredPosts} events={filteredEvents} cityEvents={filteredCityEvents} places={filteredPlaces} selectedArea={selectedArea} userPos={userPos} radiusKm={radiusKm} flyTo={flyTo} onMapInteraction={() => { setActiveSubFilter(null); setShowAreaPicker(false); setShowSearch(false) }} isDark={isDark} t={t} />
        )}
      </View>

      {/* ── TOP BAR: Back + Area + Search ── */}
      <View style={[ms.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} style={[ms.pill, { backgroundColor: colors.card }]}>
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>
        <Pressable onPress={() => { setShowAreaPicker(!showAreaPicker); setShowSearch(false); setActiveSubFilter(null) }} style={[ms.areaPill, { backgroundColor: colors.card }]}>
          <Navigation size={14} color={colors.primary} />
          <Text style={[ms.areaPillText, { color: colors.foreground }]} numberOfLines={1}>{selectedArea ?? t('map.allHelsinki')}</Text>
          <ChevronDown size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable onPress={() => { setShowSearch(!showSearch); setShowAreaPicker(false); setActiveSubFilter(null) }} style={[ms.pill, { backgroundColor: colors.card }]}>
          <Search size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {/* ── LAYER PILLS: tap=toggle, long press=sub-filters ── */}
      <View style={[ms.layerRow, { top: insets.top + 52 }]}>
        {/* Posts */}
        <Pressable
          onPress={() => toggleLayer('posts')}
          onLongPress={() => toggleSubFilter('posts')}
          delayLongPress={300}
          style={[ms.layerPill, { backgroundColor: showPosts ? colors.primary : colors.card }]}
        >
          <Newspaper size={14} color={showPosts ? '#FFF' : colors.mutedForeground} />
          <Text style={[ms.layerText, { color: showPosts ? '#FFF' : colors.mutedForeground }]}>{t('map.layerPosts')}</Text>
          <View style={[ms.badge, { backgroundColor: showPosts ? 'rgba(255,255,255,0.3)' : colors.muted }]}>
            <Text style={[ms.badgeNum, { color: showPosts ? '#FFF' : colors.mutedForeground }]}>{filteredPosts.length}</Text>
          </View>
        </Pressable>
        {/* Events */}
        <Pressable
          onPress={() => toggleLayer('events')}
          onLongPress={() => toggleSubFilter('events')}
          delayLongPress={300}
          style={[ms.layerPill, { backgroundColor: showEvents ? '#2B8A62' : colors.card }]}
        >
          <CalendarDays size={14} color={showEvents ? '#FFF' : colors.mutedForeground} />
          <Text style={[ms.layerText, { color: showEvents ? '#FFF' : colors.mutedForeground }]}>{t('map.layerEvents')}</Text>
          <View style={[ms.badge, { backgroundColor: showEvents ? 'rgba(255,255,255,0.3)' : colors.muted }]}>
            <Text style={[ms.badgeNum, { color: showEvents ? '#FFF' : colors.mutedForeground }]}>{filteredEvents.length + filteredCityEvents.length}</Text>
          </View>
        </Pressable>
        {/* Places */}
        <Pressable
          onPress={() => toggleLayer('places')}
          onLongPress={() => toggleSubFilter('places')}
          delayLongPress={300}
          style={[ms.layerPill, { backgroundColor: showPlaces ? '#78716C' : colors.card }]}
        >
          <Coffee size={14} color={showPlaces ? '#FFF' : colors.mutedForeground} />
          <Text style={[ms.layerText, { color: showPlaces ? '#FFF' : colors.mutedForeground }]}>{t('map.layerPlaces')}</Text>
          <View style={[ms.badge, { backgroundColor: showPlaces ? 'rgba(255,255,255,0.3)' : colors.muted }]}>
            <Text style={[ms.badgeNum, { color: showPlaces ? '#FFF' : colors.mutedForeground }]}>{filteredPlaces.length}</Text>
          </View>
        </Pressable>
      </View>

      {/* ── SUB-FILTER (slides from under active layer pill) ── */}
      {activeSubFilter && (
        <View style={[ms.subPanel, { top: insets.top + 92, backgroundColor: colors.card, borderColor: colors.border }]}>
          {activeSubFilter === 'posts' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ms.chipRow}>
              <Pressable onPress={() => setPostFilter(null)} style={[ms.chip, !postFilter ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted }]}>
                <Text style={[ms.chipText, { color: !postFilter ? '#FFF' : colors.mutedForeground }]}>{t('common.all')}</Text>
              </Pressable>
              {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).map(([type, cat]) => (
                <Pressable key={type} onPress={() => setPostFilter(postFilter === type ? null : type)} style={[ms.chip, postFilter === type ? { backgroundColor: cat.color } : { backgroundColor: colors.muted }]}>
                  <Text style={[ms.chipText, { color: postFilter === type ? '#FFF' : colors.mutedForeground }]}>{t(cat.label)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {activeSubFilter === 'events' && (
            <View style={{ gap: 8 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ms.chipRow}>
                {(['all', 'community', 'city'] as const).map(src => (
                  <Pressable key={src} onPress={() => setEventSource(src)} style={[ms.chip, eventSource === src ? { backgroundColor: '#2B8A62' } : { backgroundColor: colors.muted }]}>
                    <Text style={[ms.chipText, { color: eventSource === src ? '#FFF' : colors.mutedForeground }]}>
                      {src === 'all' ? t('common.all') : src === 'community' ? t('events.communityTab') : 'Helsinki'}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              {(eventSource === 'all' || eventSource === 'city') && Object.keys(cityEventCategoryCounts).length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ms.chipRow}>
                  <Pressable onPress={() => setCityEventCategory(null)} style={[ms.chip, !cityEventCategory ? { backgroundColor: '#3B7DD8' } : { backgroundColor: colors.muted }]}>
                    <Text style={[ms.chipText, { color: !cityEventCategory ? '#FFF' : colors.mutedForeground }]}>{t('common.all')}</Text>
                  </Pressable>
                  {Object.entries(cityEventCategoryCounts).map(([cat, count]) => {
                    const cfg = CITY_EVENT_CATS[cat]
                    return (
                      <Pressable key={cat} onPress={() => setCityEventCategory(cityEventCategory === cat ? null : cat)} style={[ms.chip, cityEventCategory === cat ? { backgroundColor: cfg?.color ?? '#3B7DD8' } : { backgroundColor: colors.muted }]}>
                        <Text style={[ms.chipText, { color: cityEventCategory === cat ? '#FFF' : colors.mutedForeground }]}>{cat} ({count})</Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              )}
            </View>
          )}
          {activeSubFilter === 'places' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ms.chipRow}>
              {PLACE_CATEGORIES.map(({ key, label }) => (
                <Pressable key={key ?? 'all'} onPress={() => setPlaceFilter(key)} style={[ms.chip, placeFilter === key ? { backgroundColor: '#78716C' } : { backgroundColor: colors.muted }]}>
                  <Text style={[ms.chipText, { color: placeFilter === key ? '#FFF' : colors.mutedForeground }]}>{t(label)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── AREA PICKER ── */}
      {showAreaPicker && (
        <View style={[ms.overlay, { top: insets.top + 52, backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
            <Pressable onPress={() => { setSelectedArea(null); setShowAreaPicker(false) }} style={ms.overlayItem}>
              <Text style={[ms.overlayText, { color: colors.foreground, fontWeight: !selectedArea ? '700' : '400' }]}>Helsinki ({t('common.all')})</Text>
            </Pressable>
            {NEIGHBORHOODS.map((nh) => (
              <Pressable key={nh} onPress={() => { setSelectedArea(nh); setShowAreaPicker(false) }} style={ms.overlayItem}>
                <Text style={[ms.overlayText, { color: colors.foreground, fontWeight: selectedArea === nh ? '700' : '400' }]}>{nh}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── SEARCH + RESULTS ── */}
      {showSearch && (
        <View style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 52, zIndex: 20 }}>
          <View style={[ms.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Search size={16} color={colors.mutedForeground} />
            <TextInput style={[ms.searchInput, { color: colors.foreground }]} value={searchQuery} onChangeText={setSearchQuery} placeholder={t('feed.searchPlaceholder')} placeholderTextColor={colors.mutedForeground} autoFocus />
            {searchQuery.length > 0 && <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><X size={16} color={colors.mutedForeground} /></Pressable>}
          </View>
          {searchResults.length > 0 && (
            <ScrollView style={[ms.searchResults, { backgroundColor: colors.card, borderColor: colors.border }]} keyboardShouldPersistTaps="handled">
              {searchResults.map((r, i) => (
                <Pressable key={i} onPress={() => handleSearchResultClick(r)} style={[ms.searchItem, i < searchResults.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                  <View style={[ms.searchBadge, { backgroundColor: r.type === 'post' ? `${colors.primary}20` : r.type === 'event' ? '#2B8A6220' : r.type === 'city_event' ? '#8E44AD20' : '#78716C20' }]}>
                    <Text style={[ms.searchBadgeText, { color: r.type === 'post' ? colors.primary : r.type === 'event' ? '#2B8A62' : r.type === 'city_event' ? '#8E44AD' : '#78716C' }]}>
                      {r.type === 'post' ? t('map.layerPosts') : r.type === 'event' ? t('map.layerEvents') : r.type === 'city_event' ? 'Helsinki' : t('map.layerPlaces')}
                    </Text>
                  </View>
                  <Text style={[ms.searchName, { color: colors.foreground }]} numberOfLines={1}>{r.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── GPS BUTTON (right side) ── */}
      <Pressable onPress={handleGeolocate} disabled={geoLoading} style={[ms.gpsBtn, { bottom: insets.bottom + (userPos ? 140 : 70), backgroundColor: userPos ? colors.primary : colors.card }]}>
        {geoLoading ? <Loader2 size={20} color={colors.foreground} /> : <Crosshair size={20} color={userPos ? '#FFF' : colors.foreground} />}
      </Pressable>

      {/* ── RADIUS PANEL (above count bar, only when GPS active) ── */}
      {userPos && (
        <View style={[ms.radiusPanel, { bottom: insets.bottom + 70, backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={ms.radiusRow}>
            <MapPin size={14} color={radiusKm ? colors.primary : colors.mutedForeground} />
            <Text style={[ms.radiusLabel, { color: colors.foreground }]}>{t('map.radius')}</Text>
            <Text style={[ms.radiusVal, { color: radiusKm ? colors.primary : colors.mutedForeground }]}>{radiusKm ? `${radiusKm} km` : t('map.radiusOff')}</Text>
            <Pressable onPress={() => setRadiusKm(radiusKm ? null : 0.5)} style={[ms.toggle, { backgroundColor: radiusKm ? colors.primary : colors.muted }]}>
              <View style={[ms.toggleThumb, { transform: [{ translateX: radiusKm ? 14 : 0 }] }]} />
            </Pressable>
          </View>
          {radiusKm != null && (
            <View style={ms.presets}>
              {[0.1, 0.5, 1, 2, 3, 5].map(r => (
                <Pressable key={r} onPress={() => setRadiusKm(r)} style={[ms.preset, Math.abs((radiusKm ?? 0) - r) < 0.15 ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted }]}>
                  <Text style={[ms.presetText, { color: Math.abs((radiusKm ?? 0) - r) < 0.15 ? '#FFF' : colors.mutedForeground }]}>{r}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── COUNT BAR (bottom center) ── */}
      <View style={[ms.countBar, { bottom: insets.bottom + 24, backgroundColor: colors.card, borderColor: colors.border }]}>
        <MapPin size={14} color={colors.mutedForeground} />
        <Text style={[ms.countText, { color: colors.foreground }]}>{totalVisible} {t('map.visible')}</Text>
      </View>

      {/* ── EMPTY STATE ── */}
      {!loading && totalVisible === 0 && (
        <View style={[ms.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MapPin size={32} color={colors.mutedForeground} style={{ opacity: 0.3 }} />
          <Text style={[ms.emptyTitle, { color: colors.foreground }]}>{t('map.noResults')}</Text>
          <Text style={[ms.emptyHint, { color: colors.mutedForeground }]}>{t('map.resetFiltersHint')}</Text>
          <Pressable onPress={() => { setShowPosts(true); setShowEvents(true); setShowPlaces(true); setPostFilter(null); setPlaceFilter(null); setEventSource('all'); setCityEventCategory(null); setRadiusKm(null); setActiveSubFilter(null) }}
            style={[ms.emptyBtn, { backgroundColor: colors.primary }]}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>{t('map.resetFilters')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

const shadow = { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 }

const ms = StyleSheet.create({
  container: { flex: 1 },
  mapWrap: { ...StyleSheet.absoluteFillObject },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Top bar
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  pill: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', ...shadow },
  areaPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 12, paddingHorizontal: 12, ...shadow },
  areaPillText: { fontSize: 14, fontWeight: '600', flex: 1 },
  // Layer row
  layerRow: { position: 'absolute', left: 12, right: 12, zIndex: 10, flexDirection: 'row', gap: 6 },
  layerPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 36, borderRadius: 18, ...shadow },
  layerText: { fontSize: 11, fontWeight: '600' },
  badge: { minWidth: 20, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeNum: { fontSize: 10, fontWeight: '700' },
  // Sub-filter panel
  subPanel: { position: 'absolute', left: 12, right: 12, zIndex: 9, borderRadius: 12, borderWidth: 1, padding: 10, ...shadow },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  chipText: { fontSize: 11, fontWeight: '500' },
  // Overlay (area picker)
  overlay: { position: 'absolute', left: 12, right: 12, zIndex: 20, borderRadius: 12, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },
  overlayItem: { paddingHorizontal: 16, paddingVertical: 12 },
  overlayText: { fontSize: 14 },
  // Search
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 44, ...shadow },
  searchInput: { flex: 1, fontSize: 14 },
  searchResults: { marginTop: 4, borderRadius: 12, borderWidth: 1, maxHeight: 240, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },
  searchItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  searchBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  searchBadgeText: { fontSize: 10, fontWeight: '600' },
  searchName: { fontSize: 14, flex: 1 },
  // GPS
  gpsBtn: { position: 'absolute', right: 12, zIndex: 10, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', ...shadow },
  // Radius panel
  radiusPanel: { position: 'absolute', left: 16, right: 16, zIndex: 10, borderRadius: 16, borderWidth: 1, padding: 14, gap: 10, ...shadow },
  radiusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radiusLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  radiusVal: { fontSize: 13, fontWeight: '600' },
  toggle: { width: 34, height: 20, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 3 },
  toggleThumb: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFF' },
  presets: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  preset: { width: 40, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  presetText: { fontSize: 12, fontWeight: '600' },
  // Count bar
  countBar: { position: 'absolute', left: 60, right: 60, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 18, borderWidth: 1, ...shadow },
  countText: { fontSize: 13, fontWeight: '500' },
  // Empty state
  empty: { position: 'absolute', left: 40, right: 40, top: '40%', zIndex: 10, borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },
  emptyTitle: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  emptyBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, marginTop: 4 },
})
