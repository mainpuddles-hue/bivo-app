declare const __DEV__: boolean

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, RefreshControl, StyleSheet,
  Pressable, Linking,
} from 'react-native'
import { SectionSkeleton } from '@/components/SkeletonLoaders'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  Map, CalendarDays, MapPin, ChevronRight, Navigation, Globe,
  Store, Coffee, BookOpen, Dumbbell, Heart, UtensilsCrossed,
  Users, MessageCircle,
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
import { haversineKm } from '@/lib/geo'

// ── Types ──

interface EventPreview {
  id: string
  title: string
  event_date: string
  location_name: string | null
}

type SubTab = 'map' | 'events' | 'places'

// ── Group category colors ──
const GROUP_COLORS: Record<string, string> = {
  general: '#2D6B5E', sports: '#27AE60', kids: '#FF9800', pets: '#E8A050',
  garden: '#4CAF6A', food: '#E74C3C', culture: '#8E44AD', other: '#607D8B',
}

// ── Place category colors ──
const PLACE_CAT_COLORS: Record<string, string> = {
  restaurant: '#C75B3A', fast_food: '#C75B3A', cafe: '#E8A050',
  bar: '#7C5CBF', pub: '#7C5CBF', culture: '#3B7DD8', library: '#3B7DD8',
  sport: '#2B8A62', health: '#C75B3A', shop: '#E8A050',
  hotel: '#8E44AD', service: '#607D8B', other: '#78716C',
}

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

