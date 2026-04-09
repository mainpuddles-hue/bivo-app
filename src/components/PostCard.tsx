import { memo, useState, useMemo, useRef, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, Animated, Share } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import {
  MapPin, Crown, ImageIcon, BadgeCheck, Heart, Zap,
  MessageCircle, Clock, Building2,
  Share2, Bookmark, BookmarkCheck, TrendingUp, MoreHorizontal, User, Flag, EyeOff,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { cardShadow, cardShadowDark } from '@/lib/shadows'
import { CATEGORIES } from '@/lib/constants'
import { CATEGORY_ICON_MAP as ICON_MAP } from '@/lib/categoryIcons'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo, formatPrice } from '@/lib/format'
import { haversineKm } from '@/lib/geo'
import { TrustBadge } from '@/components/TrustBadge'
import { BoostBadge } from '@/components/BoostBadge'
import { computeTrustLevelFromBadges } from '@/lib/trustUtils'
import { isHumanAction } from '@/lib/abuseDetection'
import { FEATURES } from '@/lib/featureFlags'
import { getImageUrl } from '@/lib/imageUtils'
import type { Post, PostType } from '@/lib/types'

const APP_URL = 'https://tackbird.com'

function getExpirationInfo(expiresAt: string | null, t: (key: string, params?: Record<string, string | number>) => string): { label: string; severity: 'urgent' | 'warning' } | null {
  if (!expiresAt) return null
  const now = new Date()
  const expires = new Date(expiresAt)
  if (isNaN(expires.getTime())) return null
  const diffMs = expires.getTime() - now.getTime()
  if (diffMs <= 0) return { label: t('postCard.expired'), severity: 'urgent' }
  const diffHours = diffMs / 3600000
  if (diffHours < 24) return { label: t('postCard.expiresToday'), severity: 'urgent' }
  if (diffHours < 48) return { label: t('postCard.expiresTomorrow'), severity: 'warning' }
  const diffDays = Math.ceil(diffMs / 86400000)
  if (diffDays <= 7) return { label: t('postCard.expiresIn', { count: diffDays }), severity: 'warning' }
  return null
}

interface PostCardProps {
  post: Post
  userLocation?: { latitude: number; longitude: number } | null
  userId?: string | null
  onInteraction?: (postId: string, type: 'view' | 'click' | 'like' | 'save' | 'message' | 'skip' | 'hide') => void
  onHide?: (postId: string) => void
  isNew?: boolean
}

