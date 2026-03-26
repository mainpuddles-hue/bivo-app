import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, SectionList, RefreshControl, Pressable, ScrollView, StyleSheet, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { ArrowLeft, CheckCheck, Bell, MessageCircle, Star, Package, UserPlus, CalendarDays } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { EmptyState } from '@/components/EmptyState'
import { useShimmer } from '@/components/SkeletonLoaders'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo } from '@/lib/format'
import { getCachedUserId } from '@/lib/authCache'
import type { Notification } from '@/lib/types'
import { prioritizeNotifications, type PrioritizedNotification } from '@/lib/notificationPriority'

const FILTERS = [
  { key: 'all', label: 'common.all' },
  { key: 'messages', label: 'nav.messages' },
  { key: 'reviews', label: 'profile.reviews' },
  { key: 'rentals', label: 'notifications.prefRentals' },
  { key: 'system', label: 'settings.notifications' },
] as const

function getTypeIcon(type: string) {
  switch (type) {
    case 'new_message': return MessageCircle
    case 'review_received': case 'thanks_received': case 'thanks': return Star
    case 'rental_update': case 'rental_request': case 'rental_confirmed':
    case 'rental_completed': case 'rental_cancelled': case 'rental_paid': return Package
    case 'new_follower': return UserPlus
    case 'event_reminder': return CalendarDays
    case 'post_like': case 'post_comment': case 'comment': return Bell
    default: return Bell
  }
}

function getTypeColor(type: string, colors: ReturnType<typeof useTheme>['colors']) {
  switch (type) {
    case 'new_message': return colors.primary
    case 'review_received': case 'thanks_received': case 'thanks': return colors.pro
    case 'rental_update': case 'rental_request': case 'rental_confirmed':
    case 'rental_completed': case 'rental_cancelled': case 'rental_paid': return '#C98B2E'
    case 'new_follower': return colors.success
    case 'event_reminder': return '#2B8A62'
    case 'post_like': case 'post_comment': case 'comment': return colors.accent
    default: return colors.info
  }
}

function getFilterForType(type: string): string {
  if (type === 'new_message') return 'messages'
  if (type.startsWith('review') || type === 'thanks_received' || type === 'thanks') return 'reviews'
  if (type.startsWith('rental')) return 'rentals'
  if (type === 'post_like' || type === 'post_comment' || type === 'comment') return 'system'
  return 'system'
}

function groupByTime(items: PrioritizedNotification[], t: (k: string) => string) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000)

  const groups: { title: string; data: PrioritizedNotification[] }[] = [
    { title: t('notifications.today'), data: [] },
    { title: t('notifications.yesterday'), data: [] },
    { title: t('notifications.thisWeek'), data: [] },
    { title: t('notifications.earlier'), data: [] },
  ]

  for (const n of items) {
    const d = new Date(n.created_at)
    if (d >= todayStart) groups[0].data.push(n)
    else if (d >= yesterdayStart) groups[1].data.push(n)
    else if (d >= weekStart) groups[2].data.push(n)
    else groups[3].data.push(n)
  }

  return groups.filter(g => g.data.length > 0)
}

/** Build grouped notification display text */
function getGroupedTitle(item: PrioritizedNotification, t: (k: string, p?: Record<string, string | number>) => string): string {
  if (!item.isGrouped || !item.groupCount || item.groupCount <= 1) return item.title

  const firstName = item.groupNames?.[0] ?? item.from_user?.name ?? '?'
  const othersCount = item.groupCount - 1

  if (item.type === 'post_like') {
    return t('notifications.groupedLikes', { name: firstName, count: othersCount })
  }

  // Generic grouped: "Name and N others"
  return `${firstName} ${t('notifications.andOthers', { count: othersCount })} — ${item.title}`
}

function NotificationSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={styles.notifRow}>
      <Animated.View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.muted, opacity }} />
      <View style={styles.notifContent}>
        <Animated.View style={{ width: '80%', height: 14, borderRadius: 6, backgroundColor: colors.muted, opacity }} />
        <Animated.View style={{ width: '60%', height: 11, borderRadius: 6, backgroundColor: colors.muted, opacity, marginTop: 4 }} />
        <Animated.View style={{ width: '30%', height: 10, borderRadius: 6, backgroundColor: colors.muted, opacity, marginTop: 4 }} />
      </View>
    </View>
  )
}

