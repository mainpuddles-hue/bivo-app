import { useState, useCallback, useRef, useEffect } from 'react'
import { useFocusEffect } from 'expo-router'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSupabase } from '@/hooks/useSupabase'
import { useFeedLocation } from '@/hooks/feed/useFeedLocation'
import { POST_SELECT } from '@/lib/constants'
import { applyLocationAccuracy } from '@/lib/privacyUtils'
import { fetchHelsinkiEvents, prefetchHelsinkiEvents, setLinkedEventsBaseUrl } from '@/lib/linkedevents'
import { fetchHelsinkiPlaces } from '@/lib/palvelukartta'
import { useI18n } from '@/lib/i18n'
import { getSeedPosts } from '@/lib/seedContent'
import { rankFeed } from '@/lib/feedAlgorithm'
import { getCachedUserId } from '@/lib/authCache'
import { FEATURES } from '@/lib/featureFlags'
import { haversineKm } from '@/lib/geo'
import type { Post, PostType, CityEvent, LocalPlace } from '@/lib/types'

export type FeedSortBy = 'recommended' | 'newest' | 'popular' | 'nearest' | 'cheapest'

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
  const [preferredTypes, setPreferredTypes] = useState<string[]>([])

  // On first mount, load user's onboarding purpose preferences.
  // - Single purpose: pre-filter feed to it (user can still change)
  // - Multiple purposes: use as gentle ranking boost (1.15x) in rankFeed
  useEffect(() => {
    let mounted = true
    AsyncStorage.getItem('onboarding_purposes').then(raw => {
      if (!mounted || !raw) return
      try {
        const purposes = JSON.parse(raw) as string[]
        if (Array.isArray(purposes)) {
          setPreferredTypes(purposes)
          if (purposes.length === 1) {
            setActiveFilter(purposes[0] as PostType)
          }
        }
      } catch {}
    }).catch(() => {})
    return () => { mounted = false }
  }, [])
  const [sortBy, setSortBy] = useState<FeedSortBy>('recommended')
  const [hasMore, setHasMore] = useState(true)
  const [hasNewPosts, setHasNewPosts] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFollowing, setShowFollowing] = useState(false)
  const [followedIds, setFollowedIds] = useState<string[]>([])
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([])
  const [nearbyPlaces, setNearbyPlaces] = useState<LocalPlace[]>([])
  const [extraLoading, setExtraLoading] = useState(true)
  const userLocation = useFeedLocation()
  const [userNeighborhood, setUserNeighborhood] = useState<string | null>(null)
  const [userCityId, setUserCityId] = useState<string | null>(null)
  const [userCityName, setUserCityName] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showNeighborhoodPicker, setShowNeighborhoodPicker] = useState(false)
  const [cityNeighborhoods, setCityNeighborhoods] = useState<string[]>([])
  const [communityCards, setCommunityCards] = useState<{
    event: any | null
    group: any | null
    thread: any | null
  }>({ event: null, group: null, thread: null })

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
    let mounted = true
    AsyncStorage.getItem(FEED_CACHE_KEY).then(cached => {
      if (mounted && cached && posts.length === 0) {
        try { setPosts(JSON.parse(cached)) } catch {} // Intentional: corrupted cache
      }
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  // ── Fetch current user ID for like functionality ──
  useEffect(() => {
    let mounted = true
    getCachedUserId().then(id => { if (mounted && id) setCurrentUserId(id) }).catch(() => {})
    return () => { mounted = false }
  }, [supabase])

  // Location is handled by useFeedLocation() hook above

  // ── Fetch followed user IDs + user neighborhood + city ──
  useEffect(() => {
    let mounted = true
    async function fetchFollowsAndProfile() {
      const userId = await getCachedUserId()
      if (!userId || !mounted) return
      const user = { id: userId }
      const [{ data: followsData }, { data: profileData }] = await Promise.all([
        supabase.from('user_follows').select('followed_id').eq('follower_id', user.id),
        (supabase.from('profiles') as any).select('naapurusto, city_id').eq('id', user.id).maybeSingle(),
      ])
      if (!mounted) return
      if (followsData) setFollowedIds(followsData.map((f: any) => f.followed_id))
      if ((profileData as any)?.naapurusto) setUserNeighborhood((profileData as any).naapurusto)
      const cityId = (profileData as any)?.city_id ?? 'helsinki'
      setUserCityId(cityId)
      // Fetch city details (name + linkedevents URL) and neighborhoods
      try {
        const [{ data: cityData }, { data: nhData }] = await Promise.all([
          supabase.from('cities').select('name, linkedevents_url').eq('id', cityId).maybeSingle(),
          supabase.from('city_neighborhoods').select('name').eq('city_id', cityId).order('name'),
        ])
        if (!mounted) return
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
    return () => { mounted = false }
  }, [supabase])

  // Follows are refreshed on pull-to-refresh (no realtime channel needed)

  // ── Fetch city events and nearby places ──
  const fetchExtraContent = useCallback(async () => {
    // Compute inside callback to avoid stale closure over render-time constants
    const lat = userLocation?.latitude ?? 60.1699
    const lng = userLocation?.longitude ?? 24.9384

    // ── Community cards (independent of location — fetch every time) ──
    // Runs BEFORE the location-skip guard so refreshes always get fresh
    // community content even when the user hasn't moved.
    const [eventRes, groupRes, threadRes] = await Promise.allSettled([
      supabase
        .from('community_events')
        .select('id, title, event_date, max_participants, category, image_url')
        .eq('is_active', true)
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('groups')
        .select('id, name, member_count, category')
        .order('member_count', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('forum_posts')
        .select('id, title, upvote_count, comment_count')
        .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        .order('upvote_count', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    setCommunityCards({
      event: eventRes.status === 'fulfilled' ? eventRes.value.data : null,
      group: groupRes.status === 'fulfilled' ? groupRes.value.data : null,
      thread: threadRes.status === 'fulfilled' ? threadRes.value.data : null,
    })

    // Skip location-dependent fetches if location hasn't moved significantly (>500m)
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
  }, [userLocation, supabase])

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
        .or('expires_at.is.null,expires_at.gte.now()')
        .order('is_pro_listing', { ascending: false })

      // Apply sort order based on sortBy state
      if (sortBy === 'popular') {
        query = query.order('like_count', { ascending: false })
      } else if (sortBy === 'cheapest') {
        query = query.order('service_price', { ascending: true, nullsFirst: false })
      } else {
        // 'recommended', 'newest', and 'nearest' all fetch by created_at (recommended + nearest sort client-side)
        query = query.order('created_at', { ascending: false })
      }

      query = query.range(offset, offset + PAGE_SIZE - 1)

      if (activeFilter) query = query.eq('type', activeFilter)
      if (showFollowing && followedIds.length > 0) {
        query = query.in('user_id', followedIds)
      }

      // Hide disabled category types from feed
      const hiddenTypes: string[] = []
      if (!FEATURES.LENDING) hiddenTypes.push('lainaa')
      if (hiddenTypes.length > 0 && !activeFilter) {
        query = query.not('type', 'in', `(${hiddenTypes.join(',')})`)
      }

      const { data, error: fetchError } = await query
      if (controller.signal.aborted) return
      if (fetchError) { setError(t('feed.loadError')); return }

      let newPosts = (data ?? []) as unknown as Post[]
      const dbRowCount = newPosts.length // Track DB count before client-side filtering

      // Filter out posts from blocked users
      if (currentUserId) {
        try {
          const { data: blockedData } = await supabase
            .from('blocked_users')
            .select('blocked_id')
            .eq('blocker_id', currentUserId)
          const blockedIds = new Set((blockedData ?? []).map((b: any) => b.blocked_id))
          if (blockedIds.size > 0) {
            newPosts = newPosts.filter(p => !blockedIds.has(p.user_id))
          }
        } catch {
          // blocked_users table may not exist yet — continue without filtering
        }
      }

      // Batch-fetch liked/saved status to avoid N+1 queries in PostCard
      if (newPosts.length > 0 && currentUserId) {
        const postIds = newPosts.map(p => p.id)
        const [likedSettled, savedSettled] = await Promise.allSettled([
          supabase.from('post_likes').select('post_id').eq('user_id', currentUserId).in('post_id', postIds),
          supabase.from('saved_posts').select('post_id').eq('user_id', currentUserId).in('post_id', postIds),
        ])
        const { data: likedData } = likedSettled.status === 'fulfilled' ? likedSettled.value : { data: null }
        const { data: savedData } = savedSettled.status === 'fulfilled' ? savedSettled.value : { data: null }
        const likedSet = new Set((likedData ?? []).map((l: any) => l.post_id))
        const savedSet = new Set((savedData ?? []).map((s: any) => s.post_id))
        newPosts.forEach(p => {
          (p as any).is_liked = likedSet.has(p.id)
          ;(p as any).is_saved = savedSet.has(p.id)
        })
      }

      // Fetch active boosts for these posts
      let boostedPostIds = new Set<string>()
      if (newPosts.length > 0) {
        try {
          const postIds = newPosts.map(p => p.id)
          const { data: boosts } = await supabase
            .from('post_boosts')
            .select('post_id')
            .in('post_id', postIds)
            .eq('is_active', true)
            .lte('boost_start', new Date().toISOString())
            .gte('boost_end', new Date().toISOString())
          if (boosts) {
            boostedPostIds = new Set(boosts.map((b: any) => b.post_id))
            newPosts.forEach(p => {
              (p as any).is_boosted = boostedPostIds.has(p.id)
            })
          }
        } catch {
          // post_boosts table may not exist yet — continue without boost data
        }
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

      // Tag boosted posts regardless of sort mode
      // (is_liked / is_saved already tagged above; is_boosted tagged in boost fetch)

      // Client-side relevance ranking — only apply for 'recommended' (default sort)
      // 'newest' keeps pure chronological DB order; other sorts also keep DB order
      let ranked: Post[]
      if (sortBy === 'recommended') {
        ranked = rankFeed(newPosts, {
          userNeighborhood: userNeighborhood ?? null,
          followedIds,
          personalScores,
          boostedPostIds,
          preferredTypes,
        })
      } else if (sortBy === 'nearest' && userLocation) {
        // Client-side distance sort
        const { latitude: uLat, longitude: uLng } = userLocation
        ranked = [...newPosts].sort((a, b) => {
          const distA = a.latitude != null && a.longitude != null
            ? haversineKm(uLat, uLng, a.latitude, a.longitude)
            : Infinity
          const distB = b.latitude != null && b.longitude != null
            ? haversineKm(uLat, uLng, b.latitude, b.longitude)
            : Infinity
          return distA - distB
        })
      } else {
        // newest / popular / cheapest: keep DB sort order
        ranked = newPosts
      }

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
        offsetRef.current = dbRowCount // Use DB count, not filtered count
      } else {
        setPosts(prev => {
          const ids = new Set(prev.map(p => p.id))
          const unique = ranked.filter(p => !ids.has(p.id))
          return [...prev, ...unique]
        })
        offsetRef.current = offset + dbRowCount // Use DB count, not filtered count
      }
      setHasMore(dbRowCount >= PAGE_SIZE)
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
  }, [supabase, activeFilter, sortBy, showFollowing, followedIds, t, currentUserId, userNeighborhood, userLocation])

  // Ref to avoid stale closures in useFocusEffect and realtime callbacks
  const fetchPostsRef = useRef(fetchPosts)
  fetchPostsRef.current = fetchPosts

  // Trigger initial fetch and re-fetch when filters/sort change.
  // Uses a version counter instead of depending on fetchPosts identity
  // to avoid cascading re-fetches when user state (location, follows, etc.) updates.
  const fetchVersionRef = useRef(0)
  useEffect(() => {
    fetchVersionRef.current++
    setLoading(true)
    offsetRef.current = 0
    fetchPostsRef.current(true)
    return () => { abortRef.current?.abort() }
  }, [activeFilter, sortBy, showFollowing]) // Only re-fetch when user explicitly changes filters

  // ── Realtime with 5s debounce — INSERT only, filtered to active posts ──
  useEffect(() => {
    const channel = supabase
      .channel('feed-new-posts')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'posts',
        filter: 'is_active=eq.true',
      }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => setHasNewPosts(true), 5000)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [supabase])

  // ── Auto-refresh feed when returning from another screen (e.g. create, profile) ──
  // Uses fetchPostsRef to avoid stale closure with empty deps
  // Also refreshes followedIds so the "Following" filter stays in sync after follow/unfollow
  const currentUserIdRef = useRef(currentUserId)
  currentUserIdRef.current = currentUserId
  useFocusEffect(useCallback(() => {
    focusCountRef.current++
    if (focusCountRef.current > 1) {
      offsetRef.current = 0
      fetchPostsRef.current(true)
      // Refresh followedIds to sync after follow/unfollow on profile screens
      const uid = currentUserIdRef.current
      if (uid) {
        Promise.resolve(supabase.from('user_follows').select('followed_id').eq('follower_id', uid))
          .then(({ data }) => { if (data) setFollowedIds(data.map((f: any) => f.followed_id)) })
          .catch(() => {})
      }
    }
  }, [supabase]))

  // ── Actions ──
  const handleRefresh = useCallback(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
    setRefreshing(true)
    setHasNewPosts(false)
    offsetRef.current = 0
    // Refresh follows on pull-to-refresh (replaces realtime channel)
    if (currentUserId) {
      Promise.resolve(supabase.from('user_follows').select('followed_id').eq('follower_id', currentUserId))
        .then(({ data }) => { if (data) setFollowedIds(data.map((f: any) => f.followed_id)) })
        .catch(() => {})
    }
    fetchPosts(true) // fetchPosts handles setRefreshing(false) in its finally block
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

  const handleSortChange = useCallback((sort: FeedSortBy) => {
    setSortBy(sort)
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
    sortBy,
    showFollowing,

    // Actions
    handleRefresh,
    handleLoadMore,
    handleFilterChange,
    handleSortChange,
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
    // Community
    communityCards,
    // Neighborhood
    showNeighborhoodPicker,
    setShowNeighborhoodPicker,
    handleNeighborhoodSelect,
    cityNeighborhoods,

    // Refs
    postsRef,
  }
}
