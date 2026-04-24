declare const __DEV__: boolean

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet, ActivityIndicator, TextInput, FlatList, Alert, Modal, KeyboardAvoidingView, Platform, ActionSheetIOS, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import {
  ArrowLeft, MapPin, Heart, Bookmark, Share2, MessageCircle, Crown,
  Send, Flag, Clock, ChevronRight, Eye,
  MoreHorizontal, X, Calendar, Pencil, Trash2, XCircle, Reply, ChevronDown, ChevronUp,
  ShoppingBag, Star, Shield, DollarSign, Info,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/components/Toast'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { shareContent } from '@/lib/share'
import { triggerPush } from '@/lib/pushTrigger'
import { usePriceSuggestion } from '@/hooks/usePriceSuggestion'
import { ReportModal } from '@/components/ReportModal'
import { Avatar } from '@/components/Avatar'
import { CATEGORIES, POST_SELECT, SERVICE_FEE_RATE, suggestDeposit, DEPOSIT_SUGGESTIONS } from '@/lib/constants'
import { applyLocationAccuracy } from '@/lib/privacyUtils'
import { FEATURES } from '@/lib/featureFlags'
import { formatTimeAgo, formatPrice, formatEventDate } from '@/lib/format'
import { useStripePayment } from '@/hooks/useStripePayment'
import { useTrustLevel } from '@/hooks/useTrustLevel'
import { TrustBadge } from '@/components/TrustBadge'
import { computeTrustLevelFromBadges } from '@/lib/trustUtils'
import DateRangePicker from '@/components/DateRangePicker'
import ImageGallery from '@/components/ImageGallery'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { OfferModal } from '@/components/OfferModal'
import { PostDetailSkeleton, FadeIn } from '@/components/SkeletonLoaders'
import { isValidUUID } from '@/lib/validation'
import { checkAndAwardSpeedBadge } from '@/lib/speedBadges'
import { trackEvent } from '@/lib/analytics'
import { getCachedUserId } from '@/lib/authCache'
import { checkRateLimit, getRateLimitMessage } from '@/lib/rateLimiter'
import { ModalCloseButton, PressableOpacity, KeyboardDoneAccessory, KEYBOARD_DONE_ID } from '@/components/ui'
import { getImageUrl } from '@/lib/imageUtils'
import type { Post, PostType, PostComment, PostStatus } from '@/lib/types'

function PostDetailScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const toast = useToast()
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
  const [authorRating, setAuthorRating] = useState<{ avg: number; count: number } | null>(null)
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

  // Description expand/collapse
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)

  // Reply state for threaded comments
  const [replyToComment, setReplyToComment] = useState<PostComment | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())

  // Booking modal state
  const [bookingModalVisible, setBookingModalVisible] = useState(false)
  const [bookingStartDate, setBookingStartDate] = useState<string | null>(null)
  const [bookingEndDate, setBookingEndDate] = useState<string | null>(null)
  const [sendingBooking, setSendingBooking] = useState(false)
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const [depositInfoVisible, setDepositInfoVisible] = useState(false)
  const [serviceFeeInfoVisible, setServiceFeeInfoVisible] = useState(false)
  const { createPayment, loading: paymentLoading, error: paymentError } = useStripePayment()
  const trust = useTrustLevel(userId)

  // Price suggestion context for buyers
  const { suggestion: priceContext } = usePriceSuggestion(
    post?.type ?? null,
    post?.tags ?? [],
    (post as any)?.user?.naapurusto ?? null,
  )

  // Social proof: view count
  const [viewCount, setViewCount] = useState(0)

  // Offer modal state
  const [offerModalVisible, setOfferModalVisible] = useState(false)

  // Service booking state (for tarjoan posts with service_price)
  const [serviceModalVisible, setServiceModalVisible] = useState(false)
  const [serviceNotes, setServiceNotes] = useState('')
  const [sendingService, setSendingService] = useState(false)

  // Undo delete state
  const [undoBarVisible, setUndoBarVisible] = useState(false)
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { width: screenWidth } = useWindowDimensions()

  const loadPost = useCallback(async () => {
    if (!id || !isValidUUID(id)) { setLoading(false); setRefreshing(false); setLoadError(t('post.notFound') ?? 'Post not found'); return }

    try {
      setLoadError(null)

      const cachedId = await getCachedUserId()
      if (cachedId) setUserId(cachedId)

      const { data } = await supabase.from('posts').select(POST_SELECT).eq('id', id).maybeSingle()
      if (!data) {
        setLoadError(t('post.notFound') ?? 'Post not found')
        return
      }
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

      // Fetch comments + related posts in parallel
      const [cmtsRes, relatedRes] = await Promise.all([
        supabase
          .from('post_comments')
          .select('*, user:profiles!post_comments_user_id_fkey(id, name, avatar_url)')
          .eq('post_id', id)
          .order('created_at', { ascending: true }),
        data
          ? supabase
              .from('posts')
              .select('id, type, title, image_url, location, created_at')
              .eq('type', (data as any).type)
              .eq('is_active', true)
              .neq('id', id)
              .order('created_at', { ascending: false })
              .limit(4)
          : Promise.resolve({ data: null }),
      ])
      setComments((cmtsRes.data ?? []).map((c: any) => ({ ...c, parent_id: c.parent_id ?? null })) as unknown as PostComment[])
      if (relatedRes.data) setRelatedPosts(relatedRes.data as any[])
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

  // Track post view + fetch view count
  useEffect(() => {
    if (!post?.id) return
    let mounted = true
    // Fetch view count (distinct viewers in last 7 days)
    ;(supabase.rpc as any)('get_post_view_count', { p_post_id: post.id }).then(({ data }: { data: number | null }) => {
      if (mounted && typeof data === 'number') setViewCount(data)
    })
    // Record view (fire-and-forget)
    if (userId) {
      (supabase.from('post_views') as any)
        .upsert({ post_id: post.id, user_id: userId }, { onConflict: 'post_id,user_id' })
        .catch(() => {})
    }
    return () => { mounted = false }
  }, [post?.id, userId, supabase])

  useEffect(() => {
    if (!post?.user_id) return
    let mounted = true
    supabase
      .from('reviews')
      .select('rating')
      .eq('reviewed_id', post.user_id)
      .then(({ data }) => {
        if (!mounted || !data || data.length === 0) return
        const avg = data.reduce((s: number, r: any) => s + r.rating, 0) / data.length
        setAuthorRating({ avg: Math.round(avg * 10) / 10, count: data.length })
      })
    return () => { mounted = false }
  }, [post?.user_id, supabase])

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
              .maybeSingle()
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
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
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
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
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
    if (post.user_id === userId) { toast.show({ message: t('post.cannotMessageSelf'), type: 'error' }); return }
    if (!isValidUUID(userId) || !isValidUUID(post.user_id)) return
    messagingRef.current = true
    try {
      // Find ANY existing conversation between these two users
      const { data: existing, error: findError } = await supabase
        .from('conversations').select('id')
        .or(`and(user1_id.eq.${userId},user2_id.eq.${post.user_id}),and(user1_id.eq.${post.user_id},user2_id.eq.${userId})`)
        .maybeSingle()
      if (findError) { toast.show({ message: t('messages.conversationCreateFailed'), type: 'error' }); return }
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
          toast.show({ message: t('messages.conversationCreateFailed'), type: 'error' }); return
        }
        if (insertError) { toast.show({ message: insertError?.message || t('messages.conversationCreateFailed'), type: 'error' }); return }
        if (!newConv) { toast.show({ message: t('messages.conversationCreateFailed'), type: 'error' }); return }
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
      toast.show({ message: t('messages.conversationCreateFailed'), type: 'error' })
    } finally {
      messagingRef.current = false
    }
  }, [userId, post, id, supabase, router, t, toast])

  const handleSendComment = useCallback(async () => {
    if (!userId || !commentText.trim() || sendingComment) return
    if (!await checkRateLimit('comment')) {
      toast.show({ message: getRateLimitMessage('comment', t), type: 'error' })
      return
    }
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
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
      toast.show({ message: t('engagement.commentFailed'), type: 'error' })
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
    if (diffHours < 48) return { label: t('postCard.expiresTomorrow'), color: colors.foreground }
    const diffDays = Math.ceil(diffMs / 86400000)
    if (diffDays <= 7) return { label: t('postCard.expiresIn', { count: diffDays }), color: colors.foreground }
    return null
  }, [post?.expires_at, t, colors.destructive, colors.foreground])

  const isAuthor = userId !== null && post?.user_id === userId

  const handleDelete = useCallback(() => {
    if (!post) return
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning) } catch {}
    Alert.alert(t('post.delete'), t('post.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('post.delete'), style: 'destructive',
        onPress: async () => {
          try {
            // Soft-delete: mark inactive so the user can undo within 10 seconds
            const { error } = await (supabase.from('posts') as any).update({ is_active: false }).eq('id', post.id)
            if (error) {
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error) } catch {}
              toast.show({ message: t('post.deleteFailed'), type: 'error' })
              return
            }
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
            setPost(prev => prev ? { ...prev, is_active: false } : prev)
            setUndoBarVisible(true)
            // Hard-delete after 10 seconds if user doesn't undo
            if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
            undoTimeoutRef.current = setTimeout(async () => {
              setUndoBarVisible(false)
              try {
                await Promise.allSettled([
                  (supabase.from('post_comments') as any).delete().eq('post_id', post.id),
                  (supabase.from('post_likes') as any).delete().eq('post_id', post.id),
                  (supabase.from('post_images') as any).delete().eq('post_id', post.id),
                  (supabase.from('saved_posts') as any).delete().eq('post_id', post.id),
                  (supabase.from('post_embeddings') as any).delete().eq('post_id', post.id),
                  (supabase.from('notifications') as any).delete().eq('link_id', post.id).eq('link_type', 'post'),
                ])
                await (supabase.from('posts') as any).delete().eq('id', post.id)
              } catch {
                // Fire-and-forget — hard delete on timeout
              }
              router.back()
            }, 10000)
          } catch {
            toast.show({ message: t('post.deleteFailed'), type: 'error' })
          }
        },
      },
    ])
  }, [post, supabase, t, toast, router, undoTimeoutRef])

  const handleUndoDelete = useCallback(async () => {
    if (!post) return
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current)
    setUndoBarVisible(false)
    try {
      const { error } = await (supabase.from('posts') as any).update({ is_active: true }).eq('id', post.id)
      if (error) {
        toast.show({ message: t('post.updateFailed'), type: 'error' })
      } else {
        setPost(prev => prev ? { ...prev, is_active: true } : prev)
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
      }
    } catch {
      toast.show({ message: t('post.updateFailed'), type: 'error' })
    }
  }, [post, supabase, t, toast, undoTimeoutRef])

  const handleMarkClosed = useCallback(async () => {
    if (!post) return
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning) } catch {}
    Alert.alert(t('post.markClosed'), t('post.markClosedConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: async () => {
          const { error } = await (supabase.from('posts') as any).update({ is_active: false }).eq('id', post.id)
          if (error) { toast.show({ message: t('post.updateFailed'), type: 'error' }) }
          else { setPost(prev => prev ? { ...prev, is_active: false } : prev); toast.show({ message: t('post.markedClosed'), type: 'success' }) }
        },
      },
    ])
  }, [post, supabase, t])

  const handleReopen = useCallback(async () => {
    if (!post) return
    const { error } = await (supabase.from('posts') as any).update({ is_active: true }).eq('id', post.id)
    if (error) { toast.show({ message: t('post.updateFailed'), type: 'error' }) }
    else { setPost(prev => prev ? { ...prev, is_active: true } : prev) }
  }, [post, supabase, t, toast])

  const handleStatusChange = useCallback(() => {
    if (!post) return
    const statusOptions: { label: string; value: PostStatus }[] = [
      { label: t('post.statusActive'), value: 'active' },
      { label: t('post.statusReserved'), value: 'reserved' },
      { label: t('post.statusCompleted'), value: 'completed' },
    ]
    const labels = [...statusOptions.map(o => o.label), t('common.cancel')]
    const applyStatus = async (newStatus: PostStatus) => {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
      const { error } = await (supabase.from('posts') as any).update({ status: newStatus }).eq('id', post.id)
      if (error) { toast.show({ message: t('post.statusUpdateFailed'), type: 'error' }) }
      else { setPost(prev => prev ? { ...prev, status: newStatus } : prev); toast.show({ message: t('post.statusUpdated'), type: 'success' }) }
    }
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: labels, cancelButtonIndex: labels.length - 1 },
        (i) => { if (i < statusOptions.length) applyStatus(statusOptions[i].value) },
      )
    } else {
      Alert.alert(t('post.changeStatus'), '', labels.map((text, i) => ({
        text,
        style: i === labels.length - 1 ? 'cancel' : undefined,
        onPress: i < statusOptions.length ? () => applyStatus(statusOptions[i].value) : undefined,
      })))
    }
  }, [post, supabase, t, toast])

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
      setEditModalVisible(false); toast.show({ message: t('post.updated'), type: 'success' })
    } catch (err) {
      toast.show({ message: t('post.updateFailed'), type: 'error' })
      if (__DEV__) console.warn('[PostDetail] edit save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [post, editTitle, editDescription, editLocation, saving, supabase, t, toast])

  const handleMorePress = useCallback(() => {
    if (!post || !isAuthor) return
    // Build option labels and corresponding actions in same order
    const labels: string[] = [t('post.edit')]
    const actions: (() => void)[] = [openEditModal]
    if (post.is_active) {
      labels.push(t('post.markClosed'))
      actions.push(handleMarkClosed)
    } else {
      labels.push(t('post.reopen'))
      actions.push(handleReopen)
    }
    labels.push(t('post.delete'))
    actions.push(handleDelete)
    labels.push(t('common.cancel'))
    actions.push(() => {})

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: labels,
          destructiveButtonIndex: labels.length - 2, // Delete is second-to-last
          cancelButtonIndex: labels.length - 1,       // Cancel is last
        },
        (buttonIndex) => {
          if (buttonIndex >= 0 && buttonIndex < actions.length) {
            actions[buttonIndex]()
          }
        },
      )
    } else {
      // Android fallback: Alert.alert with buttons
      Alert.alert('', '', labels.map((text, i) => ({
        text,
        style: i === labels.length - 2 ? 'destructive' : i === labels.length - 1 ? 'cancel' : undefined,
        onPress: actions[i],
      })))
    }
  }, [post, isAuthor, t, openEditModal, handleDelete, handleMarkClosed, handleReopen])

  const handleReport = useCallback(() => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (!post) return
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning) } catch {}
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
  const depositAmount = useMemo(() => {
    if (!post?.daily_fee) return 0
    return suggestDeposit(post.daily_fee, post.tags ?? [])
  }, [post?.daily_fee, post?.tags])

  const depositRange = useMemo(() => {
    const tags = post?.tags ?? []
    const match = tags.find((t: string) => t in DEPOSIT_SUGGESTIONS)
    if (match) return DEPOSIT_SUGGESTIONS[match]
    return { min: 50, max: 300 }
  }, [post?.tags])

  const depositOutOfRange = useMemo(() => {
    if (!depositAmount) return false
    return depositAmount < depositRange.min || depositAmount > depositRange.max
  }, [depositAmount, depositRange])

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
          if (!booking.start_date || !booking.end_date) continue
          // Use date strings directly to avoid DST issues with setDate() iteration
          const startParts = booking.start_date.split('T')[0].split('-').map(Number)
          const endParts = booking.end_date.split('T')[0].split('-').map(Number)
          if (startParts.length < 3 || endParts.length < 3) continue
          const startMs = Date.UTC(startParts[0], startParts[1] - 1, startParts[2])
          const endMs = Date.UTC(endParts[0], endParts[1] - 1, endParts[2])
          if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) continue
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
    if (post.user_id === userId) { toast.show({ message: t('post.cannotMessageSelf'), type: 'error' }); return }
    if (bookingDays <= 0 || !bookingStartDate || !bookingEndDate) { toast.show({ message: t('rental.endDateAfterStart'), type: 'error' }); return }
    // Trust tier enforcement on buyer side
    if (trust.permissions.maxDailyFee !== null && post.daily_fee && post.daily_fee > trust.permissions.maxDailyFee) {
      toast.show({ message: t('trust.maxDailyFeeExceeded', { max: trust.permissions.maxDailyFee }), type: 'error' })
      return
    }
    setSendingBooking(true)
    let createdBookingId: string | null = null
    try {
      const { data: booking, error: bookingError } = await (supabase.from('rental_bookings') as any)
        .insert({ post_id: id, borrower_id: userId, lender_id: post.user_id, start_date: bookingStartDate, end_date: bookingEndDate, daily_fee: post.daily_fee, service_fee: serviceFee, total_amount: bookingTotal, deposit_amount: depositAmount, deposit_status: 'authorized', status: 'pending' })
        .select('id').single()
      if (bookingError || !booking) { toast.show({ message: t('rental.bookingFailed'), type: 'error' }); setSendingBooking(false); return }
      createdBookingId = booking.id
      const amountCents = Math.round(bookingTotal * 100)
      const sessionId = await createPayment({ amount: amountCents, description: `${post.title} — ${bookingDays} ${t('rental.daysAbbr')}`, type: 'rental', postId: id, sellerId: post.user_id, metadata: { booking_id: booking.id, start_date: bookingStartDate, end_date: bookingEndDate, booking_days: String(bookingDays) } })
      if (sessionId) {
        const { error: updateError } = await (supabase.from('rental_bookings') as any).update({ stripe_session_id: sessionId }).eq('id', booking.id)
        if (updateError && __DEV__) console.error('[bookings] CRITICAL: failed to link Stripe session to booking:', updateError.message)
      }
      setBookingModalVisible(false); setBookingStartDate(null); setBookingEndDate(null)
      if (!sessionId) {
        // TODO: UX — Stripe payment not yet implemented in Expo Go. Booking is created with status='pending'.
        // When Stripe is available, the user will be redirected to Stripe Checkout.
        // If payment is not completed, the booking stays 'pending' — add a timeout/cleanup job
        // and a "Retry payment" or "Cancel booking" button in /bookings screen.
        toast.show({ message: t('rental.bookingCreated'), type: 'success' })
      } else {
        toast.show({ message: t('rental.bookingCreatedPaymentPending'), type: 'info' })
      }
    } catch {
      // Roll back the booking row if Stripe session creation threw — otherwise
      // zombie pending bookings accumulate and block future reservations
      if (createdBookingId) {
        const { error: rollbackErr } = await (supabase.from('rental_bookings') as any).delete().eq('id', createdBookingId)
        if (rollbackErr && __DEV__) console.error('[post] booking rollback failed — zombie booking may block future reservations:', rollbackErr.message)
      }
      toast.show({ message: t('rental.bookingFailed'), type: 'error' })
    }
    finally { setSendingBooking(false) }
  }, [userId, post, sendingBooking, paymentLoading, bookingDays, bookingStartDate, bookingEndDate, bookingTotal, serviceFee, id, supabase, router, t, toast, createPayment, trust])

  // Service pricing
  const svcFee = useMemo(() => {
    if (!post?.service_price) return 0
    return Math.round(post.service_price * SERVICE_FEE_RATE * 100) / 100
  }, [post?.service_price])
  const svcTotal = useMemo(() => (post?.service_price ?? 0) + svcFee, [post?.service_price, svcFee])

  const handlePayForService = useCallback(async () => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (!post || sendingService || paymentLoading) return
    if (post.user_id === userId) { toast.show({ message: t('post.cannotMessageSelf'), type: 'error' }); return }
    // Trust tier enforcement on buyer side
    if (trust.permissions.maxServicePrice !== null && post.service_price && post.service_price > trust.permissions.maxServicePrice) {
      toast.show({ message: t('service.maxPriceExceeded', { max: trust.permissions.maxServicePrice }), type: 'error' })
      return
    }
    setSendingService(true)
    let createdBookingId: string | null = null
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
      if (bookingError || !booking) { toast.show({ message: t('service.bookingFailed'), type: 'error' }); setSendingService(false); return }
      createdBookingId = booking.id

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
        toast.show({ message: t('service.bookingCreated'), type: 'success' })
      } else {
        toast.show({ message: t('service.bookingCreatedPaymentPending'), type: 'info' })
      }
    } catch {
      // Roll back the service booking if Stripe session creation threw
      if (createdBookingId) {
        await (supabase.from('service_bookings') as any).delete().eq('id', createdBookingId).catch(() => {})
      }
      toast.show({ message: t('service.bookingFailed'), type: 'error' })
    } finally {
      setSendingService(false)
    }
  }, [userId, post, sendingService, paymentLoading, svcFee, svcTotal, serviceNotes, id, supabase, router, t, toast, createPayment, trust])

  const renderCommentItem = (c: PostComment, isReply: boolean) => (
    <View key={c.id} style={[styles.commentRow, isReply && styles.replyRow, { borderBottomColor: colors.border }]}>
      <Avatar url={c.user?.avatar_url} name={c.user?.name} size={isReply ? 28 : 36} />
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
        {/* Minimal back button overlay for loading state */}
        <View style={[styles.heroNav, { top: insets.top + 16 }]}>
          <PressableOpacity onPress={() => router.back()} hitSlop={12} style={[styles.heroCircle, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)' }]} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <ArrowLeft size={18} color={colors.foreground} />
          </PressableOpacity>
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
        <View style={[styles.heroNav, { top: insets.top + 16 }]}>
          <PressableOpacity onPress={() => router.back()} hitSlop={12} style={[styles.heroCircle, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)' }]} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <ArrowLeft size={18} color={colors.foreground} />
          </PressableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={[styles.notFound, { color: colors.mutedForeground, marginBottom: 16 }]}>{loadError}</Text>
          <PressableOpacity onPress={() => loadPost()} style={{ paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.foreground, borderRadius: 999 }} accessibilityRole="button" accessibilityLabel={t('common.retry')}>
            <Text style={{ color: colors.primaryForeground, fontFamily: fonts.bodyMedium, fontSize: 15 }}>{t('common.retry')}</Text>
          </PressableOpacity>
        </View>
      </View>
    )
  }

  if (!post) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.heroNav, { top: insets.top + 16 }]}>
          <PressableOpacity onPress={() => router.back()} hitSlop={12} style={[styles.heroCircle, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)' }]} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <ArrowLeft size={18} color={colors.foreground} />
          </PressableOpacity>
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

  const isItemExchange = post?.type === 'ilmaista' || post?.type === 'lainaa' || (post?.type === 'tarjoan' && post?.tags?.includes('tarjoan_item'))

  return (
    <FadeIn style={{ flex: 1 }}>
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Hero nav overlay — back + heart circles on top of photo */}
      <View style={[styles.heroNav, { top: insets.top + 16 }]} pointerEvents="box-none">
        <PressableOpacity onPress={() => router.back()} hitSlop={12} style={[styles.heroCircle, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)' }]} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={18} color={colors.foreground} />
        </PressableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PressableOpacity onPress={toggleSave} hitSlop={8} style={[styles.heroCircle, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)' }]} accessibilityRole="button" accessibilityLabel={t('common.save')} accessibilityState={{ selected: isSaved }}>
            <Bookmark size={16} color={isSaved ? colors.foreground : colors.foreground} fill={isSaved ? colors.foreground : 'transparent'} />
          </PressableOpacity>
          {isAuthor ? (
            <PressableOpacity onPress={handleMorePress} hitSlop={8} style={[styles.heroCircle, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)' }]} accessibilityRole="button" accessibilityLabel={t('feed.moreOptions')}>
              <MoreHorizontal size={18} color={colors.foreground} />
            </PressableOpacity>
          ) : userId ? (
            <PressableOpacity onPress={handleReport} hitSlop={8} style={[styles.heroCircle, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)' }]} accessibilityRole="button" accessibilityLabel={t('post.report')}>
              <Flag size={16} color={colors.foreground} />
            </PressableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPost() }} tintColor={colors.foreground} />}>
        {/* Full-bleed hero photo — 260px height */}
        {allImages.length > 0 ? (
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
                  <Image source={{ uri: getImageUrl(item, 'medium')! }} style={[styles.heroImage, { width: screenWidth }]} contentFit="cover" cachePolicy="memory-disk" />
                </PressableOpacity>
              )}
              showsHorizontalScrollIndicator={false}
            />
          )
        ) : (
          <View style={[styles.heroImage, { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
            {category && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: category.color }} />}
          </View>
        )}

        {/* Body card — overlaps bottom of photo */}
        <View style={[styles.bodyCard, { backgroundColor: colors.background }]}>
          {/* Closed/inactive banner */}
          {!post.is_active && (
            <View style={[styles.closedBanner, { backgroundColor: `${colors.destructive}15` }]}>
              <XCircle size={16} color={colors.destructive} />
              <Text style={[styles.closedBannerText, { color: colors.destructive }]}>{t('post.closedBanner')}</Text>
            </View>
          )}

          {/* Title + rating row */}
          <View style={styles.titleRatingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]} accessibilityRole="header">{post.title}</Text>
            </View>
            {authorRating && (
              <View style={styles.ratingBlock}>
                <View style={styles.ratingInline}>
                  <Star size={12} color={colors.foreground} fill={colors.foreground} strokeWidth={0} />
                  <Text style={[styles.ratingValue, { color: colors.foreground }]}>{authorRating.avg}</Text>
                </View>
                <Text style={[styles.ratingCount, { color: colors.mutedForeground }]}>
                  {authorRating.count} {t('post.reviews') ?? 'arvostelua'}
                </Text>
              </View>
            )}
          </View>

          {/* Location row with pin icon in ink circle */}
          {post.location && (
            <View style={styles.locationRow}>
              <View style={[styles.locationPinCircle, { backgroundColor: colors.foreground }]}>
                <MapPin size={9} color={colors.background} />
              </View>
              <Text style={[styles.locationText, { color: colors.mutedForeground }]}>{post.location}</Text>
            </View>
          )}

          {/* Category + expiration + status badges */}
          <View style={styles.badgeRow}>
            {category && (
              <View style={styles.categoryRow}>
                <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                <Text style={[styles.categoryLabel, { color: colors.mutedForeground }]}>
                  {t(category.label)}
                </Text>
              </View>
            )}
            {expirationInfo && (
              <View style={[styles.expirationBadge, { backgroundColor: `${expirationInfo.color}18` }]}>
                <Clock size={12} color={expirationInfo.color} />
                <Text style={[styles.expirationText, { color: expirationInfo.color }]}>{expirationInfo.label}</Text>
              </View>
            )}
            {(post as any).status === 'reserved' && (
              <View style={[styles.expirationBadge, { backgroundColor: '#F59E0B18' }]}>
                <Text style={[styles.expirationText, { color: '#F59E0B' }]}>{t('post.statusReserved')}</Text>
              </View>
            )}
            {(post as any).status === 'completed' && (
              <View style={[styles.expirationBadge, { backgroundColor: `${colors.mutedForeground}18` }]}>
                <Text style={[styles.expirationText, { color: colors.mutedForeground }]}>{t('post.statusCompleted')}</Text>
              </View>
            )}
          </View>

          {/* Pricing */}
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
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.purpleMuted }}>
                <Text style={{ fontSize: 12, color: colors.purple, fontFamily: fonts.bodySemi, lineHeight: 16 }}>
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
            <Text style={{ fontSize: 11, color: colors.mutedForeground, lineHeight: 16, fontFamily: fonts.body }}>
              {t('post.priceContext', { min: priceContext.min, max: priceContext.max })}
            </Text>
          )}

          {post.is_pro_listing && (
            <View style={[styles.proBadge, { backgroundColor: `${colors.foreground}20` }]}>
              <Crown size={14} color={colors.foreground} /><Text style={[styles.proText, { color: colors.foreground }]}>Pro</Text>
            </View>
          )}

          {/* Social proof: view count */}
          {viewCount > 2 && (
            <View style={styles.socialProofRow}>
              <Eye size={13} color={colors.mutedForeground} />
              <Text style={[styles.socialProofText, { color: colors.mutedForeground }]}>
                {t('post.viewing', { count: viewCount })}
              </Text>
            </View>
          )}

          {/* Make offer button — for tarjoan items with a price, non-author */}
          {post.type === 'tarjoan' && post.service_price != null && post.service_price > 0 && !isAuthor && (
            <PressableOpacity
              onPress={() => { if (!userId) { router.push('/(auth)/login'); return } setOfferModalVisible(true) }}
              style={[styles.offerBtn, { backgroundColor: `${category?.color ?? colors.primary}15`, borderColor: category?.color ?? colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={t('offer.makeOffer')}
            >
              <DollarSign size={16} color={category?.color ?? colors.primary} />
              <Text style={[styles.offerBtnText, { color: category?.color ?? colors.primary }]}>{t('offer.makeOffer')}</Text>
            </PressableOpacity>
          )}

          {/* Description — 13px muted with "Lue lisaa" toggle */}
          {post.description ? (
            <View style={styles.descriptionBlock}>
              <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={descriptionExpanded ? undefined : 3}>
                {post.description}
              </Text>
              {post.description.length > 120 && (
                <PressableOpacity onPress={() => setDescriptionExpanded(!descriptionExpanded)} hitSlop={8} accessibilityRole="button" accessibilityLabel={descriptionExpanded ? (t('common.showLess') ?? 'Show less') : (t('common.readMore') ?? 'Read more')}>
                  <Text style={[styles.readMoreLink, { color: colors.foreground }]}>
                    {descriptionExpanded ? (t('common.showLess') ?? 'N\u00e4yt\u00e4 v\u00e4hemm\u00e4n') : (t('common.readMore') ?? 'Lue lis\u00e4\u00e4')}
                  </Text>
                </PressableOpacity>
              )}
            </View>
          ) : null}

          {post.event_date && (<Text style={[styles.eventDate, { color: colors.foreground }]}>{formatEventDate(post.event_date, locale)}</Text>)}

          {post.type === 'tapahtuma' && (
            <PressableOpacity
              onPress={() => router.push('/community-events' as any)}
              style={styles.communityEventsLink}
              accessibilityRole="link"
              accessibilityLabel={t('post.browseCommunityEvents')}
            >
              <Calendar size={14} color={colors.foreground} />
              <Text style={[styles.communityEventsLinkText, { color: colors.foreground }]}>{t('post.browseCommunityEvents')}</Text>
            </PressableOpacity>
          )}

          {/* Safety tip for item exchange posts */}
          {isItemExchange && (
            <View style={styles.safetyTip}>
              <Shield size={14} color={colors.mutedForeground} strokeWidth={1.8} />
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.body, flex: 1, lineHeight: 16 }}>
                {t('post.safetyTip') || 'Tapaa julkisella paikalla. \u00c4l\u00e4 jaa henkil\u00f6kohtaisia tietoja ennen tapaamista.'}
              </Text>
            </View>
          )}

          {/* Author action buttons */}
          {isAuthor && (
            <View style={styles.authorActionsRow}>
              <PressableOpacity onPress={openEditModal} style={[styles.authorActionBtn, { backgroundColor: `${colors.foreground}15` }]} accessibilityRole="button" accessibilityLabel={t('post.edit')}>
                <Pencil size={14} color={colors.foreground} />
                <Text style={[styles.authorActionText, { color: colors.foreground }]}>{t('post.edit')}</Text>
              </PressableOpacity>
              <PressableOpacity onPress={handleStatusChange} style={[styles.authorActionBtn, { backgroundColor: '#F59E0B18' }]} accessibilityRole="button" accessibilityLabel={t('post.changeStatus')}>
                <ChevronDown size={14} color="#F59E0B" />
                <Text style={[styles.authorActionText, { color: '#F59E0B' }]}>{t('post.changeStatus')}</Text>
              </PressableOpacity>
              {post.is_active ? (
                <PressableOpacity onPress={handleMarkClosed} style={[styles.authorActionBtn, { backgroundColor: `${colors.mutedForeground}15` }]} accessibilityRole="button" accessibilityLabel={t('post.markClosed')}>
                  <XCircle size={14} color={colors.mutedForeground} />
                  <Text style={[styles.authorActionText, { color: colors.mutedForeground }]}>{t('post.markClosed')}</Text>
                </PressableOpacity>
              ) : (
                <PressableOpacity onPress={handleReopen} style={[styles.authorActionBtn, { backgroundColor: `${colors.foreground}15` }]} accessibilityRole="button" accessibilityLabel={t('post.reopen')}>
                  <Text style={[styles.authorActionText, { color: colors.foreground }]}>{t('post.reopen')}</Text>
                </PressableOpacity>
              )}
              <PressableOpacity onPress={handleDelete} style={[styles.authorActionBtn, { backgroundColor: `${colors.destructive}15` }]} accessibilityRole="button" accessibilityLabel={t('post.delete')}>
                <Trash2 size={14} color={colors.destructive} />
                <Text style={[styles.authorActionText, { color: colors.destructive }]}>{t('post.delete')}</Text>
              </PressableOpacity>
            </View>
          )}

          {/* Booking / service CTA buttons */}
          {FEATURES.PAYMENTS && post.type === 'lainaa' && post.daily_fee !== null && !isAuthor && (
            <PressableOpacity onPress={() => { if (!userId) { router.push('/(auth)/login'); return } setBookingModalVisible(true) }} style={[styles.bookingBtn, { backgroundColor: colors.foreground }]} accessibilityRole="button" accessibilityLabel={t('post.booking')}>
              <Calendar size={16} color={colors.primaryForeground} />
              <Text style={[styles.bookingBtnText, { color: colors.primaryForeground }]}>{t('post.booking')}</Text>
            </PressableOpacity>
          )}

          {FEATURES.PAYMENTS && post.type === 'tarjoan' && post.service_price !== null && post.service_price > 0 && !post.tags?.includes('tarjoan_item') && !isAuthor && (
            <PressableOpacity onPress={() => { if (!userId) { router.push('/(auth)/login'); return } setServiceModalVisible(true) }} style={[styles.bookingBtn, { backgroundColor: category?.color ?? colors.foreground }]} accessibilityRole="button" accessibilityLabel={t('service.buyService')}>
              <ShoppingBag size={16} color={colors.primaryForeground} />
              <Text style={[styles.bookingBtnText, { color: colors.primaryForeground }]}>{t('service.buyService')}</Text>
            </PressableOpacity>
          )}

          {/* Action row */}
          <View style={[styles.actionRow, { borderTopColor: colors.border }]}>
            <PressableOpacity onPress={toggleLike} style={styles.actionItem} hitSlop={8} accessibilityRole="button" accessibilityLabel={isLiked ? t('engagement.unlike') : t('engagement.like')} accessibilityState={{ selected: isLiked }}>
              <Heart size={20} strokeWidth={1.8} color={isLiked ? colors.destructive : colors.foreground} fill={isLiked ? colors.destructive : 'transparent'} />
              {likeCount > 0 && (
                <PressableOpacity onPress={() => { setShowLikersModal(true); fetchLikers() }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('post.likedBy')}>
                  <Text style={[styles.actionText, { color: colors.mutedForeground }]}>{likeCount}</Text>
                </PressableOpacity>
              )}
            </PressableOpacity>
            <View
              style={styles.actionItem}
              accessible
              accessibilityLabel={`${comments.length} ${t('post.comments')}`}
              importantForAccessibility="yes"
            >
              <MessageCircle size={20} strokeWidth={1.8} color={colors.foreground} />
              {comments.length > 0 && (
                <Text style={[styles.actionText, { color: colors.mutedForeground }]} accessible={false}>{comments.length}</Text>
              )}
            </View>
            <PressableOpacity onPress={toggleSave} style={styles.actionItem} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.save')} accessibilityState={{ selected: isSaved }}>
              <Bookmark size={20} strokeWidth={1.8} color={isSaved ? colors.foreground : colors.foreground} fill={isSaved ? colors.foreground : 'transparent'} />
            </PressableOpacity>
            <PressableOpacity onPress={handleShare} style={styles.actionItem} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.share')}>
              <Share2 size={20} strokeWidth={1.8} color={colors.foreground} />
            </PressableOpacity>
          </View>

          {/* Author card */}
          <View style={[styles.authorCard, { borderTopColor: colors.border }]}>
            <PressableOpacity onPress={() => user?.id && router.push(`/profile/${user.id}` as any)} style={styles.authorCardRow} accessibilityRole="button" accessibilityLabel={user?.name ?? t('common.user')}>
              <Avatar url={user?.avatar_url} name={user?.name} size={44} />
              <View style={styles.authorCardInfo}>
                <View style={styles.authorNameRow}>
                  <Text style={[styles.authorName, { color: colors.foreground }]} numberOfLines={1}>{user?.name ?? t('common.user')}</Text>
                  {userTrustLevel >= 2 && <TrustBadge level={userTrustLevel} size="small" />}
                </View>
                <View style={styles.authorMeta}>
                  {post.created_at && (
                    <Text style={[styles.authorTimeAgo, { color: colors.mutedForeground }]}>
                      {formatTimeAgo(post.created_at, t, locale)}
                    </Text>
                  )}
                  {user?.naapurusto && (
                    <>
                      <Text style={[styles.authorMetaDivider, { color: colors.mutedForeground }]}>·</Text>
                      <MapPin size={11} color={colors.mutedForeground} />
                      <Text style={[styles.authorNh, { color: colors.mutedForeground }]} numberOfLines={1}>{user.naapurusto}</Text>
                    </>
                  )}
                </View>
              </View>
              {!isAuthor && (
                <View style={[styles.followBtn, { borderColor: colors.foreground }]}>
                  <Text style={[styles.followBtnText, { color: colors.foreground }]}>{t('profile.follow')}</Text>
                </View>
              )}
            </PressableOpacity>
          </View>

          {/* Related posts — "Muita lahella" section */}
          {relatedPosts.length > 0 && (
            <View style={[styles.relatedSection, { borderTopColor: colors.border }]}>
              <View style={styles.relatedHeader}>
                <Text style={[styles.relatedTitle, { color: colors.foreground }]}>{t('post.relatedListings')}</Text>
                <Text style={[styles.relatedShowAll, { color: colors.foreground }]}>{t('common.showAll') ?? 'N\u00e4yt\u00e4 kaikki'}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedScroll}>
                {relatedPosts.map((rp) => {
                  const rpCat = CATEGORIES[rp.type as PostType]
                  return (
                    <PressableOpacity key={rp.id} onPress={() => router.push(`/post/${rp.id}` as any)} style={[styles.relatedCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={styles.relatedImageWrap}>
                        {rp.image_url ? (
                          <Image source={{ uri: getImageUrl(rp.image_url, 'thumbnail')! }} style={styles.relatedImage} contentFit="cover" cachePolicy="memory-disk" />
                        ) : (
                          <View style={[styles.relatedImage, { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                            {rpCat && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: rpCat.color, marginBottom: 4 }} />}
                            <Text style={{ fontSize: 14, fontFamily: fonts.heading, color: colors.foreground }} numberOfLines={1}>{rp.title.charAt(0).toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={[styles.relatedHeartCircle, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)' }]}>
                          <Heart size={14} color={colors.foreground} />
                        </View>
                      </View>
                      <View style={styles.relatedCardBody}>
                        <Text style={[styles.relatedCardTitle, { color: colors.foreground }]} numberOfLines={1}>{rp.title}</Text>
                        {rp.location && (
                          <Text style={[styles.relatedCardLocation, { color: colors.mutedForeground }]} numberOfLines={1}>{rp.location}</Text>
                        )}
                        <View style={styles.relatedCardFooter}>
                          <View style={styles.ratingInline}>
                            <Star size={10} color={colors.foreground} fill={colors.foreground} strokeWidth={0} />
                          </View>
                          <View style={[styles.relatedCardArrow, { backgroundColor: colors.foreground }]}>
                            <ChevronRight size={11} color={colors.background} />
                          </View>
                        </View>
                      </View>
                    </PressableOpacity>
                  )
                })}
              </ScrollView>
            </View>
          )}

          {/* Threaded Comments */}
          <View style={[styles.commentSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.commentTitle, { color: colors.foreground }]}>
              {comments.length === 0 ? t('post.beFirstComment') : `${t('post.comments')} (${comments.length})`}
            </Text>

            {topLevelComments.map((c) => {
              const replies = repliesByParent[c.id] ?? []
              const isExpanded = expandedReplies.has(c.id)
              return (
                <View key={c.id}>
                  {renderCommentItem(c, false)}
                  {replies.length > 0 && (
                    <PressableOpacity onPress={() => toggleReplies(c.id)} style={styles.showRepliesBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={isExpanded ? t('post.hideReplies') : t('post.showReplies', { count: replies.length })}>
                      {isExpanded ? <ChevronUp size={14} color={colors.foreground} /> : <ChevronDown size={14} color={colors.foreground} />}
                      <Text style={[styles.showRepliesText, { color: colors.foreground }]}>
                        {isExpanded ? t('post.hideReplies') : t('post.showReplies', { count: replies.length })}
                      </Text>
                    </PressableOpacity>
                  )}
                  {isExpanded && replies.map(reply => renderCommentItem(reply, true))}
                </View>
              )
            })}

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
            <TextInput style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} value={editTitle} onChangeText={setEditTitle} maxLength={100} accessibilityLabel={t('post.titleLabel')} />
            <Text style={{ fontSize: 11, color: editTitle.length >= 90 ? colors.destructive : colors.mutedForeground, textAlign: 'right', fontFamily: fonts.body, lineHeight: 16 }}>{editTitle.length}/100</Text>
            <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{t('post.descriptionLabel')}</Text>
            <TextInput style={[styles.modalInput, styles.modalTextArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} value={editDescription} onChangeText={setEditDescription} multiline numberOfLines={5} textAlignVertical="top" maxLength={2000} inputAccessoryViewID={KEYBOARD_DONE_ID} accessibilityLabel={t('post.descriptionLabel')} />
            <Text style={{ fontSize: 11, color: editDescription.length >= 1900 ? colors.destructive : colors.mutedForeground, textAlign: 'right', fontFamily: fonts.body, lineHeight: 16 }}>{editDescription.length}/2000</Text>
            <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{t('post.locationLabel')}</Text>
            <TextInput style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} value={editLocation} onChangeText={setEditLocation} maxLength={100} accessibilityLabel={t('post.locationLabel')} />
            <PressableOpacity onPress={handleSaveEdit} disabled={saving || !editTitle.trim()} style={[styles.saveBtn, { backgroundColor: saving || !editTitle.trim() ? colors.muted : colors.foreground }]}>
              {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>{t('post.saveChanges')}</Text>}
            </PressableOpacity>
          </View>
          <KeyboardDoneAccessory />
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
                <View style={{ flex: 1, height: 3, borderRadius: 1.5, backgroundColor: colors.foreground }} />
                <View style={{ flex: 1, height: 3, borderRadius: 1.5, backgroundColor: bookingDays > 0 ? colors.foreground : colors.muted }} />
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
                  <View style={styles.pricingRow}>
                    <Pressable style={styles.pricingLabelRow} onPress={() => setServiceFeeInfoVisible(true)} hitSlop={8}>
                      <Text style={[styles.pricingLabel, { color: colors.mutedForeground }]}>{t('rental.serviceFee')} ({t('rental.serviceFeeNote')})</Text>
                      <Info size={13} color={colors.mutedForeground} />
                    </Pressable>
                    <Text style={[styles.pricingValue, { color: colors.foreground }]}>{formatPrice(serviceFee, locale)}</Text>
                  </View>
                  <View>
                    <View style={styles.pricingRow}>
                      <Pressable style={styles.pricingLabelRow} onPress={() => setDepositInfoVisible(true)} hitSlop={8}>
                        <Text style={[styles.pricingLabel, { color: colors.mutedForeground }]}>{t('rental.deposit')}</Text>
                        <Info size={13} color={colors.mutedForeground} />
                      </Pressable>
                      <Text style={[styles.pricingValue, { color: depositOutOfRange ? colors.destructive : colors.foreground }]}>{formatPrice(depositAmount, locale)}</Text>
                    </View>
                    <Text style={{ fontSize: 11, fontFamily: fonts.body, color: depositOutOfRange ? colors.destructive : colors.mutedForeground, lineHeight: 15, marginTop: 2 }}>
                      {depositOutOfRange
                        ? t('post.depositOutOfRange')
                        : t('post.depositSuggestedRange', { min: depositRange.min, max: depositRange.max })}
                    </Text>
                  </View>
                  <View style={[styles.pricingRow, styles.pricingTotalRow, { borderTopColor: colors.border }]}><Text style={[styles.pricingTotalLabel, { color: colors.foreground }]}>{t('rental.total')}</Text><Text style={[styles.bookingTotalPrice, { color: colors.foreground }]}>{formatPrice(bookingTotal, locale)}</Text></View>
                </View>
              )}
              {bookingDays > 0 && (<Text style={[styles.confirmNote, { color: colors.mutedForeground }]}>{t('rental.confirmationNote')}</Text>)}
              {paymentError && (<Text style={[styles.errorText, { color: colors.destructive }]}>{paymentError}</Text>)}
              <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: 'center', lineHeight: 16, fontFamily: fonts.body }}>{t('payment.opensInBrowser')}</Text>
              <PressableOpacity onPress={handlePayAndBook} disabled={sendingBooking || paymentLoading || bookingDays <= 0}
                style={[styles.payBookBtn, { backgroundColor: sendingBooking || paymentLoading || bookingDays <= 0 ? colors.muted : colors.foreground, marginTop: 16, marginBottom: 8 }]}>
                {sendingBooking || paymentLoading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : (<><Calendar size={16} color={colors.primaryForeground} /><Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>{t('rental.payAndBook')}</Text></>)}
              </PressableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Deposit Info Modal */}
      <Modal visible={depositInfoVisible} animationType="fade" transparent onRequestClose={() => setDepositInfoVisible(false)}>
        <Pressable style={styles.infoModalOverlay} onPress={() => setDepositInfoVisible(false)}>
          <Pressable style={[styles.infoModalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={[styles.infoModalTitle, { color: colors.foreground }]}>{t('rental.deposit')}</Text>
            <Text style={[styles.infoModalBody, { color: colors.mutedForeground }]}>{t('post.depositInfo')}</Text>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Service Fee Info Modal */}
      <Modal visible={serviceFeeInfoVisible} animationType="fade" transparent onRequestClose={() => setServiceFeeInfoVisible(false)}>
        <Pressable style={styles.infoModalOverlay} onPress={() => setServiceFeeInfoVisible(false)}>
          <Pressable style={[styles.infoModalCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={[styles.infoModalTitle, { color: colors.foreground }]}>{t('rental.serviceFee')}</Text>
            <Text style={[styles.infoModalBody, { color: colors.mutedForeground }]}>{t('post.serviceFeeInfo')}</Text>
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
              inputAccessoryViewID={KEYBOARD_DONE_ID}
              accessibilityLabel={t('service.notesLabel')}
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
                  <Text style={[styles.bookingTotalPrice, { color: category?.color ?? colors.foreground }]}>{formatPrice(svcTotal, locale)}</Text>
                </View>
              </View>
            )}

            <Text style={{ fontSize: 12, fontFamily: fonts.body, color: colors.mutedForeground, lineHeight: 16, marginTop: 4 }}>{t('service.escrowNote')}</Text>

            {paymentError && (<Text style={[styles.errorText, { color: colors.destructive }]}>{paymentError}</Text>)}

            <Text style={{ fontSize: 11, color: colors.mutedForeground, textAlign: 'center', lineHeight: 16, fontFamily: fonts.body }}>{t('payment.opensInBrowser')}</Text>

            <PressableOpacity
              onPress={handlePayForService}
              disabled={sendingService || paymentLoading}
              style={[styles.payBookBtn, { backgroundColor: sendingService || paymentLoading ? colors.muted : (category?.color ?? colors.foreground), marginTop: 16, marginBottom: 8 }]}
            >
              {sendingService || paymentLoading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <ShoppingBag size={16} color={colors.primaryForeground} />
                  <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>{t('service.payAndBook')}</Text>
                </>
              )}
            </PressableOpacity>
          </Pressable>
        </Pressable>
        <KeyboardDoneAccessory />
      </Modal>

      {/* Sticky bottom bar — comment input always visible + optional Lähetä viesti */}
      {post && userId && (
        <View style={[ctaStyles.bar, {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom + 8,
        }]}>
          {replyToComment && (
            <View style={[ctaStyles.replyIndicator, { backgroundColor: `${colors.foreground}10`, borderColor: colors.foreground }]}>
              <Reply size={12} color={colors.foreground} />
              <Text style={[ctaStyles.replyIndicatorText, { color: colors.foreground }]} numberOfLines={1}>
                {t('post.replyingTo', { name: replyToComment.user?.name ?? t('common.user') })}
              </Text>
              <PressableOpacity onPress={() => setReplyToComment(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.cancel')}><X size={14} color={colors.mutedForeground} /></PressableOpacity>
            </View>
          )}
          <View style={ctaStyles.inputRow}>
            <View style={[ctaStyles.commentInput, { backgroundColor: colors.muted }]}>
              <TextInput
                style={[ctaStyles.commentTextInput, { color: colors.foreground }]}
                value={commentText} onChangeText={setCommentText}
                placeholder={replyToComment ? t('post.writeReply') : t('post.addComment')}
                placeholderTextColor={colors.mutedForeground} maxLength={500}
                accessibilityLabel={replyToComment ? t('post.writeReply') : t('post.addComment')}
              />
              {commentText.length > 0 && (
                <Text style={[ctaStyles.charCount, { color: commentText.length >= 450 ? colors.destructive : colors.mutedForeground }]}>
                  {commentText.length}/500
                </Text>
              )}
              <Pressable onPress={handleSendComment} disabled={!commentText.trim() || sendingComment}
                hitSlop={8}
                accessibilityRole="button" accessibilityLabel={t('post.sendComment')}
                accessibilityState={{ busy: sendingComment, disabled: !commentText.trim() || sendingComment }}
                style={({ pressed }) => [ctaStyles.sendBtn, { backgroundColor: commentText.trim() ? colors.foreground : 'transparent', opacity: (!commentText.trim()) ? 0.4 : pressed ? 0.7 : 1 }]}>
                {sendingComment ? (
                  <ActivityIndicator size="small" color={commentText.trim() ? colors.background : colors.mutedForeground} />
                ) : (
                  <Send size={14} color={commentText.trim() ? colors.background : colors.mutedForeground} />
                )}
              </Pressable>
            </View>
            {post.user_id !== userId && (
              <PressableOpacity
                onPress={handleMessage}
                style={[ctaStyles.messageBtn, { backgroundColor: colors.foreground }]}
                accessibilityRole="button" accessibilityLabel={t('post.sendMessage')}
              >
                <Text style={[ctaStyles.messageBtnText, { color: colors.background }]}>
                  {t('post.message')}
                </Text>
              </PressableOpacity>
            )}
          </View>
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
              <ActivityIndicator size="large" color={colors.foreground} style={{ marginTop: 40 }} />
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
      {post && userId && post.service_price != null && post.service_price > 0 && (
        <OfferModal
          visible={offerModalVisible}
          onClose={() => setOfferModalVisible(false)}
          postId={post.id}
          postTitle={post.title}
          sellerId={post.user_id}
          sellerName={(post.user as any)?.name ?? ''}
          listedPrice={post.service_price}
          userId={userId}
        />
      )}

      {/* Undo delete bar — shows for 10s after soft-delete */}
      {undoBarVisible && (
        <View style={[undoStyles.bar, { backgroundColor: colors.card, borderColor: colors.border, bottom: insets.bottom + 88 }]}>
          <Text style={[undoStyles.label, { color: colors.foreground }]}>{t('post.deletedUndo')}</Text>
          <PressableOpacity onPress={handleUndoDelete} style={[undoStyles.btn, { backgroundColor: colors.foreground }]} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('post.undo')}>
            <Text style={[undoStyles.btnText, { color: colors.background }]}>{t('post.undo')}</Text>
          </PressableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
    </FadeIn>
  )
}

const undoStyles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
    zIndex: 30,
    shadowColor: '#1A1D1F', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  label: { fontSize: 14, fontFamily: fonts.bodyMedium, lineHeight: 20, flex: 1 },
  btn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  btnText: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 18 },
})

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  // Full-bleed hero photo — 260px fixed height
  heroImage: { width: '100%', height: 260 },
  // Body card — overlaps bottom of photo per mockup 02
  bodyCard: {
    marginTop: -22, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 22, paddingHorizontal: 20, paddingBottom: 16,
    position: 'relative', zIndex: 2, gap: 14,
  },
  closedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  closedBannerText: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 18 },
  authorActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  authorActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, minHeight: 44 },
  authorActionText: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 16 },

  // Category — Threads-style dot + muted uppercase label
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  categoryDot: { width: 6, height: 6, borderRadius: 3 },
  categoryLabel: { fontSize: 11, fontFamily: fonts.bodySemi, letterSpacing: 0.3, textTransform: 'uppercase', lineHeight: 12 },

  expirationBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  expirationText: { fontSize: 11, fontFamily: fonts.bodySemi, lineHeight: 16 },
  title: { fontSize: 22, fontFamily: fonts.heading, lineHeight: 28, letterSpacing: -0.4 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  proText: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 18 },
  price: { fontSize: 18, fontFamily: fonts.heading, lineHeight: 24 },
  eventDate: { fontSize: 14, fontFamily: fonts.bodyMedium, lineHeight: 20 },
  description: { fontSize: 14, fontFamily: fonts.body, lineHeight: 22, maxWidth: 560 },
  communityEventsLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  communityEventsLinkText: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  locationPinCircle: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  locationText: { fontSize: 13, fontFamily: fonts.body, lineHeight: 18 },

  // Action row — hairline top border, Threads-style thin icons
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 2 },
  actionText: { fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 18 },

  // Author card — Threads-style, hairline top border, no bg
  authorCard: { paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  authorCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  authorCardInfo: { flex: 1, gap: 4 },
  authorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'nowrap' },
  authorName: { fontSize: 15, fontFamily: fonts.headingSemi, lineHeight: 20, flexShrink: 1 },
  authorMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  authorMetaDivider: { fontSize: 13, lineHeight: 18 },
  authorTimeAgo: { fontSize: 13, fontFamily: fonts.body, lineHeight: 18 },
  authorLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  authorNh: { fontSize: 13, fontFamily: fonts.body, lineHeight: 18 },
  followBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, backgroundColor: 'transparent' },
  followBtnText: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 18 },

  notFound: { fontSize: 16, fontFamily: fonts.body, textAlign: 'center', marginTop: 100, lineHeight: 24 },
  commentSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, marginTop: 8, gap: 12 },
  commentTitle: { fontSize: 15, fontFamily: fonts.heading, lineHeight: 20 },
  commentRow: { flexDirection: 'row', gap: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  commentAvatar: { width: 36, height: 36, borderRadius: 18 },
  commentBody: { flex: 1, gap: 4 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentName: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 18, flex: 1 },
  commentTime: { fontSize: 12, fontFamily: fonts.body, lineHeight: 16 },
  commentContent: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20 },
  replyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, minHeight: 44, paddingVertical: 8 },
  replyBtnText: { fontSize: 11, fontFamily: fonts.bodyMedium, lineHeight: 16 },
  replyRow: { marginLeft: 48 },
  replyLine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, borderRadius: 1 },
  replyAvatar: { width: 28, height: 28, borderRadius: 14 },
  showRepliesBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 58, marginTop: 4 },
  showRepliesText: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 16 },
  replyIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  replyIndicatorText: { flex: 1, fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 16 },
  commentInput: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  commentTextInput: { flex: 1, fontSize: 14, fontFamily: fonts.body, minHeight: 36, lineHeight: 20 },
  commentSendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 8, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontFamily: fonts.headingSemi, lineHeight: 24 },
  modalLabel: { fontSize: 13, fontFamily: fonts.bodySemi, marginTop: 8, lineHeight: 18 },
  modalInput: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontFamily: fonts.body, minHeight: 44, marginTop: 4, lineHeight: 20 },
  modalTextArea: { minHeight: 120 },
  saveBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 999, marginTop: 16, minHeight: 48 },
  saveBtnText: { fontSize: 16, fontFamily: fonts.bodySemi, lineHeight: 24 },
  // Title + rating row
  titleRatingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  ratingBlock: { alignItems: 'flex-end', gap: 2, marginLeft: 8 },
  ratingInline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingValue: { fontSize: 13, fontFamily: fonts.heading, lineHeight: 18 },
  ratingCount: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14, textDecorationLine: 'underline' },

  // Badge row
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },

  // Description block
  descriptionBlock: { marginTop: 14, marginBottom: 4 },
  readMoreLink: { fontSize: 13, fontFamily: fonts.bodyMedium, textDecorationLine: 'underline', marginTop: 4, lineHeight: 18 },

  // Social proof
  socialProofRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  socialProofText: { fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 16 },

  // Offer button
  offerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, alignSelf: 'flex-start', marginTop: 8 },
  offerBtnText: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },

  // Safety tip
  safetyTip: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8, paddingVertical: 8 },

  relatedSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, marginTop: 8, gap: 12 },
  relatedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  relatedTitle: { fontSize: 16, fontFamily: fonts.heading, lineHeight: 22, letterSpacing: -0.15 },
  relatedShowAll: { fontSize: 12, fontFamily: fonts.bodyMedium, textDecorationLine: 'underline', lineHeight: 16 },
  relatedScroll: { gap: 12 },
  relatedCard: { width: 176, borderRadius: 20, overflow: 'hidden', borderWidth: 1 },
  relatedImageWrap: { aspectRatio: 1 / 0.82, position: 'relative' },
  relatedImage: { width: '100%', height: '100%' },
  relatedCardBody: { padding: 10, gap: 4 },
  relatedCardTitle: { fontSize: 14, fontFamily: fonts.heading, lineHeight: 18 },
  relatedCardLocation: { fontSize: 11, fontFamily: fonts.body, lineHeight: 16 },
  relatedCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  relatedCardArrow: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  relatedHeartCircle: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  bookingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 999, alignSelf: 'flex-start' },
  bookingBtnText: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  bookingPostTitle: { fontSize: 16, fontFamily: fonts.bodySemi, lineHeight: 24 },
  bookingFee: { fontSize: 14, fontFamily: fonts.heading, lineHeight: 20 },
  bookingTotalPrice: { fontSize: 18, fontFamily: fonts.heading, lineHeight: 24 },
  datesSummary: { flexDirection: 'row', gap: 16, padding: 12, borderRadius: 20, marginTop: 12 },
  datesSummaryItem: { flex: 1, gap: 2 },
  datesSummaryLabel: { fontSize: 11, fontFamily: fonts.bodySemi, textTransform: 'uppercase', letterSpacing: 0.3 },
  datesSummaryValue: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  pricingBreakdown: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, marginTop: 12, gap: 8 },
  pricingTitle: { fontSize: 14, fontFamily: fonts.headingSemi, marginBottom: 4, lineHeight: 20 },
  pricingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pricingLabel: { fontSize: 13, fontFamily: fonts.body, lineHeight: 18 },
  pricingValue: { fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 18 },
  pricingTotalRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 4 },
  pricingTotalLabel: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  confirmNote: { fontSize: 12, fontFamily: fonts.body, textAlign: 'center', marginTop: 8, lineHeight: 16 },
  errorText: { fontSize: 13, fontFamily: fonts.body, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  payBookBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 999, minHeight: 48 },
  heroNav: { position: 'absolute', left: 16, right: 16, zIndex: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroCircle: { width: 38, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 0 },
  pricingLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  infoModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  infoModalCard: { width: '100%', maxWidth: 360, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 20, gap: 10 },
  infoModalTitle: { fontSize: 15, fontFamily: fonts.bodySemi, fontWeight: '600', lineHeight: 20 },
  infoModalBody: { fontSize: 13, fontFamily: fonts.body, lineHeight: 19 },
})

const ctaStyles = StyleSheet.create({
  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'column', gap: 8,
    paddingHorizontal: 16, paddingTop: 12,
    // Shadow for floating CTA (only floating elements get shadow)
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  replyIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  replyIndicatorText: { flex: 1, fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 16 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  commentInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8,
  },
  commentTextInput: { flex: 1, fontSize: 14, fontFamily: fonts.body, minHeight: 36, lineHeight: 20 },
  charCount: { fontSize: 10, fontFamily: fonts.body, lineHeight: 16 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  messageBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 999,
    height: 56,
  },
  messageBtnText: { fontSize: 15, fontFamily: fonts.bodySemi, lineHeight: 20 },
})

export default function PostDetailScreen() {
  return (
    <ScreenErrorBoundary screenName="PostDetail">
      <PostDetailScreenInner />
    </ScreenErrorBoundary>
  )
}