export default function NotificationsScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const [notifications, setNotifications] = useState<PrioritizedNotification[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')

  const fetchNotifications = useCallback(async () => {
    const cachedId = await getCachedUserId()
    if (!cachedId) { setLoading(false); return }
    const { data } = await supabase
      .from('notifications')
      .select('*, from_user:profiles!notifications_from_user_id_fkey(id, name, avatar_url)')
      .eq('user_id', cachedId)
      .order('created_at', { ascending: false })
      .limit(100)
    const raw = (data ?? []) as unknown as Notification[]
    const prioritized = prioritizeNotifications(raw)
    setNotifications(prioritized)
    setLoading(false)
    setRefreshing(false)
  }, [supabase])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  const markAllRead = useCallback(async () => {
    const cachedId = await getCachedUserId()
    if (!cachedId) return
    await (supabase.from('notifications') as any).update({ is_read: true }).eq('user_id', cachedId).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }, [supabase])

  const handleTap = useCallback(async (item: PrioritizedNotification) => {
    // Mark as read
    if (!item.is_read) {
      await (supabase.from('notifications') as any).update({ is_read: true }).eq('id', item.id)
      setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n))
    }
    // Navigate based on link_type — covers all notification sources
    if (item.link_type === 'post' && item.link_id) router.push(`/post/${item.link_id}`)
    else if (item.link_type === 'conversation' && item.link_id) router.push(`/messages/${item.link_id}`)
    else if (item.link_type === 'profile' && item.link_id) router.push(`/profile/${item.link_id}`)
    else if (item.link_type === 'booking' && item.link_id) router.push(`/booking/${item.link_id}`)
    else if (item.link_type === 'event' && item.link_id) router.push({ pathname: '/(tabs)/events', params: { highlight: item.link_id } })
    // TODO: UX — notification types without a link_type still mark as read but have no navigation target.
    // Consider adding a fallback that shows the notification body in-place or navigates to a relevant screen based on item.type.
  }, [supabase, router])

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return notifications
    return notifications.filter(n => getFilterForType(n.type) === activeFilter)
  }, [notifications, activeFilter])

  const sections = useMemo(() => groupByTime(filtered, t), [filtered, t])
  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('nav.notifications')}</Text>
        {unreadCount > 0 && (
          <View style={[styles.headerBadge, { backgroundColor: colors.accent }]}>
            <Text style={[styles.headerBadgeText, { color: colors.accentForeground }]}>{unreadCount}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {unreadCount > 0 && (
          <Pressable onPress={markAllRead} hitSlop={8}>
            <CheckCheck size={20} color={colors.primary} />
          </Pressable>
        )}
      </View>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setActiveFilter(f.key)}
            style={[
              styles.filterChip,
              activeFilter === f.key
                ? { backgroundColor: colors.primary }
                : { backgroundColor: isDark ? colors.card : colors.muted },
            ]}
          >
            <Text style={[
              styles.filterText,
              { color: activeFilter === f.key ? colors.primaryForeground : colors.mutedForeground },
            ]}>
              {t(f.label)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Notification list */}
      {loading ? (
        <View style={{ padding: 16, gap: 4 }}>
          {[0, 1, 2, 3, 4, 5].map(i => <NotificationSkeleton key={i} />)}
        </View>
      ) : (
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNotifications() }} tintColor={colors.primary} />}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const TypeIcon = getTypeIcon(item.type)
          const typeColor = getTypeColor(item.type, colors)

          return (
            <Pressable onPress={() => handleTap(item)} style={({ pressed }) => [styles.notifRow, !item.is_read && { backgroundColor: isDark ? `${colors.primary}0D` : `${colors.primary}08` }, pressed && { opacity: 0.7 }]}>
              {!item.is_read && <View style={[styles.unreadBar, { backgroundColor: colors.primary }]} />}
              <View style={styles.notifAvatar}>
                {item.from_user?.avatar_url ? (
                  <Image source={{ uri: item.from_user.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFb, { backgroundColor: `${typeColor}20` }]}>
                    <TypeIcon size={18} color={typeColor} />
                  </View>
                )}
                <View style={[styles.typeIconBadge, { backgroundColor: typeColor, borderColor: colors.background }]}>
                  <TypeIcon size={10} color="#FFFFFF" />
                </View>
              </View>
              <View style={styles.notifContent}>
                <Text style={[styles.notifTitle, { color: colors.foreground }, !item.is_read && { fontWeight: '600' }]} numberOfLines={2}>
                  {getGroupedTitle(item, t)}
                </Text>
                {item.body && <Text style={[styles.notifBody, { color: colors.mutedForeground }]} numberOfLines={1}>{item.body}</Text>}
                <View style={styles.notifMeta}>
                  <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>
                    {formatTimeAgo(item.created_at, t, locale)}
                  </Text>
                  {item.isGrouped && item.groupCount && item.groupCount > 1 && (
                    <View style={[styles.groupBadge, { backgroundColor: `${colors.primary}1A` }]}>
                      <Text style={[styles.groupBadgeText, { color: colors.primary }]}>{item.groupCount}</Text>
                    </View>
                  )}
                </View>
              </View>
              {!item.is_read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
            </Pressable>
          )
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon={<Bell size={36} color={colors.primary} />}
              title={t('notifications.empty')}
            />
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi, lineHeight: 28 },
  headerBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  headerBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: fonts.bodySemi, lineHeight: 14 },
  filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, minHeight: 36 },
  filterText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 17 },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: fonts.bodySemi, lineHeight: 17 },
  notifRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14, position: 'relative',
  },
  unreadBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: 1.5 },
  notifAvatar: { position: 'relative' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFb: { alignItems: 'center', justifyContent: 'center' },
  typeIconBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  notifContent: { flex: 1, gap: 3 },
  notifTitle: { fontSize: 14, fontWeight: '400', lineHeight: 19 },
  notifBody: { fontSize: 13, lineHeight: 17 },
  notifTime: { fontSize: 11, marginTop: 2, lineHeight: 14 },
  notifMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  groupBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  groupBadgeText: { fontSize: 10, fontWeight: '700', fontFamily: fonts.bodySemi, lineHeight: 13 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, lineHeight: 20 },
})
