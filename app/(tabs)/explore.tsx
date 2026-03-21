import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, RefreshControl, StyleSheet,
  Pressable, Linking, Animated,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  Map, CalendarDays, MapPin, ChevronRight, Navigation, Globe,
  Store, Coffee, BookOpen, Dumbbell, Heart, UtensilsCrossed,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { createClient } from '@/lib/supabase/client'
import { fetchHelsinkiEvents } from '@/lib/linkedevents'
import { fetchHelsinkiPlaces } from '@/lib/palvelukartta'
import { formatEventDateShort } from '@/lib/format'
import * as Location from 'expo-location'
import type { CityEvent, LocalPlace } from '@/lib/types'
import { getCityEventName } from '@/lib/eventHelpers'

// ── Types ──

interface EventPreview {
  id: string
  title: string
  event_date: string
  location_name: string | null
}

type SubTab = 'map' | 'events' | 'places'

// ── Place category colors ──
const PLACE_CAT_COLORS: Record<string, string> = {
  restaurant: '#C75B3A', fast_food: '#C75B3A', cafe: '#E8A050',
  bar: '#7C5CBF', pub: '#7C5CBF', culture: '#3B7DD8', library: '#3B7DD8',
  sport: '#2B8A62', health: '#C75B3A', shop: '#E8A050',
  hotel: '#8E44AD', service: '#607D8B', other: '#78716C',
}

const PLACE_LABEL: Record<string, string> = {
  restaurant: 'Ravintola', cafe: 'Kahvila', bar: 'Baari', shop: 'Kauppa',
  library: 'Kirjasto', health: 'Terveys', sport: 'Urheilu', culture: 'Kulttuuri',
  hotel: 'Hotelli', service: 'Palvelu', fast_food: 'Pikaruoka', pub: 'Pubi', other: 'Muu',
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

// ── Distance helper ──
function distanceBetween(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6371 // km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

// ── Shimmer skeleton ──
function SectionSkeleton({ colors, count = 3 }: { colors: ReturnType<typeof useTheme>['colors']; count?: number }) {
  const shimmer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [shimmer])
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] })

  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[s.card, { backgroundColor: colors.card }]}>
          <View style={s.cardRow}>
            <Animated.View style={[s.skelCircle, { backgroundColor: colors.muted, opacity }]} />
            <View style={s.cardContent}>
              <Animated.View style={[s.skelLine, { width: '60%', height: 14, backgroundColor: colors.muted, opacity }]} />
              <Animated.View style={[s.skelLine, { width: '40%', height: 10, backgroundColor: colors.muted, opacity, marginTop: 6 }]} />
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}

// ══════════════════════════════════════════════
// ── Explore Screen ──
// ══════════════════════════════════════════════

