declare const __DEV__: boolean

import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet, ActivityIndicator, Alert, useWindowDimensions, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { clearBlockedCache } from '@/lib/blockedUsers'
import {
  ArrowLeft, MapPin, MessageCircle, UserPlus, UserMinus,
  Flag, ShieldBan, Crown, PenLine, Zap, ShieldCheck, Clock, CalendarDays, CheckCircle2,
  Phone, Globe, Building2, Camera, BadgeCheck,
} from 'lucide-react-native'
import { Image } from 'expo-image'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo } from '@/lib/format'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { BackButton, PressableOpacity } from '@/components/ui'
import { PostCard } from '@/components/PostCard'
import { ReviewModal } from '@/components/ReviewModal'
import { ReportModal } from '@/components/ReportModal'
import { TrustBadge } from '@/components/TrustBadge'
import { Avatar } from '@/components/Avatar'
import { StarRating } from '@/components/StarRating'
import { useTrustLevel } from '@/hooks/useTrustLevel'
import { isValidUUID } from '@/lib/validation'
import { FEATURES } from '@/lib/featureFlags'
import { isProfileVisible } from '@/lib/privacyUtils'
import { BADGE_ICONS } from '@/lib/badgeIcons'
import type { Profile, Post, Review, UserBadge } from '@/lib/types'

const HERO_IMAGE_HEIGHT = 200

