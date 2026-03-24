import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  View, Text, FlatList, RefreshControl, StyleSheet,
  Pressable, ActivityIndicator, TextInput, Modal,
  KeyboardAvoidingView, Platform, Alert, Animated,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import {
  ArrowLeft, Heart, MessageCircle, Send, ImagePlus, X,
  Settings, Users, LogOut, UserPlus, Shield, User, Trash2, Pencil,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { createClient } from '@/lib/supabase/client'
import { formatTimeAgo } from '@/lib/format'

// ── Category colors ──
const CATEGORY_COLORS: Record<string, string> = {
  general: '#2D6B5E',
  sports: '#27AE60',
  kids: '#FF9800',
  pets: '#E8A050',
  garden: '#4CAF6A',
  food: '#E74C3C',
  culture: '#8E44AD',
  other: '#607D8B',
}

// ── Types ──
interface GroupInfo {
  id: string
  name: string
  description: string | null
  category: string
  neighborhood: string | null
  is_public: boolean
  member_count: number
  created_at: string
  created_by: string
}

interface GroupPostUser {
  id: string
  name: string | null
  avatar_url: string | null
}

interface GroupPost {
  id: string
  group_id: string
  user_id: string
  content: string
  image_url: string | null
  like_count: number
  comment_count: number
  created_at: string
  user?: GroupPostUser | null
}

interface GroupComment {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  user?: GroupPostUser | null
}

interface GroupMember {
  id: string
  user_id: string
  role: 'admin' | 'member'
  user?: GroupPostUser | null
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
    <View style={[ps.postCard, { backgroundColor: colors.card }]}>
      <View style={ps.postUserRow}>
        <Animated.View style={[ps.skelAvatar, { backgroundColor: colors.muted, opacity }]} />
        <View style={{ flex: 1, gap: 4 }}>
          <Animated.View style={[ps.skelLine, { width: '40%', backgroundColor: colors.muted, opacity }]} />
          <Animated.View style={[ps.skelLine, { width: '25%', height: 8, backgroundColor: colors.muted, opacity }]} />
        </View>
      </View>
      <Animated.View style={[ps.skelLine, { width: '90%', height: 12, backgroundColor: colors.muted, opacity, marginTop: 8 }]} />
      <Animated.View style={[ps.skelLine, { width: '70%', height: 12, backgroundColor: colors.muted, opacity, marginTop: 4 }]} />
    </View>
  )
}

