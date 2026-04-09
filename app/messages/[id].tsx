declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, FlatList, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Modal, ScrollView, Alert, Linking } from 'react-native'
import { PressableOpacity } from '@/components/ui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { ArrowLeft, Send, ImageIcon, ChevronDown, ChevronRight, CheckCheck, Check, Trash2, Copy, Flag, ExternalLink } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import * as Clipboard from 'expo-clipboard'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { Avatar } from '@/components/Avatar'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo, formatDateHeader } from '@/lib/format'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { ReportModal } from '@/components/ReportModal'
import { isValidUUID } from '@/lib/validation'
import { checkRateLimit, getRateLimitMessage } from '@/lib/rateLimiter'
import { getImageUrl } from '@/lib/imageUtils'
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

  // Reaction & deletion state
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [showReactionPicker, setShowReactionPicker] = useState(false)
  const [reactions, setReactions] = useState<Record<string, { emoji: string; user_id: string }[]>>({})

  // Report modal state
  const [showReportModal, setShowReportModal] = useState(false)

  // TODO: UX — Handle self-conversation edge case. If user1_id === user2_id (user
  // messages their own post), otherId will be themselves. Should either prevent
  // self-conversations at creation time (in post/[id].tsx) or display a "notes to
  // self" UI instead of a broken "unknown user" state.
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setNotFound(false)

      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) { setLoading(false); setNotFound(true); return }
      setUserId(user.id)

      const { data: conv } = await supabase.from('conversations').select('*').eq('id', id).maybeSingle()
      if (cancelled) return
      if (!conv) {
        setNotFound(true)
        setLoading(false)
        return
      }

      // Verify current user is a participant in this conversation
      if ((conv as any).user1_id !== user.id && (conv as any).user2_id !== user.id) {
        setNotFound(true)
        setLoading(false)
        return
      }

      const otherId = (conv as any).user1_id === user.id ? (conv as any).user2_id : (conv as any).user1_id
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
        await (supabase.from('messages') as any).update({ is_read: true })
          .eq('conversation_id', id)
          .neq('sender_id', user.id)
          .eq('is_read', false)
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
  }, [id, userId, supabase])

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
    t('messages.quickReplyThanks'),
    t('messages.quickReplyOk'),
    t('messages.quickReplyWhen'),
  ], [t])

  // 3c: Quick reply auto-send handler
  const handleQuickReply = useCallback(async (text: string) => {
    if (!userId || sending) return
    if (!await checkRateLimit('message')) {
      Alert.alert(t('common.error'), getRateLimitMessage('message'))
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
      Alert.alert(t('common.error'), getRateLimitMessage('message'))
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
      await (supabase.from('conversations') as any).update({ updated_at: new Date().toISOString() }).eq('id', id)
    } catch (err) {
      setInput(content)
      Alert.alert(t('common.error'), t('messages.sendFailed'))
      if (__DEV__) console.error('[conversation] message send failed:', err)
    } finally {
      setSending(false)
      if (typingDebounceRef.current) { clearTimeout(typingDebounceRef.current); typingDebounceRef.current = null }
    }
  }, [input, userId, id, supabase, sending, t])

  const ALLOWED_MSG_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif']
  const MAX_MSG_FILE_SIZE = 10 * 1024 * 1024 // 10MB

  const handleSendImage = useCallback(async () => {
    if (!userId) return
    if (!await checkRateLimit('message')) {
      Alert.alert(t('common.error'), getRateLimitMessage('message'))
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
      const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase()
      if (!ALLOWED_MSG_EXTS.includes(ext)) { Alert.alert(t('common.error'), t('messages.imageSendFailed')); setSending(false); return }
      const path = `messages/${id}/${Date.now()}.${ext}`
      const response = await fetch(uri)
      const blob = await response.blob()
      if (blob.size > MAX_MSG_FILE_SIZE) { Alert.alert(t('common.error'), t('messages.imageSendFailed')); setSending(false); return }
      const arrayBuffer = await blob.arrayBuffer()
      const { error: uploadError } = await supabase.storage.from('message-images').upload(path, arrayBuffer, { contentType: `image/${ext}` })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('message-images').getPublicUrl(path)
      await (supabase.from('messages') as any).insert({
        conversation_id: id, sender_id: userId,
        content: '', image_url: urlData.publicUrl,
      })
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
          <Text style={[s.dateHeader, { color: colors.mutedForeground }]}>
            {formatDateHeader(item.created_at, locale)}
          </Text>
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
                ? [s.bubbleMine, { backgroundColor: colors.primary }]
                : [s.bubbleTheirs, { backgroundColor: isDark ? colors.card : colors.muted }],
            ]}>
              {isDeleted ? (
                <Text style={[s.msgText, s.deletedText, { color: isMine ? `${colors.primaryForeground}88` : colors.mutedForeground }]}>
                  {t('conversation.messageDeleted')}
                </Text>
              ) : (
                <>
                  {item.image_url ? (
                    <Image source={{ uri: getImageUrl(item.image_url, 'medium')! }} style={s.msgImage} contentFit="cover" cachePolicy="memory-disk" />
                  ) : null}
                  {item.content ? (
                    <Text selectable style={[s.msgText, { color: isMine ? colors.primaryForeground : colors.foreground }]}>{item.content}</Text>
                  ) : null}
                </>
              )}
              <View style={s.msgMeta}>
                <Text style={[s.msgTime, { color: isMine ? `${colors.primaryForeground}99` : colors.mutedForeground }]}>
                  {formatTimeAgo(item.created_at, t, locale)}
                </Text>
                {/* 3d: Delivered/read indicators */}
                {isMine && (
                  item.is_read
                    ? <CheckCheck size={12} color={`${colors.primaryForeground}99`} />
                    : <Check size={12} color={`${colors.primaryForeground}66`} />
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
                  <ExternalLink size={14} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.linkDomain, { color: colors.foreground }]} numberOfLines={1}>{getDomain(url)}</Text>
                    <Text style={[s.linkAction, { color: colors.primary }]}>{t('messages.openLink')}</Text>
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
                      r.userReacted && { borderColor: colors.primary, backgroundColor: isDark ? `${colors.primary}22` : `${colors.primary}15` },
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
        <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: `${colors.card}F8`, borderBottomColor: colors.border }]}>
          <PressableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={t('common.back') ?? 'Go back'}
          >
            <ArrowLeft size={24} color={colors.foreground} />
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
            style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('errors.backToMessages') ?? 'Back to messages'}
          >
            <Text style={{ color: colors.primaryForeground, fontSize: 14, fontWeight: '600', fontFamily: fonts.bodyMedium }}>
              {t('errors.backToMessages') ?? 'Takaisin viesteihin'}
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
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: `${colors.card}F8`, borderBottomColor: colors.border }]}>
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back') ?? 'Go back'}
          accessibilityHint={t('messages.backToConversations') ?? 'Returns to conversations list'}
        >
          <ArrowLeft size={24} color={colors.foreground} />
        </PressableOpacity>
        <PressableOpacity onPress={() => otherUser?.id && router.push(`/profile/${otherUser.id}` as any)} hitSlop={8} accessibilityRole="button" accessibilityLabel={otherUser?.name ?? t('messages.unknownUser')}>
          <Avatar url={otherUser?.avatar_url} name={otherUser?.name} size={36} />
        </PressableOpacity>
        <PressableOpacity onPress={() => otherUser?.id && router.push(`/profile/${otherUser.id}` as any)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={otherUser?.name ?? t('messages.unknownUser')}>
          <Text style={[s.headerName, { color: colors.foreground }]} numberOfLines={1}>{otherUser?.name ?? t('messages.unknownUser')}</Text>
          {otherTyping ? (
            <Text style={[s.headerSub, { color: colors.primary }]}>{t('messages.typing')}</Text>
          ) : otherUser?.naapurusto ? (
            <Text style={[s.headerSub, { color: colors.mutedForeground }]}>{otherUser.naapurusto}</Text>
          ) : null}
        </PressableOpacity>
        {otherUser && (
          <PressableOpacity
            onPress={() => setShowReportModal(true)}
            hitSlop={8}
            style={{ padding: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('report.title')}
          >
            <Flag size={18} color={colors.mutedForeground} strokeWidth={1.8} />
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
              <PressableOpacity
                onPress={() => router.push(`/post/${linkedPost.id}`)}
                style={[contextStyles.card, { backgroundColor: isDark ? colors.card : colors.muted }]}
              >
                {linkedPost.image_url && (
                  <Image source={{ uri: getImageUrl(linkedPost.image_url, 'thumbnail')! }} style={contextStyles.image} contentFit="cover" cachePolicy="memory-disk" />
                )}
                <View style={contextStyles.info}>
                  <Text style={[contextStyles.label, { color: colors.mutedForeground }]}>{t('messages.aboutPost')}</Text>
                  <Text style={[contextStyles.title, { color: colors.foreground }]} numberOfLines={1}>{linkedPost.title}</Text>
                </View>
                <ChevronRight size={14} color={colors.mutedForeground} />
              </PressableOpacity>
            )}
            {hasOlder ? (
              <PressableOpacity onPress={loadOlder} style={[s.loadOlderBtn, { borderColor: colors.border }]}>
                <Text style={[s.loadOlderText, { color: colors.primary }]}>
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

      {/* 3c: Quick Replies — auto-send on tap */}
      {showQuickReplies && (
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
              onPress={() => handleQuickReply(reply)}
              style={[s.quickReplyChip, { backgroundColor: isDark ? colors.card : colors.muted, borderWidth: 1, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={`${t('messages.quickReply') ?? 'Quick reply'}: ${reply}`}
            >
              <Text style={[s.quickReplyText, { color: colors.foreground }]}>{reply}</Text>
              <Send size={11} color={colors.primary} />
            </PressableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Input */}
      <View style={[s.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
        <PressableOpacity
          onPress={handleSendImage}
          style={s.imageBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('messages.attachImage') ?? 'Attach image'}
        >
          <ImageIcon size={22} color={colors.mutedForeground} />
        </PressableOpacity>
        <TextInput
          style={[s.textInput, { backgroundColor: colors.muted, color: colors.foreground }]}
          value={input}
          onChangeText={(text) => { setInput(text); if (text.length > 0) setShowQuickReplies(false); sendTyping() }}
          placeholder={t('messages.sendPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={2000}
          blurOnSubmit={false}
        />
        <PressableOpacity
          onPress={handleSend}
          disabled={!input.trim() || sending}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('messages.send')}
          style={[s.sendBtn, { backgroundColor: input.trim() ? colors.primary : colors.muted, opacity: (!input.trim() || sending) ? 0.5 : 1 }]}
        >
          <Send size={18} color={input.trim() ? colors.primaryForeground : colors.mutedForeground} />
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
  headerName: { fontSize: 14, fontWeight: '600', lineHeight: 20, fontFamily: fonts.bodyMedium },
  headerSub: { fontSize: 12, lineHeight: 16, fontFamily: fonts.body },
  msgList: { padding: 16, gap: 4, flexGrow: 1 },
  dateHeader: { fontSize: 12, fontWeight: '500', lineHeight: 16, textAlign: 'center', marginVertical: 16, fontFamily: fonts.bodyMedium },
  msgRow: { flexDirection: 'row', gap: 8, marginVertical: 4 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgRowTheirs: { justifyContent: 'flex-start' },
  msgAvatar: { width: 28, height: 28, borderRadius: 14, marginTop: 2 },
  bubble: { maxWidth: '100%', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleTheirs: { borderBottomLeftRadius: 4 },
  msgImage: { width: 200, height: 150, borderRadius: 12, marginBottom: 4 },
  msgText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  deletedText: { fontStyle: 'italic' },
  msgMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 4 },
  msgTime: { fontSize: 11, lineHeight: 14, fontFamily: fonts.body },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionsRowMine: { justifyContent: 'flex-end' },
  reactionsRowTheirs: { justifyContent: 'flex-start' },
  reactionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1,
  },
  reactionEmoji: { fontSize: 14, lineHeight: 20 },
  reactionCount: { fontSize: 11, lineHeight: 14, fontFamily: fonts.body },
  loadOlderBtn: { alignSelf: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 16 },
  loadOlderText: { fontSize: 13, fontWeight: '500', lineHeight: 18, fontFamily: fonts.bodyMedium },
  scrollBtn: {
    position: 'absolute', right: 16, bottom: 80,
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, elevation: 3,
  },
  modalOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  reactionPickerContainer: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden',
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
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth,
  },
  imageBtn: { paddingBottom: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  textInput: {
    flex: 1, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, maxHeight: 120, minHeight: 40, fontFamily: fonts.body,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { textAlign: 'center', fontSize: 14, lineHeight: 20, marginTop: 40, fontFamily: fonts.body },
  quickRepliesRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  quickReplyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 16,
  },
  quickReplyText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
  // 3a: Link preview styles
  linkPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 4, padding: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  linkDomain: { fontSize: 12, fontWeight: '500', lineHeight: 16, fontFamily: fonts.bodySemi },
  linkAction: { fontSize: 11, lineHeight: 14, fontFamily: fonts.body },
})

const contextStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginVertical: 8, padding: 12,
    borderRadius: 12,
  },
  image: { width: 40, height: 40, borderRadius: 8 },
  info: { flex: 1, gap: 4 },
  label: { fontSize: 11, lineHeight: 14, fontFamily: fonts.body, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 13, lineHeight: 18, fontFamily: fonts.bodySemi },
})

export default function ConversationScreen() {
  return (
    <ScreenErrorBoundary screenName="Conversation">
      <ConversationScreenInner />
    </ScreenErrorBoundary>
  )
}
