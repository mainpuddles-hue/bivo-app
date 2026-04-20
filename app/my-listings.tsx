declare const __DEV__: boolean

import { useState, useCallback, useMemo } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { Image } from 'expo-image'
import { ChevronLeft, Plus, MoreHorizontal, Heart, MessageCircle, Eye, Package } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo } from '@/lib/format'
import { getCachedUserId } from '@/lib/authCache'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { EmptyState } from '@/components/EmptyState'
import { useShimmer } from '@/components/SkeletonLoaders'
import { getImageUrl } from '@/lib/imageUtils'
import type { PostType } from '@/lib/types'

// ── Types ──

interface PostImage {
  image_url: string
  sort_order: number
}

interface MyPost {
  id: string
  title: string
  image_url: string | null
  type: PostType
  is_active: boolean
  created_at: string
  like_count: number
  comment_count: number
  images: PostImage[]
}

type Tab = 'active' | 'lent' | 'draft' | 'archive'

// ── Tab config ──

// Tab keys - labels resolved inside component with t()
const TAB_KEYS: Tab[] = ['active', 'lent', 'draft', 'archive']

// ── Status helpers ──

type ListingStatus = 'active' | 'lent' | 'draft'

function getStatus(post: MyPost): ListingStatus {
  if (!post.is_active) return 'draft'
  if (post.type === 'lainaa') return 'lent'
  return 'active'
}

function filterPosts(posts: MyPost[], tab: Tab): MyPost[] {
  switch (tab) {
    case 'active':
      return posts.filter(p => p.is_active && p.type !== 'lainaa')
    case 'lent':
      return posts.filter(p => p.is_active && p.type === 'lainaa')
    case 'draft':
      return posts.filter(p => !p.is_active)
    case 'archive':
      // Placeholder: show inactive posts as archive for now
      return posts.filter(p => !p.is_active)
    default:
      return posts
  }
}

// ── Inner screen ──

function MyListingsScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const TABS = useMemo(() => [
    { key: 'active' as Tab, label: t('myListings.tabActive') },
    { key: 'lent' as Tab, label: t('myListings.tabLent') },
    { key: 'draft' as Tab, label: t('myListings.tabDraft') },
    { key: 'archive' as Tab, label: t('myListings.tabArchive') },
  ], [t])

  const [posts, setPosts] = useState<MyPost[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('active')

  // ── Fetch posts ──

  const fetchPosts = useCallback(async () => {
    try {
      const userId = await getCachedUserId()
      if (!userId) return

      const { data } = await supabase
        .from('posts')
        .select('id, title, image_url, type, is_active, created_at, like_count, comment_count, images:post_images(image_url, sort_order)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (data) {
        setPosts(data as unknown as MyPost[])
      }
    } catch (err) {
      if (__DEV__) console.warn('MyListings fetch error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      fetchPosts()
    }, [fetchPosts])
  )

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchPosts()
  }, [fetchPosts])

  // ── Filtered + counted ──

  const filteredPosts = useMemo(() => filterPosts(posts, activeTab), [posts, activeTab])

  const tabCounts = useMemo(() => ({
    active: posts.filter(p => p.is_active && p.type !== 'lainaa').length,
    lent: posts.filter(p => p.is_active && p.type === 'lainaa').length,
    draft: posts.filter(p => !p.is_active).length,
    archive: posts.filter(p => !p.is_active).length,
  }), [posts])

  // ── Summary stats ──

  const totalLent = tabCounts.lent
  const avgRating = 4.8 // Placeholder — would come from reviews
  const earnings = null as number | null // Placeholder — would come from transactions

  // ── Helpers ──

  function getPostImage(post: MyPost): string | null {
    if (post.images && post.images.length > 0) {
      const sorted = [...post.images].sort((a, b) => a.sort_order - b.sort_order)
      return sorted[0].image_url
    }
    return post.image_url
  }

  function getStatusConfig(status: ListingStatus) {
    switch (status) {
      case 'lent':
        return {
          label: t('myListings.statusLent'),
          bgColor: colors.foreground,
          textColor: colors.primaryForeground,
          imageOpacity: 1,
        }
      case 'active':
        return {
          label: t('myListings.statusActive'),
          bgColor: colors.warmTint,
          textColor: colors.foreground,
          imageOpacity: 1,
        }
      case 'draft':
        return {
          label: t('myListings.statusDraft'),
          bgColor: colors.border,
          textColor: colors.mutedForeground,
          imageOpacity: 0.55,
        }
    }
  }

  // ── Render listing card ──

  const renderItem = useCallback(({ item }: { item: MyPost }) => {
    const status = getStatus(item)
    const config = getStatusConfig(status)
    const imageUrl = getPostImage(item)

    return (
      <PressableOpacity
        onPress={() => router.push(`/post/${item.id}`)}
        style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        {/* Image */}
        <View style={s.cardImageWrap}>
          {imageUrl ? (
            <Image
              source={{ uri: getImageUrl(imageUrl, 'medium') || undefined }}
              style={[s.cardImage, { opacity: config.imageOpacity }]}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[s.cardImagePlaceholder, { backgroundColor: colors.muted }]}>
              <Package size={24} color={colors.tertiaryForeground} />
            </View>
          )}
        </View>

        {/* Content */}
        <View style={s.cardContent}>
          {/* Status badge */}
          <View style={[s.statusBadge, { backgroundColor: config.bgColor }]}>
            <Text style={[s.statusText, { color: config.textColor }]}>{config.label}</Text>
          </View>

          {/* Title */}
          <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
            {item.title}
          </Text>

          {/* Meta */}
          <Text style={[s.cardMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {formatTimeAgo(item.created_at, t, locale)}
          </Text>

          {/* Stats row */}
          <View style={s.cardStats}>
            <View style={s.statItem}>
              <Heart size={11} color={colors.mutedForeground} />
              <Text style={[s.statText, { color: colors.mutedForeground }]}>
                <Text style={s.statBold}>{item.like_count}</Text>
              </Text>
            </View>
            <View style={s.statItem}>
              <MessageCircle size={11} color={colors.mutedForeground} />
              <Text style={[s.statText, { color: colors.mutedForeground }]}>
                <Text style={s.statBold}>{item.comment_count}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* Three-dot menu */}
        <PressableOpacity
          onPress={() => {
            // TODO: show action sheet (edit, deactivate, delete)
          }}
          style={s.menuBtn}
          accessibilityRole="button"
          accessibilityLabel={t('myListings.menu')}
          hitSlop={8}
        >
          <MoreHorizontal size={18} color={colors.mutedForeground} />
        </PressableOpacity>
      </PressableOpacity>
    )
  }, [colors, locale, router])

  // ── Loading state ──

  if (loading && posts.length === 0) {
    return (
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Header colors={colors} router={router} />
        <View style={s.loadingWrap}>
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        </View>
      </View>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <Header colors={colors} router={router} />

      {/* Segment tabs */}
      <View style={s.tabsOuter}>
        <View style={[s.tabsContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key
            return (
              <PressableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[
                  s.tab,
                  isActive && [s.tabActive, {
                    backgroundColor: colors.card,
                    shadowColor: colors.foreground,
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.06,
                    shadowRadius: 3,
                    elevation: 1,
                  }],
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[
                  s.tabLabel,
                  { color: isActive ? colors.foreground : colors.mutedForeground },
                  isActive && s.tabLabelActive,
                ]}>
                  {tab.label}
                </Text>
                <Text style={[
                  s.tabCount,
                  { color: isActive ? colors.foreground : colors.tertiaryForeground },
                ]}>
                  {tabCounts[tab.key]}
                </Text>
              </PressableOpacity>
            )
          })}
        </View>
      </View>

      {/* Summary stats */}
      <View style={s.statsRow}>
        <View style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.statNumber, { color: colors.foreground }]}>{totalLent}</Text>
          <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{t('myListings.statLoans')}</Text>
        </View>
        <View style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.statNumber, { color: colors.foreground }]}>{avgRating.toFixed(1)}</Text>
          <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{t('myListings.statRating')}</Text>
        </View>
        <View style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.statNumber, { color: colors.foreground }]}>
            {earnings != null ? `${earnings}\u00A0\u20AC` : '\u2014'}
          </Text>
          <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{t('myListings.statEarnings')}</Text>
        </View>
      </View>

      {/* Listing cards */}
      <FlatList
        data={filteredPosts}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.mutedForeground}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Package size={40} color={colors.tertiaryForeground} />}
            title={t('myListings.emptyTitle')}
            description={t('myListings.emptyDescription')}
            actionLabel={t('myListings.emptyAction')}
            onAction={() => router.push('/(tabs)/create')}
          />
        }
      />
    </View>
  )
}

