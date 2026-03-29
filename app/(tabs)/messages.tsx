import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, FlatList, RefreshControl, Pressable, TextInput, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { Search, X, Archive, CheckCheck, ImageIcon, Pin, MessageCircle, LogIn } from 'lucide-react-native'
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
import type { Conversation } from '@/lib/types'

const PINNED_KEY = 'pinned_conversations'

function MessageItemSeparator() {
  const { colors } = useTheme()
  return <View style={[separatorStyle, { backgroundColor: colors.border }]} />
}
const separatorStyle = { height: StyleSheet.hairlineWidth, marginLeft: 76 } as const

export default function MessagesScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [pinnedIds, setPinnedIds] = useState<string[]>([])

  // Load pinned conversations from AsyncStorage
  useEffect(() => {
    async function loadPinned() {
      try {
        const stored = await AsyncStorage.getItem(PINNED_KEY)
        if (stored) setPinnedIds(JSON.parse(stored))
      } catch {}
    }
    loadPinned()
  }, [])

  const savePinnedIds = useCallback(async (ids: string[]) => {
    setPinnedIds(ids)
    await AsyncStorage.setItem(PINNED_KEY, JSON.stringify(ids))
  }, [])

  const handleTogglePin = useCallback(async (convId: string) => {
    const isPinned = pinnedIds.includes(convId)
    const newIds = isPinned
      ? pinnedIds.filter(id => id !== convId)
      : [...pinnedIds, convId]
    await savePinnedIds(newIds)
  }, [pinnedIds, savePinnedIds])

  const fetchConversations = useCallback(async () => {
    try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); setRefreshing(false); return }
    setUserId(user.id)
    if (!isValidUUID(user.id)) { setLoading(false); setRefreshing(false); return }

    // Single RPC call replaces N+1 queries (1 conversations + 2N messages queries)
    const { data, error: rpcError } = await (supabase.rpc as any)('get_conversations_with_details', { p_user_id: user.id })

    if (rpcError) {
      // Fallback: if RPC doesn't exist yet, use legacy query
      if (__DEV__) console.warn('[messages] RPC fallback:', rpcError.message)
      try {
        const { data: fallbackData } = await supabase
          .from('conversations')
          .select('*, user1:profiles!conversations_user1_id_fkey(id, name, avatar_url, last_active_date), user2:profiles!conversations_user2_id_fkey(id, name, avatar_url, last_active_date)')
          .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
          .order('updated_at', { ascending: false })
          .limit(50)

        const fallbackConvs = (fallbackData ?? []).map((row: any) => {
          const isUser1 = row.user1_id === user.id
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

        setConversations(fallbackConvs)
      } catch {
        // Both RPC and fallback failed — show empty state
      }
      setLoading(false)
      setRefreshing(false)
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
      is_archived: row.user1_id === user.id ? row.user1_archived : row.user2_archived,
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

    setConversations(convs)
    setLoading(false)
    setRefreshing(false)
    } catch {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase])

  useEffect(() => { fetchConversations() }, [fetchConversations])

  // Re-fetch conversations when screen gains focus (e.g. after reading messages)
  useFocusEffect(useCallback(() => { fetchConversations() }, [fetchConversations]))

  // Realtime for new messages
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`messages-list-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchConversations()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, supabase, fetchConversations])

  const handleArchive = useCallback(async (convId: string) => {
    const conv = conversations.find(c => c.id === convId)
    if (!conv || !userId) return
    const field = conv.user1_id === userId ? 'user1_archived' : 'user2_archived'
    const isCurrentlyArchived = conv.user1_id === userId ? conv.user1_archived : conv.user2_archived
    const newVal = !isCurrentlyArchived
    await (supabase.from('conversations') as any).update({ [field]: newVal }).eq('id', convId)
    await fetchConversations()
  }, [conversations, userId, supabase, fetchConversations])

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

  const isOnline = (lastActive: string | null | undefined) => {
    if (!lastActive) return false
    return Date.now() - new Date(lastActive).getTime() < 5 * 60 * 1000
  }

  return (
    <ScreenErrorBoundary screenName="Messages">
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('messages.title')}</Text>
        <Pressable
          onPress={() => setShowArchived(!showArchived)}
          hitSlop={8}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityLabel={showArchived ? t('messages.showActive') ?? 'Show active conversations' : t('messages.archive') ?? 'Show archived conversations'}
          accessibilityState={{ selected: showArchived }}
        >
          <Archive size={20} color={showArchived ? colors.primary : colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Search */}
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
          accessibilityLabel={t('messages.searchConversations') ?? 'Search conversations'}
          accessibilityRole="search"
        />
        {searchQuery.length > 0 && (
          <Pressable
            onPress={() => setSearchQuery('')}
            hitSlop={8}
            style={{ minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}
            accessibilityLabel={t('common.clear') ?? 'Clear search'}
            accessibilityRole="button"
          >
            <X size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchConversations() }} tintColor={colors.primary} />}
        renderItem={({ item }) => {
          const other = item.other_user as any
          const unread = item.unread_count ?? 0
          const lastMsg = item.last_message
          const isMySent = lastMsg?.sender_id === userId
          const online = isOnline(other?.last_active_date)
          const isImageMsg = lastMsg?.image_url && !lastMsg?.content
          const isPinned = pinnedIds.includes(item.id)

          return (
            <Pressable
              onPress={() => router.push(`/messages/${item.id}`)}
              onLongPress={() => handleTogglePin(item.id)}
              style={({ pressed }) => [styles.convRow, unread > 0 && { borderLeftWidth: 3, borderLeftColor: colors.primary }, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={`${other?.name ?? t('messages.unknownUser')}${unread > 0 ? `, ${unread} ${t('messages.unread') ?? 'unread'}` : ''}${isPinned ? `, ${t('messages.pinned') ?? 'pinned'}` : ''}`}
              accessibilityHint={t('messages.longPressToPinHint') ?? 'Long press to pin or unpin'}
            >
              <View style={styles.avatarWrap}>
                <Avatar url={other?.avatar_url} name={other?.name} size={48} borderColor={unread > 0 ? colors.primary : undefined} borderWidth={unread > 0 ? 2 : undefined} />
                {online && <View style={[styles.onlineDot, { borderColor: colors.background, backgroundColor: colors.success }]} accessibilityLabel={t('messages.online')} />}
              </View>
              <View style={styles.convContent}>
                <View style={styles.convNameRow}>
                  {isPinned && <Pin size={12} color={colors.primary} />}
                  <Text style={[styles.convName, { color: colors.foreground }, unread > 0 && { fontWeight: '700' }]} numberOfLines={1}>
                    {other?.name ?? t('messages.unknownUser')}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  {isMySent && lastMsg?.is_read && <CheckCheck size={14} color={colors.primary} />}
                  {isImageMsg ? (
                    <View style={styles.imgPreview}>
                      <ImageIcon size={12} color={colors.mutedForeground} />
                      <Text style={[styles.convPreview, { color: colors.mutedForeground }]}>{t('messages.imageMessage')}</Text>
                    </View>
                  ) : (
                    <Text style={[styles.convPreview, { color: colors.mutedForeground }, unread > 0 && { color: colors.foreground }]} numberOfLines={1}>
                      {isMySent && lastMsg?.content ? t('messages.you', { message: lastMsg.content }) : lastMsg?.content ?? ''}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.convRight}>
                {item.updated_at && (
                  <Text style={[styles.convTime, { color: colors.mutedForeground }]}>
                    {formatTimeAgo(item.updated_at, t, locale)}
                  </Text>
                )}
                {unread > 0 && (
                  <View style={[styles.unreadBadge, { backgroundColor: colors.accent }]}>
                    <Text style={[styles.unreadText, { color: colors.accentForeground }]}>
                      {unread > 9 ? '9+' : unread}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          )
        }}
        ItemSeparatorComponent={MessageItemSeparator}
        ListEmptyComponent={
          loading ? (
            <MessageListSkeleton />
          ) : !userId ? (
            <View style={styles.empty}>
              <LogIn size={48} color={colors.primary} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {t('messages.loginRequired')}
              </Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t('messages.loginHint')}</Text>
              <Pressable
                onPress={() => router.push('/(auth)/login')}
                style={[styles.loginBtn, { backgroundColor: colors.primary }]}
                accessibilityRole="button"
                accessibilityLabel={t('auth.login')}
              >
                <Text style={[styles.loginBtnText, { color: colors.primaryForeground }]}>{t('auth.login')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <MessageCircle size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {showArchived ? t('messages.noArchivedConversations') : t('messages.noConversations')}
              </Text>
              {!showArchived && (
                <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t('messages.emptyHint')}</Text>
              )}
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
    </ScreenErrorBoundary>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 8, borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 16, height: 48,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.body, paddingVertical: 0 },
  list: { paddingBottom: 96 },
  convRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFb: { alignItems: 'center', justifyContent: 'center' },
  avatarInit: { fontSize: 18, fontWeight: '600', fontFamily: fonts.bodySemi },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2,
  },
  convContent: { flex: 1, gap: 4 },
  convNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  convName: { fontSize: 15, fontWeight: '600', fontFamily: fonts.bodyMedium },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  imgPreview: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  convPreview: { fontSize: 13, flex: 1, fontFamily: fonts.body },
  convRight: { alignItems: 'flex-end', gap: 8 },
  convTime: { fontSize: 11, fontFamily: fonts.body },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
  },
  unreadText: { fontSize: 10, fontWeight: '700', fontFamily: fonts.bodySemi },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 76 },
  empty: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: fonts.headingSemi },
  emptyHint: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: fonts.body },
  loginBtn: { marginTop: 8, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center' },
  loginBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi },
})
