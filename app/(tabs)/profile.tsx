declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, ScrollView, RefreshControl, TextInput, StyleSheet, Alert, Modal, FlatList } from 'react-native'
import { withHapticRefresh } from '@/lib/haptics'
import { PressableOpacity, KeyboardDoneAccessory, KEYBOARD_DONE_ID } from '@/components/ui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import {
  Settings, LogOut, LogIn, Star, Pencil, Camera, X,
  Crown, Heart, FileText, CalendarDays, ChevronRight,
  Zap, RotateCcw, XCircle, Trash2, Building2, RefreshCw,
} from 'lucide-react-native'
import { ProfileSkeleton } from '@/components/SkeletonLoaders'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo } from '@/lib/format'
import { FEATURES } from '@/lib/featureFlags'
import { PostCard } from '@/components/PostCard'
import { TrustBadge } from '@/components/TrustBadge'
import { useTrustLevel } from '@/hooks/useTrustLevel'
import { useIdentityVerification } from '@/hooks/useIdentityVerification'
import { VerificationModal } from '@/components/VerificationModal'
import { fonts } from '@/lib/fonts'
import { BADGE_ICONS } from '@/lib/badgeIcons'
import { Avatar } from '@/components/Avatar'
import { StarRating } from '@/components/StarRating'
import { getCachedUserId, clearAuthCache } from '@/lib/authCache'
import { clearExpiredPro } from '@/lib/proExpiry'
import { useToast } from '@/components/Toast'
import type { Profile, Post, Review, UserBadge } from '@/lib/types'

interface ActivityItem {
  id: string
  type: 'post' | 'event' | 'review_given' | 'review_received'
  title: string
  date: string
  meta?: string
}

const MAX_AVATAR_SIZE = 10 * 1024 * 1024 // 10MB