export default function PublicProfileScreen() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const supabase = useSupabase()
  const { width: screenWidth } = useWindowDimensions()
  const heroImageWidth = screenWidth * 0.85

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
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

  const loadProfile = useCallback(async () => {
    if (!userId || !isValidUUID(userId)) { setLoading(false); setRefreshing(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) setCurrentUserId(user.id)

    // If viewing own profile, redirect to profile tab
    if (user && user.id === userId) {
      router.replace('/(tabs)/profile')
      return
    }

    // Fetch profile
    const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (!p) { setLoading(false); setRefreshing(false); return }
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
      setRefreshing(false)
      return
    }

    setProfile(prof)

    // Parallel fetches
    const [postsSettled, followersSettled, followingSettled] = await Promise.allSettled([
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
      supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('followed_id', userId),
      supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('follower_id', userId),
    ])
    const postsRes = postsSettled.status === 'fulfilled' ? postsSettled.value : { count: 0 }
    const followersRes = followersSettled.status === 'fulfilled' ? followersSettled.value : { count: 0 }
    const followingRes = followingSettled.status === 'fulfilled' ? followingSettled.value : { count: 0 }
    setPostCount(postsRes.count ?? 0)
    setFollowerCount(followersRes.count ?? 0)
    setFollowingCount(followingRes.count ?? 0)

    // Check follow/block status + transaction history for reviews
    if (user) {
      const [followSettled, blockSettled, convSettled, existingReviewSettled] = await Promise.allSettled([
        supabase.from('user_follows').select('id').eq('follower_id', user.id).eq('followed_id', userId).maybeSingle(),
        supabase.from('blocked_users').select('id').eq('blocker_id', user.id).eq('blocked_id', userId).maybeSingle(),
        // Check if there's been a conversation (transaction proxy) between users
        supabase.from('conversations').select('id').or(
          `and(user1_id.eq.${user.id},user2_id.eq.${userId}),and(user1_id.eq.${userId},user2_id.eq.${user.id})`
        ).maybeSingle(),
        // Check for existing review
        supabase.from('reviews').select('id').eq('reviewer_id', user.id).eq('reviewed_id', userId).maybeSingle(),
      ])
      const followRes = followSettled.status === 'fulfilled' ? followSettled.value : { data: null }
      const blockRes = blockSettled.status === 'fulfilled' ? blockSettled.value : { data: null }
      const convRes = convSettled.status === 'fulfilled' ? convSettled.value : { data: null }
      const existingReviewRes = existingReviewSettled.status === 'fulfilled' ? existingReviewSettled.value : { data: null }
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
      const avg = (revsList as any[]).reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0) / revsList.length
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
    setRefreshing(false)
  }, [userId, supabase, router])

  useFocusEffect(useCallback(() => { loadProfile() }, [loadProfile]))

  const followingRef = useRef(false)
  const [creatingConversation, setCreatingConversation] = useState(false)
  const handleFollow = useCallback(async () => {
    if (!currentUserId) { router.push('/(auth)/login'); return }
    if (followingRef.current) return
    followingRef.current = true
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} // Intentional: haptics unavailable on some platforms
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
        if (error) {
          // Duplicate key = already following
          if (error.code === '23505') { setIsFollowing(true) }
          else { setIsFollowing(false); setFollowerCount(prevCount) }
        }
        else {
          // Create notification for the followed user
          try {
            await (supabase.from('notifications') as any).insert({
              user_id: userId,
              from_user_id: currentUserId,
              type: 'new_follower',
              title: t('notifications.newFollower'),
              body: '',
              link_type: 'profile',
              link_id: currentUserId,
            })
          } catch {} // Intentional: non-critical notification
        }
      }
    } finally {
      followingRef.current = false
    }
  }, [currentUserId, isFollowing, followerCount, userId, supabase, router, t])

  const handleMessage = useCallback(async () => {
    if (creatingConversation) return
    if (!currentUserId) { router.push('/(auth)/login'); return }
    if (!isValidUUID(currentUserId) || !isValidUUID(userId)) return
    setCreatingConversation(true)
    try {
      // Find existing conversation or create new one
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(user1_id.eq.${currentUserId},user2_id.eq.${userId}),and(user1_id.eq.${userId},user2_id.eq.${currentUserId})`)
        .maybeSingle()

      if (existing) {
        router.push(`/messages/${(existing as any).id}`)
      } else {
        const { data: newConv, error: insertError } = await (supabase.from('conversations') as any)
          .insert({ user1_id: currentUserId, user2_id: userId })
          .select('id')
          .single()
        if (insertError?.code === '23505') {
          // Unique constraint violation — race condition, re-query existing conversation
          const { data: existingConv } = await supabase
            .from('conversations').select('id')
            .or(`and(user1_id.eq.${currentUserId},user2_id.eq.${userId}),and(user1_id.eq.${userId},user2_id.eq.${currentUserId})`)
            .maybeSingle()
          if (existingConv) { router.push(`/messages/${(existingConv as any).id}`); return }
          Alert.alert(t('common.error'), t('messages.conversationCreateFailed')); return
        }
        if (insertError) { if (__DEV__) console.log('[conv] create error:', JSON.stringify(insertError)); Alert.alert(t('common.error'), insertError.message || t('messages.conversationCreateFailed')); return }
        if (!newConv) { Alert.alert(t('common.error'), t('messages.conversationCreateFailed')); return }
        router.push(`/messages/${newConv.id}`)
      }
    } finally {
      setCreatingConversation(false)
    }
  }, [creatingConversation, currentUserId, userId, supabase, router, t])

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
                clearBlockedCache()
                Alert.alert(t('common.success'), t('profile.unblocked'))
              } catch (err) { setIsBlocked(true); if (__DEV__) console.warn('[profile] unblock failed:', err); Alert.alert(t('common.error')) }
            } else {
              setIsBlocked(true)
              try {
                await (supabase.from('blocked_users') as any).insert({ blocker_id: currentUserId, blocked_id: userId })
                clearBlockedCache()
                Alert.alert(t('common.success'), t('profile.blocked'))
              } catch (err) { setIsBlocked(false); if (__DEV__) console.warn('[profile] block failed:', err); Alert.alert(t('common.error')) }
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
      <ScreenErrorBoundary screenName="PublicProfile">
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <BackButton />
        </View>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} />
      </View>
      </ScreenErrorBoundary>
    )
  }

  if (profileHidden) {
    return (
      <ScreenErrorBoundary screenName="PublicProfile">
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <BackButton />
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        </View>
        <Text style={[s.notFound, { color: colors.mutedForeground }]}>{t('profile.profileHidden') ?? 'Profiili ei ole julkinen'}</Text>
      </View>
      </ScreenErrorBoundary>
    )
  }

  if (!profile) {
    return (
      <ScreenErrorBoundary screenName="PublicProfile">
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <BackButton />
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        </View>
        <Text style={[s.notFound, { color: colors.mutedForeground }]}>{t('profile.notFound')}</Text>
      </View>
      </ScreenErrorBoundary>
    )
  }

  // === BUSINESS PROFILE LAYOUT ===
  if (profile.is_business && FEATURES.BUSINESS_ACCOUNT) {
    const businessImages = profile.business_images ?? []
    const businessHours = profile.business_hours as Record<string, string> | null
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    const dayLabels: Record<string, string> = {
      monday: t('days.monShort'),
      tuesday: t('days.tueShort'),
      wednesday: t('days.wedShort'),
      thursday: t('days.thuShort'),
      friday: t('days.friShort'),
      saturday: t('days.satShort'),
      sunday: t('days.sunShort'),
    }
    const hasContactInfo = profile.business_phone || profile.business_website || businessHours

    return (
      <ScreenErrorBoundary screenName="PublicProfile">
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <BackButton />
          <Text style={[s.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {profile.business_name || profile.name}
          </Text>
          <View style={{ flex: 1 }} />
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadProfile() }} tintColor={colors.primary} />}>
          {/* 1. Hero: Business Images Carousel */}
          {businessImages.length > 0 ? (
            <View style={bs.heroWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={heroImageWidth + 12}
                decelerationRate="fast"
                style={bs.heroCarousel}
                contentContainerStyle={bs.heroCarouselContent}
              >
                {businessImages.map((uri, idx) => (
                  <Image
                    key={`biz-img-${idx}`}
                    source={{ uri }}
                    style={[bs.heroImage, { width: heroImageWidth }]}
                    contentFit="cover"
                    transition={200}
                  />
                ))}
              </ScrollView>
              {businessImages.length > 1 && (
                <View style={bs.imageCountBadge}>
                  <Camera size={12} color={colors.primaryForeground} />
                  <Text style={[bs.imageCountText, { color: colors.primaryForeground }]}>{businessImages.length}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[bs.heroPlaceholder, { backgroundColor: colors.muted }]}>
              <Building2 size={48} color={colors.mutedForeground} />
              <Text style={[bs.heroPlaceholderText, { color: colors.mutedForeground }]}>
                {t('business.noImages')}
              </Text>
            </View>
          )}

          {/* 2. Business Info Card */}
          <View style={[bs.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={bs.infoCardHeader}>
              <Avatar url={profile.avatar_url} name={profile.business_name || profile.name} size={56} borderColor={colors.primary} borderWidth={2} />
              <View style={bs.infoCardHeaderText}>
                <Text style={[bs.businessName, { color: colors.foreground }]} numberOfLines={2}>
                  {profile.business_name || profile.name}
                </Text>
                {profile.business_category && (
                  <View style={[bs.categoryBadge, { backgroundColor: `${colors.primary}18` }]}>
                    <Text style={[bs.categoryBadgeText, { color: colors.primary }]}>
                      {profile.business_category}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* PRH Verified Trust Badge */}
            {profile.business_vat_id && (
              <View style={[bs.prhBadge, { backgroundColor: `${colors.primary}12` }]}>
                <BadgeCheck size={16} color={colors.primary} />
                <Text style={[bs.prhBadgeText, { color: colors.primary }]}>
                  {t('business.prhVerified')}
                </Text>
                <Text style={[bs.prhVatText, { color: colors.mutedForeground }]}>
                  {profile.business_vat_id}
                </Text>
              </View>
            )}

            {/* Star rating + review count */}
            {avgRating !== null && (
              <View style={bs.ratingRow}>
                <StarRating rating={Math.round(avgRating)} size={16} />
                <Text style={[bs.ratingText, { color: colors.foreground }]}>
                  {avgRating}
                </Text>
                <Text style={[bs.reviewCountText, { color: colors.mutedForeground }]}>
                  ({totalReviewCount} {totalReviewCount === 1
                    ? t('profile.reviewCountSingular')
                    : t('profile.reviewCount')})
                </Text>
              </View>
            )}

            {/* Business description */}
            {profile.business_description && (
              <Text style={[bs.businessDescription, { color: colors.foreground }]}>
                {profile.business_description}
              </Text>
            )}

            {/* Neighborhood */}
            {profile.naapurusto && (
              <View style={bs.nhRow}>
                <MapPin size={14} color={colors.primary} />
                <Text style={[bs.nhText, { color: colors.primary }]}>{profile.naapurusto}</Text>
              </View>
            )}
          </View>

          {/* Action buttons */}
          <View style={s.actions}>
            <Pressable onPress={handleFollow} style={({ pressed }) => [s.followBtn, { backgroundColor: isFollowing ? colors.muted : colors.primary }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={isFollowing ? t('profile.unfollow') : t('profile.follow')}>
              {isFollowing ? (
                <UserMinus size={16} color={colors.foreground} />
              ) : (
                <UserPlus size={16} color={colors.primaryForeground} />
              )}
              <Text style={[s.followBtnText, { color: isFollowing ? colors.foreground : colors.primaryForeground }]}>
                {isFollowing ? t('profile.unfollow') : t('profile.follow')}
              </Text>
            </Pressable>
            <Pressable onPress={handleMessage} disabled={creatingConversation} style={({ pressed }) => [s.messageBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: creatingConversation ? 0.5 : pressed ? 0.7 : 1 }]} accessibilityRole="button" accessibilityLabel={t('profile.sendMessage')}>
              <MessageCircle size={16} color={colors.foreground} />
              <Text style={[s.messageBtnText, { color: colors.foreground }]}>{t('profile.sendMessage')}</Text>
            </Pressable>
          </View>

          {/* Write Review button */}
          {currentUserId && hasTransaction && !hasExistingReview && (
            <Pressable onPress={() => setShowReviewModal(true)} style={({ pressed }) => [s.reviewBtn, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.7 }]}>
              <PenLine size={16} color={colors.pro} />
              <Text style={[s.reviewBtnText, { color: colors.foreground }]}>{t('profile.writeReview')}</Text>
            </Pressable>
          )}

          {/* Stats row */}
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
              <Text style={[s.statNum, { color: colors.foreground }]}>{completedTransactions > 0 ? completedTransactions : '\u2013'}</Text>
              <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.completedTransactions')}</Text>
            </View>
          </View>

          {/* 3. Location Card */}
          {(profile.business_lat != null && profile.business_lng != null) && (
            <View style={[bs.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={bs.locationCardHeader}>
                <MapPin size={18} color={colors.primary} />
                <Text style={[bs.locationCardTitle, { color: colors.foreground }]}>
                  {t('business.location')}
                </Text>
              </View>
              {profile.naapurusto && (
                <Text style={[bs.locationAddress, { color: colors.foreground }]}>
                  {profile.naapurusto}
                </Text>
              )}
              <PressableOpacity
                style={[bs.mapButton, { backgroundColor: `${colors.primary}12` }]}
                onPress={() => {
                  const url = `https://www.google.com/maps/search/?api=1&query=${profile.business_lat},${profile.business_lng}`
                  Linking.openURL(url).catch(() => {})
                }}
              >
                <MapPin size={16} color={colors.primary} />
                <Text style={[bs.mapButtonText, { color: colors.primary }]}>
                  {t('business.showOnMap')}
                </Text>
              </PressableOpacity>
            </View>
          )}

          {/* 4. Contact Card */}
          {hasContactInfo && (
            <View style={[bs.contactCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[bs.contactCardTitle, { color: colors.foreground }]}>
                {t('business.contactInfo')}
              </Text>

              {profile.business_phone && (
                <PressableOpacity
                  style={bs.contactRow}
                  onPress={() => Linking.openURL(`tel:${profile.business_phone}`).catch(() => {})}
                >
                  <View style={[bs.contactIconWrap, { backgroundColor: `${colors.primary}12` }]}>
                    <Phone size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[bs.contactLabel, { color: colors.mutedForeground }]}>
                      {t('business.phone')}
                    </Text>
                    <Text style={[bs.contactValue, { color: colors.primary }]}>{profile.business_phone}</Text>
                  </View>
                </PressableOpacity>
              )}

              {profile.business_website && (
                <PressableOpacity
                  style={bs.contactRow}
                  onPress={() => {
                    const url = profile.business_website!.startsWith('http') ? profile.business_website! : `https://${profile.business_website}`
                    Linking.openURL(url).catch(() => {})
                  }}
                >
                  <View style={[bs.contactIconWrap, { backgroundColor: `${colors.primary}12` }]}>
                    <Globe size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[bs.contactLabel, { color: colors.mutedForeground }]}>
                      {t('business.website')}
                    </Text>
                    <Text style={[bs.contactValue, { color: colors.primary }]} numberOfLines={1}>
                      {profile.business_website}
                    </Text>
                  </View>
                </PressableOpacity>
              )}

              {businessHours && Object.keys(businessHours).length > 0 && (
                <View style={bs.hoursSection}>
                  <View style={bs.contactRow}>
                    <View style={[bs.contactIconWrap, { backgroundColor: `${colors.primary}12` }]}>
                      <Clock size={16} color={colors.primary} />
                    </View>
                    <Text style={[bs.contactLabel, { color: colors.mutedForeground }]}>
                      {t('business.hours')}
                    </Text>
                  </View>
                  <View style={bs.hoursGrid}>
                    {dayOrder.map(day => {
                      const value = businessHours[day]
                      if (!value) return null
                      return (
                        <View key={day} style={bs.hoursRow}>
                          <Text style={[bs.hoursDay, { color: colors.foreground }]}>
                            {dayLabels[day] ?? day}
                          </Text>
                          <Text style={[bs.hoursValue, { color: colors.mutedForeground }]}>
                            {value}
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* 5. Ilmoitukset — Business posts */}
          <View style={bs.sectionHeader}>
            <Text style={[bs.sectionTitle, { color: colors.foreground }]}>
              {t('profile.listings')}
            </Text>
            <Text style={[bs.sectionCount, { color: colors.mutedForeground }]}>
              {postCount}
            </Text>
          </View>
          <View style={s.tabContent}>
            {posts.length === 0 ? (
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.noPosts')}</Text>
            ) : (
              posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))
            )}
          </View>

          {/* 6. Reviews */}
          <View style={bs.sectionHeader}>
            <Text style={[bs.sectionTitle, { color: colors.foreground }]}>
              {t('profile.reviews')}
            </Text>
            <Text style={[bs.sectionCount, { color: colors.mutedForeground }]}>
              {totalReviewCount}
            </Text>
          </View>

          {/* Rating Summary Card (same as non-business) */}
          {totalReviewCount > 0 && (
            <View style={[s.ratingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
                      <Text style={[s.ratingBarLabel, { color: colors.mutedForeground }]}>{star}{'\u2605'}</Text>
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

          {/* Block / Report */}
          {currentUserId && currentUserId !== userId && (
            <View style={s.dangerActions}>
              <Pressable onPress={handleBlock} style={({ pressed }) => [s.dangerBtn, { backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}>
                <ShieldBan size={18} color={isBlocked ? colors.destructive : colors.mutedForeground} />
                <Text style={[s.dangerBtnText, { color: isBlocked ? colors.destructive : colors.mutedForeground }]}>
                  {isBlocked ? t('post.unblock') : t('post.block')}
                </Text>
              </Pressable>
              <Pressable onPress={handleReport} style={({ pressed }) => [s.dangerBtn, { backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}>
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
                  const avg = revsList.length > 0 ? (revsList as any[]).reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0) / revsList.length : 0
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
      </ScreenErrorBoundary>
    )
  }

  // === PERSONAL PROFILE LAYOUT (existing) ===
  return (
    <ScreenErrorBoundary screenName="PublicProfile">
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <BackButton />
        <Text style={[s.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{profile.name}</Text>
        <View style={{ flex: 1 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadProfile() }} tintColor={colors.primary} />}>
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
            <Pressable onPress={handleFollow} style={({ pressed }) => [s.followBtn, { backgroundColor: isFollowing ? colors.muted : colors.primary }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={isFollowing ? t('profile.unfollow') : t('profile.follow')}>
              {isFollowing ? (
                <UserMinus size={16} color={colors.foreground} />
              ) : (
                <UserPlus size={16} color={colors.primaryForeground} />
              )}
              <Text style={[s.followBtnText, { color: isFollowing ? colors.foreground : colors.primaryForeground }]}>
                {isFollowing ? t('profile.unfollow') : t('profile.follow')}
              </Text>
            </Pressable>
            <Pressable onPress={handleMessage} disabled={creatingConversation} style={({ pressed }) => [s.messageBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: creatingConversation ? 0.5 : pressed ? 0.7 : 1 }]} accessibilityRole="button" accessibilityLabel={t('profile.sendMessage')}>
              <MessageCircle size={16} color={colors.foreground} />
              <Text style={[s.messageBtnText, { color: colors.foreground }]}>{t('profile.sendMessage')}</Text>
            </Pressable>
          </View>

          {/* Write Review button — only if user has had a transaction and hasn't reviewed yet */}
          {currentUserId && hasTransaction && !hasExistingReview && (
            <Pressable onPress={() => setShowReviewModal(true)} style={({ pressed }) => [s.reviewBtn, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={t('profile.writeReview')}>
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
              <Zap size={12} color={colors.pro} fill={colors.pro} />
            </View>
            <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.points')}</Text>
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
                <PressableOpacity key={post.id} onPress={() => router.push(`/post/${post.id}` as any)} style={s.recentPostThumb}>
                  {post.image_url ? (
                    <ImageWithFallback uri={post.image_url} style={s.recentPostImg} contentFit="cover" />
                  ) : (
                    <View style={[s.recentPostImg, { backgroundColor: colors.muted }]}>
                      <Text style={[s.recentPostImgPlaceholder, { color: colors.mutedForeground }]} numberOfLines={1}>{post.title}</Text>
                    </View>
                  )}
                </PressableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Tabs */}
        <View style={[s.tabRow, { borderBottomColor: colors.border }]}>
          <PressableOpacity onPress={() => setActiveTab('posts')} style={[s.tab, activeTab === 'posts' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'posts' ? colors.primary : colors.mutedForeground }]}>{t('profile.posts')}</Text>
          </PressableOpacity>
          <PressableOpacity onPress={() => setActiveTab('reviews')} style={[s.tab, activeTab === 'reviews' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'reviews' ? colors.primary : colors.mutedForeground }]}>{t('profile.reviews')}</Text>
          </PressableOpacity>
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
            <Pressable onPress={handleBlock} style={({ pressed }) => [s.dangerBtn, { backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}>
              <ShieldBan size={18} color={isBlocked ? colors.destructive : colors.mutedForeground} />
              <Text style={[s.dangerBtnText, { color: isBlocked ? colors.destructive : colors.mutedForeground }]}>
                {isBlocked ? t('post.unblock') : t('post.block')}
              </Text>
            </Pressable>
            <Pressable onPress={handleReport} style={({ pressed }) => [s.dangerBtn, { backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}>
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
                const avg = revsList.length > 0 ? (revsList as any[]).reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0) / revsList.length : 0
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
    </ScreenErrorBoundary>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi, maxWidth: 250, lineHeight: 28 },
  content: { padding: 16, gap: 16, paddingBottom: 100 },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  bigAvatar: { width: 80, height: 80, borderRadius: 40 },
  bigAvatarFb: { alignItems: 'center', justifyContent: 'center' },
  bigAvatarInit: { fontSize: 32, fontWeight: '700', lineHeight: 44 },
  profileName: { fontSize: 20, fontWeight: '700', fontFamily: fonts.headingSemi, lineHeight: 28 },
  nhRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nhText: { fontSize: 14, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 20 },
  bio: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16, fontFamily: fonts.body },
  badgesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 14 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  proText: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%', paddingHorizontal: 16 },
  followBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12,
  },
  followBtnText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 20 },
  messageBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
  },
  messageBtnText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 20 },
  statsRow: { flexDirection: 'row', borderRadius: 12, padding: 16, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { fontSize: 20, fontWeight: '700', fontFamily: fonts.heading, lineHeight: 26 },
  statLabel: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 0.3 },
  statDiv: { width: 1, alignSelf: 'stretch' as const },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', minHeight: 44 },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 20 },
  tabContent: { gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 24, fontFamily: fonts.body, lineHeight: 20 },
  reviewCard: { borderRadius: 12, padding: 16, gap: 8 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reviewAvatar: { width: 32, height: 32, borderRadius: 16 },
  reviewName: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 18 },
  reviewTime: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14 },
  reviewComment: { fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  dangerActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  dangerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 16, borderRadius: 12,
  },
  dangerBtnText: { fontSize: 14, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 20 },
  reviewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, width: '100%', paddingHorizontal: 16,
  },
  reviewBtnText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 20 },
  notFound: { fontSize: 16, textAlign: 'center', marginTop: 100, fontFamily: fonts.body, lineHeight: 22 },
  // Rating summary card
  ratingCard: { borderRadius: 12, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  ratingCardTitle: { fontSize: 14, fontWeight: '700', fontFamily: fonts.headingSemi, lineHeight: 22 },
  ratingOverview: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ratingStarsCol: { alignItems: 'center', gap: 4 },
  ratingBigNum: { fontSize: 16, fontWeight: '700', fontFamily: fonts.heading, lineHeight: 22 },
  ratingBars: { gap: 6 },
  ratingBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ratingBarLabel: { fontSize: 12, fontWeight: '600', width: 24, textAlign: 'right', fontFamily: fonts.bodySemi, lineHeight: 16 },
  ratingBarTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  ratingBarFill: { height: 8, borderRadius: 4 },
  ratingBarCount: { fontSize: 12, fontWeight: '500', width: 20, fontFamily: fonts.body, lineHeight: 16 },
  // Verification card
  verificationCard: { borderRadius: 12, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  verifyText: { fontSize: 14, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 20 },
  // Activity summary
  activitySummaryCard: { borderRadius: 12, padding: 16, gap: 8, borderWidth: StyleSheet.hairlineWidth },
  activitySummaryTitle: { fontSize: 14, fontWeight: '700', fontFamily: fonts.headingSemi, lineHeight: 22 },
  activitySummaryText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
  recentPostsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  recentPostThumb: { flex: 1 },
  recentPostImg: { height: 60, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  recentPostImgPlaceholder: { fontSize: 11, textAlign: 'center', fontFamily: fonts.body, lineHeight: 14 },
})

// === Business profile styles ===
const bs = StyleSheet.create({
  // Hero carousel
  heroWrapper: {
    marginHorizontal: -16,
  },
  heroCarousel: {
    height: HERO_IMAGE_HEIGHT,
  },
  heroCarouselContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  heroImage: {
    height: HERO_IMAGE_HEIGHT,
    borderRadius: 12,
  },
  heroPlaceholder: {
    height: HERO_IMAGE_HEIGHT,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroPlaceholderText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  imageCountBadge: {
    position: 'absolute',
    bottom: 10,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  imageCountText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // Info card
  infoCard: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoCardHeaderText: {
    flex: 1,
    gap: 8,
  },
  businessName: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    fontFamily: fonts.headingSemi,
    lineHeight: 30,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // PRH badge
  prhBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  prhBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },
  prhVatText: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: fonts.body,
    lineHeight: 16,
  },

  // Rating row
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.heading,
    lineHeight: 22,
  },
  reviewCountText: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: fonts.body,
    lineHeight: 18,
  },

  // Business description
  businessDescription: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: fonts.body,
  },

  // Neighborhood row (inside business card)
  nhRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nhText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },

  // Location card
  locationCard: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  locationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    fontFamily: fonts.headingSemi,
  },
  locationAddress: {
    fontSize: 14,
    lineHeight: 20,
    paddingLeft: 24,
    fontFamily: fonts.body,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  mapButtonText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },

  // Contact card
  contactCard: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  contactCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.headingSemi,
    lineHeight: 22,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  contactValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },

  // Hours
  hoursSection: {
    gap: 12,
  },
  hoursGrid: {
    gap: 4,
    paddingLeft: 48,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  hoursDay: {
    fontSize: 13,
    fontWeight: '600',
    width: 40,
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },
  hoursValue: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: fonts.body,
    lineHeight: 18,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    fontFamily: fonts.headingSemi,
    lineHeight: 24,
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
})
