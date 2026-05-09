import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react'
import {
  View, Text, ScrollView, RefreshControl, StyleSheet,
  Pressable, Linking, ActionSheetIOS, Alert, Platform, FlatList, ListRenderItemInfo,
} from 'react-native'
import { Image } from 'expo-image'
import { hapticMedium } from '@/lib/haptics'
import { SectionSkeleton, FadeIn } from '@/components/SkeletonLoaders'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import {
  Map, CalendarDays, MapPin, ChevronRight, Globe,
  Store, Coffee, BookOpen, Dumbbell, Heart, UtensilsCrossed,
  Users, Plus, Search, SlidersHorizontal,
} from 'lucide-react-native'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { getNetworkAwareErrorSync } from '@/lib/errorUtils'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { fetchHelsinkiEvents } from '@/lib/linkedevents'
import { fetchTicketmasterEvents } from '@/lib/ticketmaster'
import { fetchKideEvents } from '@/lib/kide'
import { fetchMetelihEvents } from '@/lib/meteli'
import { fetchHelsinkiPlaces } from '@/lib/palvelukartta'
import { formatEventDateShort } from '@/lib/format'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import type { CityEvent, LocalPlace } from '@/lib/types'
import { getCityEventName } from '@/lib/eventHelpers'
import { haversineKm, isInCityBounds } from '@/lib/geo'

// Helsinki default bounds — module-level constant
const HKI_BOUNDS = { south: 60.14, north: 60.27, west: 24.83, east: 25.20 } as const
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { OutOfAreaBanner } from '@/components/OutOfAreaBanner'
import { SectionEyebrow } from '@/components/SectionEyebrow'
import { rankEvents } from '@/lib/eventAlgorithm'
import { trackEventClick, getClickHistory } from '@/lib/eventInteractions'
import { useEventInterests } from '@/hooks/useEventInterests'

// ── Types ──

interface EventPreview {
  id: string
  title: string
  event_date: string
  location_name: string | null
}

interface CommunityEventPreview {
  id: string
  title: string
  image_url: string | null
  event_date: string
  location_name: string | null
  category: string
  participant_count?: number
  max_participants: number | null
}

type SubTab = 'map' | 'events' | 'places'

// ── Place category label keys ──
const PLACE_LABEL_KEYS: Record<string, string> = {
  restaurant: 'places.restaurant', cafe: 'places.cafe', bar: 'places.bar', shop: 'places.shop',
  library: 'places.library', health: 'places.health', sport: 'places.sport', culture: 'places.culture',
  hotel: 'places.hotel', service: 'places.service', fast_food: 'places.fastFood', pub: 'places.pub', other: 'places.other',
}

// ── Place category icon ──
function PlaceCategoryIcon({ category, size, color }: { category: string; size: number; color: string }) {
  switch (category) {
    case 'restaurant': case 'fast_food': return <UtensilsCrossed size={size} color={color} strokeWidth={1.6} />
    case 'cafe': return <Coffee size={size} color={color} strokeWidth={1.6} />
    case 'library': return <BookOpen size={size} color={color} strokeWidth={1.6} />
    case 'sport': return <Dumbbell size={size} color={color} strokeWidth={1.6} />
    case 'health': return <Heart size={size} color={color} strokeWidth={1.6} />
    case 'culture': return <Globe size={size} color={color} strokeWidth={1.6} />
    default: return <Store size={size} color={color} strokeWidth={1.6} />
  }
}


function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

// ── Memoized event list row ──

type ExploreEvent = {
  id: string; title: string; date: string; location?: string | null;
  isFree?: boolean; infoUrl?: string | null; isCity?: boolean; category: string;
  source?: string; imageUrl?: string | null; latitude?: number; longitude?: number
}

interface EventListRowProps {
  event: ExploreEvent
  isLast: boolean
  colors: ReturnType<typeof import('@/hooks/useTheme').useTheme>['colors']
  isDark: boolean
  locale: string
  t: (k: string, p?: Record<string, string | number>) => string
  onPress: (event: ExploreEvent) => void
}

