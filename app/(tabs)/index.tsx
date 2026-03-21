import { useCallback, useMemo, useRef, useEffect } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, Pressable, ActivityIndicator, Animated } from 'react-native'
import { useRouter } from 'expo-router'
import { Sparkles, RefreshCw, Users, Plus, MapPin, ChevronDown, CheckCircle } from 'lucide-react-native'
import { BoardIllustration } from '@/components/illustrations'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useFeedData } from '@/hooks/useFeedData'
import { FilterBar } from '@/components/FilterBar'
import { PostCard } from '@/components/PostCard'
import { AlertBanner } from '@/components/AlertBanner'
import { DiscoverySection } from '@/components/DiscoverySection'
import { HeroEventCard } from '@/components/HeroEventCard'
import { NeighborhoodPicker } from '@/components/NeighborhoodPicker'
import type { Post } from '@/lib/types'

// ── Date helpers for time-based section breaks ──
function isToday(dateStr: string): boolean {
  const d = new Date(dateStr); const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}
function isTomorrow(dateStr: string): boolean {
  const d = new Date(dateStr); const t = new Date(); t.setDate(t.getDate() + 1)
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}
function isWithinDays(dateStr: string, days: number): boolean {
  const d = new Date(dateStr).getTime(); const now = Date.now()
  return d >= now && d <= now + days * 86400000
}
function isYesterday(dateStr: string): boolean {
  const d = new Date(dateStr); const y = new Date(); y.setDate(y.getDate() - 1)
  return d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate()
}
function isWithinPastDays(dateStr: string, days: number): boolean {
  const d = new Date(dateStr).getTime(); const now = Date.now()
  return d <= now && d >= now - days * 86400000
}
function getDateGroup(dateStr: string): string {
  if (isToday(dateStr)) return 'today'
  if (isYesterday(dateStr)) return 'yesterday'
  if (isWithinPastDays(dateStr, 7)) return 'thisWeek'
  return 'earlier'
}

// ── Skeleton ──
function PostCardSkeleton({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  const shimmer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [shimmer])
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] })
  return (
    <View style={[skelStyles.card, { backgroundColor: colors.card }]}>
      <Animated.View style={[skelStyles.image, { backgroundColor: colors.muted, opacity }]} />
      <View style={skelStyles.body}>
        <Animated.View style={[skelStyles.line, skelStyles.lineShort, { backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[skelStyles.line, skelStyles.lineLong, { backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[skelStyles.line, skelStyles.lineMed, { backgroundColor: colors.muted, opacity }]} />
        <View style={skelStyles.userRow}>
          <Animated.View style={[skelStyles.avatar, { backgroundColor: colors.muted, opacity }]} />
          <Animated.View style={[skelStyles.line, skelStyles.lineName, { backgroundColor: colors.muted, opacity }]} />
        </View>
      </View>
    </View>
  )
}

const skelStyles = StyleSheet.create({
  card: { borderRadius: 12, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: 0 },
  body: { padding: 16, gap: 10 },
  line: { height: 12, borderRadius: 6 },
  lineShort: { width: '40%' },
  lineLong: { width: '90%' },
  lineMed: { width: '65%' },
  lineName: { width: '30%', height: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  avatar: { width: 24, height: 24, borderRadius: 12 },
})

// ══════════════════════════════════════════════
// ── Feed Screen ──
// ══════════════════════════════════════════════

export default function FeedScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()

  const feed = useFeedData()

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
        <PostCard post={item} userLocation={feed.userLocation} userId={feed.currentUserId} />
      </View>
    )
  }, [feed.userLocation, feed.currentUserId, colors.mutedForeground, colors.border, t])

  // ── ListHeader ──
  const ListHeader = useMemo(() => (
    <View style={{ gap: 16 }}>
      <AlertBanner />

      {/* Hero event or slogan — only show slogan when NO discovery content either */}
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
      ) : !feed.extraLoading && feed.cityEvents.length === 0 && feed.nearbyPlaces.length === 0 ? (
        <View style={styles.sloganWrap}>
          <Text style={[styles.sloganBrand, { color: colors.primary }]}>TackBird</Text>
          <Text style={[styles.sloganText, { color: colors.mutedForeground }]}>{t('feed.slogan')}</Text>
        </View>
      ) : null}

      {/* Discovery: events + places carousel */}
      <DiscoverySection
        cityEvents={feed.cityEvents}
        nearbyPlaces={feed.nearbyPlaces}
        extraLoading={feed.extraLoading}
        discoveryTab={feed.discoveryTab}
        setDiscoveryTab={feed.setDiscoveryTab}
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
    feed.posts.length, feed.loading, feed.cityEvents, feed.nearbyPlaces, feed.extraLoading,
    feed.discoveryTab, feed.setDiscoveryTab, placesSectionTitle])

  // ── Empty state ──
  const EmptyComponent = useMemo(() => {
    if (feed.loading) {
      return (
        <View style={{ gap: 16 }}>
          {[0, 1, 2, 3].map(i => <PostCardSkeleton key={i} colors={colors} />)}
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
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        showsVerticalScrollIndicator={false}
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
  sloganWrap: { alignItems: 'center', paddingVertical: 8, gap: 2 },
  sloganBrand: { fontSize: 20, fontFamily: fonts.heading, letterSpacing: 1.7 },
  sloganText: { fontSize: 13, fontFamily: fonts.body, textAlign: 'center' },
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
