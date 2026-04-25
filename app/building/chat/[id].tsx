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
import { ArrowLeft, Send, ImageIcon, Users, Building2 } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { KeyboardDoneAccessory, KEYBOARD_DONE_ID } from '@/components/ui'
import { useSupabase } from '@/hooks/useSupabase'
import { useEventChat } from '@/hooks/useEventChat'
import { Avatar } from '@/components/Avatar'
import { fonts } from '@/lib/fonts'
import { formatTimeAgo } from '@/lib/format'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { isValidUUID } from '@/lib/validation'
import { checkRateLimit } from '@/lib/rateLimiter'
import { useToast } from '@/components/Toast'

interface OrgInfo {
  id: string
  name: string
  street_address: string | null
  member_count: number
  conversation_id: string | null
}

function BuildingChatScreenInner() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id: orgId } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const toast = useToast()
  const flatListRef = useRef<FlatList>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({})
  const [initError, setInitError] = useState(false)

  // Get user
  useEffect(() => {
    let mounted = true
    import('@/lib/authCache').then(({ getCachedUserId }) =>
      getCachedUserId().then(id => { if (id && mounted) setUserId(id) })
    )
    return () => { mounted = false }
  }, [])

  // Load org info and find/create conversation
  useEffect(() => {
    if (!orgId || !isValidUUID(orgId) || !userId) return
    let cancelled = false

    async function loadOrgAndChat() {
      try {
        // Fetch org info
        const { data: org } = await supabase
          .from('organizations')
          .select('id, name, street_address, member_count')
          .eq('id', orgId)
          .single()

        if (cancelled || !org) return

        // Find existing conversation for this org
        const { data: conv, error: convErr } = await supabase
          .from('conversations')
          .select('id')
          .eq('org_id', orgId)
          .maybeSingle()

        if (convErr && __DEV__) console.warn('[building-chat] conv lookup failed:', convErr.message)

        let convId = (conv as any)?.id ?? null

        // Create conversation if it doesn't exist
        if (!convId) {
          const { data: newConv, error: newConvErr } = await (supabase.from('conversations') as any)
            .insert({
              org_id: orgId,
              user1_id: userId,
              user2_id: userId, // Group chat — both fields point to creator
            })
            .select('id')
            .single()
          if (newConvErr && __DEV__) console.warn('[building-chat] conv create failed:', newConvErr.message)
          convId = (newConv as any)?.id ?? null

          // Add creator as conversation member
          if (convId) {
            await (supabase.from('conversation_members') as any)
              .insert({ conversation_id: convId, user_id: userId })
              .single()
          }
        } else {
          // Ensure current user is a member
          await (supabase.from('conversation_members') as any)
            .upsert({ conversation_id: convId, user_id: userId }, { onConflict: 'conversation_id,user_id' })
        }

        if (!cancelled) {
          setOrgInfo({ ...(org as any), conversation_id: convId })
          setConversationId(convId)
        }
      } catch (err) {
        if (__DEV__) console.warn('[building-chat] loadOrg error:', err)
        if (!cancelled) setInitError(true)
      }
    }

    loadOrgAndChat()
    return () => { cancelled = true }
  }, [orgId, userId, supabase])

  const {
    messages, loading, sending, hasOlder,
    sendMessage, loadOlder, markAsRead,
  } = useEventChat(conversationId, userId)

  // Mark as read on mount
  useEffect(() => {
    if (conversationId && userId) markAsRead()
  }, [conversationId, userId, markAsRead])

  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return
    if (!(await checkRateLimit('building-chat-send'))) {
      toast.show({ message: t('messages.rateLimited') ?? 'Sending too fast', type: 'info' })
      return
    }

    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    const text = input
    setInput('')
    const ok = await sendMessage(text)
    if (!ok) {
      setInput(text)
      toast.show({ message: t('messages.sendFailed') ?? 'Message failed to send', type: 'error' })
    }
  }, [input, sending, sendMessage])

  const handlePickImage = useCallback(async () => {
    if (!conversationId) return
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true,
      })
      if (result.canceled || !result.assets?.[0]) return

      const asset = result.assets[0]
      const rawExt = (asset.uri.split('.').pop() ?? 'jpg').split(/[?#]/)[0].toLowerCase()
      const ext = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(rawExt) ? rawExt : 'jpg'
      const fileName = `building-chat/${conversationId}/${Date.now()}.${ext}`

      const response = await fetch(asset.uri)
      const blob = await response.blob()
      if (blob.size > 10 * 1024 * 1024) {
        toast.show({ message: t('messages.imageTooLarge') ?? 'Image is too large', type: 'error' })
        return
      }
      const arrayBuffer = await blob.arrayBuffer()

      const { error } = await supabase.storage
        .from('chat-images')
        .upload(fileName, arrayBuffer, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` })

      if (error) {
        if (__DEV__) console.warn('[building-chat] image upload error:', error.message)
        toast.show({ message: t('messages.imageUploadFailed') ?? 'Image upload failed', type: 'error' })
        return
      }

      const { data: urlData } = supabase.storage.from('chat-images').getPublicUrl(fileName)
      if (urlData?.publicUrl) await sendMessage('', urlData.publicUrl)
    } catch (err) {
      if (__DEV__) console.warn('[building-chat] pickImage error:', err)
    }
  }, [conversationId, supabase, sendMessage])

  // Day separator
  const renderDaySeparator = useCallback((dateStr: string) => {
    const d = new Date(dateStr)
    const label = d.toLocaleDateString(
      locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-US',
      { weekday: 'short', day: 'numeric', month: 'short' },
    )
    return (
      <View style={s.daySeparator}>
        <View style={[s.dayPill, { backgroundColor: `${colors.foreground}08` }]}>
          <Text style={[s.dayPillText, { color: colors.mutedForeground }]}>
            {label}
          </Text>
        </View>
      </View>
    )
  }, [colors, locale])

  // Render message
  const renderMessage = useCallback(({ item, index }: { item: any; index: number }) => {
    const isOwn = item.sender_id === userId
    const senderName = item.sender?.name ?? t('messages.unknownUser')

    const currentDay = new Date(item.created_at).toDateString()
    const nextItem = messages[index + 1]
    const showDaySep = !nextItem || new Date(nextItem.created_at).toDateString() !== currentDay

    return (
      <View>
        {showDaySep && renderDaySeparator(item.created_at)}
        <View style={[s.msgRow, isOwn && s.msgRowOwn]}>
          {!isOwn && (
            <Avatar url={item.sender?.avatar_url ?? null} name={senderName} size={32} />
          )}
          <View style={[
            s.bubble,
            isOwn
              ? [s.bubbleOwn, { backgroundColor: colors.foreground }]
              : [s.bubbleTheirs, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }],
          ]}>
            {!isOwn && (
              <Text style={[s.senderName, { color: colors.mutedForeground }]}>
                {senderName}
              </Text>
            )}
            {item.image_url && (
              imgErrors[item.id] ? (
                <View style={[s.msgImage, { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                  <ImageIcon size={24} color={colors.mutedForeground} />
                </View>
              ) : (
                <Image source={{ uri: item.image_url }} style={s.msgImage} contentFit="cover" onError={() => setImgErrors(prev => ({ ...prev, [item.id]: true }))} />
              )
            )}
            {item.content ? (
              <Text style={[s.msgText, { color: isOwn ? colors.primaryForeground : colors.foreground }]}>
                {item.content}
              </Text>
            ) : null}
            <Text style={[s.msgTime, { color: isOwn ? `${colors.primaryForeground}99` : colors.mutedForeground }]}>
              {formatTimeAgo(item.created_at, t, locale)}
            </Text>
          </View>
        </View>
      </View>
    )
  }, [userId, colors, t, locale, messages, renderDaySeparator, imgErrors])

  const keyExtractor = useCallback((item: any) => item.id, [])

  if (!orgId || !isValidUUID(orgId)) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: fonts.body }}>
          {t('messages.conversationNotFound')}
        </Text>
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
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[s.circleBack, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>

        <Pressable
          style={s.headerInfo}
          onPress={() => orgId && isValidUUID(orgId) && router.push(`/building/${orgId}` as any)}
        >
          <Text style={[s.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {orgInfo?.name ?? t('building.chat')}
          </Text>
          <View style={s.headerMeta}>
            <Users size={12} color={colors.mutedForeground} />
            <Text style={[s.headerMetaText, { color: colors.mutedForeground }]}>
              {t('building.memberCount', { count: orgInfo?.member_count ?? 0 })}
            </Text>
          </View>
        </Pressable>

        <View style={{ width: 36 }} />
      </View>

      {/* Building info bar */}
      {orgInfo?.street_address && (
        <Pressable
          style={[s.orgBar, { borderBottomColor: colors.border }]}
          onPress={() => orgId && isValidUUID(orgId) && router.push(`/building/${orgId}` as any)}
        >
          <Building2 size={14} color={colors.foreground} />
          <Text style={[s.orgBarText, { color: colors.foreground }]} numberOfLines={1}>
            {orgInfo.street_address}
          </Text>
          <Text style={[s.orgBarMeta, { color: colors.mutedForeground }]}>
            {orgInfo.member_count} {t('feed.neighbors') ?? 'naapuria'}
          </Text>
        </Pressable>
      )}

      {/* Messages */}
      {initError && !conversationId ? (
        <View style={s.center}>
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('common.error')}</Text>
          <Pressable
            onPress={() => { setInitError(false) }}
            style={{ backgroundColor: colors.foreground, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, marginTop: 12 }}
          >
            <Text style={{ color: colors.background, fontFamily: fonts.bodySemi, fontSize: 13 }}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : loading || !conversationId ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.foreground} />
        </View>
      ) : messages.length === 0 ? (
        <View style={s.center}>
          <Building2 size={40} color={colors.mutedForeground} strokeWidth={1.2} style={{ opacity: 0.4, marginBottom: 8 }} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
            {t('building.chatEmpty')}
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
        <Pressable onPress={handlePickImage} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('messages.addImage')} style={s.imgBtn}>
          <ImageIcon size={22} color={colors.mutedForeground} />
        </Pressable>

        <TextInput
          style={[s.input, {
            backgroundColor: colors.card,
            color: colors.foreground,
            fontFamily: fonts.body,
            borderColor: colors.border,
          }]}
          placeholder={t('building.chatPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={t('building.chatPlaceholder')}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={2000}
          inputAccessoryViewID={KEYBOARD_DONE_ID}
        />

        <Pressable
          onPress={handleSend}
          disabled={!input.trim() || sending}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('messages.send')}
          style={[s.sendBtn, { backgroundColor: input.trim() ? colors.foreground : colors.muted }]}
        >
          <Send size={18} color={input.trim() ? colors.primaryForeground : colors.mutedForeground} />
        </Pressable>
      </View>
      <KeyboardDoneAccessory />
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
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  circleBack: {
    width: 36, height: 36, borderRadius: 999,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  headerInfo: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontSize: 14, fontFamily: fonts.headingSemi, lineHeight: 22,
  },
  headerMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2,
  },
  headerMetaText: { fontSize: 12, lineHeight: 16, fontFamily: fonts.body },
  orgBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  orgBarText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: fonts.bodySemi },
  orgBarMeta: { fontSize: 12, lineHeight: 16, fontFamily: fonts.body },
  messageList: { paddingHorizontal: 12, gap: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: fonts.body },

  // Day separator — pill style (v3)
  daySeparator: { alignItems: 'center', paddingVertical: 16 },
  dayPill: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999,
  },
  dayPillText: {
    fontSize: 11, lineHeight: 16, textTransform: 'uppercase',
    letterSpacing: 0.6, fontFamily: fonts.bodySemi,
  },

  // Messages
  msgRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '85%' as any,
  },
  msgRowOwn: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  bubble: { paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' as any },
  bubbleOwn: {
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderBottomLeftRadius: 18, borderBottomRightRadius: 6,
  },
  bubbleTheirs: {
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderBottomLeftRadius: 6, borderBottomRightRadius: 18,
  },
  senderName: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 16, marginBottom: 2 },
  msgText: { fontSize: 15, lineHeight: 20, fontFamily: fonts.body },
  msgImage: { width: 200, height: 150, borderRadius: 12, marginBottom: 4 },
  msgTime: { fontSize: 12, lineHeight: 16, marginTop: 4, alignSelf: 'flex-end' as any, fontFamily: fonts.body },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  imgBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1, borderRadius: 999, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, maxHeight: 120, lineHeight: 20,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
})

export default function BuildingChatScreen() {
  return (
    <ScreenErrorBoundary screenName="BuildingChat">
      <BuildingChatScreenInner />
    </ScreenErrorBoundary>
  )
}
