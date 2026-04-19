import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, ViewToken, ScrollView, ActionSheetIOS, Alert, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sparkles, RefreshCw, Users, Plus, Search, SlidersHorizontal, CheckCircle, X as XIcon } from 'lucide-react-native'
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

function FeedScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ openNeighborhoodPicker?: string }>()
  const [headerHeight, setHeaderHeight] = useState(160)

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

      {/* New posts — pull-to-refresh alternative */}
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
        <PressableOpacity onPress={() => router.push('/(tabs)/create')} style={[styles.coldStartBtn, { backgroundColor: colors.foreground }]}>
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
      {/* Sticky header — matches Helsinki Monochrome mockup 05 */}
      <View
        style={[styles.filterWrapper, { backgroundColor: colors.background, borderBottomColor: colors.border, paddingTop: insets.top }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        {/* Location eyebrow + title + action circles */}
        <View style={styles.headerRow}>
          <PressableOpacity onPress={() => feed.setShowNeighborhoodPicker(true)} style={styles.headerLeft} hitSlop={8}>
            <Text style={[styles.locationEyebrow, { color: colors.mutedForeground }]}>
              {feed.userNeighborhood
                ? `${feed.userNeighborhood} · ${feed.userCityName ?? 'Helsinki'}`
                : (feed.userCityName ?? 'Helsinki')}
            </Text>
            <Text style={[styles.feedTitle, { color: colors.foreground }]}>
              {t('feed.nearbyNow') ?? 'Lähellä nyt'}
            </Text>
          </PressableOpacity>
          <View style={styles.headerActions}>
            <PressableOpacity
              onPress={() => router.push('/search')}
              style={[styles.iconCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityLabel={t('common.search')}
              accessibilityRole="button"
            >
              <Search size={16} color={colors.mutedForeground} strokeWidth={2} />
            </PressableOpacity>
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
              style={[styles.iconCircleDark, { backgroundColor: colors.foreground }]}
              accessibilityLabel={t('feed.sort') ?? 'Sort'}
              accessibilityRole="button"
            >
              <SlidersHorizontal size={16} color={colors.background} strokeWidth={2} />
            </PressableOpacity>
          </View>
        </View>
        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8, alignItems: 'center', paddingHorizontal: 16 }}>
          <FilterBar activeFilter={feed.activeFilter} onFilterChange={handleFilterChangeWithHaptics} />
        </ScrollView>
      </View>

      <FlatList
        data={visiblePosts}
        renderItem={renderPost}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 12 }}
        contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: insets.bottom + 96, gap: 10 }}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={EmptyComponent}
        ListFooterComponent={FooterComponent}
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
  filterWrapper: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    paddingBottom: 12, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: '#1A1D1F', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8,
  },
  headerLeft: { flex: 1, gap: 2 },
  locationEyebrow: {
    fontSize: 11, fontWeight: '500', fontFamily: fonts.bodyMedium,
    letterSpacing: 1.2, textTransform: 'uppercase', lineHeight: 14,
  },
  feedTitle: {
    fontSize: 24, fontWeight: '600', fontFamily: fonts.heading,
    letterSpacing: -0.3, lineHeight: 30,
  },
  headerActions: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  iconCircleDark: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  filterRow: { paddingBottom: 0 },
  fab: {
    position: 'absolute', right: 20, bottom: 92,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1A1D1F', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
  },
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
  coldStart: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32, gap: 12 },
  coldStartTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.18, fontFamily: fonts.heading, lineHeight: 24 },
  coldStartHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  coldStartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, marginTop: 8, minHeight: 48 },
  coldStartBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 22 },
  allLoadedWrap: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  allLoadedLine: { height: 1, width: '100%' },
  allLoadedContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allLoadedText: { fontSize: 11, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 14 },
  missedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999,
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
