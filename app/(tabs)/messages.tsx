declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, FlatList, RefreshControl, Pressable, TextInput, StyleSheet, ScrollView, Animated, Alert, ActionSheetIOS, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { hapticMedium, withHapticRefresh } from '@/lib/haptics'
import { Swipeable } from 'react-native-gesture-handler'
import { PressableOpacity } from '@/components/ui'
import { useRouter, useFocusEffect } from 'expo-router'
import { Search, X, Archive, CheckCheck, ImageIcon, Pin, MessageCircle, LogIn, Users, PenSquare, MoreHorizontal, RefreshCw } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { MessageListSkeleton } from '@/components/SkeletonLoaders'
import { Avatar } from '@/components/Avatar'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo } from '@/lib/format'
import { fonts } from '@/lib/fonts'
import { isValidUUID } from '@/lib/validation'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { useToast } from '@/components/Toast'
import { getTableCategoryIcon, getTableCategoryColor } from '@/lib/eventHelpers'
import type { Conversation } from '@/lib/types'

interface EventChatItem {
  conversation_id: string
  event_id: string
  event_title: string
  event_category: string
  event_date: string
  member_count: number
  unread_count: number
  last_message_content: string | null
  last_message_at: string | null
}

const PINNED_KEY = 'pinned_conversations'

