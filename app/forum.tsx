import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  View, Text, FlatList, RefreshControl, ScrollView, StyleSheet,
  Pressable, ActivityIndicator, TextInput, Modal, KeyboardAvoidingView,
  Platform, Alert, Animated,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import {
  ArrowLeft, Plus, ChevronUp, MessageCircle, MapPin, X, Send, Trash2, Pencil,
} from 'lucide-react-native'
import { BoardIllustration } from '@/components/illustrations'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { createClient } from '@/lib/supabase/client'
import { formatTimeAgo } from '@/lib/format'

// ── Forum categories ──
type ForumCategory = 'vinkit' | 'kysymykset' | 'tapahtumat' | 'uutiset'

interface ForumCategoryDef {
  key: ForumCategory | null
  labelKey: string
  color: string
}

const FORUM_CATEGORIES: ForumCategoryDef[] = [
  { key: null, labelKey: 'forum.all', color: '' }, // color set from theme
  { key: 'vinkit', labelKey: 'forum.tips', color: '#4CAF6A' },
  { key: 'kysymykset', labelKey: 'forum.questions', color: '#3B7DD8' },
  { key: 'tapahtumat', labelKey: 'forum.events', color: '#2B8A62' },
  { key: 'uutiset', labelKey: 'forum.news', color: '#8E44AD' },
]

const CATEGORY_COLORS: Record<string, string> = {
  vinkit: '#4CAF6A',
  kysymykset: '#3B7DD8',
  tapahtumat: '#2B8A62',
  uutiset: '#8E44AD',
}

// ── Types ──
interface ForumPostUser {
  id: string
  name: string | null
  avatar_url: string | null
  naapurusto: string | null
}

interface ForumPost {
  id: string
  user_id: string
  title: string
  content: string
  category: ForumCategory
  neighborhood: string | null
  created_at: string
  upvote_count: number
  comment_count: number
  user?: ForumPostUser | null
}

interface ForumReply {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  upvote_count: number
  user?: ForumPostUser | null
}

