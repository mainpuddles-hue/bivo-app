declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, SectionList, RefreshControl, StyleSheet, Animated, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { getBlockedUserIds } from '@/lib/blockedUsers'
import { Bell, ArrowLeft, LogIn, RefreshCw } from 'lucide-react-native'
import { Avatar } from '@/components/Avatar'
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

// Segmented control tabs: "Kaikki" (all) / "Lukemattomat" (unread)
type SegmentKey = 'all' | 'unread'

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

/** Build the action verb + context display for v3 row layout */
function getNotificationActionText(
  item: PrioritizedNotification,
  t: (k: string, p?: Record<string, string | number>) => string
): { name: string; action: string; context: string } {
  const name = item.from_user?.name ?? ''
  const resolvedTitle = getLocalizedTypeTitle(item.type, t) ?? item.title ?? ''

  if (item.isGrouped && item.groupCount && item.groupCount > 1) {
    const firstName = item.groupNames?.[0] ?? name
    const othersCount = item.groupCount - 1
    if (item.type === 'post_like') {
      return {
        name: firstName,
        action: t('notifications.andOthers', { count: othersCount }),
        context: resolvedTitle,
      }
    }
    return {
      name: firstName,
      action: `${t('notifications.andOthers', { count: othersCount })}`,
      context: resolvedTitle,
    }
  }

  return {
    name,
    action: resolvedTitle,
    context: item.body ?? '',
  }
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
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
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
  const [activeSegment, setActiveSegment] = useState<SegmentKey>('all')
  // Expanded groups state — tracks which grouped notifications are expanded
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [fetchError, setFetchError] = useState(false)
  const mountedRef = useRef(true)

  const fetchNotifications = useCallback(async () => {
    setFetchError(false)
    try {
      const cachedId = await getCachedUserId()
      if (!mountedRef.current) return
      if (!cachedId) { setIsLoggedIn(false); setUserId(null); setLoading(false); setRefreshing(false); return }
      setIsLoggedIn(true)
      setUserId(cachedId)
      const { data } = await supabase
        .from('notifications')
        .select('*, from_user:profiles!notifications_from_user_id_fkey(id, name, avatar_url)')
        .eq('user_id', cachedId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!mountedRef.current) return
      let raw = (data ?? []) as unknown as Notification[]
      // Filter out notifications from blocked users
      if (cachedId) {
        const blocked = await getBlockedUserIds(cachedId)
        if (!mountedRef.current) return
        if (blocked.size > 0) raw = raw.filter(n => !n.from_user_id || !blocked.has(n.from_user_id))
      }
      const prioritized = prioritizeNotifications(raw)
      if (!mountedRef.current) return
      setNotifications(prioritized)
    } catch {
      if (!mountedRef.current) return
      setNotifications([])
      setFetchError(true)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [supabase])

  useFocusEffect(useCallback(() => {
    mountedRef.current = true
    fetchNotifications()
    return () => { mountedRef.current = false }
  }, [fetchNotifications]))

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

  // Mark all as read — update server first, then UI
  const markAllRead = useCallback(async () => {
    try {
      const cachedId = await getCachedUserId()
      if (!cachedId) return
      const { error } = await (supabase.from('notifications') as any).update({ is_read: true }).eq('user_id', cachedId).eq('is_read', false)
      if (!error) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      }
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

  // v3: filter by segment — "all" shows everything, "unread" shows only unread
  const filtered = useMemo(() => {
    if (activeSegment === 'unread') return notifications.filter(n => !n.is_read)
    return notifications
  }, [notifications, activeSegment])

  const sections = useMemo(() => groupByTime(filtered, t), [filtered, t])
  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* v3 Header — large title left + "Merkitse luetuksi" text-button right */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerLeft}>
          <PressableOpacity
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={[styles.headerBackBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <ArrowLeft size={18} color={colors.foreground} />
          </PressableOpacity>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>
            {t('nav.notifications')}
          </Text>
        </View>

        {unreadCount > 0 ? (
          <PressableOpacity
            onPress={markAllRead}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.markAllRead')}
            style={styles.markReadBtn}
          >
            <Text style={[styles.markReadText, { color: colors.foreground }]}>
              {t('notifications.markAllRead')}
            </Text>
          </PressableOpacity>
        ) : (
          <View style={styles.markReadBtn} />
        )}
      </View>

      {/* v3 Segmented control — "Kaikki / Lukemattomat" */}
      <View style={[styles.segmented, { backgroundColor: colors.surfaceTinted }]}>
        {([
          { key: 'all' as SegmentKey, label: t('common.all') },
          { key: 'unread' as SegmentKey, label: unreadCount > 0 ? `${t('notifications.unread')} \u00B7 ${unreadCount}` : t('notifications.unread') },
        ]).map((seg) => {
          const isActive = activeSegment === seg.key
          return (
            <PressableOpacity
              key={seg.key}
              onPress={() => setActiveSegment(seg.key)}
              accessibilityRole="button"
              accessibilityLabel={seg.label}
              accessibilityState={{ selected: isActive }}
              style={[
                styles.segItem,
                isActive && [styles.segItemActive, { backgroundColor: colors.card }],
              ]}
            >
              <Text style={[
                styles.segText,
                { color: isActive ? colors.foreground : colors.mutedForeground },
                isActive && { fontFamily: fonts.bodySemi, fontWeight: '600' },
              ]}>
                {seg.label}
              </Text>
            </PressableOpacity>
          )
        })}
      </View>

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
          renderItem={({ item }) => {
            const isGroupedMulti = item.isGrouped && item.groupCount && item.groupCount > 1
            const groupKey = `${item.type}:${item.link_id ?? item.id}`
            const isExpanded = expandedGroups.has(groupKey)
            const isSystem = !item.from_user
            const showActions = hasActionButtons(item.type) && !item.is_read
            const actionText = getNotificationActionText(item, t)

            return (
              <View>
                <PressableOpacity
                  onPress={() => handleTap(item)}
                  onLongPress={() => handleLongPress(item)}
                  delayLongPress={500}
                  accessibilityRole="button"
                  accessibilityLabel={`${getGroupedTitle(item, t)}${item.body ? `, ${item.body}` : ''}`}
                  accessibilityState={{ selected: !item.is_read }}
                  accessibilityHint={t('notifications.deleteNotification')}
                  style={styles.notifRow}
                >
                  {/* v3: Unread dot — 6px ink dot on LEFT */}
                  {!item.is_read ? (
                    <View style={[styles.unreadDot, { backgroundColor: colors.foreground }]} />
                  ) : (
                    <View style={styles.unreadDotSpacer} />
                  )}

                  {/* Avatar — 40px */}
                  {isSystem ? (
                    <View style={[styles.avatarSystem, { backgroundColor: colors.foreground }]}>
                      <Bell size={18} color={colors.background} />
                    </View>
                  ) : (
                    <Avatar
                      url={item.from_user?.avatar_url}
                      name={item.from_user?.name}
                      size={40}
                    />
                  )}

                  {/* v3: 2-line text — {name} {action} {context} + time muted */}
                  <View style={styles.notifContent}>
                    <Text style={[styles.notifAction, { color: colors.foreground }]} numberOfLines={2}>
                      {actionText.name ? (
                        <Text style={styles.notifName}>{actionText.name} </Text>
                      ) : null}
                      {actionText.action}
                      {actionText.context ? (
                        <Text style={{ color: colors.mutedForeground }}> {'\u00B7'} {actionText.context}</Text>
                      ) : null}
                    </Text>

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
                </PressableOpacity>

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

  // --- v3 Header: large page title left + mark-read text-button right ---
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    fontFamily: fonts.display,
    lineHeight: 34,
  },
  markReadBtn: {
    minWidth: 36,
    alignItems: 'flex-end',
  },
  markReadText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    lineHeight: 16,
  },

  // --- v3 Segmented control (pill shape, Kaikki / Lukemattomat) ---
  segmented: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
    padding: 4,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
  },
  segItem: {
    flex: 1,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segItemActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  segText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 18,
  },

  // --- v3 Section headers (inline time group labels) ---
  sectionHeader: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontFamily: fonts.bodySemi,
    lineHeight: 14,
  },

  // --- v3 Notification row: unread-dot + avatar + text ---
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingRight: 20,
    paddingVertical: 12,
    paddingLeft: 12,
  },

  // --- v3 Unread dot: 6px ink dot on LEFT ---
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
    marginTop: 17, // vertically center with avatar (40px avatar -> center at 20px -> dot top = 20 - 3)
  },
  unreadDotSpacer: {
    width: 6,
    flexShrink: 0,
  },

  // --- Avatar ---
  avatarSystem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // --- v3 Content: 2-line action text + time muted ---
  notifContent: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  notifAction: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
  },
  notifName: {
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
  },
  notifTime: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
    marginTop: 4,
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
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // --- Error banner ---
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    padding: 12,
    borderRadius: 20,
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
    marginLeft: 38,
    marginRight: 20,
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