export default function MessagesScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()
  const supabase = useSupabase()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [eventChats, setEventChats] = useState<EventChatItem[]>([])
  const [fetchError, setFetchError] = useState(false)
  const mountedRef = useRef(true)
  useEffect(() => { return () => { mountedRef.current = false } }, [])
  const conversationsRef = useRef(conversations)
  conversationsRef.current = conversations
  // Fast client-side filter for realtime events — avoids refetching when
  // a message arrives for a conversation this user isn't part of
  const myConvIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    myConvIdsRef.current = new Set(conversations.map(c => c.id))
  }, [conversations])

  // Load pinned conversations from AsyncStorage
  useEffect(() => {
    let cancelled = false
    async function loadPinned() {
      try {
        const stored = await AsyncStorage.getItem(PINNED_KEY)
        if (cancelled) return
        if (stored) setPinnedIds(JSON.parse(stored))
      } catch {} // Intentional: corrupted cache — use default empty
    }
    loadPinned()
    return () => { cancelled = true }
  }, [])

  const handleTogglePin = useCallback(async (convId: string) => {
    const newIds = pinnedIds.includes(convId)
      ? pinnedIds.filter(id => id !== convId)
      : [...pinnedIds, convId]
    setPinnedIds(newIds)
    try {
      await AsyncStorage.setItem(PINNED_KEY, JSON.stringify(newIds))
    } catch (err) {
      if (__DEV__) console.warn('[messages] failed to persist pinned ids:', err)
    }
  }, [pinnedIds])

  const fetchConversations = useCallback(async () => {
    if (!mountedRef.current) return
    setFetchError(false)
    try {
    const { getCachedUserId } = await import('@/lib/authCache')
    const uid = await getCachedUserId()
    if (!mountedRef.current) return
    if (!uid) { setLoading(false); setRefreshing(false); return }
    setUserId(uid)
    if (!isValidUUID(uid)) { setLoading(false); setRefreshing(false); return }

    // Single RPC call replaces N+1 queries (1 conversations + 2N messages queries)
    const { data, error: rpcError } = await (supabase.rpc as any)('get_conversations_with_details', { p_user_id: uid })

    if (!mountedRef.current) return

    if (rpcError) {
      // Fallback: if RPC doesn't exist yet, use legacy query
      if (__DEV__) console.warn('[messages] RPC fallback:', rpcError.message)
      try {
        const { data: fallbackData } = await supabase
          .from('conversations')
          .select('*, user1:profiles!conversations_user1_id_fkey(id, name, avatar_url, last_active_date), user2:profiles!conversations_user2_id_fkey(id, name, avatar_url, last_active_date)')
          .or(`user1_id.eq.${uid},user2_id.eq.${uid}`)
          .order('updated_at', { ascending: false })
          .limit(50)

        if (!mountedRef.current) return

        const fallbackConvs = (fallbackData ?? []).map((row: any) => {
          const isUser1 = row.user1_id === uid
          const otherProfile = isUser1 ? row.user2 : row.user1
          return {
            id: row.id,
            user1_id: row.user1_id,
            user2_id: row.user2_id,
            post_id: row.post_id,
            user1_archived: row.user1_archived ?? false,
            user2_archived: row.user2_archived ?? false,
            created_at: row.created_at,
            updated_at: row.updated_at,
            other_user: otherProfile ? {
              id: otherProfile.id,
              name: otherProfile.name,
              avatar_url: otherProfile.avatar_url,
              last_active_date: otherProfile.last_active_date,
            } : undefined,
            is_archived: isUser1 ? (row.user1_archived ?? false) : (row.user2_archived ?? false),
            last_message: undefined,
            unread_count: 0,
          }
        }) as unknown as Conversation[]

        // Filter out conversations with blocked users (fallback path)
        let filteredFallback = fallbackConvs
        try {
          const { data: blockedData } = await supabase
            .from('blocked_users')
            .select('blocked_id')
            .eq('blocker_id', uid)
          const blockedIds = new Set((blockedData ?? []).map((b: any) => b.blocked_id))
          if (blockedIds.size > 0) {
            filteredFallback = fallbackConvs.filter(c => {
              const otherId = (c as any).user1_id === uid ? (c as any).user2_id : (c as any).user1_id
              return !blockedIds.has(otherId)
            })
          }
        } catch {
          // blocked_users table may not exist yet — continue without filtering
        }

        setConversations(filteredFallback)
      } catch {
        // Both RPC and fallback failed — show empty state
      }
      if (mountedRef.current) { setLoading(false); setRefreshing(false) }
      return
    }

    const convs = (data ?? []).map((row: any) => ({
      id: row.id,
      user1_id: row.user1_id,
      user2_id: row.user2_id,
      post_id: row.post_id,
      user1_archived: row.user1_archived,
      user2_archived: row.user2_archived,
      created_at: row.created_at,
      updated_at: row.updated_at,
      other_user: {
        id: row.other_user_id,
        name: row.other_user_name,
        avatar_url: row.other_user_avatar,
        last_active_date: row.other_user_last_active,
      },
      is_archived: row.user1_id === uid ? row.user1_archived : row.user2_archived,
      last_message: row.last_message_id ? {
        id: row.last_message_id,
        content: row.last_message_content,
        sender_id: row.last_message_sender_id,
        image_url: row.last_message_image_url,
        created_at: row.last_message_created_at,
        is_read: row.last_message_is_read,
      } : null,
      unread_count: Number(row.unread_count ?? 0),
    })) as Conversation[]

    // Filter out conversations with blocked users
    let filteredConvs = convs
    try {
      const { data: blockedData } = await supabase
        .from('blocked_users')
        .select('blocked_id')
        .eq('blocker_id', uid)
      const blockedIds = new Set((blockedData ?? []).map((b: any) => b.blocked_id))
      if (blockedIds.size > 0) {
        filteredConvs = convs.filter(c => {
          const otherId = (c as any).user1_id === uid ? (c as any).user2_id : (c as any).user1_id
          return !blockedIds.has(otherId)
        })
      }
    } catch {
      // blocked_users table may not exist yet — continue without filtering
    }

    setConversations(filteredConvs)
    setLoading(false)
    setRefreshing(false)
    } catch {
      if (mountedRef.current) { setFetchError(true); setLoading(false); setRefreshing(false) }
    }
  }, [supabase])

  // Fetch conversations on mount and re-fetch when screen gains focus (e.g. after reading messages)
  useFocusEffect(useCallback(() => { fetchConversations() }, [fetchConversations]))

  // Realtime for new messages. Supabase realtime only supports a single
  // eq/neq filter on postgres_changes, so we filter by sender_id and then
  // reject messages belonging to conversations this user isn't part of
  // client-side (via myConvIdsRef). This avoids a global fetchConversations
  // storm whenever any user in the system sends a message.
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`messages-list-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `sender_id=neq.${userId}`,
      }, (payload) => {
        const msg = payload.new as any
        if (!msg?.conversation_id) return
        if (!myConvIdsRef.current.has(msg.conversation_id)) return
        fetchConversations()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, supabase, fetchConversations])

  // Fetch event group chats the user is a member of
  const fetchEventChats = useCallback(async () => {
    if (!userId || !mountedRef.current) return
    try {
      // Get conversation IDs where user is a member (group chats)
      const { data: memberships } = await (supabase.from('conversation_members') as any)
        .select('conversation_id')
        .eq('user_id', userId)

      if (!memberships || memberships.length === 0 || !mountedRef.current) return

      const convIds = (memberships as any[]).map((m: any) => m.conversation_id)

      // Get events linked to those conversations
      const { data: events } = await (supabase.from('community_events') as any)
        .select('id, title, category, event_date, conversation_id')
        .in('conversation_id', convIds)
        .order('event_date', { ascending: false })

      if (!events || !mountedRef.current) return

      // Batch: get unread counts, last messages, and member counts in parallel per event
      const eventsWithConvId = (events as any[]).filter((ev: any) => ev.conversation_id)
      const eventConvIds = eventsWithConvId.map((ev: any) => ev.conversation_id)

      // Batch queries in parallel instead of sequential N+1.
      // lastMsg: fetch in parallel per-conversation because a single
      // `.in(...).limit(N*2)` can miss quiet conversations when one is
      // very active (all slots get consumed by that single conversation).
      const lastMsgPromises = eventConvIds.map((cid: string) =>
        (supabase.from('messages') as any)
          .select('conversation_id, content, created_at')
          .eq('conversation_id', cid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      )

      const [unreadRes, lastMsgResults, memberRes] = await Promise.all([
        // All unread messages across event conversations.
        // `head: true` avoids transporting row data — we count per-conv
        // via the returned-row hack below.
        (supabase.from('messages') as any)
          .select('conversation_id')
          .in('conversation_id', eventConvIds)
          .neq('sender_id', userId)
          .eq('is_read', false),
        Promise.all(lastMsgPromises),
        // All members across event conversations
        (supabase.from('conversation_members') as any)
          .select('conversation_id')
          .in('conversation_id', eventConvIds),
      ])

      // Build lookup maps
      const unreadByConv = new Map<string, number>()
      for (const row of (unreadRes.data ?? []) as any[]) {
        unreadByConv.set(row.conversation_id, (unreadByConv.get(row.conversation_id) ?? 0) + 1)
      }

      const lastMsgByConv = new Map<string, { content: string | null; created_at: string }>()
      for (const res of lastMsgResults as any[]) {
        const row = res?.data
        if (row) lastMsgByConv.set(row.conversation_id, { content: row.content, created_at: row.created_at })
      }

      const membersByConv = new Map<string, number>()
      for (const row of (memberRes.data ?? []) as any[]) {
        membersByConv.set(row.conversation_id, (membersByConv.get(row.conversation_id) ?? 0) + 1)
      }

      const items: EventChatItem[] = eventsWithConvId.map((ev: any) => {
        const lastMsg = lastMsgByConv.get(ev.conversation_id)
        return {
          conversation_id: ev.conversation_id,
          event_id: ev.id,
          event_title: ev.title,
          event_category: ev.category ?? '',
          event_date: ev.event_date,
          member_count: membersByConv.get(ev.conversation_id) ?? 0,
          unread_count: unreadByConv.get(ev.conversation_id) ?? 0,
          last_message_content: lastMsg?.content ?? null,
          last_message_at: lastMsg?.created_at ?? null,
        }
      })

      if (mountedRef.current) setEventChats(items)
    } catch (err) {
      if (__DEV__) console.warn('[messages] fetchEventChats error:', err)
    }
  }, [userId, supabase])

  // Fetch event chats when userId changes or screen gains focus
  useFocusEffect(useCallback(() => {
    if (userId) fetchEventChats()
  }, [userId, fetchEventChats]))

  const handleArchive = useCallback(async (convId: string) => {
    const conv = conversations.find(c => c.id === convId)
    if (!conv || !userId) return
    const field = conv.user1_id === userId ? 'user1_archived' : 'user2_archived'
    const isCurrentlyArchived = conv.user1_id === userId ? conv.user1_archived : conv.user2_archived
    const newVal = !isCurrentlyArchived
    const { error } = await (supabase.from('conversations') as any).update({ [field]: newVal }).eq('id', convId)
    if (error) {
      toast.show({ message: t('messages.archiveError') ?? t('common.error'), type: 'error' })
      return
    }
    await fetchConversations()
  }, [conversations, userId, supabase, fetchConversations, t, toast])

  // Stable onRefresh — withHapticRefresh returns a new function on every
  // call, which would cause RefreshControl to rebind on every render.
  const onRefreshHandler = useMemo(
    () => withHapticRefresh(() => { setRefreshing(true); fetchConversations(); fetchEventChats() }),
    [fetchConversations, fetchEventChats],
  )

  const filtered = useMemo(() => {
    let list = conversations.filter(c => showArchived ? c.is_archived : !c.is_archived)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(c => c.other_user?.name?.toLowerCase().includes(q))
    }
    // Sort: pinned first, then by updated_at
    list.sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id)
      const bPinned = pinnedIds.includes(b.id)
      if (aPinned && !bPinned) return -1
      if (!aPinned && bPinned) return 1
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
    return list
  }, [conversations, showArchived, searchQuery, pinnedIds])

  const isOnline = useCallback((lastActive: string | null | undefined) => {
    if (!lastActive) return false
    return Date.now() - new Date(lastActive).getTime() < 5 * 60 * 1000
  }, [])

  const totalUnread = useMemo(() => {
    return conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0)
  }, [conversations])

  // Conversation row: padding(14*2) + avatar(42) + border(1*2) + marginBottom(8) = 80
  const CONV_ITEM_HEIGHT = 80
  const getItemLayout = useCallback((_: unknown, index: number) => ({
    length: CONV_ITEM_HEIGHT,
    offset: CONV_ITEM_HEIGHT * index,
    index,
  }), [])

  return (
    <ScreenErrorBoundary screenName="Messages">
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header: Helsinki Monochrome (eyebrow + title + action circles) ── */}
      <View style={[styles.header, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.locationEyebrow, { color: colors.mutedForeground }]}>
            {showArchived
              ? (t('messages.archive') ?? 'Arkisto').toUpperCase()
              : totalUnread > 0
                ? `${totalUnread} ${(t('messages.unread') ?? 'lukematon').toUpperCase()}`
                : (t('messages.directMessages') ?? 'Viestit').toUpperCase()}
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {t('messages.title')}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <PressableOpacity
            onPress={() => setSearchExpanded(!searchExpanded)}
            style={[styles.iconCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityLabel={t('common.search')}
            accessibilityRole="button"
          >
            <Search size={16} color={colors.mutedForeground} strokeWidth={2} />
          </PressableOpacity>
          <PressableOpacity
            onPress={() => setShowArchived(!showArchived)}
            style={[
              styles.iconCircle,
              showArchived
                ? { backgroundColor: colors.foreground, borderColor: colors.foreground }
                : { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            accessibilityRole="button"
            accessibilityLabel={showArchived ? t('messages.showActive') ?? 'Show active conversations' : t('messages.archive') ?? 'Show archived conversations'}
            accessibilityState={{ selected: showArchived }}
          >
            <Archive size={16} color={showArchived ? colors.background : colors.mutedForeground} strokeWidth={2} />
          </PressableOpacity>
        </View>
      </View>

      {/* ── Expandable search bar ── */}
      {searchExpanded && (
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Search size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('common.search')}
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            accessibilityLabel={t('messages.searchConversations') ?? 'Search conversations'}
            accessibilityRole="search"
          />
          <PressableOpacity
            onPress={() => { setSearchQuery(''); setSearchExpanded(false) }}
            hitSlop={8}
            style={styles.searchCloseBtn}
            accessibilityLabel={t('common.clear') ?? 'Clear search'}
            accessibilityRole="button"
          >
            <X size={16} color={colors.mutedForeground} />
          </PressableOpacity>
        </View>
      )}

      {/* ── Fetch error banner ── */}
      {fetchError && !loading && (
        <PressableOpacity
          onPress={() => { setRefreshing(true); fetchConversations() }}
          style={[styles.errorBanner, { backgroundColor: `${colors.destructive}10`, borderColor: `${colors.destructive}30` }]}
          accessibilityRole="button"
        >
          <RefreshCw size={14} color={colors.destructive} />
          <Text style={[styles.errorBannerText, { color: colors.destructive }]}>{t('common.loadError')}</Text>
        </PressableOpacity>
      )}

      {/* ── Conversation list ── */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        getItemLayout={getItemLayout}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefreshHandler} tintColor={colors.foreground} />}
        ListHeaderComponent={eventChats.length > 0 && !showArchived ? (
          <View style={styles.eventChatsSection}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {t('messages.eventChats')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventChatsScroll}>
              {eventChats.map((ec) => {
                const EventChatIcon = getTableCategoryIcon(ec.event_category)
                const ecColor = getTableCategoryColor(ec.event_category)
                return (
                  <Pressable
                    key={ec.conversation_id}
                    onPress={() => router.push(`/event-chat/${ec.conversation_id}` as any)}
                    style={({ pressed }) => [
                      styles.eventChatCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                      pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={ec.event_title}
                  >
                    <View style={styles.eventChatTop}>
                      <EventChatIcon size={20} color={ecColor} />
                      {ec.unread_count > 0 && (
                        <View style={[styles.eventChatBadge, { backgroundColor: colors.foreground }]}>
                          <Text style={[styles.eventChatBadgeText, { color: colors.background }]}>
                            {ec.unread_count > 9 ? '9+' : ec.unread_count}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.eventChatTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {ec.event_title}
                    </Text>
                    <View style={styles.eventChatMeta}>
                      <Users size={10} color={colors.mutedForeground} />
                      <Text style={[styles.eventChatMetaText, { color: colors.mutedForeground }]}>
                        {ec.member_count}
                      </Text>
                    </View>
                    {ec.last_message_content && (
                      <Text style={[styles.eventChatPreview, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {ec.last_message_content}
                      </Text>
                    )}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        ) : null}
        renderItem={({ item }) => {
          const other = item.other_user as any
          const unread = item.unread_count ?? 0
          const lastMsg = item.last_message
          const isMySent = lastMsg?.sender_id === userId
          const online = isOnline(other?.last_active_date)
          const isImageMsg = lastMsg?.image_url && !lastMsg?.content
          const isPinned = pinnedIds.includes(item.id)

          // Apple Mail-style swipe actions: trailing -> archive, action button reveals on drag
          const renderRightActions = (_: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
            const scale = dragX.interpolate({
              inputRange: [-80, 0],
              outputRange: [1, 0.5],
              extrapolate: 'clamp',
            })
            return (
              <PressableOpacity
                onPress={() => { hapticMedium(); handleArchive(item.id) }}
                style={[styles.swipeActionRight, { backgroundColor: showArchived ? colors.foreground : colors.mutedForeground }]}
                accessibilityRole="button"
                accessibilityLabel={showArchived ? t('messages.unarchive') ?? 'Unarchive' : t('messages.archive') ?? 'Archive'}
              >
                <Animated.View style={{ transform: [{ scale }] }}>
                  <Archive size={22} color={colors.background} strokeWidth={2} />
                </Animated.View>
              </PressableOpacity>
            )
          }

          return (
            <Swipeable
              renderRightActions={renderRightActions}
              rightThreshold={40}
              friction={2}
              overshootRight={false}
            >
            <PressableOpacity
              onPress={() => router.push(`/messages/${item.id}`)}
              onLongPress={() => handleTogglePin(item.id)}
              style={[styles.convRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={`${other?.name ?? t('messages.unknownUser')}${unread > 0 ? `, ${unread} ${t('messages.unread') ?? 'unread'}` : ''}${isPinned ? `, ${t('messages.pinned') ?? 'pinned'}` : ''}`}
              accessibilityHint={t('messages.longPressToPinHint') ?? 'Long press to pin or unpin'}
            >
              {/* Avatar with online dot */}
              <View style={styles.avatarWrap}>
                <Avatar url={other?.avatar_url} name={other?.name} size={42} />
                {online && <View style={[styles.onlineDot, { borderColor: colors.card, backgroundColor: colors.success }]} accessibilityLabel={t('messages.online')} />}
              </View>

              {/* Name + preview */}
              <View style={styles.convContent}>
                <View style={styles.convNameRow}>
                  {isPinned && <Pin size={11} color={colors.mutedForeground} />}
                  <Text
                    style={[
                      styles.convName,
                      { color: colors.foreground },
                      unread > 0 && styles.convNameUnread,
                    ]}
                    numberOfLines={1}
                  >
                    {other?.name ?? t('messages.unknownUser')}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  {isMySent && lastMsg?.is_read && <CheckCheck size={12} color={colors.mutedForeground} />}
                  {isImageMsg ? (
                    <View style={styles.imgPreview}>
                      <ImageIcon size={11} color={colors.mutedForeground} />
                      <Text style={[styles.convPreview, { color: colors.mutedForeground }]}>{t('messages.imageMessage')}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.convPreview, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {isMySent && lastMsg?.content ? t('messages.you', { message: lastMsg.content }) : lastMsg?.content || t('messages.noMessagesYet')}
                    </Text>
                  )}
                </View>
              </View>

              {/* Right side: time + unread badge + more button */}
              <View style={styles.convRight}>
                {item.updated_at && (
                  <Text style={[styles.convTime, { color: colors.mutedForeground }]}>
                    {formatTimeAgo(item.updated_at, t, locale)}
                  </Text>
                )}
                {unread > 0 && (
                  <View style={[styles.unreadBadge, { backgroundColor: colors.foreground }]} />
                )}
                <PressableOpacity
                  onPress={(e) => {
                    e?.stopPropagation?.()
                    const pinLabel = isPinned ? (t('messages.unpinConversation') ?? 'Unpin') : (t('messages.pinConversation') ?? 'Pin')
                    const archiveLabel = showArchived ? (t('messages.unarchive') ?? 'Unarchive') : (t('messages.archive') ?? 'Archive')
                    const cancelLabel = t('common.cancel') ?? 'Cancel'
                    if (Platform.OS === 'ios') {
                      ActionSheetIOS.showActionSheetWithOptions(
                        { options: [pinLabel, archiveLabel, cancelLabel], cancelButtonIndex: 2 },
                        (idx) => {
                          if (idx === 0) handleTogglePin(item.id)
                          if (idx === 1) { hapticMedium(); handleArchive(item.id) }
                        },
                      )
                    } else {
                      Alert.alert(t('common.more') ?? 'More', '', [
                        { text: pinLabel, onPress: () => handleTogglePin(item.id) },
                        { text: archiveLabel, onPress: () => { hapticMedium(); handleArchive(item.id) } },
                        { text: cancelLabel, style: 'cancel' },
                      ])
                    }
                  }}
                  style={styles.moreBtn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.more') ?? 'More'}
                >
                  <MoreHorizontal size={16} color={colors.tertiaryForeground} />
                </PressableOpacity>
              </View>
            </PressableOpacity>
            </Swipeable>
          )
        }}
        ListEmptyComponent={
          loading ? (
            <MessageListSkeleton />
          ) : !userId ? (
            /* ── Login required empty state ── */
            <View style={styles.empty}>
              <View style={[styles.emptyIconCircle, { backgroundColor: `${colors.foreground}08` }]}>
                <LogIn size={48} color={colors.foreground} strokeWidth={1.5} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {t('messages.loginRequired')}
              </Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t('messages.loginHint')}</Text>
              <PressableOpacity
                onPress={() => router.push('/(auth)/login')}
                style={[styles.ctaBtn, { backgroundColor: colors.foreground }]}
                accessibilityRole="button"
                accessibilityLabel={t('auth.login')}
              >
                <Text style={[styles.ctaBtnText, { color: colors.background }]}>{t('auth.login')}</Text>
              </PressableOpacity>
            </View>
          ) : (
            /* ── No conversations empty state ── */
            <View style={styles.empty}>
              <View style={[styles.emptyIconCircle, { backgroundColor: `${colors.foreground}08` }]}>
                <MessageCircle size={48} color={colors.foreground} strokeWidth={1.5} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {showArchived ? t('messages.noArchivedConversations') : t('messages.noConversations')}
              </Text>
              {!showArchived && (
                <>
                  <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t('messages.emptyHint')}</Text>
                  <PressableOpacity
                    onPress={() => router.push('/search')}
                    style={[styles.ctaBtn, { backgroundColor: colors.foreground }]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.ctaBtnText, { color: colors.background }]}>{t('messages.startConversation')}</Text>
                  </PressableOpacity>
                </>
              )}
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
      />

      {/* ── New message FAB ── */}
      {userId && (
        <PressableOpacity
          onPress={() => router.push('/search')}
          style={[styles.fab, { bottom: insets.bottom + 80, backgroundColor: colors.foreground }]}
          accessibilityLabel={t('messages.newMessage')}
          accessibilityRole="button"
        >
          <PenSquare size={22} color={colors.background} strokeWidth={2} />
        </PressableOpacity>
      )}
    </View>
    </ScreenErrorBoundary>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Header (Helsinki Monochrome: eyebrow + H1 title + action circles) ──
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerLeft: { flex: 1, gap: 2 },
  locationEyebrow: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // ── Search bar (expandable, full width, pill shape) ──
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
    paddingVertical: 0,
  },
  searchCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Error banner ──
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    flex: 1,
    lineHeight: 18,
  },

  // ── List ──
  list: { paddingTop: 8, paddingHorizontal: 16 },

  // ── Conversation row (card-based: SURFACE bg, borderRadius 16-18, 1px LINE border) ──
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  swipeActionRight: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  avatarWrap: { position: 'relative' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  convContent: { flex: 1, gap: 3 },
  convNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  convName: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    fontFamily: fonts.bodySemi,
    flex: 1,
  },
  convNameUnread: {
    fontWeight: '700',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  imgPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  convPreview: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
    fontFamily: fonts.body,
  },
  convRight: {
    alignItems: 'flex-end',
    gap: 6,
    minWidth: 36,
  },
  convTime: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.body,
  },
  moreBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  unreadBadgeText: {
    fontSize: 0,
    lineHeight: 0,
  },

  // ── Empty states ──
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    fontFamily: fonts.heading,
    letterSpacing: -0.15,
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: fonts.body,
  },
  ctaBtn: {
    marginTop: 12,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 28,
    alignItems: 'center',
    minHeight: 44,
  },
  ctaBtnText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    fontFamily: fonts.bodySemi,
  },

  // ── Event chats section ──
  eventChatsSection: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  eventChatsScroll: {
    gap: 10,
  },
  eventChatCard: {
    width: 136,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 4,
    minHeight: 80,
  },
  eventChatTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventChatBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  eventChatBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    fontFamily: fonts.bodySemi,
  },
  eventChatTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    fontFamily: fonts.bodySemi,
  },
  eventChatMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventChatMetaText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.body,
  },
  eventChatPreview: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.body,
  },

  // ── FAB (shadow allowed for FAB) ──
  fab: {
    position: 'absolute',
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
})