export default function ExploreScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [activeTab, setActiveTab] = useState<SubTab>('map')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  // Data state
  const [communityEvents, setCommunityEvents] = useState<EventPreview[]>([])
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([])
  const [places, setPlaces] = useState<LocalPlace[]>([])
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null)

  // Community preview state
  const [groups, setGroups] = useState<Array<{ id: string; name: string; category: string; member_count: number }>>([])
  const [forumPosts, setForumPosts] = useState<Array<{ id: string; title: string; category: string; reply_count: number; created_at: string }>>([])


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
      const [groupsRes, forumRes] = await Promise.all([
        (supabase.from('groups').select('id, name, category, member_count') as any)
          .order('member_count', { ascending: false }).limit(3)
          .then((r: any) => r).catch(() => ({ data: null, error: true })),
        (supabase.from('forum_posts').select('id, title, category, reply_count, created_at') as any)
          .order('created_at', { ascending: false }).limit(3)
          .then((r: any) => r).catch(() => ({ data: null, error: true })),
      ])
      if (!groupsRes.error && groupsRes.data) setGroups(groupsRes.data)
      if (!forumRes.error && forumRes.data) setForumPosts(forumRes.data)
    } catch (err) {
      if (__DEV__) console.log('[explore] fetch error:', err)
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [supabase, fetchLocation])

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
        _distance: haversineKm(userLocation.latitude, userLocation.longitude, p.latitude, p.longitude),
      }))
      .sort((a, b) => a._distance - b._distance)
      .slice(0, 20)
  }, [places, userLocation])

  // ── All events combined, deduplicated & sorted ──
  const allEvents = useMemo(() => {
    const combined: Array<{ id: string; title: string; date: string; location: string | null; isFree: boolean; infoUrl: string | null; isCity: boolean }> = []
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
      })
    }

    return combined.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }, [communityEvents, cityEvents, locale])

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
              {tabCounts[key] > 0 && (
                <View style={[s.chipCount, { backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : `${colors.primary}20` }]}>
                  <Text style={[s.chipCountText, { color: isActive ? '#FFFFFF' : colors.primary }]}>
                    {tabCounts[key]}
                  </Text>
                </View>
              )}
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
                {cityEvents.length > 0 && (
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
                )}

                {places.length > 0 && (
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
                )}
              </View>
            )}

            {/* Community: Groups */}
            <View style={s.communitySection}>
              <View style={s.sectionHeader}>
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('groups.title')}</Text>
                <Pressable onPress={() => router.push('/groups' as any)} style={s.seeAllLink}>
                  <Text style={[s.seeAllText, { color: colors.primary }]}>{t('feed.showAll')}</Text>
                  <ChevronRight size={14} color={colors.primary} />
                </Pressable>
              </View>
              {groups.length > 0 ? (
                groups.map(g => (
                  <Pressable key={g.id} onPress={() => router.push('/groups' as any)} style={[s.communityCard, { backgroundColor: colors.card }]}>
                    <View style={[s.groupDot, { backgroundColor: GROUP_COLORS[g.category] ?? colors.primary }]}>
                      <Text style={s.groupDotText}>{(g.name || '?').charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.communityCardTitle, { color: colors.foreground }]} numberOfLines={1}>{g.name}</Text>
                      <Text style={[s.communityCardHint, { color: colors.mutedForeground }]}>{g.member_count} {t('groups.members')}</Text>
                    </View>
                    <ChevronRight size={14} color={colors.mutedForeground} />
                  </Pressable>
                ))
              ) : (
                <Pressable onPress={() => router.push('/groups' as any)} style={[s.communityCard, { backgroundColor: colors.card }]}>
                  <Users size={20} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.communityCardTitle, { color: colors.foreground }]}>{t('groups.title')}</Text>
                    <Text style={[s.communityCardHint, { color: colors.mutedForeground }]}>{t('groups.joinOrCreate')}</Text>
                  </View>
                  <ChevronRight size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>

            {/* Community: Forum */}
            <View style={s.communitySection}>
              <View style={s.sectionHeader}>
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('forum.title')}</Text>
                <Pressable onPress={() => router.push('/forum' as any)} style={s.seeAllLink}>
                  <Text style={[s.seeAllText, { color: colors.primary }]}>{t('feed.showAll')}</Text>
                  <ChevronRight size={14} color={colors.primary} />
                </Pressable>
              </View>
              {forumPosts.length > 0 ? (
                forumPosts.map(p => (
                  <Pressable key={p.id} onPress={() => router.push('/forum' as any)} style={[s.communityCard, { backgroundColor: colors.card }]}>
                    <MessageCircle size={18} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[s.communityCardTitle, { color: colors.foreground }]} numberOfLines={1}>{p.title}</Text>
                      <Text style={[s.communityCardHint, { color: colors.mutedForeground }]}>{p.reply_count} {t('forum.replies')}</Text>
                    </View>
                    <ChevronRight size={14} color={colors.mutedForeground} />
                  </Pressable>
                ))
              ) : (
                <Pressable onPress={() => router.push('/forum' as any)} style={[s.communityCard, { backgroundColor: colors.card }]}>
                  <MessageCircle size={20} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.communityCardTitle, { color: colors.foreground }]}>{t('forum.title')}</Text>
                    <Text style={[s.communityCardHint, { color: colors.mutedForeground }]}>{t('forum.startDiscussion')}</Text>
                  </View>
                  <ChevronRight size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>

            {loading && <SectionSkeleton count={2} />}

            {/* Error state */}
            {fetchError && !loading && cityEvents.length === 0 && places.length === 0 && (
              <Pressable onPress={handleRefresh} style={[s.errorRow, { backgroundColor: `${colors.destructive}10` }]}>
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
            {loading ? (
              <SectionSkeleton count={5} />
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
            {loading ? (
              <SectionSkeleton count={5} />
            ) : sortedPlaces.length === 0 ? (
              <View style={[s.emptyState, { backgroundColor: colors.card }]}>
                <MapPin size={36} color={colors.mutedForeground} strokeWidth={1.4} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('explore.noPlaces')}</Text>
              </View>
            ) : (
              <View style={s.cardList}>
                {sortedPlaces.map((place) => {
                  const catColor = PLACE_CAT_COLORS[place.category] ?? '#78716C'
                  const catLabel = t(PLACE_LABEL_KEYS[place.category] || 'common.other')
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
  chipCount: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, minWidth: 20,
    alignItems: 'center' as const,
  },
  chipCountText: { fontSize: 11, fontWeight: '700' as const },
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

  // Community section
  communitySection: { gap: 10, marginTop: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  seeAllLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 13, fontFamily: fonts.bodySemi },
  sectionTitle: { fontSize: 16, fontFamily: fonts.headingSemi, letterSpacing: -0.16 },
  groupDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  groupDotText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  communityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: 12,
  },
  communityCardTitle: { fontSize: 14, fontFamily: fonts.bodySemi },
  communityCardHint: { fontSize: 12, fontFamily: fonts.body },
  errorRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12,
  },
  errorRowText: { fontSize: 13, fontFamily: fonts.bodySemi, flex: 1 },

})
