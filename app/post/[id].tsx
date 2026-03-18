import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, TextInput, FlatList, Alert, Modal, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import {
  ArrowLeft, MapPin, Heart, Bookmark, Share2, MessageCircle, Crown,
  HandHelping, Gift, Zap, BookOpen, CalendarDays, BadgeCheck, Send, Flag,
  MoreHorizontal, X,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { shareContent } from '@/lib/share'
import { CATEGORIES, POST_SELECT } from '@/lib/constants'
import { formatTimeAgo, formatPrice, formatEventDate } from '@/lib/format'
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
})
