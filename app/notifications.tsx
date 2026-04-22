declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, SectionList, RefreshControl, ScrollView, StyleSheet, Animated, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { getBlockedUserIds } from '@/lib/blockedUsers'
import { Image } from 'expo-image'
import { Bell, ArrowLeft, LogIn, RefreshCw } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { EmptyState } from '@/components/EmptyState'
import { useShimmer } from '@/components/SkeletonLoaders'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo } from '@/lib/format'
import { getCachedUserId } from '@/lib/authCache'
import { FEATURES } from '@/lib/featureFlags'
import type { Notification } from '@/lib/types'
import { prioritizeNotifications, type PrioritizedNotification } from '@/lib/notificationPriority'

const ALL_FILTERS = [
  { key: 'all', label: 'common.all' },
  { key: 'rentals', label: 'notifications.prefRentals' },
  { key: 'messages', label: 'nav.messages' },
  { key: 'reviews', label: 'profile.reviews' },
] as const

// Hide rental filter when lending feature is disabled
const FILTERS = FEATURES.LENDING
  ? ALL_FILTERS
  : ALL_FILTERS.filter(f => f.key !== 'rentals')

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

/** Map notification type to a human-readable i18n title */
function getLocalizedTypeTitle(type: string, t: (k: string) => string): string | null {
  const typeMap: Record<string, string> = {
    new_message: 'notifications.newMessage',
    review_received: 'notifications.reviewReceived',
    thanks_received: 'notifications.thanksReceived',
    thanks: 'notifications.thanksReceived',
    new_follower: 'notifications.newFollower',
    post_like: 'notifications.postLiked',
    post_comment: 'notifications.postCommented',
    comment: 'notifications.commentReply',
    event_reminder: 'notifications.eventReminder',
    event_joined: 'notifications.eventJoined',
    rental_request: 'notifications.rentalRequest',
    rental_confirmed: 'notifications.rentalConfirmed',
    rental_completed: 'notifications.rentalCompleted',
    rental_cancelled: 'notifications.rentalCancelled',
    rental_paid: 'notifications.rentalPaid',
    rental_refunded: 'notifications.rentalRefunded',
    rental_review: 'notifications.rentalReview',
    rental_disputed: 'notifications.rentalDisputed',
    activity_new: 'notifications.activityNew',
    activity_new_member: 'notifications.activityNewMember',
    activity_cancelled: 'notifications.activityCancelled',
    badge_earned: 'notifications.badgeEarned',
    forum_reply: 'notifications.forumReplyTitle',
    new_post_nearby: 'notifications.newPostNearby',
    neighborhood_digest: 'notifications.neighborhoodDigest',
    payment_failed: 'notifications.paymentFailed',
    search_match: 'notifications.savedSearchMatch',
    offer_received: 'notifications.offerReceived',
  }
  const key = typeMap[type]
  if (!key) return null
  const translated = t(key)
  // If translation returns the key itself, it's missing — return null so we fall back to raw title
  return translated !== key ? translated : null
}

/** Build grouped notification display text */
function getGroupedTitle(item: PrioritizedNotification, t: (k: string, p?: Record<string, string | number>) => string): string {
  // Resolve title: prefer i18n-translated type name, fall back to stored title
  const resolvedTitle = getLocalizedTypeTitle(item.type, t) ?? item.title ?? ''

  if (!item.isGrouped || !item.groupCount || item.groupCount <= 1) return resolvedTitle

  const firstName = item.groupNames?.[0] ?? item.from_user?.name ?? '?'
  const othersCount = item.groupCount - 1

  if (item.type === 'post_like') {
    return t('notifications.groupedLikes', { name: firstName, count: othersCount })
  }

  // Generic grouped: "Name and N others"
  return `${firstName} ${t('notifications.andOthers', { count: othersCount })} — ${resolvedTitle}`
}

/** Get initial letter for avatar fallback */
function getInitial(item: PrioritizedNotification): string {
  const name = item.from_user?.name
  if (name && name.length > 0) return name.charAt(0).toUpperCase()
  return '?'
}

