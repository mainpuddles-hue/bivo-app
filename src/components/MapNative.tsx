import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fetchHelsinkiEvents } from '@/lib/linkedevents'
import { useRouter } from 'expo-router'
import MapView, { Marker, Circle, PROVIDER_DEFAULT, type Region } from 'react-native-maps'
import * as Location from 'expo-location'
import {
  ArrowLeft, Search, X, MapPin, Navigation, ChevronDown,
  Newspaper, CalendarDays, Coffee, Crosshair, Loader2,
  Palette, Music, Dumbbell, Baby, UtensilsCrossed, TreePine,
  GraduationCap, Theater, Frame, PartyPopper, ShoppingCart, Calendar,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIES, NEIGHBORHOODS } from '@/lib/constants'
import type { Post, PostType, Event, CityEvent, LocalPlace } from '@/lib/types'

// ── Constants (matching web exactly) ──

const HELSINKI_CENTER = { latitude: 60.1699, longitude: 24.9384 }

const HKI = { south: 60.14, north: 60.27, west: 24.83, east: 25.20 } as const

/**
 * Refined Helsinki boundary check with zone-based exclusions.
 * A simple bounding box includes parts of Vantaa (Myyrmäki 60.26/24.85)
 * and Espoo (Otaniemi 60.19/24.83). This adds exclusion zones.
 */
const isInHelsinki = (lat: number, lng: number): boolean => {
  if (lat < HKI.south || lat > HKI.north || lng < HKI.west || lng > HKI.east) return false
  // NW corner: Vantaa (Myyrmäki, Martinlaakso) — above 60.24 & west of 24.88
  if (lat > 60.24 && lng < 24.88) return false
  // North-central: Vantaa border — above 60.26 & west of 24.96
  if (lat > 60.26 && lng < 24.96) return false
  return true
}

const NEIGHBORHOOD_COORDS: Record<string, { latitude: number; longitude: number }> = {
  'Kallio': { latitude: 60.1844, longitude: 24.9496 },
  'Sörnäinen': { latitude: 60.1870, longitude: 24.9700 },
  'Vallila': { latitude: 60.1930, longitude: 24.9530 },
  'Kamppi': { latitude: 60.1686, longitude: 24.9316 },
  'Töölö': { latitude: 60.1810, longitude: 24.9220 },
  'Kruununhaka': { latitude: 60.1730, longitude: 24.9560 },
  'Katajanokka': { latitude: 60.1673, longitude: 24.9625 },
  'Punavuori': { latitude: 60.1609, longitude: 24.9406 },
  'Arabia': { latitude: 60.2037, longitude: 24.9756 },
  'Herttoniemi': { latitude: 60.1950, longitude: 25.0320 },
  'Hakaniemi': { latitude: 60.1790, longitude: 24.9510 },
  'Pasila': { latitude: 60.1985, longitude: 24.9310 },
  'Lauttasaari': { latitude: 60.1580, longitude: 24.8770 },
  'Ruoholahti': { latitude: 60.1620, longitude: 24.9080 },
  'Jätkäsaari': { latitude: 60.1570, longitude: 24.9120 },
  'Hermanni': { latitude: 60.1880, longitude: 24.9620 },
  'Alppiharju': { latitude: 60.1890, longitude: 24.9510 },
  'Käpylä': { latitude: 60.2100, longitude: 24.9490 },
  'Kumpula': { latitude: 60.2060, longitude: 24.9600 },
  'Toukola': { latitude: 60.2000, longitude: 24.9670 },
  'Ullanlinna': { latitude: 60.1570, longitude: 24.9480 },
  'Eira': { latitude: 60.1550, longitude: 24.9380 },
  'Munkkiniemi': { latitude: 60.1970, longitude: 24.8770 },
  'Vuosaari': { latitude: 60.2090, longitude: 25.1450 },
  'Malmi': { latitude: 60.2490, longitude: 25.0110 },
  'Oulunkylä': { latitude: 60.2290, longitude: 24.9590 },
}