export default function GroupDetailScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useMemo(() => createClient(), [])

  // State
  const [group, setGroup] = useState<GroupInfo | null>(null)
  const [posts, setPosts] = useState<GroupPost[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tableExists, setTableExists] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isMember, setIsMember] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set())

  // Post input
  const [postText, setPostText] = useState('')
  const [postImage, setPostImage] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Comments
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null)
  const [comments, setComments] = useState<GroupComment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)

  // Members modal
  const [showMembers, setShowMembers] = useState(false)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Edit group modal (admin)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editNeighborhood, setEditNeighborhood] = useState('')
  const [editIsPublic, setEditIsPublic] = useState(true)
  const [savingEdit, setSavingEdit] = useState(false)

  // Delete group (admin)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Fetch current user
  useEffect(() => {
    async function fetchUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setCurrentUserId(user.id)
    }
    fetchUser()
  }, [supabase])

  // Fetch group info
  const fetchGroup = useCallback(async () => {
    if (!id) return
    try {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          setTableExists(false)
        }
        return
      }
      setTableExists(true)
      setGroup(data as unknown as GroupInfo)
    } catch {
      // silent
    }
  }, [supabase, id])

  // Check membership
  const checkMembership = useCallback(async () => {
    if (!id || !currentUserId) return
    try {
      const { data } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', id)
        .eq('user_id', currentUserId)
        .single()

      if (data) {
        setIsMember(true)
        setIsAdmin((data as any).role === 'admin')
      } else {
        setIsMember(false)
        setIsAdmin(false)
      }
    } catch {
      setIsMember(false)
    }
  }, [supabase, id, currentUserId])

  // Fetch posts
  const fetchPosts = useCallback(async () => {
    if (!id) return
    try {
      const { data, error } = await supabase
        .from('group_posts')
        .select('*, user:profiles!group_posts_user_id_fkey(id, name, avatar_url)')
        .eq('group_id', id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
          setTableExists(false)
        }
        setPosts([])
        return
      }
      setPosts((data ?? []) as unknown as GroupPost[])
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase, id])

  // Fetch likes
  const fetchLikes = useCallback(async () => {
    if (!id || !currentUserId) return
    try {
      const { data } = await supabase
        .from('group_post_likes')
        .select('post_id')
        .eq('user_id', currentUserId)

      if (data) {
        setLikedPosts(new Set((data as any[]).map((d) => d.post_id)))
      }
    } catch {
      // Table may not exist
    }
  }, [supabase, id, currentUserId])

  useEffect(() => {
    fetchGroup()
  }, [fetchGroup])

  useEffect(() => {
    if (currentUserId) {
      checkMembership()
      fetchLikes()
    }
  }, [checkMembership, fetchLikes, currentUserId])

  useEffect(() => {
    if (id) {
      setLoading(true)
      fetchPosts()
    }
  }, [fetchPosts, id])

  const handleRefresh = useCallback(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
    setRefreshing(true)
    fetchGroup()
    fetchPosts()
    if (currentUserId) {
      checkMembership()
      fetchLikes()
    }
  }, [fetchGroup, fetchPosts, checkMembership, fetchLikes, currentUserId])

  // Join / Leave
  const handleJoinLeave = useCallback(async () => {
    if (!id || !currentUserId || !group) return
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}

    if (isMember) {
      // Leave
      setIsMember(false)
      setIsAdmin(false)
      try {
        await (supabase.from('group_members') as any)
          .delete()
          .eq('group_id', id)
          .eq('user_id', currentUserId)
        await (supabase.from('groups') as any)
          .update({ member_count: Math.max(0, group.member_count - 1) })
          .eq('id', id)
        setGroup((prev) => prev ? { ...prev, member_count: Math.max(0, prev.member_count - 1) } : prev)
      } catch {
        setIsMember(true)
        Alert.alert(t('common.error'), t('groups.leaveError'))
      }
    } else {
      // Join
      setIsMember(true)
      try {
        await (supabase.from('group_members') as any).insert({
          group_id: id,
          user_id: currentUserId,
          role: 'member',
        })
        await (supabase.from('groups') as any)
          .update({ member_count: group.member_count + 1 })
          .eq('id', id)
        setGroup((prev) => prev ? { ...prev, member_count: prev.member_count + 1 } : prev)
      } catch {
        setIsMember(false)
        Alert.alert(t('common.error'), t('groups.joinError'))
      }
    }
  }, [id, currentUserId, group, isMember, supabase, t])

  // Send post
  const handleSendPost = useCallback(async () => {
    if (!id || !currentUserId || (!postText.trim() && !postImage)) return
    setSending(true)
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}

    try {
      let imageUrl: string | null = null

      // Upload image if selected
      if (postImage) {
        const ext = postImage.split('.').pop() || 'jpg'
        const fileName = `group_${id}_${Date.now()}.${ext}`

        const response = await fetch(postImage)
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const { error: uploadError } = await supabase.storage
          .from('group-images')
          .upload(fileName, arrayBuffer, { contentType: `image/${ext}`, upsert: true })
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('group-images').getPublicUrl(fileName)
          imageUrl = urlData.publicUrl
        }
      }

      await (supabase.from('group_posts') as any).insert({
        group_id: id,
        user_id: currentUserId,
        content: postText.trim(),
        image_url: imageUrl,
        like_count: 0,
        comment_count: 0,
      })

      setPostText('')
      setPostImage(null)
      fetchPosts()
    } catch {
      Alert.alert(t('common.error'), t('groups.sendError'))
    } finally {
      setSending(false)
    }
  }, [id, currentUserId, postText, postImage, supabase, fetchPosts, t])

  // Pick image
  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
    })
    if (!result.canceled && result.assets[0]) {
      setPostImage(result.assets[0].uri)
    }
  }, [])

  // Like post
  const handleLikePost = useCallback(async (post: GroupPost) => {
    if (!currentUserId) return
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}

    const alreadyLiked = likedPosts.has(post.id)

    // Optimistic
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, like_count: p.like_count + (alreadyLiked ? -1 : 1) }
          : p
      )
    )
    setLikedPosts((prev) => {
      const n = new Set(prev)
      if (alreadyLiked) n.delete(post.id)
      else n.add(post.id)
      return n
    })

    try {
      if (alreadyLiked) {
        await (supabase.from('group_post_likes') as any)
          .delete()
          .eq('user_id', currentUserId)
          .eq('post_id', post.id)
        await (supabase.from('group_posts') as any)
          .update({ like_count: Math.max(0, post.like_count - 1) })
          .eq('id', post.id)
      } else {
        await (supabase.from('group_post_likes') as any)
          .insert({ user_id: currentUserId, post_id: post.id })
        await (supabase.from('group_posts') as any)
          .update({ like_count: post.like_count + 1 })
          .eq('id', post.id)
      }
    } catch {
      // Revert
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, like_count: post.like_count } : p
        )
      )
      setLikedPosts((prev) => {
        const n = new Set(prev)
        if (alreadyLiked) n.add(post.id)
        else n.delete(post.id)
        return n
      })
      Alert.alert(t('common.error'), t('groups.likeError'))
    }
  }, [currentUserId, likedPosts, supabase, t])

  // Fetch comments for a post
  const fetchComments = useCallback(async (postId: string) => {
    setLoadingComments(true)
    try {
      const { data } = await supabase
        .from('group_post_comments')
        .select('*, user:profiles!group_post_comments_user_id_fkey(id, name, avatar_url)')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })

      setComments((data ?? []) as unknown as GroupComment[])
    } catch {
      setComments([])
    } finally {
      setLoadingComments(false)
    }
  }, [supabase])

  // Toggle comments
  const handleToggleComments = useCallback((postId: string) => {
    if (expandedPostId === postId) {
      setExpandedPostId(null)
      setComments([])
    } else {
      setExpandedPostId(postId)
      fetchComments(postId)
    }
  }, [expandedPostId, fetchComments])

  // Send comment
  const handleSendComment = useCallback(async (postId: string) => {
    if (!currentUserId || !commentText.trim()) return
    setSendingComment(true)
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}

    try {
      await (supabase.from('group_post_comments') as any).insert({
        post_id: postId,
        user_id: currentUserId,
        content: commentText.trim(),
      })
      await (supabase.from('group_posts') as any)
        .update({ comment_count: (posts.find((p) => p.id === postId)?.comment_count ?? 0) + 1 })
        .eq('id', postId)

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p
        )
      )

      setCommentText('')
      fetchComments(postId)
    } catch {
      Alert.alert(t('common.error'), t('groups.sendError'))
    } finally {
      setSendingComment(false)
    }
  }, [currentUserId, commentText, supabase, posts, fetchComments, t])

  // Fetch members
  const fetchMembers = useCallback(async () => {
    if (!id) return
    setLoadingMembers(true)
    try {
      const { data } = await supabase
        .from('group_members')
        .select('*, user:profiles!group_members_user_id_fkey(id, name, avatar_url)')
        .eq('group_id', id)
        .order('role', { ascending: true })

      setMembers((data ?? []) as unknown as GroupMember[])
    } catch {
      setMembers([])
    } finally {
      setLoadingMembers(false)
    }
  }, [supabase, id])

  // Remove member (admin only)
  const handleRemoveMember = useCallback(async (member: GroupMember) => {
    if (!isAdmin || !id || !group) return
    Alert.alert(
      t('common.confirm'),
      t('groups.removeConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              await (supabase.from('group_members') as any)
                .delete()
                .eq('group_id', id)
                .eq('user_id', member.user_id)
              await (supabase.from('groups') as any)
                .update({ member_count: Math.max(0, group.member_count - 1) })
                .eq('id', id)
              setGroup((prev) => prev ? { ...prev, member_count: Math.max(0, prev.member_count - 1) } : prev)
              setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id))
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
            } catch {
              Alert.alert(t('common.error'), t('groups.removeError'))
            }
          },
        },
      ]
    )
  }, [isAdmin, id, group, supabase, t])

  // ── Delete own group post ──
  const handleDeleteGroupPost = useCallback(async (postId: string) => {
    Alert.alert(
      t('groups.deletePost'),
      t('groups.deletePostConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete comments first
              await (supabase.from('group_post_comments') as any).delete().eq('post_id', postId)
              // Delete likes
              await (supabase.from('group_post_likes') as any).delete().eq('post_id', postId)
              // Delete the post
              await (supabase.from('group_posts') as any).delete().eq('id', postId)
              // Remove from local state
              setPosts(prev => prev.filter(p => p.id !== postId))
              // Close comments if expanded
              if (expandedPostId === postId) {
                setExpandedPostId(null)
                setComments([])
              }
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
            } catch {
              Alert.alert(t('common.error'), t('groups.sendError'))
            }
          },
        },
      ]
    )
  }, [supabase, t, expandedPostId])

  // ── Delete own comment ──
  const handleDeleteComment = useCallback(async (comment: GroupComment) => {
    try {
      await (supabase.from('group_post_comments') as any).delete().eq('id', comment.id)

      // Decrement comment_count on parent post
      const parentPost = posts.find(p => p.id === comment.post_id)
      if (parentPost) {
        const newCount = Math.max(0, parentPost.comment_count - 1)
        await (supabase.from('group_posts') as any)
          .update({ comment_count: newCount })
          .eq('id', comment.post_id)

        setPosts(prev => prev.map(p =>
          p.id === comment.post_id ? { ...p, comment_count: newCount } : p
        ))
      }

      // Remove from local state
      setComments(prev => prev.filter(c => c.id !== comment.id))
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    } catch {
      Alert.alert(t('common.error'), t('groups.sendError'))
    }
  }, [supabase, posts, t])

  // ── Edit group info (admin) ──
  const handleOpenEditModal = useCallback(() => {
    if (!group) return
    setEditName(group.name)
    setEditDescription(group.description ?? '')
    setEditNeighborhood(group.neighborhood ?? '')
    setEditIsPublic(group.is_public)
    setShowEditModal(true)
  }, [group])

  const handleSaveGroupEdit = useCallback(async () => {
    if (!id || !editName.trim()) return
    setSavingEdit(true)
    try {
      await (supabase.from('groups') as any)
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
          neighborhood: editNeighborhood.trim() || null,
          naapurusto: editNeighborhood.trim() || null,
          is_public: editIsPublic,
          is_private: !editIsPublic,
        })
        .eq('id', id)

      setGroup(prev => prev ? {
        ...prev,
        name: editName.trim(),
        description: editDescription.trim() || null,
        neighborhood: editNeighborhood.trim() || null,
        is_public: editIsPublic,
      } : prev)

      setShowEditModal(false)
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    } catch {
      Alert.alert(t('common.error'), t('groups.createError'))
    } finally {
      setSavingEdit(false)
    }
  }, [id, editName, editDescription, editNeighborhood, editIsPublic, supabase, t])

  // ── Delete group (admin) ──
  const handleDeleteGroup = useCallback(async () => {
    if (!id) return
    Alert.alert(
      t('groups.deleteGroup'),
      t('groups.deleteGroupWarning'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete in order: comments, likes, posts, members, group
              await (supabase.from('group_post_comments') as any)
                .delete()
                .in('post_id', posts.map(p => p.id).length > 0 ? posts.map(p => p.id) : ['__none__'])
              await (supabase.from('group_post_likes') as any)
                .delete()
                .in('post_id', posts.map(p => p.id).length > 0 ? posts.map(p => p.id) : ['__none__'])
              await (supabase.from('group_posts') as any).delete().eq('group_id', id)
              await (supabase.from('group_members') as any).delete().eq('group_id', id)
              await (supabase.from('groups') as any).delete().eq('id', id)

              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
              router.back()
            } catch {
              Alert.alert(t('common.error'), t('groups.sendError'))
            }
          },
        },
      ]
    )
  }, [id, supabase, posts, t, router])

  const catColor = CATEGORY_COLORS[group?.category ?? 'general'] || colors.primary

  // ── Coming soon ──
  if (!loading && !tableExists) {
    return (
      <View style={[ps.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[ps.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} style={ps.headerBtn} hitSlop={8}>
            <ArrowLeft size={22} color={colors.foreground} strokeWidth={1.8} />
          </Pressable>
          <Text style={[ps.headerTitle, { color: colors.foreground }]}>
            {t('groups.title')}
          </Text>
          <View style={ps.headerBtn} />
        </View>
        <View style={ps.emptyContainer}>
          <Users size={48} color={colors.mutedForeground} strokeWidth={1.2} />
          <Text style={[ps.emptyText, { color: colors.mutedForeground }]}>
            {t('groups.comingSoon')}
          </Text>
        </View>
      </View>
    )
  }

  // ── Render post ──
  const renderPost = ({ item }: { item: GroupPost }) => {
    const liked = likedPosts.has(item.id)
    const isExpanded = expandedPostId === item.id

    return (
      <View style={[ps.postCard, { backgroundColor: colors.card, shadowOpacity: isDark ? 0.12 : 0.06 }]}>
        <View style={[ps.categoryBar, { backgroundColor: catColor }]} />
        <View style={ps.postBody}>
          {/* User row */}
          <View style={ps.postUserRow}>
            {item.user?.avatar_url ? (
              <Image
                source={{ uri: item.user.avatar_url }}
                style={ps.avatar}
                contentFit="cover"
              />
            ) : (
              <View style={[ps.avatarPlaceholder, { backgroundColor: colors.muted }]}>
                <User size={16} color={colors.mutedForeground} strokeWidth={1.8} />
              </View>
            )}
            <View style={ps.postUserInfo}>
              <Text style={[ps.postUserName, { color: colors.foreground }]} numberOfLines={1}>
                {item.user?.name || t('common.user')}
              </Text>
              <Text style={[ps.postTime, { color: colors.mutedForeground }]}>
                {formatTimeAgo(item.created_at, t, locale)}
              </Text>
            </View>
            {item.user_id === currentUserId && (
              <Pressable
                onPress={() => handleDeleteGroupPost(item.id)}
                hitSlop={6}
                style={{ padding: 4 }}
              >
                <Trash2 size={16} color={colors.destructive} strokeWidth={1.8} />
              </Pressable>
            )}
          </View>

          {/* Content */}
          <Text style={[ps.postContent, { color: colors.foreground }]}>
            {item.content}
          </Text>

          {/* Image */}
          {item.image_url && (
            <Image
              source={{ uri: item.image_url }}
              style={ps.postImage}
              contentFit="cover"
            />
          )}

          {/* Actions */}
          <View style={ps.postActions}>
            <Pressable style={ps.actionBtn} onPress={() => handleLikePost(item)}>
              <Heart
                size={18}
                color={liked ? colors.destructive : colors.mutedForeground}
                fill={liked ? colors.destructive : 'transparent'}
                strokeWidth={1.8}
              />
              <Text style={[ps.actionText, { color: liked ? colors.destructive : colors.mutedForeground }]}>
                {item.like_count || 0}
              </Text>
            </Pressable>
            <Pressable style={ps.actionBtn} onPress={() => handleToggleComments(item.id)}>
              <MessageCircle
                size={18}
                color={isExpanded ? colors.primary : colors.mutedForeground}
                strokeWidth={1.8}
              />
              <Text style={[ps.actionText, { color: isExpanded ? colors.primary : colors.mutedForeground }]}>
                {item.comment_count || 0}
              </Text>
            </Pressable>
          </View>

          {/* Comments section */}
          {isExpanded && (
            <View style={[ps.commentsSection, { borderTopColor: colors.border }]}>
              {loadingComments ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 8 }} />
              ) : (
                comments.map((c) => (
                  <View key={c.id} style={ps.commentRow}>
                    {c.user?.avatar_url ? (
                      <Image source={{ uri: c.user.avatar_url }} style={ps.commentAvatar} contentFit="cover" />
                    ) : (
                      <View style={[ps.commentAvatarPlaceholder, { backgroundColor: colors.muted }]}>
                        <User size={10} color={colors.mutedForeground} strokeWidth={1.8} />
                      </View>
                    )}
                    <View style={ps.commentBody}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[ps.commentUser, { color: colors.foreground }]}>
                          {c.user?.name || t('common.user')}
                        </Text>
                        {c.user_id === currentUserId && (
                          <Pressable
                            onPress={() => handleDeleteComment(c)}
                            hitSlop={6}
                            style={{ padding: 2 }}
                          >
                            <X size={12} color={colors.destructive} strokeWidth={1.8} />
                          </Pressable>
                        )}
                      </View>
                      <Text style={[ps.commentContent, { color: colors.foreground }]}>
                        {c.content}
                      </Text>
                      <Text style={[ps.commentTime, { color: colors.mutedForeground }]}>
                        {formatTimeAgo(c.created_at, t, locale)}
                      </Text>
                    </View>
                  </View>
                ))
              )}

              {/* Comment input */}
              <View style={[ps.commentInputRow, { borderTopColor: colors.border }]}>
                <TextInput
                  style={[ps.commentInput, { color: colors.foreground, backgroundColor: colors.muted }]}
                  placeholder={t('groups.writePost')}
                  placeholderTextColor={colors.mutedForeground}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                />
                <Pressable
                  style={[ps.commentSendBtn, { opacity: commentText.trim() ? 1 : 0.4 }]}
                  onPress={() => handleSendComment(item.id)}
                  disabled={sendingComment || !commentText.trim()}
                >
                  {sendingComment ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Send size={18} color={colors.primary} strokeWidth={1.8} />
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    )
  }

  // ── Header component ──
  const ListHeader = useMemo(() => {
    if (!group) return null
    const categoryLabelKey = `groups.${group.category}` as string

    return (
      <View style={[ps.infoCard, { backgroundColor: colors.card, shadowOpacity: isDark ? 0.12 : 0.06 }]}>
        {/* Group name */}
        <Text style={[ps.groupName, { color: colors.foreground }]}>
          {group.name}
        </Text>

        {/* Description */}
        {group.description && (
          <Text style={[ps.groupDesc, { color: colors.mutedForeground }]}>
            {group.description}
          </Text>
        )}

        {/* Badges */}
        <View style={ps.badgeRow}>
          <View style={[ps.badge, { backgroundColor: catColor + '20' }]}>
            <Text style={[ps.badgeText, { color: catColor }]}>
              {t(categoryLabelKey)}
            </Text>
          </View>
          {group.neighborhood && (
            <View style={[ps.badge, { backgroundColor: colors.muted }]}>
              <Text style={[ps.badgeText, { color: colors.foreground }]}>
                {group.neighborhood}
              </Text>
            </View>
          )}
        </View>

        {/* Members + action */}
        <View style={ps.infoActions}>
          <Pressable
            style={ps.membersBtn}
            onPress={() => {
              setShowMembers(true)
              fetchMembers()
            }}
          >
            <Users size={16} color={colors.primary} strokeWidth={1.8} />
            <Text style={[ps.membersBtnText, { color: colors.primary }]}>
              {group.member_count} {t('groups.members')}
            </Text>
          </Pressable>

          <Pressable
            style={[ps.joinLeaveBtn, {
              backgroundColor: isMember ? 'transparent' : colors.accent,
              borderColor: isMember ? colors.destructive : colors.accent,
              borderWidth: isMember ? 1 : 0,
            }]}
            onPress={handleJoinLeave}
          >
            {isMember ? (
              <>
                <LogOut size={14} color={colors.destructive} strokeWidth={1.8} />
                <Text style={[ps.joinLeaveBtnText, { color: colors.destructive }]}>
                  {t('groups.leave')}
                </Text>
              </>
            ) : (
              <>
                <UserPlus size={14} color={colors.accentForeground} strokeWidth={1.8} />
                <Text style={[ps.joinLeaveBtnText, { color: colors.accentForeground }]}>
                  {t('groups.join')}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    )
  }, [group, colors, isDark, catColor, t, isMember, handleJoinLeave, fetchMembers])

  return (
    <KeyboardAvoidingView
      style={[ps.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[ps.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={ps.headerBtn} hitSlop={8}>
          <ArrowLeft size={22} color={colors.foreground} strokeWidth={1.8} />
        </Pressable>
        <View style={ps.headerCenter}>
          <Text style={[ps.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {group?.name || t('groups.title')}
          </Text>
          {group && (
            <Text style={[ps.headerSub, { color: colors.mutedForeground }]}>
              {group.member_count} {t('groups.members')}
            </Text>
          )}
        </View>
        {isAdmin ? (
          <Pressable style={ps.headerBtn} hitSlop={8} onPress={handleOpenEditModal}>
            <Pencil size={20} color={colors.mutedForeground} strokeWidth={1.8} />
          </Pressable>
        ) : (
          <View style={ps.headerBtn} />
        )}
      </View>

      {/* Posts list */}
      {loading ? (
        <View style={ps.loadingContainer}>
          {[1, 2, 3].map((i) => <PostSkeleton key={i} colors={colors} />)}
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          contentContainerStyle={[ps.listContent, { paddingBottom: isMember ? 80 + insets.bottom : 20 + insets.bottom }]}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={ps.emptySection}>
              <MessageCircle size={32} color={colors.mutedForeground} strokeWidth={1.2} />
              <Text style={[ps.emptySectionText, { color: colors.mutedForeground }]}>
                {t('groups.noPosts')}
              </Text>
              <Text style={[ps.emptySectionSub, { color: colors.mutedForeground }]}>
                {t('groups.startConversation')}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        />
      )}

      {/* Post input (only for members) */}
      {isMember && (
        <View style={[ps.postInputBar, {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom + 8,
        }]}>
          {postImage && (
            <View style={ps.imagePreviewRow}>
              <Image source={{ uri: postImage }} style={ps.imagePreview} contentFit="cover" />
              <Pressable onPress={() => setPostImage(null)} style={ps.removeImageBtn}>
                <X size={14} color="#FFF" strokeWidth={2} />
              </Pressable>
            </View>
          )}
          <View style={ps.postInputRow}>
            <Pressable onPress={handlePickImage} style={ps.imageBtn} hitSlop={8}>
              <ImagePlus size={20} color={colors.mutedForeground} strokeWidth={1.8} />
            </Pressable>
            <TextInput
              style={[ps.postInput, { color: colors.foreground, backgroundColor: colors.muted }]}
              placeholder={t('groups.writePost')}
              placeholderTextColor={colors.mutedForeground}
              value={postText}
              onChangeText={setPostText}
              multiline
              maxLength={2000}
            />
            <Pressable
              style={[ps.sendBtn, {
                backgroundColor: (postText.trim() || postImage) ? colors.accent : colors.muted,
              }]}
              onPress={handleSendPost}
              disabled={sending || (!postText.trim() && !postImage)}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.accentForeground} />
              ) : (
                <Send size={18} color={(postText.trim() || postImage) ? colors.accentForeground : colors.mutedForeground} strokeWidth={1.8} />
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* Members Modal */}
      <Modal visible={showMembers} animationType="slide" transparent>
        <View style={[ps.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[ps.modalContent, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
            <View style={ps.modalHeader}>
              <Text style={[ps.modalTitle, { color: colors.foreground }]}>
                {group?.member_count || 0} {t('groups.members')}
              </Text>
              <Pressable onPress={() => setShowMembers(false)} hitSlop={8}>
                <X size={22} color={colors.mutedForeground} strokeWidth={1.8} />
              </Pressable>
            </View>

            {loadingMembers ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={members}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={ps.memberRow}>
                    {item.user?.avatar_url ? (
                      <Image source={{ uri: item.user.avatar_url }} style={ps.memberAvatar} contentFit="cover" />
                    ) : (
                      <View style={[ps.memberAvatarPlaceholder, { backgroundColor: colors.muted }]}>
                        <User size={16} color={colors.mutedForeground} strokeWidth={1.8} />
                      </View>
                    )}
                    <Text style={[ps.memberName, { color: colors.foreground }]} numberOfLines={1}>
                      {item.user?.name || t('common.user')}
                    </Text>
                    <View style={[ps.roleBadge, {
                      backgroundColor: item.role === 'admin' ? colors.primary + '20' : colors.muted,
                    }]}>
                      {item.role === 'admin' && <Shield size={12} color={colors.primary} strokeWidth={1.8} />}
                      <Text style={[ps.roleText, {
                        color: item.role === 'admin' ? colors.primary : colors.mutedForeground,
                      }]}>
                        {item.role === 'admin' ? t('groups.admin') : t('groups.member')}
                      </Text>
                    </View>
                    {isAdmin && item.role !== 'admin' && item.user_id !== currentUserId && (
                      <Pressable onPress={() => handleRemoveMember(item)} hitSlop={8} style={{ marginLeft: 8 }}>
                        <X size={16} color={colors.destructive} strokeWidth={1.8} />
                      </Pressable>
                    )}
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Group Modal (admin) */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={[ps.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[ps.modalContent, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}
          >
            <View style={ps.modalHeader}>
              <Text style={[ps.modalTitle, { color: colors.foreground }]}>
                {t('groups.editGroup')}
              </Text>
              <Pressable onPress={() => setShowEditModal(false)} hitSlop={8}>
                <X size={22} color={colors.mutedForeground} strokeWidth={1.8} />
              </Pressable>
            </View>

            <View style={{ paddingHorizontal: 20, gap: 12 }}>
              <TextInput
                style={[ps.editInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                placeholder={t('groups.name')}
                placeholderTextColor={colors.mutedForeground}
                value={editName}
                onChangeText={setEditName}
                maxLength={100}
              />
              <TextInput
                style={[ps.editInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border, minHeight: 80 }]}
                placeholder={t('groups.description')}
                placeholderTextColor={colors.mutedForeground}
                value={editDescription}
                onChangeText={setEditDescription}
                multiline
                textAlignVertical="top"
                maxLength={500}
              />
              <TextInput
                style={[ps.editInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                placeholder={t('groups.neighborhood')}
                placeholderTextColor={colors.mutedForeground}
                value={editNeighborhood}
                onChangeText={setEditNeighborhood}
                maxLength={100}
              />

              {/* Public/Private toggle */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => setEditIsPublic(true)}
                  style={[ps.toggleChip, { backgroundColor: editIsPublic ? colors.primary : colors.muted }]}
                >
                  <Text style={{ color: editIsPublic ? '#FFFFFF' : colors.mutedForeground, fontSize: 13, fontFamily: fonts.bodySemi }}>
                    {t('groups.public')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setEditIsPublic(false)}
                  style={[ps.toggleChip, { backgroundColor: !editIsPublic ? colors.primary : colors.muted }]}
                >
                  <Text style={{ color: !editIsPublic ? '#FFFFFF' : colors.mutedForeground, fontSize: 13, fontFamily: fonts.bodySemi }}>
                    {t('groups.private')}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={handleSaveGroupEdit}
                disabled={savingEdit || !editName.trim()}
                style={[ps.saveBtn, { backgroundColor: colors.primary, opacity: (savingEdit || !editName.trim()) ? 0.5 : 1 }]}
              >
                {savingEdit ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontFamily: fonts.bodySemi }}>
                    {t('groups.saveChanges')}
                  </Text>
                )}
              </Pressable>

              {/* Delete group button */}
              <Pressable
                onPress={handleDeleteGroup}
                style={[ps.deleteGroupBtn, { borderColor: colors.destructive }]}
              >
                <Trash2 size={16} color={colors.destructive} strokeWidth={1.8} />
                <Text style={{ color: colors.destructive, fontSize: 14, fontFamily: fonts.bodySemi }}>
                  {t('groups.deleteGroup')}
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

// ── Styles ──
const ps = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: fonts.headingSemi,
  },
  headerSub: {
    fontSize: 11,
    fontFamily: fonts.body,
    marginTop: -1,
  },
  loadingContainer: {
    padding: 16,
  },
  listContent: {
    padding: 16,
  },
  // Info card
  infoCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  groupName: {
    fontSize: 20,
    fontFamily: fonts.heading,
    marginBottom: 4,
  },
  groupDesc: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
  },
  infoActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  membersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  membersBtnText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
  },
  joinLeaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  joinLeaveBtnText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
  },
  // Post card
  postCard: {
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    flexDirection: 'row',
  },
  categoryBar: {
    width: 4,
  },
  postBody: {
    flex: 1,
    padding: 14,
  },
  postUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postUserInfo: {
    flex: 1,
  },
  postUserName: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
  },
  postTime: {
    fontSize: 11,
    fontFamily: fonts.body,
    marginTop: 1,
  },
  postContent: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    marginBottom: 8,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    marginBottom: 8,
  },
  postActions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionText: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
  },
  // Comments
  commentsSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  commentAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  commentAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentBody: {
    flex: 1,
  },
  commentUser: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
  },
  commentContent: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
    marginTop: 2,
  },
  commentTime: {
    fontSize: 10,
    fontFamily: fonts.body,
    marginTop: 2,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.body,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 80,
  },
  commentSendBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Post input bar
  postInputBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  imagePreviewRow: {
    marginBottom: 8,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  imageBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.body,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
  },
  emptySection: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
    marginTop: 16,
  },
  emptySectionText: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
  },
  emptySectionSub: {
    fontSize: 12,
    fontFamily: fonts.body,
    textAlign: 'center',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: fonts.heading,
  },
  // Members
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 12,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  memberAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberName: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  roleText: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
  },
  // Edit modal
  editInput: {
    fontSize: 14,
    fontFamily: fonts.body,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toggleChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  saveBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  deleteGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  // Skeleton
  skelAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  skelLine: {
    height: 10,
    borderRadius: 5,
  },
})
