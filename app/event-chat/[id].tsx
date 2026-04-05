declare const __DEV__: boolean

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { ArrowLeft, Send, ImageIcon, Users, CalendarDays } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { useEventChat } from '@/hooks/useEventChat'
import { Avatar } from '@/components/Avatar'
import { fonts } from '@/lib/fonts'
import { formatTimeAgo } from '@/lib/format'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { isValidUUID } from '@/lib/validation'
import { checkRateLimit } from '@/lib/rateLimiter'

interface EventInfo {
  id: string
  title: string
  event_date: string
  category: string
  conversation_id: string | null
}

function EventChatScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id: conversationId } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const flatListRef = useRef<FlatList>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null)
  const [memberCount, setMemberCount] = useState(0)
  const [input, setInput] = useState('')

  // Get user
  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && mounted) setUserId(user.id)
    })
    return () => { mounted = false }
  }, [supabase])

  // Get event info from conversation_id
  useEffect(() => {
    if (!conversationId || !isValidUUID(conversationId)) return
    let cancelled = false

    async function loadEventInfo() {
      try {
        // Fetch event info and member count in parallel
        const convId = conversationId as string
        const [eventResult, countResult] = await Promise.all([
          (supabase
            .from('community_events')
            .select('id, title, event_date, category, conversation_id') as any)
            .eq('conversation_id', convId)
            .single(),
          supabase
            .from('conversation_members')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', convId),
        ])

        if (cancelled) return
        if (eventResult.data) setEventInfo(eventResult.data as EventInfo)
        setMemberCount((countResult as any).count ?? 0)
      } catch (err) {
        if (__DEV__) console.warn('[event-chat] loadEventInfo error:', err)
      }
    }

    loadEventInfo()
    return () => { cancelled = true }
  }, [conversationId, supabase])

  const {
    messages, loading, sending, hasOlder,
    sendMessage, loadOlder, markAsRead,
  } = useEventChat(conversationId ?? null, userId)

  // Mark as read on mount + focus
  useEffect(() => {
    if (conversationId && userId) markAsRead()
  }, [conversationId, userId, markAsRead])

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return
    if (!(await checkRateLimit('event-chat-send'))) return

    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    const text = input
    setInput('')
    const ok = await sendMessage(text)
    if (!ok) {
      setInput(text) // Restore on failure
    }
  }, [input, sending, sendMessage])

  const handlePickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true,
      })
      if (result.canceled || !result.assets?.[0]) return

      const asset = result.assets[0]
      // Upload
      const ext = asset.uri.split('.').pop() ?? 'jpg'
      const fileName = `event-chat/${conversationId}/${Date.now()}.${ext}`
      const formData = new FormData()
      formData.append('file', {
        uri: asset.uri,
        name: fileName,
        type: `image/${ext}`,
      } as any)

      const { data, error } = await supabase.storage
        .from('chat-images')
        .upload(fileName, formData, { contentType: `image/${ext}` })

      if (error) {
        if (__DEV__) console.warn('[event-chat] image upload error:', error.message)
        return
      }

      const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(fileName)
      await sendMessage('', urlData.publicUrl)
    } catch (err) {
      if (__DEV__) console.warn('[event-chat] pickImage error:', err)
    }
  }, [conversationId, supabase, sendMessage])

  // Render message
  const renderMessage = useCallback(({ item }: { item: any }) => {
    const isOwn = item.sender_id === userId
    const senderName = item.sender?.name ?? t('messages.unknownUser')

    return (
      <View style={[s.msgRow, isOwn && s.msgRowOwn]}>
        {!isOwn && (
          <Avatar url={item.sender?.avatar_url ?? null} name={senderName} size={32} />
        )}
        <View style={[
          s.bubble,
          isOwn
            ? { backgroundColor: colors.primary, borderBottomRightRadius: 4 }
            : { backgroundColor: isDark ? colors.card : '#F3F4F6', borderBottomLeftRadius: 4 },
        ]}>
          {!isOwn && (
            <Text style={[s.senderName, { color: colors.primary, fontFamily: fonts.bodySemi }]}>
              {senderName}
            </Text>
          )}
          {item.image_url && (
            <Image
              source={{ uri: item.image_url }}
              style={s.msgImage}
              contentFit="cover"
            />
          )}
          {item.content ? (
            <Text style={[s.msgText, { color: isOwn ? '#FFF' : colors.foreground, fontFamily: fonts.body }]}>
              {item.content}
            </Text>
          ) : null}
          <Text style={[s.msgTime, { color: isOwn ? 'rgba(255,255,255,0.6)' : colors.mutedForeground }]}>
            {formatTimeAgo(item.created_at, t, locale)}
          </Text>
        </View>
      </View>
    )
  }, [userId, colors, isDark, t, locale])

  const keyExtractor = useCallback((item: any) => item.id, [])

  if (!conversationId || !isValidUUID(conversationId)) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>{t('messages.conversationNotFound')}</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 4, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.backBtn}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>

        <Pressable
          style={s.headerInfo}
          onPress={() => eventInfo && router.push(`/event/${eventInfo.id}` as any)}
        >
          <Text style={[s.headerTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]} numberOfLines={1}>
            {eventInfo?.title ?? t('eventChat.title')}
          </Text>
          <View style={s.headerMeta}>
            <Users size={12} color={colors.mutedForeground} />
            <Text style={[s.headerMetaText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
              {t('events.chatMembers', { count: memberCount })}
            </Text>
          </View>
        </Pressable>

        <View style={{ width: 44 }} />
      </View>

      {/* Event info bar */}
      {eventInfo && (
        <Pressable
          style={[s.eventBar, { backgroundColor: isDark ? colors.card : '#F9FAFB', borderBottomColor: colors.border }]}
          onPress={() => router.push(`/event/${eventInfo.id}` as any)}
        >
          <CalendarDays size={14} color={colors.primary} />
          <Text style={[s.eventBarText, { color: colors.primary, fontFamily: fonts.bodySemi }]} numberOfLines={1}>
            {eventInfo.title}
          </Text>
          <Text style={[s.eventBarDate, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
            {new Date(eventInfo.event_date).toLocaleDateString(
              locale === 'fi' ? 'fi-FI' : 'en-US',
              { weekday: 'short', day: 'numeric', month: 'short' },
            )}
          </Text>
        </Pressable>
      )}

      {/* Messages */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : messages.length === 0 ? (
        <View style={s.center}>
          <Text style={[s.emptyText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
            {t('eventChat.noMessages')}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          inverted
          contentContainerStyle={[s.messageList, { paddingBottom: 8 }]}
          showsVerticalScrollIndicator={false}
          onEndReached={() => { if (hasOlder) loadOlder() }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={hasOlder ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} style={{ paddingVertical: 12 }} />
          ) : null}
        />
      )}

      {/* Input */}
      <View style={[s.inputRow, { paddingBottom: insets.bottom + 8, borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable onPress={handlePickImage} hitSlop={8} style={s.imgBtn}>
          <ImageIcon size={22} color={colors.mutedForeground} />
        </Pressable>

        <TextInput
          style={[s.input, {
            backgroundColor: isDark ? colors.card : '#F3F4F6',
            color: colors.foreground,
            fontFamily: fonts.body,
          }]}
          placeholder={t('eventChat.placeholder')}
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={2000}
        />

        <Pressable
          onPress={handleSend}
          disabled={!input.trim() || sending}
          hitSlop={8}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  headerMetaText: {
    fontSize: 12,
    lineHeight: 16,
  },
  eventBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eventBarText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  eventBarDate: {
    fontSize: 12,
    lineHeight: 16,
  },
  messageList: {
    paddingHorizontal: 12,
    gap: 6,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Messages
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '85%',
  },
  msgRowOwn: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  senderName: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    marginBottom: 2,
  },
  msgText: {
    fontSize: 15,
    lineHeight: 21,
  },
  msgImage: {
    width: 200,
    height: 150,
    borderRadius: 10,
    marginBottom: 4,
  },
  msgTime: {
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
    alignSelf: 'flex-end',
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  imgBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default function EventChatScreen() {
  return (
    <ScreenErrorBoundary screenName="EventChat">
      <EventChatScreenInner />
    </ScreenErrorBoundary>
  )
}
