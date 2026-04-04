declare const __DEV__: boolean

import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, Pressable, TextInput, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { ArrowLeft, Shield, Search, Ban, EyeOff, Check, AlertTriangle, Users, BarChart3, Flag } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { Avatar } from '@/components/Avatar'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { formatTimeAgo } from '@/lib/format'

type Tab = 'flags' | 'users' | 'stats'

interface ContentFlag {
  id: string
  post_id: string | null
  flag_type: string
  details: string | null
  auto_hidden: boolean
  reviewed: boolean
  created_at: string
  post?: { id: string; title: string; user_id: string } | null
  reporter?: { id: string; name: string; avatar_url: string | null } | null
}

interface AdminUser {
  id: string
  name: string
  avatar_url: string | null
  naapurusto: string
  total_points: number | null
  is_banned: boolean
  created_at: string
}

interface Stats {
  totalUsers: number
  activeToday: number
  postsThisWeek: number
  bookingsThisWeek: number
  unreviewedFlags: number
}

function AdminScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('flags')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Flags state
  const [flags, setFlags] = useState<ContentFlag[]>([])

  // Users state
  const [users, setUsers] = useState<AdminUser[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [searchingUsers, setSearchingUsers] = useState(false)

  // Stats state
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    activeToday: 0,
    postsThisWeek: 0,
    bookingsThisWeek: 0,
    unreviewedFlags: 0,
  })

  // Check admin status
  useEffect(() => {
    async function checkAdmin() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setIsAdmin(false); setLoading(false); return }
      const { data } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()
      setIsAdmin(!!(data as any)?.is_admin)
      setLoading(false)
    }
    checkAdmin()
  }, [supabase])

  // Load data for active tab
  const loadData = useCallback(async () => {
    if (!isAdmin) return
    try {
      if (activeTab === 'flags') {
        const { data } = await supabase
          .from('content_flags')
          .select('*, post:posts(id, title, user_id)')
          .order('created_at', { ascending: false })
          .limit(50)
        setFlags((data ?? []) as unknown as ContentFlag[])
      } else if (activeTab === 'stats') {
        const today = new Date().toISOString().split('T')[0]
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

        const safeQuery = (q: any) => Promise.resolve(q).then((r: any) => r).catch(() => ({ count: 0 }))
        const [usersRes, activeRes, postsRes, bookingsRes, flagsRes] = await Promise.all([
          safeQuery(supabase.from('profiles').select('id', { count: 'exact', head: true })),
          safeQuery(supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('updated_at', today)),
          safeQuery(supabase.from('posts').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo)),
          safeQuery((supabase.from('rental_bookings') as any).select('id', { count: 'exact', head: true }).gte('created_at', weekAgo)),
          safeQuery(supabase.from('content_flags').select('id', { count: 'exact', head: true }).eq('reviewed', false)),
        ])

        setStats({
          totalUsers: usersRes.count ?? 0,
          activeToday: activeRes.count ?? 0,
          postsThisWeek: postsRes.count ?? 0,
          bookingsThisWeek: bookingsRes.count ?? 0,
          unreviewedFlags: flagsRes.count ?? 0,
        })
      }
    } catch (err) {
      if (__DEV__) console.warn('[admin] loadData failed:', err)
    }
  }, [activeTab, isAdmin, supabase])

  useFocusEffect(useCallback(() => { loadData() }, [loadData]))

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  // Search users
  const searchUsers = useCallback(async () => {
    if (!userSearch.trim()) { setUsers([]); return }
    setSearchingUsers(true)
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, naapurusto, total_points, is_banned, created_at')
        .ilike('name', `%${userSearch.trim()}%`)
        .limit(20)
      setUsers((data ?? []) as unknown as AdminUser[])
    } catch (err) {
      if (__DEV__) console.warn('[admin] searchUsers failed:', err)
    }
    setSearchingUsers(false)
  }, [userSearch, supabase])

  // Actions
  const hidePost = useCallback(async (postId: string, flagId: string) => {
    try {
      await Promise.all([
        (supabase.from('posts') as any).update({ is_active: false }).eq('id', postId),
        (supabase.from('content_flags') as any).update({ reviewed: true }).eq('id', flagId),
      ])
      setFlags(prev => prev.map(f => f.id === flagId ? { ...f, reviewed: true } : f))
      Alert.alert(t('common.success'), t('admin.hidePost'))
    } catch {
      Alert.alert(t('common.error'))
    }
  }, [supabase, t])

  const allowPost = useCallback(async (flagId: string) => {
    try {
      await (supabase.from('content_flags') as any).update({ reviewed: true }).eq('id', flagId)
      setFlags(prev => prev.map(f => f.id === flagId ? { ...f, reviewed: true } : f))
    } catch {
      Alert.alert(t('common.error'))
    }
  }, [supabase, t])

  const toggleBan = useCallback(async (userId: string, currentlyBanned: boolean) => {
    const action = currentlyBanned ? t('admin.unbanUser') : t('admin.banUser')
    Alert.alert(action, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await (supabase.from('profiles') as any).update({ is_banned: !currentlyBanned }).eq('id', userId)
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_banned: !currentlyBanned } : u))
          } catch {
            Alert.alert(t('common.error'))
          }
        },
      },
    ])
  }, [supabase, t])

  // Loading / access denied
  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
      </View>
    )
  }

  if (!isAdmin) {
    return (
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={t('common.back')} accessibilityRole="button">
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('admin.accessDenied')}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={s.emptyContainer}>
          <Shield size={48} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('admin.accessDeniedDesc')}</Text>
        </View>
      </View>
    )
  }

  const TAB_CONFIG: { key: Tab; label: string; icon: typeof Flag }[] = [
    { key: 'flags', label: t('admin.flags'), icon: Flag },
    { key: 'users', label: t('admin.users'), icon: Users },
    { key: 'stats', label: t('admin.stats'), icon: BarChart3 },
  ]

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={t('common.back')} accessibilityRole="button">
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <View style={s.headerCenter}>
          <Shield size={18} color={colors.destructive} />
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('admin.title')}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Tab chips */}
      <View style={s.tabs}>
        {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
          <Pressable
            key={key}
            onPress={() => setActiveTab(key)}
            accessibilityLabel={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === key }}
            style={[
              s.tab,
              {
                backgroundColor: activeTab === key ? colors.primary : colors.muted,
                borderColor: activeTab === key ? colors.primary : colors.border,
              },
            ]}
          >
            <Icon size={14} color={activeTab === key ? colors.primaryForeground : colors.mutedForeground} />
            <Text style={[s.tabText, { color: activeTab === key ? colors.primaryForeground : colors.mutedForeground }]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={s.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* FLAGS TAB */}
        {activeTab === 'flags' && (
          <>
            {flags.length === 0 ? (
              <View style={s.emptyContainer}>
                <Check size={40} color={colors.accent} />
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('admin.noFlags')}</Text>
              </View>
            ) : (
              flags.map(flag => (
                <View key={flag.id} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={s.flagHeader}>
                    <View style={[s.flagBadge, { backgroundColor: flagColor(flag.flag_type, colors) }]}>
                      <AlertTriangle size={12} color={colors.primaryForeground} />
                      <Text style={[s.flagBadgeText, { color: colors.primaryForeground }]}>
                        {t(`admin.${flag.flag_type}` as any) || flag.flag_type}
                      </Text>
                    </View>
                    {flag.reviewed && (
                      <View style={[s.reviewedBadge, { backgroundColor: colors.accent + '20' }]}>
                        <Check size={12} color={colors.accent} />
                        <Text style={[s.reviewedText, { color: colors.accent }]}>{t('admin.reviewed')}</Text>
                      </View>
                    )}
                    {flag.auto_hidden && (
                      <View style={[s.reviewedBadge, { backgroundColor: colors.destructive + '20' }]}>
                        <EyeOff size={12} color={colors.destructive} />
                        <Text style={[s.reviewedText, { color: colors.destructive }]}>{t('admin.autoHidden')}</Text>
                      </View>
                    )}
                  </View>

                  <Text style={[s.flagTitle, { color: colors.foreground }]}>
                    {flag.post?.title ?? `Post ${(flag.post_id ?? '').slice(0, 8)}`}
                  </Text>

                  {flag.details && (
                    <Text style={[s.flagDetails, { color: colors.mutedForeground }]} numberOfLines={3}>
                      {flag.details}
                    </Text>
                  )}

                  <Text style={[s.flagDate, { color: colors.mutedForeground }]}>
                    {formatTimeAgo(flag.created_at, t, locale)}
                  </Text>

                  {!flag.reviewed && (
                    <View style={s.actions}>
                      {flag.post_id && (
                        <Pressable
                          onPress={() => hidePost(flag.post_id!, flag.id)}
                          style={[s.actionBtn, { backgroundColor: colors.destructive + '15' }]}
                          accessibilityLabel={t('admin.hidePost')}
                          accessibilityRole="button"
                        >
                          <EyeOff size={14} color={colors.destructive} />
                          <Text style={[s.actionText, { color: colors.destructive }]}>{t('admin.hidePost')}</Text>
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => allowPost(flag.id)}
                        style={[s.actionBtn, { backgroundColor: colors.accent + '15' }]}
                        accessibilityLabel={t('admin.allowPost')}
                        accessibilityRole="button"
                      >
                        <Check size={14} color={colors.accent} />
                        <Text style={[s.actionText, { color: colors.accent }]}>{t('admin.allowPost')}</Text>
                      </Pressable>
                      {flag.post?.user_id && (
                        <Pressable
                          onPress={() => toggleBan(flag.post!.user_id, false)}
                          style={[s.actionBtn, { backgroundColor: colors.destructive + '15' }]}
                          accessibilityLabel={t('admin.banUser')}
                          accessibilityRole="button"
                        >
                          <Ban size={14} color={colors.destructive} />
                          <Text style={[s.actionText, { color: colors.destructive }]}>{t('admin.banUser')}</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <>
            <View style={[s.searchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Search size={16} color={colors.mutedForeground} />
              <TextInput
                value={userSearch}
                onChangeText={setUserSearch}
                placeholder={t('admin.searchUsers')}
                placeholderTextColor={colors.mutedForeground}
                style={[s.searchInput, { color: colors.foreground }]}
                onSubmitEditing={searchUsers}
                returnKeyType="search"
              />
              {searchingUsers && <ActivityIndicator size="small" color={colors.primary} />}
            </View>

            {users.map(user => (
              <View key={user.id} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={s.userRow}>
                  <Avatar url={user.avatar_url} name={user.name} size={40} />
                  <View style={s.userInfo}>
                    <View style={s.userNameRow}>
                      <Text style={[s.userName, { color: colors.foreground }]}>{user.name}</Text>
                      {user.is_banned && (
                        <View style={[s.bannedBadge, { backgroundColor: colors.destructive + '20' }]}>
                          <Text style={[s.bannedText, { color: colors.destructive }]}>{t('admin.banned')}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[s.userMeta, { color: colors.mutedForeground }]}>
                      {user.naapurusto} {'\u2022'} {t('admin.trustScore')}: {user.total_points ?? 0}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => toggleBan(user.id, !!user.is_banned)}
                    style={[
                      s.banBtn,
                      { backgroundColor: user.is_banned ? colors.accent + '15' : colors.destructive + '15' },
                    ]}
                    accessibilityLabel={user.is_banned ? t('admin.unbanUser') : t('admin.banUser')}
                    accessibilityRole="button"
                  >
                    {user.is_banned ? (
                      <Check size={16} color={colors.accent} />
                    ) : (
                      <Ban size={16} color={colors.destructive} />
                    )}
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {/* STATS TAB */}
        {activeTab === 'stats' && (
          <View style={s.statsGrid}>
            {([
              { label: t('admin.totalUsers'), value: stats.totalUsers, color: colors.primary },
              { label: t('admin.activeToday'), value: stats.activeToday, color: colors.accent },
              { label: t('admin.postsThisWeek'), value: stats.postsThisWeek, color: colors.info },
              { label: t('admin.bookingsThisWeek'), value: stats.bookingsThisWeek, color: colors.pro },
              { label: t('admin.unreviewedFlags'), value: stats.unreviewedFlags, color: colors.destructive },
            ] as const).map((stat, i) => (
              <View key={i} style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function flagColor(type: string, colors: any): string {
  switch (type) {
    case 'spam': return colors.pro
    case 'inappropriate': return colors.destructive
    case 'scam': return colors.destructive
    default: return colors.mutedForeground
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    paddingTop: 12,
    marginBottom: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.bodyMedium,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
  },
  flagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  flagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  flagBadgeText: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.bodySemi,
  },
  reviewedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  reviewedText: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.bodyMedium,
  },
  flagTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.bodySemi,
    marginBottom: 4,
  },
  flagDetails: {
    fontSize: 13,
    fontFamily: fonts.body,
    marginBottom: 6,
    lineHeight: 18,
  },
  flagDate: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 44,
  },
  actionText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.bodyMedium,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userName: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.bodySemi,
  },
  userMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
    marginTop: 2,
  },
  bannedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  bannedText: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.bodySemi,
  },
  banBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: {
    gap: 8,
  },
  statCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    lineHeight: 40,
    fontFamily: fonts.heading,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 16,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
    maxWidth: 280,
  },
})

export default function AdminScreen() {
  return (
    <ScreenErrorBoundary screenName="Admin">
      <AdminScreenInner />
    </ScreenErrorBoundary>
  )
}