// ── Skeleton ──
function PostSkeleton({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  const shimmer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [shimmer])
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] })

  return (
    <View style={[s.card, { backgroundColor: colors.card }]}>
      <View style={[s.categoryBar, { backgroundColor: colors.muted }]} />
      <View style={s.cardBody}>
        <View style={s.cardUserRow}>
          <Animated.View style={[s.skelAvatar, { backgroundColor: colors.muted, opacity }]} />
          <Animated.View style={[s.skelLine, { width: '40%', backgroundColor: colors.muted, opacity }]} />
        </View>
        <Animated.View style={[s.skelLine, { width: '80%', height: 14, backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[s.skelLine, { width: '100%', backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[s.skelLine, { width: '60%', backgroundColor: colors.muted, opacity }]} />
      </View>
    </View>
  )
}

export default function ForumScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // State
  const [posts, setPosts] = useState<ForumPost[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tableExists, setTableExists] = useState(true)
  const [activeCategory, setActiveCategory] = useState<ForumCategory | null>(null)
  const [userNeighborhood, setUserNeighborhood] = useState<string | null>(null)
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [votedPosts, setVotedPosts] = useState<Set<string>>(new Set())

  // Sort state
  const [sortBy, setSortBy] = useState<'newest' | 'popular'>('newest')

  // Pagination state
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  // Edit post state
  const [editingPost, setEditingPost] = useState<ForumPost | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Real-time banner state
  const [newPostsBanner, setNewPostsBanner] = useState(false)

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState<ForumCategory | null>(null)
  const [publishing, setPublishing] = useState(false)

  // Detail / replies state
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null)
  const [replies, setReplies] = useState<ForumReply[]>([])
  const [loadingReplies, setLoadingReplies] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const [votedReplies, setVotedReplies] = useState<Set<string>>(new Set())

  // Fetch user info
  useEffect(() => {
    async function fetchUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)
      const { data: profile } = await (supabase.from('profiles') as any)
        .select('naapurusto')
        .eq('id', user.id)
        .single()
      if (profile?.naapurusto) setUserNeighborhood(profile.naapurusto)
    }
    fetchUser()
  }, [supabase])

  // Fetch posts (with pagination)
  const fetchPosts = useCallback(async (pageNum: number = 0) => {
    try {
      const pageSize = 20
      let query = supabase
        .from('forum_posts')
        .select('*, user:profiles!forum_posts_user_id_fkey(id, name, avatar_url, naapurusto)')

      if (sortBy === 'popular') {
        query = query.order('upvote_count', { ascending: false })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      query = query.range(pageNum * pageSize, (pageNum + 1) * pageSize - 1)

      if (activeCategory) query = query.eq('category', activeCategory)
      if (neighborhoodFilter) query = query.eq('neighborhood', neighborhoodFilter)

      const { data, error } = await query
      if (error) {
        // Table likely doesn't exist
        if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          setTableExists(false)
        }
        if (pageNum === 0) setPosts([])
        return
      }
      setTableExists(true)
      const newData = (data ?? []) as unknown as ForumPost[]
      setHasMore(newData.length >= pageSize)
      if (pageNum === 0) {
        setPosts(newData)
      } else {
        setPosts(prev => [...prev, ...newData])
      }
    } catch {
      if (pageNum === 0) setPosts([])
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [supabase, activeCategory, neighborhoodFilter, sortBy])

  useEffect(() => {
    setPage(0)
    setLoading(true)
    fetchPosts(0)
  }, [fetchPosts])

  // ── Real-time listener for new forum posts ──
  useEffect(() => {
    const channel = supabase
      .channel('forum_posts_realtime')
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'forum_posts' },
        (payload: any) => {
          // Only show banner for posts from other users
          if (payload.new && payload.new.user_id !== currentUserId) {
            setNewPostsBanner(true)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, currentUserId])

  // Fetch user votes
  useEffect(() => {
    async function fetchVotes() {
      if (!currentUserId) return
      try {
        const { data } = await supabase
          .from('forum_votes')
          .select('post_id, reply_id')
          .eq('user_id', currentUserId)
        if (data) {
          const postVotes = new Set<string>()
          const replyVotes = new Set<string>()
          data.forEach((v: any) => {
            if (v.post_id) postVotes.add(v.post_id)
            if (v.reply_id) replyVotes.add(v.reply_id)
          })
          setVotedPosts(postVotes)
          setVotedReplies(replyVotes)
        }
      } catch {
        // Table may not exist
      }
    }
    fetchVotes()
  }, [supabase, currentUserId])

  const handleRefresh = useCallback(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
    setRefreshing(true)
    setPage(0)
    fetchPosts(0)
  }, [fetchPosts])

  // Load more (pagination)
  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || loading) return
    setLoadingMore(true)
    const nextPage = page + 1
    setPage(nextPage)
    fetchPosts(nextPage)
  }, [hasMore, loadingMore, loading, page, fetchPosts])

  // ── Upvote post ──
  const handleUpvotePost = useCallback(async (post: ForumPost) => {
    if (!currentUserId) return
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}

    const alreadyVoted = votedPosts.has(post.id)

    // Optimistic update
    setPosts(prev => prev.map(p =>
      p.id === post.id
        ? { ...p, upvote_count: p.upvote_count + (alreadyVoted ? -1 : 1) }
        : p
    ))
    if (selectedPost?.id === post.id) {
      setSelectedPost(prev => prev
        ? { ...prev, upvote_count: prev.upvote_count + (alreadyVoted ? -1 : 1) }
        : prev
      )
    }

    setVotedPosts(prev => {
      const next = new Set(prev)
      if (alreadyVoted) next.delete(post.id)
      else next.add(post.id)
      return next
    })

    try {
      if (alreadyVoted) {
        await (supabase.from('forum_votes') as any)
          .delete()
          .eq('user_id', currentUserId)
          .eq('post_id', post.id)
        await (supabase.from('forum_posts') as any)
          .update({ upvote_count: Math.max(0, post.upvote_count - 1) })
          .eq('id', post.id)
      } else {
        await (supabase.from('forum_votes') as any)
          .insert({ user_id: currentUserId, post_id: post.id, vote_type: 'up' })
        await (supabase.from('forum_posts') as any)
          .update({ upvote_count: post.upvote_count + 1 })
          .eq('id', post.id)
      }
    } catch {
      // Revert on error
      setPosts(prev => prev.map(p =>
        p.id === post.id
          ? { ...p, upvote_count: post.upvote_count }
          : p
      ))
      setVotedPosts(prev => {
        const next = new Set(prev)
        if (alreadyVoted) next.add(post.id)
        else next.delete(post.id)
        return next
      })
      Alert.alert(t('common.error'), t('forum.voteError'))
    }
  }, [currentUserId, supabase, votedPosts, selectedPost, t])

  // ── Upvote reply ──
  const handleUpvoteReply = useCallback(async (reply: ForumReply) => {
    if (!currentUserId) return
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}

    const alreadyVoted = votedReplies.has(reply.id)

    setReplies(prev => prev.map(r =>
      r.id === reply.id
        ? { ...r, upvote_count: r.upvote_count + (alreadyVoted ? -1 : 1) }
        : r
    ))

    setVotedReplies(prev => {
      const next = new Set(prev)
      if (alreadyVoted) next.delete(reply.id)
      else next.add(reply.id)
      return next
    })

    try {
      if (alreadyVoted) {
        await (supabase.from('forum_votes') as any)
          .delete()
          .eq('user_id', currentUserId)
          .eq('reply_id', reply.id)
        await (supabase.from('forum_replies') as any)
          .update({ upvote_count: Math.max(0, reply.upvote_count - 1) })
          .eq('id', reply.id)
      } else {
        await (supabase.from('forum_votes') as any)
          .insert({ user_id: currentUserId, reply_id: reply.id, vote_type: 'up' })
        await (supabase.from('forum_replies') as any)
          .update({ upvote_count: reply.upvote_count + 1 })
          .eq('id', reply.id)
      }
    } catch {
      // Revert
      setReplies(prev => prev.map(r =>
        r.id === reply.id
          ? { ...r, upvote_count: reply.upvote_count }
          : r
      ))
      setVotedReplies(prev => {
        const next = new Set(prev)
        if (alreadyVoted) next.add(reply.id)
        else next.delete(reply.id)
        return next
      })
      Alert.alert(t('common.error'), t('forum.voteError'))
    }
  }, [currentUserId, supabase, votedReplies, t])

  // ── Open post detail ──
  const openPostDetail = useCallback(async (post: ForumPost) => {
    setSelectedPost(post)
    setReplies([])
    setLoadingReplies(true)
    setReplyText('')

    try {
      const { data } = await supabase
        .from('forum_replies')
        .select('*, user:profiles!forum_replies_user_id_fkey(id, name, avatar_url, naapurusto)')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true })

      setReplies((data ?? []) as unknown as ForumReply[])
    } catch {
      // Table may not exist
    } finally {
      setLoadingReplies(false)
    }
  }, [supabase])

  // ── Send reply ──
  const handleSendReply = useCallback(async () => {
    if (!currentUserId || !selectedPost || !replyText.trim()) return
    setSendingReply(true)

    try {
      const { data, error } = await (supabase.from('forum_replies') as any)
        .insert({
          post_id: selectedPost.id,
          user_id: currentUserId,
          content: replyText.trim(),
          upvote_count: 0,
        })
        .select('*, user:profiles!forum_replies_user_id_fkey(id, name, avatar_url, naapurusto)')
        .single()

      if (error) throw error

      if (data) {
        setReplies(prev => [...prev, data as unknown as ForumReply])
        // Update reply count
        const newCount = selectedPost.comment_count + 1
        setSelectedPost(prev => prev ? { ...prev, comment_count: newCount } : prev)
        setPosts(prev => prev.map(p =>
          p.id === selectedPost.id ? { ...p, comment_count: newCount } : p
        ))
        await (supabase.from('forum_posts') as any)
          .update({ comment_count: newCount })
          .eq('id', selectedPost.id)

        // Send notification to post author (don't notify yourself)
        if (selectedPost.user_id !== currentUserId) {
          await (supabase.from('notifications') as any).insert({
            user_id: selectedPost.user_id,
            from_user_id: currentUserId,
            type: 'forum_reply',
            title: t('notifications.forumReplyTitle'),
            body: replyText.trim().slice(0, 100),
            link_type: 'forum_post',
            link_id: selectedPost.id,
          }).catch(() => {}) // Don't fail the reply if notification fails
        }
      }
      setReplyText('')
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    } catch {
      Alert.alert(t('common.error'), t('forum.replyError'))
    } finally {
      setSendingReply(false)
    }
  }, [currentUserId, selectedPost, replyText, supabase, t])

  // ── Delete post ──
  const handleDeletePost = useCallback(async (postId: string) => {
    Alert.alert(
      t('forum.deletePost'),
      t('forum.deletePostConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete associated replies first
              await (supabase.from('forum_replies') as any).delete().eq('post_id', postId)
              // Then delete the post
              await (supabase.from('forum_posts') as any).delete().eq('id', postId)
              // Remove from local state
              setPosts(prev => prev.filter(p => p.id !== postId))
              // Close detail modal if viewing this post
              if (selectedPost?.id === postId) {
                setSelectedPost(null)
              }
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
            } catch {
              Alert.alert(t('common.error'), t('post.deleteFailed'))
            }
          },
        },
      ]
    )
  }, [supabase, t, selectedPost])

  // ── Delete reply ──
  const handleDeleteReply = useCallback(async (reply: ForumReply) => {
    try {
      await (supabase.from('forum_replies') as any).delete().eq('id', reply.id)

      // Decrement comment_count on the parent post
      if (selectedPost) {
        const newCount = Math.max(0, selectedPost.comment_count - 1)
        await (supabase.from('forum_posts') as any)
          .update({ comment_count: newCount })
          .eq('id', selectedPost.id)

        setSelectedPost(prev => prev ? { ...prev, comment_count: newCount } : prev)
        setPosts(prev => prev.map(p =>
          p.id === selectedPost.id ? { ...p, comment_count: newCount } : p
        ))
      }

      // Remove from local state
      setReplies(prev => prev.filter(r => r.id !== reply.id))
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    } catch {
      Alert.alert(t('common.error'), t('forum.deleteReply'))
    }
  }, [supabase, selectedPost, t])

  // ── Edit post ──
  const handleEditPost = useCallback((post: ForumPost) => {
    setEditingPost(post)
    setEditTitle(post.title)
    setEditContent(post.content)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingPost || !editTitle.trim() || !editContent.trim()) return
    setSavingEdit(true)
    try {
      await (supabase.from('forum_posts') as any)
        .update({ title: editTitle.trim(), content: editContent.trim() })
        .eq('id', editingPost.id)

      // Update local state
      const updated = { ...editingPost, title: editTitle.trim(), content: editContent.trim() }
      setPosts(prev => prev.map(p => p.id === editingPost.id ? updated : p))
      if (selectedPost?.id === editingPost.id) {
        setSelectedPost(updated)
      }
      setEditingPost(null)
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    } catch {
      Alert.alert(t('common.error'), t('forum.publishError'))
    } finally {
      setSavingEdit(false)
    }
  }, [editingPost, editTitle, editContent, supabase, selectedPost, t])

  // ── Create post ──
  const handleCreatePost = useCallback(async () => {
    if (!newTitle.trim()) { Alert.alert(t('common.error'), t('forum.titleRequired')); return }
    if (!newContent.trim()) { Alert.alert(t('common.error'), t('forum.contentRequired')); return }
    if (!newCategory) { Alert.alert(t('common.error'), t('forum.categoryRequired')); return }
    if (!currentUserId) return

    setPublishing(true)
    try {
      const { data, error } = await (supabase.from('forum_posts') as any)
        .insert({
          user_id: currentUserId,
          title: newTitle.trim(),
          content: newContent.trim(),
          category: newCategory,
          neighborhood: userNeighborhood,
          upvote_count: 0,
          comment_count: 0,
        })
        .select('*, user:profiles!forum_posts_user_id_fkey(id, name, avatar_url, naapurusto)')
        .single()

      if (error) throw error

      if (data) {
        setPosts(prev => [data as unknown as ForumPost, ...prev])
      }

      setNewTitle('')
      setNewContent('')
      setNewCategory(null)
      setShowCreateModal(false)
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    } catch {
      Alert.alert(t('common.error'), t('forum.publishError'))
    } finally {
      setPublishing(false)
    }
  }, [newTitle, newContent, newCategory, currentUserId, userNeighborhood, supabase, t])

  // ── Category color helper ──
  const getCategoryColor = useCallback((category: string) => {
    return CATEGORY_COLORS[category] || colors.primary
  }, [colors.primary])

  // ── Render post card ──
  const renderPostCard = useCallback(({ item }: { item: ForumPost }) => {
    const catColor = getCategoryColor(item.category)
    const isVoted = votedPosts.has(item.id)
    const user = item.user

    return (
      <Pressable
        onPress={() => openPostDetail(item)}
        style={[s.card, { backgroundColor: colors.card }]}
      >
        <View style={[s.categoryBar, { backgroundColor: catColor }]} />
        <View style={s.cardBody}>
          {/* User row */}
          <View style={s.cardUserRow}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={s.avatar} contentFit="cover" />
            ) : (
              <View style={[s.avatarFallback, { backgroundColor: `${colors.primary}20` }]}>
                <Text style={[s.avatarFallbackText, { color: colors.primary }]}>
                  {(user?.name ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={s.cardUserInfo}>
              <Text style={[s.cardUserName, { color: colors.foreground }]} numberOfLines={1}>
                {user?.name ?? t('common.user')}
              </Text>
              <View style={s.cardUserMeta}>
                {user?.naapurusto && (
                  <>
                    <MapPin size={10} color={colors.mutedForeground} />
                    <Text style={[s.cardMetaText, { color: colors.mutedForeground }]}>
                      {user.naapurusto}
                    </Text>
                  </>
                )}
                <Text style={[s.cardMetaText, { color: colors.mutedForeground }]}>
                  {formatTimeAgo(item.created_at, t, locale)}
                </Text>
              </View>
            </View>
            <View style={[s.categoryBadge, { backgroundColor: `${catColor}18` }]}>
              <Text style={[s.categoryBadgeText, { color: catColor }]}>
                {t(`forum.${item.category === 'uutiset' ? 'news' : item.category === 'vinkit' ? 'tips' : item.category === 'kysymykset' ? 'questions' : 'events'}`)}
              </Text>
            </View>
          </View>

          {/* Title */}
          <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
            {item.title}
          </Text>

          {/* Content preview */}
          <Text style={[s.cardContent, { color: colors.mutedForeground }]} numberOfLines={2}>
            {item.content}
          </Text>

          {/* Actions row */}
          <View style={s.cardActions}>
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); handleUpvotePost(item) }}
              style={[s.actionBtn, isVoted && { backgroundColor: `${colors.primary}14` }]}
              hitSlop={4}
            >
              <ChevronUp
                size={16}
                color={isVoted ? colors.primary : colors.mutedForeground}
                strokeWidth={isVoted ? 2.5 : 1.8}
              />
              <Text style={[
                s.actionText,
                { color: isVoted ? colors.primary : colors.mutedForeground },
                isVoted && { fontFamily: fonts.bodySemi },
              ]}>
                {item.upvote_count}
              </Text>
            </Pressable>
            <View style={s.actionBtn}>
              <MessageCircle size={14} color={colors.mutedForeground} strokeWidth={1.8} />
              <Text style={[s.actionText, { color: colors.mutedForeground }]}>
                {item.comment_count} {t('forum.replies')}
              </Text>
            </View>
            {item.user_id === currentUserId && (
              <>
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); handleEditPost(item) }}
                  style={s.actionBtn}
                  hitSlop={4}
                >
                  <Pencil size={14} color={colors.primary} strokeWidth={1.8} />
                </Pressable>
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); handleDeletePost(item.id) }}
                  style={s.actionBtn}
                  hitSlop={4}
                >
                  <Trash2 size={14} color={colors.destructive} strokeWidth={1.8} />
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Pressable>
    )
  }, [colors, t, locale, votedPosts, getCategoryColor, handleUpvotePost, openPostDetail, currentUserId, handleDeletePost, handleEditPost])

  // ── Render reply ──
  const renderReply = useCallback(({ item }: { item: ForumReply }) => {
    const isVoted = votedReplies.has(item.id)
    const user = item.user

    return (
      <View style={[s.replyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={s.cardUserRow}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={s.replyAvatar} contentFit="cover" />
          ) : (
            <View style={[s.replyAvatarFallback, { backgroundColor: `${colors.primary}20` }]}>
              <Text style={[s.replyAvatarText, { color: colors.primary }]}>
                {(user?.name ?? '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={s.cardUserInfo}>
            <Text style={[s.replyUserName, { color: colors.foreground }]} numberOfLines={1}>
              {user?.name ?? t('common.user')}
            </Text>
            <Text style={[s.cardMetaText, { color: colors.mutedForeground }]}>
              {formatTimeAgo(item.created_at, t, locale)}
            </Text>
          </View>
          {item.user_id === currentUserId && (
            <Pressable
              onPress={() => handleDeleteReply(item)}
              hitSlop={6}
              style={{ padding: 4 }}
            >
              <X size={14} color={colors.destructive} strokeWidth={1.8} />
            </Pressable>
          )}
        </View>
        <Text style={[s.replyContent, { color: colors.foreground }]}>
          {item.content}
        </Text>
        <Pressable
          onPress={() => handleUpvoteReply(item)}
          style={[s.actionBtn, isVoted && { backgroundColor: `${colors.primary}14` }]}
          hitSlop={4}
        >
          <ChevronUp
            size={14}
            color={isVoted ? colors.primary : colors.mutedForeground}
            strokeWidth={isVoted ? 2.5 : 1.8}
          />
          <Text style={[
            s.actionText,
            { color: isVoted ? colors.primary : colors.mutedForeground },
            isVoted && { fontFamily: fonts.bodySemi },
          ]}>
            {item.upvote_count}
          </Text>
        </Pressable>
      </View>
    )
  }, [colors, t, locale, votedReplies, handleUpvoteReply, currentUserId, handleDeleteReply])

  // ── Header component ──
  const ListHeader = useMemo(() => (
    <View style={s.listHeaderGap} />
  ), [])

  // ── Empty state ──
  const EmptyComponent = useMemo(() => {
    if (loading) {
      return (
        <View style={{ gap: 12 }}>
          {[0, 1, 2, 3].map(i => <PostSkeleton key={i} colors={colors} />)}
        </View>
      )
    }
    if (!tableExists) {
      return (
        <View style={s.emptyState}>
          <BoardIllustration size={80} />
          <Text style={[s.emptyTitle, { color: colors.foreground }]}>
            {t('forum.comingSoon')}
          </Text>
        </View>
      )
    }
    return (
      <View style={s.emptyState}>
        <BoardIllustration size={80} />
        <Text style={[s.emptyTitle, { color: colors.foreground }]}>
          {t('forum.noDiscussions')}
        </Text>
        <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>
          {t('forum.startFirst')}
        </Text>
      </View>
    )
  }, [loading, tableExists, colors, t])

  // ── Category label helper for selected post ──
  const getCategoryLabel = useCallback((category: string) => {
    switch (category) {
      case 'vinkit': return t('forum.tips')
      case 'kysymykset': return t('forum.questions')
      case 'tapahtumat': return t('forum.events')
      case 'uutiset': return t('forum.news')
      default: return category
    }
  }, [t])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top, backgroundColor: isDark ? 'rgba(30,30,30,0.97)' : 'rgba(255,255,255,0.97)', borderBottomColor: colors.border }]}>
        <View style={s.headerContent}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <ArrowLeft size={22} color={colors.foreground} strokeWidth={1.8} />
          </Pressable>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('forum.title')}</Text>
          <View style={s.headerSpacer} />
        </View>
      </View>

      {/* ── Filters ── */}
      <View style={[s.filterBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {/* Neighborhood filter */}
        <Pressable
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
            setNeighborhoodFilter(prev => prev ? null : userNeighborhood)
          }}
          style={[
            s.neighborhoodChip,
            {
              backgroundColor: neighborhoodFilter
                ? `${colors.primary}14`
                : isDark ? colors.card : colors.muted,
              borderColor: neighborhoodFilter ? colors.primary : 'transparent',
            },
          ]}
        >
          <MapPin size={12} color={neighborhoodFilter ? colors.primary : colors.mutedForeground} />
          <Text style={[
            s.neighborhoodChipText,
            { color: neighborhoodFilter ? colors.primary : colors.mutedForeground },
          ]}>
            {neighborhoodFilter ?? t('forum.allAreas')}
          </Text>
        </Pressable>

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.categoryChips}
        >
          {FORUM_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.key
            const chipColor = cat.key ? cat.color : colors.primary

            return (
              <Pressable
                key={cat.key ?? 'all'}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
                  setActiveCategory(cat.key)
                }}
                style={[
                  s.categoryChip,
                  isActive
                    ? { backgroundColor: chipColor }
                    : { backgroundColor: isDark ? colors.card : colors.muted },
                ]}
              >
                <Text style={[
                  s.categoryChipText,
                  { color: isActive ? '#FFFFFF' : colors.mutedForeground },
                  isActive && { fontFamily: fonts.bodySemi },
                ]}>
                  {t(cat.labelKey)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {/* ── Sort chips ── */}
      <View style={[s.sortRow, { borderBottomColor: colors.border }]}>
        {(['newest', 'popular'] as const).map((opt) => {
          const isActive = sortBy === opt
          return (
            <Pressable
              key={opt}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
                setSortBy(opt)
              }}
              style={[
                s.sortChip,
                isActive
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: isDark ? colors.card : colors.muted },
              ]}
            >
              <Text style={[
                s.sortChipText,
                { color: isActive ? '#FFFFFF' : colors.mutedForeground },
                isActive && { fontFamily: fonts.bodySemi },
              ]}>
                {opt === 'newest' ? t('forum.sortNewest') : t('forum.sortPopular')}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {/* ── New posts banner ── */}
      {newPostsBanner && (
        <Pressable
          onPress={() => {
            setNewPostsBanner(false)
            setPage(0)
            setLoading(true)
            fetchPosts(0)
          }}
          style={[s.newPostsBanner, { backgroundColor: colors.primary }]}
        >
          <Text style={s.newPostsBannerText}>{t('forum.newPosts')}</Text>
        </Pressable>
      )}

      {/* ── Post list ── */}
      <FlatList
        data={posts}
        renderItem={renderPostCard}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={EmptyComponent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          !loading && posts.length > 0 ? (
            <View style={{ height: 100, alignItems: 'center', paddingTop: 16 }}>
              {loadingMore ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : !hasMore ? (
                <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>
                  {t('forum.noMorePosts')}
                </Text>
              ) : null}
            </View>
          ) : null
        }
      />

      {/* ── FAB ── */}
      {tableExists && currentUserId && (
        <Pressable
          onPress={() => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
            setShowCreateModal(true)
          }}
          style={[s.fab, { bottom: insets.bottom + 20, backgroundColor: colors.accent }]}
        >
          <Plus size={24} color="#FFFFFF" />
        </Pressable>
      )}

      {/* ── Create Modal ── */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[s.modalContainer, { backgroundColor: colors.background }]}
        >
          {/* Modal header */}
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setShowCreateModal(false)} hitSlop={8}>
              <X size={22} color={colors.foreground} />
            </Pressable>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>
              {t('forum.createTitle')}
            </Text>
            <Pressable
              onPress={handleCreatePost}
              disabled={publishing}
              style={[s.publishBtn, { backgroundColor: colors.primary, opacity: publishing ? 0.5 : 1 }]}
            >
              {publishing ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[s.publishBtnText, { color: colors.primaryForeground }]}>
                  {t('forum.publish')}
                </Text>
              )}
            </Pressable>
          </View>

          {/* Category picker */}
          <View style={s.modalSection}>
            <Text style={[s.modalLabel, { color: colors.mutedForeground }]}>
              {t('forum.selectCategory')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.categoryChips}
            >
              {FORUM_CATEGORIES.filter(c => c.key !== null).map((cat) => {
                const isActive = newCategory === cat.key
                return (
                  <Pressable
                    key={cat.key!}
                    onPress={() => setNewCategory(cat.key)}
                    style={[
                      s.categoryChip,
                      isActive
                        ? { backgroundColor: cat.color }
                        : { backgroundColor: isDark ? colors.card : colors.muted },
                    ]}
                  >
                    <Text style={[
                      s.categoryChipText,
                      { color: isActive ? '#FFFFFF' : colors.mutedForeground },
                      isActive && { fontFamily: fonts.bodySemi },
                    ]}>
                      {t(cat.labelKey)}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>

          {/* Title input */}
          <View style={s.modalSection}>
            <TextInput
              style={[s.titleInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: isDark ? colors.card : '#FFFFFF' }]}
              placeholder={t('forum.postTitle')}
              placeholderTextColor={colors.mutedForeground}
              value={newTitle}
              onChangeText={setNewTitle}
              maxLength={200}
              autoFocus
            />
          </View>

          {/* Content input */}
          <View style={[s.modalSection, { flex: 1 }]}>
            <TextInput
              style={[s.contentInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: isDark ? colors.card : '#FFFFFF' }]}
              placeholder={t('forum.postContent')}
              placeholderTextColor={colors.mutedForeground}
              value={newContent}
              onChangeText={setNewContent}
              multiline
              textAlignVertical="top"
              maxLength={5000}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit Post Modal ── */}
      <Modal
        visible={!!editingPost}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingPost(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[s.modalContainer, { backgroundColor: colors.background }]}
        >
          {/* Modal header */}
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setEditingPost(null)} hitSlop={8}>
              <X size={22} color={colors.foreground} />
            </Pressable>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>
              {t('forum.editPostTitle')}
            </Text>
            <Pressable
              onPress={handleSaveEdit}
              disabled={savingEdit}
              style={[s.publishBtn, { backgroundColor: colors.primary, opacity: savingEdit ? 0.5 : 1 }]}
            >
              {savingEdit ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[s.publishBtnText, { color: colors.primaryForeground }]}>
                  {t('forum.saveEdit')}
                </Text>
              )}
            </Pressable>
          </View>

          {/* Title input */}
          <View style={s.modalSection}>
            <TextInput
              style={[s.titleInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: isDark ? colors.card : '#FFFFFF' }]}
              placeholder={t('forum.postTitle')}
              placeholderTextColor={colors.mutedForeground}
              value={editTitle}
              onChangeText={setEditTitle}
              maxLength={200}
              autoFocus
            />
          </View>

          {/* Content input */}
          <View style={[s.modalSection, { flex: 1 }]}>
            <TextInput
              style={[s.contentInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: isDark ? colors.card : '#FFFFFF' }]}
              placeholder={t('forum.postContent')}
              placeholderTextColor={colors.mutedForeground}
              value={editContent}
              onChangeText={setEditContent}
              multiline
              textAlignVertical="top"
              maxLength={5000}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Post Detail Modal ── */}
      <Modal
        visible={!!selectedPost}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedPost(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[s.modalContainer, { backgroundColor: colors.background }]}
        >
          {selectedPost && (
            <>
              {/* Detail header */}
              <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
                <Pressable onPress={() => setSelectedPost(null)} hitSlop={8}>
                  <ArrowLeft size={22} color={colors.foreground} />
                </Pressable>
                <Text style={[s.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
                  {selectedPost.title}
                </Text>
                <View style={{ width: 40 }} />
              </View>

              {/* Post content */}
              <FlatList
                data={replies}
                renderItem={renderReply}
                keyExtractor={item => item.id}
                contentContainerStyle={s.detailList}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={
                  <View style={s.detailPostSection}>
                    {/* Author */}
                    <View style={s.cardUserRow}>
                      {selectedPost.user?.avatar_url ? (
                        <Image source={{ uri: selectedPost.user.avatar_url }} style={s.avatar} contentFit="cover" />
                      ) : (
                        <View style={[s.avatarFallback, { backgroundColor: `${colors.primary}20` }]}>
                          <Text style={[s.avatarFallbackText, { color: colors.primary }]}>
                            {(selectedPost.user?.name ?? '?').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={s.cardUserInfo}>
                        <Text style={[s.cardUserName, { color: colors.foreground }]}>
                          {selectedPost.user?.name ?? t('common.user')}
                        </Text>
                        <View style={s.cardUserMeta}>
                          {selectedPost.user?.naapurusto && (
                            <>
                              <MapPin size={10} color={colors.mutedForeground} />
                              <Text style={[s.cardMetaText, { color: colors.mutedForeground }]}>
                                {selectedPost.user.naapurusto}
                              </Text>
                            </>
                          )}
                          <Text style={[s.cardMetaText, { color: colors.mutedForeground }]}>
                            {formatTimeAgo(selectedPost.created_at, t, locale)}
                          </Text>
                        </View>
                      </View>
                      <View style={[s.categoryBadge, { backgroundColor: `${getCategoryColor(selectedPost.category)}18` }]}>
                        <Text style={[s.categoryBadgeText, { color: getCategoryColor(selectedPost.category) }]}>
                          {getCategoryLabel(selectedPost.category)}
                        </Text>
                      </View>
                    </View>

                    {/* Title */}
                    <Text style={[s.detailTitle, { color: colors.foreground }]}>
                      {selectedPost.title}
                    </Text>

                    {/* Content */}
                    <Text style={[s.detailContent, { color: colors.foreground }]}>
                      {selectedPost.content}
                    </Text>

                    {/* Actions */}
                    <View style={s.detailActions}>
                      <Pressable
                        onPress={() => handleUpvotePost(selectedPost)}
                        style={[
                          s.detailActionBtn,
                          votedPosts.has(selectedPost.id) && { backgroundColor: `${colors.primary}14` },
                        ]}
                        hitSlop={4}
                      >
                        <ChevronUp
                          size={18}
                          color={votedPosts.has(selectedPost.id) ? colors.primary : colors.mutedForeground}
                          strokeWidth={votedPosts.has(selectedPost.id) ? 2.5 : 1.8}
                        />
                        <Text style={[
                          s.detailActionText,
                          { color: votedPosts.has(selectedPost.id) ? colors.primary : colors.mutedForeground },
                        ]}>
                          {selectedPost.upvote_count} {t('forum.upvote')}
                        </Text>
                      </Pressable>
                      <View style={s.detailActionBtn}>
                        <MessageCircle size={16} color={colors.mutedForeground} strokeWidth={1.8} />
                        <Text style={[s.detailActionText, { color: colors.mutedForeground }]}>
                          {selectedPost.comment_count} {t('forum.replies')}
                        </Text>
                      </View>
                    </View>

                    {/* Divider */}
                    <View style={[s.divider, { backgroundColor: colors.border }]} />

                    {/* Replies header */}
                    {loadingReplies && (
                      <ActivityIndicator size="small" color={colors.mutedForeground} style={{ marginVertical: 16 }} />
                    )}
                  </View>
                }
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                ListFooterComponent={<View style={{ height: 80 }} />}
              />

              {/* Reply input */}
              <View style={[s.replyBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom || 12 }]}>
                <TextInput
                  style={[s.replyInput, { color: colors.foreground, backgroundColor: isDark ? colors.muted : '#F5F5F5', borderColor: colors.border }]}
                  placeholder={t('forum.writeReply')}
                  placeholderTextColor={colors.mutedForeground}
                  value={replyText}
                  onChangeText={setReplyText}
                  multiline
                  maxLength={2000}
                />
                <Pressable
                  onPress={handleSendReply}
                  disabled={!replyText.trim() || sendingReply}
                  style={[
                    s.sendBtn,
                    {
                      backgroundColor: replyText.trim() ? colors.primary : colors.muted,
                      opacity: sendingReply ? 0.5 : 1,
                    },
                  ]}
                >
                  {sendingReply ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Send size={18} color={replyText.trim() ? colors.primaryForeground : colors.mutedForeground} />
                  )}
                </Pressable>
              </View>
            </>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

// ── Styles ──
const s = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    zIndex: 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerContent: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 48, paddingHorizontal: 16,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17, fontFamily: fonts.headingSemi, letterSpacing: -0.2,
  },
  headerSpacer: { width: 40 },

  // Filters
  filterBar: {
    paddingHorizontal: 16, paddingVertical: 10, gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  neighborhoodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    alignSelf: 'flex-start', borderWidth: 1,
  },
  neighborhoodChipText: {
    fontSize: 12, fontFamily: fonts.bodyMedium,
  },
  categoryChips: {
    gap: 8, paddingRight: 4,
  },
  categoryChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
  },
  categoryChipText: {
    fontSize: 13, fontFamily: fonts.bodyMedium,
  },

  // Sort
  sortRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
  },
  sortChipText: {
    fontSize: 13, fontFamily: fonts.bodyMedium,
  },

  // New posts banner
  newPostsBanner: {
    marginHorizontal: 16, marginTop: 8, paddingVertical: 10,
    borderRadius: 10, alignItems: 'center',
  },
  newPostsBannerText: {
    fontSize: 13, fontFamily: fonts.bodySemi, color: '#FFFFFF',
  },

  // List
  list: {
    paddingHorizontal: 16, paddingBottom: 20,
  },
  listHeaderGap: { height: 4 },

  // Card
  card: {
    borderRadius: 12, overflow: 'hidden', flexDirection: 'row',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  categoryBar: {
    width: 4,
  },
  cardBody: {
    flex: 1, padding: 14, gap: 8,
  },
  cardUserRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
  },
  avatarFallback: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 14, fontFamily: fonts.headingSemi,
  },
  cardUserInfo: {
    flex: 1, gap: 1,
  },
  cardUserName: {
    fontSize: 13, fontFamily: fonts.bodySemi,
  },
  cardUserMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  cardMetaText: {
    fontSize: 11, fontFamily: fonts.body,
  },
  categoryBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 10, fontFamily: fonts.bodySemi,
  },
  cardTitle: {
    fontSize: 16, fontFamily: fonts.headingSemi, letterSpacing: -0.16, lineHeight: 21,
  },
  cardContent: {
    fontSize: 13, fontFamily: fonts.body, lineHeight: 18,
  },
  cardActions: {
    flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 4,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  actionText: {
    fontSize: 12, fontFamily: fonts.bodyMedium,
  },

  // Skeleton
  skelAvatar: {
    width: 32, height: 32, borderRadius: 16,
  },
  skelLine: {
    height: 10, borderRadius: 5,
  },

  // FAB
  fab: {
    position: 'absolute', right: 16,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },

  // Empty state
  emptyState: {
    alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 12,
  },
  emptyTitle: {
    fontSize: 18, fontFamily: fonts.headingSemi, letterSpacing: -0.18,
  },
  emptyHint: {
    fontSize: 14, fontFamily: fonts.body, textAlign: 'center', lineHeight: 20,
  },

  // Modal
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 56, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 16, fontFamily: fonts.headingSemi, letterSpacing: -0.16, flex: 1,
    textAlign: 'center', paddingHorizontal: 8,
  },
  modalSection: {
    paddingHorizontal: 16, paddingTop: 14,
  },
  modalLabel: {
    fontSize: 12, fontFamily: fonts.bodyMedium, marginBottom: 8,
  },
  publishBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
    minWidth: 80, alignItems: 'center',
  },
  publishBtnText: {
    fontSize: 14, fontFamily: fonts.bodySemi,
  },
  titleInput: {
    fontSize: 16, fontFamily: fonts.headingSemi, borderRadius: 10,
    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
    letterSpacing: -0.16,
  },
  contentInput: {
    flex: 1, fontSize: 14, fontFamily: fonts.body, borderRadius: 10,
    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
    lineHeight: 20, minHeight: 160,
  },

  // Detail
  detailList: {
    paddingHorizontal: 16,
  },
  detailPostSection: {
    paddingTop: 16, gap: 12,
  },
  detailTitle: {
    fontSize: 20, fontFamily: fonts.heading, letterSpacing: -0.2, lineHeight: 26,
  },
  detailContent: {
    fontSize: 15, fontFamily: fonts.body, lineHeight: 22,
  },
  detailActions: {
    flexDirection: 'row', alignItems: 'center', gap: 20, paddingTop: 4,
  },
  detailActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  detailActionText: {
    fontSize: 13, fontFamily: fonts.bodyMedium,
  },
  divider: {
    height: 1, marginVertical: 8,
  },

  // Reply card
  replyCard: {
    borderRadius: 10, padding: 12, gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  replyAvatar: {
    width: 28, height: 28, borderRadius: 14,
  },
  replyAvatarFallback: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  replyAvatarText: {
    fontSize: 12, fontFamily: fonts.headingSemi,
  },
  replyUserName: {
    fontSize: 12, fontFamily: fonts.bodySemi,
  },
  replyContent: {
    fontSize: 14, fontFamily: fonts.body, lineHeight: 20,
  },

  // Reply bar
  replyBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  replyInput: {
    flex: 1, borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, fontFamily: fonts.body, maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 1,
  },
})
