import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, ViewToken, ScrollView, ActionSheetIOS, Alert, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Sparkles, RefreshCw, Plus, Search, SlidersHorizontal, CheckCircle, X as XIcon, Heart, Star, ChevronRight } from 'lucide-react-native'
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
import { useSupabase } from '@/hooks/useSupabase'
import { useToast } from '@/components/Toast'
import { FilterBar } from '@/components/FilterBar'
import { PostCardGrid } from '@/components/PostCardGrid'
import { AlertBanner } from '@/components/AlertBanner'
import { PostCardSkeleton, FeedLoadMoreSkeleton } from '@/components/SkeletonLoaders'
import { NeighborhoodPicker } from '@/components/NeighborhoodPicker'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { getCachedUserId } from '@/lib/authCache'
import { getImageUrl } from '@/lib/imageUtils'
import { haversineKm } from '@/lib/geo'
import { CATEGORIES } from '@/lib/constants'
import type { Post, PostType } from '@/lib/types'

function FeedScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ openNeighborhoodPicker?: string }>()
  const supabase = useSupabase()

  const toast = useToast()
  const welcomeShownRef = useRef(false)

  const feed = useFeedData()
  const { trackInteraction } = useInteractionTracker(feed.currentUserId)
  const { onlineCount } = usePresence(feed.currentUserId, feed.userNeighborhood)
  useSessionManager(feed.currentUserId)

  // ── User profile for greeting ──
  const [userName, setUserName] = useState<string | null>(null)
  const [userAvatar, setUserAvatar] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    getCachedUserId().then(async (id) => {
      if (!id || !mounted) return
      const { data } = await (supabase.from('profiles') as any)
        .select('name, avatar_url')
        .eq('id', id)
        .maybeSingle()
      if (mounted && data) {
        setUserName(data.name ?? null)
        setUserAvatar(data.avatar_url ?? null)
      }
    }).catch(() => {})
    return () => { mounted = false }
  }, [supabase])

  // First name for greeting
  const firstName = useMemo(() => {
    if (!userName) return null
    return userName.split(' ')[0]
  }, [userName])

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

  // ── Hero post (first visible post) + remaining posts ──
  const heroPost = visiblePosts.length > 0 ? visiblePosts[0] : null
  const remainingPosts = visiblePosts.length > 1 ? visiblePosts.slice(1) : []

  // ── Hero post helpers ──
  const heroImageUrl = useMemo(() => {
    if (!heroPost) return null
    // Check images array first, then image_url
    if (heroPost.images && heroPost.images.length > 0) {
      return getImageUrl(heroPost.images[0].image_url, 'medium')
    }
    return getImageUrl(heroPost.image_url, 'medium')
  }, [heroPost])

  const heroDistance = useMemo(() => {
    if (!heroPost || !feed.userLocation) return null
    if (heroPost.latitude == null || heroPost.longitude == null) return null
    const km = haversineKm(
      feed.userLocation.latitude,
      feed.userLocation.longitude,
      heroPost.latitude,
      heroPost.longitude,
    )
    if (km < 1) return `${Math.round(km * 1000)} m`
    return `${km.toFixed(1)} km`
  }, [heroPost, feed.userLocation])

  const heroCategoryLabel = useMemo(() => {
    if (!heroPost) return ''
    const cat = CATEGORIES[heroPost.type]
    return cat ? t(cat.label) : heroPost.type
  }, [heroPost, t])

  const renderPost = useCallback(({ item, index }: { item: Post; index: number }) => (
    <PostCardGrid
      post={item}
      userId={feed.currentUserId}
      onInteraction={trackInteraction}
      index={index}
    />
  ), [feed.currentUserId, trackInteraction])

  // ── Render ──
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={remainingPosts}
        renderItem={renderPost}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={remainingPosts.length > 0 ? { gap: 10, paddingHorizontal: 12 } : undefined}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, gap: 10 }}
        ListHeaderComponent={
          <View>
            {/* ── Top area with safe area padding ── */}
            <View style={[styles.topArea, { paddingTop: insets.top + 16 }]}>
              {/* 1. Greeting row */}
              <View style={styles.greetingRow}>
                <PressableOpacity onPress={() => feed.setShowNeighborhoodPicker(true)} style={styles.greetingLeft} hitSlop={8}>
                  <Text style={[styles.greetingTitle, { color: colors.foreground }]}>
                    {firstName ? `Hei, ${firstName}` : (t('feed.nearbyNow') ?? 'Lähellä nyt')}
                  </Text>
                  <Text style={[styles.greetingSubtitle, { color: colors.mutedForeground }]}>
                    {feed.userNeighborhood ?? 'Helsinki'}
                    {onlineCount > 0 ? ` · ${t('post.neighborsOnline', { count: onlineCount }) ?? `${onlineCount} naapuria paikalla`}` : ''}
                  </Text>
                </PressableOpacity>
                <PressableOpacity
                  onPress={() => router.push('/(tabs)/profile')}
                  style={[styles.avatarCircle, { borderColor: colors.border }]}
                  accessibilityLabel={t('nav.profile') ?? 'Profile'}
                  accessibilityRole="button"
                >
                  {userAvatar ? (
                    <Image
                      source={{ uri: getImageUrl(userAvatar, 'thumbnail') ?? undefined }}
                      style={styles.avatarImage}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.avatarInitial, { color: colors.mutedForeground }]}>
                        {firstName ? firstName[0].toUpperCase() : '?'}
                      </Text>
                    </View>
                  )}
                </PressableOpacity>
              </View>

              {/* 2. Search + filter row */}
              <View style={styles.searchRow}>
                <PressableOpacity
                  onPress={() => router.push('/search')}
                  style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}
                  accessibilityLabel={t('common.search')}
                  accessibilityRole="button"
                >
                  <Search size={16} color={colors.mutedForeground} strokeWidth={2} />
                  <Text style={[styles.searchPlaceholder, { color: colors.mutedForeground }]}>
                    {t('search.placeholder') ?? 'Etsi mitä tarvitset…'}
                  </Text>
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
                  style={[styles.filterButton, { backgroundColor: colors.foreground }]}
                  accessibilityLabel={t('feed.sort') ?? 'Sort'}
                  accessibilityRole="button"
                >
                  <SlidersHorizontal size={16} color={colors.background} strokeWidth={2} />
                </PressableOpacity>
              </View>

              {/* 3. Section title */}
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {t('feed.whatDoToday') ?? 'Mitä teet tänään?'}
              </Text>

              {/* 4. Category pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, alignItems: 'center' }}
                style={styles.pillRow}
              >
                <FilterBar activeFilter={feed.activeFilter} onFilterChange={handleFilterChangeWithHaptics} />
              </ScrollView>
            </View>

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

            {/* ── 5. Hero card ── */}
            {feed.loading && visiblePosts.length === 0 ? (
              <View style={{ paddingHorizontal: 12, gap: 16, paddingTop: 16 }}>
                {[0, 1, 2, 3].map(i => <PostCardSkeleton key={i} />)}
              </View>
            ) : heroPost ? (
              <View style={styles.heroWrapper}>
                {/* Peek card behind (suggests swipeable stack) */}
                <View style={[styles.peekCard, { backgroundColor: isDark ? '#3A3530' : '#D8BDA4' }]} />

                {/* Main hero card */}
                <PressableOpacity
                  onPress={() => {
                    trackInteraction(heroPost.id, 'click')
                    router.push(`/post/${heroPost.id}`)
                  }}
                  style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={heroPost.title}
                >
                  {/* Square image */}
                  <View style={styles.heroImageWrap}>
                    {heroImageUrl ? (
                      <Image
                        source={{ uri: heroImageUrl }}
                        style={styles.heroImage}
                        contentFit="cover"
                        transition={300}
                      />
                    ) : (
                      <View style={[styles.heroImage, { backgroundColor: isDark ? '#2A2825' : '#F0EEE9' }]}>
                        <Text style={[styles.heroImagePlaceholder, { color: colors.mutedForeground }]}>
                          {heroCategoryLabel}
                        </Text>
                      </View>
                    )}

                    {/* Gradient overlay */}
                    <LinearGradient
                      colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.72)']}
                      locations={[0.38, 0.68, 1]}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />

                    {/* Heart icon top-right */}
                    <View style={[styles.heroHeartCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <Heart
                        size={16}
                        color={heroPost.is_liked ? '#EF4444' : colors.foreground}
                        fill={heroPost.is_liked ? '#EF4444' : 'none'}
                        strokeWidth={1.8}
                      />
                    </View>

                    {/* Title overlay bottom-left */}
                    <View style={styles.heroOverlay}>
                      <Text style={styles.heroNeighborhood}>
                        {(heroPost.user as any)?.naapurusto ?? feed.userNeighborhood ?? 'Helsinki'}
                      </Text>
                      <Text style={styles.heroTitle} numberOfLines={2}>
                        {heroPost.title}
                      </Text>
                      <View style={styles.heroMeta}>
                        {heroPost.like_count > 0 && (
                          <View style={styles.heroRatingPill}>
                            <Star size={11} color="#fff" fill="#fff" />
                            <Text style={styles.heroRatingText}>
                              {heroPost.like_count > 99 ? '99+' : heroPost.like_count}
                            </Text>
                          </View>
                        )}
                        {heroPost.comment_count > 0 && (
                          <Text style={styles.heroMetaText}>
                            {heroPost.comment_count} {t('post.comments') ?? 'kommenttia'}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* CTA row below image */}
                  <View style={styles.heroCta}>
                    <View style={styles.heroCtaLeft}>
                      <Text style={[styles.heroCtaOwner, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {(heroPost.user as any)?.name ?? '?'}
                        {heroDistance ? ` · ${heroDistance}` : ''}
                      </Text>
                      <Text style={[styles.heroCtaAction, { color: colors.foreground }]}>
                        {heroCategoryLabel}
                      </Text>
                    </View>
                    <View style={[styles.heroCtaArrow, { backgroundColor: colors.foreground }]}>
                      <ChevronRight size={16} color={colors.background} strokeWidth={2.2} />
                    </View>
                  </View>
                </PressableOpacity>
              </View>
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
                  {t('feed.morePosts') ?? 'Lisää ilmoituksia'}
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

  // ── Top area ──
  topArea: {
    paddingHorizontal: 20,
  },

  // 1. Greeting row
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  greetingLeft: {
    flex: 1,
    marginRight: 12,
  },
  greetingTitle: {
    fontSize: 24,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.5,
    lineHeight: 28,
    marginBottom: 2,
  },
  greetingSubtitle: {
    fontSize: 12,
    fontFamily: fonts.body,
    letterSpacing: 0.1,
    lineHeight: 16,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: fonts.heading,
  },

  // 2. Search + filter row
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  searchBar: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 10,
  },
  searchPlaceholder: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 3. Section title
  sectionTitle: {
    fontSize: 19,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.3,
    lineHeight: 24,
    marginBottom: 12,
  },

  // 4. Category pills
  pillRow: {
    marginBottom: 18,
  },

  // 5. Hero card
  heroWrapper: {
    paddingHorizontal: 20,
    paddingTop: 4,
    position: 'relative',
    marginBottom: 20,
  },
  peekCard: {
    position: 'absolute',
    top: 18,
    right: 8,
    bottom: 80,
    width: 30,
    borderRadius: 24,
    zIndex: 0,
  },
  heroCard: {
    position: 'relative',
    zIndex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
  },
  heroImageWrap: {
    aspectRatio: 1,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImagePlaceholder: {
    fontSize: 32,
    fontWeight: '600',
    fontFamily: fonts.heading,
    opacity: 0.4,
  },
  heroHeartCircle: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroOverlay: {
    position: 'absolute',
    left: 18,
    bottom: 14,
    zIndex: 2,
  },
  heroNeighborhood: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    opacity: 0.85,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.5,
    marginTop: 2,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  heroRatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999,
  },
  heroRatingText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontFamily: fonts.bodyMedium,
  },
  heroMetaText: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.9,
    fontFamily: fonts.body,
  },

  // CTA row
  heroCta: {
    padding: 8,
    paddingLeft: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCtaLeft: {
    flex: 1,
    marginRight: 12,
  },
  heroCtaOwner: {
    fontSize: 11,
    letterSpacing: 0.2,
    fontFamily: fonts.body,
    lineHeight: 14,
  },
  heroCtaAction: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    marginTop: 2,
    lineHeight: 20,
  },
  heroCtaArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