const EventListRow = memo(function EventListRow({
  event, isLast, colors, isDark, locale, t, onPress,
}: EventListRowProps) {
  return (
    <PressableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${formatEventDateShort(event.date, locale)}${event.location ? `, ${event.location}` : ''}${event.isFree ? `, ${t('events.free')}` : ''}`}

      style={[
        s.listRow,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
      onPress={() => onPress(event)}
    >
      <View style={[s.eventIconBox, { backgroundColor: isDark ? colors.muted : `${colors.border}44` }]}>
        <CalendarDays size={16} color={colors.mutedForeground} strokeWidth={1.6} />
      </View>
      <View style={s.cardContent}>
        <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={[s.cardDateText, { color: colors.mutedForeground }]}>
          {formatEventDateShort(event.date, locale)}
          {event.location ? ` \u00B7 ${event.location}` : ''}
        </Text>
        {event.isFree && (
          <View style={[s.freeBadge, { backgroundColor: isDark ? colors.muted : `${colors.border}44` }]}>
            <Text style={[s.freeBadgeText, { color: colors.mutedForeground }]}>
              {t('events.free')}
            </Text>
          </View>
        )}
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.6} />
    </PressableOpacity>
  )
})

// ── Memoized place list row ──

interface PlaceListRowProps {
  place: LocalPlace & { _distance?: number }
  isLast: boolean
  colors: ReturnType<typeof import('@/hooks/useTheme').useTheme>['colors']
  isDark: boolean
  t: (k: string, p?: Record<string, string | number>) => string
  onPress: (place: LocalPlace) => void
}

const PlaceListRow = memo(function PlaceListRow({
  place, isLast, colors, isDark, t, onPress,
}: PlaceListRowProps) {
  const catLabel = t(PLACE_LABEL_KEYS[place.category] || 'common.other')
  const dist = place._distance != null ? formatDistance(place._distance) : null

  return (
    <PressableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${catLabel}${dist ? `, ${dist}` : ''}`}
      style={[
        s.listRow,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
      onPress={() => onPress(place)}
    >
      <View style={[s.placeIconBox, { backgroundColor: isDark ? colors.muted : `${colors.border}44` }]}>
        <PlaceCategoryIcon category={place.category} size={16} color={colors.mutedForeground} />
      </View>
      <View style={s.cardContent}>
        <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
          {place.name}
        </Text>
        <Text style={[s.cardMeta, { color: colors.mutedForeground }]}>
          {catLabel}{dist ? ` \u00B7 ${dist}` : ''}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.6} />
    </PressableOpacity>
  )
})

// ══════════════════════════════════════════════
// ── Explore Screen ──
// ══════════════════════════════════════════════

function ExploreScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [activeTab, setActiveTab] = useState<SubTab>('map')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const { isConnected } = useNetworkStatus()

  // Event personalization
  const { interests: eventInterests } = useEventInterests()
  const [clickHistory, setClickHistory] = useState<{ category: string; timestamp: number }[]>([])
  useEffect(() => { let m = true; getClickHistory().then(h => { if (m) setClickHistory(h.map(x => ({ category: x.category, timestamp: x.timestamp }))) }).catch((e) => { if (__DEV__) console.warn('[explore] click history fetch failed:', e) }); return () => { m = false } }, [])

  // Sort/filter state for Events sub-tab
  const [eventSort, setEventSort] = useState<'recommended' | 'today' | 'week' | 'all'>('recommended')
  const [eventCategories, setEventCategories] = useState<string[]>([])

  // Sort/filter state for Places sub-tab
  const [placeSort, setPlaceSort] = useState<'nearest' | 'alpha'>('nearest')
  const [placeCategories, setPlaceCategories] = useState<string[]>([])

  // Data state
  const [communityEvents, setCommunityEvents] = useState<EventPreview[]>([])
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([])
  const [places, setPlaces] = useState<LocalPlace[]>([])
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null)
  // True when Ticketmaster + Kide + Meteli all returned zero events while
  // Helsinki LinkedEvents returned some — almost always means the third-party
  // proxy Edge Functions are unauthorised (401) or otherwise misconfigured.
  // Used to surface a small banner so users do not assume "no events nearby".
  const [externalSourcesLimited, setExternalSourcesLimited] = useState(false)

  // Community preview state
  const [communityEventPreviews, setCommunityEventPreviews] = useState<CommunityEventPreview[]>([])

  // ── Fetch location ──
  const fetchLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return null
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
      setUserLocation(coords)
      userLocationRef.current = coords
      return coords
    } catch {
      return null
    }
  }, [])

  // ── Fetch all data ──
  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const location = userLocationRef.current ?? await fetchLocation()

      const now = new Date().toISOString()

      const communityEventsPromise = (async () => {
        try {
          const { data, error } = await (supabase
            .from('community_events')
            .select('id, title, event_date, location_name') as any)
            .eq('is_active', true)
            .gte('event_date', now)
            .order('event_date', { ascending: true })
            .limit(10)
          if (error) return [] as EventPreview[]
          return (data ?? []) as EventPreview[]
        } catch {
          return [] as EventPreview[]
        }
      })()

      const [helsinkiEvents, tmEvents, kideEvents, meteliEvents, communityRes, placesResult] = await Promise.all([
        fetchHelsinkiEvents().catch(() => [] as CityEvent[]),
        fetchTicketmasterEvents().catch(() => [] as CityEvent[]),
        fetchKideEvents().catch(() => [] as CityEvent[]),
        fetchMetelihEvents().catch(() => [] as CityEvent[]),
        communityEventsPromise,
        location
          ? fetchHelsinkiPlaces(location.latitude, location.longitude, 2000).catch(() => [] as LocalPlace[])
          : Promise.resolve([] as LocalPlace[]),
      ])

      // Merge + deduplicate: LinkedEvents is base, then add unique TM + Kide + Meteli
      const futureCityEvents = helsinkiEvents.filter(e => e.start_time >= now)
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-zäöå0-9]/g, '').slice(0, 30)
      const seenNames = new Set(futureCityEvents.map(e => normalize(e.name_fi)))
      for (const ev of [...tmEvents, ...kideEvents, ...meteliEvents]) {
        const n = normalize(ev.name_fi)
        if (!seenNames.has(n)) {
          seenNames.add(n)
          futureCityEvents.push(ev)
        }
      }
      if (__DEV__) console.log(`[explore] Events: ${helsinkiEvents.length} LE + ${tmEvents.length} TM + ${kideEvents.length} Kide + ${meteliEvents.length} Meteli = ${futureCityEvents.length} merged`)
      // If LinkedEvents returned content but every paid third-party proxy
      // returned zero, treat the proxies as down. False positives are possible
      // when those sources genuinely have no upcoming events, but in practice
      // the three together always have some Helsinki content.
      const externalCount = tmEvents.length + kideEvents.length + meteliEvents.length
      setExternalSourcesLimited(externalCount === 0 && helsinkiEvents.length > 0)
      setCityEvents(futureCityEvents)
      setCommunityEvents(communityRes)
      setPlaces(placesResult)

      // Fetch community event previews
      const communityEvtsRes = await (supabase.from('community_events').select('id, title, image_url, event_date, location_name, category, participant_count, max_participants') as any)
        .eq('is_active', true)
        .gte('event_date', now)
        .order('event_date', { ascending: true }).limit(4)
        .then((r: any) => r).catch(() => ({ data: null, error: true }))
      if (!communityEvtsRes.error && communityEvtsRes.data) setCommunityEventPreviews(communityEvtsRes.data)
    } catch (err) {
      if (__DEV__) console.log('[explore] fetch error:', err)
      setFetchError(getNetworkAwareErrorSync(err, t, isConnected))
    } finally {
      setLoading(false)
    }
  }, [supabase, fetchLocation])

  // ── Load on focus (refresh when navigating back) ──
  useFocusEffect(useCallback(() => {
    fetchData()
  }, [fetchData]))

  // ── Pull to refresh ──
  const handleRefresh = useCallback(async () => {
    hapticMedium()
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }, [fetchData])

  // ── Computed counts ──
  const eventsThisWeek = useMemo(() => {
    const now = new Date()
    const weekEnd = new Date(now.getTime() + 7 * 86400000)
    const all = [
      ...communityEvents.map(e => e.event_date),
      ...cityEvents.map(e => e.start_time),
    ]
    return all.filter(d => {
      const date = new Date(d)
      return date >= now && date <= weekEnd
    }).length
  }, [communityEvents, cityEvents])

  const placesCount = places.length

  // ── Out-of-area detection ──
  const isOutOfArea = useMemo(() => {
    if (!userLocation) return false
    return !isInCityBounds(userLocation.latitude, userLocation.longitude, HKI_BOUNDS)
  }, [userLocation])

  // ── Sorted & filtered places with distance ──
  const sortedPlaces = useMemo(() => {
    let result = [...places]

    // Apply category filter
    if (placeCategories.length > 0) {
      result = result.filter(p => placeCategories.includes(p.category))
    }

    if (placeSort === 'alpha') {
      return result
        .map(p => ({
          ...p,
          _distance: userLocation
            ? haversineKm(userLocation.latitude, userLocation.longitude, p.latitude, p.longitude)
            : 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fi'))
        .slice(0, 20)
    }

    // Default: nearest
    if (!userLocation) return result.slice(0, 20)
    return result
      .map(p => ({
        ...p,
        _distance: haversineKm(userLocation.latitude, userLocation.longitude, p.latitude, p.longitude),
      }))
      .sort((a, b) => a._distance - b._distance)
      .slice(0, 20)
  }, [places, userLocation, placeSort, placeCategories])

  // ── All events combined, deduplicated, sorted & filtered ──
  const allEvents = useMemo(() => {
    const combined: Array<{ id: string; title: string; date: string; location: string | null; isFree: boolean; infoUrl: string | null; isCity: boolean; category: string; source?: string; imageUrl?: string | null; latitude?: number; longitude?: number }> = []
    const seenTitles = new Set<string>()

    for (const e of communityEvents) {
      const key = e.title.toLowerCase().trim()
      if (seenTitles.has(key)) continue
      seenTitles.add(key)
      combined.push({
        id: e.id,
        title: e.title,
        date: e.event_date,
        location: e.location_name,
        isFree: false,
        infoUrl: null,
        isCity: false,
        category: '',
        source: 'community',
      })
    }

    for (const e of cityEvents) {
      const title = getCityEventName(e, locale)
      const key = title.toLowerCase().trim()
      if (seenTitles.has(key)) continue
      seenTitles.add(key)
      combined.push({
        id: e.id,
        title,
        date: e.start_time,
        location: e.location_name,
        isFree: e.is_free,
        infoUrl: e.info_url,
        isCity: true,
        category: e.category ?? '',
        source: e.source,
        imageUrl: e.image_url,
        latitude: e.latitude ?? undefined,
        longitude: e.longitude ?? undefined,
      })
    }

    // Apply time filter
    const now = new Date()
    let filtered = combined
    if (eventSort === 'today') {
      const todayStr = now.toISOString().slice(0, 10)
      filtered = filtered.filter(e => e.date.slice(0, 10) === todayStr)
    } else if (eventSort === 'week') {
      const weekEnd = new Date(now.getTime() + 7 * 86400000)
      filtered = filtered.filter(e => {
        const d = new Date(e.date)
        return d >= now && d <= weekEnd
      })
    }

    // Apply category filter
    if (eventCategories.length > 0) {
      filtered = filtered.filter(e => {
        const cat = e.category.toLowerCase()
        return eventCategories.some(c => cat.includes(c))
      })
    }

    // Sort: recommended uses personalization algorithm, others use chronological
    if (eventSort === 'recommended') {
      const ranked = rankEvents(filtered, eventInterests, clickHistory, userLocation)
      return ranked
    }
    return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [communityEvents, cityEvents, locale, eventSort, eventCategories, eventInterests, clickHistory, userLocation])

  // ── Tab chips config with counts ──
  const tabCounts = useMemo(() => ({
    map: 0,
    events: allEvents.length,
    places: sortedPlaces.length,
  }), [allEvents.length, sortedPlaces.length])

  const tabs: { key: SubTab; labelKey: string; Icon: typeof Map }[] = [
    { key: 'map', labelKey: 'nav.map', Icon: Map },
    { key: 'events', labelKey: 'nav.events', Icon: CalendarDays },
    { key: 'places', labelKey: 'places.places', Icon: MapPin },
  ]

  // ── Event sort options ──
  const eventSortOptions: { key: typeof eventSort; labelKey: string }[] = [
    { key: 'recommended', labelKey: 'explore.sortRecommended' },
    { key: 'today', labelKey: 'explore.sortToday' },
    { key: 'week', labelKey: 'explore.sortWeek' },
    { key: 'all', labelKey: 'explore.sortAll' },
  ]

  // ── Event category options ──
  const eventCategoryOptions: { key: string; labelKey: string }[] = [
    { key: '', labelKey: 'explore.catAll' },
    { key: 'music', labelKey: 'explore.catMusic' },
    { key: 'sport', labelKey: 'explore.catSport' },
    { key: 'culture', labelKey: 'explore.catCulture' },
    { key: 'food', labelKey: 'explore.catFood' },
    { key: 'family', labelKey: 'explore.catFamily' },
    { key: 'nature', labelKey: 'explore.catNature' },
    { key: 'festival', labelKey: 'explore.catFestival' },
    { key: 'other', labelKey: 'explore.catOther' },
  ]

  // ── Place sort options ──
  const placeSortOptions: { key: typeof placeSort; labelKey: string }[] = [
    { key: 'nearest', labelKey: 'explore.sortNearest' },
    { key: 'alpha', labelKey: 'explore.sortAlpha' },
  ]

  // ── Place category options ──
  const placeCategoryOptions: { key: string; labelKey: string }[] = [
    { key: '', labelKey: 'explore.catAll' },
    { key: 'restaurant', labelKey: 'explore.catRestaurants' },
    { key: 'cafe', labelKey: 'explore.catCafes' },
    { key: 'bar', labelKey: 'explore.catBars' },
    { key: 'culture', labelKey: 'explore.catCulture' },
    { key: 'library', labelKey: 'explore.catLibraries' },
    { key: 'sport', labelKey: 'explore.catSports' },
    { key: 'health', labelKey: 'explore.catHealth' },
    { key: 'shop', labelKey: 'explore.catShops' },
  ]

  // ── Toggle event category ──
  const toggleEventCategory = useCallback((cat: string) => {
    if (cat === '') {
      setEventCategories([])
      return
    }
    setEventCategories(prev => {
      if (prev.includes(cat)) {
        return prev.filter(c => c !== cat)
      }
      return [...prev, cat]
    })
  }, [])

  // ── Toggle place category ──
  const togglePlaceCategory = useCallback((cat: string) => {
    if (cat === '') {
      setPlaceCategories([])
      return
    }
    setPlaceCategories(prev => {
      if (prev.includes(cat)) {
        return prev.filter(c => c !== cat)
      }
      return [...prev, cat]
    })
  }, [])

  // ── Open Google Maps for a place ──
  const openPlaceInMaps = useCallback((place: LocalPlace) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
    Linking.openURL(url).catch((e) => { if (__DEV__) console.warn('[explore] open maps URL failed:', e) })
  }, [])

  // ── Safe URL opener — validates protocol to prevent javascript: / file: schemes
  // from external data (e.g. Helsinki linkedevents API) ──
  const openExternalUrl = useCallback((url: string | null | undefined) => {
    if (!url) return
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
      Linking.openURL(url).catch((e) => { if (__DEV__) console.warn('[explore] open external URL failed:', e) })
    } catch (e) {
      if (__DEV__) console.warn('[explore] invalid external URL:', e)
    }
  }, [])

  // ── Handle event row press ──
  const handleEventPress = useCallback((event: ExploreEvent) => {
    trackEventClick(event.id, event.category).then(() =>
      getClickHistory().then(h => setClickHistory(h.map(x => ({ category: x.category, timestamp: x.timestamp }))))
    )
    if (event.infoUrl) {
      openExternalUrl(event.infoUrl)
    } else {
      router.push('/community-events' as any)
    }
  }, [openExternalUrl, router])

  // ── Filter action sheet (sort picker for active tab) ──
  const handleFilterAction = useCallback(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    if (activeTab === 'events') {
      const labels = eventSortOptions.map(o => t(o.labelKey) ?? o.key)
      labels.push(t('common.cancel') ?? 'Cancel')
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: labels, cancelButtonIndex: labels.length - 1, title: t('feed.sort') ?? 'Sort' },
          (idx) => { if (idx < eventSortOptions.length) setEventSort(eventSortOptions[idx].key) },
        )
      } else {
        Alert.alert(t('feed.sort') ?? 'Sort', '', eventSortOptions.map(o => ({
          text: (t(o.labelKey) ?? o.key) + (eventSort === o.key ? ' \u2713' : ''),
          onPress: () => setEventSort(o.key),
        })).concat({ text: t('common.cancel') ?? 'Cancel', onPress: () => {} }))
      }
    } else if (activeTab === 'places') {
      const labels = placeSortOptions.map(o => t(o.labelKey) ?? o.key)
      labels.push(t('common.cancel') ?? 'Cancel')
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: labels, cancelButtonIndex: labels.length - 1, title: t('feed.sort') ?? 'Sort' },
          (idx) => { if (idx < placeSortOptions.length) setPlaceSort(placeSortOptions[idx].key) },
        )
      } else {
        Alert.alert(t('feed.sort') ?? 'Sort', '', placeSortOptions.map(o => ({
          text: (t(o.labelKey) ?? o.key) + (placeSort === o.key ? ' \u2713' : ''),
          onPress: () => setPlaceSort(o.key),
        })).concat({ text: t('common.cancel') ?? 'Cancel', onPress: () => {} }))
      }
    }
  }, [activeTab, eventSort, placeSort, eventSortOptions, placeSortOptions, t])

  // ── FlatList renderItem callbacks ──
  const renderEventItem = useCallback(({ item, index }: ListRenderItemInfo<ExploreEvent>) => (
    <EventListRow
      event={item}
      isLast={index === allEvents.length - 1}
      colors={colors}
      isDark={isDark}
      locale={locale}
      t={t}
      onPress={handleEventPress}
    />
  ), [allEvents.length, colors, isDark, locale, t, handleEventPress])

  const eventKeyExtractor = useCallback((item: ExploreEvent) => item.id, [])

  const renderPlaceItem = useCallback(({ item, index }: ListRenderItemInfo<LocalPlace & { _distance?: number }>) => (
    <PlaceListRow
      place={item}
      isLast={index === sortedPlaces.length - 1}
      colors={colors}
      isDark={isDark}
      t={t}
      onPress={openPlaceInMaps}
    />
  ), [sortedPlaces.length, colors, isDark, t, openPlaceInMaps])

  const placeKeyExtractor = useCallback((item: LocalPlace & { _distance?: number }) => item.id, [])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* ── Sticky header — Helsinki Monochrome (matches feed 05) ── */}
      <View style={[s.headerWrapper, { backgroundColor: colors.background, borderBottomColor: colors.border, paddingTop: insets.top }]}>
        {/* Eyebrow + title + action circles */}
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            <SectionEyebrow
              label={t('explore.discoverLabel') ?? 'TUTUSTU ALUEESEEN'}
              dotColor={colors.success}
              style={{ marginBottom: 4 }}
            />
            <Text style={[s.screenTitle, { color: colors.foreground }]} accessibilityRole="header">
              {t('explore.title') ?? 'Tutustu'}
            </Text>
          </View>
          <View style={s.headerActions}>
            <PressableOpacity
              onPress={() => router.push('/search')}
              style={[s.iconCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityLabel={t('common.search')}
              accessibilityRole="button"
            >
              <Search size={16} color={colors.mutedForeground} strokeWidth={2} />
            </PressableOpacity>
            <PressableOpacity
              onPress={handleFilterAction}
              style={[s.iconCircleDark, { backgroundColor: colors.foreground }]}
              accessibilityLabel={t('feed.sort') ?? 'Sort'}
              accessibilityRole="button"
            >
              <SlidersHorizontal size={16} color={colors.background} strokeWidth={2} />
            </PressableOpacity>
          </View>
        </View>

        {/* Tab chips row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.tabScrollRow}
          contentContainerStyle={{ gap: 8, alignItems: 'center', paddingHorizontal: 16 }}
        >
          {tabs.map(({ key, labelKey, Icon }) => {
            const isActive = activeTab === key
            return (
              <PressableOpacity
                key={key}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
                  setActiveTab(key)
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`${t(labelKey)}${tabCounts[key] > 0 ? `, ${tabCounts[key]}` : ''}`}
                style={[
                  s.tabChip,
                  isActive
                    ? { backgroundColor: colors.foreground }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
              >
                <Icon size={14} color={isActive ? colors.background : colors.mutedForeground} strokeWidth={isActive ? 2.2 : 1.6} />
                <Text style={[s.tabChipText, { color: isActive ? colors.background : colors.mutedForeground }]}>
                  {t(labelKey)}
                </Text>
                {tabCounts[key] > 0 && (
                  <View style={[s.tabChipCount, { backgroundColor: isActive ? 'rgba(255,255,255,0.18)' : `${colors.foreground}0F` }]}>
                    <Text style={[s.tabChipCountText, { color: isActive ? colors.background : colors.foreground }]}>
                      {tabCounts[key]}
                    </Text>
                  </View>
                )}
              </PressableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {/* ── Out of Area Banner ── */}
      <OutOfAreaBanner visible={isOutOfArea} cityName="Helsinki" />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.foreground} />
        }
      >
        {/* ── Map sub-tab ── */}
        {activeTab === 'map' && (
          <>
            {/* Summary stats */}
            {!loading && (
              <View style={s.summaryRow}>
                {cityEvents.length > 0 && (
                  <PressableOpacity
                    style={[s.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => setActiveTab('events')}
                    accessibilityRole="button"
                    accessibilityLabel={t('explore.eventsThisWeek', { count: eventsThisWeek })}
                  >
                    <CalendarDays size={18} color={colors.foreground} strokeWidth={1.8} />
                    <Text style={[s.summaryText, { color: colors.foreground }]}>
                      {t('explore.eventsThisWeek', { count: eventsThisWeek })}
                    </Text>
                    <ChevronRight size={14} color={colors.mutedForeground} strokeWidth={1.6} />
                  </PressableOpacity>
                )}

                {places.length > 0 && (
                  <PressableOpacity
                    style={[s.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => setActiveTab('places')}
                    accessibilityRole="button"
                    accessibilityLabel={t('explore.placesNearby', { count: placesCount })}
                  >
                    <MapPin size={18} color={colors.foreground} strokeWidth={1.8} />
                    <Text style={[s.summaryText, { color: colors.foreground }]}>
                      {t('explore.placesNearby', { count: placesCount })}
                    </Text>
                    <ChevronRight size={14} color={colors.mutedForeground} strokeWidth={1.6} />
                  </PressableOpacity>
                )}
              </View>
            )}

            {/* Community Events carousel */}
            <View style={s.sectionWrap}>
              <View style={s.sectionHeaderRow}>
                <SectionEyebrow
                  label={t('events.communityEventsTitle') ?? 'YHTEISÖTAPAHTUMAT'}
                  dotColor={colors.success}
                />
                <PressableOpacity
                  onPress={() => router.push('/community-events' as any)}
                  accessibilityRole="link"
                  accessibilityLabel={`${t('events.communityEventsTitle')} — ${t('events.showAllEvents')}`}
                  style={s.seeAllLink}
                  hitSlop={8}
                >
                  <Text style={[s.seeAllText, { color: colors.mutedForeground }]}>{t('events.showAllEvents') ?? 'Show all'}</Text>
                </PressableOpacity>
              </View>

              {communityEventPreviews.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.ceCarouselContent}
                  style={s.ceCarousel}
                >
                  {communityEventPreviews.map(evt => {
                    const pCount = evt.participant_count ?? 0
                    const pLabel = evt.max_participants
                      ? `${pCount}/${evt.max_participants}`
                      : `${pCount}`

                    return (
                      <PressableOpacity
                        key={evt.id}
                        onPress={() => router.push(`/event/${evt.id}` as any)}
                        accessibilityRole="button"
                        accessibilityLabel={`${evt.title}, ${formatEventDateShort(evt.event_date, locale)}`}
                        style={[s.ceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                      >
                        {evt.image_url ? (
                          <View style={s.ceImageWrap}>
                            <Image source={{ uri: evt.image_url }} style={s.ceImage} contentFit="cover" cachePolicy="memory-disk" />
                          </View>
                        ) : (
                          <View style={[s.ceImagePlaceholder, { backgroundColor: isDark ? colors.muted : `${colors.border}44` }]}>
                            <CalendarDays size={24} color={colors.mutedForeground} strokeWidth={1.6} />
                          </View>
                        )}
                        <View style={s.ceCardBody}>
                          <Text style={[s.ceCardTitle, { color: colors.foreground }]} numberOfLines={2}>{evt.title}</Text>
                          <Text style={[s.ceCardDate, { color: colors.mutedForeground }]}>{formatEventDateShort(evt.event_date, locale)}</Text>
                          <View style={s.ceCardMeta}>
                            <Users size={12} color={colors.mutedForeground} strokeWidth={1.6} />
                            <Text style={[s.ceCardMetaText, { color: colors.mutedForeground }]}>{pLabel}</Text>
                          </View>
                        </View>
                      </PressableOpacity>
                    )
                  })}
                </ScrollView>
              ) : (
                <PressableOpacity
                  onPress={() => router.push('/create-event' as any)}
                  accessibilityRole="button"
                  accessibilityLabel={t('events.createFirstEvent')}
                  style={[s.communityCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Plus size={20} color={colors.mutedForeground} strokeWidth={1.6} />
                  <View style={s.cardFlex}>
                    <Text style={[s.communityCardTitle, { color: colors.foreground }]}>{t('events.communityEventsTitle')}</Text>
                    <Text style={[s.communityCardHint, { color: colors.mutedForeground }]}>{t('events.createFirstEvent')}</Text>
                  </View>
                  <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.6} />
                </PressableOpacity>
              )}
            </View>


            {loading && <SectionSkeleton count={2} />}

            {/* Error state */}
            {fetchError && !loading && cityEvents.length === 0 && places.length === 0 && (
              <PressableOpacity
                onPress={handleRefresh}
                accessibilityRole="button"
                accessibilityLabel={fetchError}
                style={[s.errorRow, { backgroundColor: `${colors.destructive}10` }]}
              >
                <Text style={[s.errorRowText, { color: colors.destructive }]}>
                  {fetchError}
                </Text>
              </PressableOpacity>
            )}
          </>
        )}

        {/* ── Events sub-tab ── */}
        {activeTab === 'events' && (
          <>
            {/* Banner shown when third-party event proxies are silently down.
                Distinct from the empty-state error row below — this fires when
                we have *some* events (Helsinki LinkedEvents) but the paid
                feeds returned nothing, so the user knows the catalog is not
                literally empty, just incomplete. */}
            {externalSourcesLimited && (
              <View style={[s.errorRow, { backgroundColor: `${colors.foreground}10`, marginHorizontal: 16, marginTop: 12 }]}>
                <Text style={[s.errorRowText, { color: colors.mutedForeground }]}>
                  {t('explore.externalSourcesLimited')}
                </Text>
              </View>
            )}
            {/* Combined sort + category row */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filterChipRow}
              style={s.filterScrollWrap}
            >
              {eventSortOptions.map(opt => {
                const active = eventSort === opt.key
                return (
                  <PressableOpacity
                    key={opt.key}
                    onPress={() => setEventSort(opt.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      s.filterChip,
                      active
                        ? { backgroundColor: colors.foreground }
                        : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[s.filterChipText, { color: active ? colors.background : colors.mutedForeground }]}>
                      {t(opt.labelKey)}
                    </Text>
                  </PressableOpacity>
                )
              })}
              <View style={[s.filterSeparator, { backgroundColor: colors.border }]} />
              {eventCategoryOptions.map(opt => {
                const isAll = opt.key === ''
                const active = isAll ? eventCategories.length === 0 : eventCategories.includes(opt.key)
                return (
                  <PressableOpacity
                    key={opt.key || '_all'}
                    onPress={() => toggleEventCategory(opt.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      s.filterChip,
                      active
                        ? { backgroundColor: colors.foreground }
                        : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[s.filterChipText, { color: active ? colors.background : colors.mutedForeground }]}>
                      {t(opt.labelKey)}
                    </Text>
                  </PressableOpacity>
                )
              })}
            </ScrollView>

            {loading ? (
              <SectionSkeleton count={5} />
            ) : allEvents.length === 0 ? (
              <View style={s.emptyState}>
                <CalendarDays size={40} color={colors.mutedForeground} strokeWidth={1.3} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('explore.noEvents')}</Text>
                <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>{t('explore.noEventsHint')}</Text>
                <PressableOpacity
                  onPress={handleRefresh}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.retry')}
                  style={[s.emptyCta, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={[s.emptyCtaText, { color: colors.foreground }]}>{t('common.retry')}</Text>
                </PressableOpacity>
              </View>
            ) : (
              <View style={[s.sectionCardContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <FlatList
                  data={allEvents}
                  keyExtractor={eventKeyExtractor}
                  renderItem={renderEventItem}
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  scrollEnabled={false}
                />
              </View>
            )}
          </>
        )}

        {/* ── Places sub-tab ── */}
        {activeTab === 'places' && (
          <>
            {/* Combined sort + category row */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filterChipRow}
              style={s.filterScrollWrap}
            >
              {placeSortOptions.map(opt => {
                const active = placeSort === opt.key
                return (
                  <PressableOpacity
                    key={opt.key}
                    onPress={() => setPlaceSort(opt.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      s.filterChip,
                      active
                        ? { backgroundColor: colors.foreground }
                        : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[s.filterChipText, { color: active ? colors.background : colors.mutedForeground }]}>
                      {t(opt.labelKey)}
                    </Text>
                  </PressableOpacity>
                )
              })}
              <View style={[s.filterSeparator, { backgroundColor: colors.border }]} />
              {placeCategoryOptions.map(opt => {
                const isAll = opt.key === ''
                const active = isAll ? placeCategories.length === 0 : placeCategories.includes(opt.key)
                return (
                  <PressableOpacity
                    key={opt.key || '_all'}
                    onPress={() => togglePlaceCategory(opt.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      s.filterChip,
                      active
                        ? { backgroundColor: colors.foreground }
                        : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[s.filterChipText, { color: active ? colors.background : colors.mutedForeground }]}>
                      {t(opt.labelKey)}
                    </Text>
                  </PressableOpacity>
                )
              })}
            </ScrollView>

            {loading ? (
              <SectionSkeleton count={5} />
            ) : sortedPlaces.length === 0 ? (
              <View style={s.emptyState}>
                <MapPin size={40} color={colors.mutedForeground} strokeWidth={1.3} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('explore.noPlaces')}</Text>
                <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>{t('explore.noPlacesHint')}</Text>
                <PressableOpacity
                  onPress={handleRefresh}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.retry')}
                  style={[s.emptyCta, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={[s.emptyCtaText, { color: colors.foreground }]}>{t('common.retry')}</Text>
                </PressableOpacity>
              </View>
            ) : (
              <View style={[s.sectionCardContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <FlatList
                  data={sortedPlaces}
                  keyExtractor={placeKeyExtractor}
                  renderItem={renderPlaceItem}
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={10}
                  windowSize={5}
                  scrollEnabled={false}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

// ── Styles — Helsinki Monochrome ──
const s = StyleSheet.create({
  container: { flex: 1 },

  // ── Header (matches feed 05 pattern) ──
  headerWrapper: {
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerLeft: { flex: 1, gap: 4 },
  locationEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: fonts.display,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  headerActions: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconCircleDark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Tab chips (inside header) ──
  tabScrollRow: { paddingBottom: 0 },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    minHeight: 44,
  },
  tabChipText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
  tabChipCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    minWidth: 22,
    alignItems: 'center' as const,
  },
  tabChipCountText: {
    fontSize: 12,
    fontWeight: '700' as const,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // ── Filter chips (events/places sub-tabs) ──
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  filterScrollWrap: {
    marginBottom: 12,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },
  filterSeparator: {
    width: 1,
    height: 20,
    alignSelf: 'center',
    opacity: 0.5,
    marginHorizontal: 4,
  },

  // ── Scroll content ──
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  // ── Summary cards ──
  summaryRow: {
    gap: 10,
    marginTop: 16,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    flex: 1,
    lineHeight: 20,
  },

  // ── Section wrapper (community events, groups, forum) ──
  sectionWrap: {
    gap: 10,
    marginTop: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  seeAllLink: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  seeAllText: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
    textDecorationLine: 'underline',
  },

  // ── Section card container (groups list, forum list, event list, place list) ──
  sectionCardContainer: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // ── List row (inside card container) ──
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  // ── Card content (event/place rows) ──
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardFlex: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    fontFamily: fonts.headingSemi,
  },
  cardMeta: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  cardDateText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 18,
  },

  // ── Icon boxes (event/place) ──
  eventIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Free badge ──
  freeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginTop: 4,
  },
  freeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: fonts.display,
    lineHeight: 22,
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
    fontFamily: fonts.body,
    lineHeight: 18,
  },
  emptyCta: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    minHeight: 44,
    borderWidth: 1,
  },
  emptyCtaText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },

  // ── Community card (fallback: create event CTA) ──
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  communityCardTitle: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
  communityCardHint: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },

  // ── Error row ──
  errorRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 16,
  },
  errorRowText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    flex: 1,
    lineHeight: 18,
  },

  // ── Community events carousel ──
  ceCarousel: {
    marginHorizontal: -16,
  },
  ceCarouselContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  ceCard: {
    width: 200,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  ceImageWrap: {
    width: 200,
    height: 100,
  },
  ceImage: {
    width: 200,
    height: 100,
  },
  ceImagePlaceholder: {
    width: 200,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ceCardBody: {
    padding: 12,
    gap: 6,
  },
  ceCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.headingSemi,
    lineHeight: 17,
  },
  ceCardDate: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 16,
  },
  ceCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ceCardMetaText: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
})

export default function ExploreScreen() {
  return (
    <ScreenErrorBoundary screenName="Explore">
      <ExploreScreenInner />
    </ScreenErrorBoundary>
  )
}
