declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Alert, Linking, Platform } from 'react-native'
import { fetchNearbyEvents, loadMoreNearbyEvents, hasMoreNearbyEvents, getNearbyEventsTotal, invalidateEventsCache } from '@/lib/linkedevents'
import { fetchTicketmasterEvents } from '@/lib/ticketmaster'
import { fetchHelsinkiPlaces, invalidatePlacesCache } from '@/lib/palvelukartta'
import * as Location from 'expo-location'
import { CATEGORIES } from '@/lib/constants'
import { FEATURES } from '@/lib/featureFlags'
import type { Post, PostType, Event, CityEvent, LocalPlace } from '@/lib/types'
import { useSupabase } from '@/hooks/useSupabase'
import { isToday, isTomorrow, isWithinDays } from '@/lib/dateHelpers'
import { haversineKm } from '@/lib/geo'
import type { ListItem, StableMarker, FilterKey, Section, ItemKind } from './types'
import { LAYER_COLORS, PLACE_LABEL, PLACES_INITIAL_LIMIT, formatDistance } from './constants'

// ── Neighborhood Centers ──

export const NEIGHBORHOOD_CENTERS: Record<string, { latitude: number; longitude: number }> = {
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

export const DENSE_NEIGHBORHOODS = new Set([
  'Kallio', 'Sörnäinen', 'Kamppi', 'Punavuori', 'Kruununhaka',
  'Katajanokka', 'Hakaniemi', 'Ullanlinna', 'Eira', 'Töölö',
  'Ruoholahti', 'Jätkäsaari', 'Merihaka', 'Hermanni', 'Alppiharju',
])

export function getRadiusKm(neighborhood: string): number {
  if (neighborhood === '__gps__') return 1.0
  if (DENSE_NEIGHBORHOODS.has(neighborhood)) return 0.8
  return 1.5
}

export const MAX_MAP_MARKERS = 20
export const MAP_HEIGHT = 250

export const DARK_MAP_STYLE = [
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

function isPast(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return d < now
}

// ══════════════════════════════════════════════════════════════
// Hook
// ══════════════════════════════════════════════════════════════

export function useMapData(t: (key: string, params?: Record<string, string | number>) => string, locale: string) {
  const supabase = useSupabase()

  // ── City bounds (dynamic, loaded from DB) ──
  const [cityBounds, setCityBounds] = useState({ south: 60.10, north: 60.35, west: 24.75, east: 25.30 })
  const [cityCenter, setCityCenter] = useState({ lat: 60.1699, lng: 24.9384 })
  const [dynamicNeighborhoods, setDynamicNeighborhoods] = useState<string[]>([])

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
          .select('naapurusto, city_id')
          .eq('id', user.id)
          .single() as { data: { naapurusto?: string; city_id?: string } | null }

        // Load city bounds and neighborhoods for the user's city
        const cityId = data?.city_id ?? 'helsinki'
        try {
          const [{ data: cityData }, { data: nhList }] = await Promise.all([
            supabase.from('cities').select('center_lat, center_lng, bounds_south, bounds_north, bounds_west, bounds_east').eq('id', cityId).single(),
            supabase.from('city_neighborhoods').select('name, center_lat, center_lng').eq('city_id', cityId).order('name'),
          ])
          if (!cancelled && cityData) {
            const c = cityData as any
            if (c.bounds_south != null) {
              setCityBounds({ south: c.bounds_south, north: c.bounds_north, west: c.bounds_west, east: c.bounds_east })
            }
            if (c.center_lat != null) {
              setCityCenter({ lat: c.center_lat, lng: c.center_lng })
            }
          }
          if (!cancelled && nhList && nhList.length > 0) {
            setDynamicNeighborhoods((nhList as any[]).map((n: any) => n.name))
            for (const n of nhList as any[]) {
              if (!NEIGHBORHOOD_CENTERS[n.name]) {
                NEIGHBORHOOD_CENTERS[n.name] = { latitude: n.center_lat, longitude: n.center_lng }
              }
            }
          }
        } catch {
          // Cities/neighborhoods tables may not exist — continue with Helsinki defaults
        }

        if (!cancelled && data?.naapurusto) {
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
      const { south, north, west, east } = cityBounds
      const [postsRes, eventsRes, cityEventsData, tmData] = await Promise.all([
        supabase.from('posts')
          .select('id, user_id, type, title, description, location, latitude, longitude, image_url, daily_fee, created_at, user:profiles!posts_user_id_fkey(id, name, avatar_url)')
          .eq('is_active', true)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .gte('latitude', south).lte('latitude', north)
          .gte('longitude', west).lte('longitude', east)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('events')
          .select('id, post_id, creator_id, title, description, event_date, location_name, location_lat, location_lng, icon, max_attendees, created_at, creator:profiles!events_creator_id_fkey(id, name, avatar_url)')
          .gte('event_date', today)
          .not('location_lat', 'is', null)
          .not('location_lng', 'is', null)
          .gte('location_lat', south).lte('location_lat', north)
          .gte('location_lng', west).lte('location_lng', east)
          .order('event_date', { ascending: true })
          .limit(500),
        fetchNearbyEvents(cityCenter.lat, cityCenter.lng, 10),
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
      if (__DEV__) console.log(`[map] Events: ${linkedEvents.length} LinkedEvents + ${tmEvents.length} Ticketmaster = ${allCityEvents.length} merged (${withCoords} with coords)`)
      if (__DEV__ && postsRes.error) console.log('[map] posts error:', postsRes.error.message)
      if (__DEV__ && eventsRes.error) console.log('[map] events error:', eventsRes.error.message)
    } catch (err) {
      if (__DEV__) console.log('[map] global fetch error:', err)
    }
  }, [supabase, center, cityBounds, cityCenter])

  const fetchPlaces = useCallback(async () => {
    try {
      const radius = getRadiusKm(selectedNeighborhood)
      const placesData = await fetchHelsinkiPlaces(center.latitude, center.longitude, radius * 1000)
      setPlaces(placesData)
      if (__DEV__) console.log(`[map] Palvelukartta: ${placesData.length} places near ${selectedNeighborhood}`)
    } catch (err) {
      if (__DEV__) console.log('[map] places fetch error:', err)
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
      if (!FEATURES.LENDING && p.type === 'lainaa') continue
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
      if (!e.event_date || isPast(e.event_date)) continue
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
    const hasMorePlaces = placeItems.length > PLACES_INITIAL_LIMIT
    const visiblePlaces = showAllPlaces ? placeItems : placeItems.slice(0, PLACES_INITIAL_LIMIT)
    if (visiblePlaces.length > 0) {
      const placesData = hasMorePlaces && !showAllPlaces
        ? [...visiblePlaces, { id: '__show_all_places__', kind: 'place' as ItemKind, title: t('map.showAllPlaces', { count: placeItems.length }), subtitle: '', color: LAYER_COLORS.place, latitude: 0, longitude: 0, distance: 0, sourceData: {} as any }]
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

  // ── Actions ──

  const handleListItemNavigate = useCallback((item: ListItem) => {
    if (item.id.startsWith('__empty_')) return
    setSelectedItem(item)
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
      if (__DEV__) console.log('[map] neighborhood switch places error:', err)
    }
    setNeighborhoodLoading(false)
  }, [])

  const handleCenterOnUser = useCallback(async () => {
    if (userLocation) {
      return userLocation
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return null
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
    } catch {}
    return null
  }, [userLocation])

  const hasMore = hasMoreNearbyEvents(center.latitude, center.longitude)
  const totalEvents = getNearbyEventsTotal(center.latitude, center.longitude)

  const displayNeighborhood = selectedNeighborhood === '__gps__' ? t('map.myLocation') : selectedNeighborhood

  return {
    // State
    loading,
    refreshing,
    loadingMore,
    mapExpanded,
    setMapExpanded,
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    selectedNeighborhood,
    neighborhoodModalVisible,
    setNeighborhoodModalVisible,
    activeFilter,
    setActiveFilter,
    subCategory,
    setSubCategory,
    timeFilter,
    setTimeFilter,
    selectedItem,
    setSelectedItem,
    neighborhoodLoading,
    showAllPlaces,
    setShowAllPlaces,
    userLocation,
    center,
    displayNeighborhood,

    // Computed
    filteredItems,
    sections,
    renderedMarkers,
    counts,
    subCounts,
    hasMore,
    totalEvents,

    // Dynamic city data
    dynamicNeighborhoods,

    // Actions
    handleFullRefresh,
    handleLoadMore,
    handleListItemNavigate,
    handleMarkerPress,
    handleGPSSelect,
    handleNeighborhoodSelect,
    handleCenterOnUser,
    openDirections,
  }
}
