declare const __DEV__: boolean

import { useState, useEffect, useCallback } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator, Animated } from 'react-native'
import { hapticMedium } from '@/lib/haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { getBlockedUserIds } from '@/lib/blockedUsers'
import { ArrowLeft, Zap, Trophy, Crown, ChevronRight } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { Avatar } from '@/components/Avatar'
import { useShimmer } from '@/components/SkeletonLoaders'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { BackButton, PressableOpacity } from '@/components/ui'
import { FEATURES } from '@/lib/featureFlags'

interface LeaderboardUser {
  id: string
  name: string | null
  avatar_url: string | null
  naapurusto: string | null
  total_points: number
}

function LeaderboardRowSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={[s.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Animated.View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.muted, opacity }} />
      <Animated.View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.muted, opacity }} />
      <View style={s.info}>
        <Animated.View style={{ width: '60%', height: 14, borderRadius: 6, backgroundColor: colors.muted, opacity }} />
        <Animated.View style={{ width: '40%', height: 10, borderRadius: 6, backgroundColor: colors.muted, opacity, marginTop: 4 }} />
      </View>
      <Animated.View style={{ width: 50, height: 16, borderRadius: 6, backgroundColor: colors.muted, opacity }} />
    </View>
  )
}

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'] // gold, silver, bronze

function LeaderboardScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [users, setUsers] = useState<LeaderboardUser[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isMonthlyData, setIsMonthlyData] = useState(false)
  const [userNeighborhood, setUserNeighborhood] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'neighborhood'>('all')
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null)
  const [currentUserPoints, setCurrentUserPoints] = useState<number>(0)
  const [userIsPro, setUserIsPro] = useState(false)

  const fetchLeaderboard = useCallback(async (neighborhood?: string | null) => {
    try {
      setFetchError(false)
      // Query user_points for this month's points to make the "this month" label accurate
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      const monthStartISO = monthStart.toISOString()

      // Try monthly leaderboard from user_points table first
      let monthlyUsers: LeaderboardUser[] = []
      try {
        const { data: monthlyData } = await (supabase.rpc as any)('get_monthly_leaderboard', {
          p_month_start: monthStartISO,
          p_neighborhood: neighborhood ?? null,
          p_limit: 10,
        })
        if (monthlyData && monthlyData.length > 0) {
          monthlyUsers = (monthlyData as any[]).map((row: any) => ({
            id: row.user_id ?? row.id,
            name: row.name,
            avatar_url: row.avatar_url,
            naapurusto: row.naapurusto,
            total_points: row.month_points ?? row.total_points ?? 0,
          }))
        }
      } catch {
        // Intentional: monthly leaderboard RPC may not exist — fall through to all-time
      }

      // If monthly RPC worked, use it; otherwise fall back to all-time total_points
      let data: any[]
      if (monthlyUsers.length > 0) {
        data = monthlyUsers
        setIsMonthlyData(true)
      } else {
        setIsMonthlyData(false)
        let query = supabase
          .from('profiles')
          .select('id, name, avatar_url, naapurusto, total_points')
          .order('total_points', { ascending: false })
          .gt('total_points', 0)
          .limit(10)

        if (neighborhood) {
          query = query.eq('naapurusto', neighborhood)
        }

        const result = await query
        data = result.data ?? []
      }

      // Filter out blocked users
      let filtered = data as unknown as LeaderboardUser[]
      if (currentUserId) {
        const blocked = await getBlockedUserIds(currentUserId)
        if (blocked.size > 0) filtered = filtered.filter(u => !blocked.has(u.id))
      }
      setUsers(filtered)

      // Find current user's rank
      if (currentUserId) {
        const inTop = (data ?? []).findIndex((u: any) => u.id === currentUserId)
        if (inTop >= 0) {
          setCurrentUserRank(inTop + 1)
          setCurrentUserPoints((data as any[])[inTop].total_points ?? 0)
        } else {
          // Get current user's points
          const { data: myProfile } = await supabase
            .from('profiles')
            .select('total_points')
            .eq('id', currentUserId)
            .maybeSingle()

          const myPoints = (myProfile as any)?.total_points ?? 0
          setCurrentUserPoints(myPoints)

          if (myPoints > 0) {
            let rankQuery = supabase
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .gt('total_points', myPoints)

            if (neighborhood) {
              rankQuery = rankQuery.eq('naapurusto', neighborhood)
            }

            const { count } = await rankQuery
            setCurrentUserRank((count ?? 0) + 1)
          } else {
            setCurrentUserRank(null)
          }
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[leaderboard] fetch failed:', err)
      setFetchError(true)
      setUsers([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase, currentUserId])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
        const { data: profile } = await supabase
          .from('profiles')
          .select('naapurusto, is_pro')
          .eq('id', user.id)
          .maybeSingle()
        if ((profile as any)?.naapurusto) {
          setUserNeighborhood((profile as any).naapurusto)
        }
        if ((profile as any)?.is_pro) {
          setUserIsPro(true)
        }
      }
    }
    init()
  }, [supabase])

  useFocusEffect(useCallback(() => {
    setLoading(true)
    fetchLeaderboard(filter === 'neighborhood' ? userNeighborhood : null)
  }, [filter, userNeighborhood, fetchLeaderboard]))

  const handleRefresh = useCallback(() => {
    hapticMedium()
    setRefreshing(true)
    fetchLeaderboard(filter === 'neighborhood' ? userNeighborhood : null)
  }, [filter, userNeighborhood, fetchLeaderboard])

  const renderItem = useCallback(({ item, index }: { item: LeaderboardUser; index: number }) => {
    const rank = index + 1
    const isCurrentUser = item.id === currentUserId
    const isTop3 = rank <= 3
    const medalColor = isTop3 ? MEDAL_COLORS[rank - 1] : undefined

    return (
      <PressableOpacity
        onPress={() => {
          if (item.id === currentUserId) {
            router.push('/(tabs)/profile')
          } else {
            router.push(`/profile/${item.id}` as any)
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={`#${rank} ${item.name ?? t('common.user')}, ${item.total_points} ${t('profile.points')}`}
        style={[
          s.row,
          {
            backgroundColor: colors.card,
            borderColor: isCurrentUser ? colors.foreground : colors.border,
            borderWidth: isCurrentUser ? 1.5 : 1,
          },
          isTop3 && s.rowTop3,
        ]}
      >
        {/* Rank */}
        <View style={[s.rankCircle, { backgroundColor: colors.muted }]}>
          {isTop3 ? (
            <Trophy size={16} color={medalColor} />
          ) : (
            <Text style={[s.rankText, { color: colors.mutedForeground }]}>{rank}</Text>
          )}
        </View>

        {/* Avatar + Info */}
        <Avatar url={item.avatar_url} name={item.name} size={isTop3 ? 48 : 40} />
        <View style={s.info}>
          <Text style={[s.name, { color: colors.foreground }, isTop3 && s.nameTop3]} numberOfLines={1}>
            {item.name ?? t('common.user')}
            {isCurrentUser ? ` (${t('common.you') ?? 'sin\u00e4'})` : ''}
          </Text>
          {item.naapurusto && (
            <Text style={[s.neighborhood, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.naapurusto}
            </Text>
          )}
        </View>

        {/* Points */}
        <View style={s.pointsWrap}>
          <Zap size={14} color={colors.foreground} fill={colors.foreground} />
          <Text style={[s.points, { color: colors.foreground }]}>{item.total_points}</Text>
        </View>
      </PressableOpacity>
    )
  }, [currentUserId, colors, t, router])

  const isCurrentUserInTop10 = users.some(u => u.id === currentUserId)

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <PressableOpacity onPress={() => router.back()} style={[s.circleBack, { backgroundColor: colors.card, borderColor: colors.border }]} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={20} color={colors.foreground} strokeWidth={1.8} />
        </PressableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('leaderboard.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Filter pills */}
      <View style={s.filterRow}>
        <PressableOpacity
          onPress={() => setFilter('all')}
          accessibilityRole="button"
          accessibilityLabel={t('leaderboard.allNeighborhoods')}
          accessibilityState={{ selected: filter === 'all' }}
          style={[
            s.filterChip,
            filter === 'all'
              ? { backgroundColor: colors.foreground }
              : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
          ]}
        >
          <Text style={[s.filterText, { color: filter === 'all' ? colors.background : colors.foreground }]}>
            {t('leaderboard.allNeighborhoods')}
          </Text>
        </PressableOpacity>
        {userNeighborhood && (
          <PressableOpacity
            onPress={() => setFilter('neighborhood')}
            accessibilityRole="button"
            accessibilityLabel={userNeighborhood}
            accessibilityState={{ selected: filter === 'neighborhood' }}
            style={[
              s.filterChip,
              filter === 'neighborhood'
                ? { backgroundColor: colors.foreground }
                : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
            ]}
          >
            <Text style={[s.filterText, { color: filter === 'neighborhood' ? colors.background : colors.foreground }]}>
              {userNeighborhood}
            </Text>
          </PressableOpacity>
        )}
      </View>

      {/* Month indicator */}
      <Text style={[s.monthLabel, { color: colors.mutedForeground }]}>{isMonthlyData ? t('leaderboard.thisMonth') : t('leaderboard.allTime') ?? 'All time'}</Text>

      {/* Pro upsell banner */}
      {FEATURES.PRO_SUBSCRIPTION && !userIsPro && (
        <PressableOpacity onPress={() => router.push('/pro')} style={[s.proBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Crown size={16} color={colors.foreground} />
          <Text style={[s.proBannerText, { color: colors.foreground }]}>{t('pro.leaderboardBanner')}</Text>
          <ChevronRight size={14} color={colors.mutedForeground} />
        </PressableOpacity>
      )}

      {loading ? (
        <View style={s.list}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <LeaderboardRowSkeleton key={i} />)}
        </View>
      ) : fetchError ? (
        <View style={s.emptyWrap}>
          <Trophy size={40} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.foreground }]}>
            {t('common.error')}
          </Text>
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
            {t('common.tryAgain')}
          </Text>
          <PressableOpacity
            onPress={() => { setLoading(true); fetchLeaderboard(filter === 'neighborhood' ? userNeighborhood : null) }}
            style={{ marginTop: 12, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.foreground }}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
          >
            <Text style={{ color: colors.background, fontFamily: fonts.bodySemi, fontSize: 14 }}>
              {t('common.retry')}
            </Text>
          </PressableOpacity>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.foreground} />
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Trophy size={40} color={colors.mutedForeground} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                {t('leaderboard.noData') ?? 'Ei viel\u00e4 pisteit\u00e4'}
              </Text>
            </View>
          }
          ListFooterComponent={
            currentUserId && !isCurrentUserInTop10 && currentUserRank != null && currentUserPoints > 0 ? (
              <View style={[s.yourRankCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.yourRankLabel, { color: colors.mutedForeground }]}>{t('leaderboard.yourRank')}</Text>
                <View style={s.yourRankRow}>
                  <Text style={[s.yourRankNum, { color: colors.foreground }]}>#{currentUserRank}</Text>
                  <View style={s.pointsWrap}>
                    <Zap size={14} color={colors.foreground} fill={colors.foreground} />
                    <Text style={[s.points, { color: colors.foreground }]}>{currentUserPoints}</Text>
                  </View>
                </View>
              </View>
            ) : null
          }
        />
      )}
    </View>
  )
}

export default function LeaderboardScreen() {
  return (
    <ScreenErrorBoundary screenName="Leaderboard">
      <LeaderboardScreenInner />
    </ScreenErrorBoundary>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  circleBack: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  filterText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
  monthLabel: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 14,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  proBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  proBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  list: {
    padding: 16,
    gap: 8,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  rowTop3: {
    paddingVertical: 18,
  },
  rankCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 14,
    fontFamily: fonts.heading,
    lineHeight: 20,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
  nameTop3: {
    fontSize: 15,
    fontFamily: fonts.headingSemi,
  },
  neighborhood: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  pointsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  points: {
    fontSize: 14,
    fontFamily: fonts.heading,
    lineHeight: 20,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
  },
  yourRankCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  yourRankLabel: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  yourRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  yourRankNum: {
    fontSize: 24,
    fontFamily: fonts.heading,
    lineHeight: 32,
  },
})
