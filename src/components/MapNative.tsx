import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, Pressable, SectionList, Modal, FlatList, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Linking, Platform, Share,
  RefreshControl, TextInput,
  type SectionListData,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fetchNearbyEvents, loadMoreNearbyEvents, hasMoreNearbyEvents, getNearbyEventsTotal, invalidateEventsCache } from '@/lib/linkedevents'
import { fetchTicketmasterEvents } from '@/lib/ticketmaster'
import { fetchHelsinkiPlaces, invalidatePlacesCache } from '@/lib/palvelukartta'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps'
import * as Location from 'expo-location'
import {
  ChevronDown, ChevronUp, MapPin, Navigation, X, Search, Crosshair, ExternalLink, ArrowLeft,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { NEIGHBORHOODS, CATEGORIES } from '@/lib/constants'
import { formatTimeAgo } from '@/lib/format'
import type { Post, PostType, Event, CityEvent, LocalPlace } from '@/lib/types'

// ── Neighborhood Centers ──

const NEIGHBORHOOD_CENTERS: Record<string, { latitude: number; longitude: number }> = {
  'Kallio':        { latitude: 60.1845, longitude: 24.9510 },
  'Sörnäinen':     { latitude: 60.1870, longitude: 24.9650 },
  'Vallila':       { latitude: 60.1920, longitude: 24.9530 },
  'Hermanni':      { latitude: 60.1900, longitude: 24.9600 },
  'Alppiharju':    { latitude: 60.1910, longitude: 24.9480 },
  'Pasila':        { latitude: 60.1980, longitude: 24.9300 },
  'Käpylä':        { latitude: 60.2100, longitude: 24.9450 },
  'Kumpula':       { latitude: 60.2050, longitude: 24.9600 },
  'Toukola':       { latitude: 60.2000, longitude: 24.9650 },
  'Arabia':        { latitude: 60.2050, longitude: 24.9800 },
  'Kruununhaka':   { latitude: 60.1720, longitude: 24.9560 },
  'Katajanokka':   { latitude: 60.1670, longitude: 24.9660 },
  'Punavuori':     { latitude: 60.1620, longitude: 24.9410 },
  'Ullanlinna':    { latitude: 60.1580, longitude: 24.9500 },
  'Eira':          { latitude: 60.1560, longitude: 24.9400 },
  'Töölö':         { latitude: 60.1780, longitude: 24.9250 },
  'Meilahti':      { latitude: 60.1880, longitude: 24.9100 },
  'Munkkiniemi':   { latitude: 60.1970, longitude: 24.8800 },
  'Lauttasaari':   { latitude: 60.1600, longitude: 24.8750 },
  'Ruoholahti':    { latitude: 60.1640, longitude: 24.9150 },
  'Jätkäsaari':    { latitude: 60.1580, longitude: 24.9100 },
  'Kamppi':        { latitude: 60.1690, longitude: 24.9310 },
  'Hakaniemi':     { latitude: 60.1790, longitude: 24.9510 },
  'Merihaka':      { latitude: 60.1780, longitude: 24.9620 },
  'Kulosaari':     { latitude: 60.1880, longitude: 24.9950 },
  'Herttoniemi':   { latitude: 60.1980, longitude: 25.0200 },
  'Laajasalo':     { latitude: 60.1750, longitude: 25.0500 },
  'Vuosaari':      { latitude: 60.2100, longitude: 25.1400 },
  'Mellunmäki':    { latitude: 60.2350, longitude: 25.1050 },
  'Kontula':       { latitude: 60.2350, longitude: 25.0850 },
  'Malmi':         { latitude: 60.2500, longitude: 25.0100 },
  'Tapanila':      { latitude: 60.2600, longitude: 25.0100 },
  'Pukinmäki':     { latitude: 60.2420, longitude: 24.9950 },
  'Oulunkylä':     { latitude: 60.2300, longitude: 24.9600 },
  'Maunula':       { latitude: 60.2200, longitude: 24.9350 },
  'Pitäjänmäki':   { latitude: 60.2230, longitude: 24.8600 },
  'Haaga':         { latitude: 60.2150, longitude: 24.9000 },
  'Viikki':        { latitude: 60.2270, longitude: 25.0200 },
  'Suutarila':     { latitude: 60.2700, longitude: 24.9900 },
  'Tapulikaupunki': { latitude: 60.2650, longitude: 25.0100 },
}

// ── Constants ──

// Adaptive radius: dense central neighborhoods get 0.8km, outer suburbs 1.5km
const DENSE_NEIGHBORHOODS = new Set([
  'Kallio', 'Sörnäinen', 'Kamppi', 'Punavuori', 'Kruununhaka',
  'Katajanokka', 'Hakaniemi', 'Ullanlinna', 'Eira', 'Töölö',
  'Ruoholahti', 'Jätkäsaari', 'Merihaka', 'Hermanni', 'Alppiharju',
])
function getRadiusKm(neighborhood: string): number {
  if (neighborhood === '__gps__') return 1.0
  if (DENSE_NEIGHBORHOODS.has(neighborhood)) return 0.8
  return 1.5
}
const MAX_MAP_MARKERS = 20
const MAP_HEIGHT = 250

// 3 layer colors — match filter pills, simple for user to understand
const LAYER_COLORS = {
  post: '#2D6B5E',       // green — TackBird primary, matches "Ilmoitukset" pill
  event: '#8E44AD',      // purple — distinct, matches "Tapahtumat" pill
  place: '#78716C',      // warm gray — background/utility, matches "Paikat" pill
} as const

const PLACE_LABEL: Record<string, string> = {
  restaurant: 'Ravintola', cafe: 'Kahvila', bar: 'Baari', shop: 'Kauppa',
  library: 'Kirjasto', health: 'Terveys', sport: 'Urheilu', culture: 'Kulttuuri',
  hotel: 'Hotelli', attraction: 'Nähtävyys', service: 'Palvelu',
  fast_food: 'Pikaruoka', pub: 'Pubi', other: 'Muu',
}

// Sub-categories for 2-level filter
const POST_SUBCATS = [
  { key: null, label: 'Kaikki', color: LAYER_COLORS.post },
  { key: 'tarvitsen', label: 'Tarvitsen', color: '#C75B3A' },
  { key: 'tarjoan', label: 'Tarjoan', color: '#7C5CBF' },
  { key: 'ilmaista', label: 'Ilmaista', color: '#3B7DD8' },
  { key: 'nappaa', label: 'Nappaa', color: '#E8A050' },
  { key: 'lainaa', label: 'Lainaa', color: '#C98B2E' },
  { key: 'tapahtuma', label: 'Tapahtuma', color: '#2B8A62' },
]

const EVENT_SUBCATS = [
  { key: null, label: 'Kaikki' },
  { key: 'culture', label: 'Kulttuuri' },
  { key: 'music', label: 'Musiikki' },
  { key: 'sport', label: 'Urheilu' },
  { key: 'family', label: 'Perhe' },
  { key: 'theatre', label: 'Teatteri' },
  { key: 'exhibition', label: 'Näyttely' },
  { key: 'food', label: 'Ruoka' },
  { key: 'other', label: 'Muu' },
]

const PLACE_SUBCATS = [
  { key: null, label: 'Kaikki' },
  { key: 'restaurant', label: 'Ravintolat' },
  { key: 'cafe', label: 'Kahvilat' },
  { key: 'bar', label: 'Baarit' },
  { key: 'shop', label: 'Kaupat' },
  { key: 'culture', label: 'Kulttuuri' },
  { key: 'sport', label: 'Urheilu' },
  { key: 'library', label: 'Kirjastot' },
  { key: 'health', label: 'Terveys' },
]

const TIME_FILTERS = [
  { key: 'all' as const, label: 'Kaikki' },
  { key: 'today' as const, label: 'Tänään' },
  { key: 'tomorrow' as const, label: 'Huomenna' },
  { key: 'week' as const, label: 'Tällä vkolla' },
]

// Dark map style
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
]