// ── Header component ──

function Header({ colors, router }: { colors: any; router: any }) {
  const { t } = useI18n()
  return (
    <View style={s.header}>
      {/* Back button */}
      <PressableOpacity
        onPress={() => router.back()}
        style={[s.headerCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <ChevronLeft size={20} color={colors.foreground} />
      </PressableOpacity>

      {/* Title */}
      <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('myListings.title')}</Text>

      {/* Add button */}
      <PressableOpacity
        onPress={() => router.push('/(tabs)/create')}
        style={[s.headerCircle, { backgroundColor: colors.foreground }]}
        accessibilityRole="button"
        accessibilityLabel={t('myListings.createNew')}
      >
        <Plus size={18} color={colors.primaryForeground} />
      </PressableOpacity>
    </View>
  )
}

// ── Export with error boundary ──

export default function MyListingsScreen() {
  return (
    <ScreenErrorBoundary screenName="MyListings">
      <MyListingsScreenInner />
    </ScreenErrorBoundary>
  )
}

// ── Styles ──

const s = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.1,
  },

  // Segment tabs
  tabsOuter: {
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabActive: {
    // shadow applied inline
  },
  tabLabel: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    fontFamily: fonts.bodySemi,
  },
  tabCount: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    marginTop: 1,
  },

  // Summary stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statNumber: {
    fontSize: 22,
    fontFamily: fonts.heading,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.8,
    marginTop: 2,
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    gap: 10,
  },

  // Card
  card: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  cardImageWrap: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardImage: {
    width: 72,
    height: 72,
  },
  cardImagePlaceholder: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  cardContent: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 10,
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.2,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.1,
    marginBottom: 2,
  },
  cardMeta: {
    fontSize: 11,
    fontFamily: fonts.body,
    marginBottom: 6,
  },
  cardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statText: {
    fontSize: 11,
    fontFamily: fonts.body,
  },
  statBold: {
    fontFamily: fonts.bodySemi,
  },
  menuBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Loading
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
