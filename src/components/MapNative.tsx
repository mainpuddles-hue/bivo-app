import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, Pressable, SectionList, Modal, FlatList, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Linking, Platform,
  RefreshControl, TextInput,
  type SectionListData,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fetchHelsinkiEvents } from '@/lib/linkedevents'
import { fetchHelsinkiPlaces, invalidatePlacesCache } from '@/lib/palvelukartta'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps'
import * as Location from 'expo-location'
import {
  ChevronDown, MapPin, Navigation, X, Search, Crosshair, ExternalLink, ArrowLeft,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { NEIGHBORHOODS, CATEGORIES } from '@/lib/constants'
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
const MAX_MAP_MARKERS = 15
const MAP_HEIGHT = 250

const POST_PIN: Record<string, string> = {
  tarvitsen: '#C75B3A', tarjoan: '#7C5CBF', ilmaista: '#3B7DD8',
  nappaa: '#E8A050', lainaa: '#C98B2E', tapahtuma: '#2B8A62',
}

const CITY_EVENT_PIN: Record<string, string> = {
  culture: '#8E44AD', music: '#E91E63', sport: '#27AE60', family: '#FF9800',
  food: '#E74C3C', nature: '#4CAF50', education: '#2196F3', theatre: '#9C27B0',
  exhibition: '#795548', festival: '#FF5722', market: '#FF9800', other: '#607D8B',
}

const PLACE_PIN: Record<string, string> = {
  restaurant: '#E74C3C', cafe: '#8B5E3C', bar: '#9B59B6', shop: '#3498DB',
  library: '#27AE60', health: '#E91E63', sport: '#F39C12', culture: '#8E44AD',
  hotel: '#2C3E50', attraction: '#F1C40F', service: '#607D8B',
  fast_food: '#FF5722', pub: '#795548', other: '#78716C',
}

const PLACE_LABEL: Record<string, string> = {
  restaurant: 'Ravintola', cafe: 'Kahvila', bar: 'Baari', shop: 'Kauppa',
  library: 'Kirjasto', health: 'Terveys', sport: 'Urheilu', culture: 'Kulttuuri',
  hotel: 'Hotelli', attraction: 'Nähtävyys', service: 'Palvelu',
  fast_food: 'Pikaruoka', pub: 'Pubi', other: 'Muu',
}

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

function isWithin7Days(dateStr: string): boolean {
  const d = new Date(dateStr).getTime()
  const now = Date.now()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  return d > now && d <= now + sevenDays
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
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
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
        }
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
      const [postsRes, eventsRes, cityEventsData] = await Promise.all([
        supabase.from('posts')
          .select('id, user_id, type, title, description, location, latitude, longitude, image_url, daily_fee, created_at, is_active, user:profiles!posts_user_id_fkey(id, name, avatar_url)')
          .eq('is_active', true)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('events')
          .select('id, post_id, creator_id, title, description, event_date, location_name, location_lat, location_lng, icon, max_attendees, created_at, creator:profiles!events_creator_id_fkey(id, name, avatar_url)')
          .gte('event_date', today)
          .not('location_lat', 'is', null)
          .not('location_lng', 'is', null)
          .order('event_date', { ascending: true })
          .limit(500),
        fetchHelsinkiEvents(),
      ])
      if (postsRes.data) setPosts(postsRes.data as unknown as Post[])
      if (eventsRes.data) setCommunityEvents(eventsRes.data as unknown as Event[])
      setCityEvents(cityEventsData)
      if (postsRes.error) console.log('[map] posts error:', postsRes.error.message)
      if (eventsRes.error) console.log('[map] events error:', eventsRes.error.message)
    } catch (err) {
      console.log('[map] global fetch error:', err)
    }
  }, [supabase])

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
    await Promise.all([fetchGlobalData(), fetchPlaces()])
    setRefreshing(false)
  }, [fetchGlobalData, fetchPlaces, center])

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
        color: POST_PIN[p.type] ?? '#607D8B',
        latitude: p.latitude,
        longitude: p.longitude,
        distance: dist,
        sortDate: p.created_at,
        sourceData: p,
      })
    }

    // Community events (future only)
    for (const e of communityEvents) {
      if (e.location_lat == null || e.location_lng == null) continue
      if (e.event_date && isPast(e.event_date)) continue
      const dist = haversineKm(cLat, cLng, e.location_lat, e.location_lng)
      if (dist > radiusKm) continue
      const dateStr = new Date(e.event_date).toLocaleDateString(locale === 'sv' ? 'sv-SE' : locale === 'en' ? 'en-GB' : 'fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })
      const creator = (e as any).creator?.name ?? ''
      const evParts = [dateStr, e.location_name, creator].filter(Boolean)
      items.push({
        id: `event-${e.id}`,
        kind: 'community_event',
        title: e.title,
        subtitle: evParts.join(' · '),
        color: '#2B8A62',
        latitude: e.location_lat,
        longitude: e.location_lng,
        distance: dist,
        sortDate: e.event_date,
        sourceData: e,
      })
    }

    // City events (future only)
    for (const c of cityEvents) {
      if (c.latitude == null || c.longitude == null) continue
      if (c.start_time && isPast(c.start_time)) continue
      const dist = haversineKm(cLat, cLng, c.latitude, c.longitude)
      if (dist > radiusKm) continue
      const name = locale === 'sv' ? (c.name_sv ?? c.name_fi) :
                   locale === 'en' ? (c.name_en ?? c.name_fi) : c.name_fi
      const ceDateStr = new Date(c.start_time).toLocaleDateString(locale === 'sv' ? 'sv-SE' : locale === 'en' ? 'en-GB' : 'fi-FI', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      const ceParts = [ceDateStr, c.location_name, c.is_free ? t('events.free') : null].filter(Boolean)
      items.push({
        id: `city-${c.id}`,
        kind: 'city_event',
        title: name,
        subtitle: ceParts.join(' · '),
        color: CITY_EVENT_PIN[c.category] ?? '#607D8B',
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
      const plParts = [plLabel, pl.address].filter(Boolean)
      items.push({
        id: `place-${pl.id}`,
        kind: 'place',
        title: pl.name,
        subtitle: plParts.join(' · '),
        color: PLACE_PIN[pl.category] ?? '#78716C',
        latitude: pl.latitude,
        longitude: pl.longitude,
        distance: dist,
        sourceData: pl,
      })
    }

    return items
  }, [posts, communityEvents, cityEvents, places, center, locale, t, radiusKm])

  // ── Filter by active filter + search ──
  const filteredItems = useMemo(() => {
    let items = allItems
    if (activeFilter === 'posts') items = items.filter(i => i.kind === 'post')
    else if (activeFilter === 'events') items = items.filter(i => i.kind === 'community_event' || i.kind === 'city_event')
    else if (activeFilter === 'places') items = items.filter(i => i.kind === 'place')

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      items = items.filter(i => i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q))
    }
    return items
  }, [allItems, activeFilter, searchQuery])

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
    if (eventsToday.length > 0) result.push({ title: t('events.filterToday'), data: eventsToday })
    if (eventsUpcoming.length > 0) result.push({ title: t('discover.upcomingEvents'), data: eventsUpcoming })
    if (postItems.length > 0) result.push({ title: t('map.layerPosts'), data: postItems })
    if (placeItems.length > 0) result.push({ title: t('map.layerPlaces'), data: placeItems })

    return result
  }, [filteredItems, t])

  // ── Map markers (max 15, stable diff) ──
  useEffect(() => {
    const sorted = [...filteredItems].sort((a, b) => a.distance - b.distance)
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
    // Always open detail sheet for consistent behavior
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
    // Find item via O(1) lookup — always open detail sheet
    const item = itemLookup.get(marker.key)
    if (item) {
      setSelectedItem(item)
    }

    // Also scroll list to that item via O(1) lookup
    const pos = sectionIndexLookup.get(marker.key)
    if (pos && sectionListRef.current) {
      sectionListRef.current.scrollToLocation({
        sectionIndex: pos.sectionIndex,
        itemIndex: pos.itemIndex,
        animated: true,
        viewOffset: 50,
      })
    }
  }, [itemLookup, sectionIndexLookup])

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
    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        {section.title}
      </Text>
      <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
        ({section.data.length})
      </Text>
    </View>
  ), [colors])

  const renderItem = useCallback(({ item }: { item: ListItem }) => (
    <Pressable
      style={[styles.listItem, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
      onPress={() => handleListItemNavigate(item)}
    >
      <View style={[styles.listDot, { backgroundColor: item.color }]} />
      <View style={styles.listItemContent}>
        <Text style={[styles.listItemTitle, { color: colors.foreground }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.listItemSubtitle, { color: colors.mutedForeground }]} numberOfLines={2}>
          {item.subtitle}
        </Text>
        <Text style={[styles.listItemMeta, { color: colors.mutedForeground }]}>
          {formatDistance(item.distance)}
        </Text>
      </View>
    </Pressable>
  ), [colors, handleListItemNavigate])

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
      )}

      {/* ── Mini Map ── */}
      <View style={styles.mapContainer}>
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

      {/* ── Filter Pills ── */}
      <View style={[styles.filterRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {neighborhoodLoading && (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 4 }} />
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
          {([
            { key: 'all' as FilterKey, label: t('events.filterAll') },
            { key: 'posts' as FilterKey, label: t('map.layerPosts') },
            { key: 'events' as FilterKey, label: t('map.layerEvents') },
            { key: 'places' as FilterKey, label: t('map.layerPlaces') },
          ]).map(f => {
            const isActive = activeFilter === f.key
            return (
              <Pressable
                key={f.key}
                style={[
                  styles.filterPill,
                  { borderColor: isActive ? colors.primary : colors.border },
                  isActive && { backgroundColor: colors.primary },
                ]}
                onPress={() => setActiveFilter(prev => prev === f.key ? 'all' : f.key)}
              >
                <Text style={[
                  styles.filterPillText,
                  { color: isActive ? colors.primaryForeground : colors.foreground },
                ]}>
                  {f.label} {counts[f.key]}
                </Text>
              </Pressable>
            )
          })}
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
                Ei tuloksia haulle '{searchQuery}'
              </Text>
              <Pressable onPress={() => setSearchQuery('')} style={[styles.emptyActionBtn, { borderColor: colors.primary }]}>
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>{'Tyhjennä haku'}</Text>
              </Pressable>
            </>
          ) : activeFilter !== 'all' ? (
            <>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Ei {activeFilter === 'posts' ? 'ilmoituksia' : activeFilter === 'events' ? 'tapahtumia' : 'paikkoja'} alueella {displayNeighborhood}
              </Text>
              <Pressable onPress={() => setActiveFilter('all')} style={[styles.emptyActionBtn, { borderColor: colors.primary }]}>
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>{'Näytä kaikki'}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {'Ei sisältöä alueella '}{displayNeighborhood}
              </Text>
              <Text style={[styles.emptyHintText, { color: colors.mutedForeground }]}>
                Kokeile toista naapurustoa
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
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
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
                  <Text style={styles.detailActionText}>Katso ilmoitus</Text>
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
            data={NEIGHBORHOODS as unknown as string[]}
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
  sectionCount: {
    fontSize: 12,
    fontWeight: '500',
  },

  // ── List Item ──
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  listDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  listItemContent: {
    flex: 1,
    marginRight: 8,
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  listItemSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  listItemMeta: {
    fontSize: 11,
    marginTop: 2,
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
  },
})