// ── Helpers ──

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

function isPast(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return d < now
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}

function isTomorrow(dateStr: string): boolean {
  const d = new Date(dateStr)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate()
}

function isWithinDays(dateStr: string, days: number): boolean {
  const d = new Date(dateStr).getTime()
  const now = Date.now()
  return d >= now && d <= now + days * 24 * 60 * 60 * 1000
}

// ── Unified list item ──

type ItemKind = 'post' | 'community_event' | 'city_event' | 'place'

interface ListItem {
  id: string
  kind: ItemKind
  title: string
  subtitle: string
  color: string
  latitude: number
  longitude: number
  distance: number
  sortDate?: string
  sourceData: Post | Event | CityEvent | LocalPlace
}

// ── Stable marker ──

interface StableMarker {
  key: string
  latitude: number
  longitude: number
  pinColor: string
  title: string
  description: string
}

type FilterKey = 'all' | 'posts' | 'events' | 'places'

interface Section {
  title: string
  data: ListItem[]
}

// ══════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════

export default function MapScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const mapRef = useRef<MapView | null>(null)
  const sectionListRef = useRef<SectionList<ListItem, Section> | null>(null)

  // ── State ──
  const [posts, setPosts] = useState<Post[]>([])
  const [communityEvents, setCommunityEvents] = useState<Event[]>([])
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([])
  const [places, setPlaces] = useState<LocalPlace[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedNeighborhood, setSelectedNeighborhood] = useState('Kallio')
  const [neighborhoodModalVisible, setNeighborhoodModalVisible] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [subCategory, setSubCategory] = useState<string | null>(null)
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'tomorrow' | 'week'>('all')
  const [mapExpanded, setMapExpanded] = useState(false)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null)
  const [neighborhoodLoading, setNeighborhoodLoading] = useState(false)

  // Stable marker state for diffing
  const [renderedMarkers, setRenderedMarkers] = useState<StableMarker[]>([])
  const prevMarkersRef = useRef<string>('')

  // ── Load user profile neighborhood ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (user) {
        const { data } = await (supabase
          .from('profiles') as any)
          .select('naapurusto')
          .eq('id', user.id)
          .single() as { data: { naapurusto?: string } | null }
        if (!cancelled && data?.naapurusto && NEIGHBORHOOD_CENTERS[data.naapurusto]) {
          setSelectedNeighborhood(data.naapurusto)
        } else if (!cancelled) {
          setNeighborhoodModalVisible(true)
        }
      } else if (!cancelled) {
        setNeighborhoodModalVisible(true)
      }
    })()
    return () => { cancelled = true }
  }, [supabase])

  // ── Get center for current neighborhood ──
  const center = useMemo(() => {
    if (selectedNeighborhood === '__gps__' && userLocation) {
      return userLocation
    }
    return NEIGHBORHOOD_CENTERS[selectedNeighborhood] ?? NEIGHBORHOOD_CENTERS['Kallio']
  }, [selectedNeighborhood, userLocation])

  // ── Fetch posts + events (global, once) ──
  const fetchGlobalData = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const [postsRes, eventsRes, cityEventsData, tmData] = await Promise.all([
        supabase.from('posts')
          .select('id, user_id, type, title, description, location, latitude, longitude, image_url, daily_fee, created_at, user:profiles!posts_user_id_fkey(id, name, avatar_url)')
          .eq('is_active', true)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .gte('latitude', 60.10).lte('latitude', 60.35)
          .gte('longitude', 24.75).lte('longitude', 25.30)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('events')
          .select('id, post_id, creator_id, title, description, event_date, location_name, location_lat, location_lng, icon, max_attendees, created_at, creator:profiles!events_creator_id_fkey(id, name, avatar_url)')
          .gte('event_date', today)
          .not('location_lat', 'is', null)
          .not('location_lng', 'is', null)
          .gte('location_lat', 60.10).lte('location_lat', 60.35)
          .gte('location_lng', 24.75).lte('location_lng', 25.30)
          .order('event_date', { ascending: true })
          .limit(500),
        fetchNearbyEvents(60.1699, 24.9384, 10),  // Koko Helsinki — tapahtumat ovat kaupunkitasoa
        fetchTicketmasterEvents(),
      ])
      if (postsRes.data) setPosts(postsRes.data as unknown as Post[])
      if (eventsRes.data) setCommunityEvents(eventsRes.data as unknown as Event[])
      // Merge LinkedEvents + Ticketmaster, dedupe by normalized name
      const linkedEvents = cityEventsData
      const tmEvents = tmData
      const allCityEvents = [...linkedEvents]
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-zäöå0-9]/g, '').slice(0, 30)
      const linkedNames = new Set(linkedEvents.map(e => normalize(e.name_fi)))
      for (const tm of tmEvents) {
        if (!linkedNames.has(normalize(tm.name_fi))) {
          allCityEvents.push(tm)
        }
      }
      setCityEvents(allCityEvents)
      const withCoords = allCityEvents.filter(e => e.latitude && e.longitude).length
      console.log(`[map] Events: ${linkedEvents.length} LinkedEvents + ${tmEvents.length} Ticketmaster = ${allCityEvents.length} merged (${withCoords} with coords)`)
      if (postsRes.error) console.log('[map] posts error:', postsRes.error.message)
      if (eventsRes.error) console.log('[map] events error:', eventsRes.error.message)
    } catch (err) {
      console.log('[map] global fetch error:', err)
    }
  }, [supabase, center])

  // ── Fetch places from Helsinki Palvelukartta (per neighborhood) ──
  const fetchPlaces = useCallback(async () => {
    try {
      const radius = getRadiusKm(selectedNeighborhood)
      const placesData = await fetchHelsinkiPlaces(center.latitude, center.longitude, radius * 1000)
      setPlaces(placesData)
      console.log(`[map] Palvelukartta: ${placesData.length} places near ${selectedNeighborhood}`)
    } catch (err) {
      console.log('[map] places fetch error:', err)
    }
  }, [center, selectedNeighborhood])

  // ── Initial load ──
  const fetchData = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchGlobalData(), fetchPlaces()])
    setLoading(false)
  }, [fetchGlobalData, fetchPlaces])

  useEffect(() => { fetchData() }, [fetchData])

  // Pull-to-refresh: only re-fetch neighborhood-specific places (fast).
  // Global data (posts, events) is fetched once on mount and doesn't change rapidly.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    // Invalidate cache for this specific neighborhood so we get fresh data
    invalidatePlacesCache(center.latitude, center.longitude)
    await fetchPlaces()
    setRefreshing(false)
  }, [fetchPlaces, center])

  // Full refresh: re-fetches everything including global data.
  // Called from a manual action if needed, not on every pull-to-refresh.
  const handleFullRefresh = useCallback(async () => {
    setRefreshing(true)
    invalidatePlacesCache(center.latitude, center.longitude)
    invalidateEventsCache()
    await Promise.all([fetchGlobalData(), fetchPlaces()])
    setRefreshing(false)
  }, [fetchGlobalData, fetchPlaces, center])

  const loadingMoreRef = useRef(false)
  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreNearbyEvents(center.latitude, center.longitude)) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const more = await loadMoreNearbyEvents(center.latitude, center.longitude)
    if (more) {
      setCityEvents(prev => {
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-zäöå0-9]/g, '').slice(0, 30)
        const tmEvents = prev.filter(e => e.source === 'ticketmaster')
        const linkedNames = new Set(more.map(e => normalize(e.name_fi)))
        const uniqueTm = tmEvents.filter(e => !linkedNames.has(normalize(e.name_fi)))
        return [...more, ...uniqueTm]
      })
    }
    loadingMoreRef.current = false
    setLoadingMore(false)
  }, [center])

  // ── Build list items filtered by radius ──
  const radiusKm = useMemo(() => getRadiusKm(selectedNeighborhood), [selectedNeighborhood])
  const allItems = useMemo<ListItem[]>(() => {
    const cLat = center.latitude
    const cLng = center.longitude
    const items: ListItem[] = []

    // Posts
    for (const p of posts) {
      if (p.latitude == null || p.longitude == null) continue
      const dist = haversineKm(cLat, cLng, p.latitude, p.longitude)
      if (dist > radiusKm) continue
      const cat = CATEGORIES[p.type as PostType]
      const catLabel = cat ? t(cat.label) : ''
      const userName = (p as any).user?.name ?? ''
      const parts = [catLabel, p.location, userName].filter(Boolean)
      items.push({
        id: `post-${p.id}`,
        kind: 'post',
        title: p.title,
        subtitle: parts.join(' · '),
        color: LAYER_COLORS.post,
        latitude: p.latitude,
        longitude: p.longitude,
        distance: dist,
        sortDate: p.created_at,
        sourceData: p,
      })
    }

    // Community events (future only) — no radius limit, already filtered by Supabase
    for (const e of communityEvents) {
      if (e.location_lat == null || e.location_lng == null) continue
      if (e.event_date && isPast(e.event_date)) continue
      const dist = haversineKm(cLat, cLng, e.location_lat, e.location_lng)
      const dateStr = new Date(e.event_date).toLocaleDateString(locale === 'sv' ? 'sv-SE' : locale === 'en' ? 'en-GB' : 'fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })
      const creator = (e as any).creator?.name ?? ''
      const evParts = [dateStr, e.location_name, creator].filter(Boolean)
      items.push({
        id: `event-${e.id}`,
        kind: 'community_event',
        title: e.title,
        subtitle: evParts.join(' · '),
        color: LAYER_COLORS.event,
        latitude: e.location_lat,
        longitude: e.location_lng,
        distance: dist,
        sortDate: e.event_date,
        sourceData: e,
      })
    }

    // City events (future only) — no radius limit for list, already filtered by bbox API
    for (const c of cityEvents) {
      if (c.latitude == null || c.longitude == null) continue
      if (c.start_time && isPast(c.start_time)) continue
      const dist = haversineKm(cLat, cLng, c.latitude, c.longitude)
      const name = locale === 'sv' ? (c.name_sv ?? c.name_fi) :
                   locale === 'en' ? (c.name_en ?? c.name_fi) : c.name_fi
      const ceDateStr = new Date(c.start_time).toLocaleDateString(locale === 'sv' ? 'sv-SE' : locale === 'en' ? 'en-GB' : 'fi-FI', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      const ceParts = [ceDateStr, c.location_name, c.is_free ? t('events.free') : null].filter(Boolean)
      items.push({
        id: `city-${c.id}`,
        kind: 'city_event',
        title: name,
        subtitle: ceParts.join(' · '),
        color: LAYER_COLORS.event,
        latitude: c.latitude,
        longitude: c.longitude,
        distance: dist,
        sortDate: c.start_time,
        sourceData: c,
      })
    }

    // Places
    for (const pl of places) {
      const dist = haversineKm(cLat, cLng, pl.latitude, pl.longitude)
      if (dist > radiusKm) continue
      const plLabel = t(`placeCategories.${pl.category}`) !== `placeCategories.${pl.category}`
        ? t(`placeCategories.${pl.category}`)
        : PLACE_LABEL[pl.category] ?? ''
      const plParts = [plLabel, pl.address, pl.opening_hours].filter(Boolean)
      items.push({
        id: `place-${pl.id}`,
        kind: 'place',
        title: pl.name,
        subtitle: plParts.join(' · '),
        color: LAYER_COLORS.place,
        latitude: pl.latitude,
        longitude: pl.longitude,
        distance: dist,
        sourceData: pl,
      })
    }

    return items
  }, [posts, communityEvents, cityEvents, places, center, locale, t, radiusKm])

  // ── Filter by active filter + sub-category + time + search ──
  const filteredItems = useMemo(() => {
    let items = allItems
    // Layer filter
    if (activeFilter === 'posts') items = items.filter(i => i.kind === 'post')
    else if (activeFilter === 'events') items = items.filter(i => i.kind === 'community_event' || i.kind === 'city_event')
    else if (activeFilter === 'places') items = items.filter(i => i.kind === 'place')

    // Sub-category filter
    if (subCategory) {
      if (activeFilter === 'posts') {
        items = items.filter(i => i.kind === 'post' && (i.sourceData as Post).type === subCategory)
      } else if (activeFilter === 'events') {
        items = items.filter(i => {
          if (i.kind === 'city_event') return (i.sourceData as CityEvent).category === subCategory
          // Community events don't have sub-categories — hide them when sub-category is active
          return false
        })
      } else if (activeFilter === 'places') {
        items = items.filter(i => i.kind === 'place' && (i.sourceData as LocalPlace).category === subCategory)
      }
    }

    // Time filter (events only)
    if (timeFilter !== 'all' && (activeFilter === 'events' || activeFilter === 'all')) {
      items = items.filter(i => {
        if (i.kind !== 'community_event' && i.kind !== 'city_event') return true
        if (!i.sortDate) return false
        if (timeFilter === 'today') return isToday(i.sortDate)
        if (timeFilter === 'tomorrow') return isTomorrow(i.sortDate)
        if (timeFilter === 'week') return isWithinDays(i.sortDate, 7)
        return true
      })
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      items = items.filter(i => i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q))
    }
    return items
  }, [allItems, activeFilter, subCategory, timeFilter, searchQuery])

  // ── Counts for filter pills (single-pass, reflects search filtering) ──
  const counts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let all = 0, posts = 0, events = 0, places = 0
    for (const item of allItems) {
      if (q && !item.title.toLowerCase().includes(q) && !item.subtitle.toLowerCase().includes(q)) {
        continue
      }
      all++
      if (item.kind === 'post') posts++
      else if (item.kind === 'community_event' || item.kind === 'city_event') events++
      else if (item.kind === 'place') places++
    }
    return { all, posts, events, places }
  }, [allItems, searchQuery])

  // ── Build sections (bucket + insert-sort in a single pass) ──
  const sections = useMemo(() => {
    const eventsToday: ListItem[] = []
    const eventsUpcoming: ListItem[] = []
    const postItems: ListItem[] = []
    const placeItems: ListItem[] = []

    // Helper: binary-insert into a sorted array to avoid a separate sort pass
    function insertSorted(arr: ListItem[], item: ListItem, cmp: (a: ListItem, b: ListItem) => number) {
      let lo = 0, hi = arr.length
      while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (cmp(arr[mid], item) <= 0) lo = mid + 1
        else hi = mid
      }
      arr.splice(lo, 0, item)
    }

    const byDistanceAsc = (a: ListItem, b: ListItem) => a.distance - b.distance
    const byDateAsc = (a: ListItem, b: ListItem) => (a.sortDate ?? '').localeCompare(b.sortDate ?? '')
    const byDateDesc = (a: ListItem, b: ListItem) => (b.sortDate ?? '').localeCompare(a.sortDate ?? '')

    for (const item of filteredItems) {
      if (item.kind === 'community_event' || item.kind === 'city_event') {
        if (item.sortDate && isToday(item.sortDate)) {
          insertSorted(eventsToday, item, byDistanceAsc)
        } else {
          insertSorted(eventsUpcoming, item, byDateAsc)
        }
      } else if (item.kind === 'post') {
        insertSorted(postItems, item, byDateDesc)
      } else if (item.kind === 'place') {
        // Places don't have sortDate — sort by distance only
        insertSorted(placeItems, item, byDistanceAsc)
      }
    }

    const result: Section[] = []
    // Always show "today" section when events filter active (even if empty — tells user nothing is on today)
    const showEvents = activeFilter === 'all' || activeFilter === 'events'
    if (showEvents && (eventsToday.length > 0 || eventsUpcoming.length > 0)) {
      result.push({ title: t('events.filterToday'), data: eventsToday.length > 0 ? eventsToday : [{ id: '__empty_today__', kind: 'empty' as any, title: t('map.noEventsToday'), subtitle: '', color: '#9CA3AF', latitude: 0, longitude: 0, distance: 0, sourceData: {} as any }] })
    }
    if (eventsUpcoming.length > 0) result.push({ title: t('discover.upcomingEvents'), data: eventsUpcoming })
    if (postItems.length > 0) result.push({ title: t('map.layerPosts'), data: postItems })
    if (placeItems.length > 0) result.push({ title: t('map.layerPlaces'), data: placeItems })

    return result
  }, [filteredItems, t, activeFilter])

  // ── Map markers (max 20, stable diff) ──
  useEffect(() => {
    const realItems = filteredItems.filter(i => !i.id.startsWith('__empty_'))
    const sorted = [...realItems].sort((a, b) => a.distance - b.distance)
    const top = sorted.slice(0, MAX_MAP_MARKERS)
    const next: StableMarker[] = top.map(item => ({
      key: item.id,
      latitude: item.latitude,
      longitude: item.longitude,
      pinColor: item.color,
      title: item.title,
      description: `${item.subtitle} · ${formatDistance(item.distance)}`,
    }))

    const nextKey = next.map(m => m.key).join(',')
    if (nextKey !== prevMarkersRef.current) {
      prevMarkersRef.current = nextKey
      setRenderedMarkers(next)
    }
  }, [filteredItems])

  // ── Animate map to center when neighborhood changes ──
  useEffect(() => {
    const delta = DENSE_NEIGHBORHOODS.has(selectedNeighborhood) ? 0.012 : 0.022
    mapRef.current?.animateToRegion({
      ...center,
      latitudeDelta: delta,
      longitudeDelta: delta,
    }, 500)
  }, [center, selectedNeighborhood])

  // ── Actions ──

  const handleListItemNavigate = useCallback((item: ListItem) => {
    if (item.id.startsWith('__empty_')) return
    setSelectedItem(item)
    // Also animate map
    mapRef.current?.animateToRegion({
      latitude: item.latitude, longitude: item.longitude,
      latitudeDelta: 0.005, longitudeDelta: 0.005,
    }, 400)
  }, [])

  // O(1) lookup map for marker press — rebuilt when filteredItems changes
  const itemLookup = useMemo(() => {
    const map = new Map<string, ListItem>()
    for (const item of filteredItems) {
      map.set(item.id, item)
    }
    return map
  }, [filteredItems])

  // O(1) lookup for section scroll position — rebuilt when sections change
  const sectionIndexLookup = useMemo(() => {
    const map = new Map<string, { sectionIndex: number; itemIndex: number }>()
    for (let s = 0; s < sections.length; s++) {
      for (let i = 0; i < sections[s].data.length; i++) {
        map.set(sections[s].data[i].id, { sectionIndex: s, itemIndex: i })
      }
    }
    return map
  }, [sections])

  const handleMarkerPress = useCallback((marker: StableMarker) => {
    const item = itemLookup.get(marker.key)
    if (item && !item.id.startsWith('__empty_')) {
      setSelectedItem(item)
    }
  }, [itemLookup])

  const handleGPSSelect = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(t('map.locationPermission'), t('map.locationPermissionDesc'))
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
      setSelectedNeighborhood('__gps__')
      setNeighborhoodModalVisible(false)
    } catch {
      Alert.alert(t('map.locationPermission'), t('map.locationFailed'))
    }
  }, [t])

  // ── Render ──

  const renderSectionHeader = useCallback(({ section }: { section: SectionListData<ListItem, Section> }) => (
    <View style={[styles.sectionHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        {section.title}
      </Text>
      <View style={[styles.sectionCountBadge, { backgroundColor: colors.muted }]}>
        <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
          {section.data.filter(d => !d.id.startsWith('__empty_')).length}
        </Text>
      </View>
    </View>
  ), [colors])

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    // Empty placeholder row
    if (item.id.startsWith('__empty_')) {
      return (
        <View style={[cs.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[cs.emptyText, { color: colors.mutedForeground }]}>{item.title}</Text>
        </View>
      )
    }

    // Extract image URL from sourceData
    const imageUrl = item.kind === 'city_event' ? (item.sourceData as CityEvent).image_url
      : item.kind === 'place' ? (item.sourceData as LocalPlace).image_url
      : item.kind === 'post' ? (item.sourceData as Post).image_url
      : null

    // Extract extra info per type
    const isEvent = item.kind === 'community_event' || item.kind === 'city_event'
    const isCityEvent = item.kind === 'city_event'
    const isCommunityEvent = item.kind === 'community_event'
    const isPlace = item.kind === 'place'
    const isPost = item.kind === 'post'

    const isFree = isCityEvent && (item.sourceData as CityEvent).is_free
    const price = isCityEvent ? (item.sourceData as CityEvent).price_info : null
    const isTicketmaster = isCityEvent && (item.sourceData as CityEvent).source === 'ticketmaster'
    const isLinkedEvents = isCityEvent && (item.sourceData as CityEvent).source === 'linkedevents'
    const userName = isPost ? ((item.sourceData as any).user?.name ?? null) : null
    const postType = isPost ? (item.sourceData as Post).type : null
    const cat = isPost && postType ? CATEGORIES[postType as PostType] : null
    const placeCategory = isPlace ? PLACE_LABEL[(item.sourceData as LocalPlace).category] : null

    return (
      <Pressable
        style={({ pressed }) => [cs.card, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
        onPress={() => handleListItemNavigate(item)}
      >
        {/* Color accent bar */}
        <View style={[cs.accentBar, { backgroundColor: item.color }]} />

        <View style={cs.cardBody}>
          {/* Image or avatar */}
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={cs.cardImage} contentFit="cover" />
          ) : (
            <View style={[cs.cardImagePlaceholder, { backgroundColor: `${item.color}15` }]}>
              <MapPin size={18} color={item.color} />
            </View>
          )}

          {/* Content */}
          <View style={cs.cardContent}>
            {/* Category / type badge */}
            <View style={cs.cardBadgeRow}>
              {cat && (
                <View style={[cs.badge, { backgroundColor: `${item.color}18` }]}>
                  <Text style={[cs.badgeText, { color: item.color }]}>{t(cat.label)}</Text>
                </View>
              )}
              {isEvent && item.sortDate && (
                <View style={[cs.badge, { backgroundColor: `${item.color}18` }]}>
                  <Text style={[cs.badgeText, { color: item.color }]}>
                    {new Date(item.sortDate).toLocaleDateString(locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              )}
              {placeCategory && (
                <View style={[cs.badge, { backgroundColor: `${item.color}18` }]}>
                  <Text style={[cs.badgeText, { color: item.color }]}>{placeCategory}</Text>
                </View>
              )}
              {isLinkedEvents && (
                <View style={[cs.badge, { backgroundColor: '#8E44AD18' }]}>
                  <Text style={[cs.badgeText, { color: '#8E44AD' }]}>Helsinki</Text>
                </View>
              )}
              {isTicketmaster && (
                <View style={[cs.badge, { backgroundColor: '#E91E6318' }]}>
                  <Text style={[cs.badgeText, { color: '#E91E63' }]}>Liput</Text>
                </View>
              )}
              {isCommunityEvent && (
                <View style={[cs.badge, { backgroundColor: '#2B8A6218' }]}>
                  <Text style={[cs.badgeText, { color: '#2B8A62' }]}>Yhteisö</Text>
                </View>
              )}
              {isFree && (
                <View style={[cs.badge, { backgroundColor: '#2B8A6218' }]}>
                  <Text style={[cs.badgeText, { color: '#2B8A62' }]}>{t('events.free')}</Text>
                </View>
              )}
            </View>

            {/* Title */}
            <Text style={[cs.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>

            {/* Meta row */}
            <View style={cs.metaRow}>
              {item.subtitle ? (
                <Text style={[cs.meta, { color: colors.mutedForeground }]} numberOfLines={1}>{item.subtitle}</Text>
              ) : null}
            </View>

            {/* Bottom row: distance + user */}
            <View style={cs.bottomRow}>
              <Text style={[cs.distance, { color: colors.mutedForeground }]}>
                {formatDistance(item.distance)}
              </Text>
              {userName && (
                <Text style={[cs.userName, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {userName}
                </Text>
              )}
              {isPost && item.sortDate && (
                <Text style={[cs.distance, { color: colors.mutedForeground }]}>
                  {formatTimeAgo(item.sortDate, t, locale)}
                </Text>
              )}
              {price && !isFree && (
                <Text style={[cs.price, { color: colors.foreground }]}>{price}</Text>
              )}
            </View>
          </View>
        </View>
      </Pressable>
    )
  }, [colors, handleListItemNavigate, locale, t])

  const keyExtractor = useCallback((item: ListItem) => item.id, [])

  const displayNeighborhood = selectedNeighborhood === '__gps__' ? t('map.myLocation') : selectedNeighborhood

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Top Bar ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.topBarIcon} hitSlop={8}>
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>
        <Pressable
          style={[styles.neighborhoodButton, { borderColor: colors.border }]}
          onPress={() => setNeighborhoodModalVisible(true)}
        >
          <MapPin size={14} color={colors.primary} />
          <Text style={[styles.neighborhoodText, { color: colors.foreground }]} numberOfLines={1}>
            {displayNeighborhood}
          </Text>
          <ChevronDown size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable onPress={() => { if (showSearch) { setShowSearch(false); setSearchQuery('') } else { setShowSearch(true) } }} style={styles.topBarIcon} hitSlop={8}>
          <Search size={20} color={showSearch ? colors.primary : colors.mutedForeground} />
        </Pressable>
      </View>

      {/* ── Search Bar ── */}
      {showSearch && (
        <>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Search size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('map.searchPlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <X size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
        {searchQuery.trim().length > 0 && (
          <Text style={[styles.searchCount, { color: colors.mutedForeground }]}>
            {filteredItems.length} {t('map.items')}
          </Text>
        )}
        </>
      )}

      {/* ── Mini Map ── */}
      <View style={[styles.mapContainer, mapExpanded && { height: 400 }]}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={{
            ...center,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }}
          customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          pitchEnabled={false}
          rotateEnabled={false}
        >
          {renderedMarkers.map(m => (
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
        {(loading || neighborhoodLoading) && (
          <View style={styles.mapOverlay}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}
        {/* Expand/collapse toggle */}
        <Pressable
          onPress={() => setMapExpanded(prev => !prev)}
          style={[styles.mapToggleBtn, { backgroundColor: colors.card, top: 8 }]}
        >
          {mapExpanded ? <ChevronUp size={18} color={colors.foreground} /> : <ChevronDown size={18} color={colors.foreground} />}
        </Pressable>
        <Pressable
          onPress={handleGPSSelect}
          style={[
            styles.gpsButton,
            {
              backgroundColor: selectedNeighborhood === '__gps__' ? colors.primary : colors.card,
              shadowColor: '#000',
            },
          ]}
        >
          <Crosshair size={20} color={selectedNeighborhood === '__gps__' ? '#FFF' : colors.foreground} />
        </Pressable>
      </View>

      {/* ── Map info bar ── */}
      {renderedMarkers.length > 0 && filteredItems.length > renderedMarkers.length && (
        <View style={[styles.mapInfoBar, { backgroundColor: colors.muted }]}>
          <Text style={[styles.mapInfoText, { color: colors.mutedForeground }]}>
            {renderedMarkers.length} / {filteredItems.length} lähintä kartalla
          </Text>
        </View>
      )}

      {/* ── Filter Pills (2-level) ── */}
      <View style={[styles.filterRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {neighborhoodLoading && (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 4 }} />
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
          {(activeFilter === 'posts' || activeFilter === 'events' || activeFilter === 'places') ? (
            <>
              {/* Back to main filters */}
              <Pressable
                style={[styles.filterPill, {
                  backgroundColor: activeFilter === 'posts' ? LAYER_COLORS.post : activeFilter === 'events' ? LAYER_COLORS.event : LAYER_COLORS.place,
                  borderColor: 'transparent',
                }]}
                onPress={() => { setActiveFilter('all'); setSubCategory(null); setTimeFilter('all') }}
              >
                <ArrowLeft size={14} color="#FFF" />
                <Text style={[styles.filterPillText, { color: '#FFF' }]}>
                  {activeFilter === 'posts' ? t('map.layerPosts') : activeFilter === 'events' ? t('map.layerEvents') : t('map.layerPlaces')}
                </Text>
              </Pressable>

              {/* Time filters (events only) */}
              {activeFilter === 'events' && TIME_FILTERS.map(tf => (
                <Pressable
                  key={tf.key}
                  style={[
                    styles.filterPill,
                    { borderColor: timeFilter === tf.key ? LAYER_COLORS.event : colors.border },
                    timeFilter === tf.key && { backgroundColor: LAYER_COLORS.event },
                  ]}
                  onPress={() => setTimeFilter(prev => prev === tf.key ? 'all' : tf.key)}
                >
                  <Text style={[styles.filterPillText, { color: timeFilter === tf.key ? '#FFF' : colors.foreground }]}>
                    {tf.label}
                  </Text>
                </Pressable>
              ))}

              {/* Sub-category pills — post categories use their own colors */}
              {activeFilter === 'posts' ? (
                POST_SUBCATS.map(sc => {
                  const isActive = subCategory === sc.key
                  return (
                    <Pressable
                      key={sc.key ?? '__all__'}
                      style={[
                        styles.filterPill,
                        { borderColor: isActive ? sc.color : colors.border },
                        isActive && { backgroundColor: sc.color },
                      ]}
                      onPress={() => setSubCategory(prev => prev === sc.key ? null : sc.key)}
                    >
                      <Text style={[styles.filterPillText, { color: isActive ? '#FFF' : colors.foreground }]}>
                        {sc.label}
                      </Text>
                    </Pressable>
                  )
                })
              ) : (
                (activeFilter === 'events' ? EVENT_SUBCATS : PLACE_SUBCATS).map(sc => {
                  const layerColor = activeFilter === 'events' ? LAYER_COLORS.event : LAYER_COLORS.place
                  const isActive = subCategory === sc.key
                  return (
                    <Pressable
                      key={sc.key ?? '__all__'}
                      style={[
                        styles.filterPill,
                        { borderColor: isActive ? layerColor : colors.border },
                        isActive && { backgroundColor: layerColor },
                      ]}
                      onPress={() => setSubCategory(prev => prev === sc.key ? null : sc.key)}
                    >
                      <Text style={[styles.filterPillText, { color: isActive ? '#FFF' : colors.foreground }]}>
                        {sc.label}
                      </Text>
                    </Pressable>
                  )
                })
              )}
            </>
          ) : (
            /* Main layer filters */
            ([
              { key: 'all' as FilterKey, label: t('events.filterAll'), color: colors.primary },
              { key: 'posts' as FilterKey, label: t('map.layerPosts'), color: LAYER_COLORS.post },
              { key: 'events' as FilterKey, label: t('map.layerEvents'), color: LAYER_COLORS.event },
              { key: 'places' as FilterKey, label: t('map.layerPlaces'), color: LAYER_COLORS.place },
            ]).map(f => {
              const isActive = activeFilter === f.key
              return (
                <Pressable
                  key={f.key}
                  style={[
                    styles.filterPill,
                    { borderColor: isActive ? f.color : colors.border },
                    isActive && { backgroundColor: f.color },
                  ]}
                  onPress={() => { setActiveFilter(f.key); setSubCategory(null); setTimeFilter('all') }}
                >
                  <Text style={[styles.filterPillText, { color: isActive ? '#FFF' : colors.foreground }]}>
                    {f.label} ({counts[f.key]})
                  </Text>
                </Pressable>
              )
            })
          )}
        </ScrollView>
      </View>

      {/* ── Section List ── */}
      {loading && sections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {t('map.loadingMap')}
          </Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MapPin size={32} color={colors.mutedForeground} />
          {searchQuery.trim() ? (
            <>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {t('map.noSearchResults')} '{searchQuery}'
              </Text>
              <Pressable onPress={() => setSearchQuery('')} style={[styles.emptyActionBtn, { borderColor: colors.primary }]}>
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>{t('map.clearSearch')}</Text>
              </Pressable>
            </>
          ) : activeFilter !== 'all' ? (
            <>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {t('map.noContentInArea')} {displayNeighborhood}
              </Text>
              <Pressable onPress={() => setActiveFilter('all')} style={[styles.emptyActionBtn, { borderColor: colors.primary }]}>
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>{t('map.showAll')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {t('map.noContentInArea')} {displayNeighborhood}
              </Text>
              <Text style={[styles.emptyHintText, { color: colors.mutedForeground }]}>
                {t('map.tryAnotherArea')}
              </Text>
            </>
          )}
        </View>
      ) : (
        <SectionList
          ref={sectionListRef}
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: insets.bottom + 80, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleFullRefresh} tintColor={colors.primary} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <MapPin size={32} color={colors.mutedForeground} style={{ opacity: 0.3 }} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {searchQuery ? t('map.noResults') : t('map.noResultsFilterHint')}
              </Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                {searchQuery ? t('map.noSearchResults') : t('map.noResultsFilterHint')}
              </Text>
            </View>
          }
          ListFooterComponent={
            hasMoreNearbyEvents(center.latitude, center.longitude) ? (
              <View style={styles.loadMoreFooter}>
                {loadingMore ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Pressable onPress={handleLoadMore} style={[styles.loadMoreBtn, { borderColor: colors.border }]}>
                    <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                      {t('map.loadMoreEvents')} ({getNearbyEventsTotal(center.latitude, center.longitude)} {t('map.totalEvents')})
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : null
          }
        />
      )}

      {/* ── Detail Sheet (events & places) ── */}
      {selectedItem && (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedItem(null)}>
          <View style={[styles.detailModal, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
              <View style={[styles.detailColorBar, { backgroundColor: selectedItem.color }]} />
              <Text style={[styles.detailHeaderTitle, { color: colors.foreground }]} numberOfLines={1}>
                {selectedItem.kind === 'city_event' ? t('feedContent.cityEventLabel')
                  : selectedItem.kind === 'community_event' ? t('map.event')
                  : selectedItem.kind === 'post' ? t('map.layerPosts')
                  : t('places.title')}
              </Text>
              <Pressable onPress={() => setSelectedItem(null)} hitSlop={12}>
                <X size={22} color={colors.foreground} />
              </Pressable>
            </View>

            {/* Image */}
            {(() => {
              const imgUrl = selectedItem.kind === 'city_event'
                ? (selectedItem.sourceData as CityEvent).image_url
                : selectedItem.kind === 'place'
                ? (selectedItem.sourceData as LocalPlace).image_url
                : selectedItem.kind === 'post'
                ? (selectedItem.sourceData as Post).image_url
                : null
              return imgUrl ? (
                <Image source={{ uri: imgUrl }} style={styles.detailImage} contentFit="cover" />
              ) : null
            })()}

            {/* Content */}
            <View style={styles.detailBody}>
              <Text style={[styles.detailTitle, { color: colors.foreground }]}>{selectedItem.title}</Text>

              {/* Date & time */}
              {selectedItem.sortDate && (
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                    {new Date(selectedItem.sortDate).toLocaleDateString(
                      locale === 'sv' ? 'sv-SE' : locale === 'en' ? 'en-GB' : 'fi-FI', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>
              )}

              {/* Location */}
              {(() => {
                const locName = selectedItem.kind === 'city_event'
                  ? (selectedItem.sourceData as CityEvent).location_name
                  : selectedItem.kind === 'community_event'
                  ? (selectedItem.sourceData as Event).location_name
                  : selectedItem.kind === 'place'
                  ? (selectedItem.sourceData as LocalPlace).address
                  : null
                return locName ? (
                  <View style={styles.detailRow}>
                    <MapPin size={14} color={colors.primary} />
                    <Text style={[styles.detailLabel, { color: colors.foreground }]}>{locName}</Text>
                  </View>
                ) : null
              })()}

              {/* Distance */}
              <View style={styles.detailRow}>
                <Navigation size={14} color={colors.mutedForeground} />
                <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{formatDistance(selectedItem.distance)}</Text>
              </View>

              {/* Price (city events) */}
              {selectedItem.kind === 'city_event' && (() => {
                const ce = selectedItem.sourceData as CityEvent
                return (
                  <View style={[styles.detailBadge, { backgroundColor: ce.is_free ? '#2B8A6220' : '#E8A05020' }]}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: ce.is_free ? '#2B8A62' : '#E8A050' }}>
                      {ce.is_free ? t('events.free') : ce.price_info ?? t('events.paid')}
                    </Text>
                  </View>
                )
              })()}

              {/* Description */}
              {(() => {
                let desc: string | null = null
                if (selectedItem.kind === 'city_event') {
                  const ce = selectedItem.sourceData as CityEvent
                  desc = locale === 'sv' ? (ce.description_sv ?? ce.description_fi)
                    : locale === 'en' ? (ce.description_en ?? ce.description_fi)
                    : ce.description_fi
                } else if (selectedItem.kind === 'community_event') {
                  desc = (selectedItem.sourceData as Event).description
                } else if (selectedItem.kind === 'place') {
                  desc = (selectedItem.sourceData as LocalPlace).description
                } else if (selectedItem.kind === 'post') {
                  desc = (selectedItem.sourceData as Post).description
                }
                return desc ? (
                  <Text style={[styles.detailDesc, { color: colors.mutedForeground }]}>{desc}</Text>
                ) : null
              })()}

              {/* Place extra info */}
              {selectedItem.kind === 'place' && (() => {
                const pl = selectedItem.sourceData as LocalPlace
                return (
                  <View style={{ gap: 6, marginTop: 8 }}>
                    {pl.opening_hours && (
                      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{t('places.openingHours')}: {pl.opening_hours}</Text>
                    )}
                    {pl.phone && (
                      <Pressable onPress={() => Linking.openURL(`tel:${pl.phone}`).catch(() => {})}>
                        <Text style={[styles.detailLabel, { color: colors.primary }]}>{pl.phone}</Text>
                      </Pressable>
                    )}
                  </View>
                )
              })()}

              {/* Organizer (city events) */}
              {selectedItem.kind === 'city_event' && (selectedItem.sourceData as CityEvent).organizer && (
                <Text style={[styles.detailLabel, { color: colors.mutedForeground, marginTop: 8 }]}>
                  {t('events.creator')}: {(selectedItem.sourceData as CityEvent).organizer}
                </Text>
              )}
            </View>

            {/* Actions */}
            <View style={styles.detailActions}>
              {selectedItem.kind === 'post' && (
                <Pressable
                  onPress={() => {
                    const post = selectedItem.sourceData as Post
                    setSelectedItem(null)
                    router.push(`/post/${post.id}`)
                  }}
                  style={[styles.detailActionBtn, { backgroundColor: selectedItem.color }]}
                >
                  <ExternalLink size={16} color="#FFF" />
                  <Text style={styles.detailActionText}>{t('map.viewPost')}</Text>
                </Pressable>
              )}
              {selectedItem.kind === 'city_event' && (selectedItem.sourceData as CityEvent).info_url && (
                <Pressable
                  onPress={() => Linking.openURL((selectedItem.sourceData as CityEvent).info_url!).catch(() => {})}
                  style={[styles.detailActionBtn, { backgroundColor: selectedItem.color }]}
                >
                  <ExternalLink size={16} color="#FFF" />
                  <Text style={styles.detailActionText}>{t('map.moreInfo')}</Text>
                </Pressable>
              )}
              {selectedItem.kind === 'place' && (selectedItem.sourceData as LocalPlace).website && (
                <Pressable
                  onPress={() => Linking.openURL((selectedItem.sourceData as LocalPlace).website!).catch(() => {})}
                  style={[styles.detailActionBtn, { backgroundColor: selectedItem.color }]}
                >
                  <ExternalLink size={16} color="#FFF" />
                  <Text style={styles.detailActionText}>{t('map.website')}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => {
                  const lat = selectedItem.latitude
                  const lng = selectedItem.longitude
                  const url = Platform.OS === 'ios'
                    ? `maps:0,0?q=${lat},${lng}`
                    : Platform.OS === 'android'
                    ? `geo:${lat},${lng}?q=${lat},${lng}`
                    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
                  Linking.openURL(url).catch(() => {
                    // Fallback to Google Maps web
                    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {})
                  })
                }}
                style={[styles.detailActionBtn, { backgroundColor: colors.muted }]}
              >
                <Navigation size={16} color={colors.foreground} />
                <Text style={[styles.detailActionText, { color: colors.foreground }]}>{t('map.directions')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const shareUrl = selectedItem.kind === 'city_event'
                    ? (selectedItem.sourceData as CityEvent).info_url
                    : selectedItem.kind === 'place' && (selectedItem.sourceData as LocalPlace).website
                    ? (selectedItem.sourceData as LocalPlace).website
                    : `https://www.google.com/maps/search/?api=1&query=${selectedItem.latitude},${selectedItem.longitude}`
                  Share.share({ message: `${selectedItem.title}\n${shareUrl ?? ''}`.trim() }).catch(() => {})
                }}
                style={[styles.detailActionBtn, { backgroundColor: colors.muted, flex: 0, paddingHorizontal: 14 }]}
              >
                <ExternalLink size={16} color={colors.foreground} />
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Neighborhood Modal ── */}
      <Modal
        visible={neighborhoodModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNeighborhoodModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t('map.selectArea')}
            </Text>
            <Pressable onPress={() => setNeighborhoodModalVisible(false)} hitSlop={12}>
              <X size={24} color={colors.foreground} />
            </Pressable>
          </View>

          {/* GPS option */}
          <Pressable
            style={[styles.neighborhoodRow, {
              borderBottomColor: colors.border,
              backgroundColor: selectedNeighborhood === '__gps__' ? colors.muted : colors.card,
            }]}
            onPress={handleGPSSelect}
          >
            <Navigation size={18} color={colors.primary} />
            <Text style={[styles.neighborhoodRowText, { color: colors.primary, fontWeight: '600' }]}>
              {t('map.myLocation')}
            </Text>
          </Pressable>

          <FlatList
            data={userLocation
              ? [...NEIGHBORHOODS].sort((a, b) => {
                  const ca = NEIGHBORHOOD_CENTERS[a]; const cb = NEIGHBORHOOD_CENTERS[b]
                  if (!ca || !cb) return 0
                  return haversineKm(userLocation.latitude, userLocation.longitude, ca.latitude, ca.longitude)
                    - haversineKm(userLocation.latitude, userLocation.longitude, cb.latitude, cb.longitude)
                }) as unknown as string[]
              : NEIGHBORHOODS as unknown as string[]
            }
            keyExtractor={item => item}
            renderItem={({ item }: { item: string }) => (
              <Pressable
                style={[styles.neighborhoodRow, {
                  borderBottomColor: colors.border,
                  backgroundColor: selectedNeighborhood === item ? colors.muted : colors.card,
                }]}
                onPress={async () => {
                  setSelectedNeighborhood(item)
                  setNeighborhoodModalVisible(false)
                  setNeighborhoodLoading(true)
                  try {
                    const c = NEIGHBORHOOD_CENTERS[item] ?? NEIGHBORHOOD_CENTERS['Kallio']
                    const radius = getRadiusKm(item)
                    const placesData = await fetchHelsinkiPlaces(c.latitude, c.longitude, radius * 1000)
                    setPlaces(placesData)
                  } catch (err) {
                    console.log('[map] neighborhood switch places error:', err)
                  }
                  setNeighborhoodLoading(false)
                }}
              >
                <Text style={[
                  styles.neighborhoodRowText,
                  { color: colors.foreground },
                  selectedNeighborhood === item && { color: colors.primary, fontWeight: '600' },
                ]}>
                  {item}
                </Text>
                {userLocation && NEIGHBORHOOD_CENTERS[item] && (
                  <Text style={[styles.neighborhoodRowDist, { color: colors.mutedForeground }]}>
                    {formatDistance(haversineKm(userLocation.latitude, userLocation.longitude, NEIGHBORHOOD_CENTERS[item].latitude, NEIGHBORHOOD_CENTERS[item].longitude))}
                  </Text>
                )}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  )
}

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Top Bar ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  topBarIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  neighborhoodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  neighborhoodText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },

  // ── Map ──
  mapContainer: {
    height: MAP_HEIGHT,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 16,
    padding: 6,
  },
  gpsButton: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },

  // ── Filter Pills ──
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterScrollContent: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Section List ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCountBadge: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 4,
  },
  searchCount: {
    fontSize: 11,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  emptyList: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // ── Detail Modal ──
  detailModal: {
    flex: 1,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailColorBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: 10,
  },
  detailHeaderTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  detailImage: {
    width: '100%',
    height: 200,
  },
  detailBody: {
    padding: 16,
    gap: 10,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 14,
    lineHeight: 20,
  },
  detailBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  detailDesc: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 4,
  },
  detailActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    marginTop: 'auto' as any,
  },
  detailActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  detailActionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },

  // ── Empty ──
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptyActionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  emptyHintText: {
    fontSize: 13,
    textAlign: 'center',
  },

  // ── Modal ──
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  neighborhoodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  neighborhoodRowText: {
    fontSize: 15,
    flex: 1,
  },
  neighborhoodRowDist: {
    fontSize: 12,
  },
  mapInfoBar: {
    paddingVertical: 4,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  mapInfoText: {
    fontSize: 11,
  },
  mapToggleBtn: {
    position: 'absolute',
    right: 8,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  loadMoreFooter: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '500',
  },
})

// ── Card styles for list items ──
const cs = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accentBar: {
    height: 3,
    width: '100%',
  },
  cardBody: {
    flexDirection: 'row',
    padding: 10,
    gap: 10,
  },
  cardImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  cardImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 3,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  distance: {
    fontSize: 11,
  },
  userName: {
    fontSize: 11,
    flex: 1,
  },
  price: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyText: {
    padding: 16,
    fontStyle: 'italic',
    fontSize: 13,
    textAlign: 'center',
  },
})
