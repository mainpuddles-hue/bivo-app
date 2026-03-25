import { useState, useEffect, useCallback } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, Zap, Trophy } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { Avatar } from '@/components/Avatar'
import { fonts } from '@/lib/fonts'

interface LeaderboardUser {
  id: string
  name: string | null
  avatar_url: string | null
  naapurusto: string | null
  total_points: number
}

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'] // gold, silver, bronze

export default function LeaderboardScreen() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [users, setUsers] = useState<LeaderboardUser[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userNeighborhood, setUserNeighborhood] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'neighborhood'>('all')
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null)
  const [currentUserPoints, setCurrentUserPoints] = useState<number>(0)

  const fetchLeaderboard = useCallback(async (neighborhood?: string | null) => {
    try {
      let query = supabase
        .from('profiles')
        .select('id, name, avatar_url, naapurusto, total_points')
        .order('total_points', { ascending: false })
        .gt('total_points', 0)
        .limit(10)

      if (neighborhood) {
        query = query.eq('naapurusto', neighborhood)
      }

      const { data } = await query
      setUsers((data ?? []) as unknown as LeaderboardUser[])

      // Find current user's rank
      if (currentUserId) {
        const inTop = (data ?? []).findIndex((u: any) => u.id === currentUserId)
        if (inTop >= 0) {
          setCurrentUserRank(inTop + 1)
          setCurrentUserPoints((data as any[])[inTop].total_points ?? 0)
        } else {
          // Fetch user's rank separately
          let countQuery = supabase
            .from('profiles')
            .select('id', { count: 'exact', head: true })

          if (neighborhood) {
            countQuery = countQuery.eq('naapurusto', neighborhood)
          }

          // Get current user's points
          const { data: myProfile } = await supabase
            .from('profiles')
            .select('total_points')
            .eq('id', currentUserId)
            .single()

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
    } catch {
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
          .select('naapurusto')
          .eq('id', user.id)
          .single()
        if ((profile as any)?.naapurusto) {
          setUserNeighborhood((profile as any).naapurusto)
        }
      }
    }
    init()
  }, [supabase])

  useEffect(() => {
    setLoading(true)
    fetchLeaderboard(filter === 'neighborhood' ? userNeighborhood : null)
  }, [filter, userNeighborhood, fetchLeaderboard])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    fetchLeaderboard(filter === 'neighborhood' ? userNeighborhood : null)
  }, [filter, userNeighborhood, fetchLeaderboard])

  const renderItem = useCallback(({ item, index }: { item: LeaderboardUser; index: number }) => {
    const rank = index + 1
    const isCurrentUser = item.id === currentUserId
    const isTop3 = rank <= 3
    const medalColor = isTop3 ? MEDAL_COLORS[rank - 1] : undefined

    return (
      <Pressable
        onPress={() => {
          if (item.id === currentUserId) {
            router.push('/(tabs)/profile')
          } else {
            router.push(`/profile/${item.id}` as any)
          }
        }}
        style={[
          s.row,
          { backgroundColor: isCurrentUser ? `${colors.primary}10` : colors.card },
          isTop3 && { borderLeftWidth: 3, borderLeftColor: medalColor },
        ]}
      >
        {/* Rank */}
        <View style={[s.rankCircle, isTop3 && { backgroundColor: `${medalColor}25` }]}>
          {isTop3 ? (
            <Trophy size={16} color={medalColor} />
          ) : (
            <Text style={[s.rankText, { color: colors.mutedForeground }]}>{rank}</Text>
          )}
        </View>

        {/* Avatar + Info */}
        <Avatar url={item.avatar_url} name={item.name} size={40} />
        <View style={s.info}>
          <Text style={[s.name, { color: colors.foreground }]} numberOfLines={1}>
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
          <Zap size={14} color={colors.pro} fill={colors.pro} />
          <Text style={[s.points, { color: colors.pro }]}>{item.total_points}</Text>
        </View>
      </Pressable>
    )
  }, [currentUserId, colors, t, router])

  const isCurrentUserInTop10 = users.some(u => u.id === currentUserId)

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('leaderboard.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Filter chips */}
      <View style={s.filterRow}>
        <Pressable
          onPress={() => setFilter('all')}
          style={[
            s.filterChip,
            {
              backgroundColor: filter === 'all' ? colors.primary : (isDark ? colors.card : colors.muted),
            },
          ]}
        >
          <Text style={[s.filterText, { color: filter === 'all' ? colors.primaryForeground : colors.foreground }]}>
            {t('leaderboard.allNeighborhoods')}
          </Text>
        </Pressable>
        {userNeighborhood && (
          <Pressable
            onPress={() => setFilter('neighborhood')}
            style={[
              s.filterChip,
              {
                backgroundColor: filter === 'neighborhood' ? colors.primary : (isDark ? colors.card : colors.muted),
              },
            ]}
          >
            <Text style={[s.filterText, { color: filter === 'neighborhood' ? colors.primaryForeground : colors.foreground }]}>
              {userNeighborhood}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Month indicator */}
      <Text style={[s.monthLabel, { color: colors.mutedForeground }]}>{t('leaderboard.thisMonth')}</Text>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
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
            currentUserId && !isCurrentUserInTop10 && currentUserRank ? (
              <View style={[s.yourRankCard, { backgroundColor: `${colors.primary}10`, borderColor: colors.primary }]}>
                <Text style={[s.yourRankLabel, { color: colors.primary }]}>{t('leaderboard.yourRank')}</Text>
                <View style={s.yourRankRow}>
                  <Text style={[s.yourRankNum, { color: colors.primary }]}>#{currentUserRank}</Text>
                  <View style={s.pointsWrap}>
                    <Zap size={14} color={colors.pro} fill={colors.pro} />
                    <Text style={[s.points, { color: colors.pro }]}>{currentUserPoints}</Text>
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  monthLabel: {
    fontSize: 12,
    fontFamily: fonts.body,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
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
    padding: 12,
    borderRadius: 12,
  },
  rankCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.heading,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  neighborhood: {
    fontSize: 12,
    fontFamily: fonts.body,
  },
  pointsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  points: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.heading,
  },
  emptyWrap: {
    alignItems: 'center',
    gap: 12,
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: fonts.body,
  },
  yourRankCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  yourRankLabel: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
  },
  yourRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  yourRankNum: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: fonts.heading,
  },
})
