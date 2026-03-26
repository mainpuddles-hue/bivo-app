import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, FlatList, RefreshControl, Pressable, TextInput, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Search, X, Archive, CheckCheck, ImageIcon, Pin, MessageCircle } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { MessageListSkeleton } from '@/components/SkeletonLoaders'
import { Avatar } from '@/components/Avatar'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo } from '@/lib/format'
import { fonts } from '@/lib/fonts'
import { isValidUUID } from '@/lib/validation'
import type { Conversation } from '@/lib/types'

const PINNED_KEY = 'pinned_conversations'

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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    if (!isValidUUID(user.id)) { setLoading(false); return }

    const { data } = await supabase
      .from('conversations')
      .select(`
        id, user1_id, user2_id, post_id, user1_archived, user2_archived, created_at, updated_at,
        user1:profiles!conversations_user1_id_fkey(id, name, avatar_url, last_active_date),
        user2:profiles!conversations_user2_id_fkey(id, name, avatar_url, last_active_date)
      `)
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
      .order('updated_at', { ascending: false })

    // Fetch last message for each conversation
    const convs = (data ?? []).map((c: any) => {
      const isUser1 = c.user1_id === user.id
      return {
        ...c,
        other_user: isUser1 ? c.user2 : c.user1,
        is_archived: isUser1 ? c.user1_archived : c.user2_archived,
      }
    }) as Conversation[]

    // Fetch last messages + unread counts in parallel
    await Promise.all(convs.map(async (conv) => {
      const [{ data: msgs }, { count }] = await Promise.all([
        supabase
          .from('messages')
          .select('id, sender_id, content, image_url, is_read, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', user.id)
          .eq('is_read', false),
      ])
      if (msgs && msgs.length > 0) conv.last_message = msgs[0] as any
      conv.unread_count = count ?? 0
    }))

    setConversations(convs)
    setLoading(false)
    setRefreshing(false)
  }, [supabase])

  useEffect(() => { fetchConversations() }, [fetchConversations])

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
  }, [conversations, userId, showArchived, supabase, fetchConversations])

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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('messages.title')}</Text>
        <Pressable onPress={() => setShowArchived(!showArchived)} hitSlop={8}>
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
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
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
              style={[styles.convRow, unread > 0 && { borderLeftWidth: 3, borderLeftColor: colors.primary }]}
            >
              <View style={styles.avatarWrap}>
                <Avatar url={other?.avatar_url} name={other?.name} size={48} borderColor={unread > 0 ? colors.primary : undefined} borderWidth={unread > 0 ? 2 : undefined} />
                {online && <View style={[styles.onlineDot, { borderColor: colors.background, backgroundColor: colors.success }]} />}
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
        ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: colors.border }]} />}
        ListEmptyComponent={
          loading ? (
            <MessageListSkeleton />
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
    borderRadius: 12, paddingHorizontal: 14, height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.body },
  list: { paddingBottom: 100 },
  convRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
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
  convContent: { flex: 1, gap: 3 },
  convNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  convName: { fontSize: 15, fontWeight: '600', fontFamily: fonts.bodyMedium },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  imgPreview: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  convPreview: { fontSize: 13, flex: 1, fontFamily: fonts.body },
  convRight: { alignItems: 'flex-end', gap: 6 },
  convTime: { fontSize: 11, fontFamily: fonts.body },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  unreadText: { fontSize: 10, fontWeight: '700', fontFamily: fonts.bodySemi },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 76 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: fonts.headingSemi },
  emptyHint: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: fonts.body },
})
