declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Modal, ScrollView, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { ArrowLeft, Send, ImageIcon, ChevronDown, ChevronRight, CheckCheck, Check, Trash2 } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { formatTimeAgo, formatDateHeader } from '@/lib/format'
import { fonts } from '@/lib/fonts'
import type { Message, Profile } from '@/lib/types'

const PAGE_SIZE = 30

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

export default function ConversationScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useMemo(() => createClient(), [])
  const flatListRef = useRef<FlatList>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [otherUser, setOtherUser] = useState<Profile | null>(null)
  const [sending, setSending] = useState(false)
  const [hasOlder, setHasOlder] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [otherTyping, setOtherTyping] = useState(false)
  const [showQuickReplies, setShowQuickReplies] = useState(true)
  const [linkedPost, setLinkedPost] = useState<{ id: string; title: string; type: string; image_url: string | null } | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reaction & deletion state
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [reactions, setReactions] = useState<Record<string, { emoji: string; user_id: string }[]>>({})

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: conv } = await supabase.from('conversations').select('*').eq('id', id).single()
      if (conv) {
        const otherId = (conv as any).user1_id === user.id ? (conv as any).user2_id : (conv as any).user1_id
        const { data: profile } = await supabase.from('profiles').select('id, name, avatar_url, naapurusto').eq('id', otherId).single()
        if (profile) setOtherUser(profile as unknown as Profile)

        if ((conv as any).post_id) {
          const { data: postData } = await supabase
            .from('posts')
            .select('id, title, type, image_url')
            .eq('id', (conv as any).post_id)
            .single()
          if (postData) setLinkedPost(postData as any)
        }
      }

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      const sorted = (msgs ?? []).reverse() as Message[]
      setMessages(sorted)
      setHasOlder((msgs ?? []).length >= PAGE_SIZE)

      // Load reactions for these messages
      const msgIds = sorted.map(m => m.id)
      if (msgIds.length > 0) {
        try {
          const { data: rxns } = await supabase
            .from('message_reactions')
            .select('*')
            .in('message_id', msgIds)
          if (rxns) {
            const grouped: Record<string, { emoji: string; user_id: string }[]> = {}
            for (const r of rxns as any[]) {
              if (!grouped[r.message_id]) grouped[r.message_id] = []
              grouped[r.message_id].push({ emoji: r.emoji, user_id: r.user_id })
            }
            setReactions(grouped)
          }
        } catch {
          if (__DEV__) console.log('[conversation] message_reactions fetch failed')
          // Silently fail — reactions just won't show
        }
      }

      // Mark as read
      await (supabase.from('messages') as any).update({ is_read: true })
        .eq('conversation_id', id)
        .neq('sender_id', user.id)
        .eq('is_read', false)
    }
    if (id) load()
  }, [id, supabase])

  // Realtime messages
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`conv-${id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${id}`,
      }, (payload) => {
        const newMsg = payload.new as Message
        setMessages(prev => [...prev, newMsg])
        // Auto-mark as read if from other user
        if (newMsg.sender_id !== userId) {
          ;(supabase.from('messages') as any).update({ is_read: true }).eq('id', newMsg.id).then(() => {})
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${id}`,
      }, (payload) => {
        const updated = payload.new as Message
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m))
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if ((payload as any).payload?.userId !== userId) {
          setOtherTyping(true)
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
          typingTimerRef.current = setTimeout(() => setOtherTyping(false), 3000)
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    }
  }, [id, userId, supabase])

  // Extra safety: clear typing timers on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
    }
  }, [])

  const loadOlder = useCallback(async () => {
    if (!hasOlder || loadingOlder || messages.length === 0) return
    setLoadingOlder(true)
    const oldest = messages[0]
    const { data: older } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    const sorted = (older ?? []).reverse() as Message[]
    setMessages(prev => [...sorted, ...prev])
    setHasOlder((older ?? []).length >= PAGE_SIZE)
    setLoadingOlder(false)
  }, [hasOlder, loadingOlder, messages, id, supabase])

  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendTyping = useCallback(() => {
    if (!id || !userId || typingDebounceRef.current) return
    supabase.channel(`conv-${id}`).send({
      type: 'broadcast', event: 'typing',
      payload: { userId },
    }).catch(() => {})
    typingDebounceRef.current = setTimeout(() => { typingDebounceRef.current = null }, 2000)
  }, [id, userId, supabase])

  const quickReplies = useMemo(() => [
    t('messages.quickThanks'),
    t('messages.quickHelp'),
    t('messages.quickAvailable'),
  ], [t])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !userId || sending) return
    setSending(true)
    setShowQuickReplies(false)
    const content = input.trim()
    setInput('')
    try {
      const { error } = await (supabase.from('messages') as any).insert({ conversation_id: id, sender_id: userId, content })
      if (error) throw error
      await (supabase.from('conversations') as any).update({ updated_at: new Date().toISOString() }).eq('id', id)
    } catch (err) {
      setInput(content)
      Alert.alert(t('common.error'), t('messages.sendFailed'))
      if (__DEV__) console.error('[conversation] message send failed:', err)
    } finally {
      setSending(false)
    }
  }, [input, userId, id, supabase, sending, t])

  const handleSendImage = useCallback(async () => {
    if (!userId) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    })
    if (result.canceled || !result.assets[0]) return
    setSending(true)
    try {
      const uri = result.assets[0].uri
      const ext = uri.split('.').pop() ?? 'jpg'
      const path = `messages/${id}/${Date.now()}.${ext}`
      const response = await fetch(uri)
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      await supabase.storage.from('message-images').upload(path, arrayBuffer, { contentType: `image/${ext}` })
      const { data: urlData } = supabase.storage.from('message-images').getPublicUrl(path)
      await (supabase.from('messages') as any).insert({
        conversation_id: id, sender_id: userId,
        content: '', image_url: urlData.publicUrl,
      })
      await (supabase.from('conversations') as any).update({ updated_at: new Date().toISOString() }).eq('id', id)
    } catch (err) {
      Alert.alert(t('common.error'), t('messages.imageSendFailed'))
      if (__DEV__) console.error('[conversation] image send failed:', err)
    } finally { setSending(false) }
  }, [userId, id, supabase, t])

  const handleLongPress = useCallback((messageId: string) => {
    setSelectedMessageId(messageId)
    setShowReactionPicker(true)
  }, [])

  const handleReaction = useCallback(async (emoji: string) => {
    if (!selectedMessageId || !userId) return
    setShowReactionPicker(false)

    // Check if user already reacted with this emoji
    const existing = reactions[selectedMessageId]?.find(
      r => r.user_id === userId && r.emoji === emoji
    )

    if (existing) {
      // Remove reaction
      try {
        await (supabase.from('message_reactions') as any)
          .delete()
          .eq('message_id', selectedMessageId)
          .eq('user_id', userId)
          .eq('emoji', emoji)
      } catch {
        // Silently fail — reaction just won't be removed from server
      }
      setReactions(prev => ({
        ...prev,
        [selectedMessageId]: (prev[selectedMessageId] ?? []).filter(
          r => !(r.user_id === userId && r.emoji === emoji)
        ),
      }))
    } else {
      // Add reaction
      try {
        await (supabase.from('message_reactions') as any).insert({
          message_id: selectedMessageId,
          user_id: userId,
          emoji,
        })
      } catch {
        // Silently fail — reaction just won't save
      }
      setReactions(prev => ({
        ...prev,
        [selectedMessageId]: [...(prev[selectedMessageId] ?? []), { emoji, user_id: userId }],
      }))
    }
    setSelectedMessageId(null)
  }, [selectedMessageId, userId, reactions, supabase])

  const handleDeleteMessage = useCallback(async () => {
    if (!selectedMessageId || !userId) return
    setShowReactionPicker(false)

    const msg = messages.find(m => m.id === selectedMessageId)
    if (!msg || msg.sender_id !== userId) return

    // Optimistic update
    setMessages(prev => prev.map(m =>
      m.id === selectedMessageId ? { ...m, is_deleted: true } as any : m
    ))

    try {
      const { error } = await (supabase.from('messages') as any)
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', selectedMessageId)
      if (error) throw error
    } catch {
      // Revert on failure
      setMessages(prev => prev.map(m =>
        m.id === selectedMessageId ? { ...m, is_deleted: false } as any : m
      ))
      Alert.alert(t('common.error'), t('conversation.deleteFailed'))
    }
    setSelectedMessageId(null)
  }, [selectedMessageId, userId, messages, supabase, t])

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isMine = item.sender_id === userId
    const prev = index > 0 ? messages[index - 1] : null
    const showDateHeader = !prev || !isSameDay(prev.created_at, item.created_at)
    const sameAuthorAsPrev = prev?.sender_id === item.sender_id && !showDateHeader
    const isDeleted = (item as any).is_deleted
    const msgReactions = reactions[item.id] ?? []

    // Group reactions by emoji
    const groupedReactions: { emoji: string; count: number; userReacted: boolean }[] = []
    for (const r of msgReactions) {
      const existing = groupedReactions.find(g => g.emoji === r.emoji)
      if (existing) {
        existing.count++
        if (r.user_id === userId) existing.userReacted = true
      } else {
        groupedReactions.push({ emoji: r.emoji, count: 1, userReacted: r.user_id === userId })
      }
    }

    return (
      <View>
        {showDateHeader && (
          <Text style={[s.dateHeader, { color: colors.mutedForeground }]}>
            {formatDateHeader(item.created_at, locale)}
          </Text>
        )}
        <View style={[s.msgRow, isMine ? s.msgRowMine : s.msgRowTheirs]}>
          {!isMine && !sameAuthorAsPrev && otherUser?.avatar_url ? (
            <Image source={{ uri: otherUser.avatar_url }} style={s.msgAvatar} />
          ) : !isMine ? (
            <View style={{ width: 28 }} />
          ) : null}
          <Pressable
            onLongPress={() => handleLongPress(item.id)}
            delayLongPress={400}
            style={{ maxWidth: '78%' }}
          >
            <View style={[
              s.bubble,
              isMine
                ? [s.bubbleMine, { backgroundColor: colors.primary }]
                : [s.bubbleTheirs, { backgroundColor: isDark ? colors.card : '#F0F0F0' }],
            ]}>
              {isDeleted ? (
                <Text style={[s.msgText, s.deletedText, { color: isMine ? `${colors.primaryForeground}88` : colors.mutedForeground }]}>
                  {t('conversation.messageDeleted')}
                </Text>
              ) : (
                <>
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={s.msgImage} contentFit="cover" />
                  ) : null}
                  {item.content ? (
                    <Text style={[s.msgText, { color: isMine ? colors.primaryForeground : colors.foreground }]}>{item.content}</Text>
                  ) : null}
                </>
              )}
              <View style={s.msgMeta}>
                <Text style={[s.msgTime, { color: isMine ? `${colors.primaryForeground}99` : colors.mutedForeground }]}>
                  {formatTimeAgo(item.created_at, t, locale)}
                </Text>
                {isMine && (
                  item.is_read
                    ? <CheckCheck size={12} color={`${colors.primaryForeground}99`} />
                    : <Check size={12} color={`${colors.primaryForeground}66`} />
                )}
              </View>
            </View>
            {/* Reactions display */}
            {groupedReactions.length > 0 && (
              <View style={[s.reactionsRow, isMine ? s.reactionsRowMine : s.reactionsRowTheirs]}>
                {groupedReactions.map((r) => (
                  <Pressable
                    key={r.emoji}
                    onPress={() => {
                      setSelectedMessageId(item.id)
                      handleReaction(r.emoji)
                    }}
                    style={[
                      s.reactionBadge,
                      { backgroundColor: isDark ? colors.card : '#F0F0F0', borderColor: colors.border },
                      r.userReacted && { borderColor: colors.primary, backgroundColor: isDark ? `${colors.primary}22` : `${colors.primary}15` },
                    ]}
                  >
                    <Text style={s.reactionEmoji}>{r.emoji}</Text>
                    {r.count > 1 && (
                      <Text style={[s.reactionCount, { color: colors.mutedForeground }]}>{r.count}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </Pressable>
        </View>
      </View>
    )
  }, [userId, messages, otherUser, colors, isDark, t, locale, reactions, handleLongPress, handleReaction])

  const selectedMsg = selectedMessageId ? messages.find(m => m.id === selectedMessageId) : null
  const canDelete = selectedMsg?.sender_id === userId && !(selectedMsg as any)?.is_deleted

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: isDark ? 'rgba(30,30,30,0.97)' : 'rgba(255,255,255,0.97)', borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        {otherUser?.avatar_url ? (
          <Image source={{ uri: otherUser.avatar_url }} style={s.headerAvatar} />
        ) : (
          <View style={[s.headerAvatar, { backgroundColor: colors.muted, justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: colors.mutedForeground, fontWeight: '600' }}>{otherUser?.name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
          </View>
        )}
        <View>
          <Text style={[s.headerName, { color: colors.foreground }]}>{otherUser?.name ?? t('messages.unknownUser')}</Text>
          {otherTyping ? (
            <Text style={[s.headerSub, { color: colors.primary }]}>{t('messages.typing')}</Text>
          ) : otherUser?.naapurusto ? (
            <Text style={[s.headerSub, { color: colors.mutedForeground }]}>{otherUser.naapurusto}</Text>
          ) : null}
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => item.id ?? `msg-${index}`}
        renderItem={renderMessage}
        contentContainerStyle={s.msgList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => {
          if (!showScrollBtn) flatListRef.current?.scrollToEnd({ animated: false })
        }}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
          setShowScrollBtn(contentOffset.y < contentSize.height - layoutMeasurement.height - 200)
        }}
        ListHeaderComponent={
          <View>
            {linkedPost && (
              <Pressable
                onPress={() => router.push(`/post/${linkedPost.id}`)}
                style={[contextStyles.card, { backgroundColor: isDark ? colors.card : colors.muted }]}
              >
                {linkedPost.image_url && (
                  <Image source={{ uri: linkedPost.image_url }} style={contextStyles.image} contentFit="cover" />
                )}
                <View style={contextStyles.info}>
                  <Text style={[contextStyles.label, { color: colors.mutedForeground }]}>{t('messages.aboutPost')}</Text>
                  <Text style={[contextStyles.title, { color: colors.foreground }]} numberOfLines={1}>{linkedPost.title}</Text>
                </View>
                <ChevronRight size={14} color={colors.mutedForeground} />
              </Pressable>
            )}
            {hasOlder ? (
              <Pressable onPress={loadOlder} style={[s.loadOlderBtn, { borderColor: colors.border }]}>
                <Text style={[s.loadOlderText, { color: colors.primary }]}>
                  {loadingOlder ? t('common.loading') : t('conversation.loadOlder')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('messages.noMessagesYet')}</Text>
        }
      />

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <Pressable
          onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
          style={[s.scrollBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ChevronDown size={20} color={colors.foreground} />
        </Pressable>
      )}

      {/* Reaction / Delete Picker Modal */}
      <Modal
        visible={showReactionPicker}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowReactionPicker(false); setSelectedMessageId(null) }}
      >
        <Pressable
          style={s.modalOverlay}
          onPress={() => { setShowReactionPicker(false); setSelectedMessageId(null) }}
        >
          <View style={[s.reactionPickerContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.reactionPickerRow}>
              {QUICK_REACTIONS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => handleReaction(emoji)}
                  style={s.reactionPickerItem}
                >
                  <Text style={s.reactionPickerEmoji}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
            {canDelete && (
              <Pressable onPress={handleDeleteMessage} style={[s.deleteRow, { borderTopColor: colors.border }]}>
                <Trash2 size={16} color={colors.destructive} />
                <Text style={[s.deleteText, { color: colors.destructive }]}>{t('conversation.deleteMessage')}</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Quick Replies */}
      {showQuickReplies && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.quickRepliesRow}
          keyboardShouldPersistTaps="handled"
        >
          {quickReplies.map((reply, i) => (
            <Pressable
              key={i}
              onPress={() => {
                setInput(reply)
                setShowQuickReplies(false)
              }}
              style={[s.quickReplyChip, { backgroundColor: isDark ? colors.card : colors.muted }]}
            >
              <Text style={[s.quickReplyText, { color: colors.foreground }]}>{reply}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Input */}
      <View style={[s.inputBar, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
        <Pressable onPress={handleSendImage} style={s.imageBtn} hitSlop={8}>
          <ImageIcon size={22} color={colors.mutedForeground} />
        </Pressable>
        <TextInput
          style={[s.textInput, { backgroundColor: colors.muted, color: colors.foreground }]}
          value={input}
          onChangeText={(text) => { setInput(text); if (text.length > 0) setShowQuickReplies(false); sendTyping() }}
          placeholder={t('messages.sendPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={2000}
        />
        <Pressable
          onPress={handleSend}
          disabled={!input.trim() || sending}
          style={[s.sendBtn, { backgroundColor: input.trim() ? colors.primary : colors.muted }]}
        >
          <Send size={18} color={input.trim() ? colors.primaryForeground : colors.mutedForeground} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerName: { fontSize: 15, fontWeight: '600' },
  headerSub: { fontSize: 12 },
  msgList: { padding: 16, gap: 4, flexGrow: 1 },
  dateHeader: { fontSize: 12, fontWeight: '500', textAlign: 'center', marginVertical: 12 },
  msgRow: { flexDirection: 'row', gap: 6, marginVertical: 1 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, marginTop: 2 },
  bubble: { maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { borderBottomLeftRadius: 4 },
  msgImage: { width: 200, height: 150, borderRadius: 12, marginBottom: 4 },
  msgText: { fontSize: 15, lineHeight: 20 },
  deletedText: { fontStyle: 'italic' },
  msgMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 2 },
  msgTime: { fontSize: 10 },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionsRowMine: { justifyContent: 'flex-end' },
  reactionsRowTheirs: { justifyContent: 'flex-start' },
  reactionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, borderWidth: 1,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11 },
  loadOlderBtn: { alignSelf: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 12 },
  loadOlderText: { fontSize: 13, fontWeight: '500' },
  scrollBtn: {
    position: 'absolute', right: 16, bottom: 80,
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  modalOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  reactionPickerContainer: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  reactionPickerRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 4,
  },
  reactionPickerItem: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  reactionPickerEmoji: { fontSize: 24 },
  deleteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteText: { fontSize: 15, fontWeight: '500' },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth,
  },
  imageBtn: { paddingBottom: 10 },
  textInput: {
    flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, maxHeight: 120, minHeight: 40,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { textAlign: 'center', fontSize: 14, marginTop: 40 },
  quickRepliesRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  quickReplyChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 16,
  },
  quickReplyText: { fontSize: 13, fontFamily: fonts.body },
})

const contextStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginVertical: 8, padding: 10,
    borderRadius: 10,
  },
  image: { width: 40, height: 40, borderRadius: 8 },
  info: { flex: 1, gap: 2 },
  label: { fontSize: 10, fontFamily: fonts.body, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 13, fontFamily: fonts.bodySemi },
})
