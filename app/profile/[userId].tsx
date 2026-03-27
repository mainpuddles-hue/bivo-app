declare const __DEV__: boolean

import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ArrowLeft, MapPin, MessageCircle, UserPlus, UserMinus,
  Flag, ShieldBan, Crown, PenLine, Zap, ShieldCheck, Clock, CalendarDays, CheckCircle2,
} from 'lucide-react-native'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo } from '@/lib/format'
import { fonts } from '@/lib/fonts'
import { PostCard } from '@/components/PostCard'
import { ReviewModal } from '@/components/ReviewModal'
import { ReportModal } from '@/components/ReportModal'
import { TrustBadge } from '@/components/TrustBadge'
import { Avatar } from '@/components/Avatar'
import { StarRating } from '@/components/StarRating'
import { useTrustLevel } from '@/hooks/useTrustLevel'
import { isValidUUID } from '@/lib/validation'
import { isProfileVisible } from '@/lib/privacyUtils'
import { BADGE_ICONS } from '@/lib/badgeIcons'
import type { Profile, Post, Review, UserBadge } from '@/lib/types'

export default function PublicProfileScreen() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const supabase = useSupabase()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isBlocked, setIsBlocked] = useState(false)
  const [postCount, setPostCount] = useState(0)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [avgRating, setAvgRating] = useState<number | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [badges, setBadges] = useState<UserBadge[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [activeTab, setActiveTab] = useState<'posts' | 'reviews'>('posts')
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [hasTransaction, setHasTransaction] = useState(false)
  const [hasExistingReview, setHasExistingReview] = useState(false)
  const [profileHidden, setProfileHidden] = useState(false)
  const [ratingDistribution, setRatingDistribution] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
  const [totalReviewCount, setTotalReviewCount] = useState(0)
  const [completedTransactions, setCompletedTransactions] = useState(0)
  const trust = useTrustLevel(userId)

  useEffect(() => {
    async function load() {
      if (!userId || !isValidUUID(userId)) return

      const { data: { user } } = await supabase.auth.getUser()
      if (user) setCurrentUserId(user.id)

      // If viewing own profile, redirect to profile tab
      if (user && user.id === userId) {
        router.replace('/(tabs)/profile')
        return
      }

      // Fetch profile
      const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single()
      if (!p) { setLoading(false); return }
      const prof = p as unknown as Profile

      // Check profile visibility before rendering
      let viewerNeighborhood: string | null = null
      if (user) {
        const { data: viewerProfile } = await (supabase.from('profiles') as any)
          .select('naapurusto')
          .eq('id', user.id)
          .single()
        viewerNeighborhood = viewerProfile?.naapurusto ?? null
      }
      if (!isProfileVisible(
        (prof as any).profile_visibility,
        prof.naapurusto,
        viewerNeighborhood,
        user?.id === userId,
      )) {
        setProfileHidden(true)
        setLoading(false)
        return
      }

      setProfile(prof)

      // Parallel fetches
      const [postsRes, followersRes, followingRes] = await Promise.all([
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
        supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('followed_id', userId),
        supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
      ])
      setPostCount(postsRes.count ?? 0)
      setFollowerCount(followersRes.count ?? 0)
      setFollowingCount(followingRes.count ?? 0)

      // Check follow/block status + transaction history for reviews
      if (user) {
        const [followRes, blockRes, convRes, existingReviewRes] = await Promise.all([
          supabase.from('user_follows').select('id').eq('follower_id', user.id).eq('followed_id', userId).maybeSingle(),
          supabase.from('blocked_users').select('id').eq('blocker_id', user.id).eq('blocked_id', userId).maybeSingle(),
          // Check if there's been a conversation (transaction proxy) between users
          supabase.from('conversations').select('id').or(
            `and(user1_id.eq.${user.id},user2_id.eq.${userId}),and(user1_id.eq.${userId},user2_id.eq.${user.id})`
          ).maybeSingle(),
          // Check for existing review
          supabase.from('reviews').select('id').eq('reviewer_id', user.id).eq('reviewed_id', userId).maybeSingle(),
        ])
        setIsFollowing(!!followRes.data)
        setIsBlocked(!!blockRes.data)
        setHasTransaction(!!convRes.data)
        setHasExistingReview(!!existingReviewRes.data)
      }

      // Reviews received — fetch all to compute distribution
      const { data: allRevs } = await supabase
        .from('reviews')
        .select('id, rating, comment, created_at, reviewer:profiles!reviews_reviewer_id_fkey(id, name, avatar_url)')
        .eq('reviewed_id', userId)
        .order('created_at', { ascending: false })
      const revsList = (allRevs ?? []) as unknown as Review[]
      setReviews(revsList)
      setTotalReviewCount(revsList.length)
      if (revsList.length > 0) {
        const avg = (revsList as any[]).reduce((sum: number, r: any) => sum + r.rating, 0) / revsList.length
        setAvgRating(Math.round(avg * 10) / 10)
        // Compute rating distribution
        const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        for (const r of revsList as any[]) {
          const star = Math.min(5, Math.max(1, Math.round(r.rating)))
          dist[star] = (dist[star] ?? 0) + 1
        }
        setRatingDistribution(dist)
      }

      // Completed transactions count (conversations as proxy)
      const { count: txCount } = await supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      setCompletedTransactions(txCount ?? 0)

      // Badges
      const { data: bdg } = await supabase.from('user_badges').select('badge_type').eq('user_id', userId)
      setBadges((bdg ?? []) as UserBadge[])

      // Public posts
      const { data: userPosts } = await supabase
        .from('posts')
        .select('id, type, title, created_at, image_url, like_count, comment_count, location, user_id, description, is_pro_listing, tags, daily_fee, is_active, updated_at')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(20)
      setPosts((userPosts ?? []) as unknown as Post[])

      setLoading(false)
    }
    load()
  }, [userId, supabase, router])

  const followingRef = useRef(false)
  const handleFollow = useCallback(async () => {
    if (!currentUserId) { router.push('/(auth)/login'); return }
    if (followingRef.current) return
    followingRef.current = true
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    const wasFollowing = isFollowing
    const prevCount = followerCount
    try {
      if (wasFollowing) {
        setIsFollowing(false)
        setFollowerCount(c => c - 1)
        const { error } = await (supabase.from('user_follows') as any).delete().eq('follower_id', currentUserId).eq('followed_id', userId)
        if (error) { setIsFollowing(true); setFollowerCount(prevCount) }
      } else {
        setIsFollowing(true)
        setFollowerCount(c => c + 1)
        const { error } = await (supabase.from('user_follows') as any).insert({ follower_id: currentUserId, followed_id: userId })
        if (error) { setIsFollowing(false); setFollowerCount(prevCount) }
      }
    } finally {
      followingRef.current = false
    }
  }, [currentUserId, isFollowing, followerCount, userId, supabase, router])

  const handleMessage = useCallback(async () => {
    if (!currentUserId) { router.push('/(auth)/login'); return }
    if (!isValidUUID(currentUserId) || !isValidUUID(userId)) return
    // Find existing conversation or create new one
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(user1_id.eq.${currentUserId},user2_id.eq.${userId}),and(user1_id.eq.${userId},user2_id.eq.${currentUserId})`)
      .maybeSingle()

    if (existing) {
      router.push(`/messages/${(existing as any).id}`)
    } else {
      const { data: newConv, error } = await (supabase.from('conversations') as any)
        .insert({ user1_id: currentUserId, user2_id: userId })
        .select('id')
        .single()
      if (error) { if (__DEV__) console.log('[conv] create error:', JSON.stringify(error)); Alert.alert(t('common.error'), error.message || t('messages.conversationCreateFailed')); return }
      if (!newConv) { Alert.alert(t('common.error'), t('messages.conversationCreateFailed')); return }
      router.push(`/messages/${newConv.id}`)
    }
  }, [currentUserId, userId, supabase, router, t])

  const handleBlock = useCallback(async () => {
    if (!currentUserId) { router.push('/(auth)/login'); return }
    Alert.alert(
      isBlocked ? t('post.unblock') ?? 'Unblock' : t('post.block'),
      t('post.blockConfirm', { name: profile?.name ?? '' }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: isBlocked ? t('post.unblock') ?? 'Unblock' : t('post.block'), style: 'destructive',
          onPress: async () => {
            if (isBlocked) {
              setIsBlocked(false)
              try {
                await (supabase.from('blocked_users') as any).delete().eq('blocker_id', currentUserId).eq('blocked_id', userId)
                Alert.alert(t('common.success'), t('profile.unblocked'))
              } catch { setIsBlocked(true) }
            } else {
              setIsBlocked(true)
              try {
                await (supabase.from('blocked_users') as any).insert({ blocker_id: currentUserId, blocked_id: userId })
                Alert.alert(t('common.success'), t('profile.blocked'))
              } catch { setIsBlocked(false) }
            }
          },
        },
      ]
    )
  }, [currentUserId, isBlocked, userId, profile, supabase, t, router])

  const handleReport = useCallback(() => {
    if (!currentUserId) { router.push('/(auth)/login'); return }
    setShowReportModal(true)
  }, [currentUserId, router])

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
        </View>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </View>
    )
  }

  if (profileHidden) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        </View>
        <Text style={[s.notFound, { color: colors.mutedForeground }]}>{t('profile.profileHidden') ?? 'Profiili ei ole julkinen'}</Text>
      </View>
    )
  }

  if (!profile) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        </View>
        <Text style={[s.notFound, { color: colors.mutedForeground }]}>{t('profile.notFound')}</Text>
      </View>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{profile.name}</Text>
        <View style={{ flex: 1 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.hero}>
          <Avatar url={profile.avatar_url} name={profile.name} size={80} borderColor={profile.is_pro ? colors.pro : undefined} borderWidth={profile.is_pro ? 3 : undefined} />
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

          {profile.bio ? (
            <Text style={[s.bio, { color: colors.mutedForeground }]}>{profile.bio}</Text>
          ) : null}

          {/* Badges */}
          {badges.length > 0 && (
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
          )}

          {profile.is_pro && (
            <View style={[s.proBadge, { backgroundColor: `${colors.pro}20` }]}>
              <Crown size={14} color={colors.pro} fill={colors.pro} />
              <Text style={[s.proText, { color: colors.pro }]}>Pro</Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={s.actions}>
            <Pressable onPress={handleFollow} style={[s.followBtn, { backgroundColor: isFollowing ? colors.muted : colors.primary }]}>
              {isFollowing ? (
                <UserMinus size={16} color={colors.foreground} />
              ) : (
                <UserPlus size={16} color={colors.primaryForeground} />
              )}
              <Text style={[s.followBtnText, { color: isFollowing ? colors.foreground : colors.primaryForeground }]}>
                {isFollowing ? t('profile.unfollow') : t('profile.follow')}
              </Text>
            </Pressable>
            <Pressable onPress={handleMessage} style={[s.messageBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <MessageCircle size={16} color={colors.foreground} />
              <Text style={[s.messageBtnText, { color: colors.foreground }]}>{t('profile.sendMessage')}</Text>
            </Pressable>
          </View>

          {/* Write Review button — only if user has had a transaction and hasn't reviewed yet */}
          {currentUserId && hasTransaction && !hasExistingReview && (
            <Pressable onPress={() => setShowReviewModal(true)} style={[s.reviewBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <PenLine size={16} color={colors.pro} />
              <Text style={[s.reviewBtnText, { color: colors.foreground }]}>{t('profile.writeReview')}</Text>
            </Pressable>
          )}
        </View>

        {/* Stats 4-column — hide zeros, show dashes */}
        <View style={[s.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={s.stat}>
            <Text style={[s.statNum, { color: colors.foreground }]}>{followerCount > 0 ? followerCount : '\u2013'}</Text>
            <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.followers')}</Text>
          </View>
          <View style={[s.statDiv, { backgroundColor: colors.border }]} />
          <View style={s.stat}>
            <Text style={[s.statNum, { color: colors.foreground }]}>{postCount > 0 ? postCount : '\u2013'}</Text>
            <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.posts')}</Text>
          </View>
          <View style={[s.statDiv, { backgroundColor: colors.border }]} />
          <View style={s.stat}>
            <Text style={[s.statNum, { color: colors.foreground }]}>{avgRating ?? '\u2013'}</Text>
            <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.avgRating')}</Text>
          </View>
          <View style={[s.statDiv, { backgroundColor: colors.border }]} />
          <View style={s.stat}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={[s.statNum, { color: colors.foreground }]}>{((profile as any)?.total_points ?? 0) > 0 ? (profile as any).total_points : '\u2013'}</Text>
              <Zap size={12} color="#F59E0B" fill="#F59E0B" />
            </View>
            <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{t('leaderboard.points')}</Text>
          </View>
        </View>

        {/* Rating Summary Card */}
        {totalReviewCount > 0 && (
          <View style={[s.ratingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[s.ratingCardTitle, { color: colors.foreground }]}>
              {t('profile.ratingsSummary')} ({totalReviewCount} {t('profile.reviewCount')})
            </Text>
            <View style={s.ratingOverview}>
              <View style={s.ratingStarsCol}>
                <StarRating rating={Math.round(avgRating ?? 0)} size={18} />
                <Text style={[s.ratingBigNum, { color: colors.foreground }]}>
                  {avgRating ?? 0} / 5
                </Text>
              </View>
            </View>
            <View style={s.ratingBars}>
              {[5, 4, 3, 2, 1].map(star => {
                const count = ratingDistribution[star] ?? 0
                const maxCount = Math.max(...Object.values(ratingDistribution), 1)
                const pct = count / maxCount
                return (
                  <View key={star} style={s.ratingBarRow}>
                    <Text style={[s.ratingBarLabel, { color: colors.mutedForeground }]}>{star}\u2605</Text>
                    <View style={[s.ratingBarTrack, { backgroundColor: colors.muted }]}>
                      <View style={[s.ratingBarFill, { width: `${pct * 100}%`, backgroundColor: colors.pro }]} />
                    </View>
                    <Text style={[s.ratingBarCount, { color: colors.mutedForeground }]}>{count}</Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Verification Badges / Trust Info */}
        <View style={[s.verificationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {badges.some(b => (b.badge_type as string) === 'verified' || (b.badge_type as string) === 'suomifi') && (
            <View style={s.verifyRow}>
              <ShieldCheck size={16} color={colors.primary} />
              <Text style={[s.verifyText, { color: colors.foreground }]}>{t('profile.verified')}</Text>
            </View>
          )}
          {(profile as any)?.response_rate != null && (
            <View style={s.verifyRow}>
              <Clock size={16} color={colors.primary} />
              <Text style={[s.verifyText, { color: colors.foreground }]}>
                {t('profile.responseRate')}: {(profile as any).response_rate}%
              </Text>
            </View>
          )}
          <View style={s.verifyRow}>
            <CalendarDays size={16} color={colors.primary} />
            <Text style={[s.verifyText, { color: colors.foreground }]}>
              {t('profile.memberSince')} {profile.created_at ? new Date(profile.created_at).getFullYear() : ''}
            </Text>
          </View>
          {completedTransactions > 0 && (
            <View style={s.verifyRow}>
              <CheckCircle2 size={16} color={colors.primary} />
              <Text style={[s.verifyText, { color: colors.foreground }]}>
                {completedTransactions} {t('profile.completedTransactions')}
              </Text>
            </View>
          )}
        </View>

        {/* Activity Summary */}
        <View style={[s.activitySummaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.activitySummaryTitle, { color: colors.foreground }]}>{t('profile.activitySummary')}</Text>
          <Text style={[s.activitySummaryText, { color: colors.mutedForeground }]}>
            {postCount} {t('profile.totalPosts')}, {totalReviewCount} {t('profile.reviewCount')}, {(profile as any)?.total_points ?? 0} {t('profile.points')}
          </Text>
          {/* Recent posts preview — last 3 with thumbnails */}
          {posts.length > 0 && (
            <View style={s.recentPostsRow}>
              {posts.slice(0, 3).map(post => (
                <Pressable key={post.id} onPress={() => router.push(`/post/${post.id}` as any)} style={s.recentPostThumb}>
                  {post.image_url ? (
                    <Image source={{ uri: post.image_url }} style={s.recentPostImg} contentFit="cover" />
                  ) : (
                    <View style={[s.recentPostImg, { backgroundColor: colors.muted }]}>
                      <Text style={[s.recentPostImgPlaceholder, { color: colors.mutedForeground }]} numberOfLines={1}>{post.title}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Tabs */}
        <View style={[s.tabRow, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setActiveTab('posts')} style={[s.tab, activeTab === 'posts' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'posts' ? colors.primary : colors.mutedForeground }]}>{t('profile.posts')}</Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab('reviews')} style={[s.tab, activeTab === 'reviews' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'reviews' ? colors.primary : colors.mutedForeground }]}>{t('profile.reviews')}</Text>
          </Pressable>
        </View>

        {/* Posts tab */}
        {activeTab === 'posts' && (
          <View style={s.tabContent}>
            {posts.length === 0 ? (
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.noPosts')}</Text>
            ) : (
              posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))
            )}
          </View>
        )}

        {/* Reviews tab */}
        {activeTab === 'reviews' && (
          <View style={s.tabContent}>
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
          </View>
        )}

        {/* Block / Report */}
        {currentUserId && currentUserId !== userId && (
          <View style={s.dangerActions}>
            <Pressable onPress={handleBlock} style={[s.dangerBtn, { backgroundColor: colors.card }]}>
              <ShieldBan size={18} color={isBlocked ? colors.destructive : colors.mutedForeground} />
              <Text style={[s.dangerBtnText, { color: isBlocked ? colors.destructive : colors.mutedForeground }]}>
                {isBlocked ? t('post.unblock') : t('post.block')}
              </Text>
            </Pressable>
            <Pressable onPress={handleReport} style={[s.dangerBtn, { backgroundColor: colors.card }]}>
              <Flag size={18} color={colors.mutedForeground} />
              <Text style={[s.dangerBtnText, { color: colors.mutedForeground }]}>{t('post.report')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Review Modal */}
      <ReviewModal
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        reviewedUserId={userId!}
        onReviewSubmitted={() => {
          setHasExistingReview(true)
          // Refresh reviews list
          supabase
            .from('reviews')
            .select('id, rating, comment, created_at, reviewer:profiles!reviews_reviewer_id_fkey(id, name, avatar_url)')
            .eq('reviewed_id', userId)
            .order('created_at', { ascending: false })
            .then(({ data }) => {
              if (data) {
                const revsList = data as unknown as Review[]
                setReviews(revsList)
                setTotalReviewCount(revsList.length)
                const avg = revsList.length > 0 ? (revsList as any[]).reduce((sum: number, r: any) => sum + r.rating, 0) / revsList.length : 0
                setAvgRating(Math.round(avg * 10) / 10)
                const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
                for (const r of revsList as any[]) {
                  const star = Math.min(5, Math.max(1, Math.round(r.rating)))
                  dist[star] = (dist[star] ?? 0) + 1
                }
                setRatingDistribution(dist)
              }
            })
        }}
      />

      {/* Report Modal */}
      <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        type="user"
        targetId={userId!}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi, maxWidth: 250 },
  content: { padding: 16, gap: 16, paddingBottom: 100 },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  bigAvatar: { width: 80, height: 80, borderRadius: 40 },
  bigAvatarFb: { alignItems: 'center', justifyContent: 'center' },
  bigAvatarInit: { fontSize: 32, fontWeight: '700' },
  profileName: { fontSize: 20, fontWeight: '700' },
  nhRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nhText: { fontSize: 14, fontWeight: '500' },
  bio: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },
  badgesRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  proText: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8, width: '100%', paddingHorizontal: 16 },
  followBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  followBtnText: { fontSize: 14, fontWeight: '600' },
  messageBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
  },
  messageBtnText: { fontSize: 14, fontWeight: '600' },
  statsRow: { flexDirection: 'row', borderRadius: 12, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 11 },
  statDiv: { width: 1 },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 14, fontWeight: '600' },
  tabContent: { gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  reviewCard: { borderRadius: 12, padding: 14, gap: 8 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewAvatar: { width: 32, height: 32, borderRadius: 16 },
  reviewName: { fontSize: 13, fontWeight: '600' },
  reviewTime: { fontSize: 11 },
  reviewComment: { fontSize: 14, lineHeight: 19 },
  dangerActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  dangerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, borderRadius: 12,
  },
  dangerBtnText: { fontSize: 14, fontWeight: '500' },
  reviewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 10, borderRadius: 10, borderWidth: 1, width: '100%', paddingHorizontal: 16,
  },
  reviewBtnText: { fontSize: 14, fontWeight: '600' },
  notFound: { fontSize: 16, textAlign: 'center', marginTop: 100 },
  // Rating summary card
  ratingCard: { borderRadius: 12, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  ratingCardTitle: { fontSize: 15, fontWeight: '700' },
  ratingOverview: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ratingStarsCol: { alignItems: 'center', gap: 4 },
  ratingBigNum: { fontSize: 16, fontWeight: '700' },
  ratingBars: { gap: 6 },
  ratingBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ratingBarLabel: { fontSize: 12, fontWeight: '600', width: 24, textAlign: 'right' },
  ratingBarTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  ratingBarFill: { height: 8, borderRadius: 4 },
  ratingBarCount: { fontSize: 12, fontWeight: '500', width: 20 },
  // Verification card
  verificationCard: { borderRadius: 12, padding: 16, gap: 10, borderWidth: StyleSheet.hairlineWidth },
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  verifyText: { fontSize: 14, fontWeight: '500' },
  // Activity summary
  activitySummaryCard: { borderRadius: 12, padding: 16, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  activitySummaryTitle: { fontSize: 15, fontWeight: '700' },
  activitySummaryText: { fontSize: 13, lineHeight: 18 },
  recentPostsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  recentPostThumb: { flex: 1 },
  recentPostImg: { height: 60, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  recentPostImgPlaceholder: { fontSize: 11, textAlign: 'center' },
})
