import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, Pressable, TextInput, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native'
import { PressableOpacity } from '@/components/ui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { ArrowLeft, Shield, Search, Ban, EyeOff, Check, AlertTriangle, Users, BarChart3, Flag } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { Avatar } from '@/components/Avatar'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { useToast } from '@/components/Toast'
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
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()

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

  // Check admin status — redirect non-admins
  useEffect(() => {
    async function checkAdmin() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login'); return }
      const { data } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .maybeSingle()
      const admin = !!(data as any)?.is_admin
      if (!admin) { router.back(); return }
      setIsAdmin(true)
      setLoading(false)
    }
    checkAdmin()
  }, [supabase, router])

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
        .ilike('name', `%${userSearch.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')}%`)
        .limit(20)
      setUsers((data ?? []) as unknown as AdminUser[])
    } catch (err) {
      if (__DEV__) console.warn('[admin] searchUsers failed:', err)
    }
    setSearchingUsers(false)
  }, [userSearch, supabase])

  // Audit helper — logs admin action to audit_log table
  const logAudit = useCallback(async (action: string, tableName: string, recordId: string, details?: Record<string, unknown>) => {
    try {
      await (supabase.from('audit_log') as any).insert({
        action: `admin:${action}`,
        table_name: tableName,
        record_id: recordId,
        new_data: details ?? null,
      })
    } catch (e) {
      if (__DEV__) console.warn('[admin] audit log failed:', e)
    }
  }, [supabase])

  // Actions
  const hidePost = useCallback(async (postId: string, flagId: string) => {
    const [postRes, flagRes] = await Promise.all([
      (supabase.from('posts') as any).update({ is_active: false }).eq('id', postId),
      (supabase.from('content_flags') as any).update({ reviewed: true }).eq('id', flagId),
    ])
    if ((postRes as any).error || (flagRes as any).error) {
      toast.show({ message: t('common.error'), type: 'error' })
      return
    }
    setFlags(prev => prev.map(f => f.id === flagId ? { ...f, reviewed: true } : f))
    toast.show({ message: t('admin.hidePost'), type: 'success' })
    logAudit('hide_post', 'posts', postId, { flag_id: flagId })
  }, [supabase, t, toast, logAudit])

  const allowPost = useCallback(async (flagId: string) => {
    const { error } = await (supabase.from('content_flags') as any).update({ reviewed: true }).eq('id', flagId)
    if (error) { toast.show({ message: t('common.error'), type: 'error' }); return }
    setFlags(prev => prev.map(f => f.id === flagId ? { ...f, reviewed: true } : f))
    toast.show({ message: t('admin.allowPost'), type: 'success' })
    logAudit('allow_post', 'content_flags', flagId)
  }, [supabase, t, toast, logAudit])

  const toggleBan = useCallback(async (userId: string, currentlyBanned: boolean) => {
    const action = currentlyBanned ? t('admin.unbanUser') : t('admin.banUser')
    Alert.alert(action, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await (supabase.from('profiles') as any).update({ is_banned: !currentlyBanned }).eq('id', userId)
          if (error) { toast.show({ message: t('common.error'), type: 'error' }); return }
          setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_banned: !currentlyBanned } : u))
          toast.show({ message: action, type: 'success' })
          logAudit(currentlyBanned ? 'unban_user' : 'ban_user', 'profiles', userId)
        },
      },
    ])
  }, [supabase, t, toast, logAudit])

  // Loading / access denied
  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <ActivityIndicator size="large" color={colors.foreground} style={{ marginTop: 80 }} />
      </View>
    )
  }

  if (!isAdmin) {
    return (
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={[s.circleBack, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[s.headerTitle, { color: colors.foreground }]} accessibilityRole="header">{t('admin.accessDenied')}</Text>
          <View style={{ width: 36 }} />
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
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={[s.circleBack, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]} accessibilityRole="header">{t('admin.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab chips -- monochrome */}
      <View style={s.tabs}>
        {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
          <PressableOpacity
            key={key}
            onPress={() => setActiveTab(key)}
            accessibilityLabel={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === key }}
            style={[
              s.tab,
              {
                backgroundColor: activeTab === key ? colors.foreground : colors.card,
                borderColor: activeTab === key ? colors.foreground : colors.border,
              },
            ]}
          >
            <Icon size={14} color={activeTab === key ? colors.primaryForeground : colors.mutedForeground} />
            <Text style={[s.tabText, { color: activeTab === key ? colors.primaryForeground : colors.mutedForeground }]}>
              {label}
            </Text>
          </PressableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={s.content}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.foreground} />}
        >
          {/* FLAGS TAB */}
          {activeTab === 'flags' && (
            <>
              {flags.length === 0 ? (
                <View style={s.emptyContainer}>
                  <Check size={40} color={colors.mutedForeground} />
                  <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('admin.noFlags')}</Text>
                </View>
              ) : (
                flags.map(flag => (
                  <View key={flag.id} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={s.flagHeader}>
                      <View style={[s.flagBadge, { backgroundColor: colors.foreground }]}>
                        <AlertTriangle size={12} color={colors.primaryForeground} />
                        <Text style={[s.flagBadgeText, { color: colors.primaryForeground }]}>
                          {t(`admin.${flag.flag_type}` as any) || flag.flag_type}
                        </Text>
                      </View>
                      {flag.reviewed && (
                        <View style={[s.reviewedBadge, { backgroundColor: colors.muted }]}>
                          <Check size={12} color={colors.foreground} />
                          <Text style={[s.reviewedText, { color: colors.foreground }]}>{t('admin.reviewed')}</Text>
                        </View>
                      )}
                      {flag.auto_hidden && (
                        <View style={[s.reviewedBadge, { backgroundColor: colors.muted }]}>
                          <EyeOff size={12} color={colors.mutedForeground} />
                          <Text style={[s.reviewedText, { color: colors.mutedForeground }]}>{t('admin.autoHidden')}</Text>
                        </View>
                      )}
                    </View>

                    <Text style={[s.flagTitle, { color: colors.foreground }]} numberOfLines={2}>
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
                          <PressableOpacity
                            onPress={() => hidePost(flag.post_id!, flag.id)}
                            style={[s.actionBtn, { backgroundColor: colors.foreground }]}
                            accessibilityLabel={t('admin.hidePost')}
                            accessibilityRole="button"
                          >
                            <EyeOff size={14} color={colors.primaryForeground} />
                            <Text style={[s.actionText, { color: colors.primaryForeground }]}>{t('admin.hidePost')}</Text>
                          </PressableOpacity>
                        )}
                        <PressableOpacity
                          onPress={() => allowPost(flag.id)}
                          style={[s.actionBtn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                          accessibilityLabel={t('admin.allowPost')}
                          accessibilityRole="button"
                        >
                          <Check size={14} color={colors.foreground} />
                          <Text style={[s.actionText, { color: colors.foreground }]}>{t('admin.allowPost')}</Text>
                        </PressableOpacity>
                        {flag.post?.user_id && (
                          <PressableOpacity
                            onPress={() => toggleBan(flag.post!.user_id, false)}
                            style={[s.actionBtn, { backgroundColor: colors.foreground }]}
                            accessibilityLabel={t('admin.banUser')}
                            accessibilityRole="button"
                          >
                            <Ban size={14} color={colors.primaryForeground} />
                            <Text style={[s.actionText, { color: colors.primaryForeground }]}>{t('admin.banUser')}</Text>
                          </PressableOpacity>
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
                {searchingUsers && <ActivityIndicator size="small" color={colors.foreground} />}
              </View>

              {users.map(user => (
                <View key={user.id} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={s.userRow}>
                    <Avatar url={user.avatar_url} name={user.name} size={40} />
                    <View style={s.userInfo}>
                      <View style={s.userNameRow}>
                        <Text style={[s.userName, { color: colors.foreground }]} numberOfLines={1}>{user.name}</Text>
                        {user.is_banned && (
                          <View style={[s.bannedBadge, { backgroundColor: colors.muted }]}>
                            <Text style={[s.bannedText, { color: colors.foreground }]}>{t('admin.banned')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[s.userMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {user.naapurusto} {'\u2022'} {t('admin.trustScore')}: {user.total_points ?? 0}
                      </Text>
                    </View>
                    <PressableOpacity
                      onPress={() => toggleBan(user.id, !!user.is_banned)}
                      style={[
                        s.banBtn,
                        { backgroundColor: user.is_banned ? colors.card : colors.foreground, borderWidth: user.is_banned ? 1 : 0, borderColor: colors.border },
                      ]}
                      accessibilityLabel={user.is_banned ? t('admin.unbanUser') : t('admin.banUser')}
                      accessibilityRole="button"
                    >
                      {user.is_banned ? (
                        <Check size={16} color={colors.foreground} />
                      ) : (
                        <Ban size={16} color={colors.primaryForeground} />
                      )}
                    </PressableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* STATS TAB */}
          {activeTab === 'stats' && (
            <View style={s.statsGrid}>
              {([
                { label: t('admin.totalUsers'), value: stats.totalUsers },
                { label: t('admin.activeToday'), value: stats.activeToday },
                { label: t('admin.postsThisWeek'), value: stats.postsThisWeek },
                { label: t('admin.bookingsThisWeek'), value: stats.bookingsThisWeek },
                { label: t('admin.unreviewedFlags'), value: stats.unreviewedFlags },
              ] as const).map((stat, i) => (
                <View key={i} style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[s.statValue, { color: colors.foreground }]}>{stat.value}</Text>
                  <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
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
  circleBack: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
    lineHeight: 22,
    textAlign: 'center',
    flex: 1,
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
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
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
    borderRadius: 20,
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
    borderRadius: 16,
  },
  flagBadgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.bodySemi,
  },
  reviewedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 16,
  },
  reviewedText: {
    fontSize: 12,
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
    marginBottom: 8,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
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
    paddingVertical: 12,
    borderRadius: 20,
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
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.bodySemi,
  },
  banBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsGrid: {
    gap: 8,
  },
  statCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
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
