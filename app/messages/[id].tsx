declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Modal, ScrollView, Alert, Linking, ActivityIndicator } from 'react-native'
import { PressableOpacity, KeyboardDoneAccessory, KEYBOARD_DONE_ID } from '@/components/ui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { ArrowLeft, Send, ImageIcon, ChevronDown, ChevronLeft, ChevronRight, CheckCheck, Check, Trash2, Copy, Flag, ExternalLink, Phone, Plus, DollarSign, CheckCircle, XCircle } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import * as Clipboard from 'expo-clipboard'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { Avatar } from '@/components/Avatar'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo, formatDateHeader, formatPrice } from '@/lib/format'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { ReportModal } from '@/components/ReportModal'
import { isValidUUID } from '@/lib/validation'
import { checkRateLimit, getRateLimitMessage } from '@/lib/rateLimiter'
import { getImageUrl } from '@/lib/imageUtils'
import { getCachedUserId } from '@/lib/authCache'
import type { Message, Profile } from '@/lib/types'

const PAGE_SIZE = 30

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi

/** Extract the first URL from a message string */
function extractUrl(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(URL_REGEX)
  return match ? match[0] : null
}

/** Extract domain name from a URL */
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url
  }
}

function ConversationScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const flatListRef = useRef<FlatList>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [otherUser, setOtherUser] = useState<Profile | null>(null)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [otherTyping, setOtherTyping] = useState(false)
  const [showQuickReplies, setShowQuickReplies] = useState(true)
  const [linkedPost, setLinkedPost] = useState<{ id: string; title: string; type: string; image_url: string | null } | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userIdRef = useRef<string | null>(null)
  userIdRef.current = userId

  // Offer state
  const [pendingOffer, setPendingOffer] = useState<{ id: string; amount: number; message: string | null; from_user_id: string; status: string } | null>(null)
  const [offerLoading, setOfferLoading] = useState(false)

  // Reaction & deletion state
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [reactions, setReactions] = useState<Record<string, { emoji: string; user_id: string }[]>>({})

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setNotFound(false)

      let uid = await getCachedUserId()
      if (cancelled) return
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser()
        if (cancelled) return
        if (!user) { setLoading(false); setNotFound(true); return }
        uid = user.id
      }
      setUserId(uid)

      const { data: conv } = await supabase.from('conversations').select('*').eq('id', id).maybeSingle()
      if (cancelled) return
      if (!conv) {
        setNotFound(true)
        setLoading(false)
        return
      }

      // Verify current user is a participant in this conversation
      if ((conv as any).user1_id !== uid && (conv as any).user2_id !== uid) {
        setNotFound(true)
        setLoading(false)
        return
      }

      const otherId = (conv as any).user1_id === uid ? (conv as any).user2_id : (conv as any).user1_id
      // Defensive: self-conversation shouldn't exist (prevented in post/[id].tsx)
      // but if it does, treat as not found rather than showing broken UI
      if (otherId === uid) {
        setNotFound(true)
        setLoading(false)
        return
      }
      const { data: profile } = await supabase.from('profiles').select('id, name, avatar_url, naapurusto').eq('id', otherId).maybeSingle()
      if (cancelled) return
      if (profile) {
        setOtherUser(profile as unknown as Profile)
      } else {
        setNotFound(true)
        setLoading(false)
        return
      }

      if ((conv as any).post_id) {
        const { data: postData } = await supabase
          .from('posts')
          .select('id, title, type, image_url')
          .eq('id', (conv as any).post_id)
          .maybeSingle()
        if (cancelled) return
        if (postData) setLinkedPost(postData as any)

        // Load pending offer for this conversation
        const { data: offerData } = await supabase
          .from('offers')
          .select('id, amount, message, from_user_id, status')
          .eq('conversation_id', id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (cancelled) return
        if (offerData) setPendingOffer(offerData as any)
      }

      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (cancelled) return
      const sorted = (msgs ?? []).reverse() as Message[]
      setMessages(sorted)
      setHasOlder((msgs ?? []).length >= PAGE_SIZE)
      if (sorted.length > 0) setShowQuickReplies(false)

      // Load reactions for these messages
      const msgIds = sorted.map(m => m.id)
      if (msgIds.length > 0) {
        try {
          const { data: rxns } = await supabase
            .from('message_reactions')
            .select('*')
            .in('message_id', msgIds)
          if (cancelled) return
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
      if (!cancelled) {
        const { error: markReadError } = await (supabase.from('messages') as any).update({ is_read: true })
          .eq('conversation_id', id)
          .neq('sender_id', uid)
          .eq('is_read', false)
        if (markReadError && __DEV__) console.warn('[conversation] mark-as-read failed:', markReadError.message)
      }

      if (!cancelled) setLoading(false)
    }
    if (id && isValidUUID(id)) {
      load()
    } else {
      // Invalid conversation ID — show not-found state
      setLoading(false)
      setNotFound(true)
    }
    return () => { cancelled = true }
  }, [id, supabase])

  // Realtime messages
  useEffect(() => {
    if (!id || !isValidUUID(id)) return
    const channel = supabase
      .channel(`conv-${id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${id}`,
      }, (payload) => {
        const newMsg = payload.new as Message
        const MAX_MESSAGES = 500
        setMessages(prev => {
          // Deduplicate: skip if message already exists (e.g., from reconnect replay)
          if (prev.some(m => m.id === newMsg.id)) return prev
          const next = [...prev, newMsg]
          return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next
        })
        // Auto-mark as read if from other user (use ref to avoid stale closure)
        if (userIdRef.current && newMsg.sender_id !== userIdRef.current) {
          ;(async () => { try { await (supabase.from('messages') as any).update({ is_read: true }).eq('id', newMsg.id) } catch {} })()
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
        if ((payload as any).payload?.userId !== userIdRef.current) {
          setOtherTyping(true)
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
          typingTimerRef.current = setTimeout(() => setOtherTyping(false), 3000)
        }
      })
      .subscribe()
    // Store channel ref so sendTyping can reuse it
    channelRef.current = channel
    return () => {
      channelRef.current = null
      supabase.removeChannel(channel)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    }
  }, [id, supabase]) // userId excluded — userIdRef.current used inside callback to avoid double-subscribe

  // Extra safety: clear typing timers on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current)
    }
  }, [])

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const loadOlder = useCallback(async () => {
    if (!hasOlder || loadingOlder || messagesRef.current.length === 0) return
    setLoadingOlder(true)
    try {
      const oldest = messagesRef.current[0]
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

      // Fetch reactions for older messages
      if (sorted.length > 0) {
        try {
          const olderMsgIds = sorted.map(m => m.id)
          const { data: olderReactions } = await supabase
            .from('message_reactions')
            .select('*')
            .in('message_id', olderMsgIds)
          if (olderReactions) {
            const grouped: Record<string, { emoji: string; user_id: string }[]> = {}
            for (const r of olderReactions as any[]) {
              if (!grouped[r.message_id]) grouped[r.message_id] = []
              grouped[r.message_id].push({ emoji: r.emoji, user_id: r.user_id })
            }
            setReactions(prev => ({ ...prev, ...grouped }))
          }
        } catch {} // message_reactions table may not exist
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoadingOlder(false)
    }
  }, [hasOlder, loadingOlder, id, supabase])

  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const sendTyping = useCallback(() => {
    if (!id || !userId || typingDebounceRef.current) return
    // Reuse the existing channel reference instead of creating a new one
    // supabase.channel() with the same name returns a NEW object, not the subscribed one
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast', event: 'typing',
        payload: { userId },
      }).catch(() => {})
    }
    typingDebounceRef.current = setTimeout(() => { typingDebounceRef.current = null }, 2000)
  }, [id, userId])

  const quickReplies = useMemo(() => [
    t('messages.quickHello') || 'Hei! Olen kiinnostunut.',
    t('messages.quickAvailable') || 'Onko vielä saatavilla?',
    t('messages.quickPickup') || 'Milloin voin noutaa?',
  ], [t])

  const myMessageCount = useMemo(() => messages.filter(m => m.sender_id === userId).length, [messages, userId])

  // 3c: Quick reply auto-send handler
  const handleQuickReply = useCallback(async (text: string) => {
    if (!userId || sending) return
    if (!await checkRateLimit('message')) {
      Alert.alert(t('common.error'), getRateLimitMessage('message', t))
      return
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    setSending(true)
    setShowQuickReplies(false)
    try {
      const { error } = await (supabase.from('messages') as any).insert({ conversation_id: id, sender_id: userId, content: text })
      if (error) throw error
      await (supabase.from('conversations') as any).update({ updated_at: new Date().toISOString() }).eq('id', id)
    } catch {
      Alert.alert(t('common.error'), t('messages.sendFailed'))
    } finally {
      setSending(false)
      if (typingDebounceRef.current) { clearTimeout(typingDebounceRef.current); typingDebounceRef.current = null }
    }
  }, [userId, id, supabase, sending, t])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !userId || sending) return
    if (!await checkRateLimit('message')) {
      Alert.alert(t('common.error'), getRateLimitMessage('message', t))
      return
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    setSending(true)
    setShowQuickReplies(false)
    const content = input.trim()
    setInput('')
    try {
      const { error } = await (supabase.from('messages') as any).insert({ conversation_id: id, sender_id: userId, content })
      if (error) throw error
      // Non-critical: update conversation timestamp for sort order. Don't restore input if only this fails.
      (supabase.from('conversations') as any).update({ updated_at: new Date().toISOString() }).eq('id', id).then(() => {}).catch(() => {})
    } catch (err) {
      setInput(content)
      Alert.alert(t('common.error'), t('messages.sendFailed'))
      if (__DEV__) console.error('[conversation] message send failed:', err)
    } finally {
      setSending(false)
      if (typingDebounceRef.current) { clearTimeout(typingDebounceRef.current); typingDebounceRef.current = null }
    }
  }, [input, userId, id, supabase, sending, t])

  const MAX_MSG_FILE_SIZE = 10 * 1024 * 1024 // 10MB

  const handleSendImage = useCallback(async () => {
    if (!userId) return
    if (!await checkRateLimit('message')) {
      Alert.alert(t('common.error'), getRateLimitMessage('message', t))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
    })
    if (result.canceled || !result.assets[0]) return
    setSending(true)
    try {
      const uri = result.assets[0].uri
      const response = await fetch(uri)
      const blob = await response.blob()
      const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      const mimeType = blob.type && ALLOWED_MIMES.includes(blob.type) ? blob.type : null
      if (!mimeType) { Alert.alert(t('common.error'), t('messages.imageSendFailed')); setSending(false); return }
      if (blob.size > MAX_MSG_FILE_SIZE) { Alert.alert(t('common.error'), t('messages.imageSendFailed')); setSending(false); return }
      const mimeSubtype = mimeType.split('/')[1]
      const ext = mimeSubtype === 'jpeg' ? 'jpg' : mimeSubtype
      const path = `messages/${id}/${Date.now()}.${ext}`
      const arrayBuffer = await blob.arrayBuffer()
      const { error: uploadError } = await supabase.storage.from('message-images').upload(path, arrayBuffer, { contentType: mimeType })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('message-images').getPublicUrl(path)
      const { error: msgError } = await (supabase.from('messages') as any).insert({
        conversation_id: id, sender_id: userId,
        content: '', image_url: urlData.publicUrl,
      })
      if (msgError) throw msgError
      await (supabase.from('conversations') as any).update({ updated_at: new Date().toISOString() }).eq('id', id)
    } catch (err) {
      Alert.alert(t('common.error'), t('messages.imageSendFailed'))
      if (__DEV__) console.error('[conversation] image send failed:', err)
    } finally {
      setSending(false)
      if (typingDebounceRef.current) { clearTimeout(typingDebounceRef.current); typingDebounceRef.current = null }
    }
  }, [userId, id, supabase, t])

  const handleLongPress = useCallback((messageId: string) => {
    setSelectedMessageId(messageId)
    setShowReactionPicker(true)
  }, [])

  const handleReaction = useCallback(async (emoji: string, messageId?: string) => {
    // Use explicit messageId if provided, otherwise fall back to selectedMessageId
    const targetId = messageId ?? selectedMessageId
    if (!targetId || !userId) return
    setShowReactionPicker(false)

    // Check if user already reacted with this emoji
    const existing = reactions[targetId]?.find(
      r => r.user_id === userId && r.emoji === emoji
    )

    if (existing) {
      // Remove reaction
      try {
        await (supabase.from('message_reactions') as any)
          .delete()
          .eq('message_id', targetId)
          .eq('user_id', userId)
          .eq('emoji', emoji)
      } catch {
        // Silently fail — reaction just won't be removed from server
      }
      setReactions(prev => ({
        ...prev,
        [targetId]: (prev[targetId] ?? []).filter(
          r => !(r.user_id === userId && r.emoji === emoji)
        ),
      }))
    } else {
      // Add reaction — optimistic update then revert on failure
      setReactions(prev => ({
        ...prev,
        [targetId]: [...(prev[targetId] ?? []), { emoji, user_id: userId }],
      }))
      try {
        await (supabase.from('message_reactions') as any).insert({
          message_id: targetId,
          user_id: userId,
          emoji,
        })
      } catch {
        // Revert optimistically added reaction on failure
        setReactions(prev => ({
          ...prev,
          [targetId]: (prev[targetId] ?? []).filter(
            r => !(r.user_id === userId && r.emoji === emoji)
          ),
        }))
      }
    }
    setSelectedMessageId(null)
  }, [selectedMessageId, userId, reactions, supabase])

  const handleDeleteMessage = useCallback(async () => {
    if (!selectedMessageId || !userId) return
    setShowReactionPicker(false)

    const msg = messagesRef.current.find(m => m.id === selectedMessageId)
    if (!msg || msg.sender_id !== userId) return

    const targetId = selectedMessageId
    setSelectedMessageId(null)

    Alert.alert(
      t('conversation.deleteMessage'),
      t('conversation.deleteMessageConfirm') ?? t('conversation.deleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('conversation.deleteMessage'),
          style: 'destructive',
          onPress: async () => {
            // Optimistic update
            setMessages(prev => prev.map(m =>
              m.id === targetId ? { ...m, is_deleted: true } as any : m
            ))
            try {
              const { error } = await (supabase.from('messages') as any)
                .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                .eq('id', targetId)
              if (error) throw error
            } catch {
              setMessages(prev => prev.map(m =>
                m.id === targetId ? { ...m, is_deleted: false } as any : m
              ))
              Alert.alert(t('common.error'), t('conversation.deleteFailed'))
            }
          },
        },
      ],
    )
  }, [selectedMessageId, userId, supabase, t])

  const handleOfferAction = useCallback(async (action: 'accepted' | 'rejected' | 'withdrawn') => {
    if (!pendingOffer) return
    const confirmKey = action === 'accepted' ? 'offer.acceptConfirm' : action === 'rejected' ? 'offer.rejectConfirm' : 'offer.withdrawConfirm'
    const amount = formatPrice(pendingOffer.amount, locale)
    Alert.alert(
      t(`offer.${action === 'withdrawn' ? 'withdraw' : action === 'accepted' ? 'accept' : 'reject'}`) ?? action,
      t(confirmKey, { amount }) ?? '',
      [
        { text: t('common.cancel') ?? 'Cancel', style: 'cancel' },
        {
          text: t('common.confirm') ?? 'OK',
          style: action === 'rejected' ? 'destructive' : 'default',
          onPress: async () => {
            setOfferLoading(true)
            try {
              await (supabase.from('offers') as any).update({ status: action, updated_at: new Date().toISOString() }).eq('id', pendingOffer.id)
              setPendingOffer(null)
              try { Haptics.notificationAsync(action === 'accepted' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning) } catch {}
            } catch {
              Alert.alert(t('common.error') ?? 'Error')
            } finally {
              setOfferLoading(false)
            }
          },
        },
      ]
    )
  }, [pendingOffer, supabase, t, locale])

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
    const isMine = item.sender_id === userId
    const prev = index > 0 ? messagesRef.current[index - 1] : null
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
          <View style={s.dayStampRow}>
            <View style={[s.dayStampLine, { backgroundColor: colors.border }]} />
            <Text style={[s.dateHeader, { color: colors.mutedForeground }]}>
              {formatDateHeader(item.created_at, locale).toUpperCase()}
            </Text>
            <View style={[s.dayStampLine, { backgroundColor: colors.border }]} />
          </View>
        )}
        <View style={[s.msgRow, isMine ? s.msgRowMine : s.msgRowTheirs]}>
          {!isMine && !sameAuthorAsPrev ? (
            <View style={{ marginTop: 2 }}>
              <Avatar url={otherUser?.avatar_url} name={otherUser?.name} size={28} />
            </View>
          ) : !isMine ? (
            <View style={{ width: 28 }} />
          ) : null}
          <PressableOpacity
            onLongPress={() => handleLongPress(item.id)}
            delayLongPress={400}
            style={{ maxWidth: '78%' }}
            accessibilityRole="text"
            accessibilityLabel={item.content || t('messages.imageMessageAlt')}
          >
            <View style={[
              s.bubble,
              isMine
                ? { backgroundColor: colors.foreground, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 6, borderBottomLeftRadius: 18 }
                : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 6 },
            ]} accessibilityRole="text">
              {isDeleted ? (
                <Text style={[s.msgText, s.deletedText, { color: isMine ? `${colors.background}88` : colors.mutedForeground }]}>
                  {t('conversation.messageDeleted')}
                </Text>
              ) : (
                <>
                  {item.image_url ? (
                    <Image source={{ uri: getImageUrl(item.image_url, 'medium')! }} style={s.msgImage} contentFit="cover" cachePolicy="memory-disk" />
                  ) : null}
                  {item.content ? (
                    <Text selectable style={[s.msgText, { color: isMine ? colors.background : colors.foreground }]}>{item.content}</Text>
                  ) : null}
                </>
              )}
              <View style={s.msgMeta}>
                <Text style={[s.msgTime, { color: isMine ? `${colors.background}99` : colors.mutedForeground }]}>
                  {formatTimeAgo(item.created_at, t, locale)}
                </Text>
                {/* 3d: Delivered/read indicators */}
                {isMine && (
                  item.is_read
                    ? <CheckCheck size={12} color={`${colors.background}99`} />
                    : <Check size={12} color={`${colors.background}66`} />
                )}
              </View>
            </View>
            {/* 3a: Link preview */}
            {!isDeleted && (() => {
              const url = extractUrl(item.content)
              if (!url) return null
              return (
                <PressableOpacity
                  onPress={() => { try { const u = new URL(url); if (['http:', 'https:'].includes(u.protocol)) Linking.openURL(url).catch(() => {}) } catch {} }}
                  style={[s.linkPreview, { backgroundColor: isDark ? colors.card : colors.muted, borderColor: colors.border }]}
                >
                  <ExternalLink size={14} color={colors.foreground} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.linkDomain, { color: colors.foreground }]} numberOfLines={1}>{getDomain(url)}</Text>
                    <Text style={[s.linkAction, { color: colors.foreground }]}>{t('messages.openLink')}</Text>
                  </View>
                </PressableOpacity>
              )
            })()}
            {/* Reactions display */}
            {groupedReactions.length > 0 && (
              <View style={[s.reactionsRow, isMine ? s.reactionsRowMine : s.reactionsRowTheirs]}>
                {groupedReactions.map((r) => (
                  <PressableOpacity
                    key={r.emoji}
                    onPress={() => handleReaction(r.emoji, item.id)}
                    style={[
                      s.reactionBadge,
                      { backgroundColor: isDark ? colors.card : colors.muted, borderColor: colors.border },
                      r.userReacted && { borderColor: colors.foreground, backgroundColor: isDark ? `${colors.foreground}22` : `${colors.foreground}15` },
                    ]}
                  >
                    <Text style={s.reactionEmoji}>{r.emoji}</Text>
                    {r.count > 1 && (
                      <Text style={[s.reactionCount, { color: colors.mutedForeground }]}>{r.count}</Text>
                    )}
                  </PressableOpacity>
                ))}
              </View>
            )}
          </PressableOpacity>
        </View>
      </View>
    )
  }, [userId, otherUser, colors, isDark, t, locale, reactions, handleLongPress, handleReaction])

  const handleCopyMessage = useCallback(async () => {
    if (!selectedMessageId) return
    const msg = messagesRef.current.find(m => m.id === selectedMessageId)
    if (!msg || (msg as any).is_deleted || !msg.content) return
    try {
      await Clipboard.setStringAsync(msg.content)
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    } catch { /* clipboard not available */ }
    setShowReactionPicker(false)
    setSelectedMessageId(null)
  }, [selectedMessageId])

  const selectedMsg = selectedMessageId ? messagesRef.current.find(m => m.id === selectedMessageId) : null
  const canDelete = selectedMsg?.sender_id === userId && !(selectedMsg as any)?.is_deleted
  const canCopy = selectedMsg && !(selectedMsg as any)?.is_deleted && !!selectedMsg.content

  // Conversation not found — invalid ID, deleted, or missing profile
  if (notFound && !loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <PressableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            style={[s.circleBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.back') ?? 'Go back'}
          >
            <ChevronLeft size={14} color={colors.foreground} strokeWidth={2.5} />
          </PressableOpacity>
          <Text style={[s.headerName, { color: colors.foreground }]}>{t('messages.title')}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: colors.foreground, textAlign: 'center', marginBottom: 8, fontFamily: fonts.bodyMedium }}>
            {t('messages.conversationNotFound') ?? 'Keskustelua ei löydy'}
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: 'center', marginBottom: 24, fontFamily: fonts.body }}>
            {t('messages.conversationNotFoundDesc') ?? 'Keskustelu on ehkä poistettu tai sitä ei ole olemassa.'}
          </Text>
          <PressableOpacity
            onPress={() => router.replace('/(tabs)/messages' as any)}
            style={{ backgroundColor: colors.foreground, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 }}
            accessibilityRole="button"
            accessibilityLabel={t('errors.backToMessages') ?? 'Back to messages'}
          >
            <Text style={{ color: colors.primaryForeground, fontSize: 14, fontWeight: '600', fontFamily: fonts.bodyMedium }}>
              {t('errors.backToMessages') ?? 'Back to messages'}
            </Text>
          </PressableOpacity>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header — Monochrome 06 */}
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={[s.circleBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.back') ?? 'Go back'}
          accessibilityHint={t('messages.backToConversations') ?? 'Returns to conversations list'}
        >
          <ChevronLeft size={14} color={colors.foreground} strokeWidth={2.5} />
        </PressableOpacity>
        <PressableOpacity onPress={() => otherUser?.id && router.push(`/profile/${otherUser.id}` as any)} hitSlop={8} accessibilityRole="button" accessibilityLabel={otherUser?.name ?? t('messages.unknownUser')}>
          <Avatar url={otherUser?.avatar_url} name={otherUser?.name} size={40} />
        </PressableOpacity>
        <PressableOpacity onPress={() => otherUser?.id && router.push(`/profile/${otherUser.id}` as any)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={otherUser?.name ?? t('messages.unknownUser')}>
          <Text style={[s.headerName, { color: colors.foreground }]} numberOfLines={1}>{otherUser?.name ?? t('messages.unknownUser')}</Text>
          {otherTyping && (
            <Text style={[s.headerSub, { color: colors.foreground }]}>{t('messages.typing')}</Text>
          )}
        </PressableOpacity>
        {otherUser && (
          <PressableOpacity
            onPress={() => setShowReportModal(true)}
            hitSlop={8}
            style={[s.circleBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('report.title')}
          >
            <Flag size={14} color={colors.foreground} strokeWidth={2} />
          </PressableOpacity>
        )}
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => item.id ?? `msg-${index}`}
        renderItem={renderMessage}
        contentContainerStyle={s.msgList}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
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
              <View style={[contextStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {linkedPost.image_url && (
                  <Image source={{ uri: getImageUrl(linkedPost.image_url, 'thumbnail')! }} style={contextStyles.image} contentFit="cover" cachePolicy="memory-disk" />
                )}
                <View style={contextStyles.info}>
                  <Text style={[contextStyles.eyebrow, { color: colors.mutedForeground }]}>
                    {(t('messages.aboutPost') ?? 'KESKUSTELETTE KOHTEESTA').toUpperCase()}
                  </Text>
                  <Text style={[contextStyles.title, { color: colors.foreground }]} numberOfLines={1}>{linkedPost.title}</Text>
                </View>
                <PressableOpacity
                  onPress={() => router.push(`/post/${linkedPost.id}`)}
                  hitSlop={8}
                  accessibilityRole="link"
                  accessibilityLabel={t('common.show') ?? 'Näytä'}
                >
                  <Text style={[contextStyles.showLink, { color: colors.foreground }]}>
                    {t('common.show') ?? 'Näytä'}
                  </Text>
                </PressableOpacity>
              </View>
            )}
            {pendingOffer && (
              <View style={[offerStyles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={offerStyles.bannerTop}>
                  <DollarSign size={16} color={colors.primary} strokeWidth={2} />
                  <Text style={[offerStyles.bannerAmount, { color: colors.foreground }]}>
                    {t('offer.pendingOffer', { amount: formatPrice(pendingOffer.amount, locale) }) ?? `Offer: ${pendingOffer.amount}`}
                  </Text>
                </View>
                {pendingOffer.message && (
                  <Text style={[offerStyles.bannerMsg, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {pendingOffer.message}
                  </Text>
                )}
                <View style={offerStyles.bannerActions}>
                  {pendingOffer.from_user_id === userId ? (
                    <PressableOpacity
                      onPress={() => handleOfferAction('withdrawn')}
                      style={[offerStyles.actionBtn, { borderColor: colors.border }]}
                      disabled={offerLoading}
                    >
                      <Text style={[offerStyles.actionText, { color: colors.mutedForeground }]}>
                        {t('offer.withdraw') ?? 'Withdraw'}
                      </Text>
                    </PressableOpacity>
                  ) : (
                    <>
                      <PressableOpacity
                        onPress={() => handleOfferAction('rejected')}
                        style={[offerStyles.actionBtn, { borderColor: colors.destructive }]}
                        disabled={offerLoading}
                      >
                        <XCircle size={14} color={colors.destructive} strokeWidth={1.8} />
                        <Text style={[offerStyles.actionText, { color: colors.destructive }]}>
                          {t('offer.reject') ?? 'Reject'}
                        </Text>
                      </PressableOpacity>
                      <PressableOpacity
                        onPress={() => handleOfferAction('accepted')}
                        style={[offerStyles.actionBtn, offerStyles.acceptBtn, { borderColor: colors.primary, backgroundColor: colors.primary }]}
                        disabled={offerLoading}
                      >
                        <CheckCircle size={14} color="#fff" strokeWidth={1.8} />
                        <Text style={[offerStyles.actionText, { color: '#fff' }]}>
                          {t('offer.accept') ?? 'Accept'}
                        </Text>
                      </PressableOpacity>
                    </>
                  )}
                </View>
              </View>
            )}
            {hasOlder ? (
              <PressableOpacity onPress={loadOlder} style={[s.loadOlderBtn, { borderColor: colors.border }]}>
                <Text style={[s.loadOlderText, { color: colors.foreground }]}>
                  {loadingOlder ? t('common.loading') : t('conversation.loadOlder')}
                </Text>
              </PressableOpacity>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('messages.noMessagesYet')}</Text>
        }
      />

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <PressableOpacity
          onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
          style={[s.scrollBtn, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.foreground, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }]}
        >
          <ChevronDown size={20} color={colors.foreground} />
        </PressableOpacity>
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
          <View style={[s.reactionPickerContainer, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.foreground, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 }]}>
            <View style={s.reactionPickerRow}>
              {QUICK_REACTIONS.map((emoji) => (
                <PressableOpacity
                  key={emoji}
                  onPress={() => handleReaction(emoji)}
                  style={s.reactionPickerItem}
                >
                  <Text style={s.reactionPickerEmoji}>{emoji}</Text>
                </PressableOpacity>
              ))}
            </View>
            {canCopy && (
              <PressableOpacity onPress={handleCopyMessage} style={[s.deleteRow, { borderTopColor: colors.border }]}>
                <Copy size={16} color={colors.foreground} />
                <Text style={[s.deleteText, { color: colors.foreground }]}>{t('conversation.copyMessage') ?? 'Kopioi'}</Text>
              </PressableOpacity>
            )}
            {canDelete && (
              <PressableOpacity onPress={handleDeleteMessage} style={[s.deleteRow, { borderTopColor: colors.border }]}>
                <Trash2 size={16} color={colors.destructive} />
                <Text style={[s.deleteText, { color: colors.destructive }]}>{t('conversation.deleteMessage')}</Text>
              </PressableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* 3c: Quick Replies — Monochrome pills */}
      {myMessageCount === 0 && showQuickReplies && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, maxHeight: 48 }}
          contentContainerStyle={s.quickRepliesRow}
          keyboardShouldPersistTaps="handled"
        >
          {quickReplies.map((reply, i) => (
            <PressableOpacity
              key={i}
              onPress={() => { setInput(reply); setShowQuickReplies(false) }}
              style={[s.quickReplyChip, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={`${t('messages.quickReply') ?? 'Quick reply'}: ${reply}`}
            >
              <Text style={[s.quickReplyText, { color: colors.foreground }]}>{reply}</Text>
            </PressableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Composer — Monochrome 06 */}
      <View style={[s.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom > 0 ? insets.bottom : 20 }]}>
        <PressableOpacity
          onPress={handleSendImage}
          style={[s.composerCircle, { backgroundColor: colors.background, borderColor: colors.border }]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('messages.attachImage') ?? 'Attach image'}
        >
          <Plus size={16} color={colors.foreground} strokeWidth={2} />
        </PressableOpacity>
        <TextInput
          style={[s.textInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
          value={input}
          onChangeText={(text) => { setInput(text); if (text.length > 0) setShowQuickReplies(false); sendTyping() }}
          placeholder={t('messages.sendPlaceholder')}
          placeholderTextColor={colors.tertiaryForeground}
          multiline
          maxLength={2000}
          blurOnSubmit={false}
          inputAccessoryViewID={KEYBOARD_DONE_ID}
          accessibilityLabel={t('messages.sendPlaceholder')}
        />
        <PressableOpacity
          onPress={handleSend}
          disabled={!input.trim() || sending}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('messages.send')}
          accessibilityState={{ busy: sending, disabled: !input.trim() || sending }}
          style={[s.sendBtn, { backgroundColor: colors.foreground, opacity: !input.trim() && !sending ? 0.35 : 1 }]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Send size={14} color={colors.background} />
          )}
        </PressableOpacity>
      </View>

      {/* Report Modal */}
      {otherUser && (
        <ReportModal
          visible={showReportModal}
          onClose={() => setShowReportModal(false)}
          type="user"
          targetId={otherUser.id}
        />
      )}
      <KeyboardDoneAccessory />
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  // ── Header — Monochrome 06 (surface bg, 1px bottom border) ──
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  circleBtn: {
    width: 36, height: 36, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  headerName: { fontSize: 14.5, fontWeight: '600', lineHeight: 20, letterSpacing: -0.15, fontFamily: fonts.bodySemi },
  headerSub: { fontSize: 11, lineHeight: 16, fontFamily: fonts.body },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  onlineDot: { width: 6, height: 6, borderRadius: 999 },
  onlineText: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14 },
  // ── Messages ────────────────────────────────────────────────
  msgList: { padding: 16, gap: 3, flexGrow: 1 },
  dayStampRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginVertical: 12,
  },
  dayStampLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dateHeader: {
    fontSize: 10.5, fontWeight: '500', letterSpacing: 0.9,
    fontFamily: fonts.bodyMedium, textTransform: 'uppercase',
  },
  msgRow: { flexDirection: 'row', gap: 8, marginVertical: 3 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, marginTop: 2 },
  bubble: { maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 10 },
  msgImage: { width: 200, height: 150, borderRadius: 14, marginBottom: 4 },
  msgText: { fontSize: 13.5, lineHeight: 19, letterSpacing: -0.05, fontFamily: fonts.body },
  deletedText: { fontStyle: 'italic' },
  msgMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 4 },
  msgTime: { fontSize: 10.5, lineHeight: 14, fontFamily: fonts.body },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionsRowMine: { justifyContent: 'flex-end' },
  reactionsRowTheirs: { justifyContent: 'flex-start' },
  reactionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1,
  },
  reactionEmoji: { fontSize: 14, lineHeight: 20 },
  reactionCount: { fontSize: 11, lineHeight: 14, fontFamily: fonts.body },
  loadOlderBtn: { alignSelf: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 16 },
  loadOlderText: { fontSize: 13, fontWeight: '500', lineHeight: 18, fontFamily: fonts.bodyMedium },
  // ── Scroll to bottom ───────────────────────────────────────
  scrollBtn: {
    position: 'absolute', right: 16, bottom: 80,
    width: 40, height: 40, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, elevation: 3,
  },
  // ── Reaction picker modal ──────────────────────────────────
  modalOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  reactionPickerContainer: {
    borderRadius: 20, borderWidth: 1, overflow: 'hidden',
    elevation: 8,
  },
  reactionPickerRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 4,
  },
  reactionPickerItem: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  reactionPickerEmoji: { fontSize: 24, lineHeight: 32 },
  deleteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth,
  },
  deleteText: { fontSize: 14, fontWeight: '500', lineHeight: 20, fontFamily: fonts.bodyMedium },
  // ── Composer — Monochrome 06 (circle add 40px + pill input 42px + circle send 40px) ──
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 0,
  },
  composerCircle: {
    width: 40, height: 40, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, flexShrink: 0,
  },
  textInput: {
    flex: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 13.5, maxHeight: 120, minHeight: 42, fontFamily: fonts.body,
    borderWidth: 1,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  emptyText: { textAlign: 'center', fontSize: 13, lineHeight: 18, marginTop: 40, fontFamily: fonts.body },
  // ── Quick replies — Monochrome pills (borderRadius 999, surface bg, 1px border) ──
  quickRepliesRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  quickReplyChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1,
  },
  quickReplyText: { fontSize: 12.5, fontWeight: '500', lineHeight: 18, fontFamily: fonts.bodyMedium },
  // ── Link preview ────────────────────────────────────────────
  linkPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 4, padding: 8, borderRadius: 14, borderWidth: 1,
    maxWidth: '100%',
  },
  linkDomain: { fontSize: 12, fontWeight: '600', lineHeight: 16, fontFamily: fonts.bodySemi },
  linkAction: { fontSize: 11, lineHeight: 14, fontFamily: fonts.body },
})

const contextStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginVertical: 8, padding: 10,
    borderRadius: 20, borderWidth: 1,
  },
  image: { width: 46, height: 46, borderRadius: 12 },
  info: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: { fontSize: 10, fontWeight: '500', letterSpacing: 0.9, textTransform: 'uppercase', fontFamily: fonts.bodyMedium, lineHeight: 14 },
  title: { fontSize: 13, fontWeight: '600', lineHeight: 18, letterSpacing: -0.1, fontFamily: fonts.bodySemi },
  showLink: { fontSize: 11, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 16, textDecorationLine: 'underline' },
})

const offerStyles = StyleSheet.create({
  banner: {
    marginHorizontal: 16, marginTop: 4, marginBottom: 8, padding: 12,
    borderRadius: 16, borderWidth: 1, gap: 8,
  },
  bannerTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerAmount: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  bannerMsg: { fontSize: 12, fontFamily: fonts.body, lineHeight: 16 },
  bannerActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
    minHeight: 32,
  },
  acceptBtn: { borderWidth: 0 },
  actionText: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 16 },
})

export default function ConversationScreen() {
  return (
    <ScreenErrorBoundary screenName="Conversation">
      <ConversationScreenInner />
    </ScreenErrorBoundary>
  )
}
