import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, Pressable, ActivityIndicator, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Sparkles, RefreshCw, Users, Plus } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { POST_SELECT } from '@/lib/constants'
import { Header } from '@/components/Header'
import { FilterBar } from '@/components/FilterBar'
import { HeroCarousel } from '@/components/HeroCarousel'
import { PostCard } from '@/components/PostCard'
import { TackBirdLogo } from '@/components/TackBirdLogo'
import type { Post, PostType } from '@/lib/types'

const PAGE_SIZE = 20

// ── Skeleton component ──
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
  image: { width: '100%', aspectRatio: 3 / 2, borderRadius: 0 },
  body: { padding: 16, gap: 10 },
  line: { height: 12, borderRadius: 6 },
  lineShort: { width: '40%' },
  lineLong: { width: '90%' },
  lineMed: { width: '65%' },
  lineName: { width: '30%', height: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  avatar: { width: 24, height: 24, borderRadius: 12 },
})

export default function FeedScreen() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeFilter, setActiveFilter] = useState<PostType | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [hasNewPosts, setHasNewPosts] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showFollowing, setShowFollowing] = useState(false)
  const [followedIds, setFollowedIds] = useState<string[]>([])
  const offsetRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch followed user IDs
  useEffect(() => {
    async function fetchFollows() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('user_follows').select('followed_id').eq('follower_id', user.id)
      if (data) setFollowedIds(data.map((f: any) => f.followed_id))
    }
    fetchFollows()
  }, [supabase])

  const fetchPosts = useCallback(async (reset = false) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      setError(null)
      const offset = reset ? 0 : offsetRef.current
      let query = supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('is_active', true)
        .or('expires_at.is.null,expires_at.gt.now()')
        .order('is_pro_listing', { ascending: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)

      if (activeFilter) query = query.eq('type', activeFilter)
      if (showFollowing && followedIds.length > 0) {
        query = query.in('user_id', followedIds)
      }

      const { data, error: fetchError } = await query
      if (controller.signal.aborted) return
      if (fetchError) { setError(t('feed.loadError')); return }

      const newPosts = (data ?? []) as unknown as Post[]
      if (reset) {
        setPosts(newPosts)
        offsetRef.current = newPosts.length
      } else {
        setPosts(prev => {
          const ids = new Set(prev.map(p => p.id))
          const unique = newPosts.filter(p => !ids.has(p.id))
          return [...prev, ...unique]
        })
        offsetRef.current = offset + newPosts.length
      }
      setHasMore(newPosts.length >= PAGE_SIZE)
    } catch {
      if (!controller.signal.aborted) setError(t('feed.loadError'))
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [supabase, activeFilter, showFollowing, followedIds, t])

  useEffect(() => {
    setLoading(true)
    offsetRef.current = 0
    fetchPosts(true)
    return () => { abortRef.current?.abort() }
  }, [fetchPosts])

  // Realtime with 2s debounce
  useEffect(() => {
    const channel = supabase
      .channel('feed-new-posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => setHasNewPosts(true), 2000)
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [supabase])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    setHasNewPosts(false)
    offsetRef.current = 0
    fetchPosts(true)
  }, [fetchPosts])

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore && !error) fetchPosts(false)
  }, [loading, hasMore, error, fetchPosts])

  const handleFilterChange = useCallback((type: PostType | null) => {
    setActiveFilter(type)
    setPosts([])
    offsetRef.current = 0
    setHasMore(true)
    setLoading(true)
  }, [])

  const renderPost = useCallback(({ item }: { item: Post }) => <PostCard post={item} />, [])

  // ── List Header ──
  const ListHeader = useMemo(() => (
    <View style={{ gap: 16 }}>
      <HeroCarousel />

      {/* New posts banner */}
      {hasNewPosts && (
        <Pressable
          onPress={handleRefresh}
          style={[styles.newBanner, { backgroundColor: isDark ? `${colors.primary}1F` : `${colors.primary}14` }]}
        >
          <Sparkles size={14} color={colors.primary} />
          <Text style={[styles.newBannerText, { color: colors.primary }]}>{t('feed.newPosts')}</Text>
          <RefreshCw size={14} color={colors.primary} style={{ opacity: 0.7 }} />
        </Pressable>
      )}

      {/* Error state */}
      {error && (
        <View style={[styles.errorBox, { backgroundColor: `${colors.destructive}10`, borderColor: `${colors.destructive}33` }]}>
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          <Pressable
            onPress={handleRefresh}
            style={[styles.retryBtn, { borderColor: `${colors.destructive}33` }]}
          >
            <RefreshCw size={14} color={colors.destructive} />
            <Text style={[styles.retryText, { color: colors.destructive }]}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      )}

      {/* Section header */}
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionBar, { backgroundColor: colors.primary }]} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('feed.latestListings')}</Text>
        {posts.length > 0 && !loading && (
          <View style={[styles.countBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.countText, { color: colors.mutedForeground }]}>{posts.length}</Text>
          </View>
        )}
      </View>
    </View>
  ), [hasNewPosts, error, handleRefresh, isDark, colors, t, posts.length, loading])

  // ── Empty / Cold Start ──
  const EmptyComponent = useMemo(() => {
    if (loading) {
      return (
        <View style={{ gap: 16 }}>
          {[0, 1, 2, 3].map(i => <PostCardSkeleton key={i} colors={colors} />)}
        </View>
      )
    }
    return (
      <View style={styles.coldStart}>
        <Text style={[styles.coldStartTitle, { color: colors.foreground }]}>{t('feed.noPosts')}</Text>
        <Text style={[styles.coldStartHint, { color: colors.mutedForeground }]}>{t('feed.noPostsHint')}</Text>
        <Pressable
          onPress={() => router.push('/create')}
          style={[styles.coldStartBtn, { backgroundColor: colors.primary }]}
        >
          <Plus size={16} color={colors.primaryForeground} />
          <Text style={[styles.coldStartBtnText, { color: colors.primaryForeground }]}>{t('events.heroCreateCTA')}</Text>
        </Pressable>
      </View>
    )
  }, [loading, colors, t, router])

  // ── All loaded footer ──
  const FooterComponent = useMemo(() => {
    if (loading && posts.length > 0) {
      return <ActivityIndicator size="small" color={colors.mutedForeground} style={{ marginVertical: 20 }} />
    }
    if (!hasMore && posts.length > 0) {
      return (
        <View style={styles.allLoadedWrap}>
          <View style={styles.allLoadedRow}>
            <View style={[styles.allLoadedLine, { backgroundColor: `${colors.border}66` }]} />
            <TackBirdLogo size={14} color={`${colors.mutedForeground}50`} />
            <View style={[styles.allLoadedLine, { backgroundColor: `${colors.border}66` }]} />
          </View>
          <Text style={[styles.allLoadedText, { color: `${colors.mutedForeground}80` }]}>{t('feed.allLoaded')}</Text>
        </View>
      )
    }
    return null
  }, [loading, hasMore, posts.length, colors, t])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header />
      <FlatList
        data={posts}
        renderItem={renderPost}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingTop: insets.top + 48 + 8 }]}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {/* Filter bar + following toggle */}
            <View style={styles.filterRow}>
              <FilterBar activeFilter={activeFilter} onFilterChange={handleFilterChange} />
            </View>
            {followedIds.length > 0 && (
              <Pressable
                onPress={() => setShowFollowing(p => !p)}
                style={[
                  styles.followingBtn,
                  showFollowing
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: isDark ? colors.card : colors.muted },
                ]}
              >
                <Users size={14} color={showFollowing ? colors.primaryForeground : colors.mutedForeground} strokeWidth={1.75} />
                <Text style={[styles.followingText, { color: showFollowing ? colors.primaryForeground : colors.mutedForeground }]}>
                  {t('feed.following')}
                </Text>
              </Pressable>
            )}
            {ListHeader}
          </View>
        }
        ListEmptyComponent={EmptyComponent}
        ListFooterComponent={FooterComponent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  filterRow: { paddingBottom: 4 },
  followingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    alignSelf: 'flex-start', minHeight: 36,
  },
  followingText: { fontSize: 12, fontWeight: '500' },
  newBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, paddingVertical: 10, minHeight: 44,
  },
  newBannerText: { fontSize: 14, fontWeight: '600' },
  errorBox: {
    borderRadius: 12, borderWidth: 1, padding: 16,
    alignItems: 'center', gap: 12,
  },
  errorText: { fontSize: 14, fontWeight: '500' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
  },
  retryText: { fontSize: 13, fontWeight: '500' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  sectionBar: { width: 3, height: 16, borderRadius: 1.5 },
  sectionTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3, flex: 1 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countText: { fontSize: 11, fontWeight: '500' },
  coldStart: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 32, gap: 12 },
  coldStartTitle: { fontSize: 18, fontWeight: '700' },
  coldStartHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  coldStartBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8,
  },
  coldStartBtnText: { fontSize: 15, fontWeight: '600' },
  allLoadedWrap: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  allLoadedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  allLoadedLine: { flex: 1, height: 1 },
  allLoadedText: { fontSize: 11, fontWeight: '500' },
})
