import { useState, useCallback, useRef, useEffect } from 'react'
import { useFocusEffect } from 'expo-router'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { useSupabase } from '@/hooks/useSupabase'
import { POST_SELECT } from '@/lib/constants'
import { applyLocationAccuracy } from '@/lib/privacyUtils'
import { fetchHelsinkiEvents } from '@/lib/linkedevents'
import { fetchHelsinkiPlaces } from '@/lib/palvelukartta'
import { useI18n } from '@/lib/i18n'
import { getSeedPosts } from '@/lib/seedContent'
import { rankFeed } from '@/lib/feedAlgorithm'
import { getCachedUserId } from '@/lib/cachedAuth'
import type { Post, PostType, CityEvent, LocalPlace } from '@/lib/types'

export type { PostType }

const PAGE_SIZE = 20

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showNeighborhoodPicker, setShowNeighborhoodPicker] = useState(false)

  // ── Refs ──
  const offsetRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFetchLocationRef = useRef<{ latitude: number; longitude: number } | null>(null)
  const loadingRef = useRef(false)
  const focusCountRef = useRef(0)
  const realtimeInitRef = useRef(false)
  const extraContentFetchedRef = useRef(false)

  // Ref for posts to avoid renderPost depending on posts array
  const postsRef = useRef(posts)
  postsRef.current = posts

  // ── PERF: Single auth call + parallel profile/follows fetch ──
  useEffect(() => {
    let cancelled = false
    async function init() {
      const userId = await getCachedUserId(supabase)
      if (cancelled || !userId) return
      setCurrentUserId(userId)

      // Parallel: fetch follows + profile in one go
      const [{ data: followsData }, { data: profileData }] = await Promise.all([
        supabase.from('user_follows').select('followed_id').eq('follower_id', userId),
        (supabase.from('profiles') as any).select('naapurusto').eq('id', userId).single(),
      ])
      if (cancelled) return
      if (followsData) setFollowedIds(followsData.map((f: any) => f.followed_id))
      if ((profileData as any)?.naapurusto) setUserNeighborhood((profileData as any).naapurusto)
    }
    init()
    return () => { cancelled = true }
  }, [supabase])

  // ── PERF: Defer location request — non-blocking, runs in background ──
  useEffect(() => {
    let cancelled = false
    // Defer location by 1s to not block initial render
    const timer = setTimeout(async () => {
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
    }, 1000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [])

  // ── PERF: Defer realtime subscriptions until after initial data loads ──
  useEffect(() => {
    if (!currentUserId || !realtimeInitRef.current) return
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

  // ── PERF: Defer external API calls until after first feed render ──
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

      // PERF: Batch-fetch liked/saved in parallel (non-blocking for initial render)
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

      // PERF: Rank with basic scoring first (no personalization), show immediately
      const ranked = rankFeed(newPosts, {
        userNeighborhood: userNeighborhood ?? null,
        followedIds,
      })

      if (reset) {
        if (ranked.length === 0) {
          // Show seed content for empty neighborhoods
          const seeds = getSeedPosts(userNeighborhood ?? 'Helsinki') as Post[]
          setPosts(seeds)
        } else {
          setPosts(ranked)
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

      // PERF: Defer personalization RPC — re-rank after it completes (non-blocking)
      if (currentUserId && reset && newPosts.length > 0) {
        deferPersonalization(newPosts, controller)
      }

      // PERF: After first successful load, enable realtime and fetch extra content
      if (reset && !realtimeInitRef.current) {
        realtimeInitRef.current = true
        // Defer external API calls by 2s after first render
        if (!extraContentFetchedRef.current) {
          extraContentFetchedRef.current = true
          setTimeout(() => { fetchExtraContent() }, 2000)
        }
      }
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
  }, [supabase, activeFilter, showFollowing, followedIds, t, currentUserId, userNeighborhood, fetchExtraContent])

  // PERF: Deferred personalization — runs after posts are already shown
  const deferPersonalization = useCallback(async (shownPosts: Post[], controller: AbortController) => {
    try {
      const { data: scores } = await (supabase.rpc as any)('get_personalized_feed', {
        p_user_id: currentUserId,
        p_limit: 50,
        p_offset: 0,
      })
      if (controller.signal.aborted || !scores) return
      const personalScores = new Map<string, number>()
      for (const s of scores as any[]) {
        personalScores.set(s.post_id, s.personalization_score ?? 0)
      }
      // Re-rank with personalization scores
      const reranked = rankFeed(shownPosts, {
        userNeighborhood: userNeighborhood ?? null,
        followedIds,
        personalScores,
      })
      if (!controller.signal.aborted) {
        setPosts(reranked)
      }
    } catch {
      // Personalization unavailable — keep default ranking
    }
  }, [supabase, currentUserId, userNeighborhood, followedIds])

  // Ref to avoid stale closures in useFocusEffect and realtime callbacks
  const fetchPostsRef = useRef(fetchPosts)
  fetchPostsRef.current = fetchPosts

  useEffect(() => {
    setLoading(true)
    offsetRef.current = 0
    fetchPosts(true)
    return () => { abortRef.current?.abort() }
  }, [fetchPosts])

  // ── PERF: Defer realtime subscription until after first load ──
  useEffect(() => {
    if (!realtimeInitRef.current) return
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
  }, [supabase, loading]) // re-subscribe when loading changes (first load triggers realtimeInitRef)

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

    // Discovery
    cityEvents,
    nearbyPlaces,
    extraLoading,
    // Neighborhood
    showNeighborhoodPicker,
    setShowNeighborhoodPicker,
    handleNeighborhoodSelect,

    // Refs
    postsRef,
  }
}
