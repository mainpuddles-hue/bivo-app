import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, Platform, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import {
  ArrowLeft, Search, X, MapPin, Navigation, Layers,
  ChevronDown, Minus, Plus,
  Newspaper, CalendarDays, Coffee,
  HandHelping, Gift, Heart, Zap, BookOpen,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIES, NEIGHBORHOODS } from '@/lib/constants'
import { formatTimeAgo } from '@/lib/format'
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

// Leaflet map rendered via dangerouslySetInnerHTML on web
function LeafletMap({ posts, events, cityEvents, places, center, zoom, selectedArea, onMarkerClick, colors, isDark, t, locale }: {
  posts: Post[]
  events: Event[]
  cityEvents: CityEvent[]
  places: LocalPlace[]
  center: [number, number]
  zoom: number
  selectedArea: string | null
  onMarkerClick: (type: string, id: string) => void
  colors: any
  isDark: boolean
  t: any
  locale: string
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (Platform.OS !== 'web' || !mapRef.current) return
    if (typeof window === 'undefined') return

    // Load Leaflet CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    // Load Leaflet JS
    const loadLeaflet = () => {
      return new Promise<void>((resolve) => {
        if ((window as any).L) { resolve(); return }
        const script = document.createElement('script')
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        script.onload = () => resolve()
        document.head.appendChild(script)
      })
    }

    loadLeaflet().then(() => {
      const L = (window as any).L
      if (!L || !mapRef.current) return

      // Destroy existing map
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
      }

      const map = L.map(mapRef.current, {
        zoomControl: false,
      }).setView(center, zoom)

      // Tile layer — dark/light
      const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

      L.tileLayer(tileUrl, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map)

      // Zoom control top-right
      L.control.zoom({ position: 'topright' }).addTo(map)

      // Post markers
      posts.forEach((post) => {
        if (!post.latitude || !post.longitude) return
        const cat = CATEGORIES[post.type as PostType]
        const color = cat?.color ?? colors.primary

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:2px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);">
            <span style="color:white;font-size:14px;font-weight:bold;">${post.type.charAt(0).toUpperCase()}</span>
          </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })

        const marker = L.marker([post.latitude, post.longitude], { icon }).addTo(map)

        const popupHtml = `
          <div style="min-width:200px;font-family:system-ui;">
            ${post.image_url ? `<img src="${post.image_url}" style="width:100%;height:100px;object-fit:cover;border-radius:8px 8px 0 0;margin:-12px -12px 8px -12px;width:calc(100% + 24px);" />` : ''}
            <div style="padding:4px 0;">
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">
                <span style="width:8px;height:8px;border-radius:4px;background:${color};"></span>
                <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:${color};">${t(cat?.label ?? '')}</span>
              </div>
              <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${post.title}</div>
              ${post.location ? `<div style="font-size:11px;color:#9CA3AF;display:flex;align-items:center;gap:3px;">📍 ${post.location}</div>` : ''}
              ${post.user ? `<div style="font-size:11px;color:#9CA3AF;margin-top:6px;">${post.user.name}</div>` : ''}
            </div>
          </div>
        `
        marker.bindPopup(popupHtml, { maxWidth: 260 })
      })

      // Event markers
      events.forEach((event) => {
        if (!event.location_lat || !event.location_lng) return
        const day = new Date(event.event_date).getDate()

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:32px;height:32px;border-radius:8px;background:#2B8A62;border:2px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);">
            <span style="color:white;font-size:12px;font-weight:bold;">${day}</span>
          </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })

        L.marker([event.location_lat, event.location_lng], { icon })
          .addTo(map)
          .bindPopup(`<div style="font-family:system-ui;"><div style="font-size:14px;font-weight:600;">${event.title}</div><div style="font-size:11px;color:#2B8A62;">${new Date(event.event_date).toLocaleDateString()}</div>${event.location_name ? `<div style="font-size:11px;color:#9CA3AF;">📍 ${event.location_name}</div>` : ''}</div>`, { maxWidth: 220 })
      })

      // City event markers
      cityEvents.forEach((ce) => {
        if (!ce.latitude || !ce.longitude) return
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:28px;height:28px;border-radius:6px;background:#3B7DD8;border:2px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);">
            <span style="color:white;font-size:10px;font-weight:bold;">H</span>
          </div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })

        L.marker([ce.latitude, ce.longitude], { icon })
          .addTo(map)
          .bindPopup(`<div style="font-family:system-ui;">${ce.image_url ? `<img src="${ce.image_url}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:6px;" />` : ''}<div style="font-size:14px;font-weight:600;">${ce.name_fi}</div><div style="font-size:11px;color:#3B7DD8;">${new Date(ce.start_time).toLocaleDateString()}</div>${ce.location_name ? `<div style="font-size:11px;color:#9CA3AF;">📍 ${ce.location_name}</div>` : ''}${ce.is_free ? '<div style="font-size:10px;color:#2B8A62;font-weight:600;margin-top:4px;">Ilmainen</div>' : ''}</div>`, { maxWidth: 240 })
      })

      // Place markers
      places.forEach((place) => {
        if (!place.latitude || !place.longitude) return
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:24px;height:24px;border-radius:6px;background:#F59E0B;border:1.5px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.2);">
            <span style="color:white;font-size:9px;font-weight:bold;">☕</span>
          </div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        })

        L.marker([place.latitude, place.longitude], { icon })
          .addTo(map)
          .bindPopup(`<div style="font-family:system-ui;"><div style="font-size:13px;font-weight:600;">${place.name}</div>${place.address ? `<div style="font-size:11px;color:#9CA3AF;">📍 ${place.address}</div>` : ''}${place.opening_hours ? `<div style="font-size:10px;color:#9CA3AF;">🕐 ${place.opening_hours}</div>` : ''}</div>`, { maxWidth: 200 })
      })

      mapInstanceRef.current = map
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [posts, events, cityEvents, places, center, zoom, isDark, colors, t])

  // Fly to selected area
  useEffect(() => {
    if (!selectedArea || !mapInstanceRef.current) return
    const coords = NEIGHBORHOOD_COORDS[selectedArea]
    if (coords) {
      mapInstanceRef.current.flyTo(coords, 15, { duration: 1 })
    }
  }, [selectedArea])

  if (Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>Kartta ei ole saatavilla tässä ympäristössä</Text>
      </View>
    )
  }

  return <div ref={mapRef as any} style={{ width: '100%', height: '100%' }} />
}