// Place categories with icons + colors (matching web's PLACE_CATS)
const PLACE_CATS: Record<string, { color: string; icon: string; label: string }> = {
  restaurant: { color: '#E74C3C', icon: '\u{1F374}', label: 'Ravintola' },
  cafe: { color: '#8B5E3C', icon: '\u2615', label: 'Kahvila' },
  bar: { color: '#9B59B6', icon: '\u{1F37A}', label: 'Baari' },
  shop: { color: '#3498DB', icon: '\u{1F6D2}', label: 'Kauppa' },
  library: { color: '#27AE60', icon: '\u{1F4DA}', label: 'Kirjasto' },
  health: { color: '#E91E63', icon: '\u2764', label: 'Terveys' },
  sport: { color: '#F39C12', icon: '\u{1F3CB}', label: 'Urheilu' },
  culture: { color: '#8E44AD', icon: '\u{1F3A8}', label: 'Kulttuuri' },
  hotel: { color: '#2C3E50', icon: '\u{1F3E8}', label: 'Hotelli' },
  attraction: { color: '#F1C40F', icon: '\u2B50', label: 'Nähtävyys' },
  service: { color: '#607D8B', icon: '\u{1F4CD}', label: 'Palvelu' },
  fast_food: { color: '#FF5722', icon: '\u{1F354}', label: 'Pikaruoka' },
  pub: { color: '#795548', icon: '\u{1F37B}', label: 'Pubi' },
  other: { color: '#78716C', icon: '\u{1F4CD}', label: 'Muu' },
}

// City event category config
const CITY_EVENT_CATS: Record<string, { color: string; Icon: React.ComponentType<{ size: number; color: string }> }> = {
  culture: { color: '#8E44AD', Icon: Palette },
  music: { color: '#E91E63', Icon: Music },
  sport: { color: '#27AE60', Icon: Dumbbell },
  family: { color: '#FF9800', Icon: Baby },
  food: { color: '#E74C3C', Icon: UtensilsCrossed },
  nature: { color: '#4CAF50', Icon: TreePine },
  education: { color: '#2196F3', Icon: GraduationCap },
  theatre: { color: '#9C27B0', Icon: Theater },
  exhibition: { color: '#795548', Icon: Frame },
  festival: { color: '#FF5722', Icon: PartyPopper },
  market: { color: '#FF9800', Icon: ShoppingCart },
  other: { color: '#607D8B', Icon: Calendar },
}

// Post type → pinColor mapping (native markers only)
const POST_TYPE_PIN_COLORS: Record<string, string> = {
  tarvitsen: '#C75B3A',
  tarjoan: '#7C5CBF',
  ilmaista: '#3B7DD8',
  nappaa: '#E8A050',
  lainaa: '#C98B2E',
  tapahtuma: '#2B8A62',
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
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

/** Validate URL scheme — only allow http/https */
function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try { const p = new URL(url); return (p.protocol === 'http:' || p.protocol === 'https:') ? url : null }
  catch { return null }
}

// ── Hard cap: never render more than this many markers total ──
const MAX_MARKERS_TOTAL = 50

// ── Unified marker type for the bottom sheet detail panel ──
interface SelectedMarker {
  type: 'post' | 'event' | 'city_event' | 'place'
  id: string
  title: string
  subtitle?: string
  description?: string
  color: string
  location?: string
  distance?: string
  actionLabel: string
  onAction: () => void
  extra?: { key: string; value: string }[]
}

// Dark mode map style for react-native-maps
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
]

