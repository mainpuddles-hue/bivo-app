import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, ScrollView, ActionSheetIOS, Alert, Platform, useWindowDimensions } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sparkles, RefreshCw, Plus, Search, CheckCircle, X as XIcon, Map, LayoutGrid, Home, ChevronRight, ArrowUpRight } from 'lucide-react-native'
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
import { OnboardingOverlay } from '@/components/OnboardingOverlay'
import { WeeklyPopularCarousel } from '@/components/WeeklyPopularCarousel'
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
      AsyncStorage.getItem('tackbird_onboarding_completed'),
      AsyncStorage.getItem('onboarding_complete'),
    ]).then(([overlayFlag, layoutFlag]) => {
      if (!overlayFlag && !layoutFlag) setShowOnboarding(true)
    }).catch(() => {})
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

  // Batch view counts for feed cards
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    if (feed.posts.length === 0) return
    let mounted = true
    const postIds = feed.posts.map(p => p.id)
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
  }, [feed.posts, supabase])

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

  // Fetch user's building info for community card
  const [userBuilding, setUserBuilding] = useState<{ street_address: string; member_count: number } | null>(null)
  useEffect(() => {
    if (!feed.currentUserId) return
    let mounted = true
    Promise.resolve(
      supabase
        .from('user_buildings')
        .select('building:buildings(street_address, member_count)')
        .eq('user_id', feed.currentUserId)
        .single()
    ).then(({ data, error }: any) => {
      if (!mounted) return
      if (error && error.code !== 'PGRST116') { if (__DEV__) console.warn('[feed] user building failed:', error.message) }
      if (data?.building) setUserBuilding(data.building)
    }).catch((err: any) => { if (__DEV__) console.warn('[feed] user building error:', err) })
    return () => { mounted = false }
  }, [feed.currentUserId, supabase])

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
          .select('id, creator_id, question, options, building_id, naapurusto, vote_count, expires_at, created_at, is_active')
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
        const { data: votes } = await Promise.resolve(
          supabase
            .from('poll_votes')
            .select('poll_id, option_index')
            .eq('user_id', feed.currentUserId!)
            .in('poll_id', pollIds)
        )
        if (!mounted) return
        if (votes) for (const v of votes as any[]) voteMap[v.poll_id] = v.option_index
      }

      // Fetch per-option vote counts
      let optionCountsMap: Record<string, Record<number, number>> = {}
      if (pollIds.length > 0) {
        const { data: allVotes } = await Promise.resolve(
          supabase
            .from('poll_votes')
            .select('poll_id, option_index')
            .in('poll_id', pollIds)
        )
        if (!mounted) return
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
          : (t('feed.welcomeToastGeneric') || 'Tervetuloa TackBirdiin!'),
        type: 'success',
      })
      AsyncStorage.setItem('welcome_toast_shown', 'true').catch(() => {})
    }).catch(() => {})
  }, [feed.loading, feed.posts.length, feed.userNeighborhood, toast, t])

  // Open neighborhood picker when navigated from settings with param
  useEffect(() => {
    if (params.openNeighborhoodPicker === '1') {
      feed.setShowNeighborhoodPicker(true)
    }
  }, [params.openNeighborhoodPicker, feed.setShowNeighborhoodPicker])

  // Wrap filter change with haptic feedback
  const handleFilterChangeWithHaptics = useCallback((type: PostType | null) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    feed.handleFilterChange(type)
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
    AsyncStorage.getItem('tackbird_hidden_posts').then(val => {
      if (val) {
        try { setHiddenIds(new Set(JSON.parse(val))) } catch {} // Intentional: corrupted cache
      }
    }).catch(() => {})
  }, [])
  const hiddenIdsRef = useRef<Set<string>>(hiddenIds)
  hiddenIdsRef.current = hiddenIds
  const handleHidePost = useCallback((postId: string) => {
    if (hiddenIdsRef.current.has(postId)) return
    const next = new Set(hiddenIdsRef.current)
    next.add(postId)
    setHiddenIds(next)
    AsyncStorage.setItem('tackbird_hidden_posts', JSON.stringify([...next])).catch(() => {})
  }, [])

  // ── "Seen" / new indicator ──
  const [lastFeedVisit, setLastFeedVisit] = useState<string | null>(null)
  const [missedCount, setMissedCount] = useState(0)
  const [showMissedBanner, setShowMissedBanner] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem('tackbird_last_feed_visit').then(val => {
      if (val) setLastFeedVisit(val)
    }).catch(() => {})
    return () => {
      AsyncStorage.setItem('tackbird_last_feed_visit', new Date().toISOString()).catch(() => {})
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
      const items: FeedItem[] = [
        { _kind: 'sortRow', key: 'sort-row', count: posts.length },
      ]
      for (let i = 0; i < posts.length; i += 2) {
        items.push({ _kind: 'gridRow', key: `row-${i}`, posts: posts.slice(i, i + 2) })
      }
      return items
    }
    // Unfiltered: horizontal category sections
    const items: FeedItem[] = []
    categorySections.forEach((section, idx) => {
      items.push({ _kind: 'section', key: `section-${section.type}`, categoryType: section.type, posts: section.posts })
      if (idx === 1 && feedAds.length > 0) {
        items.push({ _kind: 'ad', key: 'ad-0', ad: feedAds[0] })
      }
    })
    return items
  }, [feed.activeFilter, categorySections, feedAds])

  const renderFeedItem = useCallback(({ item }: { item: FeedItem }) => {
    const gCardWidth = (screenWidth - 40 - 10) / 2  // 20px padding each side, 10px gap

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
        <View style={{ paddingHorizontal: 20 }}>
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
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
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
            userLocation={feed.userLocation}
            activeFilter={feed.activeFilter}
          />
        </>
      ) : (
      <FlatList
        data={feedItems}
        renderItem={renderFeedItem}
        keyExtractor={item => item.key}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, gap: 8 }}
        ListHeaderComponent={
          <View>
            {/* ── Top area with safe area padding ── */}
            <View style={[styles.topArea, { paddingTop: insets.top + 16 }]}>
              {/* 1. v3 Header — location eyebrow + Bricolage title + pulse row */}
              <PressableOpacity onPress={() => feed.setShowNeighborhoodPicker(true)} style={styles.header} hitSlop={8}>
                <View style={styles.hLocLine}>
                  <View style={[styles.hLocPin, { backgroundColor: colors.success }]}>
                    <View style={styles.hLocPinDot} />
                  </View>
                  <Text style={[styles.hLocText, { color: colors.mutedForeground }]}>
                    {t('feed.yourNeighborhood') ?? 'Naapurustosi'}
                  </Text>
                </View>
                <View style={styles.hTitleRow}>
                  <Text style={[styles.hTitle, { color: colors.foreground }]}>
                    {feed.userNeighborhood ?? 'Helsinki'}
                  </Text>
                </View>
                <View style={styles.hPulse}>
                  <View style={styles.pulseGroup}>
                    <View style={[styles.pulseDot, { backgroundColor: colors.success }]} />
                    <Text style={[styles.pulseText, { color: colors.foreground }]}>
                      <Text style={{ fontFamily: fonts.bodySemi }}>{onlineCount || 0}</Text>
                      {' '}{t('feed.neighborsNow') ?? 'naapuria juuri nyt'}
                    </Text>
                  </View>
                  {weeklyActiveCount > 0 && (
                    <>
                      <Text style={[styles.pulseDivider, { color: colors.tertiaryForeground }]}>·</Text>
                      <Text style={[styles.pulseText, { color: colors.foreground }]}>
                        <Text style={{ fontFamily: fonts.bodySemi }}>{feed.posts.length}</Text>
                        {' '}{t('feed.postsThisWeek') ?? 'ilmoitusta'}
                      </Text>
                    </>
                  )}
                </View>
              </PressableOpacity>

              {/* 2. Search input pill + map button */}
              <View style={styles.searchRow}>
                <PressableOpacity
                  onPress={() => router.push('/search')}
                  style={[styles.searchInput, { backgroundColor: colors.card, borderColor: colors.border }]}
                  accessibilityLabel={t('common.search')}
                  accessibilityRole="button"
                >
                  <Search size={18} color={colors.mutedForeground} strokeWidth={2} />
                  <Text style={[styles.searchPlaceholder, { color: colors.mutedForeground }]}>
                    {t('feed.searchPlaceholder') ?? 'Etsi naapurustosta…'}
                  </Text>
                </PressableOpacity>
                <PressableOpacity
                  onPress={() => { try { Haptics.selectionAsync() } catch {} setViewMode(v => v === 'list' ? 'map' : 'list') }}
                  style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  accessibilityLabel={viewMode === 'list' ? (t('feed.mapView') ?? 'Map view') : (t('feed.listView') ?? 'List view')}
                  accessibilityRole="button"
                >
                  {viewMode === 'list' ? (
                    <Map size={20} color={colors.foreground} strokeWidth={1.8} />
                  ) : (
                    <LayoutGrid size={20} color={colors.foreground} strokeWidth={1.8} />
                  )}
                </PressableOpacity>
              </View>

              {/* 3. Category pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
                style={styles.pillRow}
              >
                <FilterBar activeFilter={feed.activeFilter} onFilterChange={handleFilterChangeWithHaptics} />
              </ScrollView>
            </View>

            {/* ── Active sort indicator ── */}
            {feed.sortBy !== 'recommended' && (
              <View style={[styles.sortIndicator, { paddingHorizontal: 20, marginTop: 4 }]}>
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
            <View style={{ paddingHorizontal: 20 }}>
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

            {/* ── Building card (v3 ink-fill) ── */}
            {userBuilding && (
              <PressableOpacity
                onPress={() => { try { Haptics.selectionAsync() } catch {}; setViewMode('map') }}
                style={[styles.bldCard, { backgroundColor: colors.foreground }]}
                accessibilityLabel={`${userBuilding.street_address} — ${userBuilding.member_count - 1} ${t('feed.neighbors') ?? 'naapuria'}`}
              >
                <View style={styles.bldDecor} />
                <View style={styles.bldIconWrap}>
                  <Home size={20} color={colors.background} strokeWidth={1.8} />
                </View>
                <View style={styles.bldText}>
                  <Text style={[styles.bldLabel, { color: colors.onInkMuted }]}>
                    {t('feed.yourBuilding') ?? 'Taloyhtiösi'}
                  </Text>
                  <Text style={[styles.bldName, { color: colors.background }]}>
                    {userBuilding.street_address}
                  </Text>
                  <Text style={[styles.bldStats, { color: colors.onInkMuted }]}>
                    {userBuilding.member_count > 1 ? (
                      <>
                        <Text style={[styles.bldStatsStrong, { color: colors.background }]}>{userBuilding.member_count - 1}</Text>
                        {' '}{t('feed.neighbors') ?? 'naapuria'}
                      </>
                    ) : (
                      <>{locale === 'fi' ? 'Kutsu naapurisi!' : 'Invite your neighbors!'}</>
                    )}
                  </Text>
                </View>
                <View style={[styles.bldArrow, { backgroundColor: colors.background }]}>
                  <ArrowUpRight size={16} color={colors.foreground} strokeWidth={2} />
                </View>
              </PressableOpacity>
            )}

            {/* ── Active polls ── */}
            {FEATURES.POLLS && feedPolls.length > 0 && (
              <View style={{ paddingHorizontal: 20, gap: 10, marginTop: 8 }}>
                {feedPolls.map(poll => (
                  <PollCard key={poll.id} poll={poll} userId={feed.currentUserId} />
                ))}
              </View>
            )}

            {/* ── 5. Hero — 3-tier fallback: events → popular posts → cold start CTA ── */}
            {feed.loading && visiblePosts.length === 0 ? (
              <View style={{ paddingHorizontal: 12, gap: 16, paddingTop: 16 }}>
                {[0, 1, 2, 3].map(i => <PostCardSkeleton key={i} />)}
              </View>
            ) : (feed.cityEvents.length > 0 || heroCommunityEvents.length > 0) ? (
              <FadeIn>
                <WeeklyPopularCarousel
                  cityEvents={feed.cityEvents}
                  communityEvents={heroCommunityEvents}
                  locale={locale}
                />
              </FadeIn>
            ) : visiblePosts.length > 0 ? (
              <FadeIn>
                <View style={styles.categorySection}>
                  <View style={styles.sectionHead}>
                    <View style={styles.sectionTitleWrap}>
                      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                        {t('feed.popularThisWeek') ?? 'Suositut'}
                      </Text>
                    </View>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
                    snapToInterval={230 + 10}
                    decelerationRate="fast"
                  >
                    {visiblePosts
                      .slice()
                      .sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0))
                      .slice(0, 6)
                      .map((post, index) => (
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
              </FadeIn>
            ) : !feed.loading ? (
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
        ListFooterComponent={
          <>
            {feed.loading && feed.posts.length > 0 && <FeedLoadMoreSkeleton />}
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
    paddingHorizontal: 20,
  },

  // ── v3 Header ──
  header: {
    marginBottom: 4,
  },
  hLocLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  hLocPin: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hLocPinDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  hLocText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    letterSpacing: -0.1,
    lineHeight: 16,
  },
  hTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
  },
  hTitle: {
    fontSize: 38,
    fontWeight: '600',
    fontFamily: fonts.display,
    letterSpacing: -1.4,
    lineHeight: 38,
  },
  hPulse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  pulseGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pulseText: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
  },
  pulseDivider: {
    fontSize: 13,
    lineHeight: 18,
  },

  // ── Search row ──
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  searchInput: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  searchPlaceholder: {
    fontSize: 15,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
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

  // ── Category pills ──
  pillRow: {
    marginTop: 20,
    marginBottom: 8,
  },

  // ── Section heads (v3 Bricolage) ──
  categorySection: {
    marginTop: 28,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionTitleWrap: {
    gap: 3,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '500',
    fontFamily: fonts.displayMedium,
    letterSpacing: -0.7,
    lineHeight: 24,
  },
  sectionSub: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 16,
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
    paddingHorizontal: 20,
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
    gap: 10,
    paddingHorizontal: 20,
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
  coldStart: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32, gap: 12 },
  coldStartTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.18, fontFamily: fonts.display, lineHeight: 24 },
  coldStartHint: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: fonts.body },
  coldStartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, marginTop: 8, minHeight: 48 },
  coldStartBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 22 },

  // ── Building card (v3 ink-fill) ──
  bldCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    padding: 16,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  bldDecor: {
    position: 'absolute',
    right: -30,
    top: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  bldIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  bldText: {
    flex: 1,
  },
  bldLabel: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  bldName: {
    fontSize: 18,
    fontWeight: '500',
    fontFamily: fonts.displayMedium,
    letterSpacing: -0.4,
    lineHeight: 20,
    marginTop: 2,
  },
  bldStats: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
    marginTop: 4,
  },
  bldStatsStrong: {
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  bldArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Footer ──
  allLoadedWrap: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  allLoadedLine: { height: 1, width: '100%' },
  allLoadedContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allLoadedText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 16 },
})

export default function FeedScreen() {
  return (
    <ScreenErrorBoundary screenName="Feed">
      <FeedScreenInner />
    </ScreenErrorBoundary>
  )
}
