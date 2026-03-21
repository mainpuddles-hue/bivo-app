import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { View, Text, FlatList, RefreshControl, ScrollView, StyleSheet, Pressable, ActivityIndicator, Animated, Linking, Modal } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { Image } from 'expo-image'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { Sparkles, RefreshCw, Users, Plus, CalendarDays, MapPin, ChevronRight, ChevronDown, Globe, CheckCircle, X, Check } from 'lucide-react-native'
import { BoardIllustration } from '@/components/illustrations'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { createClient } from '@/lib/supabase/client'
import { POST_SELECT, NEIGHBORHOODS } from '@/lib/constants'
import { formatEventDateShort } from '@/lib/format'
import { fetchHelsinkiEvents, prefetchHelsinkiEvents } from '@/lib/linkedevents'
import { fetchHelsinkiPlaces } from '@/lib/palvelukartta'
import { FilterBar } from '@/components/FilterBar'
import { PostCard } from '@/components/PostCard'
import { AlertBanner } from '@/components/AlertBanner'
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

const PLACE_LABEL_KEYS: Record<string, string> = {
  restaurant: 'places.restaurant', cafe: 'places.cafe', bar: 'places.bar', pub: 'places.pub',
  fast_food: 'places.fastFood', shop: 'places.shop', library: 'places.library', health: 'places.health',
  sport: 'places.sport', culture: 'places.culture', hotel: 'places.hotel', attraction: 'places.attraction',
  service: 'places.service', other: 'places.other',
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

// ── Date helpers for event cascading fallback ──
function isToday(dateStr: string): boolean {
  const d = new Date(dateStr); const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}
function isTomorrow(dateStr: string): boolean {
  const d = new Date(dateStr); const t = new Date(); t.setDate(t.getDate() + 1)
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}
function isWithinDays(dateStr: string, days: number): boolean {
  const d = new Date(dateStr).getTime(); const now = Date.now()
  return d >= now && d <= now + days * 86400000
}

// ── Date group helper for time-based section breaks (Fix 10) ──
function isYesterday(dateStr: string): boolean {
  const d = new Date(dateStr); const y = new Date(); y.setDate(y.getDate() - 1)
  return d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate()
}

function isWithinPastDays(dateStr: string, days: number): boolean {
  const d = new Date(dateStr).getTime(); const now = Date.now()
  return d <= now && d >= now - days * 86400000
}

function getDateGroup(dateStr: string): string {
  if (isToday(dateStr)) return 'today'
  if (isYesterday(dateStr)) return 'yesterday'
  if (isWithinPastDays(dateStr, 7)) return 'thisWeek'
  return 'earlier'
}

export default function FeedScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
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
  const [userNeighborhood, setUserNeighborhood] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [discoveryTab, setDiscoveryTab] = useState<'events' | 'places'>('events')
  const [showNeighborhoodPicker, setShowNeighborhoodPicker] = useState(false)
  const lastScrollYRef = useRef(0)
  const offsetRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFetchLocationRef = useRef<{ latitude: number; longitude: number } | null>(null)

  // Fetch current user ID for like functionality
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [supabase])

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

  // Fetch followed user IDs + user neighborhood
  useEffect(() => {
    async function fetchFollowsAndProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: followsData }, { data: profileData }] = await Promise.all([
        supabase.from('user_follows').select('followed_id').eq('follower_id', user.id),
        (supabase.from('profiles') as any).select('naapurusto').eq('id', user.id).single(),
      ])
      if (followsData) setFollowedIds(followsData.map((f: any) => f.followed_id))
      if ((profileData as any)?.naapurusto) setUserNeighborhood((profileData as any).naapurusto)
    }
    fetchFollowsAndProfile()
  }, [supabase])

  // Real-time subscription for follows changes — scoped to current user
  useEffect(() => {
    if (!currentUserId) return
    const channel = supabase
      .channel('follows-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_follows',
        filter: `follower_id=eq.${currentUserId}`,
      }, () => {
        supabase.from('user_follows').select('followed_id').eq('follower_id', currentUserId)
          .then(({ data }) => {
            if (data) setFollowedIds(data.map((f: any) => f.followed_id))
          })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, currentUserId])

  // Fetch city events and nearby places
  const fetchExtraContent = useCallback(async () => {
    const lat = userLocation?.latitude ?? 60.1699
    const lng = userLocation?.longitude ?? 24.9384

    // Skip if location hasn't moved significantly (>500m)
    if (lastFetchLocationRef.current) {
      const dlat = lat - lastFetchLocationRef.current.latitude
      const dlng = lng - lastFetchLocationRef.current.longitude
      const dist = Math.sqrt(dlat * dlat + dlng * dlng) * 111000 // rough meters
      if (dist < 500) return
    }

    setExtraLoading(true)
    try {
      const [helsinkiEvents, placesData] = await Promise.all([
        fetchHelsinkiEvents().catch(() => []),
        fetchHelsinkiPlaces(lat, lng, 2000).catch(() => []),
      ])
      setCityEvents(helsinkiEvents.slice(0, 20))
      setNearbyPlaces(placesData.slice(0, 20))
      lastFetchLocationRef.current = { latitude: lat, longitude: lng }
    } catch {
      // Silently fail — discovery section won't show
    } finally {
      setExtraLoading(false)
    }
  }, [userLocation])

  useEffect(() => { prefetchHelsinkiEvents(); fetchExtraContent() }, [fetchExtraContent])

  const loadingRef = useRef(false)

  const fetchPosts = useCallback(async (reset = false) => {
    // Prevent overlapping pagination calls
    if (!reset && loadingRef.current) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    loadingRef.current = true

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

      // Batch-fetch liked/saved status to avoid N+1 queries in PostCard
      if (newPosts.length > 0 && currentUserId) {
        const postIds = newPosts.map(p => p.id)
        const [{ data: likedData }, { data: savedData }] = await Promise.all([
          supabase.from('post_likes').select('post_id').eq('user_id', currentUserId).in('post_id', postIds),
          supabase.from('saved_posts').select('post_id').eq('user_id', currentUserId).in('post_id', postIds),
        ])
        const likedSet = new Set((likedData ?? []).map((l: any) => l.post_id))
        const savedSet = new Set((savedData ?? []).map((s: any) => s.post_id))
        newPosts.forEach(p => {
          (p as any).is_liked = likedSet.has(p.id)
          ;(p as any).is_saved = savedSet.has(p.id)
        })
      }

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
      loadingRef.current = false
      if (!controller.signal.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [supabase, activeFilter, showFollowing, followedIds, t, currentUserId])

  // Ref to avoid stale closures in useFocusEffect and realtime callbacks
  const fetchPostsRef = useRef(fetchPosts)
  fetchPostsRef.current = fetchPosts

  useEffect(() => {
    setLoading(true)
    offsetRef.current = 0
    fetchPosts(true)
    return () => { abortRef.current?.abort() }
  }, [fetchPosts])

  // Realtime with 2s debounce — listen for INSERT, UPDATE, and DELETE
  useEffect(() => {
    const channel = supabase
      .channel('feed-new-posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => setHasNewPosts(true), 2000)
        } else if (payload.eventType === 'DELETE' || payload.eventType === 'UPDATE') {
          // Refresh to reflect changes
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => {
            offsetRef.current = 0
            fetchPostsRef.current(true)
          }, 1000)
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [supabase])

  // Fix 5: Auto-refresh feed when returning from another screen (e.g. create)
  // Uses fetchPostsRef to avoid stale closure with empty deps
  const focusCountRef = useRef(0)
  useFocusEffect(useCallback(() => {
    focusCountRef.current++
    if (focusCountRef.current > 1) {
      offsetRef.current = 0
      fetchPostsRef.current(true)
    }
  }, []))

  const handleRefresh = useCallback(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
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

  const handleNeighborhoodSelect = useCallback(async (nh: string) => {
    setUserNeighborhood(nh)
    setShowNeighborhoodPicker(false)
    if (currentUserId) {
      await (supabase.from('profiles') as any).update({ naapurusto: nh }).eq('id', currentUserId)
    }
    // Refresh content
    offsetRef.current = 0
    fetchPosts(true)
    fetchExtraContent()
  }, [supabase, currentUserId, fetchPosts, fetchExtraContent])

  const getCityEventName = useCallback((e: CityEvent) => {
    if (locale === 'en' && e.name_en) return e.name_en
    if (locale === 'sv' && e.name_sv) return e.name_sv
    return e.name_fi
  }, [locale])

  // Ref for posts to avoid renderPost depending on posts array
  const postsRef = useRef(posts)
  postsRef.current = posts

  // Time-based section breaks in feed — uses postsRef to avoid FlatList full re-render
  const renderPost = useCallback(({ item, index }: { item: Post; index: number }) => {
    const currentGroup = item.created_at ? getDateGroup(item.created_at) : ''
    const prevGroup = index > 0 && postsRef.current[index - 1]?.created_at ? getDateGroup(postsRef.current[index - 1].created_at!) : ''
    const showLabel = index === 0 || currentGroup !== prevGroup

    return (
      <View>
        {showLabel && currentGroup ? (
          <View style={styles.dateGroupLabel}>
            <View style={[styles.dateGroupLine, { backgroundColor: `${colors.border}88` }]} />
            <Text style={[styles.dateGroupText, { color: colors.mutedForeground }]}>{t(`feed.${currentGroup}`)}</Text>
            <View style={[styles.dateGroupLine, { backgroundColor: `${colors.border}88` }]} />
          </View>
        ) : null}
        <PostCard post={item} userLocation={userLocation} userId={currentUserId} />
      </View>
    )
  }, [userLocation, colors.mutedForeground, colors.border, t, currentUserId])

  // Event section with cascading fallback: today -> tomorrow -> this week (Fix 4)
  const { displayEvents, eventSectionTitle } = useMemo(() => {
    const todayEvts = cityEvents.filter(e => isToday(e.start_time))
    const tomorrowEvts = !todayEvts.length ? cityEvents.filter(e => isTomorrow(e.start_time)) : []
    const weekEvts = !todayEvts.length && !tomorrowEvts.length ? cityEvents.filter(e => isWithinDays(e.start_time, 7)) : []
    const display = todayEvts.length ? todayEvts : tomorrowEvts.length ? tomorrowEvts : weekEvts
    const title = todayEvts.length ? t('events.filterToday') + ' (' + todayEvts.length + ')'
      : tomorrowEvts.length ? t('feed.tomorrow') + ' (' + tomorrowEvts.length + ')'
      : weekEvts.length ? t('feed.thisWeek') + ' (' + weekEvts.length + ')' : ''
    return { displayEvents: display.slice(0, 1), eventSectionTitle: title }
  }, [cityEvents, t])

  // Places section contextual title (Fix 5)
  const placesSectionTitle = useMemo(() => {
    if (userLocation) return t('feed.placesNearYou')
    if (userNeighborhood) return t('feed.placesIn', { area: userNeighborhood })
    return t('feed.placesInHelsinki')
  }, [userLocation, userNeighborhood, t])

  const handleScroll = useCallback((event: any) => {
    lastScrollYRef.current = event.nativeEvent.contentOffset.y
  }, [])

  // ── List Header (now includes alerts + city events + nearby places + dynamic hero) ──
  const ListHeader = useMemo(() => (
    <View style={{ gap: 16 }}>
      {/* Alert banners — HSL disruptions + weather warnings */}
      <AlertBanner />

      {/* Dynamic hero: cascading event fallback (today -> tomorrow -> week) or welcome */}
      {displayEvents.length > 0 ? (
        <View style={{ gap: 10 }}>
          <View style={[styles.sectionHeader, { paddingHorizontal: 4 }]}>
            <View style={[styles.sectionBar, { backgroundColor: '#2B8A62' }]} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {eventSectionTitle}
            </Text>
          </View>
          {displayEvents.map((event) => {
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
      ) : !extraLoading ? (
        <View style={styles.sloganWrap}>
          <Text style={[styles.sloganBrand, { color: colors.primary }]}>TackBird</Text>
          <Text style={[styles.sloganText, { color: colors.mutedForeground }]}>{t('feed.slogan')}</Text>
        </View>
      ) : null}

      {/* ── Discovery Section: Combined Events + Places with tab toggle ── */}
      {extraLoading && cityEvents.length === 0 && nearbyPlaces.length === 0 ? (
        <View style={{ gap: 10 }}>
          <View style={[styles.sectionHeader, { paddingHorizontal: 4 }]}>
            <View style={[styles.sectionBar, { backgroundColor: '#3B7DD8' }]} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('nav.events')}</Text>
          </View>
          <HorizontalSkeleton colors={colors} width={160} height={140} />
        </View>
      ) : (cityEvents.length > 0 || nearbyPlaces.length > 0) ? (
        <View style={{ gap: 10 }}>
          {/* Tab chips row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
            <Pressable
              onPress={() => setDiscoveryTab('events')}
              style={[
                extraStyles.discoveryChip,
                discoveryTab === 'events'
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: isDark ? colors.card : colors.muted },
              ]}
            >
              <CalendarDays size={13} color={discoveryTab === 'events' ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[
                extraStyles.discoveryChipText,
                { color: discoveryTab === 'events' ? colors.primaryForeground : colors.mutedForeground },
              ]}>
                {t('nav.events')}
              </Text>
              {cityEvents.length > 0 && discoveryTab === 'events' && (
                <View style={[extraStyles.discoveryChipCount, { backgroundColor: `${colors.primaryForeground}30` }]}>
                  <Text style={[extraStyles.discoveryChipCountText, { color: colors.primaryForeground }]}>{cityEvents.length}</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => setDiscoveryTab('places')}
              style={[
                extraStyles.discoveryChip,
                discoveryTab === 'places'
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: isDark ? colors.card : colors.muted },
              ]}
            >
              <MapPin size={13} color={discoveryTab === 'places' ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[
                extraStyles.discoveryChipText,
                { color: discoveryTab === 'places' ? colors.primaryForeground : colors.mutedForeground },
              ]}>
                {t('places.places') || t('feed.placesNearYou')}
              </Text>
              {nearbyPlaces.length > 0 && discoveryTab === 'places' && (
                <View style={[extraStyles.discoveryChipCount, { backgroundColor: `${colors.primaryForeground}30` }]}>
                  <Text style={[extraStyles.discoveryChipCountText, { color: colors.primaryForeground }]}>{nearbyPlaces.length}</Text>
                </View>
              )}
            </Pressable>
            {/* Show All link */}
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => discoveryTab === 'events' ? router.push('/(tabs)/events') : router.push('/map')}
              hitSlop={8}
              style={extraStyles.showAllBtn}
            >
              <Text style={[extraStyles.showAllText, { color: colors.primary }]}>
                {discoveryTab === 'events' ? t('events.cityTab') : (t('nav.map') || 'Kartta')}
              </Text>
              <ChevronRight size={14} color={colors.primary} />
            </Pressable>
          </View>

          {/* Events carousel */}
          {discoveryTab === 'events' && cityEvents.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={172}
              contentContainerStyle={{ gap: 10, paddingHorizontal: 4, paddingBottom: 4 }}
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
                        <Globe size={20} color={catColor} />
                      </View>
                    )}
                    <View style={extraStyles.eventInfo}>
                      <Text style={[extraStyles.eventName, { color: colors.foreground }]} numberOfLines={2}>
                        {getCityEventName(event)}
                      </Text>
                      <View style={extraStyles.eventMeta}>
                        <CalendarDays size={10} color={colors.mutedForeground} />
                        <Text style={[extraStyles.eventDate, { color: colors.primary }]}>
                          {formatEventDateShort(event.start_time, locale)}
                        </Text>
                      </View>
                      {event.location_name && (
                        <View style={extraStyles.eventMeta}>
                          <MapPin size={10} color={colors.mutedForeground} />
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
                    <View style={extraStyles.eventChevron}>
                      <ChevronRight size={12} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
                    </View>
                  </Pressable>
                )
              })}
            </ScrollView>
          )}

          {/* Events empty state */}
          {discoveryTab === 'events' && cityEvents.length === 0 && (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.body, paddingHorizontal: 4 }}>
              {t('events.noEvents')}
            </Text>
          )}

          {/* Places carousel */}
          {discoveryTab === 'places' && nearbyPlaces.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 14, paddingHorizontal: 4, paddingBottom: 2 }}
            >
              {nearbyPlaces.slice(0, 6).map((place) => {
                const catColor = PLACE_COLORS[place.category] || '#95A5A6'
                const catLabel = t(PLACE_LABEL_KEYS[place.category] || 'common.other') || place.category
                const firstLetter = catLabel.charAt(0).toUpperCase()
                return (
                  <Pressable
                    key={place.id}
                    onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`)}
                    style={extraStyles.placeCompact}
                  >
                    <View style={[extraStyles.placeCircle, { backgroundColor: `${catColor}26` }]}>
                      <Text style={[extraStyles.placeCircleText, { color: catColor }]}>{firstLetter}</Text>
                    </View>
                    <Text style={[extraStyles.placeCompactName, { color: colors.foreground }]} numberOfLines={2}>
                      {place.name}
                    </Text>
                    <Text style={[extraStyles.placeCategoryLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {catLabel}
                    </Text>
                  </Pressable>
                )
              })}
              {nearbyPlaces.length > 6 && (
                <Pressable onPress={() => router.push('/map')} style={extraStyles.placeCompact}>
                  <View style={[extraStyles.placeCircle, { backgroundColor: colors.muted }]}>
                    <Text style={[extraStyles.placeCircleText, { color: colors.mutedForeground }]}>+{nearbyPlaces.length - 6}</Text>
                  </View>
                  <Text style={[extraStyles.placeCompactName, { color: colors.primary }]} numberOfLines={1}>
                    {t('feed.showAll')}
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          )}

          {/* Places empty state */}
          {discoveryTab === 'places' && nearbyPlaces.length === 0 && (
            <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.body, paddingHorizontal: 4 }}>
              {placesSectionTitle}
            </Text>
          )}
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

      {/* Section header — compact, no bar decoration */}
      <View style={styles.compactSectionHeader}>
        <Text style={[styles.compactSectionTitle, { color: colors.foreground }]}>{t('feed.latestListings')}</Text>
        {posts.length > 0 && !loading && (
          <View style={[styles.countBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.countText, { color: colors.mutedForeground }]}>{posts.length}</Text>
          </View>
        )}
      </View>
    </View>
  ), [displayEvents, eventSectionTitle, hasNewPosts, error, handleRefresh, isDark, colors, t, posts.length, loading, cityEvents, nearbyPlaces, extraLoading, getCityEventName, locale, router, placesSectionTitle, discoveryTab])

  // ── Empty / Cold Start ──
  const EmptyComponent = useMemo(() => {
    if (loading) {
      return (
        <View style={{ gap: 16 }}>
          {[0, 1, 2, 3].map(i => <PostCardSkeleton key={i} colors={colors} />)}
        </View>
      )
    }
    const areaLabel = userNeighborhood ?? 'Helsinki'
    return (
      <View style={styles.coldStart}>
        <BoardIllustration size={80} />
        <Text style={[styles.coldStartTitle, { color: colors.foreground }]}>{t('feed.noPosts')}</Text>
        <Text style={[styles.coldStartHint, { color: colors.mutedForeground }]}>
          {t('map.beFirstInArea', { area: areaLabel })}
        </Text>
        <Pressable
          onPress={() => router.push('/create')}
          style={[styles.coldStartBtn, { backgroundColor: colors.primary }]}
        >
          <Plus size={16} color={colors.primaryForeground} />
          <Text style={[styles.coldStartBtnText, { color: colors.primaryForeground }]}>{t('events.heroCreateCTA')}</Text>
        </Pressable>
      </View>
    )
  }, [loading, colors, t, router, userNeighborhood])

  // ── Footer: loading indicator + all loaded ──
  const FooterComponent = useMemo(() => {
    const sections: React.ReactNode[] = []

    // Loading indicator for paginated posts
    if (loading && posts.length > 0) {
      sections.push(
        <ActivityIndicator key="loader" size="small" color={colors.mutedForeground} style={{ marginVertical: 20 }} />
      )
    }

    // All loaded — clean minimal footer (Fix 8: only show when >= 10 posts)
    if (!hasMore && posts.length >= 10) {
      sections.push(
        <View key="all-loaded" style={styles.allLoadedWrap}>
          <View style={[styles.allLoadedLine, { backgroundColor: `${colors.border}66` }]} />
          <View style={styles.allLoadedContent}>
            <CheckCircle size={14} color={`${colors.mutedForeground}60`} />
            <Text style={[styles.allLoadedText, { color: `${colors.mutedForeground}80` }]}>{t('feed.allCaughtUp')}</Text>
          </View>
        </View>
      )
    }

    if (sections.length === 0) return null
    return <View style={{ paddingBottom: 12 }}>{sections}</View>
  }, [loading, hasMore, posts.length, colors, t])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Sticky filter bar — no scroll-hide animation */}
      <View style={[styles.filterWrapper, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {/* Fix 2 + Fix 3: Tappable city context — opens neighborhood picker */}
        <Pressable onPress={() => setShowNeighborhoodPicker(true)} style={styles.neighborhoodBtn} hitSlop={4}>
          <MapPin size={12} color={colors.mutedForeground} />
          <Text style={[styles.neighborhoodText, { color: colors.mutedForeground }]}>
            {userNeighborhood ? `Helsinki · ${userNeighborhood}` : 'Helsinki'}
          </Text>
          <ChevronDown size={12} color={colors.mutedForeground} style={{ opacity: 0.6 }} />
        </Pressable>
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
        contentContainerStyle={[styles.list, { paddingTop: 76 }]}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={EmptyComponent}
        ListFooterComponent={FooterComponent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        showsVerticalScrollIndicator={false}
      />

      {/* Neighborhood picker modal */}
      <Modal
        visible={showNeighborhoodPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNeighborhoodPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={nhStyles.modalHeader}>
            <Text style={[nhStyles.modalTitle, { color: colors.foreground }]}>
              {t('onboarding.neighborhoodTitle')}
            </Text>
            <Pressable onPress={() => setShowNeighborhoodPicker(false)} hitSlop={8}>
              <X size={24} color={colors.foreground} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={nhStyles.modalList}>
            {NEIGHBORHOODS.map(nh => (
              <Pressable
                key={nh}
                onPress={() => handleNeighborhoodSelect(nh)}
                style={[
                  nhStyles.modalItem,
                  {
                    backgroundColor: userNeighborhood === nh ? `${colors.primary}14` : 'transparent',
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <MapPin size={14} color={userNeighborhood === nh ? colors.primary : colors.mutedForeground} />
                <Text
                  style={[
                    nhStyles.modalItemText,
                    {
                      color: userNeighborhood === nh ? colors.primary : colors.foreground,
                      fontWeight: userNeighborhood === nh ? '600' : '400',
                    },
                  ]}
                >
                  {nh}
                </Text>
                {userNeighborhood === nh && <Check size={16} color={colors.primary} />}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const nhStyles = StyleSheet.create({
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5E5',
  },
  modalTitle: { fontSize: 18, fontFamily: fonts.headingSemi, letterSpacing: -0.18 },
  modalList: { paddingBottom: 40 },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalItemText: { fontSize: 15, fontFamily: fonts.body, flex: 1 },
})

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterWrapper: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
  },
  neighborhoodBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, alignSelf: 'flex-start' },
  neighborhoodText: { fontSize: 12, fontFamily: fonts.body },
  dateGroupLabel: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, paddingBottom: 10 },
  dateGroupLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateGroupText: { fontSize: 11, fontFamily: fonts.body, letterSpacing: 0.3 },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  filterRow: { paddingBottom: 0 },
  followingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    alignSelf: 'flex-start', minHeight: 36,
  },
  followingText: { fontSize: 12, fontWeight: '500' },
  sloganWrap: { alignItems: 'center', paddingVertical: 8, gap: 2 },
  sloganBrand: { fontSize: 20, fontFamily: fonts.heading, letterSpacing: 1.7 },
  sloganText: { fontSize: 13, fontFamily: fonts.body, textAlign: 'center' },
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
  compactSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  compactSectionTitle: { fontSize: 14, fontFamily: fonts.headingSemi, letterSpacing: -0.16, flex: 1 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countText: { fontSize: 11, fontWeight: '500' },
  coldStart: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32, gap: 12 },
  coldStartTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.18 },
  coldStartHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  coldStartBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8,
  },
  coldStartBtnText: { fontSize: 15, fontWeight: '600' },
  allLoadedWrap: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  allLoadedLine: { height: 1, width: '100%' },
  allLoadedContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  allLoadedText: { fontSize: 11, fontWeight: '500' },
})

const extraStyles = StyleSheet.create({
  // ── Section header link ──
  showAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
  },
  showAllText: { fontSize: 13, fontWeight: '600' },

  // ── Discovery tab chips ──
  discoveryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  discoveryChipText: { fontSize: 13, fontWeight: '600' },
  discoveryChipCount: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, marginLeft: 2,
  },
  discoveryChipCountText: { fontSize: 10, fontWeight: '700' },

  // ── City Event Card (Fix 3: smaller — 160px wide, 90px image) ──
  eventCard: {
    width: 160, borderRadius: 10, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  eventAccent: { height: 2 },
  eventImage: { width: '100%', height: 80 },
  eventImageFallback: {
    width: '100%', height: 80,
    alignItems: 'center', justifyContent: 'center',
  },
  eventInfo: { padding: 8, gap: 2 },
  eventName: { fontSize: 12, fontFamily: fonts.headingSemi, lineHeight: 15, letterSpacing: -0.16 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventDate: { fontSize: 11, fontFamily: fonts.body },
  eventLocation: { fontSize: 11, fontFamily: fonts.body, flex: 1 },
  freeBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
    alignSelf: 'flex-start', marginTop: 2,
  },
  freeText: { fontSize: 10, fontWeight: '600' },
  // Fix 4: Chevron hint for tappable event cards
  eventChevron: { position: 'absolute', bottom: 6, right: 6 },

  // ── Nearby Place Card (Fix 4: compact circles with name below) ──
  placeCompact: {
    width: 72, alignItems: 'center', gap: 6,
  },
  placeCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  placeCircleText: { fontSize: 20, fontWeight: '700' },
  placeCompactName: { fontSize: 11, fontFamily: fonts.body, textAlign: 'center', lineHeight: 14 },
  // Fix 7: Category label below place name
  placeCategoryLabel: { fontSize: 9, fontFamily: fonts.body, textAlign: 'center', lineHeight: 12 },
})
