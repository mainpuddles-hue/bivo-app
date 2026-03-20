declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, Pressable, SectionList,
  StyleSheet, ActivityIndicator, Alert, Linking, Platform,
  RefreshControl, TextInput,
  type SectionListData,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fetchNearbyEvents, loadMoreNearbyEvents, hasMoreNearbyEvents, getNearbyEventsTotal, invalidateEventsCache } from '@/lib/linkedevents'
import { fetchTicketmasterEvents } from '@/lib/ticketmaster'
import { fetchHelsinkiPlaces, invalidatePlacesCache } from '@/lib/palvelukartta'
import { useRouter } from 'expo-router'
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps'
import * as Location from 'expo-location'
import {
  ChevronDown, ChevronUp, MapPin, Search, Crosshair, ArrowLeft, Plus, X,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { NEIGHBORHOODS, CATEGORIES } from '@/lib/constants'
import type { Post, PostType, Event, CityEvent, LocalPlace } from '@/lib/types'

import type { ListItem, StableMarker, FilterKey, Section, ItemKind } from './map/types'
import { LAYER_COLORS, PLACE_LABEL, formatDistance } from './map/constants'
import { EventCard } from './map/EventCard'
import { PlaceRow } from './map/PlaceRow'
import { PostCard } from './map/PostCard'
import { MapFilters } from './map/MapFilters'
import { NeighborhoodModal } from './map/NeighborhoodModal'
import { DetailModal } from './map/DetailModal'

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
  const [showAllPlaces, setShowAllPlaces] = useState(false)

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
          try {
            const { status } = await Location.requestForegroundPermissionsAsync()
            if (cancelled) return
            if (status === 'granted') {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
              if (cancelled) return
              setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
              setSelectedNeighborhood('__gps__')
              return
            }
          } catch {}
          if (!cancelled) setNeighborhoodModalVisible(true)
        }
      } else if (!cancelled) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync()
          if (cancelled) return
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            if (cancelled) return
            setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
            setSelectedNeighborhood('__gps__')
            return
          }
        } catch {}
        if (!cancelled) setNeighborhoodModalVisible(true)
      }
    })()
    return () => { cancelled = true }
  }, [supabase])

  useEffect(() => { setShowAllPlaces(false) }, [selectedNeighborhood])

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
        fetchNearbyEvents(60.1699, 24.9384, 10),
        fetchTicketmasterEvents(),
      ])
      if (postsRes.data) setPosts(postsRes.data as unknown as Post[])
      if (eventsRes.data) setCommunityEvents(eventsRes.data as unknown as Event[])
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

  const fetchData = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchGlobalData(), fetchPlaces()])
    setLoading(false)
  }, [fetchGlobalData, fetchPlaces])

  useEffect(() => { fetchData() }, [fetchData])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    invalidatePlacesCache(center.latitude, center.longitude)
    await fetchPlaces()
    setRefreshing(false)
  }, [fetchPlaces, center])

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

    for (const e of communityEvents) {
      if (e.location_lat == null || e.location_lng == null) continue
      if (e.event_date && isPast(e.event_date)) continue
      const dist = haversineKm(cLat, cLng, e.location_lat, e.location_lng)
      const dateStr = new Date(e.event_date).toLocaleDateString(locale === 'sv' ? 'sv-SE' : locale === 'en' ? 'en-GB' : 'fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })
      const creator = (e as any).creator?.name ?? ''
      const evParts = [e.location_name, creator].filter(Boolean)
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

    for (const c of cityEvents) {
      if (c.latitude == null || c.longitude == null) continue
      if (c.start_time && isPast(c.start_time)) continue
      const dist = haversineKm(cLat, cLng, c.latitude, c.longitude)
      const name = locale === 'sv' ? (c.name_sv ?? c.name_fi) :
                   locale === 'en' ? (c.name_en ?? c.name_fi) : c.name_fi
      const ceDateStr = new Date(c.start_time).toLocaleDateString(locale === 'sv' ? 'sv-SE' : locale === 'en' ? 'en-GB' : 'fi-FI', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      const ceParts = [c.location_name].filter(Boolean)
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
    if (activeFilter === 'posts') items = items.filter(i => i.kind === 'post')
    else if (activeFilter === 'events') items = items.filter(i => i.kind === 'community_event' || i.kind === 'city_event')
    else if (activeFilter === 'places') items = items.filter(i => i.kind === 'place')

    if (subCategory) {
      if (activeFilter === 'posts') {
        items = items.filter(i => i.kind === 'post' && (i.sourceData as Post).type === subCategory)
      } else if (activeFilter === 'events') {
        items = items.filter(i => {
          if (i.kind === 'city_event') return (i.sourceData as CityEvent).category === subCategory
          return false
        })
      } else if (activeFilter === 'places') {
        items = items.filter(i => i.kind === 'place' && (i.sourceData as LocalPlace).category === subCategory)
      }
    }

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

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      items = items.filter(i => i.title.toLowerCase().includes(q) || i.subtitle.toLowerCase().includes(q))
    }
    return items
  }, [allItems, activeFilter, subCategory, timeFilter, searchQuery])

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

  const subCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const item of allItems) {
      if (item.kind === 'post') {
        const type = (item.sourceData as Post).type
        m.set(`post:${type}`, (m.get(`post:${type}`) ?? 0) + 1)
      } else if (item.kind === 'city_event') {
        const cat = (item.sourceData as CityEvent).category
        m.set(`event:${cat}`, (m.get(`event:${cat}`) ?? 0) + 1)
      } else if (item.kind === 'place') {
        const cat = (item.sourceData as LocalPlace).category
        m.set(`place:${cat}`, (m.get(`place:${cat}`) ?? 0) + 1)
      }
    }
    return m
  }, [allItems])

  // ── Build sections ──
  const sections = useMemo(() => {
    const eventsToday: ListItem[] = []
    const eventsUpcoming: ListItem[] = []
    const postItems: ListItem[] = []
    const placeItems: ListItem[] = []

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
        insertSorted(placeItems, item, byDistanceAsc)
      }
    }

    const result: Section[] = []
    if (eventsToday.length > 0) {
      result.push({ title: t('events.filterToday'), data: eventsToday, color: LAYER_COLORS.event })
    } else if (activeFilter === 'events' && eventsUpcoming.length > 0) {
      result.push({ title: t('events.filterToday'), data: [{ id: '__empty_today__', kind: 'empty' as any, title: t('map.noEventsToday'), subtitle: '', color: '#9CA3AF', latitude: 0, longitude: 0, distance: 0, sourceData: {} as any }], color: LAYER_COLORS.event })
    }
    if (eventsUpcoming.length > 0) result.push({ title: t('discover.upcomingEvents'), data: eventsUpcoming, color: LAYER_COLORS.event })
    if (postItems.length > 0) result.push({ title: t('map.layerPosts'), data: postItems, color: LAYER_COLORS.post })
    const PLACES_INITIAL_LIMIT = 8
    const hasMorePlaces = placeItems.length > PLACES_INITIAL_LIMIT
    const visiblePlaces = showAllPlaces ? placeItems : placeItems.slice(0, PLACES_INITIAL_LIMIT)
    if (visiblePlaces.length > 0) {
      const placesData = hasMorePlaces && !showAllPlaces
        ? [...visiblePlaces, { id: '__show_all_places__', kind: 'place' as ItemKind, title: `Näytä kaikki ${placeItems.length} paikkaa`, subtitle: '', color: LAYER_COLORS.place, latitude: 0, longitude: 0, distance: 0, sourceData: {} as any }]
        : visiblePlaces
      result.push({ title: t('map.layerPlaces'), data: placesData, color: LAYER_COLORS.place })
    }

    return result
  }, [filteredItems, t, activeFilter, showAllPlaces])

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
    mapRef.current?.animateToRegion({
      latitude: item.latitude, longitude: item.longitude,
      latitudeDelta: 0.005, longitudeDelta: 0.005,
    }, 400)
  }, [])

  const itemLookup = useMemo(() => {
    const map = new Map<string, ListItem>()
    for (const item of filteredItems) {
      map.set(item.id, item)
    }
    return map
  }, [filteredItems])

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

  const openDirections = useCallback((lat: number, lng: number) => {
    const url = Platform.OS === 'ios'
      ? `maps:0,0?q=${lat},${lng}`
      : Platform.OS === 'android'
      ? `geo:${lat},${lng}?q=${lat},${lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {})
    })
  }, [])

  const handleNeighborhoodSelect = useCallback(async (item: string) => {
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
  }, [])

  // ── Render ──

  const renderSectionHeader = useCallback(({ section }: { section: SectionListData<ListItem, Section> }) => {
    const sectionColor = (section as Section).color
    return (
      <View style={[styles.sectionHeader, { backgroundColor: colors.background, borderBottomColor: colors.border, borderLeftWidth: 4, borderLeftColor: sectionColor ?? colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {section.title}
        </Text>
        <View style={[styles.sectionCountBadge, { backgroundColor: colors.muted }]}>
          <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
            {section.data.filter(d => !d.id.startsWith('__empty_') && !d.id.startsWith('__show_all_')).length}
          </Text>
        </View>
      </View>
    )
  }, [colors])

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    // Empty placeholder row
    if (item.id.startsWith('__empty_')) {
      return (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.emptyCardText, { color: colors.mutedForeground }]}>{item.title}</Text>
        </View>
      )
    }

    const isEvent = item.kind === 'community_event' || item.kind === 'city_event'
    const isPlace = item.kind === 'place'
    const isPost = item.kind === 'post'

    if (isEvent) {
      return <EventCard item={item} colors={colors} locale={locale} t={t} onPress={handleListItemNavigate} />
    }

    if (item.id === '__show_all_places__' || isPlace) {
      return <PlaceRow item={item} colors={colors} t={t} onPress={handleListItemNavigate} onDirections={openDirections} onShowAllPlaces={() => setShowAllPlaces(true)} />
    }

    if (isPost) {
      return <PostCard item={item} colors={colors} locale={locale} t={t} onPress={handleListItemNavigate} />
    }

    return null
  }, [colors, handleListItemNavigate, locale, t, openDirections])

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
        <Pressable
          onPress={() => setMapExpanded(prev => !prev)}
          style={[styles.mapToggleBtn, { backgroundColor: colors.card, top: 8 }]}
        >
          {mapExpanded ? <ChevronUp size={18} color={colors.foreground} /> : <ChevronDown size={18} color={colors.foreground} />}
        </Pressable>
        <Pressable
          onPress={async () => {
            if (userLocation) {
              mapRef.current?.animateToRegion({ ...userLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500)
            } else {
              try {
                const { status } = await Location.requestForegroundPermissionsAsync()
                if (status !== 'granted') return
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
                setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
                mapRef.current?.animateToRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500)
              } catch {}
            }
          }}
          style={[
            styles.gpsButton,
            {
              backgroundColor: userLocation ? colors.primary : colors.card,
              shadowColor: '#000',
            },
          ]}
        >
          <Crosshair size={20} color={selectedNeighborhood === '__gps__' ? '#FFF' : colors.foreground} />
        </Pressable>

        {/* ── Filter Pills ── */}
        <MapFilters
          activeFilter={activeFilter}
          subCategory={subCategory}
          timeFilter={timeFilter}
          counts={counts}
          subCounts={subCounts}
          colors={colors}
          isDark={isDark}
          t={t}
          neighborhoodLoading={neighborhoodLoading}
          onFilterChange={setActiveFilter}
          onSubCategoryChange={setSubCategory}
          onTimeFilterChange={setTimeFilter}
        />
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
              <Pressable
                onPress={() => router.push('/(tabs)/create')}
                style={[styles.emptyCreateBtn, { backgroundColor: colors.primary }]}
              >
                <Plus size={16} color="#FFF" />
                <Text style={styles.emptyCreateBtnText}>Luo ensimmäinen ilmoitus</Text>
              </Pressable>
              <Pressable onPress={() => setNeighborhoodModalVisible(true)} style={[styles.emptyActionBtn, { borderColor: colors.border }]}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{t('map.tryAnotherArea')}</Text>
              </Pressable>
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
            (activeFilter === 'all' || activeFilter === 'events') && hasMoreNearbyEvents(center.latitude, center.longitude) ? (
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

      {/* ── Detail Sheet ── */}
      <DetailModal
        item={selectedItem}
        colors={colors}
        locale={locale}
        t={t}
        router={router}
        onClose={() => setSelectedItem(null)}
      />

      {/* ── Neighborhood Modal ── */}
      <NeighborhoodModal
        visible={neighborhoodModalVisible}
        selected={selectedNeighborhood}
        neighborhoods={NEIGHBORHOODS}
        centers={NEIGHBORHOOD_CENTERS}
        userLocation={userLocation}
        colors={colors}
        t={t}
        onSelect={handleNeighborhoodSelect}
        onGPSSelect={handleGPSSelect}
        onClose={() => setNeighborhoodModalVisible(false)}
      />
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
    bottom: 8,
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
    zIndex: 11,
  },
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
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyCreateBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
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
  emptyCard: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyCardText: {
    padding: 16,
    fontStyle: 'italic',
    fontSize: 13,
    textAlign: 'center',
  },
})
