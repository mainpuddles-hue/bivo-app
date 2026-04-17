declare const __DEV__: boolean

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, RefreshControl, StyleSheet,
  Pressable, Linking,
} from 'react-native'
import { Image } from 'expo-image'
import { hapticMedium } from '@/lib/haptics'
import { SectionSkeleton } from '@/components/SkeletonLoaders'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import {
  Map, CalendarDays, MapPin, ChevronRight, Navigation, Globe,
  Store, Coffee, BookOpen, Dumbbell, Heart, UtensilsCrossed,
  Users, MessageCircle, Plus,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { fetchHelsinkiEvents } from '@/lib/linkedevents'
import { fetchHelsinkiPlaces } from '@/lib/palvelukartta'
import { formatEventDateShort } from '@/lib/format'
import * as Location from 'expo-location'
import type { CityEvent, LocalPlace } from '@/lib/types'
import { getCityEventName } from '@/lib/eventHelpers'
import { haversineKm, isInCityBounds } from '@/lib/geo'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { OutOfAreaBanner } from '@/components/OutOfAreaBanner'
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
  const [fetchError, setFetchError] = useState(false)

  // Event personalization
  const { interests: eventInterests } = useEventInterests()
  const [clickHistory, setClickHistory] = useState<{ category: string; timestamp: number }[]>([])
  useEffect(() => { getClickHistory().then(h => setClickHistory(h.map(x => ({ category: x.category, timestamp: x.timestamp })))).catch(() => {}) }, [])

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

  // Community preview state
  const [groups, setGroups] = useState<Array<{ id: string; name: string; category: string; member_count: number }>>([])
  const [forumPosts, setForumPosts] = useState<Array<{ id: string; title: string; category: string; comment_count: number; created_at: string }>>([])
  const [communityEventPreviews, setCommunityEventPreviews] = useState<CommunityEventPreview[]>([])

  // ── Semantic colors derived from theme ──
  const groupColors: Record<string, string> = useMemo(() => ({
    general: colors.primary, sports: colors.success, kids: colors.pro, pets: colors.pro,
    garden: colors.accent, food: colors.destructive, culture: colors.info, other: colors.mutedForeground,
  }), [colors])

  const placeCatColors: Record<string, string> = useMemo(() => ({
    restaurant: colors.destructive, fast_food: colors.destructive, cafe: colors.pro,
    bar: colors.info, pub: colors.info, culture: colors.info, library: colors.info,
    sport: colors.success, health: colors.destructive, shop: colors.pro,
    hotel: colors.info, service: colors.mutedForeground, other: colors.mutedForeground,
  }), [colors])

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
    setFetchError(false)
    try {
      const location = userLocationRef.current ?? await fetchLocation()

      const now = new Date().toISOString()

      const communityEventsPromise = (async () => {
        try {
          const { data, error } = await (supabase
            .from('events')
            .select('id, title, event_date, location_name') as any)
            .gte('event_date', now)
            .order('event_date', { ascending: true })
            .limit(10)
          if (error) return [] as EventPreview[]
          return (data ?? []) as EventPreview[]
        } catch {
          return [] as EventPreview[]
        }
      })()

      const [helsinkiEvents, communityRes, placesResult] = await Promise.all([
        fetchHelsinkiEvents().catch(() => [] as CityEvent[]),
        communityEventsPromise,
        location
          ? fetchHelsinkiPlaces(location.latitude, location.longitude, 2000).catch(() => [] as LocalPlace[])
          : Promise.resolve([] as LocalPlace[]),
      ])

      const futureCityEvents = helsinkiEvents.filter(e => e.start_time >= now)
      setCityEvents(futureCityEvents)
      setCommunityEvents(communityRes)
      setPlaces(placesResult)

      // Fetch community previews in parallel (graceful if tables don't exist)
      const [groupsRes, forumRes, communityEvtsRes] = await Promise.all([
        (supabase.from('groups').select('id, name, category, member_count') as any)
          .order('member_count', { ascending: false }).limit(3)
          .then((r: any) => r).catch(() => ({ data: null, error: true })),
        (supabase.from('forum_posts').select('id, title, category, comment_count, created_at') as any)
          .order('created_at', { ascending: false }).limit(3)
          .then((r: any) => r).catch(() => ({ data: null, error: true })),
        (supabase.from('community_events').select('id, title, image_url, event_date, location_name, category, participant_count, max_participants') as any)
          .eq('is_active', true)
          .gte('event_date', now)
          .order('event_date', { ascending: true }).limit(4)
          .then((r: any) => r).catch(() => ({ data: null, error: true })),
      ])
      if (!groupsRes.error && groupsRes.data) setGroups(groupsRes.data)
      if (!forumRes.error && forumRes.data) setForumPosts(forumRes.data)
      if (!communityEvtsRes.error && communityEvtsRes.data) setCommunityEventPreviews(communityEvtsRes.data)
    } catch (err) {
      if (__DEV__) console.log('[explore] fetch error:', err)
      setFetchError(true)
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
  // Helsinki default bounds
  const HKI_BOUNDS = useMemo(() => ({ south: 60.14, north: 60.27, west: 24.83, east: 25.20 }), [])
  const isOutOfArea = useMemo(() => {
    if (!userLocation) return false
    return !isInCityBounds(userLocation.latitude, userLocation.longitude, HKI_BOUNDS)
  }, [userLocation, HKI_BOUNDS])

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
    const combined: Array<{ id: string; title: string; date: string; location: string | null; isFree: boolean; infoUrl: string | null; isCity: boolean; category: string }> = []
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
    Linking.openURL(url).catch(() => {})
  }, [])

  // ── Safe URL opener — validates protocol to prevent javascript: / file: schemes
  // from external data (e.g. Helsinki linkedevents API) ──
  const openExternalUrl = useCallback((url: string | null | undefined) => {
    if (!url) return
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
      Linking.openURL(url).catch(() => {})
    } catch {
      // Invalid URL — ignore
    }
  }, [])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Tab bar already shows "Tutustu" — no redundant header needed */}

      {/* Tab chips */}
      <View style={s.chipRow}>
        {tabs.map(({ key, labelKey, Icon }) => {
          const isActive = activeTab === key
          return (
            <Pressable
              key={key}
              onPress={() => setActiveTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${t(labelKey)}${tabCounts[key] > 0 ? `, ${tabCounts[key]}` : ''}`}
              style={[
                s.chip,
                isActive
                  ? { backgroundColor: colors.foreground }
                  : { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
              ]}
            >
              <Icon size={16} color={isActive ? colors.background : colors.mutedForeground} strokeWidth={isActive ? 2.2 : 1.6} />
              <Text style={[s.chipText, { color: isActive ? colors.background : colors.mutedForeground }]}>
                {t(labelKey)}
              </Text>
              {tabCounts[key] > 0 && (
                <View style={[s.chipCount, { backgroundColor: isActive ? 'rgba(255,255,255,0.18)' : `${colors.foreground}12` }]}>
                  <Text style={[s.chipCountText, { color: isActive ? colors.background : colors.foreground }]}>
                    {tabCounts[key]}
                  </Text>
                </View>
              )}
            </Pressable>
          )
        })}
      </View>

      {/* ── Out of Area Banner ── */}
      <OutOfAreaBanner visible={isOutOfArea} cityName="Helsinki" />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* ── Map sub-tab ── */}
        {activeTab === 'map' && (
          <>
            {/* Map teaser card */}
            <Pressable
              onPress={() => router.push('/map')}
              accessibilityRole="button"
              accessibilityLabel={t('explore.openMap')}
              style={[s.mapTeaser, { backgroundColor: colors.muted, borderWidth: 0 }]}
            >
              <View style={s.mapTeaserContent}>
                <Map size={28} color={colors.foreground} strokeWidth={1.6} />
                <Text style={[s.mapTeaserTitle, { color: colors.foreground }]}>
                  {t('explore.openMap')}
                </Text>
                <Text style={[s.mapTeaserHint, { color: colors.mutedForeground }]}>
                  {t('explore.mapHint')}
                </Text>
              </View>
              <ChevronRight size={20} color={colors.mutedForeground} strokeWidth={1.6} />
            </Pressable>

            {/* Summary stats */}
            {!loading && (
              <View style={s.summaryRow}>
                {cityEvents.length > 0 && (
                  <Pressable
                    style={[s.summaryCard, { backgroundColor: colors.muted, borderWidth: 0 }]}
                    onPress={() => setActiveTab('events')}
                    accessibilityRole="button"
                    accessibilityLabel={t('explore.eventsThisWeek', { count: eventsThisWeek })}
                  >
                    <CalendarDays size={18} color={colors.foreground} strokeWidth={1.8} />
                    <Text style={[s.summaryText, { color: colors.foreground }]}>
                      {t('explore.eventsThisWeek', { count: eventsThisWeek })}
                    </Text>
                    <ChevronRight size={14} color={colors.mutedForeground} strokeWidth={1.6} />
                  </Pressable>
                )}

                {places.length > 0 && (
                  <Pressable
                    style={[s.summaryCard, { backgroundColor: colors.muted, borderWidth: 0 }]}
                    onPress={() => setActiveTab('places')}
                    accessibilityRole="button"
                    accessibilityLabel={t('explore.placesNearby', { count: placesCount })}
                  >
                    <MapPin size={18} color={colors.foreground} strokeWidth={1.8} />
                    <Text style={[s.summaryText, { color: colors.foreground }]}>
                      {t('explore.placesNearby', { count: placesCount })}
                    </Text>
                    <ChevronRight size={14} color={colors.mutedForeground} strokeWidth={1.6} />
                  </Pressable>
                )}
              </View>
            )}

            {/* Community Events carousel */}
            <View style={s.communitySection}>
              <View style={s.sectionHeader}>
                <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>{t('events.communityEventsTitle').toUpperCase()}</Text>
                <Pressable
                  onPress={() => router.push('/community-events' as any)}
                  accessibilityRole="link"
                  accessibilityLabel={`${t('events.communityEventsTitle')} — ${t('events.showAllEvents')}`}
                  style={s.seeAllLink}
                >
                  <Text style={[s.seeAllText, { color: colors.mutedForeground }]}>{t('events.showAllEvents')}</Text>
                  <ChevronRight size={12} color={colors.mutedForeground} strokeWidth={1.6} />
                </Pressable>
              </View>

              {communityEventPreviews.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.ceCarouselContent}
                  style={s.ceCarousel}
                >
                  {communityEventPreviews.map(evt => {
                    const catColor = ({
                      social: '#8B5CF6', sports: '#EF4444', culture: '#F59E0B',
                      nature: '#10B981', kids: '#EC4899', other: '#6B7280',
                    } as Record<string, string>)[evt.category] ?? '#6B7280'
                    const pCount = evt.participant_count ?? 0
                    const pLabel = evt.max_participants
                      ? `${pCount}/${evt.max_participants}`
                      : `${pCount}`

                    return (
                      <Pressable
                        key={evt.id}
                        onPress={() => router.push(`/event/${evt.id}` as any)}
                        accessibilityRole="button"
                        accessibilityLabel={`${evt.title}, ${formatEventDateShort(evt.event_date, locale)}`}
                        style={[s.ceCard, { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
                      >
                        {evt.image_url ? (
                          <View style={s.ceImageWrap}>
                            <Image source={{ uri: evt.image_url }} style={s.ceImage} contentFit="cover" cachePolicy="memory-disk" />
                          </View>
                        ) : (
                          <View style={[s.ceImagePlaceholder, { backgroundColor: colors.muted }]}>
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
                      </Pressable>
                    )
                  })}
                </ScrollView>
              ) : (
                <Pressable
                  onPress={() => router.push('/create-event' as any)}
                  accessibilityRole="button"
                  accessibilityLabel={t('events.createFirstEvent')}
                  style={[s.communityCard, { backgroundColor: colors.muted, borderTopWidth: 0 }]}
                >
                  <Plus size={20} color={colors.mutedForeground} strokeWidth={1.6} />
                  <View style={s.cardFlex}>
                    <Text style={[s.communityCardTitle, { color: colors.foreground }]}>{t('events.communityEventsTitle')}</Text>
                    <Text style={[s.communityCardHint, { color: colors.mutedForeground }]}>{t('events.createFirstEvent')}</Text>
                  </View>
                  <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.6} />
                </Pressable>
              )}
            </View>

            {/* Community: Groups */}
            <View style={s.communitySection}>
              <View style={s.sectionHeader}>
                <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>{t('groups.title').toUpperCase()}</Text>
                <Pressable
                  onPress={() => router.push('/groups' as any)}
                  accessibilityRole="link"
                  accessibilityLabel={`${t('groups.title')} — ${t('feed.showAll')}`}
                  style={s.seeAllLink}
                >
                  <Text style={[s.seeAllText, { color: colors.mutedForeground }]}>{t('feed.showAll')}</Text>
                  <ChevronRight size={12} color={colors.mutedForeground} strokeWidth={1.6} />
                </Pressable>
              </View>
              {groups.length > 0 ? (
                groups.map((g, idx) => (
                  <Pressable
                    key={g.id}
                    onPress={() => router.push(`/groups/${g.id}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`${g.name}, ${g.member_count} ${t('groups.members')}`}
                    style={[s.communityCard, { backgroundColor: 'transparent', borderTopWidth: idx === 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                  >
                    <View style={[s.groupDot, { backgroundColor: colors.muted, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
                      <Text style={[s.groupDotText, { color: colors.foreground }]}>{(g.name || '?').charAt(0)}</Text>
                    </View>
                    <View style={s.cardFlex}>
                      <Text style={[s.communityCardTitle, { color: colors.foreground }]} numberOfLines={1}>{g.name}</Text>
                      <Text style={[s.communityCardHint, { color: colors.mutedForeground }]}>{g.member_count} {t('groups.members')}</Text>
                    </View>
                    <ChevronRight size={14} color={colors.mutedForeground} strokeWidth={1.6} />
                  </Pressable>
                ))
              ) : (
                <Pressable
                  onPress={() => router.push('/groups' as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('groups.title')} — ${t('groups.joinOrCreate')}`}
                  style={[s.communityCard, { backgroundColor: 'transparent', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                >
                  <Users size={20} color={colors.mutedForeground} strokeWidth={1.6} />
                  <View style={s.cardFlex}>
                    <Text style={[s.communityCardTitle, { color: colors.foreground }]}>{t('groups.title')}</Text>
                    <Text style={[s.communityCardHint, { color: colors.mutedForeground }]}>{t('groups.joinOrCreate')}</Text>
                  </View>
                  <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.6} />
                </Pressable>
              )}
            </View>

            {/* Community: Forum */}
            <View style={s.communitySection}>
              <View style={s.sectionHeader}>
                <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>{t('forum.title').toUpperCase()}</Text>
                <Pressable
                  onPress={() => router.push('/forum' as any)}
                  accessibilityRole="link"
                  accessibilityLabel={`${t('forum.title')} — ${t('feed.showAll')}`}
                  style={s.seeAllLink}
                >
                  <Text style={[s.seeAllText, { color: colors.mutedForeground }]}>{t('feed.showAll')}</Text>
                  <ChevronRight size={12} color={colors.mutedForeground} strokeWidth={1.6} />
                </Pressable>
              </View>
              {forumPosts.length > 0 ? (
                forumPosts.map((p, idx) => (
                  <Pressable
                    key={p.id}
                    onPress={() => router.push(`/forum?thread=${p.id}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.title}, ${p.comment_count} ${t('forum.replies')}`}
                    style={[s.communityCard, { backgroundColor: 'transparent', borderTopWidth: idx === 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                  >
                    <MessageCircle size={18} color={colors.mutedForeground} strokeWidth={1.6} />
                    <View style={s.cardFlex}>
                      <Text style={[s.communityCardTitle, { color: colors.foreground }]} numberOfLines={1}>{p.title}</Text>
                      <Text style={[s.communityCardHint, { color: colors.mutedForeground }]}>{p.comment_count} {t('forum.replies')}</Text>
                    </View>
                    <ChevronRight size={14} color={colors.mutedForeground} strokeWidth={1.6} />
                  </Pressable>
                ))
              ) : (
                <Pressable
                  onPress={() => router.push('/forum' as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('forum.title')} — ${t('forum.startDiscussion')}`}
                  style={[s.communityCard, { backgroundColor: 'transparent', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                >
                  <MessageCircle size={20} color={colors.mutedForeground} strokeWidth={1.6} />
                  <View style={s.cardFlex}>
                    <Text style={[s.communityCardTitle, { color: colors.foreground }]}>{t('forum.title')}</Text>
                    <Text style={[s.communityCardHint, { color: colors.mutedForeground }]}>{t('forum.startDiscussion')}</Text>
                  </View>
                  <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.6} />
                </Pressable>
              )}
            </View>

            {loading && <SectionSkeleton count={2} />}

            {/* Error state */}
            {fetchError && !loading && cityEvents.length === 0 && places.length === 0 && (
              <Pressable
                onPress={handleRefresh}
                accessibilityRole="button"
                accessibilityLabel={t('feed.loadError')}
                style={[s.errorRow, { backgroundColor: `${colors.destructive}10` }]}
              >
                <Text style={[s.errorRowText, { color: colors.destructive }]}>
                  {t('feed.loadError')}
                </Text>
              </Pressable>
            )}
          </>
        )}

        {/* ── Events sub-tab ── */}
        {activeTab === 'events' && (
          <>
            {/* Combined sort + category row */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filterRow}
              style={s.filterScrollWrap}
            >
              {eventSortOptions.map(opt => {
                const active = eventSort === opt.key
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setEventSort(opt.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      s.filterChip,
                      active
                        ? { backgroundColor: colors.foreground }
                        : { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[s.filterChipText, { color: active ? colors.background : colors.mutedForeground }]}>
                      {t(opt.labelKey)}
                    </Text>
                  </Pressable>
                )
              })}
              <Text style={[s.filterSeparator, { color: colors.border }]}>|</Text>
              {eventCategoryOptions.map(opt => {
                const isAll = opt.key === ''
                const active = isAll ? eventCategories.length === 0 : eventCategories.includes(opt.key)
                return (
                  <Pressable
                    key={opt.key || '_all'}
                    onPress={() => toggleEventCategory(opt.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      s.filterChip,
                      active
                        ? { backgroundColor: colors.foreground }
                        : { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[s.filterChipText, { color: active ? colors.background : colors.mutedForeground }]}>
                      {t(opt.labelKey)}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>

            {loading ? (
              <SectionSkeleton count={5} />
            ) : allEvents.length === 0 ? (
              <View style={[s.emptyState, { backgroundColor: 'transparent' }]}>
                <CalendarDays size={40} color={colors.mutedForeground} strokeWidth={1.3} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('explore.noEvents')}</Text>
                <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>{t('explore.noEventsHint')}</Text>
                <Pressable
                  onPress={handleRefresh}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.retry')}
                  style={[s.emptyCta, { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
                >
                  <Text style={[s.emptyCtaText, { color: colors.foreground }]}>{t('common.retry')}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={s.cardList}>
                {allEvents.map((event, idx) => (
                  <Pressable
                    key={event.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${event.title}, ${formatEventDateShort(event.date, locale)}${event.location ? `, ${event.location}` : ''}${event.isFree ? `, ${t('events.free')}` : ''}`}
                    style={[s.card, { backgroundColor: 'transparent', borderTopWidth: idx === 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                    onPress={() => {
                      trackEventClick(event.id, event.category).then(() =>
                        getClickHistory().then(h => setClickHistory(h.map(x => ({ category: x.category, timestamp: x.timestamp }))))
                      )
                      if (event.infoUrl) {
                        openExternalUrl(event.infoUrl)
                      } else {
                        router.push('/community-events' as any)
                      }
                    }}
                  >
                    <View style={s.cardRow}>
                      <View style={s.eventIconBox}>
                        <CalendarDays size={18} color={colors.mutedForeground} strokeWidth={1.6} />
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
                          <View style={[s.freeBadge, { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
                            <Text style={[s.freeBadgeText, { color: colors.mutedForeground }]}>
                              {t('events.free')}
                            </Text>
                          </View>
                        )}
                      </View>
                      <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.6} />
                    </View>
                  </Pressable>
                ))}
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
              contentContainerStyle={s.filterRow}
              style={s.filterScrollWrap}
            >
              {placeSortOptions.map(opt => {
                const active = placeSort === opt.key
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setPlaceSort(opt.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      s.filterChip,
                      active
                        ? { backgroundColor: colors.foreground }
                        : { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[s.filterChipText, { color: active ? colors.background : colors.mutedForeground }]}>
                      {t(opt.labelKey)}
                    </Text>
                  </Pressable>
                )
              })}
              <Text style={[s.filterSeparator, { color: colors.border }]}>|</Text>
              {placeCategoryOptions.map(opt => {
                const isAll = opt.key === ''
                const active = isAll ? placeCategories.length === 0 : placeCategories.includes(opt.key)
                return (
                  <Pressable
                    key={opt.key || '_all'}
                    onPress={() => togglePlaceCategory(opt.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      s.filterChip,
                      active
                        ? { backgroundColor: colors.foreground }
                        : { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
                    ]}
                  >
                    <Text style={[s.filterChipText, { color: active ? colors.background : colors.mutedForeground }]}>
                      {t(opt.labelKey)}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>

            {loading ? (
              <SectionSkeleton count={5} />
            ) : sortedPlaces.length === 0 ? (
              <View style={[s.emptyState, { backgroundColor: 'transparent' }]}>
                <MapPin size={40} color={colors.mutedForeground} strokeWidth={1.3} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('explore.noPlaces')}</Text>
                <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>{t('explore.noPlacesHint')}</Text>
                <Pressable
                  onPress={handleRefresh}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.retry')}
                  style={[s.emptyCta, { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
                >
                  <Text style={[s.emptyCtaText, { color: colors.foreground }]}>{t('common.retry')}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={s.cardList}>
                {sortedPlaces.map((place, idx) => {
                  const catLabel = t(PLACE_LABEL_KEYS[place.category] || 'common.other')
                  const dist = '_distance' in place
                    ? formatDistance((place as any)._distance)
                    : null

                  return (
                    <Pressable
                      key={place.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${place.name}, ${catLabel}${dist ? `, ${dist}` : ''}`}
                      style={[s.card, { backgroundColor: 'transparent', borderTopWidth: idx === 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                      onPress={() => openPlaceInMaps(place)}
                    >
                      <View style={s.cardRow}>
                        <View style={s.placeIconBox}>
                          <PlaceCategoryIcon category={place.category} size={18} color={colors.mutedForeground} />
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
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

// ── Styles ──
const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 20, fontWeight: '700', letterSpacing: -0.3,
    fontFamily: fonts.headingSemi, lineHeight: 28,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  chipCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 20,
    alignItems: 'center' as const,
  },
  chipCountText: {
    fontSize: 11,
    fontWeight: '700' as const,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  // Filter chip rows
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  filterScrollWrap: {
    marginBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  filterSeparator: {
    fontSize: 14,
    lineHeight: 28,
    paddingHorizontal: 4,
    alignSelf: 'center',
    opacity: 0.4,
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // Map teaser
  mapTeaser: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  mapTeaserContent: {
    flex: 1,
    gap: 8,
  },
  mapTeaserTitle: {
    fontSize: 15,
    fontFamily: fonts.headingSemi,
    fontWeight: '700',
    marginTop: 4,
    lineHeight: 22,
  },
  mapTeaserHint: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.body,
  },

  // Summary
  summaryRow: {
    gap: 8,
    marginTop: 16,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    flex: 1,
    lineHeight: 20,
  },

  // Cards
  cardList: {
    gap: 0,
  },
  card: {
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingVertical: 14,
    gap: 12,
    alignItems: 'center',
  },
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

  // Event icon box
  eventIconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Place icon box
  placeIconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Free badge
  freeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  freeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // Empty state
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
    fontFamily: fonts.headingSemi,
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
    borderRadius: 16,
    minHeight: 44,
  },
  emptyCtaText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },

  // Community section
  communitySection: {
    gap: 8,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  seeAllLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  seeAllText: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.5,
    lineHeight: 16,
  },
  groupDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupDotText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.headingSemi,
    lineHeight: 20,
  },
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 14,
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
  errorRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    borderRadius: 16,
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

  // Community events carousel
  ceCarousel: {
    marginHorizontal: -16,
  },
  ceCarouselContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  ceCard: {
    width: 200,
    borderRadius: 16,
    overflow: 'hidden',
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
    gap: 4,
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
    fontSize: 11,
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
