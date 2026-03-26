import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  ArrowLeft, Search, MapPin, Navigation, ChevronDown,
  Newspaper, CalendarDays, Coffee, Crosshair, Loader2,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { NEIGHBORHOODS } from '@/lib/constants'
import { useCityConfig, type City } from '@/hooks/useCityConfig'
import type { Post, PostType, Event, CityEvent, LocalPlace } from '@/lib/types'
import { OutOfAreaBanner } from '@/components/OutOfAreaBanner'
import { MapSearchBar, type SearchResult } from '@/components/map/MapSearchBar'
import { MapFilterChips } from '@/components/map/MapFilterChips'
import { MapErrorState, MapEmptyState } from '@/components/map/MapErrorState'
import { LeafletMap } from '@/components/map/LeafletMap'

// Default Helsinki bounds — used as fallback when no city config is available
const HKI = { south: 60.14, north: 60.27, west: 24.83, east: 25.20 } as const

interface CityBounds { south: number; north: number; west: number; east: number }

function isInCityBounds(lat: number, lng: number, bounds?: CityBounds | null): boolean {
  const b = bounds ?? HKI
  return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// ── Main Screen ──
export default function MapScreen() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [posts, setPosts] = useState<Post[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([])
  const [places, setPlaces] = useState<LocalPlace[]>([])
  const [loading, setLoading] = useState(true)
  const [userCityId, setUserCityId] = useState<string | null>(null)
  const cityConfig = useCityConfig(userCityId)
  const cityBounds: CityBounds = cityConfig.city ? {
    south: cityConfig.city.bounds_south,
    north: cityConfig.city.bounds_north,
    west: cityConfig.city.bounds_west,
    east: cityConfig.city.bounds_east,
  } : HKI
  const areaNeighborhoods = cityConfig.neighborhoods.length > 0 ? cityConfig.neighborhoods : [...NEIGHBORHOODS]

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
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom: number } | null>(null)
  const [activeSubFilter, setActiveSubFilter] = useState<'posts' | 'events' | 'places' | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search 200ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery])

  // Fetch user city on mount
  useEffect(() => {
    async function fetchUserCity() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      try {
        const { data: profileData } = await (supabase.from('profiles') as any).select('city_id').eq('id', user.id).single()
        if (profileData?.city_id) setUserCityId(profileData.city_id)
        else setUserCityId('helsinki')
      } catch {
        setUserCityId('helsinki')
      }
    }
    fetchUserCity()
  }, [supabase])

  useEffect(() => {
    async function fetchData() {
      const { data: { user } } = await supabase.auth.getUser()

      const bounds = cityBounds
      const [postsRes, eventsRes, cityRes, placesRes] = await Promise.allSettled([
        supabase.from('posts')
          .select('id, type, title, description, location, latitude, longitude, image_url, daily_fee, user:profiles!posts_user_id_fkey(id, name, avatar_url, naapurusto)')
          .eq('is_active', true)
          .not('latitude', 'is', null).not('longitude', 'is', null)
          .gte('latitude', bounds.south).lte('latitude', bounds.north)
          .gte('longitude', bounds.west).lte('longitude', bounds.east)
          .limit(200),
        supabase.from('events')
          .select('id, title, description, event_date, location_name, location_lat, location_lng, icon, max_attendees, attendees:event_attendees(count), creator:profiles!events_creator_id_fkey(id, name, avatar_url)')
          .gte('event_date', new Date().toISOString())
          .not('location_lat', 'is', null).not('location_lng', 'is', null)
          .order('event_date', { ascending: true })
          .limit(200),
        supabase.from('city_events')
          .select('id, name_fi, name_en, name_sv, description_fi, start_time, end_time, location_name, location_address, latitude, longitude, image_url, info_url, category, is_free, price_info, organizer')
          .gte('start_time', new Date().toISOString())
          .gte('latitude', bounds.south).lte('latitude', bounds.north + 0.02)
          .gte('longitude', bounds.west).lte('longitude', bounds.east + 0.02)
          .order('start_time', { ascending: true })
          .limit(200),
        supabase.from('local_places')
          .select('id, name, category, subcategory, address, latitude, longitude, phone, website, opening_hours, image_url, neighborhood, tags')
          .not('neighborhood', 'is', null)
          .gte('latitude', bounds.south).lte('latitude', bounds.north)
          .gte('longitude', bounds.west).lte('longitude', bounds.east)
          .limit(500),
      ])

      const pData = postsRes.status === 'fulfilled' ? (postsRes.value.data ?? []) : []
      const eData = eventsRes.status === 'fulfilled' ? (eventsRes.value.data ?? []) : []
      const cData = cityRes.status === 'fulfilled' ? (cityRes.value.data ?? []) : []
      const plData = placesRes.status === 'fulfilled' ? (placesRes.value.data ?? []) : []

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
  }, [supabase, cityBounds.south, cityBounds.north, cityBounds.west, cityBounds.east])

  // Listen for popup link navigation events
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const handler = (e: globalThis.Event) => {
      const route = (e as CustomEvent).detail as string
      if (route) router.push(route as any)
    }
    window.addEventListener('map-navigate', handler)
    return () => window.removeEventListener('map-navigate', handler)
  }, [router])

  const handleGeolocate = useCallback(() => {
    if (geoLoading) return
    if (userPos) {
      setFlyTo({ lat: userPos[0], lng: userPos[1], zoom: 15 })
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

  // ── Filtering chains ──
  const filteredPosts = useMemo(() => {
    if (!showPosts) return []
    let p = posts.filter(x => x.latitude && x.longitude && isInCityBounds(x.latitude, x.longitude, cityBounds))
    if (postFilter) p = p.filter(x => x.type === postFilter)
    if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); p = p.filter(x => x.title.toLowerCase().includes(q) || x.location?.toLowerCase().includes(q)) }
    if (userPos && radiusKm) p = p.filter(x => x.latitude && x.longitude && haversineKm(userPos[0], userPos[1], x.latitude, x.longitude) <= radiusKm)
    return p
  }, [posts, showPosts, postFilter, debouncedSearch, userPos, radiusKm])

  const filteredEvents = useMemo(() => {
    if (!showEvents || eventSource === 'city') return []
    let e = events.filter(x => x.location_lat && x.location_lng && isInCityBounds(x.location_lat, x.location_lng, cityBounds))
    if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); e = e.filter(x => x.title.toLowerCase().includes(q) || x.location_name?.toLowerCase().includes(q)) }
    if (userPos && radiusKm) e = e.filter(x => x.location_lat && x.location_lng && haversineKm(userPos[0], userPos[1], x.location_lat, x.location_lng) <= radiusKm)
    return e
  }, [events, showEvents, eventSource, debouncedSearch, userPos, radiusKm])

  const filteredCityEvents = useMemo(() => {
    if (!showEvents || eventSource === 'community') return []
    let c = cityEvents.filter(x => x.latitude && x.longitude && isInCityBounds(x.latitude!, x.longitude!, cityBounds))
    if (cityEventCategory) c = c.filter(x => x.category === cityEventCategory)
    if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); c = c.filter(x => x.name_fi.toLowerCase().includes(q) || x.location_name?.toLowerCase().includes(q)) }
    if (userPos && radiusKm) c = c.filter(x => x.latitude && x.longitude && haversineKm(userPos[0], userPos[1], x.latitude!, x.longitude!) <= radiusKm)
    return c
  }, [cityEvents, showEvents, eventSource, cityEventCategory, debouncedSearch, userPos, radiusKm])

  const filteredPlaces = useMemo(() => {
    if (!showPlaces) return []
    let p = places.filter(x => isInCityBounds(x.latitude, x.longitude, cityBounds))
    if (placeFilter) p = p.filter(x => x.category === placeFilter)
    if (debouncedSearch) { const q = debouncedSearch.toLowerCase(); p = p.filter(x => x.name.toLowerCase().includes(q) || x.address?.toLowerCase().includes(q)) }
    if (userPos && radiusKm) p = p.filter(x => haversineKm(userPos[0], userPos[1], x.latitude, x.longitude) <= radiusKm)
    return p
  }, [places, showPlaces, placeFilter, debouncedSearch, userPos, radiusKm])

  const layerCounts = useMemo(() => ({
    posts: filteredPosts.length,
    events: filteredEvents.length + filteredCityEvents.length,
    places: filteredPlaces.length,
  }), [filteredPosts.length, filteredEvents.length, filteredCityEvents.length, filteredPlaces.length])

  const totalVisible = layerCounts.posts + layerCounts.events + layerCounts.places

  // ── Out-of-area detection ──
  const isOutOfArea = useMemo(() => {
    if (!userPos) return false
    return !isInCityBounds(userPos[0], userPos[1], cityBounds)
  }, [userPos, cityBounds])

  const searchResults = useMemo((): SearchResult[] => {
    if (!debouncedSearch || debouncedSearch.length < 2) return []
    const q = debouncedSearch.toLowerCase()
    const results: SearchResult[] = []
    for (const p of filteredPosts) {
      if (results.length >= 8) break
      if (p.latitude && p.longitude && (p.title.toLowerCase().includes(q) || p.location?.toLowerCase().includes(q)))
        results.push({ type: 'post', name: p.title, lat: p.latitude, lng: p.longitude, category: p.type })
    }
    for (const e of filteredEvents) {
      if (results.length >= 8) break
      if (e.location_lat && e.location_lng && (e.title.toLowerCase().includes(q) || e.location_name?.toLowerCase().includes(q)))
        results.push({ type: 'event', name: e.title, lat: e.location_lat, lng: e.location_lng })
    }
    for (const ce of filteredCityEvents) {
      if (results.length >= 8) break
      if (ce.latitude && ce.longitude && (ce.name_fi.toLowerCase().includes(q) || ce.location_name?.toLowerCase().includes(q)))
        results.push({ type: 'city_event', name: ce.name_fi, lat: ce.latitude, lng: ce.longitude, category: ce.category })
    }
    for (const pl of filteredPlaces) {
      if (results.length >= 8) break
      if (pl.name.toLowerCase().includes(q) || pl.address?.toLowerCase().includes(q))
        results.push({ type: 'place', name: pl.name, lat: pl.latitude, lng: pl.longitude, category: pl.category })
    }
    return results
  }, [debouncedSearch, filteredPosts, filteredEvents, filteredCityEvents, filteredPlaces])

  const handleSearchResultClick = useCallback((result: SearchResult) => {
    setFlyTo({ lat: result.lat, lng: result.lng, zoom: 17 })
    setShowSearch(false)
    setSearchQuery('')
    setActiveSubFilter(null)
  }, [])

  const cityEventCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    const source = eventSource === 'community' ? [] : cityEvents
    for (const ce of source) {
      if (!ce.latitude || !ce.longitude || !isInCityBounds(ce.latitude, ce.longitude, cityBounds)) continue
      if (userPos && radiusKm && haversineKm(userPos[0], userPos[1], ce.latitude, ce.longitude) > radiusKm) continue
      counts[ce.category] = (counts[ce.category] ?? 0) + 1
    }
    return counts
  }, [cityEvents, eventSource, userPos, radiusKm])

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

  const handleResetFilters = useCallback(() => {
    setShowPosts(true); setShowEvents(true); setShowPlaces(true)
    setPostFilter(null); setPlaceFilter(null); setEventSource('all')
    setCityEventCategory(null); setRadiusKm(null); setActiveSubFilter(null)
  }, [])

  const dismissOverlays = useCallback(() => {
    setActiveSubFilter(null); setShowAreaPicker(false); setShowSearch(false)
  }, [])

  return (
    <View style={[ms.container, { backgroundColor: colors.background }]}>
      {/* ── Map ── */}
      <View style={ms.mapWrap}>
        {loading ? <View style={ms.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View> : (
          <LeafletMap posts={filteredPosts} events={filteredEvents} cityEvents={filteredCityEvents} places={filteredPlaces} selectedArea={selectedArea} userPos={userPos} radiusKm={radiusKm} flyTo={flyTo} onFlyComplete={() => setFlyTo(null)} onMapInteraction={dismissOverlays} isDark={isDark} t={t} cityCenter={cityConfig.city ? [cityConfig.city.center_lat, cityConfig.city.center_lng] : undefined} neighborhoodCoords={Object.keys(cityConfig.neighborhoodCoords).length > 0 ? Object.fromEntries(Object.entries(cityConfig.neighborhoodCoords).map(([k, v]) => [k, [v.lat, v.lng] as [number, number]])) : undefined} />
        )}
      </View>

      {/* ── TOP BAR: Back + Area + Search ── */}
      <View style={[ms.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} style={[ms.pill, { backgroundColor: colors.card }]}>
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>
        <Pressable onPress={() => { setShowAreaPicker(!showAreaPicker); setShowSearch(false); setActiveSubFilter(null) }} style={[ms.areaPill, { backgroundColor: colors.card }]}>
          <Navigation size={14} color={colors.primary} />
          <Text style={[ms.areaPillText, { color: colors.foreground }]} numberOfLines={1}>{selectedArea ?? (cityConfig.city?.name ?? t('map.allHelsinki'))}</Text>
          <ChevronDown size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable onPress={() => { setShowSearch(!showSearch); setShowAreaPicker(false); setActiveSubFilter(null) }} style={[ms.pill, { backgroundColor: colors.card }]}>
          <Search size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {/* ── Out of Area Banner ── */}
      {isOutOfArea && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 48, zIndex: 25 }}>
          <OutOfAreaBanner visible={isOutOfArea} cityName={cityConfig.city?.name ?? 'Helsinki'} />
        </View>
      )}

      {/* ── LAYER PILLS ── */}
      <View style={[ms.layerRow, { top: insets.top + 52 }]}>
        <Pressable onPress={() => toggleLayer('posts')} onLongPress={() => toggleSubFilter('posts')} delayLongPress={300} style={[ms.layerPill, { backgroundColor: showPosts ? colors.primary : colors.card }]}>
          <Newspaper size={14} color={showPosts ? '#FFF' : colors.mutedForeground} />
          <Text style={[ms.layerText, { color: showPosts ? '#FFF' : colors.mutedForeground }]}>{t('map.layerPosts')}</Text>
          <View style={[ms.badge, { backgroundColor: showPosts ? 'rgba(255,255,255,0.3)' : colors.muted }]}><Text style={[ms.badgeNum, { color: showPosts ? '#FFF' : colors.mutedForeground }]}>{filteredPosts.length}</Text></View>
        </Pressable>
        <Pressable onPress={() => toggleLayer('events')} onLongPress={() => toggleSubFilter('events')} delayLongPress={300} style={[ms.layerPill, { backgroundColor: showEvents ? '#2B8A62' : colors.card }]}>
          <CalendarDays size={14} color={showEvents ? '#FFF' : colors.mutedForeground} />
          <Text style={[ms.layerText, { color: showEvents ? '#FFF' : colors.mutedForeground }]}>{t('map.layerEvents')}</Text>
          <View style={[ms.badge, { backgroundColor: showEvents ? 'rgba(255,255,255,0.3)' : colors.muted }]}><Text style={[ms.badgeNum, { color: showEvents ? '#FFF' : colors.mutedForeground }]}>{filteredEvents.length + filteredCityEvents.length}</Text></View>
        </Pressable>
        <Pressable onPress={() => toggleLayer('places')} onLongPress={() => toggleSubFilter('places')} delayLongPress={300} style={[ms.layerPill, { backgroundColor: showPlaces ? '#78716C' : colors.card }]}>
          <Coffee size={14} color={showPlaces ? '#FFF' : colors.mutedForeground} />
          <Text style={[ms.layerText, { color: showPlaces ? '#FFF' : colors.mutedForeground }]}>{t('map.layerPlaces')}</Text>
          <View style={[ms.badge, { backgroundColor: showPlaces ? 'rgba(255,255,255,0.3)' : colors.muted }]}><Text style={[ms.badgeNum, { color: showPlaces ? '#FFF' : colors.mutedForeground }]}>{filteredPlaces.length}</Text></View>
        </Pressable>
      </View>

      {/* ── SUB-FILTER CHIPS ── */}
      {activeSubFilter && (
        <View style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 92, zIndex: 9 }}>
          <MapFilterChips
            activeSubFilter={activeSubFilter}
            postFilter={postFilter}
            onPostFilterChange={setPostFilter}
            eventSource={eventSource}
            onEventSourceChange={setEventSource}
            cityEventCategory={cityEventCategory}
            onCityEventCategoryChange={setCityEventCategory}
            cityEventCategoryCounts={cityEventCategoryCounts}
            placeFilter={placeFilter}
            onPlaceFilterChange={setPlaceFilter}
            colors={colors}
            t={t}
          />
        </View>
      )}

      {/* ── AREA PICKER ── */}
      {showAreaPicker && (
        <View style={[ms.overlay, { top: insets.top + 52, backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
            <Pressable onPress={() => { setSelectedArea(null); setShowAreaPicker(false) }} style={ms.overlayItem}>
              <Text style={[ms.overlayText, { color: colors.foreground, fontWeight: !selectedArea ? '700' : '400' }]}>{cityConfig.city?.name ?? 'Helsinki'} ({t('common.all')})</Text>
            </Pressable>
            {areaNeighborhoods.map((nh) => (
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
          <MapSearchBar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onClear={() => setSearchQuery('')}
            placeholder={t('feed.searchPlaceholder')}
            results={searchResults}
            onResultPress={handleSearchResultClick}
            colors={colors}
            t={t}
          />
        </View>
      )}

      {/* ── GPS BUTTON ── */}
      <Pressable onPress={handleGeolocate} disabled={geoLoading} style={[ms.gpsBtn, { bottom: insets.bottom + (userPos ? 140 : 70), backgroundColor: userPos ? colors.primary : colors.card }]}>
        {geoLoading ? <Loader2 size={20} color={colors.foreground} /> : <Crosshair size={20} color={userPos ? '#FFF' : colors.foreground} />}
      </Pressable>

      {/* ── RADIUS PANEL ── */}
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

      {/* ── COUNT BAR ── */}
      <View style={[ms.countBar, { bottom: insets.bottom + 24, backgroundColor: colors.card, borderColor: colors.border }]}>
        <MapPin size={14} color={colors.mutedForeground} />
        <Text style={[ms.countText, { color: colors.foreground }]}>{totalVisible} {t('map.visible')}</Text>
      </View>

      {/* ── ERROR STATE ── */}
      {fetchError && !loading && (
        <MapErrorState
          error="Virhe ladattaessa karttadataa"
          hint="Tarkista verkkoyhteys ja yrit\u00E4 uudelleen."
          onRetry={() => { setFetchError(false); setLoading(true) }}
          retryLabel="Yrit\u00E4 uudelleen"
          colors={colors}
        />
      )}

      {/* ── EMPTY STATE ── */}
      {!loading && !fetchError && totalVisible === 0 && (
        <MapEmptyState
          title={t('map.noResults')}
          hint={t('map.resetFiltersHint')}
          onReset={handleResetFilters}
          resetLabel={t('map.resetFilters')}
          colors={colors}
        />
      )}
    </View>
  )
}

const shadow = { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 }

const ms = StyleSheet.create({
  container: { flex: 1 },
  mapWrap: { ...StyleSheet.absoluteFillObject },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  pill: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', ...shadow },
  areaPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 12, paddingHorizontal: 12, ...shadow },
  areaPillText: { fontSize: 14, fontWeight: '600', flex: 1 },
  layerRow: { position: 'absolute', left: 12, right: 12, zIndex: 10, flexDirection: 'row', gap: 6 },
  layerPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 36, borderRadius: 18, ...shadow },
  layerText: { fontSize: 11, fontWeight: '600' },
  badge: { minWidth: 20, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeNum: { fontSize: 10, fontWeight: '700' },
  overlay: { position: 'absolute', left: 12, right: 12, zIndex: 20, borderRadius: 12, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },
  overlayItem: { paddingHorizontal: 16, paddingVertical: 12 },
  overlayText: { fontSize: 14 },
  gpsBtn: { position: 'absolute', right: 12, zIndex: 10, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', ...shadow },
  radiusPanel: { position: 'absolute', left: 16, right: 16, zIndex: 10, borderRadius: 16, borderWidth: 1, padding: 14, gap: 10, ...shadow },
  radiusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radiusLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  radiusVal: { fontSize: 13, fontWeight: '600' },
  toggle: { width: 34, height: 20, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 3 },
  toggleThumb: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFF' },
  presets: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  preset: { width: 40, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  presetText: { fontSize: 12, fontWeight: '600' },
  countBar: { position: 'absolute', left: 60, right: 60, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 18, borderWidth: 1, ...shadow },
  countText: { fontSize: 13, fontWeight: '500' },
})
