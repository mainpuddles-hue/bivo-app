import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, ViewToken, ScrollView, ActionSheetIOS, Alert, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sparkles, RefreshCw, Plus, Search, SlidersHorizontal, CheckCircle, X as XIcon, Map, LayoutGrid, Home } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { PressableOpacity } from '@/components/ui'
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
import { PostCardSkeleton, FeedLoadMoreSkeleton } from '@/components/SkeletonLoaders'
import { NeighborhoodPicker } from '@/components/NeighborhoodPicker'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { DiscoveryStack } from '@/components/DiscoveryStack'
import { FeedMapView } from '@/components/FeedMapView'
import { useSupabase } from '@/hooks/useSupabase'
import { FEATURES } from '@/lib/featureFlags'
import { PollCard, type Poll } from '@/components/PollCard'
import type { Post, PostType } from '@/lib/types'

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

  // Batch view counts for feed cards
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({})
  useEffect(() => {
    if (feed.posts.length === 0) return
    const postIds = feed.posts.map(p => p.id)
    ;(supabase.rpc as any)('get_post_view_counts_batch', { p_post_ids: postIds })
      .then(({ data }: any) => {
        if (!data) return
        const map: Record<string, number> = {}
        for (const row of data) map[row.post_id] = row.view_count
        setViewCounts(map)
      })
      .catch(() => {})
  }, [feed.posts, supabase])

  // Inline events — fetch 3 upcoming events to inject into feed
  const [inlineEvents, setInlineEvents] = useState<Post[]>([])
  useEffect(() => {
    const now = new Date().toISOString()
    Promise.resolve(
      supabase
        .from('events')
        .select('id, title, event_date, location_name, creator_id')
        .gte('event_date', now)
        .order('event_date', { ascending: true })
        .limit(3)
    ).then(({ data }) => {
      if (!data || data.length === 0) return
      // Convert to Post-like objects for PostCardGrid event variant
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
    }).catch(() => {})
  }, [supabase])

  // Fetch user's building info for community card
  const [userBuilding, setUserBuilding] = useState<{ street_address: string; member_count: number } | null>(null)
  useEffect(() => {
    if (!feed.currentUserId) return
    Promise.resolve(
      supabase
        .from('user_buildings')
        .select('building:buildings(street_address, member_count)')
        .eq('user_id', feed.currentUserId)
        .single()
    ).then(({ data }: any) => {
      if (data?.building) setUserBuilding(data.building)
    }).catch(() => {})
  }, [feed.currentUserId, supabase])

  // Fetch active polls for feed display
  const [feedPolls, setFeedPolls] = useState<Poll[]>([])
  useEffect(() => {
    if (!FEATURES.POLLS || !feed.currentUserId) return
    const now = new Date().toISOString()
    Promise.resolve(
      supabase
        .from('polls')
        .select('id, creator_id, question, options, building_id, naapurusto, vote_count, expires_at, created_at, is_active')
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('created_at', { ascending: false })
        .limit(3)
    ).then(async ({ data }) => {
      if (!data || data.length === 0) return
      // Check user's votes
      const pollIds = (data as any[]).map((p: any) => p.id)
      const { data: votes } = await Promise.resolve(
        supabase
          .from('poll_votes')
          .select('poll_id, option_index')
          .eq('user_id', feed.currentUserId!)
          .in('poll_id', pollIds)
      )
      const voteMap: Record<string, number> = {}
      if (votes) for (const v of votes as any[]) voteMap[v.poll_id] = v.option_index

      // Get vote counts per option
      const polls: Poll[] = (data as any[]).map((p: any) => ({
        ...p,
        options: p.options as string[],
        my_vote: voteMap[p.id] ?? null,
        option_counts: (p.options as string[]).map(() => 0), // Approximate — will be refined by vote_count
      }))
      setFeedPolls(polls)
    }).catch(() => {})
  }, [feed.currentUserId, supabase])

  // Fetch active ads for feed display
  const [feedAds, setFeedAds] = useState<Ad[]>([])
  useEffect(() => {
    if (!FEATURES.AD_CAMPAIGNS) return
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
    ).then(({ data }) => {
      if (!data || data.length === 0) return
      // Filter by neighborhood if user has one
      const nh = feed.userNeighborhood
      const filtered = nh
        ? (data as any[]).filter((a: any) => !a.target_naapurusto || a.target_naapurusto === nh)
        : (data as any[]).filter((a: any) => !a.target_naapurusto)
      const ads: Ad[] = (filtered.length > 0 ? filtered : (data as any[]).slice(0, 1)).map((a: any) => ({
        ...a,
        _isAd: true as const,
      }))
      setFeedAds(ads)
    }).catch(() => {})
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
  }, [feed.loading, feed.posts.length, feed.userNeighborhood])

  // Open neighborhood picker when navigated from settings with param
  useEffect(() => {
    if (params.openNeighborhoodPicker === '1') {
      feed.setShowNeighborhoodPicker(true)
    }
  }, [params.openNeighborhoodPicker])

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

  // ── Track post views via viewability ──
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50, minimumViewTime: 1000 }).current
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    for (const token of viewableItems) {
      if (token.isViewable && token.item?.id) {
        trackInteraction(token.item.id, 'view')
      }
    }
  }).current

  // ── Discovery stack (top 5) + remaining posts ──
  const DISCOVERY_COUNT = 5
  const discoveryPosts = useMemo(
    () => visiblePosts.slice(0, DISCOVERY_COUNT),
    [visiblePosts],
  )
  const remainingPosts = useMemo(() => {
    const posts = visiblePosts.slice(DISCOVERY_COUNT)
    if (inlineEvents.length === 0 && feedAds.length === 0) return posts
    // Inject events at positions 6, 12, 18 and ads at positions 4, 10
    const result: (Post | Ad)[] = []
    let eventIdx = 0
    let adIdx = 0
    for (let i = 0; i < posts.length; i++) {
      if ((i === 4 || i === 10) && adIdx < feedAds.length) {
        result.push(feedAds[adIdx++])
      }
      if ((i === 6 || i === 12 || i === 18) && eventIdx < inlineEvents.length) {
        result.push(inlineEvents[eventIdx++])
      }
      result.push(posts[i])
    }
    return result
  }, [visiblePosts, inlineEvents, feedAds])

  const renderPost = useCallback(({ item, index }: { item: Post | Ad; index: number }) => {
    // Render AdCard for ad items (full width — spans both columns)
    if ('_isAd' in item && item._isAd) {
      return (
        <View style={{ width: '100%', paddingHorizontal: 12 }}>
          <AdCard ad={item as Ad} />
        </View>
      )
    }
    return (
      <PostCardGrid
        post={item as Post}
        userId={feed.currentUserId}
        onInteraction={trackInteraction}
        index={index}
        sortBy={feed.sortBy}
        followedIds={feed.followedIds}
        viewCount={viewCounts[(item as Post).id]}
      />
    )
  }, [feed.currentUserId, trackInteraction, feed.sortBy, feed.followedIds, viewCounts])

  // ── Render ──
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {viewMode === 'map' ? (
        <>
          {/* Map header — same top area as list mode */}
          <View style={[styles.topArea, { paddingTop: insets.top + 16 }]}>
            <View style={styles.headerRow}>
              <PressableOpacity onPress={() => feed.setShowNeighborhoodPicker(true)} style={styles.headerLeft} hitSlop={8}>
                <Text style={[styles.headerLocation, { color: colors.mutedForeground }]}>
                  {feed.userNeighborhood ?? 'Helsinki'}
                  {onlineCount > 0 ? ` · ${onlineCount} ${t('feed.online') ?? 'paikalla'}` : ''}
                </Text>
                <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                  {t('feed.nearbyNow') ?? 'Nearby now'}
                </Text>
              </PressableOpacity>
              <View style={styles.headerRight}>
                <PressableOpacity
                  onPress={() => router.push('/search')}
                  style={[styles.circleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  accessibilityLabel={t('common.search')}
                  accessibilityRole="button"
                >
                  <Search size={16} color={colors.foreground} strokeWidth={2} />
                </PressableOpacity>
                <PressableOpacity
                  onPress={() => { try { Haptics.selectionAsync() } catch {} setViewMode('list') }}
                  style={[styles.circleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  accessibilityLabel={t('feed.listView') ?? 'List view'}
                  accessibilityRole="button"
                >
                  <LayoutGrid size={16} color={colors.foreground} strokeWidth={2} />
                </PressableOpacity>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }} style={styles.pillRow}>
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
        data={remainingPosts}
        renderItem={renderPost}
        keyExtractor={item => ('_isAd' in item ? `ad-${item.id}` : item.id)}
        numColumns={2}
        columnWrapperStyle={remainingPosts.length > 0 ? styles.columnWrapper : undefined}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, gap: 10 }}
        ListHeaderComponent={
          <View>
            {/* ── Top area with safe area padding ── */}
            <View style={[styles.topArea, { paddingTop: insets.top + 16 }]}>
              {/* 1. Header row — Monochrome 05 */}
              <View style={styles.headerRow}>
                <PressableOpacity onPress={() => feed.setShowNeighborhoodPicker(true)} style={styles.headerLeft} hitSlop={8}>
                  <Text style={[styles.headerLocation, { color: colors.mutedForeground }]}>
                    {feed.userNeighborhood ?? 'Helsinki'}
                    {onlineCount > 0 ? ` · ${onlineCount} ${t('feed.online') ?? 'paikalla'}` : ''}
                  </Text>
                  <Text style={[styles.headerTitle, { color: colors.foreground }]}>
                    {t('feed.nearbyNow') ?? 'Nearby now'}
                  </Text>
                </PressableOpacity>
                <View style={styles.headerRight}>
                  <PressableOpacity
                    onPress={() => router.push('/search')}
                    style={[styles.circleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    accessibilityLabel={t('common.search')}
                    accessibilityRole="button"
                  >
                    <Search size={16} color={colors.foreground} strokeWidth={2} />
                  </PressableOpacity>
                  <PressableOpacity
                    onPress={() => { try { Haptics.selectionAsync() } catch {} setViewMode(v => v === 'list' ? 'map' : 'list') }}
                    style={[styles.circleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                    accessibilityLabel={viewMode === 'list' ? (t('feed.mapView') ?? 'Map view') : (t('feed.listView') ?? 'List view')}
                    accessibilityRole="button"
                  >
                    {viewMode === 'list' ? (
                      <Map size={16} color={colors.foreground} strokeWidth={2} />
                    ) : (
                      <LayoutGrid size={16} color={colors.foreground} strokeWidth={2} />
                    )}
                  </PressableOpacity>
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
                    style={[styles.circleBtnDark, { backgroundColor: colors.foreground }]}
                    accessibilityLabel={t('feed.sort') ?? 'Sort'}
                    accessibilityRole="button"
                  >
                    <SlidersHorizontal size={16} color={colors.background} strokeWidth={2} />
                  </PressableOpacity>
                </View>
              </View>

              {/* 2. Category pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, alignItems: 'center' }}
                style={styles.pillRow}
              >
                <FilterBar activeFilter={feed.activeFilter} onFilterChange={handleFilterChangeWithHaptics} />
              </ScrollView>
            </View>

            {/* ── Active sort indicator ── */}
            {feed.sortBy !== 'recommended' && (
              <View style={[styles.sortIndicator, { paddingHorizontal: 20 }]}>
                <Text style={[styles.sortIndicatorText, { color: colors.mutedForeground }]}>
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

            {/* ── Banners ── */}
            <View style={{ paddingHorizontal: 20, gap: 8 }}>
              {/* Missed posts banner */}
              {showMissedBanner && missedCount > 0 && (
                <View style={[styles.missedBanner, { backgroundColor: colors.foreground }]}>
                  <Text style={[styles.missedBannerText, { color: colors.primaryForeground }]}>
                    {t('feed.missedPosts', { count: missedCount })}
                  </Text>
                  <PressableOpacity onPress={() => setShowMissedBanner(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.dismiss') ?? 'Dismiss'}>
                    <XIcon size={16} color={colors.primaryForeground} />
                  </PressableOpacity>
                </View>
              )}

              <AlertBanner />

              {/* New posts banner */}
              {feed.hasNewPosts && (
                <PressableOpacity
                  onPress={feed.handleRefresh}
                  accessibilityRole="button"
                  accessibilityLabel={t('feed.newPosts')}
                  style={[styles.newBanner, { backgroundColor: isDark ? `${colors.foreground}1F` : `${colors.foreground}14`, borderWidth: 1, borderColor: `${colors.foreground}33` }]}
                >
                  <Sparkles size={14} color={colors.foreground} />
                  <Text style={[styles.newBannerText, { color: colors.foreground }]}>{t('feed.newPosts')}</Text>
                  <RefreshCw size={14} color={colors.foreground} style={{ opacity: 0.7 }} />
                </PressableOpacity>
              )}

              {/* Error banner */}
              {feed.error && (
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
              )}
            </View>

            {/* ── Building community card ── */}
            {userBuilding && userBuilding.member_count > 1 && (
              <View style={[styles.buildingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.buildingIconWrap, { backgroundColor: `${colors.foreground}10` }]}>
                  <Home size={18} color={colors.foreground} />
                </View>
                <View style={styles.buildingCardText}>
                  <Text style={[styles.buildingCardTitle, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
                    {userBuilding.street_address}
                  </Text>
                  <Text style={[styles.buildingCardSub, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                    {t('feed.neighborsInBuilding', { count: userBuilding.member_count - 1 })}
                  </Text>
                </View>
                <PressableOpacity
                  onPress={() => { try { Haptics.selectionAsync() } catch {}; setViewMode('map') }}
                  style={[styles.buildingMapBtn, { backgroundColor: colors.foreground }]}
                  accessibilityLabel={t('feed.mapView') ?? 'Map view'}
                >
                  <Map size={14} color={colors.primaryForeground} />
                </PressableOpacity>
              </View>
            )}

            {/* ── Active polls ── */}
            {FEATURES.POLLS && feedPolls.length > 0 && (
              <View style={{ paddingHorizontal: 20, gap: 10, marginTop: 8 }}>
                {feedPolls.map(poll => (
                  <PollCard key={poll.id} poll={poll} userId={feed.currentUserId} />
                ))}
              </View>
            )}

            {/* ── 5. Discovery stack ── */}
            {feed.loading && visiblePosts.length === 0 ? (
              <View style={{ paddingHorizontal: 12, gap: 16, paddingTop: 16 }}>
                {[0, 1, 2, 3].map(i => <PostCardSkeleton key={i} />)}
              </View>
            ) : discoveryPosts.length > 0 ? (
              <DiscoveryStack
                posts={discoveryPosts}
                userId={feed.currentUserId}
                onInteraction={trackInteraction}
                userNeighborhood={feed.userNeighborhood}
                userLocation={feed.userLocation}
              />
            ) : !feed.loading ? (
              <View style={styles.coldStart}>
                <BoardIllustration size={80} />
                <Text style={[styles.coldStartTitle, { color: colors.foreground }]}>{t('feed.noPosts')}</Text>
                <Text style={[styles.coldStartHint, { color: colors.mutedForeground }]}>
                  {t('map.beFirstInArea', { area: feed.userNeighborhood ?? 'Helsinki' })}
                </Text>
                <PressableOpacity onPress={() => router.push('/(tabs)/create')} style={[styles.coldStartBtn, { backgroundColor: colors.foreground }]}>
                  <Plus size={16} color={colors.primaryForeground} />
                  <Text style={[styles.coldStartBtnText, { color: colors.primaryForeground }]}>{t('events.heroCreateCTA')}</Text>
                </PressableOpacity>
              </View>
            ) : null}

            {/* Spacer before remaining posts grid */}
            {remainingPosts.length > 0 && (
              <View style={styles.remainingHeader}>
                <Text style={[styles.remainingSectionTitle, { color: colors.foreground }]}>
                  {t('feed.morePosts') ?? 'More posts'}
                </Text>
              </View>
            )}
          </View>
        }
        ListFooterComponent={
          <>
            {feed.loading && feed.posts.length > 0 && <FeedLoadMoreSkeleton />}
            {!feed.hasMore && feed.posts.length >= 10 && (
              <View style={styles.allLoadedWrap}>
                <View style={[styles.allLoadedLine, { backgroundColor: `${colors.border}66` }]} />
                <View style={styles.allLoadedContent}>
                  <CheckCircle size={14} color={`${colors.mutedForeground}60`} />
                  <Text style={[styles.allLoadedText, { color: `${colors.mutedForeground}80` }]}>{t('feed.allCaughtUp')}</Text>
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
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        removeClippedSubviews={true}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={5}
      />
      )}

      {/* FAB — create new post */}
      <PressableOpacity
        onPress={() => router.push('/(tabs)/create')}
        style={[styles.fab, { backgroundColor: colors.foreground }]}
        accessibilityLabel={t('feed.createPost') ?? 'Create post'}
        accessibilityRole="button"
      >
        <Plus size={24} color={colors.background} strokeWidth={2.5} />
      </PressableOpacity>

      <NeighborhoodPicker
        visible={feed.showNeighborhoodPicker}
        onClose={() => feed.setShowNeighborhoodPicker(false)}
        selectedNeighborhood={feed.userNeighborhood}
        onSelect={feed.handleNeighborhoodSelect}
        neighborhoods={feed.cityNeighborhoods.length > 0 ? feed.cityNeighborhoods : undefined}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  columnWrapper: { gap: 10, paddingHorizontal: 12 },

  // ── Top area ──
  topArea: {
    paddingHorizontal: 20,
  },

  // 1. Header row — Monochrome 05
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  headerLocation: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    lineHeight: 14,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  circleBtnDark: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sort indicator
  sortIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 4,
  },
  sortIndicatorText: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  // 2. Category pills
  pillRow: {
    marginBottom: 18,
  },

  // Remaining posts header
  remainingHeader: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  remainingSectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.2,
    lineHeight: 22,
  },

  // FAB
  fab: {
    position: 'absolute', right: 20, bottom: 92,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1A1D1F', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },

  // Banners
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

  // Cold start / empty
  coldStart: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32, gap: 12 },
  coldStartTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.18, fontFamily: fonts.heading, lineHeight: 24 },
  coldStartHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  coldStartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, marginTop: 8, minHeight: 48 },
  coldStartBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 22 },

  // Building community card
  buildingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginTop: 12, marginBottom: 4,
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 20, borderWidth: 1,
  },
  buildingIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  buildingCardText: { flex: 1, gap: 2 },
  buildingCardTitle: { fontSize: 14, lineHeight: 18 },
  buildingCardSub: { fontSize: 12, lineHeight: 16 },
  buildingMapBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },

  // Footer
  allLoadedWrap: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  allLoadedLine: { height: 1, width: '100%' },
  allLoadedContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allLoadedText: { fontSize: 11, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 14 },
})

export default function FeedScreen() {
  return (
    <ScreenErrorBoundary screenName="Feed">
      <FeedScreenInner />
    </ScreenErrorBoundary>
  )
}