/** Check if notification type has action buttons */
function hasActionButtons(type: string): boolean {
  return type === 'rental_request' || type === 'new_follower'
}

function NotificationSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={skeletonStyles.row}>
      <Animated.View style={[skeletonStyles.avatar, { backgroundColor: colors.muted, opacity }]} />
      <View style={skeletonStyles.content}>
        <Animated.View style={[skeletonStyles.titleLine, { backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[skeletonStyles.bodyLine, { backgroundColor: colors.muted, opacity }]} />
      </View>
    </View>
  )
}

const skeletonStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  content: { flex: 1, gap: 6, paddingTop: 2 },
  titleLine: { width: '80%', height: 14, borderRadius: 6 },
  bodyLine: { width: '60%', height: 11, borderRadius: 6 },
})

function NotificationsScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const [notifications, setNotifications] = useState<PrioritizedNotification[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState('all')
  // Expanded groups state — tracks which grouped notifications are expanded
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [fetchError, setFetchError] = useState(false)

  const warmTint = useMemo(() => isDark ? 'rgba(240,238,233,0.08)' : '#F0EEE9', [isDark])

  const fetchNotifications = useCallback(async () => {
    setFetchError(false)
    try {
      const cachedId = await getCachedUserId()
      if (!cachedId) { setIsLoggedIn(false); setUserId(null); setLoading(false); setRefreshing(false); return }
      setIsLoggedIn(true)
      setUserId(cachedId)
      const { data } = await supabase
        .from('notifications')
        .select('*, from_user:profiles!notifications_from_user_id_fkey(id, name, avatar_url)')
        .eq('user_id', cachedId)
        .order('created_at', { ascending: false })
        .limit(100)
      let raw = (data ?? []) as unknown as Notification[]
      // Filter out notifications from blocked users
      if (cachedId) {
        const blocked = await getBlockedUserIds(cachedId)
        if (blocked.size > 0) raw = raw.filter(n => !n.from_user_id || !blocked.has(n.from_user_id))
      }
      const prioritized = prioritizeNotifications(raw)
      setNotifications(prioritized)
    } catch {
      setNotifications([])
      setFetchError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase])

  useFocusEffect(useCallback(() => { fetchNotifications() }, [fetchNotifications]))

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!isLoggedIn || !userId) return
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, () => {
        fetchNotifications()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, isLoggedIn, supabase, fetchNotifications])

  // Mark all as read
  const markAllRead = useCallback(async () => {
    try {
      const cachedId = await getCachedUserId()
      if (!cachedId) return
      await (supabase.from('notifications') as any).update({ is_read: true }).eq('user_id', cachedId).eq('is_read', false)
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    } catch {} // Intentional: non-critical — mark-all-read is best-effort
  }, [supabase])

  // Delete notification
  const deleteNotification = useCallback(async (notifId: string) => {
    try {
      await (supabase.from('notifications') as any).delete().eq('id', notifId)
      setNotifications(prev => prev.filter(n => n.id !== notifId))
    } catch {} // Intentional: non-critical notification delete
  }, [supabase])

  const handleLongPress = useCallback((item: PrioritizedNotification) => {
    Alert.alert(
      t('notifications.deleteNotification'),
      '',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteNotification(item.id),
        },
      ]
    )
  }, [t, deleteNotification])

  // Toggle group expansion
  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }, [])

  const handleTap = useCallback(async (item: PrioritizedNotification) => {
    // If this is a grouped notification with multiple items, toggle expand on first tap
    if (item.isGrouped && item.groupCount && item.groupCount > 1) {
      const groupKey = `${item.type}:${item.link_id ?? item.id}`
      if (!expandedGroups.has(groupKey)) {
        toggleGroup(groupKey)
        return
      }
    }

    try {
      // Mark as read
      if (!item.is_read) {
        await (supabase.from('notifications') as any).update({ is_read: true }).eq('id', item.id)
        setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n))
      }
      // Navigate based on link_type — validate UUID before navigating to prevent crashes
      const linkId = item.link_id
      if (!linkId) return
      if (item.link_type === 'post') router.push(`/post/${linkId}`)
      else if (item.link_type === 'conversation') router.push(`/messages/${linkId}`)
      else if (item.link_type === 'profile') router.push(`/profile/${linkId}`)
      else if (item.link_type === 'booking') router.push(`/booking/${linkId}`)
      else if (item.link_type === 'event') router.push(`/event/${linkId}` as any)
      else if (item.type === 'search_match' && (item as any).data?.post_id) {
        router.push(`/post/${(item as any).data.post_id}`)
      } else if (item.type === 'offer_received' && item.link_id) {
        router.push(`/post/${item.link_id}`)
      }
    } catch (err) {
      if (__DEV__) console.error('[notifications] handleTap error:', err)
    }
  }, [supabase, router, expandedGroups, toggleGroup])

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return notifications
    return notifications.filter(n => getFilterForType(n.type) === activeFilter)
  }, [notifications, activeFilter])

  const sections = useMemo(() => groupByTime(filtered, t), [filtered, t])
  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications])

  // Per-filter unread counts — used for accessibility labels
  const unreadByFilter = useMemo(() => {
    const counts: Record<string, number> = { all: unreadCount }
    for (const n of notifications) {
      if (n.is_read) continue
      const f = getFilterForType(n.type)
      counts[f] = (counts[f] ?? 0) + 1
    }
    return counts
  }, [notifications, unreadCount])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header — Bar pattern: centered title, left circle back, right "Merkitse" text */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {/* Left: circle back button */}
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[styles.headerBackBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={18} color={colors.foreground} />
        </PressableOpacity>

        {/* Center: title */}
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {t('nav.notifications')}
        </Text>

        {/* Right: "Merkitse" text */}
        {unreadCount > 0 ? (
          <PressableOpacity
            onPress={markAllRead}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.markAllRead')}
            style={styles.headerRightBtn}
          >
            <Text style={[styles.headerRightText, { color: colors.foreground }]}>
              {t('notifications.markAllRead')}
            </Text>
          </PressableOpacity>
        ) : (
          <View style={styles.headerRightBtn} />
        )}
      </View>

      {/* Filter chips row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScrollView}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const isActive = activeFilter === f.key
          const count = unreadByFilter[f.key] ?? 0
          return (
            <PressableOpacity
              key={f.key}
              onPress={() => setActiveFilter(f.key)}
              accessibilityRole="button"
              accessibilityLabel={count > 0 ? `${t(f.label)} (${count})` : t(f.label)}
              accessibilityState={{ selected: isActive }}
              style={[
                styles.filterChip,
                isActive
                  ? { backgroundColor: colors.foreground, borderWidth: 0 }
                  : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              <Text style={[
                styles.filterText,
                isActive
                  ? { color: colors.background, fontFamily: fonts.bodySemi }
                  : { color: colors.foreground, fontFamily: fonts.bodyMedium },
              ]}>
                {t(f.label)}
              </Text>
            </PressableOpacity>
          )
        })}
      </ScrollView>

      {fetchError && !loading && (
        <PressableOpacity
          onPress={() => { setRefreshing(true); fetchNotifications() }}
          style={[styles.errorBanner, { backgroundColor: `${colors.destructive}10` }]}
          accessibilityRole="button"
          accessibilityLabel={`${t('common.loadError')}. ${t('errors.tryAgain') ?? 'Retry'}`}
        >
          <RefreshCw size={14} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>{t('common.loadError')}</Text>
        </PressableOpacity>
      )}

      {/* Notification list */}
      {loading ? (
        <View style={styles.skeletonContainer}>
          {[0, 1, 2, 3, 4, 5].map(i => <NotificationSkeleton key={i} />)}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          stickySectionHeadersEnabled={false}
          removeClippedSubviews
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchNotifications() }}
              tintColor={colors.foreground}
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item, index, section }) => {
            const isGroupedMulti = item.isGrouped && item.groupCount && item.groupCount > 1
            const groupKey = `${item.type}:${item.link_id ?? item.id}`
            const isExpanded = expandedGroups.has(groupKey)
            const initial = getInitial(item)
            const isLast = index === section.data.length - 1
            const isFirst = index === 0
            const isSystem = !item.from_user
            const showActions = hasActionButtons(item.type) && !item.is_read

            return (
              <View>
                {/* Grouped container card: first item gets top radius, last gets bottom */}
                <View style={[
                  styles.rowCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    marginHorizontal: 16,
                  },
                  isFirst && { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1 },
                  isLast && { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderBottomWidth: 1 },
                  !isFirst && { borderTopWidth: 0 },
                  !isLast && { borderBottomWidth: 0 },
                  { borderLeftWidth: 1, borderRightWidth: 1 },
                ]}>
                  <PressableOpacity
                    onPress={() => handleTap(item)}
                    onLongPress={() => handleLongPress(item)}
                    delayLongPress={500}
                    accessibilityRole="button"
                    accessibilityLabel={`${getGroupedTitle(item, t)}${item.body ? `, ${item.body}` : ''}`}
                    accessibilityState={{ selected: !item.is_read }}
                    accessibilityHint={t('notifications.deleteNotification')}
                    style={[
                      styles.notifRow,
                      !item.is_read && { backgroundColor: warmTint },
                      isFirst && { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
                      isLast && { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
                    ]}
                  >
                    {/* Avatar — 40px */}
                    {isSystem ? (
                      <View style={[styles.avatarSystem, { backgroundColor: colors.foreground }]}>
                        <Bell size={18} color={colors.background} />
                      </View>
                    ) : item.from_user?.avatar_url ? (
                      <Image
                        source={{ uri: item.from_user.avatar_url }}
                        style={styles.avatar}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={item.from_user.avatar_url}
                      />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.muted }]}>
                        <Text style={[styles.avatarInitial, { color: colors.mutedForeground }]}>{initial}</Text>
                      </View>
                    )}

                    {/* Text content */}
                    <View style={styles.notifContent}>
                      <Text
                        style={[
                          styles.notifTitle,
                          { color: colors.foreground },
                          !item.is_read && styles.notifTitleBold,
                        ]}
                        numberOfLines={2}
                      >
                        {getGroupedTitle(item, t)}
                      </Text>

                      {item.body && (
                        <Text
                          style={[styles.notifBody, { color: colors.foreground }]}
                          numberOfLines={2}
                        >
                          {item.body}
                        </Text>
                      )}

                      <Text style={[styles.notifTime, { color: colors.mutedForeground }]}>
                        {formatTimeAgo(item.created_at, t, locale)}
                      </Text>

                      {/* Action buttons for actionable notifications */}
                      {showActions && (
                        <View style={styles.actionRow}>
                          <PressableOpacity
                            onPress={() => handleTap(item)}
                            style={[styles.actionPrimary, { backgroundColor: colors.foreground }]}
                            accessibilityRole="button"
                            accessibilityLabel={item.type === 'rental_request' ? t('common.accept') : t('common.confirm')}
                          >
                            <Text style={[styles.actionPrimaryText, { color: colors.background }]}>
                              {item.type === 'rental_request' ? t('common.accept') : t('common.confirm')}
                            </Text>
                          </PressableOpacity>
                          <PressableOpacity
                            onPress={() => handleLongPress(item)}
                            style={[styles.actionSecondary, { backgroundColor: colors.card, borderColor: colors.border }]}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.decline')}
                          >
                            <Text style={[styles.actionSecondaryText, { color: colors.foreground }]}>
                              {t('common.decline')}
                            </Text>
                          </PressableOpacity>
                        </View>
                      )}
                    </View>

                    {/* Unread dot */}
                    {!item.is_read && (
                      <View style={[styles.unreadDot, { backgroundColor: colors.foreground }]} />
                    )}
                  </PressableOpacity>

                  {/* Divider between rows (not after last) */}
                  {!isLast && (
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  )}
                </View>

                {/* Expanded group — show individual notification names */}
                {isGroupedMulti && isExpanded && item.groupNames && item.groupNames.length > 0 && (
                  <View style={[styles.expandedGroup, { backgroundColor: isDark ? `${colors.card}80` : `${colors.muted}80` }]}>
                    {item.groupNames.map((name, idx) => (
                      <View key={`${item.id}-${idx}`} style={styles.expandedItem}>
                        <View style={[styles.expandedDot, { backgroundColor: colors.mutedForeground }]} />
                        <Text style={[styles.expandedName, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
                        <Text style={[styles.expandedAction, { color: colors.mutedForeground }]}>
                          {item.type === 'post_like' ? t('notifications.likedYourPost') : item.title}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )
          }}
          ListEmptyComponent={
            !loading ? (
              !isLoggedIn ? (
                <EmptyState
                  icon={<LogIn size={36} color={colors.foreground} />}
                  title={t('notifications.loginRequired')}
                  description={t('notifications.loginHint')}
                  actionLabel={t('auth.login')}
                  onAction={() => router.push('/(auth)/login')}
                />
              ) : (
                <EmptyState
                  icon={<Bell size={36} color={colors.foreground} />}
                  title={t('notifications.empty')}
                  description={t('notifications.emptyHint')}
                />
              )
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

export default function NotificationsScreen() {
  return (
    <ScreenErrorBoundary screenName="Notifications">
      <NotificationsScreenInner />
    </ScreenErrorBoundary>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // --- Header: Bar pattern (back circle 36px + centered title + "Merkitse" action) ---
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 14.5,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: -0.15,
  },
  headerRightBtn: {
    minWidth: 36,
    alignItems: 'flex-end',
  },
  headerRightText: {
    fontSize: 11.5,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    lineHeight: 16,
  },

  // --- Filter chips (pill shape, borderRadius 999) ---
  filterScrollView: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    minHeight: 36,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },

  // --- Section headers (uppercase section label, 10.5px muted 600, 0.9 tracking) ---
  sectionHeader: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 18,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    fontFamily: fonts.bodySemi,
    lineHeight: 14,
  },

  // --- Row card container ---
  rowCard: {
    overflow: 'hidden',
  },

  // --- Notification row ---
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  // --- Avatar ---
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSystem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontFamily: fonts.bodySemi,
  },

  // --- Content (title bold + body 13.5px + time 11px muted) ---
  notifContent: {
    flex: 1,
    gap: 2,
  },
  notifTitle: {
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: fonts.body,
  },
  notifTitleBold: {
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
  },
  notifBody: {
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: fonts.body,
  },
  notifTime: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.body,
    marginTop: 3,
  },

  // --- Unread dot ---
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
    marginTop: 6,
  },

  // --- Action buttons (CTA: ink pill primary + surface pill border secondary) ---
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionPrimary: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  actionPrimaryText: {
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  actionSecondary: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
  },
  actionSecondaryText: {
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // --- Divider (1px, indent past avatar) ---
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60, // indent past avatar
  },

  // --- Error banner ---
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    padding: 12,
    borderRadius: 16,
  },
  errorText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    flex: 1,
  },

  // --- Skeleton ---
  skeletonContainer: {
    paddingTop: 8,
  },

  // --- List ---
  listContent: {
    paddingBottom: 100,
  },

  // --- Expanded group ---
  expandedGroup: {
    marginLeft: 60,
    marginRight: 16,
    borderRadius: 16,
    paddingVertical: 4,
    marginBottom: 4,
  },
  expandedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  expandedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  expandedName: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    flex: 1,
  },
  expandedAction: {
    fontSize: 12,
    fontFamily: fonts.body,
    flex: 1,
  },
})
