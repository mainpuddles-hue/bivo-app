import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, TextInput, FlatList, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import {
  ArrowLeft, MapPin, Heart, Bookmark, Share2, MessageCircle, Crown,
  HandHelping, Gift, Zap, BookOpen, CalendarDays, BadgeCheck, Send, Flag,
  MoreHorizontal, X, Calendar,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { shareContent } from '@/lib/share'
import { CATEGORIES, POST_SELECT } from '@/lib/constants'
import { formatTimeAgo, formatPrice, formatEventDate } from '@/lib/format'
import { useStripePayment } from '@/hooks/useStripePayment'
import DateRangePicker from '@/components/DateRangePicker'
import type { Post, PostType, PostComment } from '@/lib/types'

const ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  HandHelping, Gift, Heart, Zap, BookOpen, CalendarDays,
}

export default function PostDetailScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useMemo(() => createClient(), [])

  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)
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

  // Booking modal state
  const [bookingModalVisible, setBookingModalVisible] = useState(false)
  const [bookingStartDate, setBookingStartDate] = useState<string | null>(null)
  const [bookingEndDate, setBookingEndDate] = useState<string | null>(null)
  const [sendingBooking, setSendingBooking] = useState(false)
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const { createPayment, loading: paymentLoading, error: paymentError } = useStripePayment()

  const SERVICE_FEE_RATE = 0.10

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      const { data } = await supabase.from('posts').select(POST_SELECT).eq('id', id).single()
      if (data) {
        const p = data as unknown as Post
        setPost(p)
        setLikeCount(p.like_count ?? 0)
      }

      // Check like/save status
      if (user) {
        const [likeRes, saveRes] = await Promise.all([
          supabase.from('post_likes').select('id').eq('post_id', id).eq('user_id', user.id).maybeSingle(),
          supabase.from('saved_posts').select('id').eq('post_id', id).eq('user_id', user.id).maybeSingle(),
        ])
        setIsLiked(!!likeRes.data)
        setIsSaved(!!saveRes.data)
      }

      // Fetch comments
      const { data: cmts } = await supabase
        .from('post_comments')
        .select('*, user:profiles!post_comments_user_id_fkey(id, name, avatar_url)')
        .eq('post_id', id)
        .order('created_at', { ascending: true })
      setComments((cmts ?? []) as unknown as PostComment[])

      // Fetch related posts (same type)
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

      setLoading(false)
    }
    if (id) load()
  }, [id, supabase])

  // Realtime comments
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`comments-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_comments', filter: `post_id=eq.${id}` }, (payload) => {
        const newComment = payload.new as PostComment
        setComments(prev => [...prev, newComment])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, supabase])

  const toggleLike = useCallback(async () => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (isLiked) {
      setIsLiked(false)
      setLikeCount(c => c - 1)
      await supabase.from('post_likes').delete().eq('post_id', id).eq('user_id', userId)
    } else {
      setIsLiked(true)
      setLikeCount(c => c + 1)
      await (supabase.from('post_likes') as any).insert({ post_id: id, user_id: userId })
    }
  }, [userId, isLiked, id, supabase, router])

  const toggleSave = useCallback(async () => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (isSaved) {
      setIsSaved(false)
      await supabase.from('saved_posts').delete().eq('post_id', id).eq('user_id', userId)
    } else {
      setIsSaved(true)
      await (supabase.from('saved_posts') as any).insert({ post_id: id, user_id: userId })
    }
  }, [userId, isSaved, id, supabase, router])

  const handleMessage = useCallback(async () => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (!post) return
    if (post.user_id === userId) { Alert.alert(t('common.error'), t('post.cannotMessageSelf')); return }

    // Find existing conversation or create new one
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(user1_id.eq.${userId},user2_id.eq.${post.user_id}),and(user1_id.eq.${post.user_id},user2_id.eq.${userId})`)
      .eq('post_id', id)
      .maybeSingle()

    if (existing) {
      router.push(`/messages/${(existing as any).id}`)
    } else {
      const { data: newConv, error } = await (supabase.from('conversations') as any)
        .insert({ user1_id: userId, user2_id: post.user_id, post_id: id })
        .select('id')
        .single()
      if (error || !newConv) { Alert.alert(t('common.error'), t('messages.conversationCreateFailed')); return }
      router.push(`/messages/${newConv.id}`)
    }
  }, [userId, post, id, supabase, router, t])

  const handleSendComment = useCallback(async () => {
    if (!userId || !commentText.trim() || sendingComment) return
    setSendingComment(true)
    const content = commentText.trim()
    setCommentText('')
    await (supabase.from('post_comments') as any).insert({
      post_id: id, user_id: userId, content,
    })
    setSendingComment(false)
  }, [userId, commentText, sendingComment, id, supabase])

  const handleShare = () => {
    if (!post) return
    shareContent({
      title: post.title,
      text: post.title,
      url: `https://tackbird-v2.vercel.app/post/${post.id}`,
    })
  }

  const isAuthor = userId != null && post?.user_id === userId

  const handleDelete = useCallback(() => {
    if (!post) return
    Alert.alert(
      t('post.delete'),
      t('post.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('post.delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('posts')
              .update({ is_active: false })
              .eq('id', post.id)
            if (error) {
              Alert.alert(t('common.error'), t('post.deleteFailed'))
            } else {
              Alert.alert(t('post.deleted'))
              router.back()
            }
          },
        },
      ],
    )
  }, [post, supabase, t, router])

  const openEditModal = useCallback(() => {
    if (!post) return
    setEditTitle(post.title)
    setEditDescription(post.description ?? '')
    setEditLocation(post.location ?? '')
    setEditModalVisible(true)
  }, [post])

  const handleSaveEdit = useCallback(async () => {
    if (!post || saving) return
    setSaving(true)
    const { error } = await supabase
      .from('posts')
      .update({ title: editTitle.trim(), description: editDescription.trim(), location: editLocation.trim() || null })
      .eq('id', post.id)
    setSaving(false)
    if (error) {
      Alert.alert(t('common.error'), t('post.updateFailed'))
    } else {
      setPost(prev => prev ? { ...prev, title: editTitle.trim(), description: editDescription.trim(), location: editLocation.trim() || null } : prev)
      setEditModalVisible(false)
      Alert.alert(t('post.updated'))
    }
  }, [post, editTitle, editDescription, editLocation, saving, supabase, t])

  const handleMorePress = useCallback(() => {
    if (!post) return
    if (isAuthor) {
      Alert.alert(
        undefined as unknown as string,
        undefined as unknown as string,
        [
          { text: t('post.edit'), onPress: openEditModal },
          { text: t('post.delete'), style: 'destructive', onPress: handleDelete },
          { text: t('common.cancel'), style: 'cancel' },
        ],
      )
    }
  }, [post, isAuthor, t, openEditModal, handleDelete])

  const handleReport = useCallback(async () => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (!post) return
    const { error } = await (supabase.from('reports') as any).insert({
      reporter_id: userId,
      post_id: post.id,
      reason: 'user_report',
    })
    if (error) {
      Alert.alert(t('common.error'), t('post.reportFailed'))
    } else {
      Alert.alert(t('post.reportSent'))
    }
  }, [userId, post, supabase, t, router])

  const bookingDays = useMemo(() => {
    if (!bookingStartDate || !bookingEndDate) return 0
    const start = new Date(bookingStartDate)
    const end = new Date(bookingEndDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    return diff > 0 ? diff : 0
  }, [bookingStartDate, bookingEndDate])

  const rentalFee = useMemo(() => {
    if (!post?.daily_fee || bookingDays <= 0) return 0
    return bookingDays * post.daily_fee
  }, [bookingDays, post?.daily_fee])

  const serviceFee = useMemo(() => {
    return Math.round(rentalFee * SERVICE_FEE_RATE * 100) / 100
  }, [rentalFee])

  const bookingTotal = useMemo(() => {
    return rentalFee + serviceFee
  }, [rentalFee, serviceFee])

  // Fetch blocked dates when booking modal opens
  useEffect(() => {
    if (!bookingModalVisible || !id) return
    async function fetchBlockedDates() {
      const { data } = await (supabase
        .from('rental_bookings') as any)
        .select('start_date, end_date')
        .eq('post_id', id)
        .in('status', ['pending', 'confirmed', 'paid', 'active'])
      if (!data) return
      const blocked: string[] = []
      for (const booking of data as any[]) {
        const start = new Date(booking.start_date)
        const end = new Date(booking.end_date)
        const cursor = new Date(start)
        while (cursor <= end) {
          const y = cursor.getFullYear()
          const m = String(cursor.getMonth() + 1).padStart(2, '0')
          const d = String(cursor.getDate()).padStart(2, '0')
          blocked.push(`${y}-${m}-${d}`)
          cursor.setDate(cursor.getDate() + 1)
        }
      }
      setBlockedDates(blocked)
    }
    fetchBlockedDates()
  }, [bookingModalVisible, id, supabase])

  const handlePayAndBook = useCallback(async () => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (!post || sendingBooking || paymentLoading) return
    if (post.user_id === userId) { Alert.alert(t('common.error'), t('post.cannotMessageSelf')); return }
    if (bookingDays <= 0 || !bookingStartDate || !bookingEndDate) {
      Alert.alert(t('common.error'), t('rental.endDateAfterStart'))
      return
    }

    setSendingBooking(true)
    try {
      // Create rental_bookings record with status 'pending'
      const { data: booking, error: bookingError } = await (supabase.from('rental_bookings') as any)
        .insert({
          post_id: id,
          borrower_id: userId,
          lender_id: post.user_id,
          start_date: bookingStartDate,
          end_date: bookingEndDate,
          daily_fee: post.daily_fee,
          service_fee: serviceFee,
          total_amount: bookingTotal,
          status: 'pending',
        })
        .select('id')
        .single()

      if (bookingError || !booking) {
        Alert.alert(t('common.error'), t('rental.bookingFailed'))
        setSendingBooking(false)
        return
      }

      // Initiate Stripe payment
      const amountCents = Math.round(bookingTotal * 100)
      const sessionId = await createPayment({
        amount: amountCents,
        description: `${post.title} — ${bookingDays} ${t('rental.daysAbbr')}`,
        type: 'rental',
        postId: id,
        sellerId: post.user_id,
        metadata: {
          booking_id: booking.id,
          start_date: bookingStartDate,
          end_date: bookingEndDate,
        },
      })

      if (sessionId) {
        // Update booking with stripe session id
        await (supabase.from('rental_bookings') as any)
          .update({ stripe_session_id: sessionId })
          .eq('id', booking.id)
      }

      setBookingModalVisible(false)
      setBookingStartDate(null)
      setBookingEndDate(null)

      if (!sessionId) {
        // Payment not initiated (opened in browser) — inform user
        Alert.alert(t('common.success'), t('rental.bookingCreated'))
      }
    } catch {
      Alert.alert(t('common.error'), t('rental.bookingFailed'))
    } finally {
      setSendingBooking(false)
    }
  }, [userId, post, sendingBooking, paymentLoading, bookingDays, bookingStartDate, bookingEndDate, bookingTotal, serviceFee, id, supabase, router, t, createPayment])

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </View>
    )
  }

  if (!post) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}><ArrowLeft size={24} color={colors.foreground} /></Pressable>
        </View>
        <Text style={[styles.notFound, { color: colors.mutedForeground }]}>{t('post.notFound')}</Text>
      </View>
    )
  }

  const category = CATEGORIES[post.type as PostType]
  const CategoryIcon = category ? ICON_MAP[category.icon] : null
  const user = post.user
  const isVerified = user?.user_badges?.some(b => b.badge_type === 'verified') ?? false
  const allImages = [post.image_url, ...(post.images ?? []).map(i => i.image_url)].filter(Boolean) as string[]

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: isDark ? 'rgba(30,30,30,0.97)' : 'rgba(255,255,255,0.97)', borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}><ArrowLeft size={24} color={colors.foreground} /></Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={toggleSave} hitSlop={8}>
          <Bookmark size={22} color={isSaved ? colors.primary : colors.mutedForeground} fill={isSaved ? colors.primary : 'transparent'} />
        </Pressable>
        <Pressable onPress={handleShare} hitSlop={8}>
          <Share2 size={22} color={colors.mutedForeground} />
        </Pressable>
        {isAuthor ? (
          <Pressable onPress={handleMorePress} hitSlop={8}>
            <MoreHorizontal size={22} color={colors.mutedForeground} />
          </Pressable>
        ) : userId ? (
          <Pressable onPress={handleReport} hitSlop={8}>
            <Flag size={22} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 60 }]} showsVerticalScrollIndicator={false}>
        {/* Image gallery */}
        {allImages.length > 0 && (
          allImages.length === 1 ? (
            <Image source={{ uri: allImages[0] }} style={styles.heroImage} contentFit="cover" transition={300} />
          ) : (
            <FlatList
              horizontal
              pagingEnabled
              data={allImages}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item }) => <Image source={{ uri: item }} style={styles.heroImage} contentFit="cover" />}
              showsHorizontalScrollIndicator={false}
            />
          )
        )}

        <View style={styles.body}>
          {/* Category */}
          {category && (
            <View style={[styles.categoryChip, { backgroundColor: isDark ? category.bgDark : category.bgLight }]}>
              {CategoryIcon && <CategoryIcon size={14} color={category.color} />}
              <Text style={[styles.categoryText, { color: category.color }]}>{t(category.label)}</Text>
            </View>
          )}

          <Text style={[styles.title, { color: colors.foreground }]}>{post.title}</Text>

          {post.is_pro_listing && (
            <View style={[styles.proBadge, { backgroundColor: `${colors.pro}20` }]}>
              <Crown size={14} color={colors.pro} />
              <Text style={[styles.proText, { color: colors.pro }]}>Pro</Text>
            </View>
          )}

          {post.daily_fee != null && (
            <Text style={[styles.price, { color: '#C98B2E' }]}>
              {formatPrice(post.daily_fee, locale)} / {t('common.daysShort')}
            </Text>
          )}

          {post.type === 'lainaa' && post.daily_fee != null && !isAuthor && (
            <Pressable
              onPress={() => { if (!userId) { router.push('/(auth)/login'); return } setBookingModalVisible(true) }}
              style={[styles.bookingBtn, { backgroundColor: colors.primary }]}
            >
              <Calendar size={16} color={colors.primaryForeground} />
              <Text style={[styles.bookingBtnText, { color: colors.primaryForeground }]}>{t('post.booking')}</Text>
            </Pressable>
          )}

          {post.event_date && (
            <Text style={[styles.eventDate, { color: colors.primary }]}>
              {formatEventDate(post.event_date, locale)}
            </Text>
          )}

          <Text style={[styles.description, { color: colors.foreground }]}>{post.description}</Text>

          {post.location && (
            <View style={styles.locationRow}>
              <MapPin size={16} color={colors.mutedForeground} />
              <Text style={[styles.locationText, { color: colors.mutedForeground }]}>{post.location}</Text>
            </View>
          )}

          {/* Like + comment counts */}
          <View style={styles.engRow}>
            <Pressable onPress={toggleLike} style={styles.engItem}>
              <Heart size={18} color={isLiked ? colors.destructive : colors.mutedForeground} fill={isLiked ? colors.destructive : 'transparent'} />
              <Text style={[styles.engText, { color: isLiked ? colors.destructive : colors.mutedForeground }]}>{likeCount}</Text>
            </Pressable>
            <View style={styles.engItem}>
              <MessageCircle size={18} color={colors.mutedForeground} />
              <Text style={[styles.engText, { color: colors.mutedForeground }]}>{comments.length}</Text>
            </View>
          </View>

          {/* Author card */}
          <View style={[styles.authorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable onPress={() => user?.id && router.push(`/profile/${user.id}` as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.authorAvatar} />
              ) : (
                <View style={[styles.authorAvatar, styles.avatarFb, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.avatarInit, { color: colors.mutedForeground }]}>{user?.name?.charAt(0)?.toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <View style={styles.authorNameRow}>
                  <Text style={[styles.authorName, { color: colors.foreground }]} numberOfLines={1}>{user?.name}</Text>
                  {isVerified && <BadgeCheck size={16} color={colors.info} />}
                </View>
                {user?.naapurusto && <Text style={[styles.authorNh, { color: colors.mutedForeground }]} numberOfLines={1}>{user.naapurusto}</Text>}
              </View>
            </Pressable>
            <Pressable onPress={handleMessage} style={[styles.messageBtn, { backgroundColor: colors.primary, marginTop: 10 }]}>
              <MessageCircle size={16} color={colors.primaryForeground} />
              <Text style={[styles.messageBtnText, { color: colors.primaryForeground }]}>{t('post.message')}</Text>
            </Pressable>
          </View>

          <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>
            {formatTimeAgo(post.created_at, t, locale)}
          </Text>

          {/* ── Related posts carousel ── */}
          {relatedPosts.length > 0 && (
            <View style={[styles.relatedSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.relatedTitle, { color: colors.foreground }]}>
                {t('post.relatedListings')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedScroll}>
                {relatedPosts.map((rp) => {
                  const rpCat = CATEGORIES[rp.type as PostType]
                  return (
                    <Pressable
                      key={rp.id}
                      onPress={() => router.push(`/post/${rp.id}` as any)}
                      style={[styles.relatedCard, { backgroundColor: colors.card }]}
                    >
                      {rp.image_url ? (
                        <Image source={{ uri: rp.image_url }} style={styles.relatedImage} contentFit="cover" />
                      ) : (
                        <View style={[styles.relatedImage, { backgroundColor: rpCat ? (isDark ? rpCat.bgDark : rpCat.bgLight) : colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                          {rpCat && ICON_MAP[rpCat.icon] && (() => { const I = ICON_MAP[rpCat.icon]; return <I size={28} color={rpCat.color} /> })()}
                        </View>
                      )}
                      <View style={styles.relatedCardBody}>
                        <Text style={[styles.relatedCardTitle, { color: colors.foreground }]} numberOfLines={2}>{rp.title}</Text>
                        {rp.location && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <MapPin size={10} color={colors.mutedForeground} />
                            <Text style={[styles.relatedCardLocation, { color: colors.mutedForeground }]} numberOfLines={1}>{rp.location}</Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </View>
          )}

          {/* ── Comments section ── */}
          <View style={[styles.commentSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.commentTitle, { color: colors.foreground }]}>
              {t('post.comments')} ({comments.length})
            </Text>

            {comments.map((c) => (
              <View key={c.id} style={styles.commentRow}>
                {c.user?.avatar_url ? (
                  <Image source={{ uri: c.user.avatar_url }} style={styles.commentAvatar} />
                ) : (
                  <View style={[styles.commentAvatar, styles.avatarFb, { backgroundColor: colors.muted }]}>
                    <Text style={{ fontSize: 10, color: colors.mutedForeground, fontWeight: '600' }}>
                      {c.user?.name?.charAt(0)?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
                <View style={styles.commentBody}>
                  <View style={styles.commentHeader}>
                    <Text style={[styles.commentName, { color: colors.foreground }]}>{c.user?.name ?? t('common.user')}</Text>
                    <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>
                      {formatTimeAgo(c.created_at, t, locale)}
                    </Text>
                  </View>
                  <Text style={[styles.commentContent, { color: colors.foreground }]}>{c.content}</Text>
                </View>
              </View>
            ))}

            {/* Comment input */}
            {userId && (
              <View style={[styles.commentInput, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TextInput
                  style={[styles.commentTextInput, { color: colors.foreground }]}
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder={t('post.addComment')}
                  placeholderTextColor={colors.mutedForeground}
                  maxLength={500}
                />
                <Pressable
                  onPress={handleSendComment}
                  disabled={!commentText.trim() || sendingComment}
                  style={[styles.commentSendBtn, { backgroundColor: commentText.trim() ? colors.primary : colors.muted }]}
                >
                  <Send size={14} color={commentText.trim() ? colors.primaryForeground : colors.mutedForeground} />
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('post.editPost')}</Text>
              <Pressable onPress={() => setEditModalVisible(false)} hitSlop={12}>
                <X size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{t('post.titleLabel')}</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={editTitle}
              onChangeText={setEditTitle}
              maxLength={100}
            />

            <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{t('post.descriptionLabel')}</Text>
            <TextInput
              style={[styles.modalInput, styles.modalTextArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={2000}
            />

            <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>{t('post.locationLabel')}</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={editLocation}
              onChangeText={setEditLocation}
              maxLength={100}
            />

            <Pressable
              onPress={handleSaveEdit}
              disabled={saving || !editTitle.trim()}
              style={[styles.saveBtn, { backgroundColor: saving || !editTitle.trim() ? colors.muted : colors.primary }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>{t('post.saveChanges')}</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Booking Modal */}
      <Modal visible={bookingModalVisible} animationType="slide" transparent>
        <Pressable style={styles.modalOverlay} onPress={() => setBookingModalVisible(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.card }]} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('rental.booking')}</Text>
                <Pressable onPress={() => setBookingModalVisible(false)} hitSlop={12}>
                  <X size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <Text style={[styles.bookingPostTitle, { color: colors.foreground }]}>{post?.title}</Text>
              {post?.daily_fee != null && (
                <Text style={[styles.bookingFee, { color: '#C98B2E' }]}>
                  {formatPrice(post.daily_fee, locale)} / {t('common.daysShort')}
                </Text>
              )}

              {/* Date Range Picker */}
              <Text style={[styles.modalLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>{t('rental.selectDates')}</Text>
              <DateRangePicker
                startDate={bookingStartDate}
                endDate={bookingEndDate}
                onSelect={(start, end) => {
                  setBookingStartDate(start)
                  setBookingEndDate(end)
                }}
                blockedDates={blockedDates}
              />

              {/* Selected dates summary */}
              {bookingStartDate && (
                <View style={[styles.datesSummary, { backgroundColor: colors.muted }]}>
                  <View style={styles.datesSummaryItem}>
                    <Text style={[styles.datesSummaryLabel, { color: colors.mutedForeground }]}>{t('rental.startDate')}</Text>
                    <Text style={[styles.datesSummaryValue, { color: colors.foreground }]}>{bookingStartDate}</Text>
                  </View>
                  {bookingEndDate && (
                    <View style={styles.datesSummaryItem}>
                      <Text style={[styles.datesSummaryLabel, { color: colors.mutedForeground }]}>{t('rental.endDate')}</Text>
                      <Text style={[styles.datesSummaryValue, { color: colors.foreground }]}>{bookingEndDate}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Pricing breakdown */}
              {bookingDays > 0 && post?.daily_fee != null && (
                <View style={[styles.pricingBreakdown, { borderColor: colors.border }]}>
                  <Text style={[styles.pricingTitle, { color: colors.foreground }]}>{t('rental.pricingBreakdown')}</Text>

                  <View style={styles.pricingRow}>
                    <Text style={[styles.pricingLabel, { color: colors.mutedForeground }]}>
                      {formatPrice(post.daily_fee, locale)} x {bookingDays} {t('rental.daysAbbr')}
                    </Text>
                    <Text style={[styles.pricingValue, { color: colors.foreground }]}>
                      {formatPrice(rentalFee, locale)}
                    </Text>
                  </View>

                  <View style={styles.pricingRow}>
                    <Text style={[styles.pricingLabel, { color: colors.mutedForeground }]}>
                      {t('rental.serviceFee')} ({t('rental.serviceFeeNote')})
                    </Text>
                    <Text style={[styles.pricingValue, { color: colors.foreground }]}>
                      {formatPrice(serviceFee, locale)}
                    </Text>
                  </View>

                  <View style={[styles.pricingRow, styles.pricingTotalRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.pricingTotalLabel, { color: colors.foreground }]}>{t('rental.total')}</Text>
                    <Text style={[styles.bookingTotalPrice, { color: colors.primary }]}>
                      {formatPrice(bookingTotal, locale)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Confirmation note */}
              {bookingDays > 0 && (
                <Text style={[styles.confirmNote, { color: colors.mutedForeground }]}>
                  {t('rental.confirmationNote')}
                </Text>
              )}

              {paymentError && (
                <Text style={[styles.errorText, { color: colors.destructive }]}>{paymentError}</Text>
              )}

              <Pressable
                onPress={handlePayAndBook}
                disabled={sendingBooking || paymentLoading || bookingDays <= 0}
                style={[styles.payBookBtn, { backgroundColor: sendingBooking || paymentLoading || bookingDays <= 0 ? colors.muted : colors.primary, marginTop: 16, marginBottom: 8 }]}
              >
                {sendingBooking || paymentLoading ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <>
                    <Calendar size={16} color={colors.primaryForeground} />
                    <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>{t('rental.payAndBook')}</Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
  },
  scrollContent: { paddingBottom: 40 },
  heroImage: { width: '100%', aspectRatio: 4 / 3 },
  body: { padding: 16, gap: 12 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start',
  },
  categoryText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 28, letterSpacing: -0.3 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  proText: { fontSize: 13, fontWeight: '600' },
  price: { fontSize: 18, fontWeight: '700' },
  eventDate: { fontSize: 15, fontWeight: '500' },
  description: { fontSize: 15, lineHeight: 22 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { fontSize: 14 },
  engRow: { flexDirection: 'row', gap: 20 },
  engItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  engText: { fontSize: 15, fontWeight: '500' },
  authorCard: {
    padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginTop: 4,
  },
  authorAvatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFb: { alignItems: 'center', justifyContent: 'center' },
  avatarInit: { fontSize: 18, fontWeight: '600' },
  authorInfo: { flex: 1, gap: 2 },
  authorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  authorName: { fontSize: 15, fontWeight: '600' },
  authorNh: { fontSize: 13 },
  messageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  messageBtnText: { fontSize: 13, fontWeight: '600' },
  timestamp: { fontSize: 12, marginTop: 4 },
  notFound: { fontSize: 16, textAlign: 'center', marginTop: 100 },
  commentSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, marginTop: 8, gap: 12 },
  commentTitle: { fontSize: 16, fontWeight: '700' },
  commentRow: { flexDirection: 'row', gap: 10 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentBody: { flex: 1, gap: 2 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentName: { fontSize: 13, fontWeight: '600' },
  commentTime: { fontSize: 11 },
  commentContent: { fontSize: 14, lineHeight: 19 },
  commentInput: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6,
  },
  commentTextInput: { flex: 1, fontSize: 14, minHeight: 36 },
  commentSendBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, gap: 8, maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalLabel: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  modalInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, marginTop: 4,
  },
  modalTextArea: { minHeight: 120 },
  saveBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 10, marginTop: 16,
  },
  saveBtnText: { fontSize: 15, fontWeight: '600' },
  relatedSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 16, marginTop: 8, gap: 12 },
  relatedTitle: { fontSize: 16, fontWeight: '700' },
  relatedScroll: { gap: 10 },
  relatedCard: { width: 160, borderRadius: 12, overflow: 'hidden' },
  relatedImage: { width: 160, height: 100, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  relatedCardBody: { padding: 8, gap: 4 },
  relatedCardTitle: { fontSize: 13, fontWeight: '600', lineHeight: 17 },
  relatedCardLocation: { fontSize: 11 },
  bookingBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, alignSelf: 'flex-start',
  },
  bookingBtnText: { fontSize: 14, fontWeight: '600' },
  bookingPostTitle: { fontSize: 16, fontWeight: '600' },
  bookingFee: { fontSize: 15, fontWeight: '700' },
  bookingTotalPrice: { fontSize: 18, fontWeight: '700' },
  datesSummary: {
    flexDirection: 'row', gap: 16, padding: 12, borderRadius: 10, marginTop: 12,
  },
  datesSummaryItem: { flex: 1, gap: 2 },
  datesSummaryLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  datesSummaryValue: { fontSize: 14, fontWeight: '600' },
  pricingBreakdown: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 14, marginTop: 12, gap: 8,
  },
  pricingTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  pricingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pricingLabel: { fontSize: 13 },
  pricingValue: { fontSize: 13, fontWeight: '500' },
  pricingTotalRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 4 },
  pricingTotalLabel: { fontSize: 15, fontWeight: '600' },
  confirmNote: { fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 17 },
  errorText: { fontSize: 13, textAlign: 'center', marginTop: 8 },
  payBookBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 10,
  },
})
