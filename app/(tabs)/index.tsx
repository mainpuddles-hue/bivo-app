import { useCallback, useEffect, useMemo, useRef } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, Pressable, ActivityIndicator, ViewToken } from 'react-native'
import { useRouter } from 'expo-router'
import { Sparkles, RefreshCw, Users, Plus, MapPin, ChevronDown, CheckCircle } from 'lucide-react-native'
import { BoardIllustration } from '@/components/illustrations'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useFeedData } from '@/hooks/useFeedData'
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

function FeedScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()

  const feed = useFeedData()
  const { matches, dismissMatch } = useSmartMatch(feed.currentUserId)
  const { recordActivity } = useStreak(feed.currentUserId)
  const { trackInteraction } = useInteractionTracker(feed.currentUserId)
  useEffect(() => { recordActivity() }, [recordActivity])

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
  const renderPost = useCallback(({ item, index }: { item: Post; index: number }) => {
    const currentGroup = item.created_at ? getDateGroup(item.created_at) : ''
    const prevGroup = index > 0 && feed.postsRef.current[index - 1]?.created_at
      ? getDateGroup(feed.postsRef.current[index - 1].created_at!) : ''
    const showLabel = index > 0 && currentGroup !== prevGroup

    return (
      <View>
        {showLabel && currentGroup ? (
          <View style={styles.dateGroupLabel}>
            <View style={[styles.dateGroupLine, { backgroundColor: `${colors.border}88` }]} />
            <Text style={[styles.dateGroupText, { color: colors.mutedForeground }]}>{t(`feed.${currentGroup}`)}</Text>
            <View style={[styles.dateGroupLine, { backgroundColor: `${colors.border}88` }]} />
          </View>
        ) : null}
        <PostCard post={item} userLocation={feed.userLocation} userId={feed.currentUserId} onInteraction={trackInteraction} />
      </View>
    )
  }, [feed.userLocation, feed.currentUserId, colors.mutedForeground, colors.border, t, trackInteraction])

  // ── ListHeader ──
  const ListHeader = useMemo(() => (
    <View style={{ gap: 16 }}>
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

      {/* Contextual greeting */}
      <FeedContextHeader
        neighborhood={feed.userNeighborhood}
        postCount={feed.posts.length}
        loading={feed.loading}
      />

      {/* Discovery: nearby places carousel */}
      <DiscoverySection
        nearbyPlaces={feed.nearbyPlaces}
        extraLoading={feed.extraLoading}
        placesSectionTitle={placesSectionTitle}
      />

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

      {/* Section header — only when posts exist */}
      {feed.posts.length > 0 && (
        <View style={styles.compactSectionHeader}>
          <Text style={[styles.compactSectionTitle, { color: colors.foreground }]}>{t('feed.latestListings')}</Text>
        </View>
      )}
    </View>
  ), [displayEvents, eventSectionTitle, feed.hasNewPosts, feed.error, feed.handleRefresh, isDark, colors, t,
    feed.posts, feed.posts.length, feed.loading, feed.userNeighborhood, feed.cityEvents, feed.nearbyPlaces, feed.extraLoading,
    placesSectionTitle, matches, dismissMatch])

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
        <Pressable onPress={() => feed.setShowNeighborhoodPicker(true)} style={styles.neighborhoodBtn} hitSlop={4}>
          <MapPin size={12} color={colors.mutedForeground} />
          <Text style={[styles.neighborhoodText, { color: colors.mutedForeground }]}>
            {feed.userNeighborhood ? `Helsinki · ${feed.userNeighborhood}` : 'Helsinki'}
          </Text>
          <ChevronDown size={12} color={colors.mutedForeground} style={{ opacity: 0.6 }} />
        </Pressable>
        <View style={styles.filterRow}>
          <FilterBar activeFilter={feed.activeFilter} onFilterChange={feed.handleFilterChange} />
        </View>
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
      </View>

      <FlatList
        data={feed.posts}
        renderItem={renderPost}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingTop: 76 }]}
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
  coldStartTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.18 },
  coldStartHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  coldStartBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  coldStartBtnText: { fontSize: 15, fontWeight: '600' },
  allLoadedWrap: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  allLoadedLine: { height: 1, width: '100%' },
  allLoadedContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  allLoadedText: { fontSize: 11, fontWeight: '500' },
})

export default function FeedScreen() {
  return (
    <ScreenErrorBoundary screenName="Feed">
      <FeedScreenInner />
    </ScreenErrorBoundary>
  )
}
