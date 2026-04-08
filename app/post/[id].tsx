declare const __DEV__: boolean

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet, ActivityIndicator, TextInput, FlatList, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import {
  ArrowLeft, MapPin, Heart, Bookmark, Share2, MessageCircle, Crown,
  Send, Flag, Clock, TrendingUp,
  MoreHorizontal, X, Calendar, Pencil, Trash2, XCircle, Reply, ChevronDown, ChevronUp,
  ShoppingBag,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { shareContent } from '@/lib/share'
import { triggerPush } from '@/lib/pushTrigger'
import { usePriceSuggestion } from '@/hooks/usePriceSuggestion'
import { ReportModal } from '@/components/ReportModal'
import { Avatar } from '@/components/Avatar'
import { CATEGORIES, POST_SELECT, SERVICE_FEE_RATE } from '@/lib/constants'
import { applyLocationAccuracy } from '@/lib/privacyUtils'
import { FEATURES } from '@/lib/featureFlags'
import { formatTimeAgo, formatPrice, formatEventDate } from '@/lib/format'
import { useStripePayment } from '@/hooks/useStripePayment'
import { useTrustLevel } from '@/hooks/useTrustLevel'
import { TrustBadge } from '@/components/TrustBadge'
import { computeTrustLevelFromBadges } from '@/lib/trustUtils'
import DateRangePicker from '@/components/DateRangePicker'
import ImageGallery from '@/components/ImageGallery'
import { CATEGORY_ICON_MAP } from '@/lib/categoryIcons'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PostDetailSkeleton } from '@/components/SkeletonLoaders'
import { isValidUUID } from '@/lib/validation'
import { checkAndAwardSpeedBadge } from '@/lib/speedBadges'
import { trackEvent } from '@/lib/analytics'
import { getCachedUserId } from '@/lib/authCache'
import { checkRateLimit, getRateLimitMessage } from '@/lib/rateLimiter'
import { useBoosts } from '@/hooks/useBoosts'
import { BoostBadge } from '@/components/BoostBadge'
import { ModalCloseButton, PressableOpacity } from '@/components/ui'
import { getImageUrl } from '@/lib/imageUtils'
import type { Post, PostType, PostComment } from '@/lib/types'

function PostDetailScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()

  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [isLiked, setIsLiked] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [comments, setComments] = useState<PostComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [relatedPosts, setRelatedPosts] = useState<{ id: string; type: string; title: string; image_url: string | null; location: string | null; created_at: string }[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const likingRef = useRef(false)
  const savingRef = useRef(false)
  const messagingRef = useRef(false)

  // Report modal state
  const [reportModalVisible, setReportModalVisible] = useState(false)

  // Likers modal state
  const [showLikersModal, setShowLikersModal] = useState(false)
  const [likers, setLikers] = useState<{ id: string; name: string; avatar_url: string | null }[]>([])
  const [loadingLikers, setLoadingLikers] = useState(false)

  // Image gallery state
  const [galleryVisible, setGalleryVisible] = useState(false)
  const [galleryInitialIndex, setGalleryInitialIndex] = useState(0)

  // Reply state for threaded comments
  const [replyToComment, setReplyToComment] = useState<PostComment | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())

  // Booking modal state
  const [bookingModalVisible, setBookingModalVisible] = useState(false)
  const [bookingStartDate, setBookingStartDate] = useState<string | null>(null)
  const [bookingEndDate, setBookingEndDate] = useState<string | null>(null)
  const [sendingBooking, setSendingBooking] = useState(false)
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const { createPayment, loading: paymentLoading, error: paymentError } = useStripePayment()
  const trust = useTrustLevel(userId)

  // Price suggestion context for buyers
  const { suggestion: priceContext } = usePriceSuggestion(
    post?.type ?? null,
    post?.tags ?? [],
    (post as any)?.user?.naapurusto ?? null,
  )

  // Service booking state (for tarjoan posts with service_price)
  const [serviceModalVisible, setServiceModalVisible] = useState(false)
  const [serviceNotes, setServiceNotes] = useState('')
  const [sendingService, setSendingService] = useState(false)

  const loadPost = useCallback(async () => {
    if (!id || !isValidUUID(id)) { setLoading(false); setRefreshing(false); setLoadError(t('post.notFound') ?? 'Post not found'); return }

    try {
      setLoadError(null)

      const cachedId = await getCachedUserId()
      if (cachedId) setUserId(cachedId)

      const { data } = await supabase.from('posts').select(POST_SELECT).eq('id', id).single()
      if (data) {
        const p = data as unknown as Post
        // Apply location_accuracy privacy for other users' posts
        const accuracy = (p.user as any)?.location_accuracy
        if (accuracy && accuracy !== 'exact' && cachedId !== p.user_id) {
          const result = applyLocationAccuracy(accuracy, (p as any).latitude, (p as any).longitude, p.location)
          ;(p as any).latitude = result.latitude
          ;(p as any).longitude = result.longitude
          p.location = result.location
        }
        setPost(p)
        setLikeCount(p.like_count ?? 0)
        trackEvent('post_viewed', { post_id: id as string, type: p.type })
      }

      if (cachedId) {
        const [likeRes, saveRes] = await Promise.all([
          supabase.from('post_likes').select('id').eq('post_id', id).eq('user_id', cachedId).maybeSingle(),
          supabase.from('saved_posts').select('id').eq('post_id', id).eq('user_id', cachedId).maybeSingle(),
        ])
        setIsLiked(!!likeRes.data)
        setIsSaved(!!saveRes.data)
      }

      // Fetch comments (including parent_id for threading)
      const { data: cmts } = await supabase
        .from('post_comments')
        .select('*, user:profiles!post_comments_user_id_fkey(id, name, avatar_url)')
        .eq('post_id', id)
        .order('created_at', { ascending: true })
      setComments((cmts ?? []).map((c: any) => ({ ...c, parent_id: c.parent_id ?? null })) as unknown as PostComment[])

      if (data) {
        const { data: related } = await supabase
          .from('posts')
          .select('id, type, title, image_url, location, created_at')
          .eq('type', (data as any).type)
          .eq('is_active', true)
          .neq('id', id)
          .order('created_at', { ascending: false })
          .limit(4)
        setRelatedPosts((related ?? []) as any[])
      }
    } catch (err: any) {
      if (__DEV__) console.error('[PostDetail] loadPost error:', err)
      setLoadError(t('common.error'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [id, supabase, t])

  useEffect(() => {
    let cancelled = false
    loadPost().then(() => { if (cancelled) return })
    return () => { cancelled = true }
  }, [loadPost])

  useEffect(() => {
    if (!id || !isValidUUID(id)) return
    const channel = supabase
      .channel(`comments-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_comments', filter: `post_id=eq.${id}` }, async (payload) => {
        const raw = payload.new as any
        const newComment: PostComment = { ...raw, parent_id: raw.parent_id ?? null }
        // Realtime payloads don't include joined .user data — fetch it
        if (!newComment.user && raw.user_id) {
          try {
            const { data: userProfile } = await supabase
              .from('profiles')
              .select('id, name, avatar_url')
              .eq('id', raw.user_id)
              .single()
            if (userProfile) {
              (newComment as any).user = userProfile
            }
          } catch {
            // Fallback: comment renders without user name
          }
        }
        setComments(prev => {
          // Deduplicate: skip if comment already exists (e.g., from reconnect replay)
          if (prev.some(c => c.id === newComment.id)) return prev
          return [...prev, newComment]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, supabase])

  const toggleLike = useCallback(async () => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (post?.user_id === userId) return
    if (likingRef.current) return
    likingRef.current = true
    try {
      const wasLiked = isLiked
      const prevCount = likeCount

      // Optimistic update
      setIsLiked(!wasLiked)
      setLikeCount(wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1)

      // Single DB operation
      const { error } = wasLiked
        ? await (supabase.from('post_likes') as any).delete().eq('post_id', id).eq('user_id', userId)
        : await (supabase.from('post_likes') as any).insert({ post_id: id, user_id: userId })

      if (error) {
        if (__DEV__) console.warn('[post] like failed:', error.message, error.code)
        setIsLiked(wasLiked)
        setLikeCount(prevCount)
        // Duplicate key = already liked, re-sync
        if (error.code === '23505') setIsLiked(true)
      } else {
        // Sync count from source of truth
        const { count: realCount } = await supabase.from('post_likes').select('*', { count: 'exact', head: true }).eq('post_id', id)
        if (realCount !== null) {
          setLikeCount(realCount)
          ;(supabase.from('posts') as any).update({ like_count: realCount }).eq('id', id).then(() => {}).catch(() => {})
        }
        // Notification (fire-and-forget)
        if (!wasLiked && post?.user_id && post.user_id !== userId) {
          ;(supabase.from('notifications') as any).insert({
            user_id: post.user_id, from_user_id: userId,
            type: 'post_like', title: t('post.liked'),
            body: post.title, link_type: 'post', link_id: id,
          }).then(() => {}).catch(() => {})
        }
      }
    } finally { likingRef.current = false }
  }, [userId, isLiked, likeCount, id, supabase, router, post, t])

  const toggleSave = useCallback(async () => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (savingRef.current) return
    savingRef.current = true
    try {
      const wasSaved = isSaved
      if (wasSaved) {
        setIsSaved(false)
        const { error } = await (supabase.from('saved_posts') as any).delete().eq('post_id', id).eq('user_id', userId)
        if (error) { setIsSaved(wasSaved) }
      } else {
        setIsSaved(true)
        const { error } = await (supabase.from('saved_posts') as any).insert({ post_id: id, user_id: userId })
        if (error) {
          if (error.code === '23505') { /* already saved */ }
          else { setIsSaved(wasSaved) }
        }
      }
    } finally { savingRef.current = false }
  }, [userId, isSaved, id, supabase, router])

  const handleMessage = useCallback(async () => {
    if (messagingRef.current) return
    if (!userId) { router.push('/(auth)/login'); return }
    if (!post) return
    if (post.user_id === userId) { Alert.alert(t('common.error'), t('post.cannotMessageSelf')); return }
    if (!isValidUUID(userId) || !isValidUUID(post.user_id)) return
    messagingRef.current = true
    try {
      // Find ANY existing conversation between these two users
      const { data: existing, error: findError } = await supabase
        .from('conversations').select('id')
        .or(`and(user1_id.eq.${userId},user2_id.eq.${post.user_id}),and(user1_id.eq.${post.user_id},user2_id.eq.${userId})`)
        .maybeSingle()
      if (findError) { Alert.alert(t('common.error'), t('messages.conversationCreateFailed')); return }
      if (existing) {
        router.push(`/messages/${(existing as any).id}`)
      } else {
        const { data: newConv, error: insertError } = await (supabase.from('conversations') as any)
          .insert({ user1_id: userId, user2_id: post.user_id, post_id: id }).select('id').single()
        if (insertError?.code === '23505') {
          // Unique constraint violation — race condition, re-query existing conversation
          const { data: existingConv } = await supabase
            .from('conversations').select('id')
            .or(`and(user1_id.eq.${userId},user2_id.eq.${post.user_id}),and(user1_id.eq.${post.user_id},user2_id.eq.${userId})`)
            .maybeSingle()
          if (existingConv) { router.push(`/messages/${(existingConv as any).id}`); return }
          Alert.alert(t('common.error'), t('messages.conversationCreateFailed')); return
        }
        if (insertError) { Alert.alert(t('common.error'), insertError?.message || t('messages.conversationCreateFailed')); return }
        if (!newConv) { Alert.alert(t('common.error'), t('messages.conversationCreateFailed')); return }
        router.push(`/messages/${newConv.id}`)
      }
      // Speed badge check for urgent posts
      if (post.is_urgent && userId && post.user_id) {
        checkAndAwardSpeedBadge(userId, post.created_at, post.user_id).catch(() => {})
      }
      // Push notification to post author
      if (post.user_id !== userId) {
        triggerPush({
          user_id: post.user_id,
          title: t('notifications.newMessage'),
          body: post.title,
          type: 'new_message',
          data: { screen: 'messages' },
        })
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), t('messages.conversationCreateFailed'))
    } finally {
      messagingRef.current = false
    }
  }, [userId, post, id, supabase, router, t])

  const handleSendComment = useCallback(async () => {
    if (!userId || !commentText.trim() || sendingComment) return
    if (!await checkRateLimit('comment')) {
      Alert.alert(t('common.error'), getRateLimitMessage('comment'))
      return
    }
    setSendingComment(true)
    const content = commentText.trim()
    const parentId = replyToComment?.id ?? null
    const parentCommentAuthor = replyToComment?.user_id ?? null
    setCommentText('')
    setReplyToComment(null)
    try {
      const { error } = await (supabase.from('post_comments') as any).insert({
        post_id: id, user_id: userId, content, parent_id: parentId,
      })
      if (error) throw error
      // Re-query actual comment count to avoid race conditions
      if (post) {
        const { count: realCommentCount } = await supabase
          .from('post_comments')
          .select('*', { count: 'exact', head: true })
          .eq('post_id', id)
        const syncedCount = realCommentCount ?? (post.comment_count ?? 0) + 1
        const { error: countErr } = await (supabase.from('posts') as any).update({ comment_count: syncedCount }).eq('id', id)
        if (countErr && __DEV__) console.warn('[post] comment_count sync failed:', countErr.message)
        setPost(prev => prev ? { ...prev, comment_count: syncedCount } : prev)
      }
      if (parentId) {
        setExpandedReplies(prev => { const next = new Set(prev); next.add(parentId); return next })
      }
      // Notify post owner about the new comment
      if (post && post.user_id && post.user_id !== userId) {
        await (supabase.from('notifications') as any).insert({
          user_id: post.user_id,
          from_user_id: userId,
          type: 'post_comment',
          title: t('notifications.commentTitle'),
          body: content.slice(0, 100),
          link_type: 'post',
          link_id: id,
        }).catch(() => {})
        triggerPush({
          user_id: post.user_id,
          title: t('notifications.commentTitle'),
          body: content.slice(0, 100),
          type: 'post_comment',
          post_id: id as string,
        })
      }
      // Notify parent comment author about the reply
      if (parentCommentAuthor && parentCommentAuthor !== userId && parentCommentAuthor !== post?.user_id) {
        try {
          await (supabase.from('notifications') as any).insert({
            user_id: parentCommentAuthor,
            from_user_id: userId,
            type: 'comment',
            title: t('notifications.commentReply'),
            body: content.slice(0, 100),
            link_type: 'post',
            link_id: id,
          })
        } catch {}
      }
      // Speed badge check for urgent posts
      if (post?.is_urgent && userId && post.user_id) {
        checkAndAwardSpeedBadge(userId, post.created_at, post.user_id).catch(() => {})
      }
    } catch (err) {
      // Restore comment text so the user doesn't lose their input
      setCommentText(content)
      if (parentId) setReplyToComment(replyToComment)
      Alert.alert(t('common.error'), t('engagement.commentFailed'))
      if (__DEV__) console.error('[post] comment insert failed:', err)
    } finally {
      setSendingComment(false)
    }
  }, [userId, commentText, sendingComment, id, supabase, replyToComment, t, post])

  const handleShare = () => {
    if (!post) return
    shareContent({ title: post.title, text: post.title, url: `https://tackbird.com/post/${post.id}` })
  }

  // Expiration info — must be before any early returns (React hooks rules)
  const expirationInfo = useMemo(() => {
    if (!post?.expires_at) return null
    const now = new Date()
    const expires = new Date(post.expires_at)
    if (isNaN(expires.getTime())) return null
    const diffMs = expires.getTime() - now.getTime()
    if (diffMs <= 0) return { label: t('postCard.expired'), color: colors.destructive }
    const diffHours = diffMs / 3600000
    if (diffHours < 24) return { label: t('postCard.expiresToday'), color: colors.destructive }
    if (diffHours < 48) return { label: t('postCard.expiresTomorrow'), color: colors.pro }
    const diffDays = Math.ceil(diffMs / 86400000)
    if (diffDays <= 7) return { label: t('postCard.expiresIn', { count: diffDays }), color: colors.pro }
    return null
  }, [post?.expires_at, t])

  const isAuthor = userId !== null && post?.user_id === userId
  const boosts = useBoosts(userId)
  const [boosting, setBoosting] = useState(false)

  // Check if the current post has an active boost
  const isPostBoosted = post?.is_boosted || boosts.activeBoosts.some(b => b.post_id === id)

  const handleBoostPost = useCallback(async () => {
    if (!id || !userId || boosting) return
    if (boosts.balance <= 0) {
      Alert.alert(t('boost.title'), t('boost.noBalance'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('boost.buyBoosts'), onPress: () => router.push('/boosts') },
      ])
      return
    }
    setBoosting(true)
    try {
      const success = await boosts.useBoostOnPost(id)
      if (success) {
        setPost(prev => prev ? { ...prev, is_boosted: true } : prev)
        Alert.alert(t('boost.title'), t('boost.boostSuccess'))
      }
    } finally {
      setBoosting(false)
    }
  }, [id, userId, boosting, boosts, t, router])

  // Get remaining boost time for display
  const activeBoostForPost = boosts.activeBoosts.find(b => b.post_id === id)
  const boostRemainingText = activeBoostForPost ? (() => {
    const remaining = new Date(activeBoostForPost.boost_end).getTime() - Date.now()
    if (remaining <= 0) return null
    const hours = Math.floor(remaining / 3600000)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h`
  })() : null

  const handleDelete = useCallback(() => {
    if (!post) return
    Alert.alert(t('post.delete'), t('post.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('post.delete'), style: 'destructive',
        onPress: async () => {
          try {
            // Cascade-delete related data that may not have DB-level CASCADE
            await Promise.allSettled([
              (supabase.from('post_comments') as any).delete().eq('post_id', post.id),
              (supabase.from('post_likes') as any).delete().eq('post_id', post.id),
              (supabase.from('post_images') as any).delete().eq('post_id', post.id),
              (supabase.from('saved_posts') as any).delete().eq('post_id', post.id),
              (supabase.from('post_embeddings') as any).delete().eq('post_id', post.id),
              (supabase.from('notifications') as any).delete().eq('link_id', post.id).eq('link_type', 'post'),
            ])
            const { error } = await (supabase.from('posts') as any).delete().eq('id', post.id)
            if (error) { Alert.alert(t('common.error'), t('post.deleteFailed')) }
            else { Alert.alert(t('post.deleted')); router.back() }
          } catch {
            Alert.alert(t('common.error'), t('post.deleteFailed'))
          }
        },
      },
    ])
  }, [post, supabase, t, router])

  const handleMarkClosed = useCallback(async () => {
    if (!post) return
    Alert.alert(t('post.markClosed'), t('post.markClosedConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: async () => {
          const { error } = await (supabase.from('posts') as any).update({ is_active: false }).eq('id', post.id)
          if (error) { Alert.alert(t('common.error'), t('post.updateFailed')) }
          else { setPost(prev => prev ? { ...prev, is_active: false } : prev); Alert.alert(t('post.markedClosed')) }
        },
      },
    ])
  }, [post, supabase, t])

  const handleReopen = useCallback(async () => {
    if (!post) return
    const { error } = await (supabase.from('posts') as any).update({ is_active: true }).eq('id', post.id)
    if (error) { Alert.alert(t('common.error'), t('post.updateFailed')) }
    else { setPost(prev => prev ? { ...prev, is_active: true } : prev) }
  }, [post, supabase, t])

  const openEditModal = useCallback(() => {
    if (!post) return
    setEditTitle(post.title); setEditDescription(post.description ?? ''); setEditLocation(post.location ?? '')
    setEditModalVisible(true)
  }, [post])

  const handleSaveEdit = useCallback(async () => {
    if (!post || saving) return
    setSaving(true)
    try {
      const { error } = await (supabase.from('posts') as any)
        .update({ title: editTitle.trim(), description: editDescription.trim(), location: editLocation.trim() || null })
        .eq('id', post.id)
      if (error) throw error
      setPost(prev => prev ? { ...prev, title: editTitle.trim(), description: editDescription.trim(), location: editLocation.trim() || null } : prev)
      setEditModalVisible(false); Alert.alert(t('post.updated'))
    } catch (err) {
      Alert.alert(t('common.error'), t('post.updateFailed'))
      if (__DEV__) console.warn('[PostDetail] edit save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [post, editTitle, editDescription, editLocation, saving, supabase, t])

  const handleMorePress = useCallback(() => {
    if (!post || !isAuthor) return
    const options: { text: string; onPress?: () => void; style?: 'destructive' | 'cancel' }[] = [
      { text: t('post.edit'), onPress: openEditModal },
    ]
    if (post.is_active) { options.push({ text: t('post.markClosed'), onPress: handleMarkClosed }) }
    else { options.push({ text: t('post.reopen'), onPress: handleReopen }) }
    options.push({ text: t('post.delete'), style: 'destructive', onPress: handleDelete })
    options.push({ text: t('common.cancel'), style: 'cancel' })
    Alert.alert('', '', options)
  }, [post, isAuthor, t, openEditModal, handleDelete, handleMarkClosed, handleReopen])

  const handleReport = useCallback(() => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (!post) return
    setReportModalVisible(true)
  }, [userId, post, router])

  const fetchLikers = useCallback(async () => {
    if (!id) return
    setLoadingLikers(true)
    try {
      const { data } = await supabase
        .from('post_likes')
        .select('user_id, user:profiles!post_likes_user_id_fkey(id, name, avatar_url)')
        .eq('post_id', id)
        .limit(50)
      setLikers((data ?? []).map((d: any) => d.user).filter(Boolean))
    } catch (err) {
      if (__DEV__) console.warn('[post] fetchLikers failed:', err)
    }
    setLoadingLikers(false)
  }, [id, supabase])

  const openGallery = useCallback((index: number) => {
    setGalleryInitialIndex(index); setGalleryVisible(true)
  }, [])

  const toggleReplies = useCallback((commentId: string) => {
    setExpandedReplies(prev => {
      const next = new Set(prev)
      if (next.has(commentId)) next.delete(commentId)
      else next.add(commentId)
      return next
    })
  }, [])

  const topLevelComments = useMemo(() => comments.filter(c => !c.parent_id), [comments])
  const repliesByParent = useMemo(() => {
    const map: Record<string, PostComment[]> = {}
    for (const c of comments) {
      if (c.parent_id) { if (!map[c.parent_id]) map[c.parent_id] = []; map[c.parent_id].push(c) }
    }
    return map
  }, [comments])

  const bookingDays = useMemo(() => {
    if (!bookingStartDate || !bookingEndDate) return 0
    const s = new Date(bookingStartDate); const e = new Date(bookingEndDate)
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0
    const d = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
    // Same-day booking should count as 1 day, not 0
    return d > 0 ? d : (s.getTime() === e.getTime() ? 1 : 0)
  }, [bookingStartDate, bookingEndDate])

  const rentalFee = useMemo(() => {
    if (!post?.daily_fee || bookingDays <= 0) return 0
    return bookingDays * post.daily_fee
  }, [bookingDays, post?.daily_fee])

  const serviceFee = useMemo(() => Math.round(rentalFee * SERVICE_FEE_RATE * 100) / 100, [rentalFee])
  const bookingTotal = useMemo(() => rentalFee + serviceFee, [rentalFee, serviceFee])

  useEffect(() => {
    if (!bookingModalVisible || !id) return
    async function fetchBlockedDates() {
      try {
        const { data, error } = await (supabase.from('rental_bookings') as any)
          .select('start_date, end_date').eq('post_id', id).in('status', ['pending', 'confirmed', 'paid', 'active'])
        if (error) { if (__DEV__) console.log('[bookings] blocked dates error:', error.message); return }
        if (!data) return
        const blocked: string[] = []
        for (const booking of data as any[]) {
          // Use date strings directly to avoid DST issues with setDate() iteration
          const startParts = booking.start_date.split('T')[0].split('-').map(Number)
          const endParts = booking.end_date.split('T')[0].split('-').map(Number)
          const startMs = Date.UTC(startParts[0], startParts[1] - 1, startParts[2])
          const endMs = Date.UTC(endParts[0], endParts[1] - 1, endParts[2])
          for (let ms = startMs; ms <= endMs; ms += 86400000) {
            const d = new Date(ms)
            blocked.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`)
          }
        }
        setBlockedDates(blocked)
      } catch (err) {
        if (__DEV__) console.log('[bookings] fetchBlockedDates error:', err)
      }
    }
    fetchBlockedDates()
  }, [bookingModalVisible, id, supabase])

  const handlePayAndBook = useCallback(async () => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (!post || sendingBooking || paymentLoading) return
    if (post.user_id === userId) { Alert.alert(t('common.error'), t('post.cannotMessageSelf')); return }
    if (bookingDays <= 0 || !bookingStartDate || !bookingEndDate) { Alert.alert(t('common.error'), t('rental.endDateAfterStart')); return }
    // Trust tier enforcement on buyer side
    if (trust.permissions.maxDailyFee !== null && post.daily_fee && post.daily_fee > trust.permissions.maxDailyFee) {
      Alert.alert(t('common.error'), t('trust.maxDailyFeeExceeded', { max: trust.permissions.maxDailyFee }))
      return
    }
    setSendingBooking(true)
    try {
      const { data: booking, error: bookingError } = await (supabase.from('rental_bookings') as any)
        .insert({ post_id: id, borrower_id: userId, lender_id: post.user_id, start_date: bookingStartDate, end_date: bookingEndDate, daily_fee: post.daily_fee, service_fee: serviceFee, total_amount: bookingTotal, status: 'pending' })
        .select('id').single()
      if (bookingError || !booking) { Alert.alert(t('common.error'), t('rental.bookingFailed')); setSendingBooking(false); return }
      const amountCents = Math.round(bookingTotal * 100)
      const sessionId = await createPayment({ amount: amountCents, description: `${post.title} — ${bookingDays} ${t('rental.daysAbbr')}`, type: 'rental', postId: id, sellerId: post.user_id, metadata: { booking_id: booking.id, start_date: bookingStartDate, end_date: bookingEndDate, booking_days: String(bookingDays) } })
      if (sessionId) {
        const { error: updateError } = await (supabase.from('rental_bookings') as any).update({ stripe_session_id: sessionId }).eq('id', booking.id)
        if (updateError && __DEV__) console.log('[bookings] update stripe session error:', updateError.message)
      }
      setBookingModalVisible(false); setBookingStartDate(null); setBookingEndDate(null)
      if (!sessionId) {
        // TODO: UX — Stripe payment not yet implemented in Expo Go. Booking is created with status='pending'.
        // When Stripe is available, the user will be redirected to Stripe Checkout.
        // If payment is not completed, the booking stays 'pending' — add a timeout/cleanup job
        // and a "Retry payment" or "Cancel booking" button in /bookings screen.
        Alert.alert(t('common.success'), t('rental.bookingCreated'))
      } else {
        Alert.alert(t('common.success'), t('rental.bookingCreatedPaymentPending'))
      }
    } catch { Alert.alert(t('common.error'), t('rental.bookingFailed')) }
    finally { setSendingBooking(false) }
  }, [userId, post, sendingBooking, paymentLoading, bookingDays, bookingStartDate, bookingEndDate, bookingTotal, serviceFee, id, supabase, router, t, createPayment, trust])

  // Service pricing
  const svcFee = useMemo(() => {
    if (!post?.service_price) return 0
    return Math.round(post.service_price * SERVICE_FEE_RATE * 100) / 100
  }, [post?.service_price])
  const svcTotal = useMemo(() => (post?.service_price ?? 0) + svcFee, [post?.service_price, svcFee])

  const handlePayForService = useCallback(async () => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (!post || sendingService || paymentLoading) return
    if (post.user_id === userId) { Alert.alert(t('common.error'), t('post.cannotMessageSelf')); return }
    // Trust tier enforcement on buyer side
    if (trust.permissions.maxServicePrice !== null && post.service_price && post.service_price > trust.permissions.maxServicePrice) {
      Alert.alert(t('common.error'), t('service.maxPriceExceeded', { max: trust.permissions.maxServicePrice }))
      return
    }
    setSendingService(true)
    try {
      // 1. Create service_bookings record
      const { data: booking, error: bookingError } = await (supabase.from('service_bookings') as any)
        .insert({
          post_id: id,
          buyer_id: userId,
          provider_id: post.user_id,
          service_price: post.service_price,
          service_fee: svcFee,
          total_amount: svcTotal,
          notes: serviceNotes.trim() || null,
          status: 'pending',
        })
        .select('id').single()
      if (bookingError || !booking) { Alert.alert(t('common.error'), t('service.bookingFailed')); setSendingService(false); return }

      // 2. Stripe Checkout
      const amountCents = Math.round(svcTotal * 100)
      const sessionId = await createPayment({
        amount: amountCents,
        description: post.title,
        type: 'service',
        postId: id,
        sellerId: post.user_id,
        metadata: { booking_id: booking.id, booking_type: 'service' },
      })

      // 3. Store stripe session
      if (sessionId) {
        await (supabase.from('service_bookings') as any)
          .update({ stripe_session_id: sessionId })
          .eq('id', booking.id)
      }

      setServiceModalVisible(false)
      setServiceNotes('')
      if (!sessionId) {
        // TODO: UX — service booking created with status='pending'. If the provider never responds,
        // there is no timeout mechanism. Add a 48h auto-cancel job and show countdown in /bookings screen.
        Alert.alert(t('common.success'), t('service.bookingCreated'))
      } else {
        Alert.alert(t('common.success'), t('service.bookingCreatedPaymentPending'))
      }
    } catch {
      Alert.alert(t('common.error'), t('service.bookingFailed'))
    } finally {
      setSendingService(false)
    }
  }, [userId, post, sendingService, paymentLoading, svcFee, svcTotal, serviceNotes, id, supabase, router, t, createPayment, trust])

  const renderCommentItem = (c: PostComment, isReply: boolean) => (
    <View key={c.id} style={[styles.commentRow, isReply && styles.replyRow]}>
      {isReply && <View style={[styles.replyLine, { backgroundColor: colors.border }]} />}
      <Avatar url={c.user?.avatar_url} name={c.user?.name} size={isReply ? 24 : 32} />
      <View style={styles.commentBody}>
        <View style={styles.commentHeader}>
          <Text style={[styles.commentName, { color: colors.foreground }]} numberOfLines={1}>{c.user?.name ?? t('common.user')}</Text>
          <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>{formatTimeAgo(c.created_at, t, locale)}</Text>
        </View>
        <Text style={[styles.commentContent, { color: colors.foreground }]}>{c.content}</Text>
        {userId && (
          <PressableOpacity onPress={() => setReplyToComment(c)} style={styles.replyBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('post.reply')}>
            <Reply size={12} color={colors.mutedForeground} />
            <Text style={[styles.replyBtnText, { color: colors.mutedForeground }]}>{t('post.reply')}</Text>
          </PressableOpacity>
        )}
      </View>
    </View>
  )

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <PressableOpacity onPress={() => router.back()} hitSlop={12} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={t('common.back')}><ArrowLeft size={24} color={colors.foreground} /></PressableOpacity>
        </View>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 56 }]}>
          <PostDetailSkeleton />
        </ScrollView>
      </View>
    )
  }

  if (loadError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <PressableOpacity onPress={() => router.back()} hitSlop={12} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={t('common.back')}><ArrowLeft size={24} color={colors.foreground} /></PressableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={[styles.notFound, { color: colors.mutedForeground, marginBottom: 16 }]}>{loadError}</Text>
          <PressableOpacity onPress={() => loadPost()} style={{ paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 8 }} accessibilityRole="button" accessibilityLabel={t('common.retry')}>
            <Text style={{ color: '#fff', fontFamily: fonts.bodyMedium, fontSize: 15 }}>{t('common.retry')}</Text>
          </PressableOpacity>
        </View>
      </View>
    )
  }

  if (!post) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
          <PressableOpacity onPress={() => router.back()} hitSlop={12} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel={t('common.back')}><ArrowLeft size={24} color={colors.foreground} /></PressableOpacity>
        </View>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>{t('post.notFound')}</Text>
      </View>
    )
  }

  const category = CATEGORIES[post.type as PostType]
  const user = post.user
  const userTrustLevel = computeTrustLevelFromBadges(user?.user_badges)
  const allImagesRaw = [post.image_url, ...(post.images ?? []).map(i => i.image_url)].filter(Boolean) as string[]
  const allImages = allImagesRaw
  const allImagesMedium = allImagesRaw.map(url => getImageUrl(url, 'medium')!)
  const allImagesFull = allImagesRaw.map(url => getImageUrl(url, 'full')!)

  // expirationInfo moved before early returns (React hooks rules)

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: `${colors.card}F8`, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={t('common.back')}><ArrowLeft size={24} color={colors.foreground} /></Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSave} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={t('common.save')} accessibilityState={{ selected: isSaved }}><Bookmark size={22} color={isSaved ? colors.primary : colors.mutedForeground} fill={isSaved ? colors.primary : 'transparent'} /></Pressable>
        <Pressable onPress={handleShare} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={t('common.share')}><Share2 size={22} color={colors.mutedForeground} /></Pressable>
        {isAuthor ? (
          <Pressable onPress={handleMorePress} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={t('feed.moreOptions')}><MoreHorizontal size={22} color={colors.mutedForeground} /></Pressable>
        ) : userId ? (
          <Pressable onPress={handleReport} hitSlop={8} style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={t('post.report')}><Flag size={22} color={colors.mutedForeground} /></Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 64 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPost() }} tintColor={colors.primary} />}>
        {/* Image gallery — tap to open fullscreen */}
        {allImages.length > 0 && (
          allImages.length === 1 ? (
            <PressableOpacity onPress={() => openGallery(0)} accessibilityRole="button" accessibilityLabel={t('post.openGallery') ?? 'Open image gallery'}>
              <Image source={{ uri: allImagesMedium[0] }} style={styles.heroImage} contentFit="cover" transition={300} cachePolicy="memory-disk" />
            </PressableOpacity>
          ) : (
            <FlatList
              horizontal pagingEnabled data={allImages}
              keyExtractor={(item, i) => `${item}-${i}`}
              renderItem={({ item, index }) => (
                <PressableOpacity onPress={() => openGallery(index)} accessibilityRole="button" accessibilityLabel={`${t('post.openGallery') ?? 'Open image'} ${index + 1}`}>
                  <Image source={{ uri: getImageUrl(item, 'medium')! }} style={styles.heroImage} contentFit="cover" cachePolicy="memory-disk" />
                </PressableOpacity>
              )}
              showsHorizontalScrollIndicator={false}
            />
          )
        )}

        <View style={styles.body}>
          {/* Closed/inactive banner */}
          {!post.is_active && (
            <View style={[styles.closedBanner, { backgroundColor: `${colors.destructive}15` }]}>
              <XCircle size={16} color={colors.destructive} />
              <Text style={[styles.closedBannerText, { color: colors.destructive }]}>{t('post.closedBanner')}</Text>
            </View>
          )}

          {category && (
            <View style={[styles.categoryChip, { backgroundColor: `${category.color}20` }]}>
              <Text style={[styles.categoryText, { color: category.color }]}>
                {(() => { const label = t(category.label); return label.charAt(0) + label.slice(1).toLowerCase() })()}
              </Text>
            </View>
          )}

          {expirationInfo && (
            <View style={[styles.expirationBadge, { backgroundColor: `${expirationInfo.color}18` }]}>
              <Clock size={12} color={expirationInfo.color} />
              <Text style={[styles.expirationText, { color: expirationInfo.color }]}>{expirationInfo.label}</Text>
            </View>
          )}

          <Text style={[styles.title, { color: colors.foreground }]}>{post.title}</Text>

          {/* Author action buttons */}
          {isAuthor && (
            <View style={styles.authorActionsRow}>
              <Pressable onPress={openEditModal} style={({ pressed }) => [styles.authorActionBtn, { backgroundColor: `${colors.primary}15` }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={t('post.edit')}>
                <Pencil size={14} color={colors.primary} />
                <Text style={[styles.authorActionText, { color: colors.primary }]}>{t('post.edit')}</Text>
              </Pressable>
              {post.is_active ? (
                <Pressable onPress={handleMarkClosed} style={({ pressed }) => [styles.authorActionBtn, { backgroundColor: `${colors.mutedForeground}15` }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={t('post.markClosed')}>
                  <XCircle size={14} color={colors.mutedForeground} />
                  <Text style={[styles.authorActionText, { color: colors.mutedForeground }]}>{t('post.markClosed')}</Text>
                </Pressable>
              ) : (
                <Pressable onPress={handleReopen} style={({ pressed }) => [styles.authorActionBtn, { backgroundColor: `${colors.primary}15` }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={t('post.reopen')}>
                  <Text style={[styles.authorActionText, { color: colors.primary }]}>{t('post.reopen')}</Text>
                </Pressable>
              )}
              <Pressable onPress={handleDelete} style={({ pressed }) => [styles.authorActionBtn, { backgroundColor: `${colors.destructive}15` }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={t('post.delete')}>
                <Trash2 size={14} color={colors.destructive} />
                <Text style={[styles.authorActionText, { color: colors.destructive }]}>{t('post.delete')}</Text>
              </Pressable>
            </View>
          )}

          {/* Boost badge / button — gated behind FEATURES.BOOSTS */}
          {FEATURES.BOOSTS && isAuthor && !isPostBoosted && post.is_active && (
            <Pressable
              onPress={handleBoostPost}
              disabled={boosting}
              style={({ pressed }) => [styles.boostBtn, { backgroundColor: `${colors.accent}15`, borderColor: `${colors.accent}40` }, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={t('boost.boostThis')}
            >
              <TrendingUp size={14} color={colors.accent} />
              <Text style={[styles.boostBtnText, { color: colors.accent }]}>{t('boost.boostThis')}</Text>
              {boosting && <ActivityIndicator size="small" color={colors.accent} style={{ marginLeft: 4 }} />}
            </Pressable>
          )}
          {FEATURES.BOOSTS && isPostBoosted && (
            <BoostBadge subtitle={boostRemainingText ? t('boost.boostEndsIn', { time: boostRemainingText }) : undefined} />
          )}

          {post.is_pro_listing && (
            <View style={[styles.proBadge, { backgroundColor: `${colors.pro}20` }]}>
              <Crown size={14} color={colors.pro} /><Text style={[styles.proText, { color: colors.pro }]}>Pro</Text>
            </View>
          )}

          {post.daily_fee !== null && (
            <Text style={[styles.price, { color: category?.color ?? colors.foreground }]}>{formatPrice(post.daily_fee, locale)} / {t('common.daysShort')}</Text>
          )}

          {post.service_price !== null && post.service_price > 0 && (
            <Text style={[styles.price, { color: category?.color ?? colors.foreground }]}>{formatPrice(post.service_price, locale)}</Text>
          )}

          {post.type === 'tarjoan' && post.tags?.includes('tarjoan_item') && (post.service_price === null || post.service_price === 0) && (
            <Text style={[styles.price, { color: colors.info }]}>{t('create.freeItem')}</Text>
          )}

          {post.type === 'tarjoan' && post.tags?.some((tag: string) => tag.startsWith('condition_')) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: colors.purpleMuted }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.purple, fontFamily: fonts.bodySemi, lineHeight: 16 }}>
                  {(() => {
                    const condTag = post.tags?.find((tag: string) => tag.startsWith('condition_'))
                    if (!condTag) return ''
                    const condKey = 'create.condition' + condTag.replace('condition_', '').charAt(0).toUpperCase() + condTag.replace('condition_', '').slice(1)
                    return t(condKey)
                  })()}
                </Text>
              </View>
            </View>
          )}

          {priceContext && (post.daily_fee !== null || post.service_price !== null) && (
            <Text style={{ fontSize: 11, color: colors.mutedForeground, lineHeight: 15, fontFamily: fonts.body }}>
              {t('post.priceContext', { min: priceContext.min, max: priceContext.max })}
            </Text>
          )}

          {FEATURES.PAYMENTS && post.type === 'lainaa' && post.daily_fee !== null && !isAuthor && (
            <Pressable onPress={() => { if (!userId) { router.push('/(auth)/login'); return } setBookingModalVisible(true) }} style={({ pressed }) => [styles.bookingBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={t('post.booking')}>
              <Calendar size={16} color={colors.primaryForeground} />
              <Text style={[styles.bookingBtnText, { color: colors.primaryForeground }]}>{t('post.booking')}</Text>
            </Pressable>
          )}

          {FEATURES.PAYMENTS && post.type === 'tarjoan' && post.service_price !== null && post.service_price > 0 && !post.tags?.includes('tarjoan_item') && !isAuthor && (
            <Pressable onPress={() => { if (!userId) { router.push('/(auth)/login'); return } setServiceModalVisible(true) }} style={({ pressed }) => [styles.bookingBtn, { backgroundColor: category?.color ?? colors.primary }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={t('service.buyService')}>
              <ShoppingBag size={16} color={colors.primaryForeground} />
              <Text style={[styles.bookingBtnText, { color: colors.primaryForeground }]}>{t('service.buyService')}</Text>
            </Pressable>
          )}

          {post.event_date && (<Text style={[styles.eventDate, { color: colors.primary }]}>{formatEventDate(post.event_date, locale)}</Text>)}

          {post.description ? (
            <Text style={[styles.description, { color: colors.foreground }]}>{post.description}</Text>
          ) : null}

          {post.type === 'tapahtuma' && (
            <Pressable
              onPress={() => router.push('/community-events' as any)}
              style={({ pressed }) => [styles.communityEventsLink, pressed && { opacity: 0.7 }]}
              accessibilityRole="link"
              accessibilityLabel={t('post.browseCommunityEvents')}
            >
              <Calendar size={14} color={colors.primary} />
              <Text style={[styles.communityEventsLinkText, { color: colors.primary }]}>{t('post.browseCommunityEvents')}</Text>
            </Pressable>
          )}

          {post.location && (
            <View style={styles.locationRow}>
              <MapPin size={16} color={colors.mutedForeground} />
              <Text style={[styles.locationText, { color: colors.mutedForeground }]}>{post.location}</Text>
            </View>
          )}

          {/* Action row — like + count, comment + count (bookmark/share/flag in header) */}
          <View style={styles.actionRow}>
            <Pressable onPress={toggleLike} style={({ pressed }) => [styles.actionItem, pressed && { opacity: 0.7 }]} hitSlop={8} accessibilityRole="button" accessibilityLabel={isLiked ? t('engagement.unlike') : t('engagement.like')} accessibilityState={{ selected: isLiked }}>
              <Heart size={16} color={isLiked ? colors.destructive : colors.mutedForeground} fill={isLiked ? colors.destructive : 'transparent'} />
              {likeCount > 0 && (
                <PressableOpacity onPress={() => { setShowLikersModal(true); fetchLikers() }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('post.likedBy')}>
                  <Text style={[styles.actionText, { color: isLiked ? colors.destructive : colors.mutedForeground }]}>{likeCount}</Text>
                </PressableOpacity>
              )}
            </Pressable>
            <View style={styles.actionItem}>
              <MessageCircle size={16} color={colors.mutedForeground} />
              {comments.length > 0 && (
                <Text style={[styles.actionText, { color: colors.mutedForeground }]}>{comments.length}</Text>
              )}
            </View>
          </View>

          {/* Author card — compact, like feed PostCard */}
          <View style={[styles.authorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <PressableOpacity onPress={() => user?.id && router.push(`/profile/${user.id}` as any)} style={styles.authorCardRow} accessibilityRole="button" accessibilityLabel={user?.name ?? t('common.user')}>
              <Avatar url={user?.avatar_url} name={user?.name} size={32} />
              <View style={styles.authorCardInfo}>
                <View style={styles.authorNameRow}>
                  <Text style={[styles.authorName, { color: colors.foreground }]} numberOfLines={1}>{user?.name ?? t('common.user')}</Text>
                  {userTrustLevel >= 2 && <TrustBadge level={userTrustLevel} size="small" />}
                  {post.created_at && (
                    <Text style={[styles.authorTimeAgo, { color: colors.mutedForeground }]}>
                      {'· ' + formatTimeAgo(post.created_at, t, locale)}
                    </Text>
                  )}
                </View>
                {user?.naapurusto && (
                  <View style={styles.authorLocationRow}>
                    <MapPin size={11} color={colors.mutedForeground} />
                    <Text style={[styles.authorNh, { color: colors.mutedForeground }]} numberOfLines={1}>{user.naapurusto}</Text>
                  </View>
                )}
              </View>
            </PressableOpacity>
          </View>

          {/* Related posts */}
          {relatedPosts.length > 0 && (
            <View style={[styles.relatedSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.relatedTitle, { color: colors.foreground }]}>{t('post.relatedListings')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedScroll}>
                {relatedPosts.map((rp) => {
                  const rpCat = CATEGORIES[rp.type as PostType]
                  return (
                    <PressableOpacity key={rp.id} onPress={() => router.push(`/post/${rp.id}` as any)} style={[styles.relatedCard, { backgroundColor: colors.card }]}>
                      {rp.image_url ? (<Image source={{ uri: getImageUrl(rp.image_url, 'thumbnail')! }} style={styles.relatedImage} contentFit="cover" cachePolicy="memory-disk" />) : (
                        <View style={[styles.relatedImage, { backgroundColor: rpCat ? (isDark ? rpCat.bgDark : rpCat.bgLight) : colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                          {rpCat && CATEGORY_ICON_MAP[rpCat.icon] && (() => { const I = CATEGORY_ICON_MAP[rpCat.icon]; return <I size={28} color={rpCat.color} /> })()}
                        </View>
                      )}
                      <View style={styles.relatedCardBody}>
                        <Text style={[styles.relatedCardTitle, { color: colors.foreground }]} numberOfLines={2}>{rp.title}</Text>
                        {rp.location && (<View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><MapPin size={10} color={colors.mutedForeground} /><Text style={[styles.relatedCardLocation, { color: colors.mutedForeground }]} numberOfLines={1}>{rp.location}</Text></View>)}
                      </View>
                    </PressableOpacity>
                  )
                })}
              </ScrollView>
            </View>
          )}

          {/* Threaded Comments */}
          <View style={[styles.commentSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.commentTitle, { color: comments.length === 0 ? colors.mutedForeground : colors.foreground }]}>
              {comments.length === 0 ? t('post.beFirstComment') : `${t('post.comments')} (${comments.length})`}
            </Text>

            {topLevelComments.map((c) => {
              const replies = repliesByParent[c.id] ?? []
              const isExpanded = expandedReplies.has(c.id)
              return (
                <View key={c.id}>
                  {renderCommentItem(c, false)}
                  {replies.length > 0 && (
                    <Pressable onPress={() => toggleReplies(c.id)} style={({ pressed }) => [styles.showRepliesBtn, pressed && { opacity: 0.7 }]} hitSlop={8} accessibilityRole="button" accessibilityLabel={isExpanded ? t('post.hideReplies') : t('post.showReplies', { count: replies.length })}>
                      {isExpanded ? <ChevronUp size={14} color={colors.primary} /> : <ChevronDown size={14} color={colors.primary} />}
                      <Text style={[styles.showRepliesText, { color: colors.primary }]}>
                        {isExpanded ? t('post.hideReplies') : t('post.showReplies', { count: replies.length })}
                      </Text>
                    </Pressable>
                  )}
                  {isExpanded && replies.map(reply => renderCommentItem(reply, true))}
                </View>
              )
            })}

            {replyToComment && (
              <View style={[styles.replyIndicator, { backgroundColor: `${colors.primary}10`, borderColor: colors.primary }]}>
                <Reply size={12} color={colors.primary} />
                <Text style={[styles.replyIndicatorText, { color: colors.primary }]} numberOfLines={1}>
                  {t('post.replyingTo', { name: replyToComment.user?.name ?? t('common.user') })}
                </Text>
                <PressableOpacity onPress={() => setReplyToComment(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><X size={14} color={colors.mutedForeground} /></PressableOpacity>
              </View>
            )}

            {userId && (
              <View style={{ gap: 4 }}>
              <View style={[styles.commentInput, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.commentTextInput, { color: colors.foreground }]}
                  value={commentText} onChangeText={setCommentText}
                  placeholder={replyToComment ? t('post.writeReply') : t('post.addComment')}
                  placeholderTextColor={colors.mutedForeground} maxLength={500}
                />
                <Pressable onPress={handleSendComment} disabled={!commentText.trim() || sendingComment}
                  hitSlop={8}
                  accessibilityRole="button" accessibilityLabel={t('post.sendComment')}
                  style={({ pressed }) => [styles.commentSendBtn, { backgroundColor: commentText.trim() ? colors.primary : colors.muted, opacity: (!commentText.trim() || sendingComment) ? 0.5 : pressed ? 0.7 : 1 }]}>
                  <Send size={14} color={commentText.trim() ? colors.primaryForeground : colors.mutedForeground} />
                </Pressable>
              </View>
              {commentText.length > 0 && (
                <Text style={{ fontSize: 11, color: commentText.length >= 450 ? colors.destructive : colors.mutedForeground, textAlign: 'right', paddingRight: 4, fontFamily: fonts.body, lineHeight: 16 }}>
                  {commentText.length}/500
                </Text>
              )}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Fullscreen Image Gallery */}
      {allImages.length > 0 && (
        <ImageGallery images={allImagesFull} initialIndex={galleryInitialIndex} visible={galleryVisible} onClose={() => setGalleryVisible(false)} />
      )}

      {/* Edit Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('post.editPost')}</Text>
              <ModalCloseButton onClose={() => setEditModalVisible(false)} />
            </View>
            <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{t('post.titleLabel')} *</Text>
            <TextInput style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} value={editTitle} onChangeText={setEditTitle} maxLength={100} />
            <Text style={{ fontSize: 11, color: editTitle.length >= 90 ? colors.destructive : colors.mutedForeground, textAlign: 'right', fontFamily: fonts.body, lineHeight: 16 }}>{editTitle.length}/100</Text>
            <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{t('post.descriptionLabel')}</Text>
            <TextInput style={[styles.modalInput, styles.modalTextArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} value={editDescription} onChangeText={setEditDescription} multiline numberOfLines={5} textAlignVertical="top" maxLength={2000} />
            <Text style={{ fontSize: 11, color: editDescription.length >= 1900 ? colors.destructive : colors.mutedForeground, textAlign: 'right', fontFamily: fonts.body, lineHeight: 16 }}>{editDescription.length}/2000</Text>
            <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{t('post.locationLabel')}</Text>
            <TextInput style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} value={editLocation} onChangeText={setEditLocation} maxLength={100} />
            <Pressable onPress={handleSaveEdit} disabled={saving || !editTitle.trim()} style={({ pressed }) => [styles.saveBtn, { backgroundColor: saving || !editTitle.trim() ? colors.muted : colors.primary }, pressed && { opacity: 0.7 }]}>
              {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>{t('post.saveChanges')}</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Booking Modal */}
      <Modal visible={bookingModalVisible} animationType="slide" transparent onRequestClose={() => setBookingModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setBookingModalVisible(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('rental.booking')}</Text>
                <ModalCloseButton onClose={() => setBookingModalVisible(false)} />
              </View>
              {/* Step indicator — reduces cognitive load on multi-step flow */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={{ flex: 1, height: 3, borderRadius: 1.5, backgroundColor: colors.primary }} />
                <View style={{ flex: 1, height: 3, borderRadius: 1.5, backgroundColor: bookingDays > 0 ? colors.primary : colors.muted }} />
              </View>
              <Text style={[styles.bookingPostTitle, { color: colors.foreground }]} numberOfLines={2}>{post?.title ?? ''}</Text>
              {post?.daily_fee !== null && (<Text style={[styles.bookingFee, { color: category?.color ?? colors.foreground }]}>{formatPrice(post.daily_fee, locale)} / {t('common.daysShort')}</Text>)}
              <Text style={[styles.modalLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>{bookingDays > 0 ? t('rental.pricingBreakdown') : t('rental.selectDates')}</Text>
              <DateRangePicker startDate={bookingStartDate} endDate={bookingEndDate} onSelect={(start, end) => { setBookingStartDate(start); setBookingEndDate(end) }} blockedDates={blockedDates} />
              {bookingStartDate && (
                <View style={[styles.datesSummary, { backgroundColor: colors.muted }]}>
                  <View style={styles.datesSummaryItem}><Text style={[styles.datesSummaryLabel, { color: colors.mutedForeground }]}>{t('rental.startDate')}</Text><Text style={[styles.datesSummaryValue, { color: colors.foreground }]}>{bookingStartDate}</Text></View>
                  {bookingEndDate && (<View style={styles.datesSummaryItem}><Text style={[styles.datesSummaryLabel, { color: colors.mutedForeground }]}>{t('rental.endDate')}</Text><Text style={[styles.datesSummaryValue, { color: colors.foreground }]}>{bookingEndDate}</Text></View>)}
                </View>
              )}
              {bookingDays > 0 && post?.daily_fee !== null && (
                <View style={[styles.pricingBreakdown, { borderColor: colors.border }]}>
                  <Text style={[styles.pricingTitle, { color: colors.foreground }]}>{t('rental.pricingBreakdown')}</Text>
                  <View style={styles.pricingRow}><Text style={[styles.pricingLabel, { color: colors.mutedForeground }]}>{formatPrice(post.daily_fee, locale)} x {bookingDays} {t('rental.daysAbbr')}</Text><Text style={[styles.pricingValue, { color: colors.foreground }]}>{formatPrice(rentalFee, locale)}</Text></View>
                  <View style={styles.pricingRow}><Text style={[styles.pricingLabel, { color: colors.mutedForeground }]}>{t('rental.serviceFee')} ({t('rental.serviceFeeNote')})</Text><Text style={[styles.pricingValue, { color: colors.foreground }]}>{formatPrice(serviceFee, locale)}</Text></View>
                  <View style={[styles.pricingRow, styles.pricingTotalRow, { borderTopColor: colors.border }]}><Text style={[styles.pricingTotalLabel, { color: colors.foreground }]}>{t('rental.total')}</Text><Text style={[styles.bookingTotalPrice, { color: colors.primary }]}>{formatPrice(bookingTotal, locale)}</Text></View>
                </View>
              )}
              {bookingDays > 0 && (<Text style={[styles.confirmNote, { color: colors.mutedForeground }]}>{t('rental.confirmationNote')}</Text>)}
              {paymentError && (<Text style={[styles.errorText, { color: colors.destructive }]}>{paymentError}</Text>)}
              <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: 'center', lineHeight: 15, fontFamily: fonts.body }}>{t('payment.opensInBrowser')}</Text>
              <Pressable onPress={handlePayAndBook} disabled={sendingBooking || paymentLoading || bookingDays <= 0}
                style={({ pressed }) => [styles.payBookBtn, { backgroundColor: sendingBooking || paymentLoading || bookingDays <= 0 ? colors.muted : colors.primary, marginTop: 16, marginBottom: 8 }, pressed && { opacity: 0.7 }]}>
                {sendingBooking || paymentLoading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : (<><Calendar size={16} color={colors.primaryForeground} /><Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>{t('rental.payAndBook')}</Text></>)}
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Service Booking Modal */}
      <Modal visible={serviceModalVisible} animationType="slide" transparent onRequestClose={() => setServiceModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setServiceModalVisible(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('service.bookService')}</Text>
              <ModalCloseButton onClose={() => setServiceModalVisible(false)} />
            </View>

            <Text style={[styles.bookingPostTitle, { color: colors.foreground }]} numberOfLines={2}>{post?.title ?? ''}</Text>

            {/* Provider info */}
            {user && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                <Avatar url={user.avatar_url} name={user.name} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: fonts.bodySemi, color: colors.foreground, lineHeight: 20 }} numberOfLines={1}>{user.name ?? t('common.user')}</Text>
                  <Text style={{ fontSize: 12, fontFamily: fonts.body, color: colors.mutedForeground, lineHeight: 16 }}>{t('service.provider')}</Text>
                </View>
              </View>
            )}

            {/* Notes */}
            <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{t('service.notesLabel')}</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, minHeight: 80 }]}
              value={serviceNotes}
              onChangeText={setServiceNotes}
              placeholder={t('service.notesPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              multiline
              maxLength={500}
            />
            {serviceNotes.length > 0 && (
              <Text style={{ fontSize: 11, color: serviceNotes.length >= 450 ? colors.destructive : colors.mutedForeground, textAlign: 'right', fontFamily: fonts.body, lineHeight: 16 }}>
                {serviceNotes.length}/500
              </Text>
            )}

            {/* Pricing breakdown */}
            {post?.service_price !== null && (
              <View style={[styles.pricingBreakdown, { borderColor: colors.border }]}>
                <Text style={[styles.pricingTitle, { color: colors.foreground }]}>{t('service.pricingBreakdown')}</Text>
                <View style={styles.pricingRow}>
                  <Text style={[styles.pricingLabel, { color: colors.mutedForeground }]}>{t('service.servicePrice')}</Text>
                  <Text style={[styles.pricingValue, { color: colors.foreground }]}>{formatPrice(post.service_price, locale)}</Text>
                </View>
                <View style={styles.pricingRow}>
                  <Text style={[styles.pricingLabel, { color: colors.mutedForeground }]}>{t('service.platformFee')}</Text>
                  <Text style={[styles.pricingValue, { color: colors.foreground }]}>{formatPrice(svcFee, locale)}</Text>
                </View>
                <View style={[styles.pricingRow, styles.pricingTotalRow, { borderTopColor: colors.border }]}>
                  <Text style={[styles.pricingTotalLabel, { color: colors.foreground }]}>{t('rental.total')}</Text>
                  <Text style={[styles.bookingTotalPrice, { color: category?.color ?? colors.primary }]}>{formatPrice(svcTotal, locale)}</Text>
                </View>
              </View>
            )}

            <Text style={{ fontSize: 12, fontFamily: fonts.body, color: colors.mutedForeground, lineHeight: 17, marginTop: 4 }}>{t('service.escrowNote')}</Text>

            {paymentError && (<Text style={[styles.errorText, { color: colors.destructive }]}>{paymentError}</Text>)}

            <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: 'center', lineHeight: 15, fontFamily: fonts.body }}>{t('payment.opensInBrowser')}</Text>

            <Pressable
              onPress={handlePayForService}
              disabled={sendingService || paymentLoading}
              style={({ pressed }) => [styles.payBookBtn, { backgroundColor: sendingService || paymentLoading ? colors.muted : (category?.color ?? colors.primary), marginTop: 16, marginBottom: 8 }, pressed && { opacity: 0.7 }]}
            >
              {sendingService || paymentLoading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <ShoppingBag size={16} color={colors.primaryForeground} />
                  <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>{t('service.payAndBook')}</Text>
                </>
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Fixed bottom CTA — message only (bookmark/share/flag in header) */}
      {post && userId && post.user_id !== userId && (
        <View style={[ctaStyles.bar, {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom + 8,
        }]}>
          <Pressable
            onPress={handleMessage}
            style={({ pressed }) => [ctaStyles.messageBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button" accessibilityLabel={t('post.sendMessage')}
          >
            <MessageCircle size={18} color={colors.primaryForeground} />
            <Text style={[ctaStyles.messageBtnText, { color: colors.primaryForeground }]}>
              {t('post.message')}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Likers Modal */}
      <Modal visible={showLikersModal} animationType="slide" transparent onRequestClose={() => setShowLikersModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowLikersModal(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('post.likedBy')}</Text>
              <ModalCloseButton onClose={() => setShowLikersModal(false)} />
            </View>
            {loadingLikers ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={likers}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <PressableOpacity onPress={() => { setShowLikersModal(false); router.push(`/profile/${item.id}` as any) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                    <Avatar url={item.avatar_url} name={item.name} size={40} />
                    <Text style={{ fontSize: 14, fontFamily: fonts.bodyMedium, color: colors.foreground, flex: 1, lineHeight: 20 }}>{item.name}</Text>
                  </PressableOpacity>
                )}
                ListEmptyComponent={<Text style={{ textAlign: 'center', color: colors.mutedForeground, paddingVertical: 20, fontFamily: fonts.body }}>{t('post.noLikes')}</Text>}
              />
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Report Modal */}
      {post && (
        <ReportModal
          visible={reportModalVisible}
          onClose={() => setReportModalVisible(false)}
          type="post"
          targetId={post.id}
        />
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  headerBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingBottom: 100 },
  heroImage: { width: '100%', aspectRatio: 4 / 3 },
  body: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16, gap: 14 },
  closedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  closedBannerText: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 18 },
  authorActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  authorActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, minHeight: 36 },
  authorActionText: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 16 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  categoryText: { fontSize: 11, fontFamily: fonts.bodyMedium, letterSpacing: 0.3, lineHeight: 13 },
  expirationBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  expirationText: { fontSize: 11, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 16 },
  title: { fontSize: 22, fontFamily: fonts.headingSemi, lineHeight: 28, letterSpacing: -0.3 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  proText: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 18 },
  boostBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start' },
  boostBtnText: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 18 },
  price: { fontSize: 18, fontFamily: fonts.heading, lineHeight: 24 },
  eventDate: { fontSize: 14, fontFamily: fonts.bodyMedium, lineHeight: 20 },
  description: { fontSize: 14, fontFamily: fonts.body, lineHeight: 22 },
  communityEventsLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  communityEventsLinkText: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20 },

  // Action row — unified like PostCard
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 44, paddingHorizontal: 2 },
  actionText: { fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 16 },

  // Author card — compact single row
  authorCard: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  authorCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  authorCardInfo: { flex: 1, gap: 1 },
  authorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'nowrap' },
  authorName: { fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 17, flexShrink: 1 },
  authorTimeAgo: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14, flexShrink: 0 },
  authorLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  authorNh: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14 },

  notFound: { fontSize: 16, fontFamily: fonts.body, textAlign: 'center', marginTop: 100, lineHeight: 22 },
  commentSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, marginTop: 8, gap: 12 },
  commentTitle: { fontSize: 16, fontFamily: fonts.headingSemi, lineHeight: 22 },
  commentRow: { flexDirection: 'row', gap: 8 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentBody: { flex: 1, gap: 2 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentName: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 18 },
  commentTime: { fontSize: 11, fontFamily: fonts.body, lineHeight: 16 },
  commentContent: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20 },
  replyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, minHeight: 32, paddingVertical: 4 },
  replyBtnText: { fontSize: 11, fontFamily: fonts.bodyMedium, lineHeight: 16 },
  replyRow: { marginLeft: 32, paddingLeft: 12 },
  replyLine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, borderRadius: 1 },
  replyAvatar: { width: 24, height: 24, borderRadius: 12 },
  showRepliesBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 42, marginTop: 4 },
  showRepliesText: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 16 },
  replyIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  replyIndicatorText: { flex: 1, fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 16 },
  commentInput: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  commentTextInput: { flex: 1, fontSize: 14, fontFamily: fonts.body, minHeight: 36, lineHeight: 20 },
  commentSendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 8, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontFamily: fonts.headingSemi, lineHeight: 24 },
  modalLabel: { fontSize: 13, fontFamily: fonts.bodySemi, marginTop: 8, lineHeight: 18 },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontFamily: fonts.body, minHeight: 44, marginTop: 4, lineHeight: 20 },
  modalTextArea: { minHeight: 120 },
  saveBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, marginTop: 16, minHeight: 48 },
  saveBtnText: { fontSize: 16, fontFamily: fonts.bodySemi, lineHeight: 22 },
  relatedSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, marginTop: 8, gap: 12 },
  relatedTitle: { fontSize: 16, fontFamily: fonts.headingSemi, lineHeight: 22 },
  relatedScroll: { gap: 8 },
  relatedCard: { width: 160, borderRadius: 12, overflow: 'hidden' },
  relatedImage: { width: 160, height: 100, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  relatedCardBody: { padding: 8, gap: 4 },
  relatedCardTitle: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 17 },
  relatedCardLocation: { fontSize: 11, fontFamily: fonts.body, lineHeight: 16 },
  bookingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignSelf: 'flex-start' },
  bookingBtnText: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  bookingPostTitle: { fontSize: 16, fontFamily: fonts.bodySemi, lineHeight: 22 },
  bookingFee: { fontSize: 14, fontFamily: fonts.heading, lineHeight: 20 },
  bookingTotalPrice: { fontSize: 18, fontFamily: fonts.heading, lineHeight: 24 },
  datesSummary: { flexDirection: 'row', gap: 16, padding: 12, borderRadius: 12, marginTop: 12 },
  datesSummaryItem: { flex: 1, gap: 2 },
  datesSummaryLabel: { fontSize: 11, fontFamily: fonts.bodySemi, textTransform: 'uppercase', letterSpacing: 0.3 },
  datesSummaryValue: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  pricingBreakdown: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 16, marginTop: 12, gap: 8 },
  pricingTitle: { fontSize: 14, fontFamily: fonts.headingSemi, marginBottom: 4, lineHeight: 20 },
  pricingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pricingLabel: { fontSize: 13, fontFamily: fonts.body, lineHeight: 18 },
  pricingValue: { fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 18 },
  pricingTotalRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 4 },
  pricingTotalLabel: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  confirmNote: { fontSize: 12, fontFamily: fonts.body, textAlign: 'center', marginTop: 8, lineHeight: 17 },
  errorText: { fontSize: 13, fontFamily: fonts.body, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  payBookBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 12, minHeight: 48 },
})

const ctaStyles = StyleSheet.create({
  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  messageBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 12,
  },
  messageBtnText: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
})

export default function PostDetailScreen() {
  return (
    <ScreenErrorBoundary screenName="PostDetail">
      <PostDetailScreenInner />
    </ScreenErrorBoundary>
  )
}
