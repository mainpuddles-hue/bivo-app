import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, Pressable, ScrollView, TextInput, StyleSheet, Platform, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  ArrowLeft, Search, X, MapPin, Navigation, ChevronDown,
  Newspaper, CalendarDays, Coffee, Crosshair,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIES, NEIGHBORHOODS } from '@/lib/constants'
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

const CAT_ICONS: Record<string, string> = {
  tarvitsen: '🤝', tarjoan: '🎁', ilmaista: '💙', nappaa: '⚡', lainaa: '📖', tapahtuma: '📅',
}

const PLACE_ICONS: Record<string, string> = {
  restaurant: '🍽️', cafe: '☕', bar: '🍺', shop: '🛒', library: '📚',
  health: '🏥', sport: '⚽', culture: '🎭', hotel: '🏨', attraction: '⭐',
  service: '🔧', fast_food: '🍔', pub: '🍺', other: '📍',
}

// ── Leaflet Map (web only) ──
function LeafletMap({ posts, events, cityEvents, places, selectedArea, isDark, t }: {
  posts: Post[]; events: Event[]; cityEvents: CityEvent[]; places: LocalPlace[]
  selectedArea: string | null; isDark: boolean; t: any
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (Platform.OS !== 'web' || !mapRef.current || typeof window === 'undefined') return

    // Load Leaflet CSS + JS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    const loadLeaflet = (): Promise<any> => new Promise((resolve) => {
      if ((window as any).L) { resolve((window as any).L); return }
      const s = document.createElement('script')
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      s.onload = () => resolve((window as any).L)
      document.head.appendChild(s)
    })

    loadLeaflet().then((L) => {
      if (!L || !mapRef.current) return
      if (mapInstanceRef.current) mapInstanceRef.current.remove()

      const map = L.map(mapRef.current, { zoomControl: false }).setView(HELSINKI_CENTER, DEFAULT_ZOOM)

      L.tileLayer(
        isDark
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        { attribution: '&copy; OSM &copy; CARTO', maxZoom: 19 }
      ).addTo(map)

      L.control.zoom({ position: 'bottomright' }).addTo(map)

      // ── Post markers (large, colorful, with icons) ──
      posts.forEach((p) => {
        if (!p.latitude || !p.longitude) return
        const cat = CATEGORIES[p.type as PostType]
        const color = cat?.color ?? '#2D6B5E'
        const emoji = CAT_ICONS[p.type] ?? '📌'

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:40px;height:40px;border-radius:50%;background:${color};border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:18px;cursor:pointer;">${emoji}</div>`,
          iconSize: [40, 40], iconAnchor: [20, 20],
        })

        L.marker([p.latitude, p.longitude], { icon }).addTo(map)
          .bindPopup(`<div style="font-family:system-ui;min-width:220px;">
            ${p.image_url ? `<img src="${p.image_url}" style="width:calc(100% + 40px);height:120px;object-fit:cover;margin:-20px -20px 10px;border-radius:8px 8px 0 0;" />` : ''}
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${color};"></span>
              <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:${color};">${t(cat?.label ?? '')}</span>
            </div>
            <div style="font-size:15px;font-weight:600;margin-bottom:4px;">${p.title}</div>
            ${p.description ? `<div style="font-size:12px;color:#6B7280;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.description.slice(0, 80)}</div>` : ''}
            ${p.location ? `<div style="font-size:11px;color:#9CA3AF;">📍 ${p.location}</div>` : ''}
            ${p.user ? `<div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid #eee;">
              ${p.user.avatar_url ? `<img src="${p.user.avatar_url}" style="width:22px;height:22px;border-radius:11px;" />` : ''}
              <span style="font-size:12px;color:#6B7280;">${p.user.name}</span>
              ${p.user.naapurusto ? `<span style="font-size:10px;color:#9CA3AF;margin-left:auto;">${p.user.naapurusto}</span>` : ''}
            </div>` : ''}
          </div>`, { maxWidth: 280 })
      })

      // ── Event markers (green rounded squares with day) ──
      events.forEach((e) => {
        if (!e.location_lat || !e.location_lng) return
        const day = new Date(e.event_date).getDate()
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:38px;height:38px;border-radius:10px;background:#2B8A62;border:3px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">
            <span style="color:white;font-size:14px;font-weight:700;">${day}</span>
          </div>`,
          iconSize: [38, 38], iconAnchor: [19, 19],
        })
        L.marker([e.location_lat, e.location_lng], { icon }).addTo(map)
          .bindPopup(`<div style="font-family:system-ui;min-width:200px;">
            <div style="font-size:15px;font-weight:600;margin-bottom:4px;">${e.title}</div>
            <div style="font-size:12px;color:#2B8A62;font-weight:500;">${new Date(e.event_date).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            ${e.location_name ? `<div style="font-size:11px;color:#9CA3AF;margin-top:4px;">📍 ${e.location_name}</div>` : ''}
            ${e.attendee_count ? `<div style="font-size:11px;color:#9CA3AF;">👥 ${e.attendee_count} osallistujaa</div>` : ''}
          </div>`, { maxWidth: 240 })
      })

      // ── City event markers (blue gradient with category) ──
      cityEvents.forEach((ce) => {
        if (!ce.latitude || !ce.longitude) return
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,#3B7DD8,#6366F1);border:2.5px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;">
            <span style="font-size:14px;">🎵</span>
          </div>`,
          iconSize: [36, 36], iconAnchor: [18, 18],
        })
        L.marker([ce.latitude, ce.longitude], { icon }).addTo(map)
          .bindPopup(`<div style="font-family:system-ui;min-width:200px;">
            ${ce.image_url ? `<img src="${ce.image_url}" style="width:calc(100% + 40px);height:100px;object-fit:cover;margin:-20px -20px 10px;border-radius:8px 8px 0 0;" />` : ''}
            <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${ce.name_fi}</div>
            <div style="font-size:12px;color:#3B7DD8;">${new Date(ce.start_time).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            ${ce.location_name ? `<div style="font-size:11px;color:#9CA3AF;">📍 ${ce.location_name}</div>` : ''}
            ${ce.is_free ? '<div style="font-size:11px;color:#2B8A62;font-weight:600;margin-top:4px;">✓ Ilmainen</div>' : ''}
          </div>`, { maxWidth: 260 })
      })

      // ── Place markers (colored rounded squares with category emoji) ──
      places.forEach((pl) => {
        if (!pl.latitude || !pl.longitude) return
        const emoji = PLACE_ICONS[pl.category] ?? '📍'
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:30px;height:30px;border-radius:8px;background:#78716C;border:2px solid white;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.2);cursor:pointer;font-size:14px;">${emoji}</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15],
        })
        L.marker([pl.latitude, pl.longitude], { icon }).addTo(map)
          .bindPopup(`<div style="font-family:system-ui;min-width:180px;">
            <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${pl.name}</div>
            ${pl.address ? `<div style="font-size:11px;color:#9CA3AF;">📍 ${pl.address}</div>` : ''}
            ${pl.opening_hours ? `<div style="font-size:10px;color:#9CA3AF;margin-top:2px;">🕐 ${pl.opening_hours}</div>` : ''}
            ${pl.phone ? `<div style="font-size:11px;margin-top:4px;"><a href="tel:${pl.phone}" style="color:#3B7DD8;">${pl.phone}</a></div>` : ''}
          </div>`, { maxWidth: 220 })
      })

      mapInstanceRef.current = map
    })

    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null } }
  }, [posts, events, cityEvents, places, isDark, t])

  // Fly to area
  useEffect(() => {
    if (!selectedArea || !mapInstanceRef.current) return
    const coords = NEIGHBORHOOD_COORDS[selectedArea]
    if (coords) mapInstanceRef.current.flyTo(coords, 15, { duration: 1 })
  }, [selectedArea])

  if (Platform.OS !== 'web') return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Kartta vaatii web-ympäristön</Text></View>
  return <div ref={mapRef as any} style={{ width: '100%', height: '100%' }} />
}

// ── Main Screen ──
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

  const [showPosts, setShowPosts] = useState(true)
  const [showEvents, setShowEvents] = useState(true)
  const [showPlaces, setShowPlaces] = useState(true) // ON by default like web
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
        supabase.from('events').select('*, creator:profiles!events_creator_id_fkey(id, name, avatar_url)').eq('is_active', true).gte('event_date', new Date().toISOString()).limit(100),
        supabase.from('city_events').select('*').gte('start_time', new Date().toISOString()).limit(100),
        supabase.from('local_places').select('*').limit(500),
      ])
      setPosts((postsRes.data ?? []) as unknown as Post[])
      setEvents((eventsRes.data ?? []) as unknown as Event[])
      setCityEvents((cityRes.data ?? []) as unknown as CityEvent[])
      setPlaces((placesRes.data ?? []) as unknown as LocalPlace[])
      setLoading(false)
    }
    fetchData()
  }, [supabase])

  const filteredPosts = useMemo(() => {
    let p = showPosts ? posts : []
    if (postFilter) p = p.filter(x => x.type === postFilter)
    if (searchQuery) { const q = searchQuery.toLowerCase(); p = p.filter(x => x.title.toLowerCase().includes(q) || x.location?.toLowerCase().includes(q)) }
    return p
  }, [posts, showPosts, postFilter, searchQuery])

  const filteredEvents = useMemo(() => {
    if (!showEvents) return []
    if (searchQuery) { const q = searchQuery.toLowerCase(); return events.filter(e => e.title.toLowerCase().includes(q)) }
    return events
  }, [events, showEvents, searchQuery])

  const visibleCityEvents = showEvents ? cityEvents : []
  const visiblePlaces = showPlaces ? places : []
  const totalVisible = filteredPosts.length + filteredEvents.length + visibleCityEvents.length + visiblePlaces.length

  return (
    <View style={[ms.container, { backgroundColor: colors.background }]}>
      {/* Map */}
      <View style={ms.mapWrap}>
        {loading ? (
          <View style={ms.loadingWrap}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <LeafletMap
            posts={filteredPosts} events={filteredEvents}
            cityEvents={visibleCityEvents} places={visiblePlaces}
            selectedArea={selectedArea} isDark={isDark} t={t}
          />
        )}
      </View>

      {/* ── Top bar: Back + Area + Search ── */}
      <View style={[ms.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} style={[ms.topBtn, { backgroundColor: colors.card }]}>
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>
        <Pressable onPress={() => { setShowAreaPicker(!showAreaPicker); setShowSearch(false) }} style={[ms.areaBtn, { backgroundColor: colors.card }]}>
          <Navigation size={14} color={colors.primary} />
          <Text style={[ms.areaBtnText, { color: colors.foreground }]} numberOfLines={1}>
            {selectedArea ?? t('map.allHelsinki')}
          </Text>
          <ChevronDown size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable onPress={() => { setShowSearch(!showSearch); setShowAreaPicker(false) }} style={[ms.topBtn, { backgroundColor: colors.card }]}>
          <Search size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {/* ── Layer toggle pills (below top bar, like web) ── */}
      <View style={[ms.layerBar, { top: insets.top + 52 }]}>
        <Pressable onPress={() => setShowPosts(!showPosts)} style={[ms.layerPill, { backgroundColor: showPosts ? colors.primary : colors.card }]}>
          <Newspaper size={14} color={showPosts ? '#FFFFFF' : colors.mutedForeground} />
          <Text style={[ms.layerPillText, { color: showPosts ? '#FFFFFF' : colors.mutedForeground }]}>{t('map.layerPosts')}</Text>
          <View style={[ms.layerBadge, { backgroundColor: showPosts ? 'rgba(255,255,255,0.3)' : colors.muted }]}>
            <Text style={[ms.layerBadgeText, { color: showPosts ? '#FFFFFF' : colors.mutedForeground }]}>{filteredPosts.length}</Text>
          </View>
        </Pressable>
        <Pressable onPress={() => setShowEvents(!showEvents)} style={[ms.layerPill, { backgroundColor: showEvents ? '#2B8A62' : colors.card }]}>
          <CalendarDays size={14} color={showEvents ? '#FFFFFF' : colors.mutedForeground} />
          <Text style={[ms.layerPillText, { color: showEvents ? '#FFFFFF' : colors.mutedForeground }]}>{t('map.layerEvents')}</Text>
          <View style={[ms.layerBadge, { backgroundColor: showEvents ? 'rgba(255,255,255,0.3)' : colors.muted }]}>
            <Text style={[ms.layerBadgeText, { color: showEvents ? '#FFFFFF' : colors.mutedForeground }]}>{filteredEvents.length + visibleCityEvents.length}</Text>
          </View>
        </Pressable>
        <Pressable onPress={() => setShowPlaces(!showPlaces)} style={[ms.layerPill, { backgroundColor: showPlaces ? '#78716C' : colors.card }]}>
          <Coffee size={14} color={showPlaces ? '#FFFFFF' : colors.mutedForeground} />
          <Text style={[ms.layerPillText, { color: showPlaces ? '#FFFFFF' : colors.mutedForeground }]}>{t('map.layerPlaces')}</Text>
          <View style={[ms.layerBadge, { backgroundColor: showPlaces ? 'rgba(255,255,255,0.3)' : colors.muted }]}>
            <Text style={[ms.layerBadgeText, { color: showPlaces ? '#FFFFFF' : colors.mutedForeground }]}>{visiblePlaces.length}</Text>
          </View>
        </Pressable>
      </View>

      {/* ── Area picker dropdown ── */}
      {showAreaPicker && (
        <View style={[ms.dropdown, { top: insets.top + 52, backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
            <Pressable onPress={() => { setSelectedArea(null); setShowAreaPicker(false) }} style={ms.dropdownItem}>
              <Text style={[ms.dropdownText, { color: colors.foreground, fontWeight: !selectedArea ? '700' : '400' }]}>Helsinki ({t('common.all')})</Text>
            </Pressable>
            {NEIGHBORHOODS.map((nh) => (
              <Pressable key={nh} onPress={() => { setSelectedArea(nh); setShowAreaPicker(false) }} style={ms.dropdownItem}>
                <Text style={[ms.dropdownText, { color: colors.foreground, fontWeight: selectedArea === nh ? '700' : '400' }]}>{nh}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Search overlay ── */}
      {showSearch && (
        <View style={[ms.searchBar, { top: insets.top + 52, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Search size={16} color={colors.mutedForeground} />
          <TextInput
            style={[ms.searchInput, { color: colors.foreground }]}
            value={searchQuery} onChangeText={setSearchQuery}
            placeholder={t('feed.searchPlaceholder')} placeholderTextColor={colors.mutedForeground}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><X size={16} color={colors.mutedForeground} /></Pressable>
          )}
        </View>
      )}

      {/* ── GPS button ── */}
      <Pressable
        onPress={() => {
          if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
              // Fly to user position
            })
          }
        }}
        style={[ms.gpsBtn, { bottom: insets.bottom + 80, backgroundColor: colors.card }]}
      >
        <Crosshair size={20} color={colors.foreground} />
      </Pressable>

      {/* ── Bottom count bar ── */}
      <View style={[ms.countBar, { bottom: insets.bottom + 24, backgroundColor: colors.card, borderColor: colors.border }]}>
        <MapPin size={14} color={colors.mutedForeground} />
        <Text style={[ms.countText, { color: colors.foreground }]}>
          {totalVisible} {t('map.visible')}
        </Text>
        <Pressable onPress={() => setFiltersExpanded(!filtersExpanded)}>
          <ChevronDown size={14} color={colors.mutedForeground} style={filtersExpanded ? { transform: [{ rotate: '180deg' }] } : undefined} />
        </Pressable>
      </View>

      {/* ── Expanded sub-filters ── */}
      {filtersExpanded && (
        <View style={[ms.subPanel, { bottom: insets.bottom + 64, backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ms.subRow}>
            <Pressable onPress={() => setPostFilter(null)} style={[ms.subChip, !postFilter ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted }]}>
              <Text style={[ms.subChipText, { color: !postFilter ? '#FFFFFF' : colors.mutedForeground }]}>{t('common.all')}</Text>
            </Pressable>
            {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).map(([type, cat]) => (
              <Pressable key={type} onPress={() => setPostFilter(postFilter === type ? null : type)} style={[ms.subChip, postFilter === type ? { backgroundColor: cat.color } : { backgroundColor: colors.muted }]}>
                <Text style={[ms.subChipText, { color: postFilter === type ? '#FFFFFF' : colors.mutedForeground }]}>{t(cat.label)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

const ms = StyleSheet.create({
  container: { flex: 1 },
  mapWrap: { ...StyleSheet.absoluteFillObject },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8,
  },
  topBtn: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3,
  },
  areaBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, borderRadius: 12, paddingHorizontal: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3,
  },
  areaBtnText: { fontSize: 14, fontWeight: '600', flex: 1 },
  layerBar: {
    position: 'absolute', left: 12, right: 12, zIndex: 10,
    flexDirection: 'row', gap: 6,
  },
  layerPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    height: 36, borderRadius: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3,
  },
  layerPillText: { fontSize: 11, fontWeight: '600' },
  layerBadge: { minWidth: 20, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  layerBadgeText: { fontSize: 10, fontWeight: '700' },
  dropdown: {
    position: 'absolute', left: 12, right: 12, zIndex: 20, borderRadius: 12, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 12 },
  dropdownText: { fontSize: 14 },
  searchBar: {
    position: 'absolute', left: 12, right: 12, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, height: 44,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  searchInput: { flex: 1, fontSize: 14 },
  gpsBtn: {
    position: 'absolute', right: 12, zIndex: 10,
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3,
  },
  countBar: {
    position: 'absolute', left: 60, right: 60, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 36, borderRadius: 18, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  countText: { fontSize: 13, fontWeight: '500' },
  subPanel: {
    position: 'absolute', left: 12, right: 12, zIndex: 10,
    borderRadius: 12, borderWidth: 1, padding: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  subRow: { flexDirection: 'row', gap: 6 },
  subChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  subChipText: { fontSize: 11, fontWeight: '500' },
})