export const PostCard = memo(function PostCard({ post, userLocation, userId, onInteraction, onHide, isNew }: PostCardProps) {
  const { colors, isDark } = useTheme()
  const reduceMotion = useReduceMotion()
  const { t, locale } = useI18n()
  const router = useRouter()
  const supabase = useSupabase()
  const [imgError, setImgError] = useState(false)
  const [liked, setLiked] = useState(post.is_liked ?? false)
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0)
  const [saved, setSaved] = useState(post.is_saved ?? false)
  const likingRef = useRef(false)
  const savingRef = useRef(false)

  // Animated like heart
  const likeAnim = useRef(new Animated.Value(1)).current

  // Sync state when post prop changes (e.g., feed refresh)
  useEffect(() => {
    if (!likingRef.current) {
      if (post.is_liked !== undefined) setLiked(post.is_liked)
      setLikeCount(post.like_count ?? 0)
    }
  }, [post.id, post.is_liked, post.like_count])

  useEffect(() => {
    if (!savingRef.current && post.is_saved !== undefined) {
      setSaved(post.is_saved)
    }
  }, [post.id, post.is_saved])

  // Check if current user has liked/saved this post (only when state not provided)
  useEffect(() => {
    if (!userId) return
    if (post.is_liked !== undefined && post.is_saved !== undefined) return
    let mounted = true

    if (post.is_liked === undefined) {
      supabase.from('post_likes').select('id').eq('post_id', post.id).eq('user_id', userId).maybeSingle()
        .then(({ data }) => { if (data && mounted) setLiked(true) })
    }

    if (post.is_saved === undefined) {
      supabase.from('saved_posts').select('id').eq('post_id', post.id).eq('user_id', userId).maybeSingle()
        .then(({ data }) => { if (data && mounted) setSaved(true) })
    }

    return () => { mounted = false }
  }, [userId, post.id, post.is_liked, post.is_saved, supabase])

  const category = CATEGORIES[post.type as PostType]
  const isPro = post.is_pro_listing
  const isNappaa = post.type === 'nappaa'
  const user = post.user
  const hasImage = post.image_url && !imgError
  const CategoryIcon = category ? ICON_MAP[category.icon] : null
  const isVerified = user?.user_badges?.some(b => b.badge_type === 'verified') ?? false
  const userTrustLevel = computeTrustLevelFromBadges(user?.user_badges)

  const isAnonymous = post.is_anonymous === true
  const isUrgentPost = post.is_urgent && post.expires_at && new Date(post.expires_at).getTime() > Date.now()
  const [showMore, setShowMore] = useState(false)

  const expirationInfo = useMemo(() => getExpirationInfo(post.expires_at, t), [post.expires_at, t])

  // Composite accessibility label — reads full card as one VoiceOver unit
  const a11yLabel = useMemo(() => {
    const parts: string[] = []
    if (category) parts.push(t(`categories.${post.type}`) ?? post.type)
    parts.push(post.title)
    if (post.description) parts.push(post.description.slice(0, 140))
    const authorName = isAnonymous ? t('postCard.anonymousNeighbor') : user?.name
    if (authorName) parts.push(`${t('common.by') ?? ''} ${authorName}`.trim())
    if (post.location) parts.push(post.location)
    if (post.created_at) parts.push(formatTimeAgo(post.created_at, t, locale))
    if (likeCount > 0) parts.push(`${likeCount} ${t('engagement.likes') ?? 'likes'}`)
    if (post.comment_count && post.comment_count > 0) parts.push(`${post.comment_count} ${t('post.comments') ?? 'comments'}`)
    return parts.filter(Boolean).join(', ')
  }, [category, post.type, post.title, post.description, post.location, post.created_at, post.comment_count, isAnonymous, user?.name, likeCount, t, locale])

  // Smooth card entrance animation — fade + slide up (respects Reduce Motion)
  const entranceAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    try {
      Animated.timing(entranceAnim, { toValue: 1, duration: reduceMotion ? 0 : 300, useNativeDriver: true }).start()
    } catch {} // Intentional: animation failure is non-critical
  }, [entranceAnim, reduceMotion])
  const entranceOpacity = entranceAnim
  const entranceTranslateY = entranceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  })

  const distanceText = useMemo(() => {
    if (!userLocation || !post.latitude || !post.longitude) return null
    const dist = haversineKm(userLocation.latitude, userLocation.longitude, post.latitude, post.longitude)
    if (dist < 0.1) return '< 0.1 km'
    return t('postCard.distanceKm', { distance: dist < 10 ? dist.toFixed(1) : Math.round(dist).toString() })
  }, [userLocation, post.latitude, post.longitude, t])

  return (
    <Animated.View style={{ opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
    <Pressable
      accessibilityLabel={a11yLabel}
      accessibilityRole="button"
      accessibilityHint={t('postCard.tapToOpen')}
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
        onInteraction?.(post.id, 'click')
        // Seed posts have fake IDs — don't navigate to detail (would show eternal spinner)
        if (post.is_seed) return
        router.push(`/post/${post.id}`)
      }}
      onLongPress={async () => {
        if (!isHumanAction()) return
        if (!userId) { router.push('/(auth)/login'); return }
        if (post.is_seed) return
        if (savingRef.current) return
        savingRef.current = true
        try {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy) } catch {}

          if (saved) {
            setSaved(false)
            const { error } = await (supabase.from('saved_posts') as any).delete().eq('post_id', post.id).eq('user_id', userId)
            if (error) setSaved(true)
          } else {
            setSaved(true)
            const { error } = await (supabase.from('saved_posts') as any).insert({ post_id: post.id, user_id: userId })
            if (error) {
              if (error.code !== '23505') setSaved(false) // 23505 = already saved
            }
          }
        } finally { savingRef.current = false }
      }}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card },
        isDark ? cardShadowDark : cardShadow,
        category && { borderTopWidth: 2, borderTopColor: category.color + '99' },
        post.is_boosted && FEATURES.BOOSTS && { borderLeftWidth: 3, borderLeftColor: colors.accent },
        isNappaa && !isPro && !isUrgentPost && { borderWidth: 2, borderColor: CATEGORIES.nappaa.color },
        isUrgentPost && { borderWidth: 2, borderColor: colors.destructive },
        isPro && { borderWidth: 1.5, borderColor: colors.pro },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {/* Pro banner — only when no image (crown badge handles image cards) */}
      {isPro && !hasImage && (
        <View style={[styles.proBanner, { backgroundColor: colors.pro, shadowColor: colors.pro }]}>
          <Crown size={12} color={colors.primaryForeground} />
          <Text style={[styles.proBannerText, { color: colors.primaryForeground }]}>Pro</Text>
        </View>
      )}

      {/* Fix 1: Nappaa urgency banner — expiring today */}
      {isNappaa && expirationInfo && expirationInfo.severity === 'urgent' && (
        <View style={[styles.urgencyBanner, { backgroundColor: colors.destructive }]}>
          <Text style={[styles.urgencyText, { color: colors.primaryForeground }]}>{t('feed.expiringToday')}</Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {/* TOP ROW: Avatar + Name + timeAgo on LEFT, Category badge on RIGHT */}
        <View style={styles.topRow}>
          <View style={styles.topRowLeft}>
            {isAnonymous ? (
              <View style={styles.topRowUserInfo}>
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.muted, borderColor: `${colors.border}66` }]}>
                  <User size={16} color={colors.mutedForeground} />
                </View>
                <Text style={[styles.userName, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {t('postCard.anonymousNeighbor')}
                </Text>
                {post.created_at && (
                  <Text style={[styles.timeAgoDot, { color: colors.mutedForeground }]}>
                    {'· ' + formatTimeAgo(post.created_at, t, locale)}
                  </Text>
                )}
              </View>
            ) : (
              <Pressable onPress={(e) => { e.stopPropagation?.(); if (user?.id) router.push(`/profile/${user.id}` as any) }} style={styles.topRowUserInfo} accessibilityLabel={user?.name ?? t('postCard.anonymousUser')}>
                <View style={styles.avatarContainer}>
                  {user?.avatar_url ? (
                    <Image source={{ uri: getImageUrl(user.avatar_url, 'thumbnail')! }} style={[
                      styles.avatar,
                      { borderColor: isPro ? `${colors.pro}80` : `${colors.border}66` }
                    ]} contentFit="cover" cachePolicy="memory-disk" recyclingKey={user.avatar_url} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.muted, borderColor: `${colors.border}66` }]}>
                      <Text style={[styles.avatarInitial, { color: colors.mutedForeground }]}>
                        {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  {isPro && <View style={[styles.statusDot, { backgroundColor: colors.pro, borderColor: colors.card }]} />}
                </View>
                <View style={styles.userNameBlock}>
                  <View style={styles.userNameRow}>
                    <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
                      {user?.name ?? t('postCard.anonymousUser')}
                    </Text>
                    {userTrustLevel >= 2 && <TrustBadge level={userTrustLevel} size="small" />}
                    {isPro && (
                      <View style={[styles.proMicroBadge, { backgroundColor: `${colors.pro}18` }]}>
                        <Crown size={10} color={colors.pro} />
                      </View>
                    )}
                    {user?.is_business && (
                      <View style={[styles.businessMicroBadge, { backgroundColor: `${colors.primary}18` }]}>
                        <Building2 size={10} color={colors.primary} />
                      </View>
                    )}
                  </View>
                </View>
                {post.created_at && (
                  <Text style={[styles.timeAgoDot, { color: colors.mutedForeground }]}>
                    {'· ' + formatTimeAgo(post.created_at, t, locale)}
                  </Text>
                )}
              </Pressable>
            )}
          </View>
          {/* Category badge + boost badge — top right */}
          <View style={styles.topRowRight}>
            {post.is_boosted && FEATURES.BOOSTS && <BoostBadge />}
            {category && (
              <View style={[styles.categoryBadge, { backgroundColor: `${category.color}20` }]}>
                <Text style={[styles.categoryBadgeText, { color: category.color }]}>
                  {(() => { const label = t(category.label); return label.charAt(0) + label.slice(1).toLowerCase() })()}
                </Text>
                {isNew && <View style={[styles.newDot, { backgroundColor: colors.accent }]} />}
              </View>
            )}
          </View>
        </View>

        {/* Image — full width, below user row */}
        {hasImage && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: getImageUrl(post.image_url, 'medium')! }}
              style={styles.image}
              contentFit="cover"
              transition={300}
              onError={() => setImgError(true)}
              accessibilityLabel={post.title}
              cachePolicy="memory-disk"
              recyclingKey={post.image_url!}
            />
            {/* Multi-image badge */}
            {post.images && post.images.length > 1 && (
              <View style={styles.multiImageBadge}>
                <ImageIcon size={12} color="#FFFFFF" />
                <Text style={styles.multiImageText}>{post.images.length + 1}</Text>
              </View>
            )}
            {/* Pro crown */}
            {isPro && (
              <View style={[styles.proBadgeOnImage, { backgroundColor: colors.pro }]}>
                <Crown size={14} color="#1A1A1A" />
              </View>
            )}
            {/* Nappaa urgency */}
            {isNappaa && !isPro && (
              <View style={[styles.proBadgeOnImage, { backgroundColor: CATEGORIES.nappaa.color }]}>
                <Zap size={14} color="#FFFFFF" fill="#FFFFFF" />
              </View>
            )}
          </View>
        )}

        {/* Expiration badge */}
        {expirationInfo && (() => {
          const expirationColor = expirationInfo.severity === 'urgent' ? colors.destructive : CATEGORIES.nappaa.color
          return (
            <View style={[styles.expirationBadge, { backgroundColor: `${expirationColor}18` }]}>
              <Clock size={10} color={expirationColor} />
              <Text style={[styles.expirationText, { color: expirationColor }]}>{expirationInfo.label}</Text>
            </View>
          )
        })()}

        {/* Title */}
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
          {post.title}
        </Text>
        {post.is_seed && (
          <Text style={[styles.seedLabel, { color: colors.mutedForeground }]}>{t('feed.examplePost')}</Text>
        )}

        {/* Description — always show when available, 2 lines */}
        {post.description ? (
          <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
            {post.description}
          </Text>
        ) : null}

        {/* Location + price + condition */}
        {(post.daily_fee != null || post.service_price != null || post.location || (post.type === 'tarjoan' && post.tags?.includes('tarjoan_item'))) && (
          <View style={styles.metaRow}>
            {post.daily_fee != null && (
              <View style={[styles.priceBadge, { backgroundColor: isDark ? CATEGORIES.lainaa.bgDark : CATEGORIES.lainaa.bgLight }]}>
                <Text style={[styles.priceText, { color: CATEGORIES.lainaa.color }]}>
                  {t('rental.perDay', { price: formatPrice(post.daily_fee, locale) })}
                </Text>
              </View>
            )}
            {post.service_price != null && post.service_price > 0 && (
              <View style={[styles.priceBadge, { backgroundColor: isDark ? CATEGORIES.tarjoan.bgDark : CATEGORIES.tarjoan.bgLight }]}>
                <Text style={[styles.priceText, { color: CATEGORIES.tarjoan.color }]}>
                  {formatPrice(post.service_price, locale)}
                </Text>
              </View>
            )}
            {post.type === 'tarjoan' && post.tags?.includes('tarjoan_item') && (post.service_price == null || post.service_price === 0) && (
              <View style={[styles.priceBadge, { backgroundColor: isDark ? CATEGORIES.ilmaista.bgDark : CATEGORIES.ilmaista.bgLight }]}>
                <Text style={[styles.priceText, { color: CATEGORIES.ilmaista.color }]}>
                  {t('create.freeItem')}
                </Text>
              </View>
            )}
            {post.type === 'tarjoan' && post.tags?.some(tag => tag.startsWith('condition_')) && (
              <View style={[styles.conditionBadge, { backgroundColor: isDark ? CATEGORIES.tarjoan.bgDark : CATEGORIES.tarjoan.bgLight }]}>
                <Text style={[styles.conditionBadgeText, { color: CATEGORIES.tarjoan.color }]}>
                  {(() => {
                    const condTag = post.tags?.find(tag => tag.startsWith('condition_'))
                    if (!condTag) return ''
                    const condKey = 'create.condition' + condTag.replace('condition_', '').charAt(0).toUpperCase() + condTag.replace('condition_', '').slice(1)
                    return t(condKey)
                  })()}
                </Text>
              </View>
            )}
            {post.location && (
              <View style={styles.locationRow}>
                <MapPin size={11} color={colors.mutedForeground} />
                <Text style={[styles.locationText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {post.location}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Action row: Like count · Comment count · Save · More ... Distance on RIGHT */}
        <View style={[styles.actionRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border + '40' }]} accessibilityRole="toolbar" onStartShouldSetResponder={() => true}>
          {/* Like button — always show */}
          <Pressable
            hitSlop={8}
            accessibilityLabel={liked ? t('engagement.unlike') : t('engagement.like')}
            accessibilityState={{ selected: liked }}
            onPress={async (e) => {
              if (!isHumanAction()) return
              if (!userId) { router.push('/(auth)/login'); return }
              if (post.user_id === userId) return
              if (post.is_seed) return
              if (likingRef.current) return
              likingRef.current = true
              try {
                try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}

                const wasLiked = liked
                const prevCount = likeCount

                // Optimistic update
                setLiked(!wasLiked)
                setLikeCount(wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1)

                if (!wasLiked && !reduceMotion) {
                  Animated.sequence([
                    Animated.timing(likeAnim, { toValue: 1.5, duration: 150, useNativeDriver: true }),
                    Animated.timing(likeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
                  ]).start()
                }

                // DB operation
                const { error } = wasLiked
                  ? await (supabase.from('post_likes') as any).delete().eq('post_id', post.id).eq('user_id', userId)
                  : await (supabase.from('post_likes') as any).insert({ post_id: post.id, user_id: userId })

                if (error) {
                  // Rollback on error
                  if (__DEV__) console.warn('[PostCard] like failed:', error.message, error.code, error.details)
                  setLiked(wasLiked)
                  setLikeCount(prevCount)
                  // If it's a duplicate key error, the like already exists — re-sync state
                  if (error.code === '23505') {
                    setLiked(!wasLiked) // actually it WAS already liked/unliked
                  }
                } else {
                  // Sync count from source of truth
                  const { count: realCount } = await supabase.from('post_likes').select('*', { count: 'exact', head: true }).eq('post_id', post.id)
                  if (realCount != null) {
                    setLikeCount(realCount)
                    // Fire-and-forget: sync denormalized count on posts table
                    ;(supabase.from('posts') as any).update({ like_count: realCount }).eq('id', post.id).then(() => {}).catch(() => {})
                  }

                  if (!wasLiked) {
                    onInteraction?.(post.id, 'like')
                    // Notification (fire-and-forget)
                    if (post.user_id && post.user_id !== userId) {
                      ;(supabase.from('notifications') as any).insert({
                        user_id: post.user_id, from_user_id: userId,
                        type: 'post_like', title: t('post.liked'),
                        body: post.title, link_type: 'post', link_id: post.id,
                      }).then(() => {}).catch(() => {})
                    }
                  }
                }
              } finally { likingRef.current = false }
            }}
            style={styles.actionItem}
          >
            <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
              <Heart size={16} color={liked ? colors.destructive : colors.mutedForeground} fill={liked ? colors.destructive : 'transparent'} />
            </Animated.View>
            {likeCount > 0 && <Text style={[styles.actionText, { color: liked ? colors.destructive : colors.mutedForeground }]}>{likeCount}</Text>}
          </Pressable>

          {/* Comment count */}
          <View style={styles.actionItem}>
            <MessageCircle size={16} color={colors.mutedForeground} />
            {(post.comment_count ?? 0) > 0 && (
              <Text style={[styles.actionText, { color: colors.mutedForeground }]}>{post.comment_count}</Text>
            )}
          </View>

          {/* Save */}
          <Pressable
            hitSlop={8}
            accessibilityLabel={saved ? t('post.unsave') : t('post.save')}
            accessibilityState={{ selected: saved }}
            onPress={async (e) => {
              e.stopPropagation?.()
              if (!isHumanAction()) return
              if (!userId) { router.push('/(auth)/login'); return }
              if (post.is_seed) return
              if (savingRef.current) return
              savingRef.current = true
              try {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}

                if (saved) {
                  setSaved(false)
                  const { error } = await (supabase.from('saved_posts') as any).delete().eq('post_id', post.id).eq('user_id', userId)
                  if (error) setSaved(true)
                } else {
                  setSaved(true)
                  const { error } = await (supabase.from('saved_posts') as any).insert({ post_id: post.id, user_id: userId })
                  if (error) {
                    if (error.code !== '23505') setSaved(false) // 23505 = already saved
                  } else {
                    onInteraction?.(post.id, 'save')
                  }
                }
              } finally { savingRef.current = false }
            }}
            style={styles.actionItem}
          >
            {saved ? (
              <BookmarkCheck size={16} color={colors.primary} fill={colors.primary} />
            ) : (
              <Bookmark size={16} color={colors.mutedForeground} />
            )}
          </Pressable>

          {/* More menu items */}
          {showMore && (
            <Pressable
              hitSlop={8}
              accessibilityLabel={t('common.share')}
              onPress={async (e) => {
                e.stopPropagation?.()
                try {
                  Haptics.selectionAsync()
                  await Share.share({ message: post.title + '\n' + APP_URL + '/post/' + post.id })
                } catch {} // Intentional: user cancelled share
              }}
              style={styles.actionItem}
            >
              <Share2 size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
          {showMore && (
            <Pressable
              hitSlop={8}
              accessibilityLabel={t('post.report')}
              onPress={(e) => {
                e.stopPropagation?.()
                setShowMore(false)
                if (!userId) { router.push('/(auth)/login'); return }
                // Navigate to post detail where report modal exists
                router.push(`/post/${post.id}`)
              }}
              style={styles.actionItem}
            >
              <Flag size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
          {showMore && userId && (
            <Pressable
              hitSlop={8}
              accessibilityLabel={t('postCard.hide')}
              onPress={(e) => {
                e.stopPropagation?.()
                setShowMore(false)
                onInteraction?.(post.id, 'hide')
                onHide?.(post.id)
              }}
              style={styles.actionItem}
            >
              <EyeOff size={16} color={colors.mutedForeground} />
            </Pressable>
          )}

          {/* More toggle */}
          <Pressable
            hitSlop={8}
            accessibilityLabel={t('postCard.moreOptions')}
            accessibilityState={{ expanded: showMore }}
            onPress={(e) => { e.stopPropagation?.(); setShowMore(p => !p) }}
            style={[styles.actionItem, !showMore && { opacity: 0.5 }]}
          >
            <MoreHorizontal size={16} color={colors.mutedForeground} />
          </Pressable>

          {/* Popular badge */}
          {likeCount >= 5 && (
            <View style={[styles.popularBadge, { backgroundColor: `${colors.pro}20` }]}>
              <TrendingUp size={11} color={colors.pro} />
              <Text style={[styles.popularText, { color: colors.pro }]}>{t('feed.popular')}</Text>
            </View>
          )}

          {/* Distance — right-aligned */}
          {distanceText && (
            <View style={styles.distanceRow}>
              <MapPin size={11} color={colors.primary} />
              <Text style={[styles.distanceText, { color: colors.primary }]}>{distanceText}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  card: { borderRadius: 12, overflow: 'hidden', position: 'relative' as const },
  proBanner: {
    height: 22,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  proBannerText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5, fontFamily: fonts.bodySemi },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 12 },

  // Top row: user + category badge
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  topRowLeft: { flex: 1, minWidth: 0 },
  topRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  topRowUserInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userNameBlock: { flexShrink: 1, minWidth: 0 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 17 },
  timeAgoDot: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14, flexShrink: 0 },

  // Avatar
  avatarContainer: { position: 'relative' },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 16 },
  statusDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 7, height: 7, borderRadius: 3.5, borderWidth: 1,
  },

  // Category badge — top right pill
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
    flexShrink: 0,
  },
  categoryBadgeText: { fontSize: 11, fontFamily: fonts.bodyMedium, letterSpacing: 0.3, lineHeight: 13 },
  newDot: {
    width: 6, height: 6, borderRadius: 3, marginLeft: 2,
  },

  // Image — full width, inline
  imageContainer: { borderRadius: 8, overflow: 'hidden', maxHeight: 200, marginTop: 4 },
  image: { width: '100%', height: 200 },
  multiImageBadge: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  multiImageText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF', lineHeight: 13, fontFamily: fonts.bodySemi },
  proBadgeOnImage: {
    position: 'absolute', top: 8, right: 8,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },

  // Expiration
  expirationBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12,
    alignSelf: 'flex-start',
  },
  expirationText: { fontSize: 11, fontWeight: '600', lineHeight: 12, fontFamily: fonts.bodySemi },

  // Title + description
  title: { fontSize: 16, fontFamily: fonts.headingSemi, lineHeight: 22, letterSpacing: -0.15 },
  seedLabel: { fontSize: 11, fontFamily: fonts.body, fontStyle: 'italic', lineHeight: 14 },
  description: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20 },

  // Meta (price + location)
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  priceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  priceText: { fontSize: 11, fontWeight: '600', lineHeight: 14, fontFamily: fonts.bodySemi },
  conditionBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  conditionBadgeText: { fontSize: 11, fontWeight: '600', lineHeight: 13, fontFamily: fonts.bodySemi },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 },
  locationText: { fontSize: 11, fontFamily: fonts.body, flex: 1, lineHeight: 14 },

  // Action row
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, paddingTop: 8 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 44, minWidth: 44, paddingHorizontal: 4, justifyContent: 'center' as const },
  actionText: { fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 16 },
  popularBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  popularText: { fontSize: 11, fontFamily: fonts.bodyMedium, lineHeight: 14 },
  distanceRow: { marginLeft: 'auto' as any, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3 },
  distanceText: { fontSize: 11, fontWeight: '600', lineHeight: 13, fontFamily: fonts.bodySemi },

  // Badges
  proMicroBadge: {
    borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2,
  },
  businessMicroBadge: {
    borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2,
  },
  // Fix 1: Nappaa urgency banner
  urgencyBanner: {
    paddingVertical: 4,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  urgencyText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', fontFamily: fonts.bodySemi, letterSpacing: 0.3, lineHeight: 14 },
})
