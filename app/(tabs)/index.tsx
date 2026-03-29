import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, Pressable, ActivityIndicator, ViewToken, ScrollView } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Sparkles, RefreshCw, Users, Plus, MapPin, ChevronDown, CheckCircle, Flame, Trophy, X as XIcon, CalendarDays, MessageCircle, ChevronRight } from 'lucide-react-native'
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
const ItemSeparator8 = () => <View style={{ height: 8 }} />

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

// ── Community card type ──
type CommunityCardItem = { _isCommunity: 'event' | 'group' | 'thread'; [key: string]: any }

// ── Community card component ──
function CommunityCard({ item, type, colors, t, onPress }: {
  item: any
  type: 'event' | 'group' | 'thread'
  colors: any
  t: (key: string) => string
  onPress: () => void
}) {
  const iconConfig = {
    event: { Icon: CalendarDays, color: '#2B8A62', bg: '#2B8A6220', label: t('feed.upcomingEvent') },
    group: { Icon: Users, color: '#7C5CBF', bg: '#7C5CBF20', label: t('feed.activeGroup') },
    thread: { Icon: MessageCircle, color: '#3B7DD8', bg: '#3B7DD820', label: t('feed.trendingThread') },
  }[type]

  const title = item.title ?? item.name ?? ''
  const subtitle = type === 'event'
    ? (item.event_date ? new Date(item.event_date).toLocaleDateString() : '')
    : type === 'group'
    ? `${item.member_count ?? 0} ${t('feed.members')}`
    : `${item.upvote_count ?? 0} \u2191 \u00B7 ${item.comment_count ?? 0} ${t('feed.replies')}`

  return (
    <Pressable onPress={onPress} style={[communityCardStyles.row, { backgroundColor: colors.muted }]}>
      <View style={[communityCardStyles.iconWrap, { backgroundColor: iconConfig.bg }]}>
        <iconConfig.Icon size={18} color={iconConfig.color} />
      </View>
      <View style={communityCardStyles.center}>
        <Text style={[communityCardStyles.label, { color: iconConfig.color }]}>{iconConfig.label}</Text>
        <Text style={[communityCardStyles.title, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
        <Text style={[communityCardStyles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>{subtitle}</Text>
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
    </Pressable>
  )
}

const communityCardStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: 12,
    paddingHorizontal: 12, gap: 10,
  },
  iconWrap: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  center: { flex: 1, justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '600', fontFamily: fonts.bodySemi, letterSpacing: 0.3, textTransform: 'uppercase' },
  title: { fontSize: 14, fontWeight: '700', fontFamily: fonts.heading },
  subtitle: { fontSize: 12, fontFamily: fonts.body },
})

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

  // ── Evening digest state ──
  const [digestData, setDigestData] = useState<{ posts: number; events: number; threads: number } | null>(null)
  const [digestDismissed, setDigestDismissed] = useState(false)

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

  // ── Evening digest (19:00-06:00) ──
  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 19 && hour >= 6) return // Only show 19:00-06:00

    async function fetchDigest() {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayISO = today.toISOString()
      const tomorrow = new Date(today.getTime() + 86400000)
      const tomorrowEnd = new Date(tomorrow.getTime() + 86400000)

      try {
        const [postsRes, eventsRes, threadsRes] = await Promise.all([
          supabase.from('posts').select('id', { count: 'exact', head: true }).gte('created_at', todayISO).eq('is_active', true),
          (supabase.from('community_events') as any).select('id', { count: 'exact', head: true }).gte('event_date', tomorrow.toISOString()).lt('event_date', tomorrowEnd.toISOString()),
          (supabase.from('forum_posts') as any).select('id', { count: 'exact', head: true }).gte('created_at', todayISO),
        ])
        setDigestData({
          posts: postsRes.count ?? 0,
          events: eventsRes.count ?? 0,
          threads: threadsRes.count ?? 0,
        })
      } catch {} // Tables may not exist
    }

    // Check if already dismissed today
    AsyncStorage.getItem('digest_dismissed').then(val => {
      if (val === new Date().toISOString().slice(0, 10)) setDigestDismissed(true)
      else fetchDigest()
    })
  }, [supabase])

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

  // Interleave ads every 5th post, then community cards at positions 3, 9, 16
  const visiblePosts = useMemo(() => {
    const result: (Post | Ad | CommunityCardItem)[] = []
    let adIdx = 0
    for (let i = 0; i < filteredPosts.length; i++) {
      result.push(filteredPosts[i])
      if ((i + 1) % 5 === 0 && adIdx < activeAds.length) {
        result.push(activeAds[adIdx])
        adIdx++
      }
    }
    // Insert community cards at specific positions
    if (feed.communityCards?.event && result.length > 3) {
      result.splice(3, 0, { ...feed.communityCards.event, _isCommunity: 'event' as const })
    }
    if (feed.communityCards?.group && result.length > 9) {
      result.splice(9, 0, { ...feed.communityCards.group, _isCommunity: 'group' as const })
    }
    if (feed.communityCards?.thread && result.length > 16) {
      result.splice(16, 0, { ...feed.communityCards.thread, _isCommunity: 'thread' as const })
    }
    return result
  }, [filteredPosts, activeAds, feed.communityCards])

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
  const renderPost = useCallback(({ item, index }: { item: Post | Ad | CommunityCardItem; index: number }) => {
    // Render community card
    if ('_isCommunity' in item) {
      const communityType = item._isCommunity as 'event' | 'group' | 'thread'
      return (
        <CommunityCard
          item={item}
          type={communityType}
          colors={colors}
          t={t}
          onPress={() => {
            if (communityType === 'event') router.push(`/event/${item.id}` as any)
            else if (communityType === 'group') router.push(`/groups/${item.id}` as any)
            else router.push(`/forum?thread=${item.id}` as any)
          }}
        />
      )
    }

    // Render ad card
    if ('_isAd' in item && (item as any)._isAd) {
      return <AdCard ad={item as Ad} />
    }

    const post = item as Post
    const currentGroup = post.created_at ? getDateGroup(post.created_at) : ''
    // Walk backwards to find the previous real post for date group comparison
    let prevGroup = ''
    for (let i = index - 1; i >= 0; i--) {
      const prev = visiblePostsRef.current[i]
      if (prev && !('_isAd' in prev) && !('_isCommunity' in prev) && (prev as Post).created_at) {
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
            <Text style={[styles.dateGroupText, { color: colors.mutedForeground }]}>{t(`feed.${currentGroup}`)}</Text>
          </View>
        ) : null}
        <PostCard post={post} userLocation={feed.userLocation} userId={feed.currentUserId} onInteraction={trackInteraction} onHide={handleHidePost} isNew={postIsNew} />
      </View>
    )
  }, [feed.userLocation, feed.currentUserId, colors, t, trackInteraction, handleHidePost, lastFeedVisit, router])

  // ── ListHeader ──
  const ListHeader = useMemo(() => (
    <View style={{ gap: 12 }}>
      {/* Greeting — compact single line */}
      <View style={{ alignItems: 'flex-start', paddingTop: 12, marginBottom: 8 }}>
        <Text style={{ fontSize: 14, color: colors.mutedForeground, fontFamily: fonts.body, letterSpacing: -0.2 }}>
          {(() => {
            const hour = new Date().getHours()
            const greetingKey = hour < 12 ? 'greeting.morning' : hour < 17 ? 'greeting.afternoon' : hour < 21 ? 'greeting.evening' : 'greeting.night'
            return `${t(greetingKey)}, ${feed.userNeighborhood ?? feed.userCityName ?? 'Helsinki'}!`
          })()}
        </Text>
      </View>

      {/* Streak milestone */}
      {[3, 7, 30].includes(currentStreak) && (
        <View style={[styles.streakMilestone, { backgroundColor: `${colors.pro}12` }]}>
          {currentStreak >= 30 ? <Trophy size={20} color={colors.pro} /> : <Flame size={20} color={colors.pro} />}
          <Text style={[styles.streakMilestoneText, { color: colors.pro }]}>
            {currentStreak === 3 ? t('streak.milestone3')
             : currentStreak === 7 ? t('streak.milestone7')
             : t('streak.milestone30')}
          </Text>
        </View>
      )}

      {/* Evening digest card */}
      {digestData && !digestDismissed && (digestData.posts > 0 || digestData.events > 0 || digestData.threads > 0) && (
        <View style={[styles.digestCard, { backgroundColor: colors.muted }]}>
          <Text style={[styles.digestText, { color: colors.foreground }]}>
            {t('feed.todayIn', { area: feed.userNeighborhood ?? 'Helsinki' })}
          </Text>
          <Text style={[styles.digestDetails, { color: colors.mutedForeground }]}>
            {[
              digestData.posts > 0 ? `${digestData.posts} ${t('feed.newListings')}` : null,
              digestData.events > 0 ? `${digestData.events} ${t('feed.eventsTomorrow')}` : null,
              digestData.threads > 0 ? `${digestData.threads} ${t('feed.newDiscussions')}` : null,
            ].filter(Boolean).join(' \u00B7 ')}
          </Text>
          <Pressable onPress={() => { setDigestDismissed(true); AsyncStorage.setItem('digest_dismissed', new Date().toISOString().slice(0, 10)) }} hitSlop={8} style={{ position: 'absolute', top: 8, right: 8 }}>
            <XIcon size={14} color={colors.mutedForeground} />
          </Pressable>
        </View>
      )}

      {/* Missed posts banner */}
      {showMissedBanner && missedCount > 0 && (
        <View style={[styles.missedBanner, { backgroundColor: colors.primary }]}>
          <Text style={[styles.missedBannerText, { color: colors.primaryForeground }]}>
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
    placesSectionTitle, matches, dismissMatch, showMissedBanner, missedCount,
    currentStreak, digestData, digestDismissed])

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
{/* Streak badge removed — cleaner header */}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 6, alignItems: 'center', paddingHorizontal: 16 }}>
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
        keyExtractor={item => ('_isCommunity' in item ? `community-${(item as any)._isCommunity}-${item.id}` : '_isAd' in item ? `ad-${item.id}` : item.id)}
        contentContainerStyle={[styles.list, { paddingTop: FILTER_BAR_BASE_HEIGHT }]}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={EmptyComponent}
        ListFooterComponent={FooterComponent}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.handleRefresh} tintColor={colors.primary} />}
        onEndReached={feed.handleLoadMore}
        onEndReachedThreshold={0.3}
        scrollEventThrottle={16}
        ItemSeparatorComponent={ItemSeparator8}
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        removeClippedSubviews={true}
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
    paddingTop: 4, paddingBottom: 8, gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
  },
  neighborhoodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  neighborhoodBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, alignSelf: 'flex-start', minHeight: 32 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  streakText: { fontSize: 13, fontWeight: '700', fontFamily: fonts.heading },
  neighborhoodText: { fontSize: 12, fontFamily: fonts.body },
  dateGroupLabel: { alignItems: 'center', paddingVertical: 4 },
  dateGroupLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateGroupText: { fontSize: 11, fontFamily: fonts.body, letterSpacing: 0.3 },
  list: { paddingHorizontal: 16, paddingBottom: 96 },
  filterRow: { paddingBottom: 0 },
  followingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    alignSelf: 'flex-start', minHeight: 40,
  },
  followingText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium },
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
  missedBannerText: { fontSize: 14, fontWeight: '600', flex: 1, fontFamily: fonts.bodySemi },
  // neighborsActiveRow removed per user request
  _neighborsActiveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
  },
  greenDot: { width: 8, height: 8, borderRadius: 4 },
  neighborsActiveText: { fontSize: 12, fontFamily: fonts.body },
  streakMilestone: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12 },
  streakMilestoneText: { flex: 1, fontSize: 14, fontFamily: fonts.bodySemi, fontWeight: '600' },
  digestCard: { padding: 12, borderRadius: 12, position: 'relative' as const },
  digestText: { fontSize: 14, fontFamily: fonts.bodySemi, fontWeight: '600' },
  digestDetails: { fontSize: 13, fontFamily: fonts.body, marginTop: 2 },
})

export default function FeedScreen() {
  return (
    <ScreenErrorBoundary screenName="Feed">
      <FeedScreenInner />
    </ScreenErrorBoundary>
  )
}
