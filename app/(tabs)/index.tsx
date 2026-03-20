import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { View, Text, FlatList, RefreshControl, ScrollView, StyleSheet, Pressable, ActivityIndicator, Animated, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as Location from 'expo-location'
import { Sparkles, RefreshCw, Users, Plus, CalendarDays, MapPin, ChevronRight, Globe } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { createClient } from '@/lib/supabase/client'
import { POST_SELECT } from '@/lib/constants'
import { formatEventDateShort } from '@/lib/format'
import { fetchHelsinkiEvents, prefetchHelsinkiEvents } from '@/lib/linkedevents'
import { fetchHelsinkiPlaces } from '@/lib/palvelukartta'
import { FilterBar } from '@/components/FilterBar'
import { PostCard } from '@/components/PostCard'
import { TackBirdLogo } from '@/components/TackBirdLogo'
import type { Post, PostType, CityEvent, LocalPlace } from '@/lib/types'

// ── Category color maps ──
const CITY_EVENT_COLORS: Record<string, string> = {
  culture: '#8E44AD', music: '#E91E63', sport: '#27AE60', family: '#FF9800',
  food: '#E74C3C', nature: '#4CAF50', education: '#2196F3', theatre: '#9C27B0',
  exhibition: '#795548', festival: '#FF5722', market: '#FF9800', other: '#607D8B',
}

const PLACE_COLORS: Record<string, string> = {
  restaurant: '#E74C3C', cafe: '#8B5E3C', bar: '#F39C12', pub: '#D4A017',
  fast_food: '#FF6B35', shop: '#9B59B6', library: '#3498DB', health: '#E91E63',
  sport: '#27AE60', culture: '#8E44AD', hotel: '#2980B9', attraction: '#F1C40F',
  service: '#607D8B', other: '#95A5A6',
}

const PLACE_LABELS: Record<string, string> = {
  restaurant: 'Ravintola', cafe: 'Kahvila', bar: 'Baari', pub: 'Pubi',
  fast_food: 'Pikaruoka', shop: 'Kauppa', library: 'Kirjasto', health: 'Terveys',
  sport: 'Liikunta', culture: 'Kulttuuri', hotel: 'Majoitus', attraction: 'Nähtävyys',
  service: 'Palvelu', other: 'Muu',
}

const PAGE_SIZE = 20

// ── Skeleton component ──
function PostCardSkeleton({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
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
    <View style={[skelStyles.card, { backgroundColor: colors.card }]}>
      <Animated.View style={[skelStyles.image, { backgroundColor: colors.muted, opacity }]} />
      <View style={skelStyles.body}>
        <Animated.View style={[skelStyles.line, skelStyles.lineShort, { backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[skelStyles.line, skelStyles.lineLong, { backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[skelStyles.line, skelStyles.lineMed, { backgroundColor: colors.muted, opacity }]} />
        <View style={skelStyles.userRow}>
          <Animated.View style={[skelStyles.avatar, { backgroundColor: colors.muted, opacity }]} />
          <Animated.View style={[skelStyles.line, skelStyles.lineName, { backgroundColor: colors.muted, opacity }]} />
        </View>
      </View>
    </View>
  )
}

function HorizontalSkeleton({ colors, width, height }: { colors: ReturnType<typeof useTheme>['colors']; width: number; height: number }) {
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 4 }}>
      {[0, 1, 2].map(i => (
        <Animated.View key={i} style={{ width, height, borderRadius: 12, backgroundColor: colors.muted, opacity }} />
      ))}
    </ScrollView>
  )
}

const skelStyles = StyleSheet.create({
  card: { borderRadius: 12, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 3 / 2, borderRadius: 0 },
  body: { padding: 16, gap: 10 },
  line: { height: 12, borderRadius: 6 },
  lineShort: { width: '40%' },
  lineLong: { width: '90%' },
  lineMed: { width: '65%' },
  lineName: { width: '30%', height: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  avatar: { width: 24, height: 24, borderRadius: 12 },
})

// Check if a city event is happening today
function isEventToday(startTime: string): boolean {
  const now = new Date()
  const eventDate = new Date(startTime)
  return (
    eventDate.getFullYear() === now.getFullYear() &&
    eventDate.getMonth() === now.getMonth() &&
    eventDate.getDate() === now.getDate()
  )
}

export default function FeedScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState<PostType | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [hasNewPosts, setHasNewPosts] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFollowing, setShowFollowing] = useState(false)
  const [followedIds, setFollowedIds] = useState<string[]>([])
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([])
  const [nearbyPlaces, setNearbyPlaces] = useState<LocalPlace[]>([])
  const [extraLoading, setExtraLoading] = useState(true)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [nearBottom, setNearBottom] = useState(false)
  const offsetRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Request location permission once, cache result
  useEffect(() => {
    let cancelled = false
    async function getLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted' || cancelled) return
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        if (!cancelled) {
          setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })
        }
      } catch {
        // Silently fail — distance won't be shown
      }
    }
    getLocation()
    return () => { cancelled = true }
  }, [])

  // Fetch followed user IDs
  useEffect(() => {
    async function fetchFollows() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('user_follows').select('followed_id').eq('follower_id', user.id)
      if (data) setFollowedIds(data.map((f: any) => f.followed_id))
    }
    fetchFollows()
  }, [supabase])

  // Real-time subscription for follows changes
  useEffect(() => {
    const channel = supabase
      .channel('follows-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_follows' }, () => {
        // Re-fetch followed IDs
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (!user) return
          supabase.from('user_follows').select('followed_id').eq('follower_id', user.id)
            .then(({ data }) => {
              if (data) setFollowedIds(data.map((f: any) => f.followed_id))
            })
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  // Fetch city events and nearby places
  const fetchExtraContent = useCallback(async () => {
    setExtraLoading(true)
    const lat = userLocation?.latitude ?? 60.1699
    const lng = userLocation?.longitude ?? 24.9384
    const [helsinkiEvents, placesData] = await Promise.all([
      fetchHelsinkiEvents(),
      fetchHelsinkiPlaces(lat, lng, 2000),
    ])
    setCityEvents(helsinkiEvents.slice(0, 20))
    setNearbyPlaces(placesData.slice(0, 20))
    setExtraLoading(false)
  }, [userLocation])

  useEffect(() => { prefetchHelsinkiEvents(); fetchExtraContent() }, [fetchExtraContent])

  const fetchPosts = useCallback(async (reset = false) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      setError(null)
      const offset = reset ? 0 : offsetRef.current
      let query = supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('is_active', true)
        .or('expires_at.is.null,expires_at.gt.now()')
        .order('is_pro_listing', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (activeFilter) query = query.eq('type', activeFilter)
      if (showFollowing && followedIds.length > 0) {
        query = query.in('user_id', followedIds)
      }

      const { data, error: fetchError } = await query
      if (controller.signal.aborted) return
      if (fetchError) { setError(t('feed.loadError')); return }

      const newPosts = (data ?? []) as unknown as Post[]
      if (reset) {
        setPosts(newPosts)
        offsetRef.current = newPosts.length
      } else {
        setPosts(prev => {
          const ids = new Set(prev.map(p => p.id))
          const unique = newPosts.filter(p => !ids.has(p.id))
          return [...prev, ...unique]
        })
        offsetRef.current = offset + newPosts.length
      }
      setHasMore(newPosts.length >= PAGE_SIZE)
    } catch {
      if (!controller.signal.aborted) setError(t('feed.loadError'))
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [supabase, activeFilter, showFollowing, followedIds, t])

  useEffect(() => {
    setLoading(true)
    offsetRef.current = 0
    fetchPosts(true)
    return () => { abortRef.current?.abort() }
  }, [fetchPosts])

  // Realtime with 2s debounce
  useEffect(() => {
    const channel = supabase
      .channel('feed-new-posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => setHasNewPosts(true), 2000)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [supabase])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    setHasNewPosts(false)
    offsetRef.current = 0
    fetchPosts(true)
    fetchExtraContent()
  }, [fetchPosts, fetchExtraContent])

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore && !error) fetchPosts(false)
  }, [loading, hasMore, error, fetchPosts])

  const handleFilterChange = useCallback((type: PostType | null) => {
    setActiveFilter(type)
    setPosts([])
    offsetRef.current = 0
    setHasMore(true)
    setLoading(true)
  }, [])

  const getCityEventName = useCallback((e: CityEvent) => {
    if (locale === 'en' && e.name_en) return e.name_en
    if (locale === 'sv' && e.name_sv) return e.name_sv
    return e.name_fi
  }, [locale])

  const renderPost = useCallback(({ item }: { item: Post }) => <PostCard post={item} userLocation={userLocation} />, [userLocation])

  // Today's events from city events
  const todayEvents = useMemo(() => cityEvents.filter(e => isEventToday(e.start_time)).slice(0, 3), [cityEvents])

  // ── Scroll handler for FAB near-bottom detection ──
  const handleScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y
    setNearBottom(distanceFromBottom < 200)
  }, [])

  // ── List Header (now includes city events + nearby places + dynamic hero) ──
  const ListHeader = useMemo(() => (
    <View style={{ gap: 16 }}>
      {/* Dynamic hero: today's events or welcome message */}
      {todayEvents.length > 0 ? (
        <View style={{ gap: 10 }}>
          <View style={[styles.sectionHeader, { paddingHorizontal: 4 }]}>
            <View style={[styles.sectionBar, { backgroundColor: '#2B8A62' }]} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {t('events.todayNearby') || 'Tanaan lahella'}
            </Text>
          </View>
          {todayEvents.map((event) => {
            const catColor = CITY_EVENT_COLORS[event.category] || '#607D8B'
            return (
              <Pressable
                key={event.id}
                onPress={() => event.info_url ? Linking.openURL(event.info_url) : router.push('/(tabs)/events')}
                style={[styles.todayEventCard, { backgroundColor: colors.card }]}
              >
                {event.image_url ? (
                  <Image source={{ uri: event.image_url }} style={styles.todayEventImage} contentFit="cover" />
                ) : (
                  <View style={[styles.todayEventImageFallback, { backgroundColor: `${catColor}20` }]}>
                    <Globe size={20} color={catColor} />
                  </View>
                )}
                <View style={styles.todayEventInfo}>
                  <Text style={[styles.todayEventName, { color: colors.foreground }]} numberOfLines={1}>
                    {getCityEventName(event)}
                  </Text>
                  {event.location_name && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <MapPin size={10} color={colors.mutedForeground} />
                      <Text style={[styles.todayEventLocation, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {event.location_name}
                      </Text>
                    </View>
                  )}
                </View>
                <ChevronRight size={16} color={colors.mutedForeground} />
              </Pressable>
            )
          })}
        </View>
      ) : (
        <Text style={[styles.welcomeText, { color: colors.mutedForeground }]}>
          {t('hero.slide1Subtitle') || 'Tervetuloa naapurustosi ilmoitustaululle'}
        </Text>
      )}

      {/* ── City Events Section ── */}
      {extraLoading && cityEvents.length === 0 ? (
        <View style={{ gap: 12 }}>
          <View style={[styles.sectionHeader, { paddingHorizontal: 4 }]}>
            <View style={[styles.sectionBar, { backgroundColor: '#3B7DD8' }]} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('events.cityEvents')}</Text>
          </View>
          <HorizontalSkeleton colors={colors} width={200} height={140} />
        </View>
      ) : cityEvents.length > 0 ? (
        <View style={{ gap: 12 }}>
          <View style={[styles.sectionHeader, { paddingHorizontal: 4 }]}>
            <View style={[styles.sectionBar, { backgroundColor: '#3B7DD8' }]} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('events.cityEvents')}</Text>
            <Pressable onPress={() => router.push('/(tabs)/events')} hitSlop={8} style={extraStyles.showAllBtn}>
              <Text style={[extraStyles.showAllText, { color: colors.primary }]}>{t('events.cityTab')}</Text>
              <ChevronRight size={14} color={colors.primary} />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={212}
            contentContainerStyle={{ gap: 12, paddingHorizontal: 4, paddingBottom: 4 }}
          >
            {cityEvents.map((event) => {
              const catColor = CITY_EVENT_COLORS[event.category] || '#607D8B'
              return (
                <Pressable
                  key={event.id}
                  onPress={() => event.info_url ? Linking.openURL(event.info_url) : router.push('/(tabs)/events')}
                  style={[extraStyles.eventCard, { backgroundColor: colors.card }]}
                >
                  <View style={[extraStyles.eventAccent, { backgroundColor: catColor }]} />
                  {event.image_url ? (
                    <Image source={{ uri: event.image_url }} style={extraStyles.eventImage} contentFit="cover" />
                  ) : (
                    <View style={[extraStyles.eventImageFallback, { backgroundColor: `${catColor}20` }]}>
                      <Globe size={24} color={catColor} />
                    </View>
                  )}
                  <View style={extraStyles.eventInfo}>
                    <Text style={[extraStyles.eventName, { color: colors.foreground }]} numberOfLines={2}>
                      {getCityEventName(event)}
                    </Text>
                    <View style={extraStyles.eventMeta}>
                      <CalendarDays size={11} color={colors.mutedForeground} />
                      <Text style={[extraStyles.eventDate, { color: colors.primary }]}>
                        {formatEventDateShort(event.start_time, locale)}
                      </Text>
                    </View>
                    {event.location_name && (
                      <View style={extraStyles.eventMeta}>
                        <MapPin size={11} color={colors.mutedForeground} />
                        <Text style={[extraStyles.eventLocation, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {event.location_name}
                        </Text>
                      </View>
                    )}
                    {event.is_free && (
                      <View style={[extraStyles.freeBadge, { backgroundColor: `${colors.success}20` }]}>
                        <Text style={[extraStyles.freeText, { color: colors.success }]}>{t('events.free')}</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* ── Nearby Places Section ── */}
      {extraLoading && nearbyPlaces.length === 0 ? (
        <View style={{ gap: 12 }}>
          <View style={[styles.sectionHeader, { paddingHorizontal: 4 }]}>
            <View style={[styles.sectionBar, { backgroundColor: '#27AE60' }]} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('map.layerPlaces') || 'Paikat lahella'}</Text>
          </View>
          <HorizontalSkeleton colors={colors} width={160} height={120} />
        </View>
      ) : nearbyPlaces.length > 0 ? (
        <View style={{ gap: 12 }}>
          <View style={[styles.sectionHeader, { paddingHorizontal: 4 }]}>
            <View style={[styles.sectionBar, { backgroundColor: '#27AE60' }]} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('map.layerPlaces') || 'Paikat lahella'}</Text>
            <Pressable onPress={() => router.push('/map')} hitSlop={8} style={extraStyles.showAllBtn}>
              <Text style={[extraStyles.showAllText, { color: colors.primary }]}>{t('nav.map') || 'Kartta'}</Text>
              <ChevronRight size={14} color={colors.primary} />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={172}
            contentContainerStyle={{ gap: 12, paddingHorizontal: 4, paddingBottom: 4 }}
          >
            {nearbyPlaces.map((place) => {
              const catColor = PLACE_COLORS[place.category] || '#95A5A6'
              const catLabel = PLACE_LABELS[place.category] || place.category
              return (
                <Pressable
                  key={place.id}
                  onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`)}
                  style={[extraStyles.placeCard, { backgroundColor: colors.card }]}
                >
                  <View style={[extraStyles.placeCatCircle, { backgroundColor: `${catColor}20` }]}>
                    <MapPin size={16} color={catColor} />
                  </View>
                  <Text style={[extraStyles.placeName, { color: colors.foreground }]} numberOfLines={2}>
                    {place.name}
                  </Text>
                  <View style={[extraStyles.placeCatBadge, { backgroundColor: `${catColor}15` }]}>
                    <Text style={[extraStyles.placeCatText, { color: catColor }]}>{catLabel}</Text>
                  </View>
                  {place.address && (
                    <Text style={[extraStyles.placeAddress, { color: `${colors.mutedForeground}AA` }]} numberOfLines={1}>
                      {place.address}
                    </Text>
                  )}
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* New posts banner */}
      {hasNewPosts && (
        <Pressable
          onPress={handleRefresh}
          style={[styles.newBanner, { backgroundColor: isDark ? `${colors.primary}1F` : `${colors.primary}14` }]}
        >
          <Sparkles size={14} color={colors.primary} />
          <Text style={[styles.newBannerText, { color: colors.primary }]}>{t('feed.newPosts')}</Text>
          <RefreshCw size={14} color={colors.primary} style={{ opacity: 0.7 }} />
        </Pressable>
      )}

      {/* Error state */}
      {error && (
        <View style={[styles.errorBox, { backgroundColor: `${colors.destructive}10`, borderColor: `${colors.destructive}33` }]}>
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          <Pressable
            onPress={handleRefresh}
            style={[styles.retryBtn, { borderColor: `${colors.destructive}33` }]}
          >
            <RefreshCw size={14} color={colors.destructive} />
            <Text style={[styles.retryText, { color: colors.destructive }]}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      )}

      {/* Section header */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionBar, { backgroundColor: colors.primary }]} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('feed.latestListings')}</Text>
        {posts.length > 0 && !loading && (
          <View style={[styles.countBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.countText, { color: colors.mutedForeground }]}>{posts.length}</Text>
          </View>
        )}
      </View>
    </View>
  ), [todayEvents, hasNewPosts, error, handleRefresh, isDark, colors, t, posts.length, loading, cityEvents, nearbyPlaces, extraLoading, getCityEventName, locale, router])

  // ── Empty / Cold Start ──
  const EmptyComponent = useMemo(() => {
    if (loading) {
      return (
        <View style={{ gap: 16 }}>
          {[0, 1, 2, 3].map(i => <PostCardSkeleton key={i} colors={colors} />)}
        </View>
      )
    }
    return (
      <View style={styles.coldStart}>
        <Text style={[styles.coldStartTitle, { color: colors.foreground }]}>{t('feed.noPosts')}</Text>
        <Text style={[styles.coldStartHint, { color: colors.mutedForeground }]}>{t('feed.noPostsHint')}</Text>
        <Pressable
          onPress={() => router.push('/create')}
          style={[styles.coldStartBtn, { backgroundColor: colors.primary }]}
        >
          <Plus size={16} color={colors.primaryForeground} />
          <Text style={[styles.coldStartBtnText, { color: colors.primaryForeground }]}>{t('events.heroCreateCTA')}</Text>
        </Pressable>
      </View>
    )
  }, [loading, colors, t, router])

  // ── Footer: loading indicator + all loaded ──
  const FooterComponent = useMemo(() => {
    const sections: React.ReactNode[] = []

    // Loading indicator for paginated posts
    if (loading && posts.length > 0) {
      sections.push(
        <ActivityIndicator key="loader" size="small" color={colors.mutedForeground} style={{ marginVertical: 20 }} />
      )
    }

    // All loaded divider
    if (!hasMore && posts.length > 0) {
      sections.push(
        <View key="all-loaded" style={styles.allLoadedWrap}>
          <View style={styles.allLoadedRow}>
            <View style={[styles.allLoadedLine, { backgroundColor: `${colors.border}66` }]} />
            <TackBirdLogo size={14} color={`${colors.mutedForeground}50`} />
            <View style={[styles.allLoadedLine, { backgroundColor: `${colors.border}66` }]} />
          </View>
          <Text style={[styles.allLoadedText, { color: `${colors.mutedForeground}80` }]}>{t('feed.allLoaded')}</Text>
        </View>
      )
    }

    if (sections.length === 0) return null
    return <View style={{ paddingBottom: 12 }}>{sections}</View>
  }, [loading, hasMore, posts.length, colors, t])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Sticky filter bar — no scroll-hide animation */}
      <View style={[styles.filterWrapper, { backgroundColor: colors.background }]}>
        <View style={styles.filterRow}>
          <FilterBar activeFilter={activeFilter} onFilterChange={handleFilterChange} />
        </View>
        {followedIds.length > 0 && (
          <Pressable
            onPress={() => setShowFollowing(p => !p)}
            style={[
              styles.followingBtn,
              showFollowing
                ? { backgroundColor: colors.primary }
                : { backgroundColor: isDark ? colors.card : colors.muted },
            ]}
          >
            <Users size={14} color={showFollowing ? colors.primaryForeground : colors.mutedForeground} strokeWidth={1.75} />
            <Text style={[styles.followingText, { color: showFollowing ? colors.primaryForeground : colors.mutedForeground }]}>
              {t('feed.following')}
            </Text>
          </Pressable>
        )}
      </View>
      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingTop: 56 }]}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={EmptyComponent}
        ListFooterComponent={FooterComponent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        showsVerticalScrollIndicator={false}
      />

      {/* Floating Action Button */}
      {!nearBottom && (
        <Pressable
          onPress={() => router.push('/(tabs)/create')}
          style={[styles.fab, { bottom: insets.bottom + 80 }]}
        >
          <Plus size={24} color="#FFFFFF" />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterWrapper: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 8,
  },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  filterRow: { paddingBottom: 0 },
  followingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    alignSelf: 'flex-start', minHeight: 36,
  },
  followingText: { fontSize: 12, fontWeight: '500' },
  welcomeText: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20, paddingHorizontal: 4 },
  todayEventCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 12,
    overflow: 'hidden', gap: 12, paddingRight: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  todayEventImage: { width: 56, height: 56 },
  todayEventImageFallback: {
    width: 56, height: 56, alignItems: 'center', justifyContent: 'center',
  },
  todayEventInfo: { flex: 1, gap: 2 },
  todayEventName: { fontSize: 14, fontFamily: fonts.headingSemi, letterSpacing: -0.16 },
  todayEventLocation: { fontSize: 11, fontFamily: fonts.body, flex: 1 },
  newBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 10, minHeight: 44,
  },
  newBannerText: { fontSize: 14, fontFamily: fonts.bodySemi },
  errorBox: {
    borderRadius: 12, borderWidth: 1, padding: 16,
    alignItems: 'center', gap: 12,
  },
  errorText: { fontSize: 14, fontWeight: '500' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  retryText: { fontSize: 13, fontWeight: '500' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  sectionBar: { width: 3, height: 16, borderRadius: 1.5 },
  sectionTitle: { fontSize: 16, fontFamily: fonts.headingSemi, letterSpacing: -0.16, flex: 1 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countText: { fontSize: 11, fontWeight: '500' },
  coldStart: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32, gap: 12 },
  coldStartTitle: { fontSize: 18, fontWeight: '700' },
  coldStartHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  coldStartBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8,
  },
  coldStartBtnText: { fontSize: 15, fontWeight: '600' },
  allLoadedWrap: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  allLoadedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  allLoadedLine: { flex: 1, height: 1 },
  allLoadedText: { fontSize: 11, fontWeight: '500' },
  fab: {
    position: 'absolute', right: 16,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#4CAF6A', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
})

const extraStyles = StyleSheet.create({
  // ── Section header link ──
  showAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
  },
  showAllText: { fontSize: 13, fontWeight: '600' },

  // ── City Event Card ──
  eventCard: {
    width: 200, borderRadius: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  eventAccent: { height: 3 },
  eventImage: { width: '100%', height: 80 },
  eventImageFallback: {
    width: '100%', height: 80,
    alignItems: 'center', justifyContent: 'center',
  },
  eventInfo: { padding: 10, gap: 3 },
  eventName: { fontSize: 13, fontFamily: fonts.headingSemi, lineHeight: 17, letterSpacing: -0.16 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventDate: { fontSize: 11, fontFamily: fonts.body },
  eventLocation: { fontSize: 11, fontFamily: fonts.body, flex: 1 },
  freeBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
    alignSelf: 'flex-start', marginTop: 2,
  },
  freeText: { fontSize: 10, fontWeight: '600' },

  // ── Nearby Place Card ──
  placeCard: {
    width: 160, borderRadius: 12, padding: 12, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  placeCatCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  placeName: { fontSize: 13, fontFamily: fonts.headingSemi, lineHeight: 17, letterSpacing: -0.16 },
  placeCatBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
    alignSelf: 'flex-start',
  },
  placeCatText: { fontSize: 10, fontWeight: '600' },
  placeAddress: { fontSize: 10, fontFamily: fonts.body, marginTop: 2 },
})
