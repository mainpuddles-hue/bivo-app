import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, Pressable, ActivityIndicator, ViewToken, ScrollView } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sparkles, RefreshCw, Users, Plus, MapPin, ChevronDown, CheckCircle, Flame, X as XIcon } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { BoardIllustration } from '@/components/illustrations'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useFeedData } from '@/hooks/useFeedData'
import { useSupabase } from '@/hooks/useSupabase'
import { useSmartMatch } from '@/hooks/useSmartMatch'
import { useStreak } from '@/hooks/useStreak'
import { useInteractionTracker } from '@/hooks/useInteractionTracker'
import { FilterBar } from '@/components/FilterBar'
import { PostCard } from '@/components/PostCard'
import { AlertBanner } from '@/components/AlertBanner'
import { SmartMatchBanner } from '@/components/SmartMatchBanner'
import { DiscoverySection } from '@/components/DiscoverySection'
import { PostCardSkeleton } from '@/components/SkeletonLoaders'
import { HeroEventCard } from '@/components/HeroEventCard'
import { NeighborhoodPicker } from '@/components/NeighborhoodPicker'
import { FeedContextHeader } from '@/components/FeedContextHeader'
import { JuuriNytStrip } from '@/components/JuuriNytStrip'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { AdCard } from '@/components/AdCard'
import type { Ad } from '@/components/AdCard'
import type { Post } from '@/lib/types'
import { isToday, isTomorrow, isWithinDays, getDateGroup } from '@/lib/dateHelpers'

// ── Stable separator components (avoid re-render) ──
const ItemSeparator12 = () => <View style={{ height: 12 }} />

// ══════════════════════════════════════════════
// ── Feed Screen ──
// ══════════════════════════════════════════════

// TODO: UX — FEED FATIGUE (ongoing friction for returning users):
//
// 1. HIDE/DISMISS POST: Add a swipe-to-dismiss or "Not interested" option on
//    PostCard (long-press menu?). Track hidden post IDs in AsyncStorage and
//    filter them from feed. The PostCard already accepts onInteraction with 'hide'
//    type but nothing uses it — wire it up.
//
// 2. MUTE USER: Allow muting a user's posts from PostCard menu. Store muted
//    user IDs in AsyncStorage and filter their posts from feed query results.
//
// 3. SEEN INDICATOR: Track which post IDs the user has scrolled past
//    (viewability tracking exists via onViewableItemsChanged). Use this to show
//    a subtle "new" badge on unseen posts, or dim already-seen posts.
//
// 4. STALE FEED ON RETURN: When user opens app after days, feed should
//    auto-sort by newest and show a "You missed X new posts" banner with the
//    count since last visit. Currently feed always starts fresh from newest,
//    but there's no indication of what's new vs already seen.

const HEADER_HEIGHT = 52 // Header.tsx headerContent height
const FILTER_BAR_BASE_HEIGHT = 88

function FeedScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const feed = useFeedData()
  const supabase = useSupabase()
  const { matches, dismissMatch } = useSmartMatch(feed.currentUserId)
  const { recordActivity, currentStreak } = useStreak(feed.currentUserId)
  const { trackInteraction } = useInteractionTracker(feed.currentUserId)
  useEffect(() => { recordActivity() }, [recordActivity])

  // Wrap filter change with haptic feedback
  const handleFilterChangeWithHaptics = useCallback((type: import('@/lib/types').PostType | null) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    feed.handleFilterChange(type)
  }, [feed.handleFilterChange])

  // ── Ads in feed ──
  const [activeAds, setActiveAds] = useState<Ad[]>([])
  useEffect(() => {
    async function fetchAds() {
      try {
        const now = new Date().toISOString()
        let query = (supabase.from('advertisements') as any)
          .select('id, user_id, title, description, image_url, link_url, cta_text, target_naapurusto, start_date, end_date, status, created_at')
          .eq('status', 'active')
          .lte('start_date', now)
          .gte('end_date', now)
          .limit(5)

        if (feed.userNeighborhood) {
          query = query.or(`target_naapurusto.eq.${feed.userNeighborhood},target_naapurusto.is.null`)
        }

        const { data } = await query
        if (data) {
          setActiveAds(data.map((a: any) => ({ ...a, _isAd: true as const })))
        }
      } catch {
        // advertisements table may not exist yet — ignore
      }
    }
    fetchAds()
  }, [supabase, feed.userNeighborhood])

  // ── TODO 1: Hidden post IDs ──
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const handleHidePost = useCallback((postId: string) => {
    setHiddenIds(prev => { const next = new Set(prev); next.add(postId); return next })
  }, [])

  // ── TODO 6: "Seen" / new indicator ──
  const [lastFeedVisit, setLastFeedVisit] = useState<string | null>(null)
  const [missedCount, setMissedCount] = useState(0)
  const [showMissedBanner, setShowMissedBanner] = useState(false)
  useEffect(() => {
    AsyncStorage.getItem('tackbird_last_feed_visit').then(val => {
      if (val) setLastFeedVisit(val)
    })
    return () => {
      AsyncStorage.setItem('tackbird_last_feed_visit', new Date().toISOString())
    }
  }, [])

  // ── Fix 3: "Missed posts" banner when returning after 24h+ ──
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

  // Interleave ads every 5th post
  const visiblePosts = useMemo(() => {
    if (activeAds.length === 0) return filteredPosts
    const result: (Post | Ad)[] = []
    let adIdx = 0
    for (let i = 0; i < filteredPosts.length; i++) {
      result.push(filteredPosts[i])
      if ((i + 1) % 5 === 0 && adIdx < activeAds.length) {
        result.push(activeAds[adIdx])
        adIdx++
      }
    }
    return result
  }, [filteredPosts, activeAds])

  // Ref for visiblePosts so renderPost can access it without dependency
  const visiblePostsRef = useRef(visiblePosts)
  visiblePostsRef.current = visiblePosts

  // ── Track post views via viewability ──
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50, minimumViewTime: 1000 }).current
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    for (const token of viewableItems) {
      if (token.isViewable && token.item?.id) {
        trackInteraction(token.item.id, 'view')
      }
    }
  }).current

  // ── Computed: hero events ──
  const { displayEvents, eventSectionTitle } = useMemo(() => {
    const todayEvts = feed.cityEvents.filter(e => isToday(e.start_time))
    const tomorrowEvts = !todayEvts.length ? feed.cityEvents.filter(e => isTomorrow(e.start_time)) : []
    const weekEvts = !todayEvts.length && !tomorrowEvts.length ? feed.cityEvents.filter(e => isWithinDays(e.start_time, 7)) : []
    const display = todayEvts.length ? todayEvts : tomorrowEvts.length ? tomorrowEvts : weekEvts
    const title = todayEvts.length ? t('events.filterToday') + ' (' + todayEvts.length + ')'
      : tomorrowEvts.length ? t('feed.tomorrow') + ' (' + tomorrowEvts.length + ')'
      : weekEvts.length ? t('feed.thisWeek') + ' (' + weekEvts.length + ')' : ''
    return { displayEvents: display.slice(0, 1), eventSectionTitle: title }
  }, [feed.cityEvents, t])

  const placesSectionTitle = useMemo(() => {
    if (feed.userLocation) return t('feed.placesNearYou')
    if (feed.userNeighborhood) return t('feed.placesIn', { area: feed.userNeighborhood })
    return t('feed.placesInHelsinki')
  }, [feed.userLocation, feed.userNeighborhood, t])

  // ── renderPost — uses postsRef to avoid full FlatList re-render ──
  const renderPost = useCallback(({ item, index }: { item: Post | Ad; index: number }) => {
    // Render ad card
    if ('_isAd' in item && item._isAd) {
      return <AdCard ad={item as Ad} />
    }

    const post = item as Post
    const currentGroup = post.created_at ? getDateGroup(post.created_at) : ''
    // Walk backwards to find the previous non-ad item for date group comparison
    let prevGroup = ''
    for (let i = index - 1; i >= 0; i--) {
      const prev = visiblePostsRef.current[i]
      if (prev && !('_isAd' in prev) && (prev as Post).created_at) {
        prevGroup = getDateGroup((prev as Post).created_at!)
        break
      }
    }
    const showLabel = index > 0 && currentGroup !== prevGroup
    const postIsNew = !!(lastFeedVisit && post.created_at && post.created_at > lastFeedVisit)

    return (
      <View>
        {showLabel && currentGroup ? (
          <View style={styles.dateGroupLabel}>
            <View style={[styles.dateGroupLine, { backgroundColor: `${colors.border}88` }]} />
            <Text style={[styles.dateGroupText, { color: colors.mutedForeground }]}>{t(`feed.${currentGroup}`)}</Text>
            <View style={[styles.dateGroupLine, { backgroundColor: `${colors.border}88` }]} />
          </View>
        ) : null}
        <PostCard post={post} userLocation={feed.userLocation} userId={feed.currentUserId} onInteraction={trackInteraction} onHide={handleHidePost} isNew={postIsNew} />
      </View>
    )
  }, [feed.userLocation, feed.currentUserId, colors.mutedForeground, colors.border, t, trackInteraction, handleHidePost, lastFeedVisit])

  // ── ListHeader ──
  const ListHeader = useMemo(() => (
    <View style={{ gap: 12 }}>
      {/* Greeting */}
      <View style={{ alignItems: 'center', paddingTop: 8 }}>
        <Text style={{ fontSize: 17, color: colors.primary, fontFamily: fonts.headingSemi, letterSpacing: -0.2 }}>
          {t('feed.greeting', { area: feed.userNeighborhood ?? (feed.userCityName ?? 'Helsinki') })}
        </Text>
        {feed.posts.length > 0 && (
          <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body, marginTop: 2 }}>
            {t('feed.postCount', { count: feed.posts.length })}
          </Text>
        )}
      </View>

      {/* Missed posts banner */}
      {showMissedBanner && missedCount > 0 && (
        <View style={[styles.missedBanner, { backgroundColor: colors.primary }]}>
          <Text style={styles.missedBannerText}>
            {t('feed.missedPosts', { count: missedCount })}
          </Text>
          <Pressable onPress={() => setShowMissedBanner(false)} hitSlop={8}>
            <XIcon size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      )}

      <AlertBanner />

      <SmartMatchBanner matches={matches} onDismiss={dismissMatch} />

      {/* Juuri nyt — urgent posts countdown strip */}
      <JuuriNytStrip posts={feed.posts} />

      {displayEvents.length > 0 ? (
        <View style={{ gap: 10 }}>
          <View style={[styles.sectionHeader, { paddingHorizontal: 4 }]}>
            <View style={[styles.sectionBar, { backgroundColor: '#2B8A62' }]} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{eventSectionTitle}</Text>
          </View>
          {displayEvents.map(event => (
            <HeroEventCard key={event.id} event={event} />
          ))}
        </View>
      ) : null}

      {/* FeedContextHeader removed — feed IS the listings, no redundant header needed */}

      {/* DiscoverySection removed from feed — belongs in Explore tab */}

      {/* New posts banner */}
      {feed.hasNewPosts && (
        <Pressable
          onPress={feed.handleRefresh}
          style={[styles.newBanner, { backgroundColor: isDark ? `${colors.primary}1F` : `${colors.primary}14` }]}
        >
          <Sparkles size={14} color={colors.primary} />
          <Text style={[styles.newBannerText, { color: colors.primary }]}>{t('feed.newPosts')}</Text>
          <RefreshCw size={14} color={colors.primary} style={{ opacity: 0.7 }} />
        </Pressable>
      )}

      {/* Error — compact inline */}
      {feed.error && (
        <Pressable
          onPress={feed.handleRefresh}
          style={[styles.errorRow, { backgroundColor: `${colors.destructive}10` }]}
        >
          <RefreshCw size={14} color={colors.destructive} />
          <Text style={[styles.errorRowText, { color: colors.destructive }]} numberOfLines={1}>{feed.error}</Text>
        </Pressable>
      )}

      {/* "Uusimmat ilmoitukset" section header removed — feed IS the listings */}
    </View>
  ), [displayEvents, eventSectionTitle, feed.hasNewPosts, feed.error, feed.handleRefresh, isDark, colors, t,
    feed.posts, feed.posts.length, feed.loading, feed.userNeighborhood, feed.cityEvents, feed.nearbyPlaces, feed.extraLoading,
    placesSectionTitle, matches, dismissMatch, showMissedBanner, missedCount])

  // ── Empty state ──
  const EmptyComponent = useMemo(() => {
    if (feed.loading) {
      return (
        <View style={{ gap: 16 }}>
          {[0, 1, 2, 3].map(i => <PostCardSkeleton key={i} />)}
        </View>
      )
    }
    return (
      <View style={styles.coldStart}>
        <BoardIllustration size={80} />
        <Text style={[styles.coldStartTitle, { color: colors.foreground }]}>{t('feed.noPosts')}</Text>
        <Text style={[styles.coldStartHint, { color: colors.mutedForeground }]}>
          {t('map.beFirstInArea', { area: feed.userNeighborhood ?? 'Helsinki' })}
        </Text>
        <Pressable onPress={() => router.push('/create')} style={[styles.coldStartBtn, { backgroundColor: colors.primary }]}>
          <Plus size={16} color={colors.primaryForeground} />
          <Text style={[styles.coldStartBtnText, { color: colors.primaryForeground }]}>{t('events.heroCreateCTA')}</Text>
        </Pressable>
      </View>
    )
  }, [feed.loading, feed.userNeighborhood, colors, t, router])

  // ── Footer ──
  const FooterComponent = useMemo(() => {
    const sections: React.ReactNode[] = []
    if (feed.loading && feed.posts.length > 0) {
      sections.push(<ActivityIndicator key="loader" size="small" color={colors.mutedForeground} style={{ marginVertical: 20 }} />)
    }
    if (!feed.hasMore && feed.posts.length >= 10) {
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
  }, [feed.loading, feed.hasMore, feed.posts.length, colors, t])

  // ── Render ──
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Sticky filter bar */}
      <View style={[styles.filterWrapper, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.neighborhoodRow}>
          <Pressable onPress={() => feed.setShowNeighborhoodPicker(true)} style={styles.neighborhoodBtn} hitSlop={4}>
            <MapPin size={12} color={colors.mutedForeground} />
            <Text style={[styles.neighborhoodText, { color: colors.mutedForeground }]}>
              {feed.userNeighborhood ? `${feed.userCityName ?? 'Helsinki'} · ${feed.userNeighborhood}` : (feed.userCityName ?? 'Helsinki')}
            </Text>
            <ChevronDown size={12} color={colors.mutedForeground} style={{ opacity: 0.6 }} />
          </Pressable>
          {currentStreak > 0 && (
            <View style={[styles.streakBadge, { backgroundColor: isDark ? '#F59E0B18' : '#FDF6E8' }]}>
              <Text style={[styles.streakText, { color: colors.pro }]}>{currentStreak}</Text>
              <Flame size={14} color={colors.pro} />
            </View>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
          <FilterBar activeFilter={feed.activeFilter} onFilterChange={handleFilterChangeWithHaptics} />
          {feed.followedIds.length > 0 && (
            <Pressable
              onPress={() => feed.setShowFollowing(p => !p)}
              style={[styles.followingBtn, feed.showFollowing ? { backgroundColor: colors.primary } : { backgroundColor: isDark ? colors.card : colors.muted }]}
            >
              <Users size={14} color={feed.showFollowing ? colors.primaryForeground : colors.mutedForeground} strokeWidth={1.75} />
              <Text style={[styles.followingText, { color: feed.showFollowing ? colors.primaryForeground : colors.mutedForeground }]}>
                {t('feed.following')}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>

      <FlatList
        data={visiblePosts}
        renderItem={renderPost}
        keyExtractor={item => ('_isAd' in item ? `ad-${item.id}` : item.id)}
        contentContainerStyle={[styles.list, { paddingTop: FILTER_BAR_BASE_HEIGHT }]}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={EmptyComponent}
        ListFooterComponent={FooterComponent}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.handleRefresh} tintColor={colors.primary} />}
        onEndReached={feed.handleLoadMore}
        onEndReachedThreshold={0.3}
        scrollEventThrottle={16}
        ItemSeparatorComponent={ItemSeparator12}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

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
  filterWrapper: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
  },
  neighborhoodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  neighborhoodBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, alignSelf: 'flex-start', minHeight: 32 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  streakText: { fontSize: 13, fontWeight: '700', fontFamily: fonts.heading },
  neighborhoodText: { fontSize: 12, fontFamily: fonts.body },
  dateGroupLabel: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, paddingBottom: 10 },
  dateGroupLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateGroupText: { fontSize: 11, fontFamily: fonts.body, letterSpacing: 0.3 },
  list: { paddingHorizontal: 16, paddingBottom: 96 },
  filterRow: { paddingBottom: 0 },
  followingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    alignSelf: 'flex-start', minHeight: 40,
  },
  followingText: { fontSize: 12, fontWeight: '500' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  sectionBar: { width: 3, height: 16, borderRadius: 1.5 },
  sectionTitle: { fontSize: 16, fontFamily: fonts.headingSemi, letterSpacing: -0.16, flex: 1 },
  newBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 10, minHeight: 44,
  },
  newBannerText: { fontSize: 14, fontFamily: fonts.bodySemi },
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  errorRowText: { fontSize: 13, fontFamily: fonts.bodySemi, flex: 1 },
  compactSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  compactSectionTitle: { fontSize: 14, fontFamily: fonts.headingSemi, letterSpacing: -0.16, flex: 1 },
  coldStart: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32, gap: 12 },
  coldStartTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.18, fontFamily: fonts.heading },
  coldStartHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  coldStartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8, minHeight: 48 },
  coldStartBtnText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.bodySemi },
  allLoadedWrap: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  allLoadedLine: { height: 1, width: '100%' },
  allLoadedContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  allLoadedText: { fontSize: 11, fontWeight: '500', fontFamily: fonts.bodyMedium },
  missedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
  },
  missedBannerText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', flex: 1, fontFamily: fonts.bodySemi },
  // neighborsActiveRow removed per user request
  _neighborsActiveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
  },
  greenDot: { width: 8, height: 8, borderRadius: 4 },
  neighborsActiveText: { fontSize: 12, fontFamily: fonts.body },
})

export default function FeedScreen() {
  return (
    <ScreenErrorBoundary screenName="Feed">
      <FeedScreenInner />
    </ScreenErrorBoundary>
  )
}
