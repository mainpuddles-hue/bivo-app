import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import MapView, { Marker, Callout, Circle, PROVIDER_DEFAULT } from 'react-native-maps'
import {
  ArrowLeft, Search, X, MapPin, Navigation, ChevronDown,
  Newspaper, CalendarDays, Coffee, Crosshair, Loader2,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIES, NEIGHBORHOODS } from '@/lib/constants'
import type { Post, PostType, Event, CityEvent, LocalPlace } from '@/lib/types'

const HELSINKI_CENTER = { latitude: 60.1699, longitude: 24.9384 }
const HKI = { south: 60.14, north: 60.27, west: 24.83, east: 25.20 } as const

const isInHelsinki = (lat: number, lng: number): boolean => {
  if (lat < HKI.south || lat > HKI.north || lng < HKI.west || lng > HKI.east) return false
  if (lat > 60.24 && lng < 24.88) return false
  if (lat > 60.26 && lng < 24.96) return false
  return true
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const PLACE_COLORS: Record<string, string> = {
  restaurant: '#E74C3C', cafe: '#8B5E3C', bar: '#9B59B6', shop: '#3498DB',
  library: '#27AE60', health: '#E91E63', sport: '#F39C12', culture: '#8E44AD',
  hotel: '#2C3E50', attraction: '#F1C40F', service: '#607D8B',
  fast_food: '#FF5722', pub: '#795548', other: '#78716C',
}

const CITY_CAT_COLORS: Record<string, string> = {
  culture: '#8E44AD', music: '#E91E63', sport: '#27AE60', family: '#FF9800',
  food: '#E74C3C', nature: '#4CAF50', education: '#2196F3', theatre: '#9C27B0',
  exhibition: '#795548', festival: '#FF5722', market: '#FF9800', other: '#607D8B',
}

const NEIGHBORHOOD_COORDS: Record<string, { latitude: number; longitude: number }> = {
  'Kallio': { latitude: 60.1844, longitude: 24.9496 },
  'Sörnäinen': { latitude: 60.1870, longitude: 24.9700 },
  'Vallila': { latitude: 60.1930, longitude: 24.9530 },
  'Kamppi': { latitude: 60.1686, longitude: 24.9316 },
  'Töölö': { latitude: 60.1810, longitude: 24.9220 },
  'Kruununhaka': { latitude: 60.1730, longitude: 24.9560 },
  'Pasila': { latitude: 60.1985, longitude: 24.9310 },
  'Lauttasaari': { latitude: 60.1580, longitude: 24.8770 },
  'Herttoniemi': { latitude: 60.1950, longitude: 25.0320 },
  'Vuosaari': { latitude: 60.2090, longitude: 25.1450 },
  'Malmi': { latitude: 60.2490, longitude: 25.0110 },
}

export default function MapScreen() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const mapRef = useMemo(() => ({ current: null as MapView | null }), [])

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
  const [activeSubFilter, setActiveSubFilter] = useState<'posts' | 'events' | 'places' | null>(null)

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      const [postsRes, eventsRes, cityRes, placesRes] = await Promise.allSettled([
        supabase.from('posts').select('id, type, title, description, location, latitude, longitude, image_url, daily_fee, user:profiles!posts_user_id_fkey(id, name, avatar_url, naapurusto)').eq('is_active', true).not('latitude', 'is', null).not('longitude', 'is', null).gte('latitude', HKI.south).lte('latitude', HKI.north).gte('longitude', HKI.west).lte('longitude', HKI.east).limit(200),
        supabase.from('events').select('id, title, description, event_date, location_name, location_lat, location_lng, icon, max_attendees, attendees:event_attendees(count), creator:profiles!events_creator_id_fkey(id, name, avatar_url)').eq('is_active', true).gte('event_date', new Date().toISOString()).not('location_lat', 'is', null).not('location_lng', 'is', null).order('event_date', { ascending: true }).limit(200),
        supabase.from('city_events').select('id, name_fi, name_en, name_sv, description_fi, start_time, end_time, location_name, location_address, latitude, longitude, image_url, info_url, category, is_free, price_info, organizer').gte('start_time', new Date().toISOString()).gte('latitude', 60.14).lte('latitude', 60.29).gte('longitude', 24.83).lte('longitude', 25.22).order('start_time', { ascending: true }).limit(200),
        supabase.from('local_places').select('id, name, category, subcategory, address, latitude, longitude, phone, website, opening_hours, image_url, neighborhood, tags').not('neighborhood', 'is', null).gte('latitude', HKI.south).lte('latitude', HKI.north).gte('longitude', HKI.west).lte('longitude', HKI.east).limit(500),
      ])
      setPosts(postsRes.status === 'fulfilled' ? (postsRes.value.data ?? []) as unknown as Post[] : [])
      const rawE = eventsRes.status === 'fulfilled' ? (eventsRes.value.data ?? []) : []
      setEvents(rawE.map((e: any) => ({ ...e, attendee_count: (e.attendees as any)?.[0]?.count ?? 0, creator: Array.isArray(e.creator) ? e.creator[0] ?? null : e.creator ?? null })) as unknown as Event[])
      setCityEvents(cityRes.status === 'fulfilled' ? (cityRes.value.data ?? []) as unknown as CityEvent[] : [])
      setPlaces(placesRes.status === 'fulfilled' ? (placesRes.value.data ?? []) as unknown as LocalPlace[] : [])
      setLoading(false)
    }
    fetchData()
  }, [supabase])

  // Filtered data
  const filteredPosts = useMemo(() => {
    if (!showPosts) return []
    let p = posts.filter(x => x.latitude && x.longitude && isInHelsinki(x.latitude, x.longitude))
    if (postFilter) p = p.filter(x => x.type === postFilter)
    return p
  }, [posts, showPosts, postFilter])

  const filteredEvents = useMemo(() => {
    if (!showEvents || eventSource === 'city') return []
    return events.filter(x => x.location_lat && x.location_lng && isInHelsinki(x.location_lat, x.location_lng))
  }, [events, showEvents, eventSource])

  const filteredCityEvents = useMemo(() => {
    if (!showEvents || eventSource === 'community') return []
    return cityEvents.filter(x => x.latitude && x.longitude && isInHelsinki(x.latitude!, x.longitude!))
  }, [cityEvents, showEvents, eventSource])

  const filteredPlaces = useMemo(() => {
    if (!showPlaces) return []
    let p = places.filter(x => isInHelsinki(x.latitude, x.longitude))
    if (placeFilter) p = p.filter(x => x.category === placeFilter)
    return p.slice(0, 200) // Limit markers for performance
  }, [places, showPlaces, placeFilter])

  const totalVisible = filteredPosts.length + filteredEvents.length + filteredCityEvents.length + filteredPlaces.length

  const toggleLayer = (layer: 'posts' | 'events' | 'places') => {
    if (layer === 'posts') setShowPosts(!showPosts)
    else if (layer === 'events') setShowEvents(!showEvents)
    else setShowPlaces(!showPlaces)
  }

  const flyToArea = (area: string) => {
    const coords = NEIGHBORHOOD_COORDS[area]
    if (coords && mapRef.current) {
      mapRef.current.animateToRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 1000)
    }
    setSelectedArea(area)
    setShowAreaPicker(false)
  }

  if (loading) {
    return (
      <View style={[ms.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </View>
    )
  }

  return (
    <View style={[ms.container, { backgroundColor: colors.background }]}>
      <MapView
        ref={(ref) => { mapRef.current = ref }}
        provider={PROVIDER_DEFAULT}
        style={ms.map}
        initialRegion={{ ...HELSINKI_CENTER, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {/* Post markers */}
        {filteredPosts.map((p) => (
          <Marker
            key={`post-${p.id}`}
            coordinate={{ latitude: p.latitude!, longitude: p.longitude! }}
            pinColor={CATEGORIES[p.type as PostType]?.color ?? '#2D6B5E'}
          >
            <Callout>
              <View style={{ maxWidth: 200, padding: 4 }}>
                <Text style={{ fontWeight: '600', fontSize: 14 }}>{p.title}</Text>
                {p.location && <Text style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{p.location}</Text>}
              </View>
            </Callout>
          </Marker>
        ))}

        {/* Community event markers */}
        {filteredEvents.map((e) => (
          <Marker
            key={`event-${e.id}`}
            coordinate={{ latitude: e.location_lat!, longitude: e.location_lng! }}
            pinColor="#2B8A62"
          >
            <Callout>
              <View style={{ maxWidth: 200, padding: 4 }}>
                <Text style={{ fontWeight: '600', fontSize: 14 }}>{e.title}</Text>
                <Text style={{ fontSize: 11, color: '#2B8A62', marginTop: 2 }}>
                  {new Date(e.event_date).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
                {e.location_name && <Text style={{ fontSize: 11, color: '#666' }}>{e.location_name}</Text>}
              </View>
            </Callout>
          </Marker>
        ))}

        {/* City event markers */}
        {filteredCityEvents.map((ce) => (
          <Marker
            key={`ce-${ce.id}`}
            coordinate={{ latitude: ce.latitude!, longitude: ce.longitude! }}
            pinColor={CITY_CAT_COLORS[ce.category] ?? '#607D8B'}
          >
            <Callout>
              <View style={{ maxWidth: 200, padding: 4 }}>
                <Text style={{ fontWeight: '600', fontSize: 14 }}>{ce.name_fi}</Text>
                <Text style={{ fontSize: 11, color: CITY_CAT_COLORS[ce.category] ?? '#607D8B', marginTop: 2 }}>
                  {new Date(ce.start_time).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
                {ce.location_name && <Text style={{ fontSize: 11, color: '#666' }}>{ce.location_name}</Text>}
                {ce.is_free && <Text style={{ fontSize: 11, color: '#2B8A62', fontWeight: '600', marginTop: 2 }}>Ilmainen</Text>}
              </View>
            </Callout>
          </Marker>
        ))}

        {/* Place markers */}
        {filteredPlaces.map((pl) => (
          <Marker
            key={`pl-${pl.id}`}
            coordinate={{ latitude: pl.latitude, longitude: pl.longitude }}
            pinColor={PLACE_COLORS[pl.category] ?? '#78716C'}
          >
            <Callout>
              <View style={{ maxWidth: 200, padding: 4 }}>
                <Text style={{ fontWeight: '600', fontSize: 14 }}>{pl.name}</Text>
                {pl.address && <Text style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{pl.address}</Text>}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* TOP BAR */}
      <View style={[ms.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} style={[ms.pill, { backgroundColor: colors.card }]}>
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>
        <Pressable onPress={() => setShowAreaPicker(!showAreaPicker)} style={[ms.areaPill, { backgroundColor: colors.card }]}>
          <Navigation size={14} color={colors.primary} />
          <Text style={[ms.areaPillText, { color: colors.foreground }]} numberOfLines={1}>{selectedArea ?? t('map.allHelsinki')}</Text>
          <ChevronDown size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* LAYER PILLS */}
      <View style={[ms.layerRow, { top: insets.top + 52 }]}>
        {([
          { key: 'posts' as const, icon: Newspaper, active: showPosts, count: filteredPosts.length, color: colors.primary },
          { key: 'events' as const, icon: CalendarDays, active: showEvents, count: filteredEvents.length + filteredCityEvents.length, color: '#2B8A62' },
          { key: 'places' as const, icon: Coffee, active: showPlaces, count: filteredPlaces.length, color: '#78716C' },
        ]).map(({ key, icon: Icon, active, count, color }) => (
          <Pressable key={key} onPress={() => toggleLayer(key)} style={[ms.layerPill, { backgroundColor: active ? color : colors.card }]}>
            <Icon size={14} color={active ? '#FFF' : colors.mutedForeground} />
            <Text style={[ms.layerText, { color: active ? '#FFF' : colors.mutedForeground }]}>{t(`map.layer${key.charAt(0).toUpperCase() + key.slice(1)}`)}</Text>
            <View style={[ms.badge, { backgroundColor: active ? 'rgba(255,255,255,0.3)' : colors.muted }]}>
              <Text style={[ms.badgeNum, { color: active ? '#FFF' : colors.mutedForeground }]}>{count}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      {/* AREA PICKER */}
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

      {/* COUNT BAR */}
      <View style={[ms.countBar, { bottom: insets.bottom + 24, backgroundColor: colors.card, borderColor: colors.border }]}>
        <MapPin size={14} color={colors.mutedForeground} />
        <Text style={[ms.countText, { color: colors.foreground }]}>{totalVisible} {t('map.visible')}</Text>
      </View>
    </View>
  )
}

const shadow = { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 }

const ms = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  pill: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', ...shadow },
  areaPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 12, paddingHorizontal: 12, ...shadow },
  areaPillText: { fontSize: 14, fontWeight: '600', flex: 1 },
  layerRow: { position: 'absolute', left: 12, right: 12, zIndex: 10, flexDirection: 'row', gap: 6 },
  layerPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 36, borderRadius: 18, ...shadow },
  layerText: { fontSize: 11, fontWeight: '600' },
  badge: { minWidth: 20, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeNum: { fontSize: 10, fontWeight: '700' },
  overlay: { position: 'absolute', left: 12, right: 12, zIndex: 20, borderRadius: 12, borderWidth: 1, overflow: 'hidden', ...shadow },
  overlayItem: { paddingHorizontal: 16, paddingVertical: 12 },
  overlayText: { fontSize: 14 },
  countBar: { position: 'absolute', left: 60, right: 60, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 18, borderWidth: 1, ...shadow },
  countText: { fontSize: 13, fontWeight: '500' },
})
