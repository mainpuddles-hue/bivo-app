import { useState, useCallback, useRef } from 'react'
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet, Alert, useWindowDimensions, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { clearBlockedCache } from '@/lib/blockedUsers'
import {
  MapPin, MessageCircle, UserPlus, UserMinus,
  Crown, PenLine, Clock,
  Phone, Globe, Building2, Camera, BadgeCheck, MoreHorizontal, ChevronLeft,
} from 'lucide-react-native'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo } from '@/lib/format'
import { fonts } from '@/lib/fonts'
import { PublicProfileSkeleton } from '@/components/SkeletonLoaders'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
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
import { useToast } from '@/components/Toast'
import type { Profile, Post, Review, UserBadge } from '@/lib/types'

const HERO_IMAGE_HEIGHT = 200

export default function PublicProfileScreen() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const toast = useToast()
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
  const [fetchError, setFetchError] = useState(false)
  const trust = useTrustLevel(userId)
  const mountedRef = useRef(true)

  const loadProfile = useCallback(async () => {
    if (!userId || !isValidUUID(userId)) { setLoading(false); setRefreshing(false); return }
    try {
    const { getCachedUserId } = await import('@/lib/authCache')
    const cachedId = await getCachedUserId()
    if (!mountedRef.current) return
    if (cachedId) setCurrentUserId(cachedId)

    // If viewing own profile, redirect to profile tab
    if (cachedId && cachedId === userId) {
      router.replace('/(tabs)/profile')
      return
    }

    // Fetch profile
    const { data: p } = await supabase.from('profiles').select('id, name, avatar_url, naapurusto, bio, is_pro, is_business, total_points, business_name, business_phone, business_website, business_lat, business_lng, created_at, profile_visibility, business_hours').eq('id', userId).maybeSingle()
    if (!mountedRef.current) return
    if (!p) { setLoading(false); setRefreshing(false); return }
    // Don't show deleted/anonymized profiles
    if ((p as any).name === '[Poistettu]' || (p as any).name === '[Deleted]') {
      setLoading(false); setRefreshing(false); return
    }
    const prof = p as unknown as Profile

    // Check profile visibility before rendering
    let viewerNeighborhood: string | null = null
    if (cachedId) {
      const { data: viewerProfile } = await (supabase.from('profiles') as any)
        .select('naapurusto')
        .eq('id', cachedId)
        .maybeSingle()
      viewerNeighborhood = viewerProfile?.naapurusto ?? null
    }
    if (!isProfileVisible(
      (prof as any).profile_visibility,
      prof.naapurusto,
      viewerNeighborhood,
      cachedId === userId,
    )) {
      setProfileHidden(true)
      setLoading(false)
      setRefreshing(false)
      return
    }

    if (!mountedRef.current) return
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
    if (!mountedRef.current) return
    setPostCount(postsRes.count ?? 0)
    setFollowerCount(followersRes.count ?? 0)
    setFollowingCount(followingRes.count ?? 0)

    // Check follow/block status + transaction history for reviews
    if (cachedId) {
      const [followSettled, blockSettled, convSettled, existingReviewSettled] = await Promise.allSettled([
        supabase.from('user_follows').select('id').eq('follower_id', cachedId).eq('followed_id', userId).maybeSingle(),
        supabase.from('blocked_users').select('id').eq('blocker_id', cachedId).eq('blocked_id', userId).maybeSingle(),
        // Check if there's been a conversation (transaction proxy) between users
        supabase.from('conversations').select('id').or(
          `and(user1_id.eq.${cachedId},user2_id.eq.${userId}),and(user1_id.eq.${userId},user2_id.eq.${cachedId})`
        ).maybeSingle(),
        // Check for existing review
        supabase.from('reviews').select('id').eq('reviewer_id', cachedId).eq('reviewed_id', userId).maybeSingle(),
      ])
      const followRes = followSettled.status === 'fulfilled' ? followSettled.value : { data: null }
      const blockRes = blockSettled.status === 'fulfilled' ? blockSettled.value : { data: null }
      const convRes = convSettled.status === 'fulfilled' ? convSettled.value : { data: null }
      const existingReviewRes = existingReviewSettled.status === 'fulfilled' ? existingReviewSettled.value : { data: null }
      if (!mountedRef.current) return
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
      .limit(200)
    if (!mountedRef.current) return
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
    if (!mountedRef.current) return
    setCompletedTransactions(txCount ?? 0)

    // Badges
    const { data: bdg } = await supabase.from('user_badges').select('badge_type').eq('user_id', userId)
    if (!mountedRef.current) return
    setBadges((bdg ?? []) as UserBadge[])

    // Public posts
    const { data: userPosts } = await supabase
      .from('posts')
      .select('id, type, title, created_at, image_url, like_count, comment_count, location, user_id, description, is_pro_listing, tags, daily_fee, is_active, updated_at, event_date')
      .eq('user_id', userId)
      .eq('is_active', true)
      .or('type.neq.tapahtuma,event_date.is.null,event_date.gte.now()')
      .order('created_at', { ascending: false })
      .limit(20)
    if (!mountedRef.current) return
    setPosts((userPosts ?? []) as unknown as Post[])

    } catch (err) {
      if (__DEV__) console.error('[profile] loadProfile error:', err)
      if (mountedRef.current) setFetchError(true)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [userId, supabase, router])

  useFocusEffect(useCallback(() => {
    mountedRef.current = true
    loadProfile()
    return () => { mountedRef.current = false }
  }, [loadProfile]))

  const followingRef = useRef(false)
  const blockingRef = useRef(false)
  const [creatingConversation, setCreatingConversation] = useState(false)
  const handleFollow = useCallback(async () => {
    if (!currentUserId) { router.push('/(auth)/login'); return }
    if (followingRef.current) return
    followingRef.current = true
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} // Intentional: haptics unavailable on some platforms
    const wasFollowing = isFollowing
    try {
      if (wasFollowing) {
        setIsFollowing(false)
        setFollowerCount(c => c - 1)
        const { error } = await (supabase.from('user_follows') as any).delete().eq('follower_id', currentUserId).eq('followed_id', userId)
        if (error) { setIsFollowing(true); setFollowerCount(c => c + 1) }
      } else {
        setIsFollowing(true)
        setFollowerCount(c => c + 1)
        const { error } = await (supabase.from('user_follows') as any).insert({ follower_id: currentUserId, followed_id: userId })
        if (error) {
          // Duplicate key = already following
          if (error.code === '23505') { setIsFollowing(true) }
          else { setIsFollowing(false); setFollowerCount(c => c - 1) }
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
          } catch (err: any) { if (__DEV__) console.warn('[profile] notification insert failed:', err?.message) }
        }
      }
    } finally {
      followingRef.current = false
    }
  }, [currentUserId, isFollowing, userId, supabase, router, t])

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
          toast.show({ message: t('messages.conversationCreateFailed'), type: 'error' }); return
        }
        if (insertError) { if (__DEV__) console.log('[conv] create error:', JSON.stringify(insertError)); toast.show({ message: insertError.message || t('messages.conversationCreateFailed'), type: 'error' }); return }
        if (!newConv) { toast.show({ message: t('messages.conversationCreateFailed'), type: 'error' }); return }
        router.push(`/messages/${newConv.id}`)
      }
    } finally {
      setCreatingConversation(false)
    }
  }, [creatingConversation, currentUserId, userId, supabase, router, t, toast])

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
            if (blockingRef.current) return
            blockingRef.current = true
            try {
            if (isBlocked) {
              setIsBlocked(false)
              try {
                await (supabase.from('blocked_users') as any).delete().eq('blocker_id', currentUserId).eq('blocked_id', userId)
                clearBlockedCache()
                await AsyncStorage.setItem('bivo_blocked_changed', Date.now().toString())
                toast.show({ message: t('profile.unblocked'), type: 'success' })
              } catch (err) { setIsBlocked(true); if (__DEV__) console.warn('[profile] unblock failed:', err); toast.show({ message: t('common.error'), type: 'error' }) }
            } else {
              setIsBlocked(true)
              try {
                await (supabase.from('blocked_users') as any).insert({ blocker_id: currentUserId, blocked_id: userId })
                clearBlockedCache()
                await AsyncStorage.setItem('bivo_blocked_changed', Date.now().toString())
                toast.show({ message: t('profile.blocked'), type: 'success' })
              } catch (err) { setIsBlocked(false); if (__DEV__) console.warn('[profile] block failed:', err); toast.show({ message: t('common.error'), type: 'error' }) }
            }
            } finally { blockingRef.current = false }
          },
        },
      ]
    )
  }, [currentUserId, isBlocked, userId, profile, supabase, t, router, toast])

  const handleReport = useCallback(() => {
    if (!currentUserId) { router.push('/(auth)/login'); return }
    setShowReportModal(true)
  }, [currentUserId, router])

  const handleOptions = useCallback(() => {
    Alert.alert(
      profile?.name ?? '',
      undefined,
      [
        ...(currentUserId && currentUserId !== userId ? [
          { text: isBlocked ? (t('post.unblock') ?? 'Unblock') : t('post.block'), style: 'destructive' as const, onPress: handleBlock },
          { text: t('post.report'), style: 'destructive' as const, onPress: handleReport },
        ] : []),
        { text: t('common.cancel'), style: 'cancel' as const },
      ],
    )
  }, [profile, currentUserId, userId, isBlocked, t, handleBlock, handleReport])

  // --- Monochrome bar header (mockup 27) ---
  const renderBar = (title: string) => (
    <View style={[s.bar, { paddingTop: insets.top + 16 }]}>
      <PressableOpacity
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        style={[s.barCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <ChevronLeft size={20} color={colors.foreground} strokeWidth={1.8} />
      </PressableOpacity>
      <View style={s.barCenter}>
        <Text style={[s.barTitle, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
      </View>
      {currentUserId && currentUserId !== userId ? (
        <Pressable
          onPress={handleOptions}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('post.report')}
          style={({ pressed }) => [s.barCircle, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <MoreHorizontal size={16} color={colors.foreground} strokeWidth={2.2} />
        </Pressable>
      ) : (
        <View style={s.barCirclePlaceholder} />
      )}
    </View>
  )

  // --- Loading state ---
  if (loading) {
    return (
      <ScreenErrorBoundary screenName="PublicProfile">
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {renderBar(t('profile.title'))}
        <PublicProfileSkeleton />
      </View>
      </ScreenErrorBoundary>
    )
  }

  // --- Profile hidden state ---
  if (profileHidden) {
    return (
      <ScreenErrorBoundary screenName="PublicProfile">
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {renderBar(t('profile.title'))}
        <Text style={[s.notFound, { color: colors.mutedForeground }]}>{t('profile.profileHidden') ?? 'Profiili ei ole julkinen'}</Text>
      </View>
      </ScreenErrorBoundary>
    )
  }

  // --- Not found state ---
  if (!profile) {
    return (
      <ScreenErrorBoundary screenName="PublicProfile">
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {renderBar(t('profile.title'))}
        <View style={{ alignItems: 'center', paddingTop: 80, gap: 12 }}>
          <Text style={[s.notFound, { color: colors.mutedForeground }]}>
            {fetchError ? t('common.error') : t('profile.notFound')}
          </Text>
          {fetchError && (
            <Pressable
              onPress={() => { setFetchError(false); setLoading(true); loadProfile() }}
              style={({ pressed }) => ({ backgroundColor: colors.foreground, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, minHeight: 44, justifyContent: 'center' as const, opacity: pressed ? 0.7 : 1 })}
              hitSlop={8}
            >
              <Text style={{ color: colors.background, fontFamily: fonts.bodySemi, fontSize: 13 }}>{t('common.retry')}</Text>
            </Pressable>
          )}
        </View>
      </View>
      </ScreenErrorBoundary>
    )
  }

  // --- Review refresher (shared between personal + business) ---
  // Fetches only the latest review and prepends it to the existing list
  // instead of refetching all reviews.
  const refreshReviews = () => {
    setHasExistingReview(true)
    supabase
      .from('reviews')
      .select('id, rating, comment, created_at, reviewer:profiles!reviews_reviewer_id_fkey(id, name, avatar_url)')
      .eq('reviewed_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!mountedRef.current) return
        if (data && data.length > 0) {
          const newReview = data[0] as unknown as Review
          setReviews(prev => {
            // Avoid duplicates if the review already exists
            if (prev.some(r => r.id === newReview.id)) return prev
            const updated = [newReview, ...prev]
            // Recompute stats from the updated list
            setTotalReviewCount(updated.length)
            const avg = updated.length > 0
              ? (updated as any[]).reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0) / updated.length
              : 0
            setAvgRating(Math.round(avg * 10) / 10)
            const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
            for (const r of updated as any[]) {
              const star = Math.min(5, Math.max(1, Math.round(r.rating)))
              dist[star] = (dist[star] ?? 0) + 1
            }
            setRatingDistribution(dist)
            return updated
          })
        }
      })
  }

  // --- Review card renderer ---
  const renderReviewCard = (rev: Review) => (
    <View key={rev.id} style={[s.reviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.reviewHeader}>
        <Avatar url={rev.reviewer?.avatar_url} name={rev.reviewer?.name} size={28} />
        <View style={{ flex: 1 }}>
          <Text style={[s.reviewName, { color: colors.foreground }]} numberOfLines={1}>{rev.reviewer?.name ?? t('common.user')}</Text>
        </View>
        <StarRating rating={rev.rating} size={11} />
      </View>
      {rev.comment && (
        <Text style={[s.reviewComment, { color: colors.foreground }]}>{rev.comment}</Text>
      )}
    </View>
  )

  // --- Listing card renderer (2-column grid) ---
  const renderListingGrid = () => {
    if (posts.length === 0) {
      return <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.noPosts')}</Text>
    }
    // Show in 2-column grid for first 4, then full-width PostCard for the rest
    const gridPosts = posts.slice(0, 4)
    const remainingPosts = posts.slice(4)
    return (
      <>
        <View style={s.listingGrid}>
          {gridPosts.map((post) => (
            <Pressable
              key={post.id}
              onPress={() => router.push(`/post/${post.id}`)}
              style={({ pressed }) => [s.listingGridCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={post.title}
            >
              {post.image_url ? (
                <Image
                  source={{ uri: post.image_url }}
                  style={s.listingGridImage}
                  contentFit="cover"
                  transition={200}
                  accessible={false}
                />
              ) : (
                <View style={[s.listingGridImage, { backgroundColor: colors.muted }]} />
              )}
              <Text style={[s.listingGridTitle, { color: colors.foreground }]} numberOfLines={1}>{post.title}</Text>
            </Pressable>
          ))}
        </View>
        {remainingPosts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </>
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
        {renderBar(profile.business_name || profile.name)}

        <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadProfile() }} tintColor={colors.foreground} />}>
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
                    accessibilityLabel={`${profile.business_name ?? profile.name} ${idx + 1}/${businessImages.length}`}
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
              <Avatar url={profile.avatar_url} name={profile.business_name || profile.name} size={56} borderColor={colors.card} borderWidth={2} />
              <View style={bs.infoCardHeaderText}>
                <Text style={[bs.businessName, { color: colors.foreground }]} numberOfLines={2}>
                  {profile.business_name || profile.name}
                </Text>
                {profile.business_category && (
                  <View style={[bs.categoryBadge, { backgroundColor: colors.muted }]}>
                    <Text style={[bs.categoryBadgeText, { color: colors.mutedForeground }]}>
                      {profile.business_category}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* PRH Verified Trust Badge */}
            {profile.business_vat_id && (
              <View style={[bs.prhBadge, { backgroundColor: colors.muted }]}>
                <BadgeCheck size={16} color={colors.mutedForeground} />
                <Text style={[bs.prhBadgeText, { color: colors.mutedForeground }]}>
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
                <MapPin size={14} color={colors.mutedForeground} />
                <Text style={[bs.nhText, { color: colors.mutedForeground }]}>{profile.naapurusto}</Text>
              </View>
            )}
          </View>

          {/* Action buttons — mockup 27 style */}
          <View style={s.actionRow}>
            <Pressable
              onPress={handleMessage}
              disabled={creatingConversation}
              style={({ pressed }) => [s.messageBtn, { backgroundColor: colors.foreground, opacity: creatingConversation ? 0.5 : pressed ? 0.85 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('profile.sendMessage')}
            >
              <MessageCircle size={16} color={colors.primaryForeground} />
              <Text style={[s.messageBtnText, { color: colors.primaryForeground }]}>{t('profile.sendMessage')}</Text>
            </Pressable>
            <Pressable
              onPress={handleFollow}
              style={({ pressed }) => [s.followBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={isFollowing ? t('profile.unfollow') : t('profile.follow')}
            >
              {isFollowing ? (
                <UserMinus size={16} color={colors.foreground} />
              ) : (
                <UserPlus size={16} color={colors.foreground} />
              )}
              <Text style={[s.followBtnText, { color: colors.foreground }]}>
                {isFollowing ? t('profile.unfollow') : t('profile.follow')}
              </Text>
            </Pressable>
          </View>

          {/* Write Review button */}
          {currentUserId && hasTransaction && !hasExistingReview && (
            <PressableOpacity onPress={() => setShowReviewModal(true)} style={[s.reviewBtn, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={t('profile.writeReview')}>
              <PenLine size={16} color={colors.foreground} />
              <Text style={[s.reviewBtnText, { color: colors.foreground }]}>{t('profile.writeReview')}</Text>
            </PressableOpacity>
          )}

          {/* Stats row — 3-column cards (mockup 27) */}
          <View style={s.statsGrid}>
            {([
              [avgRating ?? '\u2013', t('profile.avgRating')],
              [postCount > 0 ? postCount : '\u2013', t('profile.posts')],
              [followerCount > 0 ? followerCount : '\u2013', t('profile.followers')],
            ] as const).map(([num, label], i) => (
              <View key={i} style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.statNum, { color: colors.foreground }]}>{num}</Text>
                <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
              </View>
            ))}
          </View>

          {/* 3. Location Card */}
          {(profile.business_lat != null && profile.business_lng != null) && (
            <View style={[bs.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={bs.locationCardHeader}>
                <MapPin size={18} color={colors.foreground} />
                <Text style={[bs.locationCardTitle, { color: colors.foreground }]}>
                  {t('business.location')}
                </Text>
              </View>
              {profile.naapurusto && (
                <Text style={[bs.locationAddress, { color: colors.mutedForeground }]}>
                  {profile.naapurusto}
                </Text>
              )}
              <PressableOpacity
                style={[bs.mapButton, { backgroundColor: colors.foreground }]}
                onPress={() => {
                  const url = `https://www.google.com/maps/search/?api=1&query=${profile.business_lat},${profile.business_lng}`
                  Linking.openURL(url).catch((e: any) => { if (__DEV__) console.warn('[profile] open maps URL failed:', e) })
                }}
              >
                <MapPin size={16} color={colors.primaryForeground} />
                <Text style={[bs.mapButtonText, { color: colors.primaryForeground }]}>
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
                  onPress={() => Linking.openURL(`tel:${profile.business_phone}`).catch((e: any) => { if (__DEV__) console.warn('[profile] open phone URL failed:', e) })}
                >
                  <View style={[bs.contactIconWrap, { backgroundColor: colors.muted }]}>
                    <Phone size={16} color={colors.mutedForeground} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[bs.contactLabel, { color: colors.mutedForeground }]}>
                      {t('business.phone')}
                    </Text>
                    <Text style={[bs.contactValue, { color: colors.foreground }]}>{profile.business_phone}</Text>
                  </View>
                </PressableOpacity>
              )}

              {profile.business_website && (
                <PressableOpacity
                  style={bs.contactRow}
                  onPress={() => {
                    const raw = profile.business_website!
                    const url = raw.startsWith('https://') || raw.startsWith('http://') ? raw : `https://${raw}`
                    try { const u = new URL(url); if (['http:', 'https:'].includes(u.protocol)) Linking.openURL(url).catch((e: any) => { if (__DEV__) console.warn('[profile] open website URL failed:', e) }) } catch (e) { if (__DEV__) console.warn('[profile] invalid website URL:', e) }
                  }}
                >
                  <View style={[bs.contactIconWrap, { backgroundColor: colors.muted }]}>
                    <Globe size={16} color={colors.mutedForeground} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[bs.contactLabel, { color: colors.mutedForeground }]}>
                      {t('business.website')}
                    </Text>
                    <Text style={[bs.contactValue, { color: colors.foreground }]} numberOfLines={1}>
                      {profile.business_website}
                    </Text>
                  </View>
                </PressableOpacity>
              )}

              {businessHours && Object.keys(businessHours).length > 0 && (
                <View style={bs.hoursSection}>
                  <View style={bs.contactRow}>
                    <View style={[bs.contactIconWrap, { backgroundColor: colors.muted }]}>
                      <Clock size={16} color={colors.mutedForeground} />
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

          {/* 5. Listings section */}
          <View style={s.sectionRow}>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
              {t('profile.listings').toUpperCase()} {'\u00B7'} {postCount}
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

          {/* 6. Reviews section */}
          <View style={s.sectionRow}>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
              {t('profile.reviews').toUpperCase()} {'\u00B7'} {totalReviewCount}
            </Text>
          </View>

          <View style={s.tabContent}>
            {reviews.length === 0 ? (
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.noReviews')}</Text>
            ) : (
              reviews.map(renderReviewCard)
            )}
          </View>
        </ScrollView>

        {userId && <ReviewModal
          visible={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          reviewedUserId={userId}
          onReviewSubmitted={refreshReviews}
        />}

        {userId && <ReportModal
          visible={showReportModal}
          onClose={() => setShowReportModal(false)}
          type="user"
          targetId={userId}
        />}
      </View>
      </ScreenErrorBoundary>
    )
  }

  // === PERSONAL PROFILE LAYOUT (Mockup 27 — Naapurin profiili) ===
  const joinYear = profile.created_at ? new Date(profile.created_at).getFullYear() : ''
  const isVerified = badges.some(b => (b.badge_type as string) === 'verified' || (b.badge_type as string) === 'suomifi')
  const metaParts: string[] = []
  if (profile.naapurusto) metaParts.push(profile.naapurusto)
  if (joinYear) metaParts.push(`${t('profile.memberSince')} ${joinYear}`)
  if (isVerified) metaParts.push(t('profile.verified'))

  return (
    <ScreenErrorBoundary screenName="PublicProfile">
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {renderBar(profile.name)}

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadProfile() }} tintColor={colors.foreground} />}>
        {/* Hero — centered avatar + name (mockup 27) */}
        <View style={s.hero}>
          <View style={[s.avatarRing, { borderColor: colors.card }]}>
            <Avatar url={profile.avatar_url} name={profile.name} size={88} borderColor={colors.card} borderWidth={3} />
          </View>
          <Text style={[s.profileName, { color: colors.foreground }]} numberOfLines={1}>{profile.name}</Text>
          <Text style={[s.profileMeta, { color: colors.mutedForeground }]} numberOfLines={2}>
            {metaParts.join(' \u00B7 ')}
          </Text>

          {/* Star rating row */}
          {avgRating !== null && (
            <View style={s.ratingRow}>
              <StarRating rating={Math.round(avgRating)} size={14} />
              <Text style={[s.ratingCount, { color: colors.mutedForeground }]}>
                ({totalReviewCount})
              </Text>
            </View>
          )}

          {/* Trust badge + Pro badge row */}
          <View style={s.badgesRow}>
            {!trust.loading && <TrustBadge level={trust.level} size="medium" showLabel showExplainer />}
            {profile.is_pro && (
              <View style={[s.badgeChip, { backgroundColor: colors.muted }]}>
                <Crown size={12} color={colors.mutedForeground} />
                <Text style={[s.badgeText, { color: colors.mutedForeground }]}>Pro</Text>
              </View>
            )}
            {badges.map((b) => {
              const cfg = BADGE_ICONS[b.badge_type]
              if (!cfg) return null
              const Icon = cfg.icon
              return (
                <View key={b.badge_type} style={[s.badgeChip, { backgroundColor: colors.muted }]}>
                  <Icon size={12} color={colors.mutedForeground} />
                  <Text style={[s.badgeText, { color: colors.mutedForeground }]}>{t(`badges.${b.badge_type}`)}</Text>
                </View>
              )
            })}
          </View>
        </View>

        {/* Stats row — 3-column cards (mockup 27) */}
        <View style={s.statsGrid}>
          {([
            [postCount > 0 ? postCount : '\u2013', t('profile.posts')],
            [totalReviewCount > 0 ? totalReviewCount : '\u2013', t('profile.reviews')],
            [followerCount > 0 ? followerCount : '\u2013', t('profile.followers')],
          ] as const).map(([num, label], i) => (
            <View key={i} style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.statNum, { color: colors.foreground }]}>{num}</Text>
              <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Action buttons — Viesti full-width + Seuraa (mockup 27) */}
        <View style={s.actionRow}>
          <Pressable
            onPress={handleMessage}
            disabled={creatingConversation}
            style={({ pressed }) => [s.messageBtn, { backgroundColor: colors.foreground, opacity: creatingConversation ? 0.5 : pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('profile.sendMessage')}
          >
            <MessageCircle size={16} color={colors.primaryForeground} />
            <Text style={[s.messageBtnText, { color: colors.primaryForeground }]}>{t('profile.sendMessage')}</Text>
          </Pressable>
          <Pressable
            onPress={handleFollow}
            style={({ pressed }) => [s.followBtn, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={isFollowing ? t('profile.unfollow') : t('profile.follow')}
          >
            {isFollowing ? (
              <UserMinus size={16} color={colors.foreground} />
            ) : (
              <UserPlus size={16} color={colors.foreground} />
            )}
            <Text style={[s.followBtnText, { color: colors.foreground }]}>
              {isFollowing ? t('profile.unfollow') : t('profile.follow')}
            </Text>
          </Pressable>
        </View>

        {/* Write Review button */}
        {currentUserId && hasTransaction && !hasExistingReview && (
          <PressableOpacity onPress={() => setShowReviewModal(true)} style={[s.reviewBtn, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={t('profile.writeReview')}>
            <PenLine size={16} color={colors.foreground} />
            <Text style={[s.reviewBtnText, { color: colors.foreground }]}>{t('profile.writeReview')}</Text>
          </PressableOpacity>
        )}

        {/* Bio */}
        {profile.bio ? (
          <Text style={[s.bio, { color: colors.foreground }]}>{profile.bio}</Text>
        ) : null}

        {/* Pill tabs — Ilmoitukset / Arviot (mockup 27) */}
        <View style={s.pillTabRow}>
          <Pressable
            onPress={() => setActiveTab('posts')}
            style={({ pressed }) => [
              s.pillTab,
              activeTab === 'posts'
                ? { backgroundColor: colors.foreground }
                : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'posts' }}
          >
            <Text style={[s.pillTabText, { color: activeTab === 'posts' ? colors.primaryForeground : colors.foreground }]}>
              {t('profile.posts')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('reviews')}
            style={({ pressed }) => [
              s.pillTab,
              activeTab === 'reviews'
                ? { backgroundColor: colors.foreground }
                : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'reviews' }}
          >
            <Text style={[s.pillTabText, { color: activeTab === 'reviews' ? colors.primaryForeground : colors.foreground }]}>
              {t('profile.reviews')}
            </Text>
          </Pressable>
        </View>

        {/* Posts tab — listing grid (mockup 27) */}
        {activeTab === 'posts' && (
          <View style={s.tabContent}>
            {renderListingGrid()}
          </View>
        )}

        {/* Reviews tab */}
        {activeTab === 'reviews' && (
          <View style={s.tabContent}>
            {reviews.length === 0 ? (
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.noReviews')}</Text>
            ) : (
              reviews.map(renderReviewCard)
            )}
          </View>
        )}
      </ScrollView>

      {/* Review Modal */}
      {userId && <ReviewModal
        visible={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        reviewedUserId={userId}
        onReviewSubmitted={refreshReviews}
      />}

      {/* Report Modal */}
      {userId && <ReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        type="user"
        targetId={userId}
      />}
    </View>
    </ScreenErrorBoundary>
  )
}

// ═══════════════════════════════════════════════
// Styles — Helsinki Monochrome (mockup 27)
// ═══════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1 },

  // ── Bar header (mockup 27) ──
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingBottom: 12,
    gap: 12,
  },
  barCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  barCirclePlaceholder: {
    width: 36,
    height: 36,
  },
  barCenter: {
    flex: 1,
    alignItems: 'center',
  },
  barTitle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.15,
    lineHeight: 20,
  },

  // ── Scroll content ──
  scrollContent: {
    paddingHorizontal: 22,
    paddingBottom: 100,
  },

  // ── Hero (centered) ──
  hero: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 18,
    gap: 4,
  },
  avatarRing: {
    borderRadius: 999,
    borderWidth: 3,
    marginBottom: 12,
    // Subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  profileName: {
    fontSize: 21,
    fontWeight: '600',
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  profileMeta: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 3,
  },

  // ── Rating row ──
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  ratingCount: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },

  // ── Badges row ──
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 8,
  },
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 14,
  },

  // ── Stats 3-column cards (mockup 27) ──
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 22,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.6,
    lineHeight: 26,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 5,
  },

  // ── Action buttons (mockup 27) ──
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  messageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    minHeight: 44,
  },
  messageBtnText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },
  followBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 44,
  },
  followBtnText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 14,
    minHeight: 48,
  },
  reviewBtnText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },

  // ── Bio ──
  bio: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
    marginBottom: 14,
  },

  // ── Section header ──
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
    lineHeight: 14,
  },

  // ── Pill tabs (mockup 27) ──
  pillTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  pillTab: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 999,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillTabText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },

  // ── Tab content ──
  tabContent: {
    gap: 10,
    marginBottom: 14,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
    fontFamily: fonts.body,
    lineHeight: 20,
  },

  // ── Listing grid (2-column, mockup 27) ──
  listingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  listingGridCard: {
    width: '48%' as any,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 44,
  },
  listingGridImage: {
    height: 90,
    width: '100%',
  },
  listingGridTitle: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  // ── Review card (mockup 27) ──
  reviewCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reviewName: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },
  reviewComment: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fonts.body,
  },

  // ── Not found ──
  notFound: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
    fontFamily: fonts.body,
    lineHeight: 22,
  },
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
    borderRadius: 14,
  },
  heroPlaceholder: {
    height: HERO_IMAGE_HEIGHT,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroPlaceholderText: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  imageCountBadge: {
    position: 'absolute',
    bottom: 12,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
  },
  imageCountText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // Info card
  infoCard: {
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    marginTop: 14,
    marginBottom: 14,
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
    letterSpacing: -0.4,
    fontFamily: fonts.heading,
    lineHeight: 32,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 12,
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
    borderRadius: 16,
  },
  prhBadgeText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },
  prhVatText: {
    fontSize: 12,
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
    fontFamily: fonts.heading,
    lineHeight: 22,
  },
  reviewCountText: {
    fontSize: 13,
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
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },

  // Location card
  locationCard: {
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  locationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationCardTitle: {
    fontSize: 16,
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
    borderRadius: 999,
    marginTop: 4,
    minHeight: 48,
  },
  mapButtonText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },

  // Contact card
  contactCard: {
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  contactCardTitle: {
    fontSize: 16,
    fontFamily: fonts.headingSemi,
    lineHeight: 22,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
  },
  contactIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  contactValue: {
    fontSize: 14,
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
    paddingVertical: 4,
  },
  hoursDay: {
    fontSize: 13,
    width: 40,
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },
  hoursValue: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
  },
})
