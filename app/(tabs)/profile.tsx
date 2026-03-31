import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, ScrollView, RefreshControl, Pressable, TextInput, StyleSheet, Alert, Modal, FlatList } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import {
  Settings, LogOut, MapPin, Star, Users, Pencil, Camera, X,
  Crown, Heart, FileText, CalendarDays, Package, ChevronRight,
  Zap, Flame, Trophy, RotateCcw, XCircle, Trash2, Building2, TrendingUp,
} from 'lucide-react-native'
import { ProfileSkeleton } from '@/components/SkeletonLoaders'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo } from '@/lib/format'
import { FEATURES } from '@/lib/featureFlags'
import { PostCard } from '@/components/PostCard'
import { TrustBadge, TrustProgress } from '@/components/TrustBadge'
import { useTrustLevel } from '@/hooks/useTrustLevel'
import { useIdentityVerification } from '@/hooks/useIdentityVerification'
import { VerificationModal } from '@/components/VerificationModal'
import { fonts } from '@/lib/fonts'
import { BADGE_ICONS } from '@/lib/badgeIcons'
import { useStreak } from '@/hooks/useStreak'
import { Avatar } from '@/components/Avatar'
import { StarRating } from '@/components/StarRating'
import { ReferralCard } from '@/components/ReferralCard'
import { getCachedUserId, clearAuthCache } from '@/lib/authCache'
import { clearExpiredPro } from '@/lib/proExpiry'
import type { Profile, Post, Review, UserBadge } from '@/lib/types'

interface ActivityItem {
  id: string
  type: 'post' | 'event' | 'review_given' | 'review_received'
  title: string
  date: string
  meta?: string
}

