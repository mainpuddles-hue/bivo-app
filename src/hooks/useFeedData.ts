import { useState, useCallback, useRef, useEffect } from 'react'
import { useFocusEffect } from 'expo-router'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSupabase } from '@/hooks/useSupabase'
import { POST_SELECT } from '@/lib/constants'
import { applyLocationAccuracy } from '@/lib/privacyUtils'
import { fetchHelsinkiEvents, prefetchHelsinkiEvents, setLinkedEventsBaseUrl } from '@/lib/linkedevents'
import { fetchHelsinkiPlaces } from '@/lib/palvelukartta'
import { useI18n } from '@/lib/i18n'
import { getSeedPosts } from '@/lib/seedContent'
import { rankFeed } from '@/lib/feedAlgorithm'
import { getCachedUserId } from '@/lib/authCache'
import type { Post, PostType, CityEvent, LocalPlace } from '@/lib/types'

export type { PostType }

const PAGE_SIZE = 20
const FEED_CACHE_KEY = 'tackbird_feed_cache'

export function useFeedData() {
  const { t } = useI18n()
  const supabase = useSupabase()

  // ── State ──
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
  const [userCityId, setUserCityId] = useState<string | null>(null)
  const [userCityName, setUserCityName] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showNeighborhoodPicker, setShowNeighborhoodPicker] = useState(false)
  const [cityNeighborhoods, setCityNeighborhoods] = useState<string[]>([])

  // ── Refs ──
  const offsetRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFetchLocationRef = useRef<{ latitude: number; longitude: number } | null>(null)
  const loadingRef = useRef(false)
  const focusCountRef = useRef(0)

  // Cache for personalization RPC — avoid calling on every feed refresh
  const personalizationCacheRef = useRef<{
    scores: Map<string, number>
    fetchedAt: number
  } | null>(null)
  const PERSONALIZATION_CACHE_TTL = 2 * 60 * 1000 // 2 minutes

  // Ref for posts to avoid renderPost depending on posts array
  const postsRef = useRef(posts)
  postsRef.current = posts

  // ── Load cached feed data on mount for instant display ──
  useEffect(() => {
    AsyncStorage.getItem(FEED_CACHE_KEY).then(cached => {
      if (cached && posts.length === 0) {
        try { setPosts(JSON.parse(cached)) } catch {}
      }
    }).catch(() => {})
  }, [])

  // ── Fetch current user ID for like functionality ──
  useEffect(() => {
    getCachedUserId().then(id => { if (id) setCurrentUserId(id) })
  }, [supabase])

  // ── Request location permission once, cache result ──
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

  // ── Fetch followed user IDs + user neighborhood + city ──
  useEffect(() => {
    async function fetchFollowsAndProfile() {
      const userId = await getCachedUserId()
      if (!userId) return
      const user = { id: userId }
      const [{ data: followsData }, { data: profileData }] = await Promise.all([
        supabase.from('user_follows').select('followed_id').eq('follower_id', user.id),
        (supabase.from('profiles') as any).select('naapurusto, city_id').eq('id', user.id).single(),
      ])
      if (followsData) setFollowedIds(followsData.map((f: any) => f.followed_id))
      if ((profileData as any)?.naapurusto) setUserNeighborhood((profileData as any).naapurusto)
      const cityId = (profileData as any)?.city_id ?? 'helsinki'
      setUserCityId(cityId)
      // Fetch city details (name + linkedevents URL) and neighborhoods
      try {
        const [{ data: cityData }, { data: nhData }] = await Promise.all([
          supabase.from('cities').select('name, linkedevents_url').eq('id', cityId).single(),
          supabase.from('city_neighborhoods').select('name').eq('city_id', cityId).order('name'),
        ])
        if (cityData) {
          setUserCityName((cityData as any).name ?? null)
          setLinkedEventsBaseUrl((cityData as any).linkedevents_url ?? null)
        }
        if (nhData && nhData.length > 0) {
          setCityNeighborhoods((nhData as any[]).map((n: any) => n.name))
        }
      } catch {
        // City table may not exist yet — silently continue with Helsinki defaults
      }
    }
    fetchFollowsAndProfile()
  }, [supabase])

  // Follows are refreshed on pull-to-refresh (no realtime channel needed)

  // ── Fetch city events and nearby places ──
  const fetchExtraContent = useCallback(async () => {
    // Compute inside callback to avoid stale closure over render-time constants
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

  // ── Fetch posts ──
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

      // Apply location privacy based on user's location_accuracy setting
      newPosts.forEach(p => {
        const accuracy = (p.user as any)?.location_accuracy
        if (accuracy && accuracy !== 'exact') {
          const result = applyLocationAccuracy(accuracy, p.latitude, p.longitude, p.location)
          ;(p as any).latitude = result.latitude
          ;(p as any).longitude = result.longitude
          ;(p as any).location = result.location
        }
      })

      // Fetch personalization scores (cached for 2 minutes to avoid expensive RPC on every refresh)
      let personalScores = new Map<string, number>()
      if (currentUserId) {
        const cached = personalizationCacheRef.current
        if (cached && (Date.now() - cached.fetchedAt) < PERSONALIZATION_CACHE_TTL) {
          personalScores = cached.scores
        } else {
          try {
            const { data: scores } = await (supabase.rpc as any)('get_personalized_feed', {
              p_user_id: currentUserId,
              p_limit: 50,
              p_offset: 0,
            })
            if (scores) {
              for (const s of scores as any[]) {
                personalScores.set(s.post_id, s.personalization_score ?? 0)
              }
              personalizationCacheRef.current = { scores: personalScores, fetchedAt: Date.now() }
            }
          } catch {
            // Personalization unavailable — continue with default ranking
          }
        }
      }

      // Client-side relevance ranking
      const ranked = rankFeed(newPosts, {
        userNeighborhood: userNeighborhood ?? null,
        followedIds,
        personalScores,
      })

      if (reset) {
        if (ranked.length === 0) {
          // Show seed content for empty neighborhoods
          const seeds = getSeedPosts(userNeighborhood ?? 'Helsinki') as Post[]
          setPosts(seeds)
        } else {
          setPosts(ranked)
          // Cache the first 20 posts for offline/instant display on next launch
          AsyncStorage.setItem(FEED_CACHE_KEY, JSON.stringify(ranked.slice(0, 20))).catch(() => {})
        }
        offsetRef.current = newPosts.length
      } else {
        setPosts(prev => {
          const ids = new Set(prev.map(p => p.id))
          const unique = ranked.filter(p => !ids.has(p.id))
          return [...prev, ...unique]
        })
        offsetRef.current = offset + newPosts.length
      }
      setHasMore(newPosts.length >= PAGE_SIZE)
    } catch (err: any) {
      if (!controller.signal.aborted) {
        const isOffline = err?.message?.includes('Network') || err?.message?.includes('fetch') || err?.code === 'NETWORK_ERROR'
        setError(isOffline ? t('feed.offlineError') : t('feed.loadError'))
      }
    } finally {
      loadingRef.current = false
      if (!controller.signal.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [supabase, activeFilter, showFollowing, followedIds, t, currentUserId, userNeighborhood])

  // Ref to avoid stale closures in useFocusEffect and realtime callbacks
  const fetchPostsRef = useRef(fetchPosts)
  fetchPostsRef.current = fetchPosts

  useEffect(() => {
    setLoading(true)
    offsetRef.current = 0
    fetchPosts(true)
    return () => { abortRef.current?.abort() }
  }, [fetchPosts])

  // ── Realtime with 5s debounce — INSERT only (UPDATE/DELETE refresh on pull-to-refresh) ──
  useEffect(() => {
    const channel = supabase
      .channel('feed-new-posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => setHasNewPosts(true), 5000)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [supabase])

  // ── Auto-refresh feed when returning from another screen (e.g. create) ──
  // Uses fetchPostsRef to avoid stale closure with empty deps
  useFocusEffect(useCallback(() => {
    focusCountRef.current++
    if (focusCountRef.current > 1) {
      offsetRef.current = 0
      fetchPostsRef.current(true)
    }
  }, []))

  // ── Actions ──
  const handleRefresh = useCallback(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
    setRefreshing(true)
    setHasNewPosts(false)
    offsetRef.current = 0
    // Refresh follows on pull-to-refresh (replaces realtime channel)
    if (currentUserId) {
      supabase.from('user_follows').select('followed_id').eq('follower_id', currentUserId)
        .then(({ data }) => { if (data) setFollowedIds(data.map((f: any) => f.followed_id)) })
    }
    fetchPosts(true)
    fetchExtraContent()
  }, [fetchPosts, fetchExtraContent, currentUserId, supabase])

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

  return {
    // Posts
    posts,
    loading,
    refreshing,
    hasMore,
    hasNewPosts,
    error,
    activeFilter,
    showFollowing,

    // Actions
    handleRefresh,
    handleLoadMore,
    handleFilterChange,
    setShowFollowing,

    // User
    currentUserId,
    followedIds,
    userLocation,
    userNeighborhood,
    userCityId,
    userCityName,

    // Discovery
    cityEvents,
    nearbyPlaces,
    extraLoading,
    // Neighborhood
    showNeighborhoodPicker,
    setShowNeighborhoodPicker,
    handleNeighborhoodSelect,
    cityNeighborhoods,

    // Refs
    postsRef,
  }
}