export default function ExploreScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [activeTab, setActiveTab] = useState<SubTab>('map')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Data state
  const [communityEvents, setCommunityEvents] = useState<EventPreview[]>([])
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([])
  const [places, setPlaces] = useState<LocalPlace[]>([])
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)

  // ── Fetch location ──
  const fetchLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return null
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
      setUserLocation(coords)
      return coords
    } catch {
      return null
    }
  }, [])

  // ── Fetch all data ──
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const location = userLocation ?? await fetchLocation()

      const now = new Date().toISOString()

      const [helsinkiEvents, communityRes, placesResult] = await Promise.all([
        fetchHelsinkiEvents().catch(() => [] as CityEvent[]),
        (supabase
          .from('events')
          .select('id, title, event_date, location_name') as any)
          .gte('event_date', now)
          .order('event_date', { ascending: true })
          .limit(10)
          .then((res: any) => (res.data ?? []) as EventPreview[])
          .catch(() => [] as EventPreview[]),
        location
          ? fetchHelsinkiPlaces(location.latitude, location.longitude, 2000).catch(() => [] as LocalPlace[])
          : Promise.resolve([] as LocalPlace[]),
      ])

      const futureCityEvents = helsinkiEvents.filter(e => e.start_time >= now)
      setCityEvents(futureCityEvents)
      setCommunityEvents(communityRes)
      setPlaces(placesResult)
    } catch (err) {
      console.log('[explore] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase, userLocation, fetchLocation])

  // ── Initial load ──
  useEffect(() => {
    fetchData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pull to refresh ──
  const handleRefresh = useCallback(async () => {
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

  // ── Sorted places with distance ──
  const sortedPlaces = useMemo(() => {
    if (!userLocation) return places.slice(0, 20)
    return [...places]
      .map(p => ({
        ...p,
        _distance: distanceBetween(userLocation.latitude, userLocation.longitude, p.latitude, p.longitude),
      }))
      .sort((a, b) => a._distance - b._distance)
      .slice(0, 20)
  }, [places, userLocation])

  // ── All events combined & sorted ──
  const allEvents = useMemo(() => {
    const combined: Array<{ id: string; title: string; date: string; location: string | null; isFree: boolean; infoUrl: string | null; isCity: boolean }> = []

    for (const e of communityEvents) {
      combined.push({
        id: e.id,
        title: e.title,
        date: e.event_date,
        location: e.location_name,
        isFree: false,
        infoUrl: null,
        isCity: false,
      })
    }

    for (const e of cityEvents) {
      combined.push({
        id: e.id,
        title: getCityEventName(e, locale),
        date: e.start_time,
        location: e.location_name,
        isFree: e.is_free,
        infoUrl: e.info_url,
        isCity: true,
      })
    }

    return combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [communityEvents, cityEvents, locale])

  // ── Tab chips config ──
  const tabs: { key: SubTab; labelKey: string; Icon: typeof Map }[] = [
    { key: 'map', labelKey: 'nav.map', Icon: Map },
    { key: 'events', labelKey: 'nav.events', Icon: CalendarDays },
    { key: 'places', labelKey: 'places.title', Icon: MapPin },
  ]

  // ── Open Google Maps for a place ──
  const openPlaceInMaps = useCallback((place: LocalPlace) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
    Linking.openURL(url).catch(() => {})
  }, [])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Sub-header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('explore.title')}</Text>
      </View>

      {/* Tab chips */}
      <View style={s.chipRow}>
        {tabs.map(({ key, labelKey, Icon }) => {
          const isActive = activeTab === key
          return (
            <Pressable
              key={key}
              onPress={() => setActiveTab(key)}
              style={[
                s.chip,
                { backgroundColor: isActive ? colors.primary : colors.muted },
              ]}
            >
              <Icon size={16} color={isActive ? '#FFFFFF' : colors.mutedForeground} strokeWidth={isActive ? 2.2 : 1.6} />
              <Text style={[s.chipText, { color: isActive ? '#FFFFFF' : colors.mutedForeground }]}>
                {t(labelKey)}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
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
              style={[s.mapTeaser, { backgroundColor: colors.card }]}
            >
              <View style={s.mapTeaserContent}>
                <Map size={32} color={colors.primary} strokeWidth={1.6} />
                <Text style={[s.mapTeaserTitle, { color: colors.foreground }]}>
                  {t('explore.openMap')}
                </Text>
                <Text style={[s.mapTeaserHint, { color: colors.mutedForeground }]}>
                  {t('explore.mapHint')}
                </Text>
              </View>
              <Navigation size={20} color={colors.primary} strokeWidth={1.8} />
            </Pressable>

            {/* Summary stats */}
            {!loading && (
              <View style={s.summaryRow}>
                <Pressable
                  style={[s.summaryCard, { backgroundColor: colors.card }]}
                  onPress={() => setActiveTab('events')}
                >
                  <CalendarDays size={18} color="#2B8A62" strokeWidth={1.8} />
                  <Text style={[s.summaryText, { color: colors.foreground }]}>
                    {t('explore.eventsThisWeek', { count: eventsThisWeek })}
                  </Text>
                  <ChevronRight size={14} color={colors.mutedForeground} strokeWidth={1.6} />
                </Pressable>

                <Pressable
                  style={[s.summaryCard, { backgroundColor: colors.card }]}
                  onPress={() => setActiveTab('places')}
                >
                  <MapPin size={18} color="#3B7DD8" strokeWidth={1.8} />
                  <Text style={[s.summaryText, { color: colors.foreground }]}>
                    {t('explore.placesNearby', { count: placesCount })}
                  </Text>
                  <ChevronRight size={14} color={colors.mutedForeground} strokeWidth={1.6} />
                </Pressable>
              </View>
            )}

            {loading && <SectionSkeleton colors={colors} count={2} />}
          </>
        )}

        {/* ── Events sub-tab ── */}
        {activeTab === 'events' && (
          <>
            {loading ? (
              <SectionSkeleton colors={colors} count={5} />
            ) : allEvents.length === 0 ? (
              <View style={[s.emptyState, { backgroundColor: colors.card }]}>
                <CalendarDays size={36} color={colors.mutedForeground} strokeWidth={1.4} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('explore.noEvents')}</Text>
              </View>
            ) : (
              <View style={s.cardList}>
                {allEvents.map((event) => (
                  <Pressable
                    key={event.id}
                    style={[s.card, { backgroundColor: colors.card }]}
                    onPress={() => {
                      if (event.infoUrl) {
                        Linking.openURL(event.infoUrl).catch(() => {})
                      } else {
                        router.push('/(tabs)/events' as any)
                      }
                    }}
                  >
                    <View style={s.cardRow}>
                      <View style={[s.eventIconBox, { backgroundColor: isDark ? (event.isCity ? '#101A2D' : '#102D1A') : (event.isCity ? '#EBF2FE' : '#E8F7EF') }]}>
                        <CalendarDays size={18} color={event.isCity ? '#3B7DD8' : '#2B8A62'} />
                      </View>
                      <View style={s.cardContent}>
                        <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                          {event.title}
                        </Text>
                        <Text style={[s.cardDateText, { color: colors.primary }]}>
                          {formatEventDateShort(event.date, locale)}
                          {event.location ? ` \u00B7 ${event.location}` : ''}
                        </Text>
                        {event.isFree && (
                          <View style={[s.freeBadge, { backgroundColor: isDark ? '#102D1A' : '#E8F7EF' }]}>
                            <Text style={[s.freeBadgeText, { color: '#2B8A62' }]}>
                              {locale === 'sv' ? 'Gratis' : locale === 'en' ? 'Free' : 'Ilmainen'}
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
            {loading ? (
              <SectionSkeleton colors={colors} count={5} />
            ) : sortedPlaces.length === 0 ? (
              <View style={[s.emptyState, { backgroundColor: colors.card }]}>
                <MapPin size={36} color={colors.mutedForeground} strokeWidth={1.4} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('explore.noPlaces')}</Text>
              </View>
            ) : (
              <View style={s.cardList}>
                {sortedPlaces.map((place) => {
                  const catColor = PLACE_CAT_COLORS[place.category] ?? '#78716C'
                  const catLabel = PLACE_LABEL[place.category] ?? ''
                  const dist = '_distance' in place
                    ? formatDistance((place as any)._distance)
                    : null

                  return (
                    <Pressable
                      key={place.id}
                      style={[s.card, { backgroundColor: colors.card }]}
                      onPress={() => openPlaceInMaps(place)}
                    >
                      <View style={s.cardRow}>
                        <View style={[s.placeIconBox, { backgroundColor: `${catColor}15` }]}>
                          <PlaceCategoryIcon category={place.category} size={18} color={catColor} />
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontFamily: fonts.headingSemi,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodyMedium,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },

  // Map teaser
  mapTeaser: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 20,
    gap: 16,
  },
  mapTeaserContent: {
    flex: 1,
    gap: 6,
  },
  mapTeaserTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: fonts.headingSemi,
    marginTop: 4,
  },
  mapTeaserHint: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.body,
  },

  // Summary
  summaryRow: {
    gap: 10,
    marginTop: 12,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    flex: 1,
  },

  // Cards
  cardList: {
    gap: 10,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    fontFamily: fonts.headingSemi,
  },
  cardMeta: {
    fontSize: 12,
    fontFamily: fonts.body,
  },
  cardDateText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
  },

  // Event icon box
  eventIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Place icon box
  placeIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Free badge
  freeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  freeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: 14,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: fonts.headingSemi,
  },

  // Skeleton
  skelCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  skelLine: {
    height: 10,
    borderRadius: 5,
  },
})
