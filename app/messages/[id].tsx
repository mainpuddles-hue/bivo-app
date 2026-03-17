import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { ArrowLeft, Send, ImageIcon, ChevronDown, CheckCheck, Check } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { formatTimeAgo } from '@/lib/format'
import type { Message, Profile } from '@/lib/types'

const PAGE_SIZE = 30

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function formatDateHeader(dateStr: string, locale: string) {
  return new Date(dateStr).toLocaleDateString(locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
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
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
          (supabase.from('messages') as any).update({ is_read: true }).eq('id', newMsg.id)
        }
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

  const sendTyping = useCallback(() => {
    if (!id || !userId) return
    supabase.channel(`conv-${id}`).send({
      type: 'broadcast', event: 'typing',
      payload: { userId },
    })
  }, [id, userId, supabase])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !userId || sending) return
    setSending(true)
    const content = input.trim()
    setInput('')
    await (supabase.from('messages') as any).insert({ conversation_id: id, sender_id: userId, content })
    await (supabase.from('conversations') as any).update({ updated_at: new Date().toISOString() }).eq('id', id)
    setSending(false)
  }, [input, userId, id, supabase, sending])

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
      console.error('[conversation] image send failed:', err)
    } finally { setSending(false) }
  }, [userId, id, supabase])

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isMine = item.sender_id === userId
    const prev = index > 0 ? messages[index - 1] : null
    const showDateHeader = !prev || !isSameDay(prev.created_at, item.created_at)
    const sameAuthorAsPrev = prev?.sender_id === item.sender_id && !showDateHeader

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
          <View style={[
            s.bubble,
            isMine
              ? [s.bubbleMine, { backgroundColor: colors.primary }]
              : [s.bubbleTheirs, { backgroundColor: isDark ? colors.card : '#F0F0F0' }],
          ]}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={s.msgImage} contentFit="cover" />
            ) : null}
            {item.content ? (
              <Text style={[s.msgText, { color: isMine ? colors.primaryForeground : colors.foreground }]}>{item.content}</Text>
            ) : null}
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
        </View>
      </View>
    )
  }, [userId, messages, otherUser, colors, isDark, t, locale])

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
            <Text style={{ color: colors.mutedForeground, fontWeight: '600' }}>{otherUser?.name?.charAt(0)?.toUpperCase()}</Text>
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
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={s.msgList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
          setShowScrollBtn(contentOffset.y < contentSize.height - layoutMeasurement.height - 200)
        }}
        ListHeaderComponent={
          hasOlder ? (
            <Pressable onPress={loadOlder} style={[s.loadOlderBtn, { borderColor: colors.border }]}>
              <Text style={[s.loadOlderText, { color: colors.primary }]}>
                {loadingOlder ? t('common.loading') : t('conversation.loadOlder')}
              </Text>
            </Pressable>
          ) : null
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

      {/* Input */}
      <View style={[s.inputBar, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
        <Pressable onPress={handleSendImage} style={s.imageBtn} hitSlop={8}>
          <ImageIcon size={22} color={colors.mutedForeground} />
        </Pressable>
        <TextInput
          style={[s.textInput, { backgroundColor: colors.muted, color: colors.foreground }]}
          value={input}
          onChangeText={(text) => { setInput(text); sendTyping() }}
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
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { borderBottomLeftRadius: 4 },
  msgImage: { width: 200, height: 150, borderRadius: 12, marginBottom: 4 },
  msgText: { fontSize: 15, lineHeight: 20 },
  msgMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 2 },
  msgTime: { fontSize: 10 },
  loadOlderBtn: { alignSelf: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 12 },
  loadOlderText: { fontSize: 13, fontWeight: '500' },
  scrollBtn: {
    position: 'absolute', right: 16, bottom: 80,
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
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
})