// TODO: UX — CONTENT MANAGEMENT (friction for returning users after 2+ weeks):
//
// 1. "MY POSTS" TAB: Add a third tab ('overview' | 'activity' | 'posts') that
//    shows ALL of the user's posts (not just recent 5) with status indicators
//    (active/expired/archived). Currently only 5 recent posts show in overview.
//    Users with 10+ posts have no way to find/manage older ones.
//
// 2. REVIEWS GIVEN: The activity tab shows "review_given" items but there's no
//    dedicated "Reviews I wrote" view. Add a section or filter to see all reviews
//    the user has given, not just received.
//
// 3. POINT HISTORY: Profile shows total_points in stats bar but NO breakdown
//    of how points were earned. Add a "Point history" screen accessible by
//    tapping the points stat. Query user_points table and show a chronological
//    list with action type, amount, and date.
//
// 4. INVITE HISTORY: ReferralCard exists but shows only the referral code.
//    There's no view of who was invited and whether they joined. Add an
//    invite history list showing invited email/name + status (pending/joined).
export default function ProfileScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'posts' | 'activity'>('overview')
  const [postCount, setPostCount] = useState(0)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [avgRating, setAvgRating] = useState<number | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [badges, setBadges] = useState<UserBadge[]>([])
  const [recentPosts, setRecentPosts] = useState<Post[]>([])
  const [savedCount, setSavedCount] = useState(0)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [editingBio, setEditingBio] = useState(false)
  const [bioText, setBioText] = useState('')
  const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null)
  const [followList, setFollowList] = useState<{ id: string; name: string; avatar_url: string | null }[]>([])
  const [refreshing, setRefreshing] = useState(false)
  // My Posts tab
  const [allPosts, setAllPosts] = useState<Post[]>([])
  const [allPostsLoading, setAllPostsLoading] = useState(false)
  const [allPostsLoaded, setAllPostsLoaded] = useState(false)
  const [postFilter, setPostFilter] = useState<'all' | 'active' | 'expired' | 'closed'>('all')
  // TODO 3: Point history modal
  const [showPointHistory, setShowPointHistory] = useState(false)
  const [pointHistory, setPointHistory] = useState<{ action: string; points: number; created_at: string }[]>([])
  const [pointHistoryLoading, setPointHistoryLoading] = useState(false)
  const trust = useTrustLevel(profile?.id)
  const identity = useIdentityVerification(profile?.id ?? null)
  const streakData = useStreak(profile?.id ?? null)

  const loadProfile = useCallback(async () => {
    try {
    const cachedId = await getCachedUserId()
    if (!cachedId) { setProfileLoading(false); return }
    const user = { id: cachedId }

    // Profile
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (p) {
      // Pro expiry defense-in-depth: if Pro expired, clear it locally and in DB
      await clearExpiredPro(supabase, user.id, p as any)
      setProfile(p as unknown as Profile); setBioText((p as any).bio ?? '')
    }

    // Counts
    const [postsRes, followersRes, followingRes, savedRes] = await Promise.all([
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
      supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('followed_id', user.id),
      supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id),
      supabase.from('saved_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ])
    setPostCount(postsRes.count ?? 0)
    setFollowerCount(followersRes.count ?? 0)
    setFollowingCount(followingRes.count ?? 0)
    setSavedCount(savedRes.count ?? 0)

      // Reviews received — fetch all for correct average, display latest 10
      const { data: revs } = await supabase
        .from('reviews')
        .select('*, reviewer:profiles!reviews_reviewer_id_fkey(id, name, avatar_url)')
        .eq('reviewed_id', user.id)
        .order('created_at', { ascending: false })
      const allRevs = (revs ?? []) as any[]
      setReviews(allRevs.slice(0, 10) as unknown as Review[])
      if (allRevs.length > 0) {
        const avg = allRevs.reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0) / allRevs.length
        setAvgRating(Math.round(avg * 10) / 10)
      }

      // Badges
      const { data: bdg } = await supabase.from('user_badges').select('badge_type').eq('user_id', user.id)
      setBadges((bdg ?? []) as UserBadge[])

      // Recent posts
      const { data: posts } = await supabase
        .from('posts')
        .select('id, type, title, created_at, image_url, like_count, comment_count, location, user_id, description, is_pro_listing, tags, daily_fee, is_active, updated_at')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(5)
      setRecentPosts((posts ?? []) as unknown as Post[])

      // Activity feed
      const activities: ActivityItem[] = []
      // Posts
      ;(posts ?? []).forEach((p: any) => {
        activities.push({ id: `post-${p.id}`, type: 'post', title: p.title, date: p.created_at })
      })
      // Reviews given
      const { data: givenRevs } = await supabase
        .from('reviews')
        .select('id, rating, created_at, reviewed_id')
        .eq('reviewer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)
      ;(givenRevs ?? []).forEach((r: any) => {
        activities.push({ id: `rev-${r.id}`, type: 'review_given', title: t('profile.activityReviewGiven'), date: r.created_at, meta: `${r.rating}/5` })
      })
      // Reviews received
      ;(revs ?? []).slice(0, 5).forEach((r: any) => {
        activities.push({ id: `revr-${r.id}`, type: 'review_received', title: t('profile.activityReviewReceived'), date: r.created_at, meta: `${r.rating}/5` })
      })
      activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setActivity(activities.slice(0, 15))
    } catch {
      // Network error — show whatever we have
    } finally {
      setProfileLoading(false)
    }
  }, [supabase, t])

  useEffect(() => {
    let cancelled = false
    loadProfile().then(() => { if (cancelled) return })
    return () => { cancelled = true }
  }, [loadProfile])

  const ALLOWED_AVATAR_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif']
  const MAX_AVATAR_SIZE = 10 * 1024 * 1024 // 10MB

  const handleAvatarUpload = useCallback(async () => {
    if (!profile) return
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 })
    if (result.canceled || !result.assets[0]) return
    try {
      const uri = result.assets[0].uri
      const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase()
      if (!ALLOWED_AVATAR_EXTS.includes(ext)) { Alert.alert(t('common.error'), t('profile.avatarUploadFailed')); return }
      const path = `avatars/${profile.id}.${ext}`
      const response = await fetch(uri)
      const blob = await response.blob()
      if (blob.size > MAX_AVATAR_SIZE) { Alert.alert(t('common.error'), t('profile.avatarUploadFailed')); return }
      const arrayBuffer = await blob.arrayBuffer()
      await supabase.storage.from('avatars').upload(path, arrayBuffer, { contentType: `image/${ext}`, upsert: true })
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      // Append cache-busting param so the new avatar is fetched (same URL path after upsert)
      const avatarUrlWithCacheBust = `${urlData.publicUrl}?t=${Date.now()}`
      await (supabase.from('profiles') as any).update({ avatar_url: avatarUrlWithCacheBust }).eq('id', profile.id)
      setProfile(prev => prev ? { ...prev, avatar_url: avatarUrlWithCacheBust } : null)
      Alert.alert(t('common.success'), t('profile.avatarUpdated'))
    } catch { Alert.alert(t('common.error'), t('profile.avatarUploadFailed')) }
  }, [profile, supabase, t])

  const handleSaveBio = useCallback(async () => {
    if (!profile) return
    const previousBio = profile.bio ?? ''
    try {
      await (supabase.from('profiles') as any).update({ bio: bioText.trim() }).eq('id', profile.id)
      setProfile(prev => prev ? { ...prev, bio: bioText.trim() } : null)
      setEditingBio(false)
    } catch {
      setBioText(previousBio)
      Alert.alert(t('common.error'), t('profile.bioUpdateFailed'))
    }
  }, [profile, bioText, supabase, t])

  const openFollowList = useCallback(async (type: 'followers' | 'following') => {
    if (!profile) return
    setFollowModal(type)
    const col = type === 'followers' ? 'followed_id' : 'follower_id'
    const joinCol = type === 'followers' ? 'follower_id' : 'followed_id'
    const { data } = await supabase
      .from('user_follows')
      .select(`${joinCol}, user:profiles!user_follows_${joinCol}_fkey(id, name, avatar_url)`)
      .eq(col, profile.id)
      .limit(50)
    setFollowList((data ?? []).map((d: any) => d.user).filter(Boolean))
  }, [profile, supabase])

  // Load all user posts when posts tab selected
  const loadAllPosts = useCallback(async () => {
    if (!profile || allPostsLoaded) return
    setAllPostsLoading(true)
    try {
      const { data } = await supabase
        .from('posts')
        .select('id, type, title, created_at, image_url, like_count, comment_count, location, user_id, description, is_pro_listing, tags, daily_fee, is_active, updated_at, expires_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(100)
      setAllPosts((data ?? []) as unknown as Post[])
      setAllPostsLoaded(true)
    } catch { /* ignore */ }
    finally { setAllPostsLoading(false) }
  }, [profile, supabase, allPostsLoaded])

  useEffect(() => {
    if (activeTab === 'posts' && !allPostsLoaded) loadAllPosts()
  }, [activeTab, allPostsLoaded, loadAllPosts])

  // Post status helpers
  const getPostStatus = useCallback((post: Post): 'active' | 'expired' | 'closed' => {
    if (!post.is_active) return 'closed'
    if (post.expires_at && new Date(post.expires_at) < new Date()) return 'expired'
    return 'active'
  }, [])

  const filteredPosts = useMemo(() => {
    if (postFilter === 'all') return allPosts
    return allPosts.filter(p => getPostStatus(p) === postFilter)
  }, [allPosts, postFilter, getPostStatus])

  // Post actions
  const handleReactivatePost = useCallback(async (postId: string) => {
    try {
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await (supabase.from('posts') as any).update({ is_active: true, expires_at: newExpiry }).eq('id', postId)
      setAllPosts(prev => prev.map(p => p.id === postId ? { ...p, is_active: true, expires_at: newExpiry } : p))
      Alert.alert(t('common.success'), t('profile.postReactivated'))
    } catch {
      Alert.alert(t('common.error'), t('profile.postActionFailed'))
    }
  }, [supabase, t])

  const handleClosePost = useCallback(async (postId: string) => {
    try {
      await (supabase.from('posts') as any).update({ is_active: false }).eq('id', postId)
      setAllPosts(prev => prev.map(p => p.id === postId ? { ...p, is_active: false } : p))
      Alert.alert(t('common.success'), t('profile.postClosedSuccess'))
    } catch {
      Alert.alert(t('common.error'), t('profile.postActionFailed'))
    }
  }, [supabase, t])

  const handleDeletePost = useCallback(async (postId: string) => {
    Alert.alert(
      t('profile.deletePost'),
      t('profile.deletePostConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await (supabase.from('posts') as any).delete().eq('id', postId)
              setAllPosts(prev => prev.filter(p => p.id !== postId))
              Alert.alert(t('common.success'), t('profile.postDeleted'))
            } catch {
              Alert.alert(t('common.error'), t('profile.postActionFailed'))
            }
          },
        },
      ]
    )
  }, [supabase, t])

  // TODO 3: Load point history
  const loadPointHistory = useCallback(async () => {
    if (!profile) return
    setPointHistoryLoading(true)
    try {
      const { data, error } = await supabase
        .from('user_points')
        .select('action, points, created_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (!error && data) setPointHistory(data as any[])
    } catch { /* table may not exist */ }
    finally { setPointHistoryLoading(false) }
  }, [profile, supabase])

  const handleLogout = async () => {
    clearAuthCache()
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  if (profileLoading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: 12 }]}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        </View>
        <ProfileSkeleton />
      </View>
    )
  }

  if (!profile) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: 12 }]}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        </View>
        <Pressable onPress={() => router.push('/(auth)/login')} style={[s.loginBtn, { backgroundColor: colors.primary }]}>
          <Text style={[s.loginBtnText, { color: colors.primaryForeground }]}>{t('auth.login')}</Text>
        </Pressable>
      </View>
    )
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'post': return <FileText size={16} color={colors.primary} />
      case 'event': return <CalendarDays size={16} color={colors.success} />
      case 'review_given': case 'review_received': return <Star size={16} color={colors.pro} />
      default: return <FileText size={16} color={colors.mutedForeground} />
    }
  }

  return (
    <ScreenErrorBoundary screenName="Profile">
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: 12, borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8} accessibilityLabel={t('settings.title')} accessibilityRole="button">
          <Settings size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              loadProfile().finally(() => setRefreshing(false))
            }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Hero */}
        <View style={s.hero}>
          <Pressable onPress={handleAvatarUpload} accessibilityLabel={`${profile.name} — ${t('profile.avatarUpdated')}`} accessibilityRole="button">
            <View>
              <Avatar url={profile.avatar_url} name={profile.name} size={80} borderColor={profile.is_pro ? colors.pro : undefined} borderWidth={profile.is_pro ? 3 : undefined} />
              <View style={[s.cameraBtn, { backgroundColor: colors.primary }]} accessibilityElementsHidden>
                <Camera size={12} color={colors.primaryForeground} />
              </View>
            </View>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[s.profileName, { color: colors.foreground }]} numberOfLines={1}>{profile.name}</Text>
            {!trust.loading && <TrustBadge level={trust.level} size="medium" showLabel />}
          </View>
          {profile.naapurusto && (
            <View style={s.nhRow}>
              <MapPin size={14} color={colors.primary} />
              <Text style={[s.nhText, { color: colors.primary }]}>{profile.naapurusto}</Text>
            </View>
          )}

          {/* Bio - editable */}
          {editingBio ? (
            <View style={s.bioEditWrap}>
              <TextInput
                style={[s.bioInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={bioText}
                onChangeText={setBioText}
                multiline
                maxLength={200}
                placeholder={t('profile.bioPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
              />
              <Text style={{ fontSize: 11, color: bioText.length >= 180 ? colors.destructive : colors.mutedForeground, textAlign: 'right', marginTop: 2, fontFamily: fonts.body }}>
                {bioText.length}/200
              </Text>
              <View style={s.bioActions}>
                <Pressable onPress={() => setEditingBio(false)}><X size={20} color={colors.mutedForeground} /></Pressable>
                <Pressable onPress={handleSaveBio} style={[s.bioSaveBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primaryForeground, fontFamily: fonts.bodySemi }}>{t('common.save')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setEditingBio(true)} style={[s.bioTapArea, !profile.bio && { backgroundColor: `${colors.primary}10`, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 }]} accessibilityLabel={profile.bio ? t('profile.editBio') : t('profile.clickToAddBio')} accessibilityRole="button">
              <Text style={[s.bio, { color: profile.bio ? colors.mutedForeground : colors.primary }]}>
                {profile.bio || t('profile.clickToAddBio')}
              </Text>
              <Pencil size={12} color={profile.bio ? colors.mutedForeground : colors.primary} style={{ alignSelf: 'center', marginTop: 2 }} />
            </Pressable>
          )}

          {/* Badges */}
          {badges.length > 0 && (
            <View style={s.badgesSection}>
              <Text style={[s.badgesSectionTitle, { color: colors.foreground }]}>{t('profile.badges')}</Text>
              <View style={s.badgesRow}>
                {badges.map((b) => {
                  const cfg = BADGE_ICONS[b.badge_type]
                  if (!cfg) return null
                  const Icon = cfg.icon
                  return (
                    <View key={b.badge_type} style={[s.badgeChip, { backgroundColor: `${cfg.color}20` }]}>
                      <Icon size={12} color={cfg.color} />
                      <Text style={[s.badgeText, { color: cfg.color }]}>{t(`badges.${b.badge_type}`)}</Text>
                    </View>
                  )
                })}
              </View>
            </View>
          )}

          {profile.is_pro && (
            <View style={[s.proBadge, { backgroundColor: `${colors.pro}20` }]}>
              <Crown size={14} color={colors.pro} fill={colors.pro} />
              <Text style={[s.proText, { color: colors.pro }]}>Pro</Text>
            </View>
          )}
          {profile.is_business && (
            <View style={[s.proBadge, { backgroundColor: `${colors.primary}15` }]}>
              <Building2 size={12} color={colors.primary} />
              <Text style={[s.proText, { color: colors.primary }]}>{profile.business_name ?? t('business.verified')}</Text>
            </View>
          )}
        </View>

        {/* Stats — simplified to 4 primary stats */}
        <View style={[s.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable style={s.stat} onPress={() => followerCount > 0 ? openFollowList('followers') : null} accessibilityLabel={`${followerCount} ${t('profile.followers')}`} accessibilityRole="button">
            <Text style={[s.statNum, { color: followerCount === 0 ? colors.primary : colors.foreground }]}>
              {followerCount === 0 ? '\u2013' : followerCount}
            </Text>
            <Text numberOfLines={1} style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.followers')}</Text>
          </Pressable>
          <View style={[s.statDiv, { backgroundColor: colors.border }]} />
          <Pressable style={s.stat} onPress={() => postCount === 0 ? router.push('/(tabs)/create') : setActiveTab('posts')} accessibilityLabel={`${postCount} ${t('profile.posts')}`} accessibilityRole="button">
            <Text style={[s.statNum, { color: postCount === 0 ? colors.primary : colors.foreground }]}>
              {postCount === 0 ? '\u2013' : postCount}
            </Text>
            <Text numberOfLines={1} style={[s.statLabel, { color: postCount === 0 ? colors.primary : colors.mutedForeground }]}>
              {postCount === 0 ? t('profile.createFirst') : t('profile.posts')}
            </Text>
          </Pressable>
          <View style={[s.statDiv, { backgroundColor: colors.border }]} />
          <View style={s.stat} accessibilityLabel={`${avgRating ?? 0} ${t('profile.avgRating')}`} accessibilityRole="text">
            {avgRating != null ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[s.statNum, { color: colors.foreground }]}>{avgRating}</Text>
                <Star size={12} color={colors.pro} fill={colors.pro} />
              </View>
            ) : (
              <Text style={[s.statNum, { color: colors.mutedForeground }]}>{'\u2013'}</Text>
            )}
            <Text numberOfLines={1} style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.avgRating')}</Text>
          </View>
          <View style={[s.statDiv, { backgroundColor: colors.border }]} />
          <Pressable style={s.stat} onPress={() => { setShowPointHistory(true); loadPointHistory() }} accessibilityLabel={`${profile?.total_points ?? 0} ${t('profile.points')}`} accessibilityRole="button">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[s.statNum, { color: colors.foreground }]}>{profile?.total_points ?? 0}</Text>
              <Zap size={12} color={colors.pro} fill={colors.pro} />
            </View>
            <Text numberOfLines={1} style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.points')}</Text>
          </Pressable>
        </View>

        {/* Following count — shown as text link, not a stat box */}
        {followingCount > 0 && (
          <Pressable onPress={() => openFollowList('following')} style={{ alignSelf: 'center', paddingVertical: 4 }}>
            <Text style={[{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body }]}>
              {followingCount} {t('profile.following').toLowerCase()}
            </Text>
          </Pressable>
        )}

        {/* Pro upgrade card */}
        {FEATURES.PRO_SUBSCRIPTION && !profile.is_pro && (
          <Pressable onPress={() => router.push('/pro')} style={[s.proUpgradeCard, { backgroundColor: `${colors.pro}12`, borderColor: `${colors.pro}30` }]} accessibilityLabel={t('pro.upgradeToPro')} accessibilityRole="button">
            <Crown size={20} color={colors.pro} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.proUpgradeTitle, { color: colors.pro }]}>{t('pro.upgradeToPro')}</Text>
              <Text style={[s.proUpgradeSubtitle, { color: colors.mutedForeground }]}>{t('pro.profileBanner')}</Text>
            </View>
            <ChevronRight size={16} color={colors.pro} />
          </Pressable>
        )}

        {/* Quick action cards */}
        {FEATURES.PAYMENTS && (
        <Pressable onPress={() => router.push('/bookings')} style={[s.overviewCard, { backgroundColor: colors.card }]} accessibilityLabel={t('bookings.title')} accessibilityRole="button">
          <Package size={18} color={colors.pro} />
          <Text style={[s.overviewText, { color: colors.foreground }]}>{t('bookings.title')}</Text>
        </Pressable>
        )}

        <Pressable onPress={() => router.push('/saved')} style={[s.overviewCard, { backgroundColor: colors.card }]} accessibilityLabel={t('saved.title')} accessibilityRole="button">
          <Heart size={18} color={colors.primary} />
          <Text style={[s.overviewText, { color: colors.foreground }]}>{t('saved.title')}</Text>
        </Pressable>

        {/* Leaderboard button */}
        <Pressable onPress={() => router.push('/leaderboard')} style={[s.overviewCard, { backgroundColor: colors.card }]} accessibilityLabel={t('leaderboard.title')} accessibilityRole="button">
          <Trophy size={18} color={colors.pro} />
          <Text style={[s.overviewText, { color: colors.foreground }]}>{t('leaderboard.title')}</Text>
        </Pressable>

        {/* Boosts — gated behind FEATURES.BOOSTS */}
        {FEATURES.BOOSTS && (
          <Pressable onPress={() => router.push('/boosts')} style={[s.overviewCard, { backgroundColor: colors.card }]} accessibilityLabel={t('boost.title')} accessibilityRole="button">
            <TrendingUp size={18} color={colors.accent} />
            <Text style={[s.overviewText, { color: colors.foreground }]}>{t('boost.title')}</Text>
            <View style={{ marginLeft: 'auto' }}>
              <ChevronRight size={16} color={colors.mutedForeground} />
            </View>
          </Pressable>
        )}

        {/* Trust Level Progress */}
        {!trust.loading && (
          <TrustProgress level={trust.level} nextTierHints={trust.nextTierHints} score={trust.score} factors={trust.factors} onVerifyPress={identity.startVerification} />
        )}

        {/* Referral Program */}
        {profile && (
          <View style={{ paddingHorizontal: 16 }}>
            <ReferralCard userId={profile.id} />
          </View>
        )}

        {/* Tabs */}
        <View style={[s.tabRow, { borderBottomColor: colors.border }]} accessibilityRole="tablist">
          <Pressable onPress={() => setActiveTab('overview')} style={[s.tab, activeTab === 'overview' && [s.tabActive, { borderBottomColor: colors.primary }]]} accessibilityLabel={t('profile.overview')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'overview' }}>
            <Text style={[s.tabText, { color: activeTab === 'overview' ? colors.primary : colors.mutedForeground }]}>{t('profile.overview')}</Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab('posts')} style={[s.tab, activeTab === 'posts' && [s.tabActive, { borderBottomColor: colors.primary }]]} accessibilityLabel={t('profile.myPosts')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'posts' }}>
            <Text style={[s.tabText, { color: activeTab === 'posts' ? colors.primary : colors.mutedForeground }]}>{t('profile.myPosts')}</Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab('activity')} style={[s.tab, activeTab === 'activity' && [s.tabActive, { borderBottomColor: colors.primary }]]} accessibilityLabel={t('profile.activity')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'activity' }}>
            <Text style={[s.tabText, { color: activeTab === 'activity' ? colors.primary : colors.mutedForeground }]}>{t('profile.activity')}</Text>
          </Pressable>
        </View>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <View style={s.tabContent}>
            {/* Impact Dashboard */}
            <View style={[impactStyles.card, { backgroundColor: colors.card }]}>
              <Text style={[impactStyles.title, { color: colors.foreground }]}>{t('profile.yourImpact')}</Text>
              <View style={impactStyles.statsRow}>
                <View style={impactStyles.statItem}>
                  <Text style={[impactStyles.statNumber, { color: colors.primary }]}>{postCount}</Text>
                  <Text style={[impactStyles.statLabel, { color: colors.mutedForeground }]}>{t('profile.shared')}</Text>
                </View>
                <View style={impactStyles.statItem}>
                  <Text style={[impactStyles.statNumber, { color: colors.primary }]}>{savedCount}</Text>
                  <Text style={[impactStyles.statLabel, { color: colors.mutedForeground }]}>{t('profile.impactSaved')}</Text>
                </View>
              </View>
              {(profile?.current_streak ?? 0) > 0 && (
                <View style={[impactStyles.streakRow, { borderTopColor: colors.border }]}>
                  <Flame size={16} color={colors.destructive} />
                  <Text style={[impactStyles.streakText, { color: colors.foreground }]}>
                    {t('profile.streakDays', { count: profile?.current_streak ?? 0 })}
                  </Text>
                  <Text style={[impactStyles.pointsText, { color: colors.mutedForeground }]}>
                    · {profile?.total_points ?? 0} {t('profile.points')}
                  </Text>
                </View>
              )}
            </View>

            {/* Badge Showcase */}
            {badges.length > 0 && (
              <View style={[impactStyles.card, { backgroundColor: colors.card }]}>
                <Text style={[impactStyles.title, { color: colors.foreground }]}>{t('profile.badges')}</Text>
                <View style={badgeStyles.grid}>
                  {badges.map(badge => {
                    const info = BADGE_ICONS[badge.badge_type]
                    if (!info) return null
                    const Icon = info.icon
                    return (
                      <View key={badge.badge_type} style={badgeStyles.item}>
                        <View style={[badgeStyles.circle, { backgroundColor: `${info.color}18` }]}>
                          <Icon size={20} color={info.color} />
                        </View>
                        <Text style={[badgeStyles.label, { color: colors.foreground }]} numberOfLines={1}>
                          {t(`badges.${badge.badge_type}`)}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              </View>
            )}

            {/* Reviews */}
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('profile.reviewsCount', { count: reviews.length })}</Text>
            {reviews.length === 0 ? (
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.noReviews')}</Text>
            ) : (
              reviews.map((rev) => (
                <View key={rev.id} style={[s.reviewCard, { backgroundColor: colors.card }]}>
                  <View style={s.reviewHeader}>
                    <Avatar url={rev.reviewer?.avatar_url} name={rev.reviewer?.name} size={32} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[s.reviewName, { color: colors.foreground }]} numberOfLines={1}>{rev.reviewer?.name ?? t('common.user')}</Text>
                      <StarRating rating={rev.rating} size={12} />
                    </View>
                    <Text style={[s.reviewTime, { color: colors.mutedForeground }]}>{formatTimeAgo(rev.created_at, t, locale)}</Text>
                  </View>
                  {rev.comment && <Text style={[s.reviewComment, { color: colors.foreground }]}>{rev.comment}</Text>}
                </View>
              ))
            )}

            {/* Recent posts */}
            {recentPosts.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('profile.ownPosts', { count: postCount })}</Text>
                {recentPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </>
            )}
          </View>
        )}

        {/* Posts Tab */}
        {activeTab === 'posts' && (
          <View style={s.tabContent}>
            {/* 2c: Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {([
                { key: 'all' as const, label: t('profile.filterAll') },
                { key: 'active' as const, label: t('profile.filterActive') },
                { key: 'expired' as const, label: t('profile.filterExpired') },
                { key: 'closed' as const, label: t('profile.filterClosed') },
              ]).map(f => (
                <Pressable
                  key={f.key}
                  onPress={() => setPostFilter(f.key)}
                  style={[s.postFilterChip, postFilter === f.key ? { backgroundColor: colors.primary } : { backgroundColor: isDark ? colors.card : colors.muted }]}
                >
                  <Text style={[s.postFilterText, { color: postFilter === f.key ? colors.primaryForeground : colors.mutedForeground }]}>{f.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {allPostsLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('common.loading')}</Text>
              </View>
            ) : filteredPosts.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24, gap: 12 }}>
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.myPostsEmpty')}</Text>
                <Pressable onPress={() => router.push('/(tabs)/create')} style={[s.loginBtn, { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 4 }]}>
                  <Text style={[s.loginBtnText, { color: colors.primaryForeground }]}>{t('nav.create')}</Text>
                </Pressable>
              </View>
            ) : (
              filteredPosts.map((post) => {
                const status = getPostStatus(post)
                const statusColor = status === 'active' ? (colors.success ?? colors.primary)
                  : status === 'expired' ? colors.pro
                  : colors.mutedForeground
                const statusLabel = status === 'active' ? t('profile.active')
                  : status === 'expired' ? t('profile.expired')
                  : t('profile.postClosed')

                return (
                  <View key={post.id} style={[s.myPostItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Pressable
                      onPress={() => router.push(`/post/${post.id}`)}
                      style={{ flex: 1, gap: 4 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[s.myPostTitle, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>{post.title}</Text>
                        {/* 2a: Status badge */}
                        <View style={[s.myPostStatusBadge, { backgroundColor: `${statusColor}14` }]}>
                          <Text style={[s.myPostStatusText, { color: statusColor }]}>
                            {statusLabel}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[s.myPostTypeBadge, { backgroundColor: `${colors.primary}14` }]}>
                          <Text style={[s.myPostTypeText, { color: colors.primary }]}>{post.type}</Text>
                        </View>
                        <Text style={[s.myPostDate, { color: colors.mutedForeground }]}>
                          {post.created_at ? formatTimeAgo(post.created_at, t, locale) : ''}
                        </Text>
                        {(post.like_count ?? 0) > 0 && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                            <Heart size={10} color={colors.mutedForeground} />
                            <Text style={[s.myPostDate, { color: colors.mutedForeground }]}>{post.like_count}</Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                    {/* 2b: Action buttons */}
                    <View style={s.myPostActions}>
                      {status === 'expired' && (
                        <Pressable onPress={() => handleReactivatePost(post.id)} style={[s.myPostActionBtn, { backgroundColor: `${colors.primary}14` }]} hitSlop={4}>
                          <RotateCcw size={13} color={colors.primary} />
                          <Text style={[s.myPostActionText, { color: colors.primary }]}>{t('profile.reactivate')}</Text>
                        </Pressable>
                      )}
                      {status === 'active' && (
                        <Pressable onPress={() => handleClosePost(post.id)} style={[s.myPostActionBtn, { backgroundColor: `${colors.mutedForeground}14` }]} hitSlop={4}>
                          <XCircle size={13} color={colors.mutedForeground} />
                          <Text style={[s.myPostActionText, { color: colors.mutedForeground }]}>{t('profile.closePost')}</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => handleDeletePost(post.id)} style={[s.myPostActionBtn, { backgroundColor: `${colors.destructive}14` }]} hitSlop={4}>
                        <Trash2 size={13} color={colors.destructive} />
                      </Pressable>
                    </View>
                  </View>
                )
              })
            )}
          </View>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <View style={s.tabContent}>
            {activity.length === 0 ? (
              <View style={s.emptyActivity}>
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.noActivity')}</Text>
                <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>{t('profile.noActivityHint')}</Text>
              </View>
            ) : (
              activity.map((item) => (
                <View key={item.id} style={[s.activityItem, { borderLeftColor: colors.primary }]}>
                  <View style={[s.activityDot, { backgroundColor: colors.card, borderColor: colors.primary }]}>
                    {getActivityIcon(item.type)}
                  </View>
                  <View style={s.activityContent}>
                    <Text style={[s.activityTitle, { color: colors.foreground }]}>{item.title}</Text>
                    <View style={s.activityMeta}>
                      <Text style={[s.activityTime, { color: colors.mutedForeground }]}>{formatTimeAgo(item.date, t, locale)}</Text>
                      {item.meta && <Text style={[s.activityMetaBadge, { color: colors.pro }]}>{item.meta}</Text>}
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Actions */}
        <View style={{ gap: 8, marginTop: 8 }}>
          <Pressable onPress={handleLogout} style={[s.menuItem, { backgroundColor: colors.card }]}>
            <LogOut size={20} color={colors.destructive} />
            <Text style={[s.menuText, { color: colors.destructive }]}>{t('profile.logout')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Followers/Following Modal */}
      <Modal visible={followModal !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFollowModal(null)}>
        <View style={[s.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>
              {followModal === 'followers' ? t('profile.followersList', { count: followerCount }) : t('profile.followingList', { count: followingCount })}
            </Text>
            <Pressable onPress={() => setFollowModal(null)} hitSlop={12}>
              <X size={24} color={colors.foreground} />
            </Pressable>
          </View>
          <FlatList
            data={followList}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <Pressable style={s.followItem} onPress={() => { setFollowModal(null); router.push(`/profile/${item.id}` as any) }}>
                <Avatar url={item.avatar_url} name={item.name} size={40} />
                <Text style={[s.followName, { color: colors.foreground }]}>{item.name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={[s.emptyText, { color: colors.mutedForeground, textAlign: 'center', marginTop: 40 }]}>
                {followModal === 'followers' ? t('profile.noFollowers') : t('profile.noFollowing')}
              </Text>
            }
          />
        </View>
      </Modal>

      {/* Point History Modal */}
      <Modal visible={showPointHistory} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPointHistory(false)}>
        <View style={[s.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>{t('profile.pointHistory')}</Text>
            <Pressable onPress={() => setShowPointHistory(false)} hitSlop={12}>
              <X size={24} color={colors.foreground} />
            </Pressable>
          </View>
          {pointHistoryLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('common.loading')}</Text>
            </View>
          ) : pointHistory.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.noPointHistory')}</Text>
            </View>
          ) : (
            <FlatList
              data={pointHistory}
              keyExtractor={(item, idx) => `${item.created_at}-${idx}`}
              contentContainerStyle={{ padding: 16, gap: 8 }}
              renderItem={({ item }) => (
                <View style={[s.pointHistoryRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[s.pointHistoryPoints, { color: colors.primary }]}>+{item.points}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.pointHistoryAction, { color: colors.foreground }]}>
                      {t(`points.${item.action}`, undefined as any) !== `points.${item.action}` ? t(`points.${item.action}`) : item.action}
                    </Text>
                    <Text style={[s.pointHistoryTime, { color: colors.mutedForeground }]}>
                      {formatTimeAgo(item.created_at, t, locale)}
                    </Text>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </Modal>

      {/* Suomi.fi Verification Modal */}
      {FEATURES.IDENTITY_VERIFICATION && (
        <VerificationModal
          visible={identity.showModal}
          onClose={() => identity.setShowModal(false)}
          onConfirm={identity.confirmVerification}
          loading={identity.loading}
          error={identity.error}
          isSuccess={identity.status === 'success'}
        />
      )}
    </View>
    </ScreenErrorBoundary>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi, lineHeight: 28 },
  content: { padding: 16, gap: 16, paddingBottom: 96 },
  hero: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  bigAvatar: { width: 80, height: 80, borderRadius: 40 },
  bigAvatarFb: { alignItems: 'center', justifyContent: 'center' },
  bigAvatarInit: { fontSize: 32, fontWeight: '700', fontFamily: fonts.heading },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  profileName: { fontSize: 20, fontWeight: '700', fontFamily: fonts.heading, lineHeight: 28, letterSpacing: -0.2 },
  nhRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nhText: { fontSize: 14, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 20 },
  bio: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: fonts.body },
  bioTapArea: { alignItems: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  bioEditWrap: { width: '100%', gap: 8, paddingHorizontal: 8 },
  bioInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16, fontSize: 14, minHeight: 64, textAlignVertical: 'top', fontFamily: fonts.body },
  bioActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
  bioSaveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  badgesSection: { alignItems: 'center', gap: 8, width: '100%' },
  badgesSectionTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 20 },
  badgesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 14 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  proText: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi },
  statsRow: { flexDirection: 'row', borderRadius: 12, padding: 16, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  stat: { flex: 1, alignItems: 'center', gap: 4, minHeight: 48 },
  statNum: { fontSize: 20, fontWeight: '700', fontFamily: fonts.heading, lineHeight: 26 },
  statLabel: { fontSize: 10, fontFamily: fonts.body, lineHeight: 13, textTransform: 'uppercase', letterSpacing: 0.3 },
  statDiv: { width: 1 },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', minHeight: 44 },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodyMedium },
  tabContent: { gap: 12, paddingTop: 4 },
  overviewCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12 },
  proUpgradeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 12, borderWidth: 1,
  },
  proUpgradeTitle: { fontSize: 14, fontWeight: '700', fontFamily: fonts.headingSemi },
  proUpgradeSubtitle: { fontSize: 12, fontFamily: fonts.body },
  overviewText: { fontSize: 14, fontWeight: '500', fontFamily: fonts.bodyMedium },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 8, fontFamily: fonts.headingSemi },
  reviewCard: { borderRadius: 12, padding: 16, gap: 8 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewAvatar: { width: 32, height: 32, borderRadius: 16 },
  reviewName: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodyMedium },
  reviewTime: { fontSize: 11, fontFamily: fonts.body },
  reviewComment: { fontSize: 14, lineHeight: 19, fontFamily: fonts.body },
  emptyText: { fontSize: 14, fontFamily: fonts.body },
  emptyHint: { fontSize: 13, marginTop: 4, fontFamily: fonts.body },
  emptyActivity: { alignItems: 'center', paddingTop: 24, gap: 4 },
  activityItem: { flexDirection: 'row', gap: 12, paddingLeft: 16, borderLeftWidth: 2, paddingVertical: 8 },
  activityDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: -24 },
  activityContent: { flex: 1, gap: 2 },
  activityTitle: { fontSize: 14, fontWeight: '500', fontFamily: fonts.bodyMedium },
  activityMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  activityTime: { fontSize: 12, fontFamily: fonts.body },
  activityMetaBadge: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12 },
  menuText: { fontSize: 15, fontWeight: '500', fontFamily: fonts.bodyMedium },
  loginBtn: { marginHorizontal: 16, marginTop: 64, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  loginBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 18, fontWeight: '700', fontFamily: fonts.headingSemi },
  followItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  followAvatar: { width: 40, height: 40, borderRadius: 20 },
  followName: { fontSize: 15, fontWeight: '500', fontFamily: fonts.bodyMedium },
  multiplierBadge: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 8 },
  multiplierText: { fontSize: 9, fontWeight: '800', fontFamily: fonts.bodySemi },
  // My Posts tab
  myPostItem: { gap: 8, padding: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  myPostTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 20 },
  myPostTypeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  myPostTypeText: { fontSize: 10, fontWeight: '600', fontFamily: fonts.bodySemi, textTransform: 'uppercase', lineHeight: 13 },
  myPostDate: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14 },
  myPostStatusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  myPostStatusText: { fontSize: 10, fontWeight: '600', fontFamily: fonts.bodySemi, textTransform: 'uppercase', lineHeight: 13 },
  myPostActions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  myPostActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, minHeight: 32 },
  myPostActionText: { fontSize: 11, fontWeight: '600', fontFamily: fonts.bodySemi },
  postFilterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  postFilterText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium },
  // Point history modal
  pointHistoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  pointHistoryPoints: { fontSize: 16, fontWeight: '700', fontFamily: fonts.heading, minWidth: 32 },
  pointHistoryAction: { fontSize: 14, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 20 },
  pointHistoryTime: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14 },
})

const impactStyles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, gap: 12 },
  title: { fontSize: 16, fontWeight: '600', fontFamily: fonts.headingSemi, letterSpacing: -0.16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 4 },
  statNumber: { fontSize: 24, fontWeight: '700', fontFamily: fonts.heading },
  statLabel: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  streakText: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi },
  pointsText: { fontSize: 13, fontFamily: fonts.body },
})

const badgeStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  item: { alignItems: 'center', gap: 8, width: 72 },
  circle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontFamily: fonts.body, textAlign: 'center' },
})
