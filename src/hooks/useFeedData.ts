import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useFocusEffect } from 'expo-router'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { createClient } from '@/lib/supabase/client'
import { POST_SELECT } from '@/lib/constants'
import { fetchHelsinkiEvents, prefetchHelsinkiEvents } from '@/lib/linkedevents'
import { fetchHelsinkiPlaces } from '@/lib/palvelukartta'
import { useI18n } from '@/lib/i18n'
import { getSeedPosts } from '@/lib/seedContent'
import type { Post, PostType, CityEvent, LocalPlace } from '@/lib/types'

export type { PostType }

const PAGE_SIZE = 20

export function useFeedData() {
  const { t } = useI18n()
  const supabase = useMemo(() => createClient(), [])

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

  // Ref for posts to avoid renderPost depending on posts array
  const postsRef = useRef(posts)
  postsRef.current = posts

  // ── Fetch current user ID for like functionality ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
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

  // ── Fetch followed user IDs + user neighborhood ──
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

  // ── Real-time subscription for follows changes — scoped to current user ──
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

  // ── Fetch city events and nearby places ──
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

      if (reset) {
        if (newPosts.length === 0) {
          // Show seed content for empty neighborhoods
          const seeds = getSeedPosts(userNeighborhood ?? 'Helsinki') as Post[]
          setPosts(seeds)
        } else {
          setPosts(newPosts)
        }
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

  // ── Realtime with 2s debounce — listen for INSERT, UPDATE, and DELETE ──
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
