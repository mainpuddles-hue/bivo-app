import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import MapView, { Marker, Callout, Circle, PROVIDER_DEFAULT, type Region } from 'react-native-maps'
import * as Location from 'expo-location'
import {
  ArrowLeft, Search, X, MapPin, Navigation, ChevronDown,
  Newspaper, CalendarDays, Coffee, Crosshair, Loader2,
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

// City event category config matching web exactly
const CITY_EVENT_CATS: Record<string, { color: string; icon: string }> = {
  culture: { color: '#8E44AD', icon: '\u{1F3A8}' },
  music: { color: '#E91E63', icon: '\u{1F3B5}' },
  sport: { color: '#27AE60', icon: '\u{1F3CB}' },
  family: { color: '#FF9800', icon: '\u{1F46A}' },
  food: { color: '#E74C3C', icon: '\u{1F374}' },
  nature: { color: '#4CAF50', icon: '\u{1F33F}' },
  education: { color: '#2196F3', icon: '\u{1F393}' },
  theatre: { color: '#9C27B0', icon: '\u{1F3AD}' },
  exhibition: { color: '#795548', icon: '\u{1F5BC}' },
  festival: { color: '#FF5722', icon: '\u{1F389}' },
  market: { color: '#FF9800', icon: '\u{1F6D2}' },
  other: { color: '#607D8B', icon: '\u{1F4C5}' },
}

// Post type icon emojis (for native markers)
const POST_TYPE_ICONS: Record<string, string> = {
  HandHelping: '\u{1F91D}',
  Gift: '\u{1F381}',
  Heart: '\u2764',
  Zap: '\u26A1',
  BookOpen: '\u{1F4D6}',
  CalendarDays: '\u{1F4C5}',
  MapPin: '\u{1F4CD}',
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

  // Debounce search 200ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery])

  // ── Data fetching (matching web exactly) ──
  useEffect(() => {
    async function fetchData() {
      const [postsRes, eventsRes, cityRes, placesRes] = await Promise.allSettled([
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
          .gte('event_date', new Date().toISOString())
          .not('location_lat', 'is', null)
          .not('location_lng', 'is', null)
          .order('event_date', { ascending: true })
          .limit(200),
        supabase.from('city_events')
          .select('id, name_fi, name_en, name_sv, description_fi, start_time, end_time, location_name, location_address, latitude, longitude, image_url, info_url, category, is_free, price_info, organizer')
          .gte('start_time', new Date().toISOString())
          .gte('latitude', 60.14).lte('latitude', 60.29)
          .gte('longitude', 24.83).lte('longitude', 25.22)
          .order('start_time', { ascending: true })
          .limit(200),
        supabase.from('local_places')
          .select('id, name, category, subcategory, address, latitude, longitude, phone, website, opening_hours, image_url, neighborhood, tags')
          .not('neighborhood', 'is', null)
          .gte('latitude', HKI.south).lte('latitude', HKI.north)
          .gte('longitude', HKI.west).lte('longitude', HKI.east)
          .limit(500),
      ])

      const pData = postsRes.status === 'fulfilled' ? (postsRes.value.data ?? []) : []
      const eData = eventsRes.status === 'fulfilled' ? (eventsRes.value.data ?? []) : []
      const cData = cityRes.status === 'fulfilled' ? (cityRes.value.data ?? []) : []
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
    return p.slice(0, 200)
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
        showsUserLocation={false}
        showsMyLocationButton={false}
        customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
        onPress={onMapPress}
        mapPadding={{ top: 100, right: 0, bottom: 60, left: 0 }}
      >
        {/* ── User location dot ── */}
        {userPos && (
          <Marker
            coordinate={{ latitude: userPos[0], longitude: userPos[1] }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ position: 'absolute', width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(59,130,244,0.15)' }} />
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#3B82F4', borderWidth: 3, borderColor: 'white' }} />
            </View>
          </Marker>
        )}

        {/* ── Radius circle ── */}
        {userPos && radiusKm && (
          <Circle
            center={{ latitude: userPos[0], longitude: userPos[1] }}
            radius={radiusKm * 1000}
            strokeColor="#4285F4"
            strokeWidth={2}
            fillColor={isDark ? 'rgba(66,133,244,0.12)' : 'rgba(66,133,244,0.08)'}
            lineDashPattern={[6, 4]}
          />
        )}

        {/* ── Post markers ── */}
        {filteredPosts.map((p) => {
          if (!p.latitude || !p.longitude) return null
          const cat = CATEGORIES[p.type as PostType]
          const color = cat?.color ?? '#2D6B5E'
          const iconEmoji = POST_TYPE_ICONS[cat?.icon ?? 'MapPin'] ?? '\u{1F4CD}'
          const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], p.latitude, p.longitude)) : ''
          return (
            <Marker
              key={`post-${p.id}`}
              coordinate={{ latitude: p.latitude, longitude: p.longitude }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            >
              <View style={{ width: 36, height: 44, alignItems: 'center' }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: color, borderWidth: 2.5, borderColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: 'white', fontSize: 14 }}>{iconEmoji}</Text>
                </View>
                <View style={{ width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'white' }} />
              </View>
              <Callout tooltip onPress={() => router.push(`/post/${p.id}` as any)}>
                <View style={[ms.calloutCard, isDark && ms.calloutCardDark]}>
                  {/* Category badge */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
                    <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color }}>{t(cat?.label ?? '')}</Text>
                  </View>
                  {/* Title */}
                  <Text style={[ms.calloutTitle, isDark && ms.calloutTitleDark]} numberOfLines={2}>{p.title}</Text>
                  {/* Description */}
                  {p.description ? <Text style={ms.calloutMuted} numberOfLines={1}>{p.description.slice(0, 100)}</Text> : null}
                  {/* Location */}
                  {p.location ? <Text style={[ms.calloutSmall, { marginTop: 4 }]}>{'\u{1F4CD}'} {p.location}</Text> : null}
                  {/* Distance */}
                  {dist ? <Text style={ms.calloutSmall}>{'\u{1F9ED}'} {dist}</Text> : null}
                  {/* User info */}
                  {p.user ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: isDark ? '#333' : '#eee' }}>
                      <Text style={{ fontSize: 12, color: '#6B7280' }}>{p.user.name ?? ''}</Text>
                      {p.user.naapurusto ? <Text style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>{p.user.naapurusto}</Text> : null}
                    </View>
                  ) : null}
                  {/* Daily fee */}
                  {p.daily_fee ? (
                    <View style={{ marginTop: 6 }}>
                      <Text style={{ backgroundColor: '#FDF6E8', color: '#C98B2E', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, fontSize: 11, fontWeight: '600', overflow: 'hidden', alignSelf: 'flex-start' }}>{p.daily_fee} \u20AC/pv</Text>
                    </View>
                  ) : null}
                  {/* CTA */}
                  <View style={[ms.calloutCta, { backgroundColor: color }]}>
                    <Text style={ms.calloutCtaText}>Katso ilmoitus \u2192</Text>
                  </View>
                </View>
              </Callout>
            </Marker>
          )
        })}

        {/* ── Community event markers ── */}
        {filteredEvents.map((e) => {
          if (!e.location_lat || !e.location_lng) return null
          const day = new Date(e.event_date).getDate()
          const dateStr = new Date(e.event_date).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })
          const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], e.location_lat, e.location_lng)) : ''
          const ac = (e as any).attendee_count as number | undefined
          return (
            <Marker
              key={`event-${e.id}`}
              coordinate={{ latitude: e.location_lat, longitude: e.location_lng }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            >
              <View style={{ width: 36, height: 44, alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#2B8A62', borderWidth: 2.5, borderColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: 'white', fontSize: 14 }}>{'\u{1F4C5}'}</Text>
                </View>
                <View style={{ width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'white' }} />
              </View>
              <Callout tooltip onPress={() => router.push('/events' as any)}>
                <View style={[ms.calloutCard, isDark && ms.calloutCardDark, { padding: 0, overflow: 'hidden' }]}>
                  {/* Green header */}
                  <View style={{ backgroundColor: '#2B8A62', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: 'white', fontSize: 18, fontWeight: '800' }}>{day}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.95)', fontWeight: '600' }}>{dateStr}</Text>
                      <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textTransform: 'uppercase' }}>Tapahtuma</Text>
                    </View>
                  </View>
                  {/* Content */}
                  <View style={{ padding: 12 }}>
                    <Text style={[ms.calloutTitle, isDark && ms.calloutTitleDark]} numberOfLines={2}>{e.title}</Text>
                    {e.creator ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{e.creator.name ?? ''}</Text>
                      </View>
                    ) : null}
                    {e.description ? <Text style={ms.calloutMuted} numberOfLines={2}>{e.description}</Text> : null}
                    {e.location_name ? <Text style={[ms.calloutSmall, { marginTop: 4 }]}>{e.location_name}</Text> : null}
                    {dist ? <Text style={ms.calloutSmall}>{dist}</Text> : null}
                    {/* Attendee bar */}
                    {e.max_attendees && ac != null ? (
                      <View style={{ marginTop: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                          <Text style={{ fontSize: 10, color: '#6B7280' }}>{ac}/{e.max_attendees}</Text>
                          <Text style={{ fontSize: 10, color: '#6B7280' }}>{Math.round((ac / e.max_attendees) * 100)}%</Text>
                        </View>
                        <View style={{ height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                          <View style={{
                            height: 4, borderRadius: 2,
                            width: `${Math.min((ac / e.max_attendees) * 100, 100)}%` as any,
                            backgroundColor: (ac / e.max_attendees) >= 0.9 ? '#dc2626' : (ac / e.max_attendees) >= 0.7 ? '#d97706' : '#2B8A62',
                          }} />
                        </View>
                      </View>
                    ) : null}
                    <View style={[ms.calloutCta, { backgroundColor: '#2B8A62', borderRadius: 20, marginTop: 10 }]}>
                      <Text style={ms.calloutCtaText}>Katso tapahtuma \u2192</Text>
                    </View>
                  </View>
                </View>
              </Callout>
            </Marker>
          )
        })}

        {/* ── City event markers ── */}
        {filteredCityEvents.map((ce) => {
          if (!ce.latitude || !ce.longitude) return null
          const catCfg = CITY_EVENT_CATS[ce.category] ?? CITY_EVENT_CATS.other
          const catColor = catCfg.color
          const catIcon = catCfg.icon
          const ceDate = new Date(ce.start_time)
          const ceDay = ceDate.getDate()
          const ceDateStr = ceDate.toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })
          const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], ce.latitude, ce.longitude)) : ''
          const ceInfoUrl = safeUrl(ce.info_url)
          return (
            <Marker
              key={`ce-${ce.id}`}
              coordinate={{ latitude: ce.latitude, longitude: ce.longitude }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            >
              <View style={{ width: 36, height: 44, alignItems: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 14, backgroundColor: catColor, borderWidth: 2.5, borderColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: 'white', fontSize: 14 }}>{catIcon}</Text>
                </View>
                <View style={{ width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: 'white' }} />
              </View>
              <Callout tooltip onPress={() => { if (ceInfoUrl) Linking.openURL(ceInfoUrl) }}>
                <View style={[ms.calloutCard, isDark && ms.calloutCardDark, { padding: 0, overflow: 'hidden' }]}>
                  {/* Colored header */}
                  <View style={{ backgroundColor: catColor, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: 'white', fontSize: 18, fontWeight: '800' }}>{ceDay}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.95)', fontWeight: '600' }}>{ceDateStr}</Text>
                      <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textTransform: 'uppercase' }}>{ce.category}</Text>
                    </View>
                  </View>
                  {/* Content */}
                  <View style={{ padding: 12 }}>
                    {/* Category badge */}
                    <View style={{ alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 2, backgroundColor: catColor, marginBottom: 6 }}>
                      <Text style={{ fontSize: 9, fontWeight: '600', color: 'white', textTransform: 'uppercase' }}>{ce.category}</Text>
                    </View>
                    <Text style={[ms.calloutTitle, isDark && ms.calloutTitleDark]} numberOfLines={2}>{ce.name_fi}</Text>
                    {ce.description_fi ? <Text style={ms.calloutMuted} numberOfLines={2}>{ce.description_fi.slice(0, 120)}</Text> : null}
                    {ce.location_name ? <Text style={[ms.calloutSmall, { marginTop: 4 }]}>{ce.location_name}</Text> : null}
                    {dist ? <Text style={ms.calloutSmall}>{dist}</Text> : null}
                    {ce.is_free ? (
                      <View style={{ marginTop: 6 }}>
                        <Text style={{
                          fontSize: 11, fontWeight: '600', alignSelf: 'flex-start',
                          color: isDark ? '#34d399' : '#2B8A62',
                          backgroundColor: isDark ? 'rgba(52,211,153,0.15)' : 'rgba(43,138,98,0.1)',
                          paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: 'hidden',
                        }}>Ilmainen</Text>
                      </View>
                    ) : ce.price_info ? <Text style={[ms.calloutSmall, { marginTop: 4 }]}>{ce.price_info.slice(0, 40)}</Text> : null}
                    <View style={[ms.calloutCta, { backgroundColor: ceInfoUrl ? '#2D6B5E' : catColor, borderRadius: 20, marginTop: 10 }]}>
                      <Text style={ms.calloutCtaText}>{ceInfoUrl ? 'Lis\u00E4tietoja \u2192' : 'Reittiohjeet \u2192'}</Text>
                    </View>
                  </View>
                </View>
              </Callout>
            </Marker>
          )
        })}

        {/* ── Place markers (smaller) ── */}
        {filteredPlaces.map((pl) => {
          const pCat = PLACE_CATS[pl.category] ?? PLACE_CATS.other
          const pColor = pCat.color
          const pIcon = pCat.icon
          const dist = userPos ? formatDistance(haversineKm(userPos[0], userPos[1], pl.latitude, pl.longitude)) : ''
          const plWebsite = safeUrl(pl.website)
          return (
            <Marker
              key={`pl-${pl.id}`}
              coordinate={{ latitude: pl.latitude, longitude: pl.longitude }}
              anchor={{ x: 0.5, y: 1 }}
              tracksViewChanges={false}
            >
              <View style={{ width: 30, height: 36, alignItems: 'center' }}>
                <View style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: pColor, opacity: isDark ? 0.9 : 0.85, borderWidth: 2, borderColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: 'white', fontSize: 11 }}>{pIcon}</Text>
                </View>
                <View style={{ width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 5, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: pColor, opacity: 0.85 }} />
              </View>
              <Callout tooltip onPress={() => {
                if (plWebsite) Linking.openURL(plWebsite)
                else Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${pl.latitude},${pl.longitude}`)
              }}>
                <View style={[ms.calloutCard, isDark && ms.calloutCardDark, { padding: 0, overflow: 'hidden' }]}>
                  {/* Category header */}
                  <View style={{ backgroundColor: pColor, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: 'white', fontSize: 14 }}>{pIcon}</Text>
                    <View>
                      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.95)', fontWeight: '600' }}>{pCat.label}</Text>
                      {pl.subcategory ? <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>{pl.subcategory}</Text> : null}
                    </View>
                  </View>
                  {/* Content */}
                  <View style={{ padding: 12 }}>
                    <Text style={[ms.calloutTitle, isDark && ms.calloutTitleDark]}>{pl.name}</Text>
                    {pl.address ? <Text style={[ms.calloutSmall, { marginBottom: 2 }]}>{pl.address}</Text> : null}
                    {dist ? <Text style={ms.calloutSmall}>{dist}</Text> : null}
                    {pl.opening_hours ? <Text style={[ms.calloutSmall, { marginTop: 4 }]}>{pl.opening_hours}</Text> : null}
                    {pl.phone ? <Text style={{ fontSize: 12, color: isDark ? '#6FCF97' : '#2D6B5E', marginTop: 6 }}>{pl.phone}</Text> : null}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      {plWebsite ? (
                        <View style={[ms.calloutCta, { flex: 1, backgroundColor: isDark ? '#6FCF97' : '#2D6B5E', borderRadius: 20 }]}>
                          <Text style={ms.calloutCtaText}>Verkkosivut</Text>
                        </View>
                      ) : null}
                      <View style={[ms.calloutCta, { flex: 1, backgroundColor: pColor, borderRadius: 20 }]}>
                        <Text style={ms.calloutCtaText}>Reittiohjeet</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </Callout>
            </Marker>
          )
        })}
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

      {/* ── COUNT BAR (bottom center) ── */}
      <View style={[ms.countBar, { bottom: insets.bottom + 24, backgroundColor: colors.card, borderColor: colors.border }]}>
        <MapPin size={14} color={colors.mutedForeground} />
        <Text style={[ms.countText, { color: colors.foreground }]}>{totalVisible} {t('map.visible')}</Text>
      </View>

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
  // Callout styles
  calloutCard: { backgroundColor: 'white', borderRadius: 12, padding: 12, minWidth: 220, maxWidth: 280, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },
  calloutCardDark: { backgroundColor: '#1E1E1E' },
  calloutTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A1A', marginBottom: 4, lineHeight: 20 },
  calloutTitleDark: { color: '#E8E6E0' },
  calloutMuted: { fontSize: 12, color: '#6B7280', marginBottom: 6 },
  calloutSmall: { fontSize: 11, color: '#9CA3AF' },
  calloutCta: { marginTop: 10, backgroundColor: '#2D6B5E', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  calloutCtaText: { color: 'white', fontSize: 13, fontWeight: '600' },
  // Empty state
  empty: { position: 'absolute', left: 40, right: 40, top: '40%', zIndex: 10, borderRadius: 16, borderWidth: 1, padding: 24, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },
  emptyTitle: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  emptyBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, marginTop: 4 },
})