export default function MapScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [posts, setPosts] = useState<Post[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([])
  const [places, setPlaces] = useState<LocalPlace[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [showPosts, setShowPosts] = useState(true)
  const [showEvents, setShowEvents] = useState(true)
  const [showPlaces, setShowPlaces] = useState(false)
  const [postFilter, setPostFilter] = useState<PostType | null>(null)
  const [selectedArea, setSelectedArea] = useState<string | null>(null)
  const [showAreaPicker, setShowAreaPicker] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const [postsRes, eventsRes, cityRes, placesRes] = await Promise.all([
        supabase.from('posts').select('id, type, title, description, location, latitude, longitude, image_url, daily_fee, user_id, user:profiles!posts_user_id_fkey(id, name, avatar_url, naapurusto)').eq('is_active', true).not('latitude', 'is', null).limit(200),
        supabase.from('events').select('*, creator:profiles!events_creator_id_fkey(id, name, avatar_url)').eq('is_active', true).not('location_lat', 'is', null).gte('event_date', new Date().toISOString()).limit(50),
        supabase.from('city_events').select('*').not('latitude', 'is', null).gte('start_time', new Date().toISOString()).limit(50),
        supabase.from('local_places').select('*').limit(200),
      ])
      setPosts((postsRes.data ?? []) as unknown as Post[])
      setEvents((eventsRes.data ?? []) as unknown as Event[])
      setCityEvents((cityRes.data ?? []) as unknown as CityEvent[])
      setPlaces((placesRes.data ?? []) as unknown as LocalPlace[])
      setLoading(false)
    }
    fetchData()
  }, [supabase])

  // Filter data
  const filteredPosts = useMemo(() => {
    let p = posts
    if (postFilter) p = p.filter(x => x.type === postFilter)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      p = p.filter(x => x.title.toLowerCase().includes(q) || x.location?.toLowerCase().includes(q))
    }
    return p
  }, [posts, postFilter, searchQuery])

  const filteredEvents = useMemo(() => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return events.filter(e => e.title.toLowerCase().includes(q))
    }
    return events
  }, [events, searchQuery])

  const visiblePosts = showPosts ? filteredPosts : []
  const visibleEvents = showEvents ? filteredEvents : []
  const visibleCityEvents = showEvents ? cityEvents : []
  const visiblePlaces = showPlaces ? places : []
  const totalVisible = visiblePosts.length + visibleEvents.length + visibleCityEvents.length + visiblePlaces.length

  const handleMarkerClick = useCallback((type: string, id: string) => {
    if (type === 'post') router.push(`/post/${id}`)
  }, [router])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Map */}
      <View style={s.mapWrap}>
        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <LeafletMap
            posts={visiblePosts}
            events={visibleEvents}
            cityEvents={visibleCityEvents}
            places={visiblePlaces}
            center={selectedArea && NEIGHBORHOOD_COORDS[selectedArea] ? NEIGHBORHOOD_COORDS[selectedArea] : HELSINKI_CENTER}
            zoom={DEFAULT_ZOOM}
            selectedArea={selectedArea}
            onMarkerClick={handleMarkerClick}
            colors={colors}
            isDark={isDark}
            t={t}
            locale={locale}
          />
        )}
      </View>

      {/* Header overlay */}
      <View style={[s.headerOverlay, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={[s.overlayBtn, { backgroundColor: colors.card }]}>
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>

        {/* Area selector */}
        <Pressable onPress={() => setShowAreaPicker(!showAreaPicker)} style={[s.areaBtn, { backgroundColor: colors.card }]}>
          <MapPin size={14} color={colors.primary} />
          <Text style={[s.areaBtnText, { color: colors.foreground }]} numberOfLines={1}>
            {selectedArea ?? 'Helsinki'}
          </Text>
          <ChevronDown size={14} color={colors.mutedForeground} />
        </Pressable>

        {/* Search toggle */}
        <Pressable onPress={() => setShowSearch(!showSearch)} style={[s.overlayBtn, { backgroundColor: colors.card }]}>
          <Search size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Area picker dropdown */}
      {showAreaPicker && (
        <View style={[s.dropdown, { top: insets.top + 56, backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
            <Pressable onPress={() => { setSelectedArea(null); setShowAreaPicker(false) }} style={s.dropdownItem}>
              <Text style={[s.dropdownText, { color: colors.foreground, fontWeight: !selectedArea ? '700' : '400' }]}>Helsinki (kaikki)</Text>
            </Pressable>
            {NEIGHBORHOODS.map((nh) => (
              <Pressable key={nh} onPress={() => { setSelectedArea(nh); setShowAreaPicker(false) }} style={s.dropdownItem}>
                <Text style={[s.dropdownText, { color: colors.foreground, fontWeight: selectedArea === nh ? '700' : '400' }]}>{nh}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Search bar */}
      {showSearch && (
        <View style={[s.searchBar, { top: insets.top + 56, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Search size={16} color={colors.mutedForeground} />
          <TextInput
            style={[s.searchInput, { color: colors.foreground }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('feed.searchPlaceholder')}
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

      {/* Filter panel */}
      <View style={[s.filterPanel, { bottom: insets.bottom + 16, backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Layer toggles */}
        <View style={s.layerRow}>
          <Pressable onPress={() => setShowPosts(!showPosts)} style={[s.layerBtn, showPosts && { backgroundColor: `${colors.primary}20` }]}>
            <Newspaper size={16} color={showPosts ? colors.primary : colors.mutedForeground} />
            <Text style={[s.layerText, { color: showPosts ? colors.primary : colors.mutedForeground }]}>{t('places.posts')}</Text>
            <View style={[s.layerCount, { backgroundColor: showPosts ? colors.primary : colors.muted }]}>
              <Text style={[s.layerCountText, { color: showPosts ? '#FFFFFF' : colors.mutedForeground }]}>{visiblePosts.length}</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => setShowEvents(!showEvents)} style={[s.layerBtn, showEvents && { backgroundColor: '#2B8A6220' }]}>
            <CalendarDays size={16} color={showEvents ? '#2B8A62' : colors.mutedForeground} />
            <Text style={[s.layerText, { color: showEvents ? '#2B8A62' : colors.mutedForeground }]}>{t('nav.events')}</Text>
            <View style={[s.layerCount, { backgroundColor: showEvents ? '#2B8A62' : colors.muted }]}>
              <Text style={[s.layerCountText, { color: showEvents ? '#FFFFFF' : colors.mutedForeground }]}>{visibleEvents.length + visibleCityEvents.length}</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => setShowPlaces(!showPlaces)} style={[s.layerBtn, showPlaces && { backgroundColor: '#F59E0B20' }]}>
            <Coffee size={16} color={showPlaces ? '#F59E0B' : colors.mutedForeground} />
            <Text style={[s.layerText, { color: showPlaces ? '#F59E0B' : colors.mutedForeground }]}>{t('places.title')}</Text>
            <View style={[s.layerCount, { backgroundColor: showPlaces ? '#F59E0B' : colors.muted }]}>
              <Text style={[s.layerCountText, { color: showPlaces ? '#FFFFFF' : colors.mutedForeground }]}>{visiblePlaces.length}</Text>
            </View>
          </Pressable>
        </View>

        {/* Expand for sub-filters */}
        <Pressable onPress={() => setFiltersExpanded(!filtersExpanded)} style={s.expandRow}>
          <Layers size={14} color={colors.mutedForeground} />
          <Text style={[s.expandText, { color: colors.mutedForeground }]}>
            {totalVisible} {t('map.visible')}
          </Text>
          <ChevronDown size={14} color={colors.mutedForeground} style={filtersExpanded ? { transform: [{ rotate: '180deg' }] } : undefined} />
        </Pressable>

        {/* Sub-filters */}
        {filtersExpanded && showPosts && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.subFilters}>
            <Pressable
              onPress={() => setPostFilter(null)}
              style={[s.subChip, !postFilter ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted }]}
            >
              <Text style={[s.subChipText, { color: !postFilter ? '#FFFFFF' : colors.mutedForeground }]}>{t('common.all')}</Text>
            </Pressable>
            {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).map(([type, cat]) => (
              <Pressable
                key={type}
                onPress={() => setPostFilter(postFilter === type ? null : type)}
                style={[s.subChip, postFilter === type ? { backgroundColor: cat.color } : { backgroundColor: colors.muted }]}
              >
                <Text style={[s.subChipText, { color: postFilter === type ? '#FFFFFF' : colors.mutedForeground }]}>{t(cat.label)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  mapWrap: { ...StyleSheet.absoluteFillObject },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingBottom: 8,
  },
  overlayBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  areaBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 40, borderRadius: 12, paddingHorizontal: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  areaBtnText: { fontSize: 14, fontWeight: '600', flex: 1 },
  dropdown: {
    position: 'absolute', left: 16, right: 16, zIndex: 20,
    borderRadius: 12, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 12 },
  dropdownText: { fontSize: 14 },
  searchBar: {
    position: 'absolute', left: 16, right: 16, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 44,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  searchInput: { flex: 1, fontSize: 14 },
  filterPanel: {
    position: 'absolute', left: 16, right: 16, zIndex: 10,
    borderRadius: 16, borderWidth: 1, padding: 12, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 5,
  },
  layerRow: { flexDirection: 'row', gap: 8 },
  layerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, borderRadius: 10,
  },
  layerText: { fontSize: 12, fontWeight: '500' },
  layerCount: {
    minWidth: 20, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  layerCountText: { fontSize: 9, fontWeight: '700' },
  expandRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  expandText: { fontSize: 12 },
  subFilters: { flexDirection: 'row', gap: 6, paddingTop: 4 },
  subChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  subChipText: { fontSize: 11, fontWeight: '500' },
})
