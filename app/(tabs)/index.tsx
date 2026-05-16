import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, ScrollView, ActionSheetIOS, Alert, Platform, useWindowDimensions } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sparkles, RefreshCw, Plus, Search, CheckCircle, X as XIcon, Map, LayoutGrid, ChevronRight, Bell } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { PressableOpacity, MagneticPressable } from '@/components/ui'
import { BoardIllustration } from '@/components/illustrations'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useFeedData, type FeedSortBy } from '@/hooks/useFeedData'
import { useInteractionTracker } from '@/hooks/useInteractionTracker'
import { usePresence } from '@/hooks/usePresence'
import { useSessionManager } from '@/hooks/useSessionManager'
import { useToast } from '@/components/Toast'
import { FilterBar } from '@/components/FilterBar'
import { PostCardGrid } from '@/components/PostCardGrid'
import { AdCard, type Ad } from '@/components/AdCard'
import { AlertBanner } from '@/components/AlertBanner'
import { PostCardSkeleton, FeedLoadMoreSkeleton, FadeIn } from '@/components/SkeletonLoaders'
import { NeighborhoodPicker } from '@/components/NeighborhoodPicker'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { EmptyState } from '@/components/EmptyState'
import { OnboardingOverlay } from '@/components/OnboardingOverlay'
import { WeeklyPopularCarousel } from '@/components/WeeklyPopularCarousel'
import { EventHeroCarousel } from '@/components/EventHeroCarousel'
import { FeedMapView } from '@/components/FeedMapView'
import { useSupabase } from '@/hooks/useSupabase'
import { FEATURES } from '@/lib/featureFlags'
import { PollCard, type Poll } from '@/components/PollCard'
import type { Post, PostType, CommunityEvent } from '@/lib/types'
import { CATEGORIES } from '@/lib/constants'

type FeedItem =
  | { _kind: 'section'; key: string; categoryType: PostType; posts: Post[] }
  | { _kind: 'gridRow'; key: string; posts: Post[] }
  | { _kind: 'sortRow'; key: string; count: number }
  | { _kind: 'ad'; key: string; ad: Ad }
  | { _kind: 'eyebrow'; key: string; label: string }

function FeedScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ openNeighborhoodPicker?: string }>()
  const toast = useToast()
  const welcomeShownRef = useRef(false)

  const feed = useFeedData()
  const { trackInteraction } = useInteractionTracker(feed.currentUserId)
  const { onlineCount } = usePresence(feed.currentUserId, feed.userNeighborhood)
  useSessionManager(feed.currentUserId)

  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const supabase = useSupabase()
  const { width: screenWidth } = useWindowDimensions()

  // ── Onboarding overlay ──
  const [showOnboarding, setShowOnboarding] = useState(false)
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('bivo_onboarding_completed'),
      AsyncStorage.getItem('onboarding_complete'),
    ]).then(([overlayFlag, layoutFlag]) => {
      if (!overlayFlag && !layoutFlag) setShowOnboarding(true)
    }).catch((e) => { if (__DEV__) console.warn('Onboarding flag check failed:', e) })
  }, [])

  // Weekly active neighbors count for activity meter
  const [weeklyActiveCount, setWeeklyActiveCount] = useState(0)
  useEffect(() => {
    if (!feed.userNeighborhood) return
    let mounted = true
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    Promise.resolve(
      supabase
        .from('posts')
        .select('user_id')
        .eq('is_active', true)
        .gte('created_at', weekAgo)
        .limit(200)
    ).then(({ data, error }: any) => {
      if (!mounted) return
      if (error) { if (__DEV__) console.warn('[feed] weekly active count failed:', error.message); return }
      if (!data) return
      const uniqueUsers = new Set((data as any[]).map((r: any) => r.user_id))
      setWeeklyActiveCount(uniqueUsers.size)
    }).catch((err: any) => { if (__DEV__) console.warn('[feed] weekly active error:', err) })
    return () => { mounted = false }
  }, [feed.userNeighborhood, supabase])

  // Batch view counts for feed cards — stabilize deps to avoid re-firing on every render
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({})
  const postIdKey = useMemo(() => feed.posts.map(p => p.id).join(','), [feed.posts])
  useEffect(() => {
    if (!postIdKey) return
    let mounted = true
    const postIds = postIdKey.split(',')
    ;(supabase.rpc as any)('get_post_view_counts_batch', { p_post_ids: postIds })
      .then(({ data, error }: any) => {
        if (!mounted) return
        if (error) { if (__DEV__) console.warn('[feed] view counts RPC failed:', error.message); return }
        if (!data) return
        const map: Record<string, number> = {}
        for (const row of data) map[row.post_id] = row.view_count
        setViewCounts(map)
      })
      .catch((err: any) => { if (__DEV__) console.warn('[feed] view counts error:', err) })
    return () => { mounted = false }
  }, [postIdKey, supabase])

  // Inline events — fetch 3 upcoming events to inject into feed
  const [inlineEvents, setInlineEvents] = useState<Post[]>([])
  useEffect(() => {
    let mounted = true
    const now = new Date().toISOString()
    Promise.resolve(
      supabase
        .from('events')
        .select('id, title, event_date, location_name, creator_id')
        .gte('event_date', now)
        .order('event_date', { ascending: true })
        .limit(3)
    ).then(({ data, error }: any) => {
      if (!mounted) return
      if (error) { if (__DEV__) console.warn('[feed] inline events failed:', error.message); return }
      if (!data || data.length === 0) return
      const eventPosts: Post[] = (data as any[]).map(e => ({
        id: `event-${e.id}`,
        user_id: e.creator_id ?? '',
        title: e.title,
        description: null,
        type: 'tapahtuma' as const,
        location: e.location_name,
        event_date: e.event_date,
        image_url: null,
        created_at: e.event_date,
        like_count: 0,
        is_liked: false,
        is_anonymous: false,
        is_urgent: false,
        is_boosted: false,
        service_price: null,
        daily_fee: null,
        expires_at: null,
      })) as any
      setInlineEvents(eventPosts)
    }).catch((err: any) => { if (__DEV__) console.warn('[feed] inline events error:', err) })
    return () => { mounted = false }
  }, [supabase])

  // Fetch community events for WeeklyPopularCarousel
  const [heroCommunityEvents, setHeroCommunityEvents] = useState<CommunityEvent[]>([])
  useEffect(() => {
    let mounted = true
    const now = new Date().toISOString()
    Promise.resolve(
      supabase
        .from('community_events')
        .select('*, creator:profiles!community_events_creator_id_fkey(id, name, avatar_url)')
        .eq('is_active', true)
        .gte('event_date', now)
        .order('event_date', { ascending: true })
        .limit(20)
    ).then(({ data, error }: any) => {
      if (!mounted) return
      if (error) { if (__DEV__) console.warn('[feed] community events failed:', error.message); return }
      if (!data) return
      // Enrich with participant count
      const eventIds = (data as any[]).map((e: any) => e.id)
      if (eventIds.length === 0) { setHeroCommunityEvents(data); return }
      Promise.resolve(
        supabase
          .from('community_event_participants')
          .select('event_id')
          .in('event_id', eventIds)
          .eq('status', 'joined')
      ).then(({ data: participants }: any) => {
        if (!mounted) return
        const counts: Record<string, number> = {}
        if (participants) for (const p of participants as any[]) {
          counts[p.event_id] = (counts[p.event_id] || 0) + 1
        }
        const enriched = (data as any[]).map((e: any) => ({
          ...e,
          participant_count: counts[e.id] || 0,
        }))
        setHeroCommunityEvents(enriched)
      }).catch(() => { if (mounted) setHeroCommunityEvents(data) })
    }).catch((err: any) => { if (__DEV__) console.warn('[feed] community events error:', err) })
    return () => { mounted = false }
  }, [supabase])

  // Fetch active polls for feed display
  const [feedPolls, setFeedPolls] = useState<Poll[]>([])
  useEffect(() => {
    if (!FEATURES.POLLS || !feed.currentUserId) return
    let mounted = true
    const now = new Date().toISOString()
    ;(async () => {
      const { data, error } = await Promise.resolve(
        supabase
          .from('polls')
          .select('id, creator_id, question, options, naapurusto, vote_count, expires_at, created_at, is_active')
          .eq('is_active', true)
          .or(`expires_at.is.null,expires_at.gt."${now}"`)
          .order('created_at', { ascending: false })
          .limit(3)
      ) as any
      if (!mounted) return
      if (error) { if (__DEV__) console.warn('[feed] polls fetch failed:', error.message); return }
      if (!data || data.length === 0) return
      const pollIds = (data as any[]).map((p: any) => p.id)

      // Fetch user's votes
      let voteMap: Record<string, number> = {}
      if (pollIds.length > 0) {
        const { data: votes, error: votesErr } = await Promise.resolve(
          supabase
            .from('poll_votes')
            .select('poll_id, option_index')
            .eq('user_id', feed.currentUserId!)
            .in('poll_id', pollIds)
        )
        if (!mounted) return
        if (votesErr && __DEV__) console.warn('[feed] poll votes fetch failed:', votesErr.message)
        if (votes) for (const v of votes as any[]) voteMap[v.poll_id] = v.option_index
      }

      // Fetch per-option vote counts
      let optionCountsMap: Record<string, Record<number, number>> = {}
      if (pollIds.length > 0) {
        const { data: allVotes, error: allVotesErr } = await Promise.resolve(
          supabase
            .from('poll_votes')
            .select('poll_id, option_index')
            .in('poll_id', pollIds)
        )
        if (!mounted) return
        if (allVotesErr && __DEV__) console.warn('[feed] poll allVotes fetch failed:', allVotesErr.message)
        if (allVotes) {
          for (const v of allVotes as any[]) {
            if (!optionCountsMap[v.poll_id]) optionCountsMap[v.poll_id] = {}
            optionCountsMap[v.poll_id][v.option_index] = (optionCountsMap[v.poll_id][v.option_index] || 0) + 1
          }
        }
      }

      const polls: Poll[] = (data as any[]).map((p: any) => {
        const opts = Array.isArray(p.options) ? p.options : []
        const countsForPoll = optionCountsMap[p.id] || {}
        return {
          ...p,
          options: opts as string[],
          my_vote: voteMap[p.id] ?? null,
          option_counts: opts.map((_: any, idx: number) => countsForPoll[idx] || 0),
        }
      })
      if (mounted) setFeedPolls(polls)
    })().catch((err: any) => { if (__DEV__) console.warn('[feed] polls error:', err) })
    return () => { mounted = false }
  }, [feed.currentUserId, supabase])

  // Fetch active ads for feed display
  const [feedAds, setFeedAds] = useState<Ad[]>([])
  useEffect(() => {
    if (!FEATURES.AD_CAMPAIGNS) return
    let mounted = true
    const now = new Date().toISOString()
    Promise.resolve(
      supabase
        .from('advertisements')
        .select('id, user_id, title, description, image_url, link_url, cta_text, target_naapurusto, start_date, end_date, status, created_at')
        .eq('status', 'active')
        .lte('start_date', now)
        .gte('end_date', now)
        .order('created_at', { ascending: false })
        .limit(3)
    ).then(({ data, error }: any) => {
      if (!mounted) return
      if (error) { if (__DEV__) console.warn('[feed] ads fetch failed:', error.message); return }
      if (!data || data.length === 0) return
      const nh = feed.userNeighborhood
      const filtered = nh
        ? (data as any[]).filter((a: any) => !a.target_naapurusto || a.target_naapurusto === nh)
        : (data as any[]).filter((a: any) => !a.target_naapurusto)
      const ads: Ad[] = (filtered.length > 0 ? filtered : (data as any[]).slice(0, 1)).map((a: any) => ({
        ...a,
        _isAd: true as const,
      }))
      setFeedAds(ads)
    }).catch((err: any) => { if (__DEV__) console.warn('[feed] ads error:', err) })
    return () => { mounted = false }
  }, [supabase, feed.userNeighborhood])

  // NOTE: User profile/greeting removed — mockup 05 uses location-based header

  // Welcome toast on first feed load (shown once per install)
  useEffect(() => {
    if (welcomeShownRef.current || feed.loading || feed.posts.length === 0) return
    AsyncStorage.getItem('welcome_toast_shown').then(val => {
      if (val === 'true' || welcomeShownRef.current) return
      welcomeShownRef.current = true
      const nh = feed.userNeighborhood
      toast.show({
        message: nh
          ? (t('feed.welcomeToast', { neighborhood: nh }) || `Tervetuloa ${nh}n ilmoitustaululle!`)
          : (t('feed.welcomeToastGeneric') || 'Tervetuloa Bivoon!'),
        type: 'success',
      })
      AsyncStorage.setItem('welcome_toast_shown', 'true').catch((e) => { if (__DEV__) console.warn('Welcome toast flag save failed:', e) })
    }).catch((e) => { if (__DEV__) console.warn('Welcome toast flag read failed:', e) })
  }, [feed.loading, feed.posts.length, feed.userNeighborhood, toast, t])

  // Open neighborhood picker when navigated from settings with param
  useEffect(() => {
    if (params.openNeighborhoodPicker === '1') {
      feed.setShowNeighborhoodPicker(true)
    }
  }, [params.openNeighborhoodPicker, feed.setShowNeighborhoodPicker])

  // FlatList ref for scroll-to-top on filter change
  const flatListRef = useRef<FlatList>(null)

  // Wrap filter change with haptic feedback
  const handleFilterChangeWithHaptics = useCallback((type: PostType | null) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    feed.handleFilterChange(type)
    // Scroll to top AFTER React re-renders with the new data
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false })
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false })
    })
  }, [feed.handleFilterChange])

  // Wrap sort change with haptic feedback
  const handleSortChangeWithHaptics = useCallback((sort: FeedSortBy) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    feed.handleSortChange(sort)
  }, [feed.handleSortChange])

  // Sort options — expose all 5 algorithm modes
  const SORT_OPTIONS: { key: FeedSortBy; label: string }[] = useMemo(() => [
    { key: 'recommended', label: t('feed.sortRecommended') },
    { key: 'newest', label: t('feed.sortNewest') },
    { key: 'popular', label: t('feed.sortPopular') },
    { key: 'nearest', label: t('feed.sortNearest') },
    { key: 'cheapest', label: t('feed.sortCheapest') },
  ], [t])

  // ── Hidden post IDs (persisted to AsyncStorage) ──
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    AsyncStorage.getItem('bivo_hidden_posts').then(val => {
      if (val) {
        try { setHiddenIds(new Set(JSON.parse(val))) } catch {} // Intentional: corrupted cache
      }
    }).catch((e) => { if (__DEV__) console.warn('Hidden posts read failed:', e) })
  }, [])
  const hiddenIdsRef = useRef<Set<string>>(hiddenIds)
  hiddenIdsRef.current = hiddenIds
  const handleHidePost = useCallback((postId: string) => {
    if (hiddenIdsRef.current.has(postId)) return
    const next = new Set(hiddenIdsRef.current)
    next.add(postId)
    setHiddenIds(next)
    AsyncStorage.setItem('bivo_hidden_posts', JSON.stringify([...next])).catch((e) => { if (__DEV__) console.warn('Hidden posts save failed:', e) })
  }, [])

  // ── "Seen" / new indicator ──
  const [lastFeedVisit, setLastFeedVisit] = useState<string | null>(null)
  const [missedCount, setMissedCount] = useState(0)
  const [showMissedBanner, setShowMissedBanner] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem('bivo_last_feed_visit').then(val => {
      if (val) setLastFeedVisit(val)
    }).catch((e) => { if (__DEV__) console.warn('Last feed visit read failed:', e) })
    return () => {
      AsyncStorage.setItem('bivo_last_feed_visit', new Date().toISOString()).catch((e) => { if (__DEV__) console.warn('Last feed visit save failed:', e) })
    }
  }, [])

  // ── "Missed posts" banner when returning after 24h+ ──
  useEffect(() => {
    if (!lastFeedVisit || feed.loading || feed.posts.length === 0) return
    const lastVisitDate = new Date(lastFeedVisit)
    const now = new Date()
    const hoursSinceVisit = (now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60)
    if (hoursSinceVisit >= 24) {
      const newPostCount = feed.posts.filter(p => p.created_at && p.created_at > lastFeedVisit).length
      if (newPostCount > 0) {
        setMissedCount(newPostCount)
        setShowMissedBanner(true)
      }
    }
  }, [lastFeedVisit, feed.loading, feed.posts])

  const filteredPosts = useMemo(
    () => feed.posts.filter(p => !hiddenIds.has(p.id)),
    [feed.posts, hiddenIds],
  )

  const visiblePosts = filteredPosts

  const heroEventPosts = useMemo(
    () => [...filteredPosts.filter(p => p.type === 'tapahtuma'), ...inlineEvents],
    [filteredPosts, inlineEvents],
  )

  // Background AI image generation for imageless hero-eligible events
  // Generates images in Supabase Storage so they appear in the hero on next feed refresh
  const aiGenRequested = useRef(new Set<string>())
  useEffect(() => {
    const imagelessPosts = heroEventPosts.filter(
      p => p.event_date && !p.image_url && !aiGenRequested.current.has(p.id),
    )
    const imagelessCommunity = heroCommunityEvents.filter(
      e => !e.image_url && !aiGenRequested.current.has(e.id),
    )
    const toGenerate: { id: string; source: 'post' | 'community' }[] = [
      ...imagelessPosts.map(p => ({ id: p.id, source: 'post' as const })),
      ...imagelessCommunity.map(e => ({ id: e.id, source: 'community' as const })),
    ]
    if (toGenerate.length === 0) return

    for (const item of toGenerate) aiGenRequested.current.add(item.id)

    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token
      if (!token) return
      const functionsUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
      }
      for (const item of toGenerate) {
        fetch(`${functionsUrl}/generate-event-image`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ event_id: item.id, source: item.source }),
        }).catch(() => {})
      }
    })
  }, [heroEventPosts, heroCommunityEvents, supabase])

  // ── Category sections (Wolt-style horizontal scrolling) ──
  const categorySections = useMemo(() => {
    const posts = visiblePosts
    const groups: Record<string, Post[]> = {}
    for (const post of posts) {
      const type = post.type || 'ilmaista'
      if (!groups[type]) groups[type] = []
      groups[type].push(post)
    }
    if (inlineEvents.length > 0) {
      if (!groups['tapahtuma']) groups['tapahtuma'] = []
      groups['tapahtuma'] = [...inlineEvents, ...groups['tapahtuma']]
    }
    const orderedTypes: PostType[] = ['ilmaista', 'tarvitsen', 'tarjoan', 'tapahtuma', 'lainaa']
    return orderedTypes
      .filter(type => groups[type] && groups[type].length > 0)
      .map(type => ({ type: type as PostType, posts: groups[type] }))
  }, [visiblePosts, inlineEvents])

  const feedItems = useMemo((): FeedItem[] => {
    if (feed.activeFilter) {
      // Filtered: sort row + 2-column mosaic grid
      const section = categorySections.find(s => s.type === feed.activeFilter)
      const posts = section?.posts || []
      // While loading a new filter and no posts match yet, show skeleton placeholder
      if (feed.loading && posts.length === 0) {
        return [{ _kind: 'sortRow', key: 'sort-row', count: 0 }]
      }
      const items: FeedItem[] = [
        { _kind: 'sortRow', key: 'sort-row', count: posts.length },
      ]
      for (let i = 0; i < posts.length; i += 2) {
        items.push({ _kind: 'gridRow', key: `row-${i}`, posts: posts.slice(i, i + 2) })
      }
      return items
    }
    // Unfiltered: 2-column grid (Bivo discover style)
    const allPosts = categorySections.flatMap(s => s.posts)
    const items: FeedItem[] = [
      { _kind: 'eyebrow', key: 'eyebrow-avail', label: t('feed.availableNow') ?? 'Vapaana nyt' },
    ]
    for (let i = 0; i < allPosts.length; i += 2) {
      items.push({ _kind: 'gridRow', key: `row-${i}`, posts: allPosts.slice(i, i + 2) })
      if (i === 4 && feedAds.length > 0) {
        items.push({ _kind: 'ad', key: 'ad-0', ad: feedAds[0] })
      }
    }
    return items
  }, [feed.activeFilter, feed.loading, categorySections, feedAds, t])

  const renderFeedItem = useCallback(({ item }: { item: FeedItem }) => {
    const gCardWidth = (screenWidth - 44 - 12) / 2  // 22px padding each side, 12px gap

    if (item._kind === 'eyebrow') {
      return (
        <View style={styles.eyebrowRow}>
          <Text style={[styles.eyebrowText, { color: colors.mutedForeground }]}>{item.label}</Text>
        </View>
      )
    }
    if (item._kind === 'sortRow') {
      return (
        <View style={styles.sortRow}>
          <Text style={[styles.sortLabel, { color: colors.tertiaryForeground }]}>
            {item.count} {t('feed.results') ?? 'osumaa'}
          </Text>
          <PressableOpacity
            onPress={() => {
              const labels = SORT_OPTIONS.map(o => feed.sortBy === o.key ? `${o.label} ✓` : o.label).concat(t('common.cancel') ?? 'Cancel')
              if (Platform.OS === 'ios') {
                ActionSheetIOS.showActionSheetWithOptions(
                  { options: labels, cancelButtonIndex: labels.length - 1, title: t('feed.sort') ?? 'Sort' },
                  (idx) => { if (idx < SORT_OPTIONS.length) handleSortChangeWithHaptics(SORT_OPTIONS[idx].key) },
                )
              } else {
                Alert.alert(t('feed.sort') ?? 'Sort', '', SORT_OPTIONS.map(o => ({
                  text: o.label + (feed.sortBy === o.key ? ' ✓' : ''),
                  onPress: () => handleSortChangeWithHaptics(o.key),
                })).concat({ text: t('common.cancel') ?? 'Cancel', onPress: () => {} }))
              }
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('feed.sort') ?? 'Sort'}
          >
            <View style={styles.sortBtn}>
              <Text style={[styles.sortBtnText, { color: colors.foreground }]}>
                {SORT_OPTIONS.find(o => o.key === feed.sortBy)?.label ?? t('feed.sortRecommended')}
              </Text>
              <ChevronRight size={11} color={colors.foreground} strokeWidth={2} />
            </View>
          </PressableOpacity>
        </View>
      )
    }
    if (item._kind === 'ad') {
      return (
        <View style={{ paddingHorizontal: 22 }}>
          <AdCard ad={item.ad} />
        </View>
      )
    }
    if (item._kind === 'gridRow') {
      return (
        <View style={styles.gridRow}>
          {item.posts.map((post, idx) => (
            <View key={post.id} style={{ width: gCardWidth }}>
              <PostCardGrid
                post={post}
                userId={feed.currentUserId}
                onInteraction={trackInteraction}
                index={idx}
                sortBy={feed.sortBy}
                followedIds={feed.followedIds}
                viewCount={viewCounts[post.id]}
              />
            </View>
          ))}
        </View>
      )
    }
    // _kind === 'section': horizontal category row with v3 section heads
    const category = CATEGORIES[item.categoryType]
    return (
      <View style={styles.categorySection}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleWrap}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {t(category.label)}
            </Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              {item.posts.length} {t('feed.nearby') ?? 'lähellä'}
            </Text>
          </View>
          <PressableOpacity
            onPress={() => handleFilterChangeWithHaptics(item.categoryType)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${t(category.label)} — ${t('feed.seeAll') ?? 'Näytä kaikki'}`}
          >
            <View style={styles.seeAllRow}>
              <Text style={[styles.seeAllText, { color: colors.foreground }]}>
                {t('feed.seeAll') ?? 'Näytä kaikki'}
              </Text>
              <ChevronRight size={13} color={colors.foreground} strokeWidth={2} />
            </View>
          </PressableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 22, gap: 10 }}
          snapToInterval={230 + 10}
          decelerationRate="fast"
        >
          {item.posts.slice(0, 10).map((post, index) => (
            <View key={post.id} style={{ width: 230 }}>
              <PostCardGrid
                post={post}
                userId={feed.currentUserId}
                onInteraction={trackInteraction}
                index={index}
                sortBy={feed.sortBy}
                followedIds={feed.followedIds}
                viewCount={viewCounts[post.id]}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    )
  }, [colors, t, feed.currentUserId, feed.sortBy, feed.followedIds, trackInteraction, viewCounts, handleFilterChangeWithHaptics, handleSortChangeWithHaptics, screenWidth, SORT_OPTIONS])

  // ── Render ──
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {viewMode === 'map' ? (
        <>
          {/* Map header */}
          <View style={[styles.topArea, { paddingTop: insets.top + 12 }]}>
            <View style={styles.searchRow}>
              <PressableOpacity
                onPress={() => router.push('/search')}
                style={[styles.searchInput, { backgroundColor: colors.card, borderColor: colors.border }]}
                accessibilityLabel={t('common.search')}
                accessibilityRole="button"
              >
                <Search size={18} color={colors.mutedForeground} strokeWidth={2} />
                <Text style={[styles.searchPlaceholder, { color: colors.mutedForeground }]}>
                  {feed.userNeighborhood ?? 'Helsinki'}
                </Text>
              </PressableOpacity>
              <PressableOpacity
                onPress={() => { try { Haptics.selectionAsync() } catch {} setViewMode('list') }}
                style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                accessibilityLabel={t('feed.listView') ?? 'List view'}
                accessibilityRole="button"
              >
                <LayoutGrid size={20} color={colors.foreground} strokeWidth={1.8} />
              </PressableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={styles.pillRow}>
              <FilterBar activeFilter={feed.activeFilter} onFilterChange={handleFilterChangeWithHaptics} />
            </ScrollView>
          </View>
          <FeedMapView
            posts={visiblePosts}
            cityEvents={feed.cityEvents}
            userLocation={feed.userLocation}
            activeFilter={feed.activeFilter}
          />
        </>
      ) : (
      <FlatList
        ref={flatListRef}
        data={feedItems}
        renderItem={renderFeedItem}
        keyExtractor={item => item.key}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, gap: 14 }}
        ListHeaderComponent={
          <View>
            {/* ── Top area with safe area padding ── */}
            <View style={[styles.topArea, { paddingTop: insets.top + 12 }]}>
              <View style={styles.searchRow}>
                <PressableOpacity
                  onPress={() => router.push('/search')}
                  style={[styles.searchInput, { backgroundColor: colors.card, borderColor: colors.border }]}
                  accessibilityLabel={t('common.search')}
                  accessibilityRole="button"
                >
                  <Search size={18} color={colors.tertiaryForeground} strokeWidth={2} />
                  <Text style={[styles.searchPlaceholder, { color: colors.tertiaryForeground }]} numberOfLines={1}>
                    {feed.userNeighborhood
                      ? `${t('feed.searchIn') ?? 'Hae tavaraa'} ${feed.userNeighborhood}sta…`
                      : (t('feed.searchPlaceholder') ?? 'Etsi naapurustosta…')}
                  </Text>
                </PressableOpacity>
                <PressableOpacity
                  onPress={() => { try { Haptics.selectionAsync() } catch {} setViewMode(v => v === 'list' ? 'map' : 'list') }}
                  style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  accessibilityLabel={viewMode === 'list' ? (t('feed.mapView') ?? 'Kartta') : (t('feed.listView') ?? 'Lista')}
                  accessibilityRole="button"
                >
                  {viewMode === 'list' ? (
                    <Map size={20} color={colors.foreground} strokeWidth={1.6} />
                  ) : (
                    <LayoutGrid size={20} color={colors.foreground} strokeWidth={1.6} />
                  )}
                </PressableOpacity>
                <PressableOpacity
                  onPress={() => router.push('/notifications')}
                  style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  accessibilityLabel={`${t('notifications.title') ?? 'Ilmoitukset'}, ${t('notifications.new') ?? 'uusia ilmoituksia'}`}
                  accessibilityRole="button"
                >
                  <Bell size={20} color={colors.foreground} strokeWidth={1.6} />
                  <View style={[styles.bellDot, { backgroundColor: colors.accent }]} />
                </PressableOpacity>
              </View>

              {/* 3. Category chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                style={styles.pillRow}
              >
                <FilterBar activeFilter={feed.activeFilter} onFilterChange={handleFilterChangeWithHaptics} />
              </ScrollView>
            </View>

            {/* ── Active sort indicator ── */}
            {feed.sortBy !== 'recommended' && (
              <View style={[styles.sortIndicator, { paddingHorizontal: 22, marginTop: 4 }]}>
                <Text style={[styles.sortIndicatorText, { color: colors.tertiaryForeground }]}>
                  {SORT_OPTIONS.find(o => o.key === feed.sortBy)?.label}
                </Text>
                <PressableOpacity
                  onPress={() => handleSortChangeWithHaptics('recommended')}
                  hitSlop={8}
                  accessibilityLabel={t('feed.sortRecommended')}
                  accessibilityRole="button"
                >
                  <XIcon size={12} color={colors.mutedForeground} />
                </PressableOpacity>
              </View>
            )}

            {/* ── Banner slot (max 1 — priority: error → newPosts → missed → poll) ── */}
            <View style={{ paddingHorizontal: 22 }}>
              {feed.error ? (
                <PressableOpacity
                  onPress={feed.handleRefresh}
                  accessibilityRole="button"
                  accessibilityLabel={`${feed.error}. ${t('errors.tryAgain')}`}
                  style={[styles.errorRow, { backgroundColor: `${colors.destructive}10`, borderWidth: 1, borderColor: `${colors.destructive}30` }]}
                >
                  <RefreshCw size={14} color={colors.destructive} />
                  <Text style={[styles.errorRowText, { color: colors.destructive }]} numberOfLines={1}>{feed.error}</Text>
                  <Text style={[styles.errorRowText, { color: colors.destructive, fontFamily: fonts.bodySemi, textDecorationLine: 'underline' }]}>
                    {t('errors.tryAgain')}
                  </Text>
                </PressableOpacity>
              ) : feed.hasNewPosts ? (
                <PressableOpacity
                  onPress={feed.handleRefresh}
                  accessibilityRole="button"
                  accessibilityLabel={t('feed.newPosts')}
                  style={[styles.newBanner, { backgroundColor: isDark ? `${colors.foreground}1F` : `${colors.foreground}14`, borderWidth: 1, borderColor: `${colors.foreground}33` }]}
                >
                  <Sparkles size={14} color={colors.foreground} />
                  <Text style={[styles.newBannerText, { color: colors.foreground }]}>
                    {feed.newPostCount > 0
                      ? t('feed.newPostsCount', { count: feed.newPostCount })
                      : t('feed.newPosts')}
                  </Text>
                  <RefreshCw size={14} color={colors.foreground} style={{ opacity: 0.7 }} />
                </PressableOpacity>
              ) : showMissedBanner && missedCount > 0 ? (
                <View style={[styles.missedBanner, { backgroundColor: colors.foreground }]}>
                  <Text style={[styles.missedBannerText, { color: colors.primaryForeground }]}>
                    {t('feed.missedPosts', { count: missedCount })}
                  </Text>
                  <PressableOpacity onPress={() => setShowMissedBanner(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.dismiss') ?? 'Dismiss'}>
                    <XIcon size={16} color={colors.primaryForeground} />
                  </PressableOpacity>
                </View>
              ) : null}
            </View>

            {/* ── Active polls ── */}
            {FEATURES.POLLS && feedPolls.length > 0 && (
              <View style={{ paddingHorizontal: 22, gap: 10, marginTop: 8 }}>
                {feedPolls.map(poll => (
                  <PollCard key={poll.id} poll={poll} userId={feed.currentUserId} />
                ))}
              </View>
            )}

            {/* ── 5. Events hero carousel ── */}
            {(heroEventPosts.length > 0 || heroCommunityEvents.length > 0) && (
              <FadeIn>
                <EventHeroCarousel
                  eventPosts={heroEventPosts}
                  communityEvents={heroCommunityEvents}
                  locale={locale}
                />
              </FadeIn>
            )}
            {feed.cityEvents.length > 0 && (
              <FadeIn>
                <WeeklyPopularCarousel
                  cityEvents={feed.cityEvents}
                  communityEvents={[]}
                  locale={locale}
                />
              </FadeIn>
            )}

            {/* ── 6. Loading / cold start ── */}
            {feed.loading && visiblePosts.length === 0 ? (
              <View style={{ paddingHorizontal: 12, gap: 16, paddingTop: 16 }}>
                {[0, 1, 2, 3].map(i => <PostCardSkeleton key={i} />)}
              </View>
            ) : visiblePosts.length === 0 && !feed.loading ? (
              <View style={styles.coldStart}>
                <BoardIllustration size={80} />
                <Text style={[styles.coldStartTitle, { color: colors.foreground }]}>{t('feed.noPosts')}</Text>
                <Text style={[styles.coldStartHint, { color: colors.mutedForeground }]}>
                  {t('map.beFirstInArea', { area: feed.userNeighborhood ?? 'Helsinki' })}
                </Text>
                <MagneticPressable onPress={() => router.push('/(tabs)/create')} style={[styles.coldStartBtn, { backgroundColor: colors.foreground }]} pressedScale={0.92}>
                  <Plus size={16} color={colors.primaryForeground} />
                  <Text style={[styles.coldStartBtnText, { color: colors.primaryForeground }]}>{t('events.heroCreateCTA')}</Text>
                </MagneticPressable>
              </View>
            ) : null}

          </View>
        }
        ListEmptyComponent={!feed.loading ? (
          <EmptyState
            icon={<Search size={24} color={colors.mutedForeground} />}
            title={t('feed.emptyTitle')}
            description={t('feed.emptyDescription')}
            actionLabel={t('feed.createFirst')}
            actionVariant="filled"
            onAction={() => router.push('/(tabs)/create')}
          />
        ) : null}
        ListFooterComponent={
          <>
            {feed.loading && feed.activeFilter && (
              <View style={{ paddingHorizontal: 12, gap: 16, paddingTop: 16 }}>
                {[0, 1, 2, 3].map(i => <PostCardSkeleton key={`filter-skel-${i}`} />)}
              </View>
            )}
            {feed.loading && !feed.activeFilter && feed.posts.length > 0 && <FeedLoadMoreSkeleton />}
            {!feed.hasMore && feed.posts.length >= 10 && (
              <View style={styles.allLoadedWrap}>
                <View style={[styles.allLoadedLine, { backgroundColor: `${colors.border}66` }]} />
                <View style={styles.allLoadedContent}>
                  <CheckCircle size={14} color={colors.tertiaryForeground} />
                  <Text style={[styles.allLoadedText, { color: colors.mutedForeground }]}>{t('feed.allCaughtUp')}</Text>
                </View>
              </View>
            )}
          </>
        }
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.handleRefresh} tintColor={colors.foreground} />}
        onEndReached={feed.handleLoadMore}
        onEndReachedThreshold={0.3}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
      )}

      <NeighborhoodPicker
        visible={feed.showNeighborhoodPicker}
        onClose={() => feed.setShowNeighborhoodPicker(false)}
        selectedNeighborhood={feed.userNeighborhood}
        onSelect={feed.handleNeighborhoodSelect}
        neighborhoods={feed.cityNeighborhoods.length > 0 ? feed.cityNeighborhoods : undefined}
      />

      <OnboardingOverlay
        visible={showOnboarding}
        onDone={() => setShowOnboarding(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Top area ──
  topArea: {
    paddingHorizontal: 22,
  },

  bellDot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    fontFamily: fonts.body,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Sort indicator ──
  sortIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 4,
  },
  sortIndicatorText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    lineHeight: 14,
  },

  // ── Eyebrow ──
  eyebrowRow: {
    paddingHorizontal: 22,
    marginBottom: 6,
    marginTop: 8,
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    lineHeight: 15,
  },

  // ── Category pills ──
  pillRow: {
    marginTop: 14,
    marginBottom: 14,
  },

  // ── Section heads ──
  categorySection: {
    marginTop: 32,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    marginBottom: 18,
  },
  sectionTitleWrap: {
    gap: 5,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  sectionSub: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 15,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 18,
  },

  // ── Sort row (filtered view) ──
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    marginBottom: 14,
  },
  sortLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
  },
  sortBtnText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    lineHeight: 16,
  },

  // ── Filtered grid rows ──
  gridRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 22,
  },

  // ── Banners ──
  newBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 999, paddingVertical: 12, minHeight: 44,
  },
  newBannerText: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12,
  },
  errorRowText: { fontSize: 13, fontFamily: fonts.bodySemi, flex: 1, lineHeight: 18 },
  missedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999,
  },
  missedBannerText: { fontSize: 14, fontWeight: '600', flex: 1, fontFamily: fonts.bodySemi, lineHeight: 20 },

  // ── Cold start / empty ──
  coldStart: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32, gap: 16 },
  coldStartTitle: { fontSize: 24, fontWeight: '700', letterSpacing: -0.8, fontFamily: fonts.displayBold, lineHeight: 28 },
  coldStartHint: { fontSize: 15, textAlign: 'center', lineHeight: 22, fontFamily: fonts.body },
  coldStartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999, marginTop: 12, minHeight: 56 },
  coldStartBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 22, letterSpacing: -0.2 },

  // ── Footer ──
  allLoadedWrap: { alignItems: 'center', gap: 16, paddingVertical: 44 },
  allLoadedLine: { height: StyleSheet.hairlineWidth, width: '40%' },
  allLoadedContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allLoadedText: { fontSize: 11, fontWeight: '600', fontFamily: fonts.bodySemi, letterSpacing: 1.6, textTransform: 'uppercase' as const, lineHeight: 15 },
})

export default function FeedScreen() {
  return (
    <ScreenErrorBoundary screenName="Feed">
      <FeedScreenInner />
    </ScreenErrorBoundary>
  )
}