// ── Main Screen ──
export default function MapScreen() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const mapRef = useRef<MapView | null>(null)

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
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [radiusKm, setRadiusKm] = useState<number | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [cityEventCategory, setCityEventCategory] = useState<string | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [fetchError, setFetchError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [currentRegion, setCurrentRegion] = useState<Region>({ ...HELSINKI_CENTER, latitudeDelta: 0.08, longitudeDelta: 0.08 })

  // Selected marker for bottom detail panel (replaces all Callouts)
  const [selectedMarker, setSelectedMarker] = useState<SelectedMarker | null>(null)

  // Debounce search 200ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery])

  // ── Data fetching (matching web exactly) ──
  useEffect(() => {
    async function fetchData() {
      const [postsRes, eventsRes, helsinkiEvents, placesRes] = await Promise.allSettled([
        supabase.from('posts')
          .select('id, type, title, description, location, latitude, longitude, image_url, daily_fee, user:profiles!posts_user_id_fkey(id, name, avatar_url, naapurusto)')
          .eq('is_active', true)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .gte('latitude', HKI.south).lte('latitude', HKI.north)
          .gte('longitude', HKI.west).lte('longitude', HKI.east)
          .limit(200),
        supabase.from('events')
          .select('id, title, description, event_date, location_name, location_lat, location_lng, icon, max_attendees, attendees:event_attendees(count), creator:profiles!events_creator_id_fkey(id, name, avatar_url)')
          .eq('is_active', true)
          .gte('event_date', new Date().toISOString().split('T')[0])
          .not('location_lat', 'is', null)
          .not('location_lng', 'is', null)
          .order('event_date', { ascending: true })
          .limit(200),
        fetchHelsinkiEvents(),
        supabase.from('local_places')
          .select('id, name, category, subcategory, address, latitude, longitude, phone, website, opening_hours, image_url, neighborhood, tags')
          .not('neighborhood', 'is', null)
          .gte('latitude', HKI.south).lte('latitude', HKI.north)
          .gte('longitude', HKI.west).lte('longitude', HKI.east)
          .limit(500),
      ])

      const pData = postsRes.status === 'fulfilled' ? (postsRes.value.data ?? []) : []
      const eData = eventsRes.status === 'fulfilled' ? (eventsRes.value.data ?? []) : []
      const cData = helsinkiEvents.status === 'fulfilled' ? helsinkiEvents.value : []
      const plData = placesRes.status === 'fulfilled' ? (placesRes.value.data ?? []) : []

      // Show error if ALL queries failed
      if (!pData.length && !eData.length && !cData.length && !plData.length &&
          postsRes.status === 'rejected' && eventsRes.status === 'rejected') {
        setFetchError(true)
      }

      setPosts(pData as unknown as Post[])
      setEvents(eData.map((e: any) => ({
        ...e,
        attendee_count: (e.attendees as { count: number }[])?.[0]?.count ?? 0,
        creator: Array.isArray(e.creator) ? e.creator[0] ?? null : e.creator ?? null,
      })) as unknown as Event[])
      setCityEvents(cData as unknown as CityEvent[])
      setPlaces(plData as unknown as LocalPlace[])

      setLoading(false)
    }
    fetchData()
  }, [supabase])

  // ── GPS: uses expo-location ──
  const handleGeolocate = useCallback(async () => {
    if (geoLoading) return
    if (userPos) {
      // Fly to user position + toggle radius
      mapRef.current?.animateToRegion({
        latitude: userPos[0], longitude: userPos[1],
        latitudeDelta: 0.01, longitudeDelta: 0.01,
      }, 1000)
      setRadiusKm(prev => prev ? null : 0.5)
      return
    }
    setGeoLoading(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Sijaintilupa', 'Salli sijainnin käyttö asetuksista.')
        setGeoLoading(false)
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      setUserPos([loc.coords.latitude, loc.coords.longitude])
      setRadiusKm(0.5)
      mapRef.current?.animateToRegion({
        latitude: loc.coords.latitude, longitude: loc.coords.longitude,
        latitudeDelta: 0.01, longitudeDelta: 0.01,
      }, 1000)
    } catch {
      Alert.alert('Virhe', 'Sijainnin haku epäonnistui.')
    }
    setGeoLoading(false)
  }, [geoLoading, userPos])

  // ── Filtering chains (matching web logic exactly) ──

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

  // 3. City events: source + category + search + radius + Helsinki only + viewport
  const filteredCityEvents = useMemo(() => {
    if (!showEvents || eventSource === 'community') return []
    let c = cityEvents.filter(x => x.latitude && x.longitude && isInHelsinki(x.latitude!, x.longitude!))
    if (cityEventCategory) c = c.filter(x => x.category === cityEventCategory)
    if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); c = c.filter(x => x.name_fi.toLowerCase().includes(q) || x.location_name?.toLowerCase().includes(q)) }
    if (userPos && radiusKm) c = c.filter(x => x.latitude && x.longitude && haversineKm(userPos[0], userPos[1], x.latitude!, x.longitude!) <= radiusKm)
    // Viewport filter: only show events within current map region + margin
    const r = currentRegion
    c = c.filter(x => x.latitude && x.longitude &&
      x.latitude! >= r.latitude - r.latitudeDelta * 0.6 &&
      x.latitude! <= r.latitude + r.latitudeDelta * 0.6 &&
      x.longitude! >= r.longitude - r.longitudeDelta * 0.6 &&
      x.longitude! <= r.longitude + r.longitudeDelta * 0.6
    )
    return c
  }, [cityEvents, showEvents, eventSource, cityEventCategory, debouncedSearch, userPos, radiusKm, currentRegion])

  // 4. Places: category + search + radius
  const filteredPlaces = useMemo(() => {
    if (!showPlaces) return []
    let p = places.filter(x => isInHelsinki(x.latitude, x.longitude))
    if (placeFilter) p = p.filter(x => x.category === placeFilter)
    if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); p = p.filter(x => x.name.toLowerCase().includes(q) || x.address?.toLowerCase().includes(q)) }
    if (userPos && radiusKm) p = p.filter(x => haversineKm(userPos[0], userPos[1], x.latitude, x.longitude) <= radiusKm)
    return p.slice(0, 200)
  }, [places, showPlaces, placeFilter, debouncedSearch, userPos, radiusKm])

  // 5. Layer count badges
  const layerCounts = useMemo(() => ({
    posts: filteredPosts.length,
    events: filteredEvents.length + filteredCityEvents.length,
    places: filteredPlaces.length,
  }), [filteredPosts.length, filteredEvents.length, filteredCityEvents.length, filteredPlaces.length])

  const totalVisible = layerCounts.posts + layerCounts.events + layerCounts.places

  // ── HARD-CAPPED markers: max 50 total, sorted by proximity to map center ──
  // This is the key crash fix: we merge all layers into a single list,
  // sort by distance to the current map center, and take at most MAX_MARKERS_TOTAL.
  // All markers use ONLY native pinColor — zero custom View children.

  interface NativeMarkerData {
    key: string
    latitude: number
    longitude: number
    pinColor: string
    title: string
    description: string
    distToCenter: number
    type: 'post' | 'event' | 'city_event' | 'place'
    id: string
  }

  const cappedMarkers = useMemo(() => {
    const center = currentRegion
    const all: NativeMarkerData[] = []

    // Posts
    for (const p of filteredPosts) {
      if (!p.latitude || !p.longitude) continue
      const cat = CATEGORIES[p.type as PostType]
      const color = POST_TYPE_PIN_COLORS[p.type] ?? '#2D6B5E'
      const distToCenter = haversineKm(center.latitude, center.longitude, p.latitude, p.longitude)
      const distStr = userPos ? ` (${formatDistance(haversineKm(userPos[0], userPos[1], p.latitude, p.longitude))})` : ''
      all.push({
        key: `post-${p.id}`,
        latitude: p.latitude,
        longitude: p.longitude,
        pinColor: color,
        title: p.title,
        description: [t(cat?.label ?? ''), p.location, distStr].filter(Boolean).join(' · '),
        distToCenter,
        type: 'post',
        id: p.id,
      })
    }

    // Community events
    for (const e of filteredEvents) {
      if (!e.location_lat || !e.location_lng) continue
      const distToCenter = haversineKm(center.latitude, center.longitude, e.location_lat, e.location_lng)
      const dateStr = new Date(e.event_date).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })
      all.push({
        key: `event-${e.id}`,
        latitude: e.location_lat,
        longitude: e.location_lng,
        pinColor: '#2B8A62',
        title: e.title,
        description: [dateStr, e.location_name].filter(Boolean).join(' · '),
        distToCenter,
        type: 'event',
        id: e.id,
      })
    }

    // City events
    for (const ce of filteredCityEvents) {
      if (!ce.latitude || !ce.longitude) continue
      const catCfg = CITY_EVENT_CATS[ce.category] ?? CITY_EVENT_CATS.other
      const distToCenter = haversineKm(center.latitude, center.longitude, ce.latitude, ce.longitude)
      all.push({
        key: `ce-${ce.id}`,
        latitude: ce.latitude,
        longitude: ce.longitude,
        pinColor: catCfg.color,
        title: ce.name_fi,
        description: [ce.location_name, ce.is_free ? 'Ilmainen' : null].filter(Boolean).join(' · '),
        distToCenter,
        type: 'city_event',
        id: ce.id,
      })
    }

    // Places
    for (const pl of filteredPlaces) {
      const pCat = PLACE_CATS[pl.category] ?? PLACE_CATS.other
      const distToCenter = haversineKm(center.latitude, center.longitude, pl.latitude, pl.longitude)
      all.push({
        key: `pl-${pl.id}`,
        latitude: pl.latitude,
        longitude: pl.longitude,
        pinColor: pCat.color,
        title: pl.name,
        description: [pCat.label, pl.address].filter(Boolean).join(' · '),
        distToCenter,
        type: 'place',
        id: pl.id,
      })
    }

    // Sort by proximity to map center and hard-cap
    all.sort((a, b) => a.distToCenter - b.distToCenter)
    return all.slice(0, MAX_MARKERS_TOTAL)
  }, [filteredPosts, filteredEvents, filteredCityEvents, filteredPlaces, currentRegion, userPos, t])

  // Build lookup maps for detail panel (pre-computed, not in render)
  const postById = useMemo(() => {
    const map = new Map<string, Post>()
    for (const p of filteredPosts) map.set(p.id, p)
    return map
  }, [filteredPosts])

  const eventById = useMemo(() => {
    const map = new Map<string, Event>()
    for (const e of filteredEvents) map.set(e.id, e)
    return map
  }, [filteredEvents])

  const cityEventById = useMemo(() => {
    const map = new Map<string, CityEvent>()
    for (const ce of filteredCityEvents) map.set(ce.id, ce)
    return map
  }, [filteredCityEvents])

  const placeById = useMemo(() => {
    const map = new Map<string, LocalPlace>()
    for (const p of filteredPlaces) map.set(p.id, p)
    return map
  }, [filteredPlaces])

  // Handle marker press → show detail in bottom sheet (no Callout)
  const handleMarkerPress = useCallback((marker: NativeMarkerData) => {
    if (marker.type === 'post') {
      const p = postById.get(marker.id)
      if (!p) return
      const cat = CATEGORIES[p.type as PostType]
      const dist = userPos && p.latitude && p.longitude ? formatDistance(haversineKm(userPos[0], userPos[1], p.latitude, p.longitude)) : undefined
      setSelectedMarker({
        type: 'post',
        id: p.id,
        title: p.title,
        subtitle: t(cat?.label ?? ''),
        description: p.description?.slice(0, 120),
        color: POST_TYPE_PIN_COLORS[p.type] ?? '#2D6B5E',
        location: p.location ?? undefined,
        distance: dist,
        actionLabel: 'Katso ilmoitus',
        onAction: () => router.push(`/post/${p.id}` as any),
        extra: [
          ...(p.user?.name ? [{ key: 'user', value: p.user.name }] : []),
          ...(p.daily_fee ? [{ key: 'price', value: `${p.daily_fee} \u20AC/pv` }] : []),
        ],
      })
    } else if (marker.type === 'event') {
      const e = eventById.get(marker.id)
      if (!e) return
      const dateStr = new Date(e.event_date).toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' })
      const dist = userPos && e.location_lat && e.location_lng ? formatDistance(haversineKm(userPos[0], userPos[1], e.location_lat, e.location_lng)) : undefined
      setSelectedMarker({
        type: 'event',
        id: e.id,
        title: e.title,
        subtitle: dateStr,
        description: e.description?.slice(0, 120),
        color: '#2B8A62',
        location: e.location_name ?? undefined,
        distance: dist,
        actionLabel: 'Katso tapahtuma',
        onAction: () => router.push('/events' as any),
        extra: e.creator?.name ? [{ key: 'creator', value: e.creator.name }] : [],
      })
    } else if (marker.type === 'city_event') {
      const ce = cityEventById.get(marker.id)
      if (!ce) return
      const catCfg = CITY_EVENT_CATS[ce.category] ?? CITY_EVENT_CATS.other
      const dist = userPos && ce.latitude && ce.longitude ? formatDistance(haversineKm(userPos[0], userPos[1], ce.latitude, ce.longitude)) : undefined
      const url = safeUrl(ce.info_url)
      setSelectedMarker({
        type: 'city_event',
        id: ce.id,
        title: ce.name_fi,
        subtitle: ce.category,
        description: ce.location_name ?? undefined,
        color: catCfg.color,
        location: ce.location_name ?? undefined,
        distance: dist,
        actionLabel: url ? 'Lisätietoja' : 'Sulje',
        onAction: () => { if (url) Linking.openURL(url); setSelectedMarker(null) },
        extra: ce.is_free ? [{ key: 'free', value: 'Ilmainen' }] : [],
      })
    } else if (marker.type === 'place') {
      const pl = placeById.get(marker.id)
      if (!pl) return
      const pCat = PLACE_CATS[pl.category] ?? PLACE_CATS.other
      const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], pl.latitude, pl.longitude)) : undefined
      const plWebsite = safeUrl(pl.website)
      setSelectedMarker({
        type: 'place',
        id: pl.id,
        title: pl.name,
        subtitle: pCat.label,
        description: pl.address ?? undefined,
        color: pCat.color,
        location: pl.address ?? undefined,
        distance: dist,
        actionLabel: plWebsite ? 'Verkkosivut' : 'Reittiohjeet',
        onAction: () => {
          if (plWebsite) Linking.openURL(plWebsite)
          else Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${pl.latitude},${pl.longitude}`)
        },
        extra: [
          ...(pl.opening_hours ? [{ key: 'hours', value: pl.opening_hours }] : []),
          ...(pl.phone ? [{ key: 'phone', value: pl.phone }] : []),
        ],
      })
    }
  }, [postById, eventById, cityEventById, placeById, userPos, t, router])

  // Debounced region change — prevents rapid marker re-creation cascades
  const onRegionChange = useCallback((region: Region) => {
    if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current)
    regionDebounceRef.current = setTimeout(() => {
      setCurrentRegion(region)
    }, 300)
  }, [])

  // Cleanup region debounce on unmount
  useEffect(() => {
    return () => { if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current) }
  }, [])

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
    mapRef.current?.animateToRegion({
      latitude: result.lat, longitude: result.lng,
      latitudeDelta: 0.005, longitudeDelta: 0.005,
    }, 1000)
    setShowSearch(false)
    setSearchQuery('')
    setActiveSubFilter(null)
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

  // Track which layer's sub-filter is open
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

  const flyToArea = (area: string) => {
    const coords = NEIGHBORHOOD_COORDS[area]
    if (coords && mapRef.current) {
      mapRef.current.animateToRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 1000)
    }
    setSelectedArea(area)
    setShowAreaPicker(false)
  }

  // Close overlays on map interaction
  const onMapPress = useCallback(() => {
    setActiveSubFilter(null)
    setShowAreaPicker(false)
    setShowSearch(false)
    setSelectedMarker(null)
  }, [])

  // ── Render ──

  if (loading) {
    return (
      <View style={[ms.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </View>
    )
  }

  return (
    <View style={[ms.container, { backgroundColor: colors.background }]}>
      {/* ── Native MapView ── */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={ms.map}
        initialRegion={{ ...HELSINKI_CENTER, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
        showsUserLocation={!!userPos}
        showsMyLocationButton={false}
        customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
        onPress={onMapPress}
        onRegionChangeComplete={onRegionChange}
        mapPadding={{ top: 100, right: 0, bottom: 60, left: 0 }}
      >
        {/* ── Radius circle ── */}
        {userPos && radiusKm && (
          <Circle
            center={{ latitude: userPos[0], longitude: userPos[1] }}
            radius={radiusKm * 1000}
            strokeColor="#4285F4"
            strokeWidth={2}
            fillColor={isDark ? 'rgba(66,133,244,0.12)' : 'rgba(66,133,244,0.08)'}
          />
        )}

        {/* ── ALL markers: native pinColor only, hard-capped at 50 ── */}
        {cappedMarkers.map((m) => (
          <Marker
            key={m.key}
            coordinate={{ latitude: m.latitude, longitude: m.longitude }}
            pinColor={m.pinColor}
            title={m.title}
            description={m.description}
            tracksViewChanges={false}
            onPress={() => handleMarkerPress(m)}
          />
        ))}
      </MapView>

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
              <Pressable key={nh} onPress={() => flyToArea(nh)} style={ms.overlayItem}>
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

      {/* ── SELECTED MARKER DETAIL PANEL (replaces all Callouts) ── */}
      {selectedMarker && (
        <View style={[ms.detailPanel, { bottom: insets.bottom + 24, backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Close button */}
          <Pressable onPress={() => setSelectedMarker(null)} style={ms.detailClose} hitSlop={8}>
            <X size={16} color={colors.mutedForeground} />
          </Pressable>
          {/* Color accent bar */}
          <View style={[ms.detailAccent, { backgroundColor: selectedMarker.color }]} />
          <View style={ms.detailContent}>
            {selectedMarker.subtitle ? (
              <Text style={[ms.detailSubtitle, { color: selectedMarker.color }]}>{selectedMarker.subtitle}</Text>
            ) : null}
            <Text style={[ms.detailTitle, { color: colors.foreground }]} numberOfLines={2}>{selectedMarker.title}</Text>
            {selectedMarker.description ? (
              <Text style={[ms.detailDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{selectedMarker.description}</Text>
            ) : null}
            <View style={ms.detailMeta}>
              {selectedMarker.location ? (
                <Text style={ms.detailSmall}>{'\u{1F4CD}'} {selectedMarker.location}</Text>
              ) : null}
              {selectedMarker.distance ? (
                <Text style={ms.detailSmall}>{'\u{1F9ED}'} {selectedMarker.distance}</Text>
              ) : null}
              {selectedMarker.extra?.map((e) => (
                <Text key={e.key} style={ms.detailSmall}>{e.value}</Text>
              ))}
            </View>
            <Pressable onPress={selectedMarker.onAction} style={[ms.detailAction, { backgroundColor: selectedMarker.color }]}>
              <Text style={ms.detailActionText}>{selectedMarker.actionLabel} {'\u2192'}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── COUNT BAR (bottom center) ── */}
      {!selectedMarker && (
        <View style={[ms.countBar, { bottom: insets.bottom + 24, backgroundColor: colors.card, borderColor: colors.border }]}>
          <MapPin size={14} color={colors.mutedForeground} />
          <Text style={[ms.countText, { color: colors.foreground }]}>
            {cappedMarkers.length}{totalVisible > MAX_MARKERS_TOTAL ? `/${totalVisible}` : ''} {t('map.visible')}
          </Text>
        </View>
      )}

      {/* ── ERROR STATE ── */}
      {fetchError && !loading && (
        <View style={[ms.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[ms.emptyTitle, { color: colors.foreground }]}>Virhe ladattaessa karttadataa</Text>
          <Text style={[ms.emptyHint, { color: colors.mutedForeground }]}>Tarkista verkkoyhteys ja yrit\u00E4 uudelleen.</Text>
          <Pressable onPress={() => { setFetchError(false); setLoading(true) }} style={[ms.emptyBtn, { backgroundColor: colors.primary }]}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Yrit\u00E4 uudelleen</Text>
          </Pressable>
        </View>
      )}

      {/* ── EMPTY STATE ── */}
      {!loading && !fetchError && totalVisible === 0 && (
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

// ── Styles ──

const shadow = { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 }

const ms = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
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
  // Detail panel (replaces all Callouts — renders OUTSIDE the MapView)
  detailPanel: { position: 'absolute', left: 12, right: 12, zIndex: 20, borderRadius: 16, borderWidth: 1, overflow: 'hidden', ...shadow },
  detailClose: { position: 'absolute', top: 10, right: 10, zIndex: 1, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' },
  detailAccent: { height: 4, width: '100%' },
  detailContent: { padding: 14 },
  detailSubtitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  detailTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4, lineHeight: 21, paddingRight: 24 },
  detailDesc: { fontSize: 13, marginBottom: 8, lineHeight: 18 },
  detailMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  detailSmall: { fontSize: 11, color: '#9CA3AF' },
  detailAction: { borderRadius: 20, paddingVertical: 10, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  detailActionText: { color: 'white', fontSize: 14, fontWeight: '600' },
  // Empty state
  empty: { position: 'absolute', left: 40, right: 40, top: '40%', zIndex: 10, borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },
  emptyTitle: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  emptyBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, marginTop: 4 },
})