export default function ProfileScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const toast = useToast()
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
  const [visiblePostCount, setVisiblePostCount] = useState(20)
  const [fetchError, setFetchError] = useState(false)
  const trust = useTrustLevel(profile?.id)
  const identity = useIdentityVerification(profile?.id ?? null)

  const loadProfile = useCallback(async () => {
    setFetchError(false)
    try {
    const cachedId = await getCachedUserId()
    if (!cachedId) { setProfileLoading(false); return }
    const user = { id: cachedId }

    // Profile
    const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (p) {
      // Pro expiry defense-in-depth: if Pro expired, clear it locally and in DB
      await clearExpiredPro(supabase, user.id, p as any)
      setProfile(p as unknown as Profile); setBioText((p as any).bio ?? '')
    }

    // Counts. Rejected promises fall back to { count: 0 } which would
    // silently show "0 everywhere" on RLS/network failures — surface the
    // reason in dev logs so regressions are noticed instead of masked.
    const [postsSettled, followersSettled, followingSettled, savedSettled] = await Promise.allSettled([
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
      supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('followed_id', user.id),
      supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id),
      supabase.from('saved_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ])
    if (__DEV__) {
      const labels = ['posts', 'followers', 'following', 'saved'] as const
      for (const [i, settled] of [postsSettled, followersSettled, followingSettled, savedSettled].entries()) {
        if (settled.status === 'rejected') {
          console.warn(`[profile] count fetch rejected (${labels[i]}):`, settled.reason)
        } else if ((settled.value as any)?.error) {
          console.warn(`[profile] count fetch error (${labels[i]}):`, (settled.value as any).error.message)
        }
      }
    }
    const postsRes = postsSettled.status === 'fulfilled' ? postsSettled.value : { count: 0 }
    const followersRes = followersSettled.status === 'fulfilled' ? followersSettled.value : { count: 0 }
    const followingRes = followingSettled.status === 'fulfilled' ? followingSettled.value : { count: 0 }
    const savedRes = savedSettled.status === 'fulfilled' ? savedSettled.value : { count: 0 }
    setPostCount(postsRes.count ?? 0)
    setFollowerCount(followersRes.count ?? 0)
    setFollowingCount(followingRes.count ?? 0)
    setSavedCount(savedRes.count ?? 0)

      // Reviews received — fetch up to 100 for average, display latest 10
      const { data: revs } = await supabase
        .from('reviews')
        .select('*, reviewer:profiles!reviews_reviewer_id_fkey(id, name, avatar_url)')
        .eq('reviewed_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
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
      setFetchError(true)
    } finally {
      setProfileLoading(false)
    }
  }, [supabase, t])

  // Stable onRefresh — withHapticRefresh returns a new function on every
  // call, which would cause RefreshControl to rebind on every render.
  const onRefreshHandler = useMemo(
    () => withHapticRefresh(() => {
      setRefreshing(true)
      loadProfile().finally(() => setRefreshing(false))
    }),
    [loadProfile],
  )

  useFocusEffect(useCallback(() => {
    let cancelled = false
    loadProfile().then(() => { if (cancelled) return })
    return () => { cancelled = true }
  }, [loadProfile]))

  const handleAvatarUpload = useCallback(async () => {
    if (!profile) return
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 })
    if (result.canceled || !result.assets[0]) return
    try {
      const uri = result.assets[0].uri
      const response = await fetch(uri)
      const blob = await response.blob()
      const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      const mimeType = blob.type && ALLOWED_MIMES.includes(blob.type) ? blob.type : null
      if (!mimeType) { toast.show({ message: t('profile.avatarUploadFailed'), type: 'error' }); return }
      if (blob.size > MAX_AVATAR_SIZE) { toast.show({ message: t('profile.avatarUploadFailed'), type: 'error' }); return }
      const mimeSubtype = mimeType.split('/')[1]
      const ext = mimeSubtype === 'jpeg' ? 'jpg' : mimeSubtype
      const path = `avatars/${profile.id}.${ext}`
      const arrayBuffer = await blob.arrayBuffer()
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, arrayBuffer, { contentType: mimeType, upsert: true })
      if (uploadError) { toast.show({ message: t('profile.avatarUploadFailed'), type: 'error' }); return }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      if (!urlData?.publicUrl) { toast.show({ message: t('profile.avatarUploadFailed'), type: 'error' }); return }
      // Append cache-busting param so the new avatar is fetched (same URL path after upsert)
      const avatarUrlWithCacheBust = `${urlData.publicUrl}?t=${Date.now()}`
      const { error: updateError } = await (supabase.from('profiles') as any).update({ avatar_url: avatarUrlWithCacheBust }).eq('id', profile.id)
      if (updateError) { toast.show({ message: t('profile.avatarUploadFailed'), type: 'error' }); return }
      setProfile(prev => prev ? { ...prev, avatar_url: avatarUrlWithCacheBust } : null)
      toast.show({ message: t('profile.avatarUpdated'), type: 'success' })
    } catch { toast.show({ message: t('profile.avatarUploadFailed'), type: 'error' }) }
  }, [profile, supabase, t, toast])

  const handleSaveBio = useCallback(async () => {
    if (!profile) return
    const previousBio = profile.bio ?? ''
    const { error } = await (supabase.from('profiles') as any).update({ bio: bioText.trim() }).eq('id', profile.id)
    if (error) {
      setBioText(previousBio)
      toast.show({ message: t('profile.bioUpdateFailed'), type: 'error' })
      return
    }
    setProfile(prev => prev ? { ...prev, bio: bioText.trim() } : null)
    setEditingBio(false)
  }, [profile, bioText, supabase, t, toast])

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

  // Post status helpers — pure function, no closure deps
  const getPostStatus = (post: Post): 'active' | 'expired' | 'closed' => {
    if (!post.is_active) return 'closed'
    if (post.expires_at && new Date(post.expires_at) < new Date()) return 'expired'
    return 'active'
  }

  const filteredPosts = useMemo(() => {
    const base = postFilter === 'all' ? allPosts : allPosts.filter(p => getPostStatus(p) === postFilter)
    return base
  }, [allPosts, postFilter])

  // Paginated slice — avoids rendering 100+ items at once in ScrollView
  const visiblePosts = useMemo(() => filteredPosts.slice(0, visiblePostCount), [filteredPosts, visiblePostCount])
  const hasMorePosts = filteredPosts.length > visiblePostCount

  // Reset visible count when filter changes
  useEffect(() => { setVisiblePostCount(20) }, [postFilter])

  // Post actions
  const handleReactivatePost = useCallback(async (postId: string) => {
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await (supabase.from('posts') as any).update({ is_active: true, expires_at: newExpiry }).eq('id', postId)
    if (error) { toast.show({ message: t('profile.postActionFailed'), type: 'error' }); return }
    setAllPosts(prev => prev.map(p => p.id === postId ? { ...p, is_active: true, expires_at: newExpiry } : p))
    toast.show({ message: t('profile.postReactivated'), type: 'success' })
  }, [supabase, t, toast])

  const handleClosePost = useCallback(async (postId: string) => {
    const { error } = await (supabase.from('posts') as any).update({ is_active: false }).eq('id', postId)
    if (error) { toast.show({ message: t('profile.postActionFailed'), type: 'error' }); return }
    setAllPosts(prev => prev.map(p => p.id === postId ? { ...p, is_active: false } : p))
    toast.show({ message: t('profile.postClosedSuccess'), type: 'success' })
  }, [supabase, t, toast])

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
            const { error } = await (supabase.from('posts') as any).delete().eq('id', postId)
            if (error) { toast.show({ message: t('profile.postActionFailed'), type: 'error' }); return }
            setAllPosts(prev => prev.filter(p => p.id !== postId))
            toast.show({ message: t('profile.postDeleted'), type: 'success' })
          },
        },
      ]
    )
  }, [supabase, t, toast])

  const handleLogout = () => {
    Alert.alert(
      t('settings.logout'),
      t('settings.logoutConfirm') ?? t('settings.logout'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: async () => {
            clearAuthCache()
            await supabase.auth.signOut()
            router.replace('/(auth)/login')
          },
        },
      ],
    )
  }

  if (profileLoading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        </View>
        <ProfileSkeleton />
      </View>
    )
  }

  if (!profile) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: insets.top + 12 }]}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        </View>
        <View style={s.emptyLogin}>
          <View style={[s.emptyIconCircle, { backgroundColor: colors.foreground + '14' }]}>
            <LogIn size={36} color={colors.foreground} strokeWidth={1.6} />
          </View>
          <Text style={[s.emptyLoginTitle, { color: colors.foreground }]}>{t('profile.loginRequired')}</Text>
          <Text style={[s.emptyLoginHint, { color: colors.mutedForeground }]}>{t('profile.loginHint')}</Text>
          <PressableOpacity onPress={() => router.push('/(auth)/login')} style={[s.loginBtn, { backgroundColor: colors.foreground }]}>
            <Text style={[s.loginBtnText, { color: colors.primaryForeground }]}>{t('auth.login')}</Text>
          </PressableOpacity>
        </View>
      </View>
    )
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'post': return <FileText size={16} color={colors.foreground} />
      case 'event': return <CalendarDays size={16} color={colors.success} />
      case 'review_given': case 'review_received': return <Star size={16} color={colors.foreground} />
      default: return <FileText size={16} color={colors.mutedForeground} />
    }
  }

  return (
    <ScreenErrorBoundary screenName="Profile">
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header — mockup 08: centered title + settings circle */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ width: 36 }} />
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        <PressableOpacity
          onPress={() => router.push('/settings')}
          hitSlop={8}
          style={[s.headerCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityLabel={t('settings.title')}
          accessibilityRole="button"
        >
          <Settings size={14} color={colors.foreground} strokeWidth={2} />
        </PressableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefreshHandler}
            tintColor={colors.foreground}
          />
        }
      >
        {fetchError && !profileLoading && (
          <PressableOpacity onPress={() => { setRefreshing(true); loadProfile().finally(() => setRefreshing(false)) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, padding: 12, borderRadius: 20, backgroundColor: `${colors.destructive}10` }}>
            <RefreshCw size={14} color={colors.destructive} />
            <Text style={{ fontSize: 13, fontFamily: fonts.bodySemi, color: colors.destructive, flex: 1 }}>{t('common.loadError')}</Text>
          </PressableOpacity>
        )}

        {/* Hero — mockup 08: centered avatar + name + location */}
        <View style={s.hero}>
          <PressableOpacity onPress={handleAvatarUpload} accessibilityLabel={`${profile.name} — ${t('profile.avatarUpdated')}`} accessibilityRole="button" style={s.avatarWrap}>
            <Avatar url={profile.avatar_url} name={profile.name} size={104} borderColor={profile.is_pro ? colors.foreground : colors.border} borderWidth={1} />
            <View style={[s.cameraBtn, { backgroundColor: colors.foreground }]} accessibilityElementsHidden>
              <Camera size={12} color={colors.primaryForeground} />
            </View>
          </PressableOpacity>

          <View style={s.heroCenterInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={[s.profileName, { color: colors.foreground }]} numberOfLines={1}>{profile.name}</Text>
              {!trust.loading && <TrustBadge level={trust.level} size="small" showLabel showExplainer />}
              {profile.is_pro && (
                <View style={[s.inlineBadge, { backgroundColor: `${colors.foreground}20` }]}>
                  <Crown size={10} color={colors.foreground} fill={colors.foreground} />
                  <Text style={[s.inlineBadgeText, { color: colors.foreground }]}>Pro</Text>
                </View>
              )}
              {profile.is_business && (
                <View style={[s.inlineBadge, { backgroundColor: `${colors.foreground}15` }]}>
                  <Building2 size={10} color={colors.foreground} />
                  <Text style={[s.inlineBadgeText, { color: colors.foreground }]}>{profile.business_name ?? t('business.verified')}</Text>
                </View>
              )}
            </View>
            <Text style={[s.heroSubtitle, { color: colors.mutedForeground }]}>
              {[profile.naapurusto, 'Helsinki'].filter(Boolean).join(', ')}
              {profile.created_at ? ` · TackBird ${formatTimeAgo(profile.created_at, t, locale)}` : ''}
            </Text>
          </View>

          {/* Bio */}
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
                inputAccessoryViewID={KEYBOARD_DONE_ID}
              />
              <Text style={{ fontSize: 11, color: bioText.length >= 180 ? colors.destructive : colors.mutedForeground, textAlign: 'right', marginTop: 2, fontFamily: fonts.body }}>
                {bioText.length}/200
              </Text>
              <View style={s.bioActions}>
                <PressableOpacity onPress={() => { setEditingBio(false); setBioText(profile?.bio ?? '') }}><X size={20} color={colors.mutedForeground} /></PressableOpacity>
                <PressableOpacity onPress={handleSaveBio} style={[s.bioSaveBtn, { backgroundColor: colors.foreground }]}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primaryForeground, fontFamily: fonts.bodySemi }}>{t('common.save')}</Text>
                </PressableOpacity>
              </View>
            </View>
          ) : profile.bio ? (
            <PressableOpacity onPress={() => setEditingBio(true)} style={[s.bioTapArea, { flexDirection: 'row', alignItems: 'flex-start', gap: 6 }]} accessibilityLabel={t('profile.editBio')} accessibilityRole="button">
              <Text style={[s.bio, { color: colors.foreground, flex: 1, textAlign: 'center' }]}>
                {profile.bio}
              </Text>
              <Pencil size={12} color={colors.mutedForeground} style={{ marginTop: 2 }} />
            </PressableOpacity>
          ) : (
            <PressableOpacity onPress={() => setEditingBio(true)} style={[s.bioTapArea, { backgroundColor: `${colors.foreground}10`, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'center' }]} accessibilityLabel={t('profile.clickToAddBio')} accessibilityRole="button">
              <Text style={[s.bio, { color: colors.mutedForeground }]}>{t('profile.clickToAddBio')}</Text>
            </PressableOpacity>
          )}

          {/* Badges */}
          {badges.length > 0 && (
            <View style={[s.badgesRow, { justifyContent: 'center' }]}>
              {badges.map((b) => {
                const cfg = BADGE_ICONS[b.badge_type]
                if (!cfg) return null
                const Icon = cfg.icon
                return (
                  <View key={b.badge_type} style={[s.badgeChip, { backgroundColor: `${cfg.color}15` }]}>
                    <Icon size={11} color={cfg.color} />
                    <Text style={[s.badgeText, { color: cfg.color }]}>{t(`badges.${b.badge_type}`)}</Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* Stats grid — mockup 08: 3-column surface cards */}
        <View style={s.statsGrid}>
          <PressableOpacity onPress={() => avgRating !== null ? setActiveTab('overview') : undefined} style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.statNum, { color: colors.foreground }]}>{avgRating?.toFixed(1) ?? '—'}</Text>
            <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.rating') ?? 'Arvio'}</Text>
          </PressableOpacity>
          <PressableOpacity onPress={() => postCount > 0 ? setActiveTab('posts') : router.push('/(tabs)/create')} style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.statNum, { color: colors.foreground }]}>{postCount}</Text>
            <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.posts')}</Text>
          </PressableOpacity>
          <PressableOpacity onPress={() => followerCount > 0 ? openFollowList('followers') : undefined} style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.statNum, { color: colors.foreground }]}>{followerCount}</Text>
            <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.followers')}</Text>
          </PressableOpacity>
        </View>

        {/* Menu rows — mockup 08: individual surface cards with chevrons */}
        <View style={s.menuSection}>
          <PressableOpacity onPress={() => router.push('/my-listings')} style={[s.menuRow, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button">
            <Text style={[s.menuRowLabel, { color: colors.foreground }]}>{t('profile.myPosts')}</Text>
            <View style={s.menuRowRight}>
              <Text style={[s.menuRowMeta, { color: colors.mutedForeground }]}>{postCount > 0 ? `${postCount} ${t('profile.active').toLowerCase()}` : ''}</Text>
              <ChevronRight size={10} color={colors.mutedForeground} strokeWidth={2.5} />
            </View>
          </PressableOpacity>
          <PressableOpacity onPress={() => setActiveTab('overview')} style={[s.menuRow, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button">
            <Text style={[s.menuRowLabel, { color: colors.foreground }]}>{t('profile.reviews') ?? 'Arviot'}</Text>
            <View style={s.menuRowRight}>
              <Text style={[s.menuRowMeta, { color: colors.mutedForeground }]}>{reviews.length > 0 ? `${reviews.length}` : ''}</Text>
              <ChevronRight size={10} color={colors.mutedForeground} strokeWidth={2.5} />
            </View>
          </PressableOpacity>
          <PressableOpacity onPress={() => router.push('/saved')} style={[s.menuRow, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button">
            <Text style={[s.menuRowLabel, { color: colors.foreground }]}>{t('saved.title')}</Text>
            <View style={s.menuRowRight}>
              <Text style={[s.menuRowMeta, { color: colors.mutedForeground }]}>{savedCount > 0 ? `${savedCount}` : ''}</Text>
              <ChevronRight size={10} color={colors.mutedForeground} strokeWidth={2.5} />
            </View>
          </PressableOpacity>
          {FEATURES.PRO_SUBSCRIPTION && !profile.is_pro && (
            <PressableOpacity onPress={() => router.push('/pro')} style={[s.menuRow, { backgroundColor: `${colors.foreground}08`, borderColor: `${colors.foreground}30` }]} accessibilityRole="button">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Crown size={14} color={colors.foreground} />
                <Text style={[s.menuRowLabel, { color: colors.foreground }]}>{t('pro.upgradeToPro')}</Text>
              </View>
              <ChevronRight size={10} color={colors.foreground} strokeWidth={2.5} />
            </PressableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={[s.tabRow, { borderBottomColor: colors.border }]} accessibilityRole="tablist">
          <PressableOpacity onPress={() => setActiveTab('overview')} style={[s.tab, activeTab === 'overview' && [s.tabActive, { borderBottomColor: colors.foreground }]]} accessibilityLabel={t('profile.overview')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'overview' }}>
            <Text style={[s.tabText, { color: activeTab === 'overview' ? colors.foreground : colors.mutedForeground }]}>{t('profile.overview')}</Text>
          </PressableOpacity>
          <PressableOpacity onPress={() => setActiveTab('posts')} style={[s.tab, activeTab === 'posts' && [s.tabActive, { borderBottomColor: colors.foreground }]]} accessibilityLabel={t('profile.myPosts')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'posts' }}>
            <Text style={[s.tabText, { color: activeTab === 'posts' ? colors.foreground : colors.mutedForeground }]}>{t('profile.myPosts')}</Text>
          </PressableOpacity>
          <PressableOpacity onPress={() => setActiveTab('activity')} style={[s.tab, activeTab === 'activity' && [s.tabActive, { borderBottomColor: colors.foreground }]]} accessibilityLabel={t('profile.activity')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'activity' }}>
            <Text style={[s.tabText, { color: activeTab === 'activity' ? colors.foreground : colors.mutedForeground }]}>{t('profile.activity')}</Text>
          </PressableOpacity>
        </View>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <View style={s.tabContent}>
            {/* Reviews */}
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('profile.reviewsCount', { count: reviews.length })}</Text>
            {reviews.length === 0 ? (
              <View style={s.emptyActivity}>
                <Star size={28} color={colors.mutedForeground} strokeWidth={1.6} style={{ opacity: 0.4 }} />
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.noReviews')}</Text>
              </View>
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
                <PressableOpacity
                  key={f.key}
                  onPress={() => setPostFilter(f.key)}
                  style={[s.postFilterChip, postFilter === f.key ? { backgroundColor: colors.foreground } : { backgroundColor: isDark ? colors.card : colors.muted }]}
                >
                  <Text style={[s.postFilterText, { color: postFilter === f.key ? colors.primaryForeground : colors.mutedForeground }]}>{f.label}</Text>
                </PressableOpacity>
              ))}
            </ScrollView>

            {allPostsLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('common.loading')}</Text>
              </View>
            ) : visiblePosts.length === 0 ? (
              <View style={s.emptyActivity}>
                <View style={[s.emptyPostsIconCircle, { backgroundColor: colors.foreground + '10' }]}>
                  <FileText size={48} color={colors.foreground} strokeWidth={1.6} />
                </View>
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.myPostsEmpty')}</Text>
                <PressableOpacity onPress={() => router.push('/(tabs)/create')} style={[s.loginBtn, { backgroundColor: colors.foreground, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, marginTop: 8 }]}>
                  <Text style={[s.loginBtnText, { color: colors.primaryForeground }]}>{t('profile.createFirst')}</Text>
                </PressableOpacity>
              </View>
            ) : (
              <>
              {visiblePosts.map((post) => {
                const status = getPostStatus(post)
                const statusColor = status === 'active' ? (colors.success ?? colors.foreground)
                  : status === 'expired' ? colors.foreground
                  : colors.mutedForeground
                const statusLabel = status === 'active' ? t('profile.active')
                  : status === 'expired' ? t('profile.expired')
                  : t('profile.postClosed')

                return (
                  <View key={post.id} style={[s.myPostItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <PressableOpacity
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
                        <View style={[s.myPostTypeBadge, { backgroundColor: `${colors.foreground}14` }]}>
                          <Text style={[s.myPostTypeText, { color: colors.foreground }]}>{post.type}</Text>
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
                    </PressableOpacity>
                    {/* 2b: Action buttons */}
                    <View style={s.myPostActions}>
                      {status === 'expired' && (
                        <PressableOpacity onPress={() => handleReactivatePost(post.id)} style={[s.myPostActionBtn, { backgroundColor: `${colors.foreground}14` }]} hitSlop={8}>
                          <RotateCcw size={13} color={colors.foreground} />
                          <Text style={[s.myPostActionText, { color: colors.foreground }]}>{t('profile.reactivate')}</Text>
                        </PressableOpacity>
                      )}
                      {status === 'active' && (
                        <PressableOpacity onPress={() => handleClosePost(post.id)} style={[s.myPostActionBtn, { backgroundColor: `${colors.mutedForeground}14` }]} hitSlop={8}>
                          <XCircle size={13} color={colors.mutedForeground} />
                          <Text style={[s.myPostActionText, { color: colors.mutedForeground }]}>{t('profile.closePost')}</Text>
                        </PressableOpacity>
                      )}
                      <PressableOpacity onPress={() => handleDeletePost(post.id)} style={[s.myPostActionBtn, { backgroundColor: `${colors.destructive}14` }]} hitSlop={8}>
                        <Trash2 size={13} color={colors.destructive} />
                      </PressableOpacity>
                    </View>
                  </View>
                )
              })}
              {hasMorePosts && (
                <PressableOpacity
                  onPress={() => setVisiblePostCount(prev => prev + 20)}
                  style={[s.loadMoreBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('search.loadMore')}
                >
                  <Text style={[s.loadMoreText, { color: colors.foreground }]}>{t('search.loadMore')}</Text>
                  <Text style={[s.loadMoreHint, { color: colors.mutedForeground }]}>
                    {visiblePostCount}/{filteredPosts.length}
                  </Text>
                </PressableOpacity>
              )}
              </>
            )}
          </View>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <View style={s.tabContent}>
            {activity.length === 0 ? (
              <View style={s.emptyActivity}>
                <Zap size={28} color={colors.mutedForeground} strokeWidth={1.6} style={{ opacity: 0.4 }} />
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.noActivity')}</Text>
                <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>{t('profile.noActivityHint')}</Text>
              </View>
            ) : (
              activity.map((item) => (
                <View key={item.id} style={[s.activityItem, { borderLeftColor: colors.foreground }]}>
                  <View style={[s.activityDot, { backgroundColor: colors.card, borderColor: colors.foreground }]}>
                    {getActivityIcon(item.type)}
                  </View>
                  <View style={s.activityContent}>
                    <Text style={[s.activityTitle, { color: colors.foreground }]}>{item.title}</Text>
                    <View style={s.activityMeta}>
                      <Text style={[s.activityTime, { color: colors.mutedForeground }]}>{formatTimeAgo(item.date, t, locale)}</Text>
                      {item.meta && <Text style={[s.activityMetaBadge, { color: colors.foreground }]}>{item.meta}</Text>}
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Actions */}
        <View style={[s.flatList, { borderColor: colors.border, marginTop: 8 }]}>
          <PressableOpacity onPress={handleLogout} style={[s.flatRow, s.flatRowLast]} accessibilityRole="button">
            <LogOut size={18} color={colors.destructive} />
            <Text style={[s.flatRowText, { color: colors.destructive }]}>{t('profile.logout')}</Text>
          </PressableOpacity>
        </View>
      </ScrollView>

      {/* Followers/Following Modal */}
      <Modal visible={followModal !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFollowModal(null)}>
        <View style={[s.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>
              {followModal === 'followers' ? t('profile.followersList', { count: followerCount }) : t('profile.followingList', { count: followingCount })}
            </Text>
            <PressableOpacity onPress={() => setFollowModal(null)} hitSlop={12}>
              <X size={24} color={colors.foreground} />
            </PressableOpacity>
          </View>
          <FlatList
            data={followList}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <PressableOpacity style={s.followItem} onPress={() => { setFollowModal(null); router.push(`/profile/${item.id}` as any) }}>
                <Avatar url={item.avatar_url} name={item.name} size={40} />
                <Text style={[s.followName, { color: colors.foreground }]}>{item.name}</Text>
              </PressableOpacity>
            )}
            ListEmptyComponent={
              <Text style={[s.emptyText, { color: colors.mutedForeground, textAlign: 'center', marginTop: 40 }]}>
                {followModal === 'followers' ? t('profile.noFollowers') : t('profile.noFollowing')}
              </Text>
            }
          />
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
      <KeyboardDoneAccessory />
    </View>
    </ScreenErrorBoundary>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
  },
  headerTitle: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, fontFamily: fonts.heading, lineHeight: 20 },
  headerCircle: {
    width: 36, height: 36, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 18 },

  // Hero — centered (mockup 08)
  hero: { alignItems: 'center', gap: 12, paddingTop: 8 },
  avatarWrap: { position: 'relative' },
  heroCenterInfo: { alignItems: 'center', gap: 4, marginTop: 2 },
  profileName: { fontSize: 24, fontWeight: '600', fontFamily: fonts.heading, lineHeight: 30, letterSpacing: -0.5 },
  heroSubtitle: { fontSize: 13, fontFamily: fonts.body, lineHeight: 16, letterSpacing: 0.1, textAlign: 'center' },

  // Stats grid (mockup 08)
  statsGrid: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1, borderRadius: 18, borderWidth: 1,
    paddingVertical: 14, paddingHorizontal: 10,
    alignItems: 'center', gap: 2,
  },
  statNum: { fontSize: 19, fontWeight: '600', fontFamily: fonts.heading, letterSpacing: -0.3, lineHeight: 24 },
  statLabel: { fontSize: 11, fontFamily: fonts.bodyMedium, fontWeight: '500', lineHeight: 14, letterSpacing: 0.3, textTransform: 'uppercase' },

  // Menu rows (mockup 08)
  menuSection: { gap: 8 },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 16, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 48,
  },
  menuRowLabel: { fontSize: 14, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 20 },
  menuRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuRowMeta: { fontSize: 12, fontFamily: fonts.body, lineHeight: 16 },

  // Inline badge (Pro, Business) next to name
  inlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  inlineBadgeText: { fontSize: 10, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 13 },

  cameraBtn: {
    position: 'absolute', bottom: -4, right: -4,
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  bio: { fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  bioTapArea: { minHeight: 44, justifyContent: 'center' },
  bioEditWrap: { width: '100%', gap: 8 },
  bioInput: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, minHeight: 64, textAlignVertical: 'top', fontFamily: fonts.body },
  bioActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
  bioSaveBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, minHeight: 44, justifyContent: 'center' as const },
  badgesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 14 },

  // Flat list (kept for logout row at bottom)
  flatList: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  flatRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingVertical: 14, minHeight: 44, borderBottomWidth: StyleSheet.hairlineWidth },
  flatRowLast: { borderBottomWidth: 0 },
  flatRowText: { flex: 1, fontSize: 14, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 8, fontFamily: fonts.headingSemi, lineHeight: 22 },
  reviewCard: { borderRadius: 20, padding: 16, gap: 8 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewName: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodyMedium, lineHeight: 18 },
  reviewTime: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14 },
  reviewComment: { fontSize: 14, lineHeight: 19, fontFamily: fonts.body },
  emptyText: { fontSize: 14, fontFamily: fonts.body },
  emptyHint: { fontSize: 13, marginTop: 4, fontFamily: fonts.body, lineHeight: 18 },
  emptyPostsIconCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyActivity: { alignItems: 'center', paddingTop: 24, gap: 4 },
  activityItem: { flexDirection: 'row', gap: 12, paddingLeft: 16, borderLeftWidth: 2, paddingVertical: 8 },
  activityDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: -24 },
  activityContent: { flex: 1, gap: 4 },
  activityTitle: { fontSize: 14, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 20 },
  activityMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  activityTime: { fontSize: 12, fontFamily: fonts.body, lineHeight: 16 },
  activityMetaBadge: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 16 },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', minHeight: 44 },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodyMedium, lineHeight: 20 },
  tabContent: { gap: 12, paddingTop: 4 },
  emptyLogin: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  emptyIconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyLoginTitle: { fontSize: 18, fontWeight: '700', fontFamily: fonts.heading, textAlign: 'center' },
  emptyLoginHint: { fontSize: 14, lineHeight: 20, fontFamily: fonts.body, textAlign: 'center' },
  loginBtn: { marginTop: 8, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center' },
  loginBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 18, fontWeight: '700', fontFamily: fonts.headingSemi },
  followItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  followName: { fontSize: 14, fontWeight: '500', fontFamily: fonts.bodyMedium },
  // My Posts tab
  myPostItem: { gap: 8, padding: 16, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  myPostTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 20 },
  myPostTypeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  myPostTypeText: { fontSize: 11, fontWeight: '600', fontFamily: fonts.bodySemi, textTransform: 'uppercase', lineHeight: 13 },
  myPostDate: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14 },
  myPostStatusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  myPostStatusText: { fontSize: 11, fontWeight: '600', fontFamily: fonts.bodySemi, textTransform: 'uppercase', lineHeight: 13 },
  myPostActions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  myPostActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, minHeight: 44 },
  myPostActionText: { fontSize: 11, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 14 },
  postFilterChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, minHeight: 44 , justifyContent: 'center' as const },
  postFilterText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 16 },
  loadMoreBtn: { alignItems: 'center', gap: 4, paddingVertical: 14, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, minHeight: 48, justifyContent: 'center' as const },
  loadMoreText: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 18 },
  loadMoreHint: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14 },
})
