import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  View, Text, FlatList, RefreshControl, StyleSheet,
  Pressable, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Alert, Animated,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import {
  ArrowLeft, MessageCircle, Send, ImagePlus, X,
  Users, LogOut, UserPlus, Pencil, Search,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { Avatar } from '@/components/Avatar'
import { formatTimeAgo } from '@/lib/format'
import { GroupPostCard } from '@/components/groups/GroupPostCard'
import { GroupCommentList } from '@/components/groups/GroupCommentList'
import { GroupMembersModal } from '@/components/groups/GroupMembersModal'
import { GroupEditModal } from '@/components/groups/GroupEditModal'
import { isValidUUID } from '@/lib/validation'
import type { GroupPost, GroupComment } from '@/components/groups/GroupPostCard'
import type { GroupMember } from '@/components/groups/GroupMembersModal'

// ── Category colors ──
const CATEGORY_COLORS: Record<string, string> = {
  general: '#2D6B5E', sports: '#27AE60', kids: '#FF9800', pets: '#E8A050',
  garden: '#4CAF6A', food: '#E74C3C', culture: '#8E44AD', other: '#607D8B',
}

interface GroupInfo {
  id: string; name: string; description: string | null; category: string
  neighborhood: string | null; is_public: boolean; member_count: number
  created_at: string; created_by: string
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

// TODO: UX — GROUP LIFECYCLE (friction for active group members):
//
// 1. PIN POST: Admin should be able to pin important posts to the top of the
//    group feed. Add an 'is_pinned' field to group_posts table and a pin/unpin
//    action in the post menu for admins. Pinned posts render above the regular
//    feed with a "Pinned" badge.
//
// 2. GROUP ACTIVITY INDICATOR: Show "X new posts this week" or "Last activity:
//    2 days ago" on the groups list (app/groups.tsx) so users know which groups
//    are active without tapping into each one.
//
// 3. MUTE GROUP NOTIFICATIONS: Add a "Mute notifications" toggle per group.
//    Store in group_members.notifications_muted boolean. Users in active groups
//    get overwhelmed without per-group mute control.
//
// 4. SEARCH WITHIN GROUP: The searchQuery state exists but there's no visible
//    search bar in the UI to filter posts within the group. Wire it up.
export default function GroupDetailScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()

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

  // Edit post state
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editPostContent, setEditPostContent] = useState('')
  const [savingPostEdit, setSavingPostEdit] = useState(false)

  // Search posts
  const [searchQuery, setSearchQuery] = useState('')
  const [newPostsBanner, setNewPostsBanner] = useState(false)

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
  const [savingEdit, setSavingEdit] = useState(false)

  // ── Fetch current user ──
  useEffect(() => {
    async function fetchUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setCurrentUserId(user.id)
    }
    fetchUser()
  }, [supabase])

  // ── Fetch group info ──
  const fetchGroup = useCallback(async () => {
    if (!id || !isValidUUID(id as string)) return
    try {
      const { data, error } = await supabase.from('groups').select('*').eq('id', id).single()
      if (error) {
        if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) setTableExists(false)
        return
      }
      setTableExists(true)
      setGroup(data as unknown as GroupInfo)
    } catch { /* silent */ }
  }, [supabase, id])

  const checkMembership = useCallback(async () => {
    if (!id || !currentUserId) return
    try {
      const { data } = await supabase.from('group_members').select('role').eq('group_id', id).eq('user_id', currentUserId).single()
      if (data) { setIsMember(true); setIsAdmin((data as any).role === 'admin') }
      else { setIsMember(false); setIsAdmin(false) }
    } catch { setIsMember(false) }
  }, [supabase, id, currentUserId])

  const fetchPosts = useCallback(async () => {
    if (!id) return
    try {
      const { data, error } = await supabase.from('group_posts')
        .select('*, user:profiles!group_posts_user_id_fkey(id, name, avatar_url)')
        .eq('group_id', id).order('created_at', { ascending: false }).limit(50)
      if (error) {
        if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) setTableExists(false)
        setPosts([]); return
      }
      setPosts((data ?? []) as unknown as GroupPost[])
    } catch { setPosts([]) }
    finally { setLoading(false); setRefreshing(false) }
  }, [supabase, id])

  const fetchLikes = useCallback(async () => {
    if (!id || !currentUserId) return
    try {
      const { data } = await supabase.from('group_post_likes').select('post_id').eq('user_id', currentUserId)
      if (data) setLikedPosts(new Set((data as any[]).map((d) => d.post_id)))
    } catch { /* Table may not exist */ }
  }, [supabase, id, currentUserId])

  useEffect(() => { fetchGroup() }, [fetchGroup])
  useEffect(() => { if (currentUserId) { checkMembership(); fetchLikes() } }, [checkMembership, fetchLikes, currentUserId])
  useEffect(() => { if (id) { setLoading(true); fetchPosts() } }, [fetchPosts, id])

  // ── Realtime ──
  useEffect(() => {
    if (!id) return
    const channel = supabase.channel(`group_posts_realtime_${id}`)
      .on('postgres_changes' as any, { event: 'INSERT', schema: 'public', table: 'group_posts', filter: `group_id=eq.${id}` },
        (payload: any) => { if (payload.new && payload.new.user_id !== currentUserId) setNewPostsBanner(true) })
      .on('postgres_changes' as any, { event: 'DELETE', schema: 'public', table: 'group_posts', filter: `group_id=eq.${id}` },
        (payload: any) => { if (payload.old?.id) setPosts(prev => prev.filter(p => p.id !== payload.old.id)) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, id, currentUserId])

  const handleRefresh = useCallback(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
    setRefreshing(true); fetchGroup(); fetchPosts()
    if (currentUserId) { checkMembership(); fetchLikes() }
  }, [fetchGroup, fetchPosts, checkMembership, fetchLikes, currentUserId])

  // ── Join / Leave ──
  const handleJoinLeave = useCallback(async () => {
    if (!id || !currentUserId || !group) return
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
    if (isMember) {
      setIsMember(false); setIsAdmin(false)
      try {
        await (supabase.from('group_members') as any).delete().eq('group_id', id).eq('user_id', currentUserId)
        await (supabase.from('groups') as any).update({ member_count: Math.max(0, group.member_count - 1) }).eq('id', id)
        setGroup(prev => prev ? { ...prev, member_count: Math.max(0, prev.member_count - 1) } : prev)
      } catch { setIsMember(true); Alert.alert(t('common.error'), t('groups.leaveError')) }
    } else {
      setIsMember(true)
      try {
        await (supabase.from('group_members') as any).insert({ group_id: id, user_id: currentUserId, role: 'member' })
        await (supabase.from('groups') as any).update({ member_count: group.member_count + 1 }).eq('id', id)
        setGroup(prev => prev ? { ...prev, member_count: prev.member_count + 1 } : prev)
      } catch { setIsMember(false); Alert.alert(t('common.error'), t('groups.joinError')) }
    }
  }, [id, currentUserId, group, isMember, supabase, t])

  // ── Send post ──
  const handleSendPost = useCallback(async () => {
    if (!id || !currentUserId || (!postText.trim() && !postImage)) return
    setSending(true)
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    try {
      let imageUrl: string | null = null
      if (postImage) {
        const ext = postImage.split('.').pop() || 'jpg'
        const fileName = `group_${id}_${Date.now()}.${ext}`
        const response = await fetch(postImage)
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const { error: uploadError } = await supabase.storage.from('group-images').upload(fileName, arrayBuffer, { contentType: `image/${ext}`, upsert: true })
        if (!uploadError) { const { data: urlData } = supabase.storage.from('group-images').getPublicUrl(fileName); imageUrl = urlData.publicUrl }
      }
      await (supabase.from('group_posts') as any).insert({ group_id: id, user_id: currentUserId, content: postText.trim(), image_url: imageUrl, like_count: 0, comment_count: 0 })
      setPostText(''); setPostImage(null); fetchPosts()
    } catch { Alert.alert(t('common.error'), t('groups.sendError')) }
    finally { setSending(false) }
  }, [id, currentUserId, postText, postImage, supabase, fetchPosts, t])

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true })
    if (!result.canceled && result.assets[0]) setPostImage(result.assets[0].uri)
  }, [])

  // ── Like post ──
  const handleLikePost = useCallback(async (postId: string) => {
    if (!currentUserId) return
    const post = posts.find(p => p.id === postId)
    if (!post) return
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    const alreadyLiked = likedPosts.has(postId)
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, like_count: p.like_count + (alreadyLiked ? -1 : 1) } : p))
    setLikedPosts(prev => { const n = new Set(prev); if (alreadyLiked) n.delete(postId); else n.add(postId); return n })
    try {
      if (alreadyLiked) {
        await (supabase.from('group_post_likes') as any).delete().eq('user_id', currentUserId).eq('post_id', postId)
        await (supabase.from('group_posts') as any).update({ like_count: Math.max(0, post.like_count - 1) }).eq('id', postId)
      } else {
        await (supabase.from('group_post_likes') as any).insert({ user_id: currentUserId, post_id: postId })
        await (supabase.from('group_posts') as any).update({ like_count: post.like_count + 1 }).eq('id', postId)
      }
    } catch {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, like_count: post.like_count } : p))
      setLikedPosts(prev => { const n = new Set(prev); if (alreadyLiked) n.add(postId); else n.delete(postId); return n })
      Alert.alert(t('common.error'), t('groups.likeError'))
    }
  }, [currentUserId, likedPosts, supabase, t, posts])

  // ── Comments ──
  const fetchComments = useCallback(async (postId: string) => {
    setLoadingComments(true)
    try {
      const { data } = await supabase.from('group_post_comments')
        .select('*, user:profiles!group_post_comments_user_id_fkey(id, name, avatar_url)')
        .eq('post_id', postId).order('created_at', { ascending: true })
      setComments((data ?? []) as unknown as GroupComment[])
    } catch { setComments([]) }
    finally { setLoadingComments(false) }
  }, [supabase])

  const handleToggleComments = useCallback((postId: string) => {
    if (expandedPostId === postId) { setExpandedPostId(null); setComments([]) }
    else { setExpandedPostId(postId); fetchComments(postId) }
  }, [expandedPostId, fetchComments])

  const handleSendComment = useCallback(async (postId: string) => {
    if (!currentUserId || !commentText.trim()) return
    setSendingComment(true)
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    try {
      await (supabase.from('group_post_comments') as any).insert({ post_id: postId, user_id: currentUserId, content: commentText.trim() })
      await (supabase.from('group_posts') as any).update({ comment_count: (posts.find(p => p.id === postId)?.comment_count ?? 0) + 1 }).eq('id', postId)
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p))
      setCommentText(''); fetchComments(postId)
    } catch { Alert.alert(t('common.error'), t('groups.sendError')) }
    finally { setSendingComment(false) }
  }, [currentUserId, commentText, supabase, posts, fetchComments, t])

  const handleDeleteComment = useCallback(async (comment: GroupComment) => {
    try {
      await (supabase.from('group_post_comments') as any).delete().eq('id', comment.id)
      const parentPost = posts.find(p => p.id === comment.post_id)
      if (parentPost) {
        const newCount = Math.max(0, parentPost.comment_count - 1)
        await (supabase.from('group_posts') as any).update({ comment_count: newCount }).eq('id', comment.post_id)
        setPosts(prev => prev.map(p => p.id === comment.post_id ? { ...p, comment_count: newCount } : p))
      }
      setComments(prev => prev.filter(c => c.id !== comment.id))
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    } catch { Alert.alert(t('common.error'), t('groups.sendError')) }
  }, [supabase, posts, t])

  // ── Edit / Delete post ──
  const handleStartEditPost = useCallback((postId: string, content: string) => {
    setEditingPostId(postId); setEditPostContent(content)
  }, [])

  const handleSaveGroupPostEdit = useCallback(async () => {
    if (!editingPostId || !editPostContent.trim()) return
    setSavingPostEdit(true)
    try {
      await (supabase.from('group_posts') as any).update({ content: editPostContent.trim() }).eq('id', editingPostId)
      setPosts(prev => prev.map(p => p.id === editingPostId ? { ...p, content: editPostContent.trim() } : p))
      setEditingPostId(null); setEditPostContent('')
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    } catch { Alert.alert(t('common.error'), t('groups.sendError')) }
    finally { setSavingPostEdit(false) }
  }, [editingPostId, editPostContent, supabase, t])

  const handleCancelEditPost = useCallback(() => { setEditingPostId(null); setEditPostContent('') }, [])

  const handleDeleteGroupPost = useCallback(async (postId: string) => {
    Alert.alert(t('groups.deletePost'), t('groups.deletePostConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        try {
          await (supabase.from('group_post_comments') as any).delete().eq('post_id', postId)
          await (supabase.from('group_post_likes') as any).delete().eq('post_id', postId)
          await (supabase.from('group_posts') as any).delete().eq('id', postId)
          setPosts(prev => prev.filter(p => p.id !== postId))
          if (expandedPostId === postId) { setExpandedPostId(null); setComments([]) }
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
        } catch { Alert.alert(t('common.error'), t('groups.sendError')) }
      }},
    ])
  }, [supabase, t, expandedPostId])

  // ── Members ──
  const fetchMembers = useCallback(async () => {
    if (!id) return
    setLoadingMembers(true)
    try {
      const { data } = await supabase.from('group_members')
        .select('*, user:profiles!group_members_user_id_fkey(id, name, avatar_url)')
        .eq('group_id', id).order('role', { ascending: true })
      setMembers((data ?? []) as unknown as GroupMember[])
    } catch { setMembers([]) }
    finally { setLoadingMembers(false) }
  }, [supabase, id])

  const handleRemoveMember = useCallback(async (member: GroupMember) => {
    if (!isAdmin || !id || !group) return
    Alert.alert(t('common.confirm'), t('groups.removeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.remove'), style: 'destructive', onPress: async () => {
        try {
          await (supabase.from('group_members') as any).delete().eq('group_id', id).eq('user_id', member.user_id)
          await (supabase.from('groups') as any).update({ member_count: Math.max(0, group.member_count - 1) }).eq('id', id)
          setGroup(prev => prev ? { ...prev, member_count: Math.max(0, prev.member_count - 1) } : prev)
          setMembers(prev => prev.filter(m => m.user_id !== member.user_id))
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
        } catch { Alert.alert(t('common.error'), t('groups.removeError')) }
      }},
    ])
  }, [isAdmin, id, group, supabase, t])

  // ── Edit / Delete group (admin) ──
  const handleSaveGroupEdit = useCallback(async (data: { name: string; description: string; neighborhood: string | null; is_public: boolean }) => {
    if (!id) return
    setSavingEdit(true)
    try {
      await (supabase.from('groups') as any).update({
        name: data.name, description: data.description || null,
        neighborhood: data.neighborhood, naapurusto: data.neighborhood,
        is_public: data.is_public, is_private: !data.is_public,
      }).eq('id', id)
      setGroup(prev => prev ? { ...prev, name: data.name, description: data.description || null, neighborhood: data.neighborhood, is_public: data.is_public } : prev)
      setShowEditModal(false)
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    } catch { Alert.alert(t('common.error'), t('groups.createError')) }
    finally { setSavingEdit(false) }
  }, [id, supabase, t])

  const handleDeleteGroup = useCallback(async () => {
    if (!id) return
    Alert.alert(t('groups.deleteGroup'), t('groups.deleteGroupWarning'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        try {
          await (supabase.from('group_post_comments') as any).delete().in('post_id', posts.map(p => p.id).length > 0 ? posts.map(p => p.id) : ['__none__'])
          await (supabase.from('group_post_likes') as any).delete().in('post_id', posts.map(p => p.id).length > 0 ? posts.map(p => p.id) : ['__none__'])
          await (supabase.from('group_posts') as any).delete().eq('group_id', id)
          await (supabase.from('group_members') as any).delete().eq('group_id', id)
          await (supabase.from('groups') as any).delete().eq('id', id)
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
          router.back()
        } catch { Alert.alert(t('common.error'), t('groups.sendError')) }
      }},
    ])
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
          <Text style={[ps.headerTitle, { color: colors.foreground }]}>{t('groups.title')}</Text>
          <View style={ps.headerBtn} />
        </View>
        <View style={ps.emptyContainer}>
          <Users size={48} color={colors.mutedForeground} strokeWidth={1.2} />
          <Text style={[ps.emptyText, { color: colors.mutedForeground }]}>{t('groups.comingSoon')}</Text>
        </View>
      </View>
    )
  }

  // ── Render post ──
  const renderPost = ({ item }: { item: GroupPost }) => (
    <GroupPostCard
      post={item}
      currentUserId={currentUserId}
      isAdmin={isAdmin}
      isLiked={likedPosts.has(item.id)}
      isExpanded={expandedPostId === item.id}
      catColor={catColor}
      onLike={handleLikePost}
      onDelete={handleDeleteGroupPost}
      onEdit={handleStartEditPost}
      onToggleComments={handleToggleComments}
      editingPostId={editingPostId}
      editPostContent={editPostContent}
      onEditContentChange={setEditPostContent}
      onSaveEdit={handleSaveGroupPostEdit}
      onCancelEdit={handleCancelEditPost}
      savingPostEdit={savingPostEdit}
    >
      {expandedPostId === item.id && (
        <GroupCommentList
          postId={item.id}
          comments={comments}
          currentUserId={currentUserId}
          loading={loadingComments}
          commentText={commentText}
          onCommentTextChange={setCommentText}
          onAddComment={handleSendComment}
          onDeleteComment={handleDeleteComment}
          sendingComment={sendingComment}
        />
      )}
    </GroupPostCard>
  )

  // ── Header component ──
  const ListHeader = useMemo(() => {
    if (!group) return null
    const categoryLabelKey = `groups.${group.category}` as string
    return (
      <View style={[ps.infoCard, { backgroundColor: colors.card, shadowOpacity: isDark ? 0.12 : 0.06 }]}>
        <Text style={[ps.groupName, { color: colors.foreground }]}>{group.name}</Text>
        {group.description && <Text style={[ps.groupDesc, { color: colors.mutedForeground }]}>{group.description}</Text>}
        <View style={ps.badgeRow}>
          <View style={[ps.badge, { backgroundColor: catColor + '20' }]}>
            <Text style={[ps.badgeText, { color: catColor }]}>{t(categoryLabelKey)}</Text>
          </View>
          {group.neighborhood && (
            <View style={[ps.badge, { backgroundColor: colors.muted }]}>
              <Text style={[ps.badgeText, { color: colors.foreground }]}>{group.neighborhood}</Text>
            </View>
          )}
        </View>
        <View style={ps.infoActions}>
          <Pressable style={ps.membersBtn} onPress={() => { setShowMembers(true); fetchMembers() }}>
            <Users size={16} color={colors.primary} strokeWidth={1.8} />
            <Text style={[ps.membersBtnText, { color: colors.primary }]}>{group.member_count} {t('groups.members')}</Text>
          </Pressable>
          <Pressable
            style={[ps.joinLeaveBtn, { backgroundColor: isMember ? 'transparent' : colors.accent, borderColor: isMember ? colors.destructive : colors.accent, borderWidth: isMember ? 1 : 0 }]}
            onPress={handleJoinLeave}
          >
            {isMember ? (
              <><LogOut size={14} color={colors.destructive} strokeWidth={1.8} /><Text style={[ps.joinLeaveBtnText, { color: colors.destructive }]}>{t('groups.leave')}</Text></>
            ) : (
              <><UserPlus size={14} color={colors.accentForeground} strokeWidth={1.8} /><Text style={[ps.joinLeaveBtnText, { color: colors.accentForeground }]}>{t('groups.join')}</Text></>
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
          <Text style={[ps.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{group?.name || t('groups.title')}</Text>
          {group && <Text style={[ps.headerSub, { color: colors.mutedForeground }]}>{group.member_count} {t('groups.members')}</Text>}
        </View>
        {isAdmin ? (
          <Pressable style={ps.headerBtn} hitSlop={8} onPress={() => setShowEditModal(true)}>
            <Pencil size={20} color={colors.mutedForeground} strokeWidth={1.8} />
          </Pressable>
        ) : <View style={ps.headerBtn} />}
      </View>

      {/* Search bar */}
      {isMember && (
        <View style={[ps.searchBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Search size={16} color={colors.mutedForeground} strokeWidth={1.8} />
          <TextInput style={[ps.searchInput, { color: colors.foreground }]} placeholder={t('groups.searchPosts')} placeholderTextColor={colors.mutedForeground} value={searchQuery} onChangeText={setSearchQuery} />
          {searchQuery.length > 0 && <Pressable onPress={() => setSearchQuery('')} hitSlop={8}><X size={16} color={colors.mutedForeground} strokeWidth={1.8} /></Pressable>}
        </View>
      )}

      {searchQuery.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 6, backgroundColor: colors.background }}>
          <Text style={{ fontSize: 12, fontFamily: fonts.bodyMedium, color: colors.mutedForeground }}>
            {posts.filter(p => p.content.toLowerCase().includes(searchQuery.toLowerCase())).length} {t('groups.searchResults')}
          </Text>
        </View>
      )}

      {newPostsBanner && (
        <Pressable onPress={() => { setNewPostsBanner(false); setLoading(true); fetchPosts() }}
          style={{ marginHorizontal: 16, marginTop: 8, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: colors.primary }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.bodySemi, color: '#FFFFFF' }}>{t('groups.newPostsBanner')}</Text>
        </Pressable>
      )}

      {loading ? (
        <View style={ps.loadingContainer}>{[1, 2, 3].map(i => <PostSkeleton key={i} colors={colors} />)}</View>
      ) : (
        <FlatList
          data={searchQuery ? posts.filter(p => p.content.toLowerCase().includes(searchQuery.toLowerCase())) : posts}
          keyExtractor={item => item.id}
          renderItem={renderPost}
          contentContainerStyle={[ps.listContent, { paddingBottom: isMember ? 80 + insets.bottom : 20 + insets.bottom }]}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            <View style={ps.emptySection}>
              <MessageCircle size={32} color={colors.mutedForeground} strokeWidth={1.2} />
              <Text style={[ps.emptySectionText, { color: colors.mutedForeground }]}>{t('groups.noPosts')}</Text>
              <Text style={[ps.emptySectionSub, { color: colors.mutedForeground }]}>{t('groups.startConversation')}</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        />
      )}

      {/* Post input (only for members) */}
      {isMember && (
        <View style={[ps.postInputBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
          {postImage && (
            <View style={ps.imagePreviewRow}>
              <Image source={{ uri: postImage }} style={ps.imagePreview} contentFit="cover" />
              <Pressable onPress={() => setPostImage(null)} style={ps.removeImageBtn}><X size={14} color="#FFF" strokeWidth={2} /></Pressable>
            </View>
          )}
          <View style={ps.postInputRow}>
            <Pressable onPress={handlePickImage} style={ps.imageBtn} hitSlop={8}><ImagePlus size={20} color={colors.mutedForeground} strokeWidth={1.8} /></Pressable>
            <TextInput style={[ps.postInput, { color: colors.foreground, backgroundColor: colors.muted }]} placeholder={t('groups.writePost')} placeholderTextColor={colors.mutedForeground} value={postText} onChangeText={setPostText} multiline maxLength={2000} />
            <Pressable style={[ps.sendBtn, { backgroundColor: (postText.trim() || postImage) ? colors.accent : colors.muted }]} onPress={handleSendPost} disabled={sending || (!postText.trim() && !postImage)}>
              {sending ? <ActivityIndicator size="small" color={colors.accentForeground} /> : <Send size={18} color={(postText.trim() || postImage) ? colors.accentForeground : colors.mutedForeground} strokeWidth={1.8} />}
            </Pressable>
          </View>
        </View>
      )}

      {/* Members Modal */}
      <GroupMembersModal
        visible={showMembers}
        onClose={() => setShowMembers(false)}
        members={members}
        memberCount={group?.member_count ?? 0}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        onRemoveMember={handleRemoveMember}
        loading={loadingMembers}
      />

      {/* Edit Group Modal (admin) */}
      {group && (
        <GroupEditModal
          visible={showEditModal}
          onClose={() => setShowEditModal(false)}
          group={group}
          onSave={handleSaveGroupEdit}
          onDelete={handleDeleteGroup}
          saving={savingEdit}
        />
      )}
    </KeyboardAvoidingView>
  )
}

// ── Styles ──
const ps = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontFamily: fonts.headingSemi },
  headerSub: { fontSize: 11, fontFamily: fonts.body, marginTop: -1 },
  loadingContainer: { padding: 16 },
  listContent: { padding: 16 },
  infoCard: { borderRadius: 14, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2 },
  groupName: { fontSize: 20, fontFamily: fonts.heading, marginBottom: 4 },
  groupDesc: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20, marginBottom: 12 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontFamily: fonts.bodyMedium },
  infoActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  membersBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  membersBtnText: { fontSize: 13, fontFamily: fonts.bodySemi },
  joinLeaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  joinLeaveBtnText: { fontSize: 13, fontFamily: fonts.bodySemi },
  postCard: { borderRadius: 14, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2, flexDirection: 'row' },
  postUserRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  postInputBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingHorizontal: 12 },
  imagePreviewRow: { marginBottom: 8 },
  imagePreview: { width: 80, height: 80, borderRadius: 10 },
  removeImageBtn: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  postInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  imageBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  postInput: { flex: 1, fontSize: 14, fontFamily: fonts.body, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, maxHeight: 100 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 16, fontFamily: fonts.bodyMedium, textAlign: 'center' },
  emptySection: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8, marginTop: 16 },
  emptySectionText: { fontSize: 14, fontFamily: fonts.bodyMedium, textAlign: 'center' },
  emptySectionSub: { fontSize: 12, fontFamily: fonts.body, textAlign: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.body, paddingVertical: 4 },
  skelAvatar: { width: 36, height: 36, borderRadius: 18 },
  skelLine: { height: 10, borderRadius: 5 },
})
