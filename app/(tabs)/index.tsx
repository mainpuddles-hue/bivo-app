import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, ViewToken, ScrollView, ActionSheetIOS, Alert, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sparkles, RefreshCw, Users, Plus, MapPin, ChevronDown, CheckCircle, X as XIcon, ArrowUpDown } from 'lucide-react-native'
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
import { AlertBanner } from '@/components/AlertBanner'
import { PostCardSkeleton, FeedLoadMoreSkeleton } from '@/components/SkeletonLoaders'
import { NeighborhoodPicker } from '@/components/NeighborhoodPicker'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import type { Post } from '@/lib/types'

const FILTER_BAR_CONTENT_HEIGHT = 80

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
  usePresence(feed.currentUserId, feed.userNeighborhood)
  useSessionManager(feed.currentUserId)

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

  // Evening digest removed — content-first: feed IS the digest

  // Wrap filter change with haptic feedback
  const handleFilterChangeWithHaptics = useCallback((type: import('@/lib/types').PostType | null) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    feed.handleFilterChange(type)
  }, [feed.handleFilterChange])

  // Wrap sort change with haptic feedback
  const handleSortChangeWithHaptics = useCallback((sort: FeedSortBy) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    feed.handleSortChange(sort)
  }, [feed.handleSortChange])

  // Sort options — keep simple: newest (default) + nearest
  const SORT_OPTIONS: { key: FeedSortBy; label: string }[] = useMemo(() => [
    { key: 'newest', label: t('feed.sortNewest') },
    { key: 'nearest', label: t('feed.sortNearest') },
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
    // Keep setState as a pure updater (no side effects inside) and persist
    // exactly once outside React's render loop. Prevents StrictMode from
    // firing AsyncStorage.setItem twice under React 19.
    setHiddenIds(next)
    AsyncStorage.setItem('tackbird_hidden_posts', JSON.stringify([...next])).catch(() => {})
  }, [])

  // ── TODO 6: "Seen" / new indicator ──
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

  // ── Computed: hero events ──
  // Hero events + discovery moved to Explore tab (content-first feed)

  const renderPost = useCallback(({ item, index }: { item: Post; index: number }) => (
    <PostCardGrid
      post={item}
      userId={feed.currentUserId}
      onInteraction={trackInteraction}
      index={index}
    />
  ), [feed.currentUserId, trackInteraction])

  // ── ListHeader — content-first: only essential contextual banners ──
  const ListHeader = useMemo(() => (
    <View style={{ gap: 8 }}>
      {/* Missed posts — only when returning after 24h+ */}
      {showMissedBanner && missedCount > 0 && (
        <View style={[styles.missedBanner, { backgroundColor: colors.primary }]}>
          <Text style={[styles.missedBannerText, { color: colors.primaryForeground }]}>
            {t('feed.missedPosts', { count: missedCount })}
          </Text>
          <PressableOpacity onPress={() => setShowMissedBanner(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.dismiss') ?? 'Dismiss'}>
            <XIcon size={16} color={colors.primaryForeground} />
          </PressableOpacity>
        </View>
      )}

      <AlertBanner />

      {/* New posts — pull-to-refresh alternative */}
      {feed.hasNewPosts && (
        <PressableOpacity
          onPress={feed.handleRefresh}
          accessibilityRole="button"
          accessibilityLabel={t('feed.newPosts')}
          style={[styles.newBanner, { backgroundColor: isDark ? `${colors.primary}1F` : `${colors.primary}14`, borderWidth: 1, borderColor: `${colors.primary}33` }]}
        >
          <Sparkles size={14} color={colors.primary} />
          <Text style={[styles.newBannerText, { color: colors.primary }]}>{t('feed.newPosts')}</Text>
          <RefreshCw size={14} color={colors.primary} style={{ opacity: 0.7 }} />
        </PressableOpacity>
      )}

      {/* Error */}
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
  ), [feed.hasNewPosts, feed.error, feed.handleRefresh, isDark, colors, t,
    showMissedBanner, missedCount])

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
        <PressableOpacity onPress={() => router.push('/(tabs)/create')} style={[styles.coldStartBtn, { backgroundColor: colors.primary }]}>
          <Plus size={16} color={colors.primaryForeground} />
          <Text style={[styles.coldStartBtnText, { color: colors.primaryForeground }]}>{t('events.heroCreateCTA')}</Text>
        </PressableOpacity>
      </View>
    )
  }, [feed.loading, feed.userNeighborhood, colors, t, router])

  // ── Footer ──
  const FooterComponent = useMemo(() => {
    const sections: React.ReactNode[] = []
    if (feed.loading && feed.posts.length > 0) {
      sections.push(<FeedLoadMoreSkeleton key="loader" />)
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
      <View style={[styles.filterWrapper, { backgroundColor: colors.background, borderBottomColor: colors.border, paddingTop: 4 }]}>
        <View style={styles.neighborhoodRow}>
          <PressableOpacity onPress={() => feed.setShowNeighborhoodPicker(true)} style={styles.neighborhoodBtn} hitSlop={8}>
            <MapPin size={20} color={colors.foreground} />
            <Text style={[styles.neighborhoodText, { color: colors.foreground }]}>
              {feed.userNeighborhood ? `${feed.userCityName ?? 'Helsinki'} · ${feed.userNeighborhood}` : (feed.userCityName ?? 'Helsinki')}
            </Text>
            <ChevronDown size={16} color={colors.primary} />
          </PressableOpacity>
          {/* Sort — single button, opens ActionSheet */}
          <PressableOpacity
            onPress={() => {
              const labels = SORT_OPTIONS.map(o => o.label).concat(t('common.cancel') ?? 'Cancel')
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
            style={[styles.sortBtn, { backgroundColor: isDark ? colors.card : colors.muted }]}
            hitSlop={8}
            accessibilityLabel={t('feed.sort') ?? 'Sort'}
          >
            <ArrowUpDown size={14} color={colors.mutedForeground} />
          </PressableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8, alignItems: 'center', paddingHorizontal: 16 }}>
          <FilterBar activeFilter={feed.activeFilter} onFilterChange={handleFilterChangeWithHaptics} />
          {feed.followedIds.length > 0 && (
            <PressableOpacity
              onPress={() => feed.setShowFollowing(p => !p)}
              style={[styles.followingBtn, feed.showFollowing ? { backgroundColor: colors.primary } : { backgroundColor: isDark ? colors.card : colors.muted }]}
              accessibilityRole="button"
              accessibilityLabel={t('feed.following')}
              accessibilityState={{ selected: feed.showFollowing }}
            >
              <Users size={14} color={feed.showFollowing ? colors.primaryForeground : colors.mutedForeground} strokeWidth={1.8} />
              <Text style={[styles.followingText, { color: feed.showFollowing ? colors.primaryForeground : colors.mutedForeground }]}>
                {t('feed.following')}
              </Text>
            </PressableOpacity>
          )}
        </ScrollView>
      </View>

      <FlatList
        data={visiblePosts}
        renderItem={renderPost}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 12 }}
        contentContainerStyle={{ paddingTop: FILTER_BAR_CONTENT_HEIGHT, paddingBottom: insets.bottom + 96, gap: 10 }}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={EmptyComponent}
        ListFooterComponent={FooterComponent}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.handleRefresh} tintColor={colors.primary} />}
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
    paddingBottom: 12, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  neighborhoodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  neighborhoodBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, alignSelf: 'flex-start', minHeight: 44 },
  neighborhoodText: { fontSize: 17, fontWeight: '700', fontFamily: fonts.heading, letterSpacing: -0.3 },
  filterRow: { paddingBottom: 0 },
  followingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    alignSelf: 'flex-start', minHeight: 44,
  },
  followingText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 16 },
  sortBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  newBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 16, paddingVertical: 12, minHeight: 44,
  },
  newBannerText: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12,
  },
  errorRowText: { fontSize: 13, fontFamily: fonts.bodySemi, flex: 1, lineHeight: 18 },
  coldStart: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32, gap: 12 },
  coldStartTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.18, fontFamily: fonts.heading, lineHeight: 24 },
  coldStartHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  coldStartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 16, marginTop: 8, minHeight: 48 },
  coldStartBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 22 },
  allLoadedWrap: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  allLoadedLine: { height: 1, width: '100%' },
  allLoadedContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allLoadedText: { fontSize: 11, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 14 },
  missedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16,
  },
  missedBannerText: { fontSize: 14, fontWeight: '600', flex: 1, fontFamily: fonts.bodySemi, lineHeight: 20 },
  // streakMilestone, digestCard — removed (content-first: moved to Explore tab)
})

export default function FeedScreen() {
  return (
    <ScreenErrorBoundary screenName="Feed">
      <FeedScreenInner />
    </ScreenErrorBoundary>
  )
}
