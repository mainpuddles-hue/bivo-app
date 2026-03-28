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
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { cardShadow, cardShadowDark } from '@/lib/shadows'
import { CATEGORIES } from '@/lib/constants'
import { CATEGORY_ICON_MAP as ICON_MAP } from '@/lib/categoryIcons'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo, formatPrice } from '@/lib/format'
import { haversineKm } from '@/lib/geo'
import { TrustBadge } from '@/components/TrustBadge'
import { computeTrustLevelFromBadges } from '@/lib/trustUtils'
import { isHumanAction } from '@/lib/abuseDetection'
import type { Post, PostType } from '@/lib/types'

const APP_URL = 'https://tackbird-v2.vercel.app'

function getExpirationInfo(expiresAt: string | null, t: (key: string, params?: Record<string, string | number>) => string): { label: string; color: string } | null {
  if (!expiresAt) return null
  const now = new Date()
  const expires = new Date(expiresAt)
  if (isNaN(expires.getTime())) return null
  const diffMs = expires.getTime() - now.getTime()
  if (diffMs <= 0) return { label: t('postCard.expired'), color: '#D94F4F' }
  const diffHours = diffMs / 3600000
  if (diffHours < 24) return { label: t('postCard.expiresToday'), color: '#D94F4F' }
  const diffDays = Math.ceil(diffMs / 86400000)
  if (diffDays === 1) return { label: t('postCard.expiresTomorrow'), color: '#E8A050' }
  if (diffDays <= 7) return { label: t('postCard.expiresIn', { count: diffDays }), color: '#E8A050' }
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

  // Check if current user has liked/saved this post
  useEffect(() => {
    if (!userId) return
    // Skip DB check if the post already carries like/save state
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
  }, [userId, post.id, post.is_liked, post.is_saved])

  const category = CATEGORIES[post.type as PostType]
  const isPro = post.is_pro_listing
  const isNappaa = post.type === 'nappaa'
  const user = post.user
  const hasImage = post.image_url && !imgError
  const CategoryIcon = category ? ICON_MAP[category.icon] : null
  const isVerified = user?.user_badges?.some(b => b.badge_type === 'verified') ?? false
  const userTrustLevel = computeTrustLevelFromBadges(user?.user_badges)

  const isAnonymous = (post as any).is_anonymous === true
  const isUrgentPost = post.is_urgent && post.expires_at && new Date(post.expires_at).getTime() > Date.now()
  const [showMore, setShowMore] = useState(false)

  const expirationInfo = useMemo(() => getExpirationInfo(post.expires_at, t), [post.expires_at, t])

  // Fix 4: Smooth card entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    try {
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    } catch {}
  }, [fadeAnim])

  const distanceText = useMemo(() => {
    if (!userLocation || !post.latitude || !post.longitude) return null
    const dist = haversineKm(userLocation.latitude, userLocation.longitude, post.latitude, post.longitude)
    if (dist < 0.1) return '< 0.1 km'
    return t('postCard.distanceKm', { distance: dist < 10 ? dist.toFixed(1) : Math.round(dist).toString() })
  }, [userLocation, post.latitude, post.longitude, t])

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
    <Pressable
      accessibilityLabel={post.title}
      accessibilityRole="button"
      accessibilityHint={t('postCard.tapToOpen')}
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
        onInteraction?.(post.id, 'click')
        // Seed posts have fake IDs — don't navigate to detail (would show eternal spinner)
        if ((post as any).is_seed) return
        router.push(`/post/${post.id}`)
      }}
      onLongPress={async () => {
        if (!isHumanAction()) return
        if (!userId) { router.push('/(auth)/login'); return }
        if ((post as any).is_seed) return
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
            if (error) setSaved(false)
          }
        } finally { savingRef.current = false }
      }}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card },
        isDark ? cardShadowDark : cardShadow,
        category && { borderTopWidth: 2, borderTopColor: category.color + '99' },
        isNappaa && !isPro && !isUrgentPost && { borderWidth: 2, borderColor: '#E8A050' },
        isUrgentPost && { borderWidth: 2, borderColor: colors.destructive },
        isPro && { borderWidth: 1.5, borderColor: colors.pro },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {/* Pro banner — only when no image (crown badge handles image cards) */}
      {isPro && !hasImage && (
        <View style={[styles.proBanner, { backgroundColor: colors.pro, shadowColor: colors.pro }]}>
          <Crown size={12} color="#FFFFFF" />
          <Text style={styles.proBannerText}>Pro</Text>
        </View>
      )}

      {/* Fix 1: Nappaa urgency banner — expiring today */}
      {isNappaa && expirationInfo && expirationInfo.color === '#D94F4F' && (
        <View style={[styles.urgencyBanner, { backgroundColor: colors.destructive }]}>
          <Text style={styles.urgencyText}>{t('feed.expiringToday')}</Text>
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
              <Pressable onPress={(e) => { e.stopPropagation?.(); if (user?.id) router.push(`/profile/${user.id}` as any) }} style={styles.topRowUserInfo}>
                <View style={styles.avatarContainer}>
                  {user?.avatar_url ? (
                    <Image source={{ uri: user.avatar_url }} style={[
                      styles.avatar,
                      { borderColor: isPro ? `${colors.pro}80` : `${colors.border}66` }
                    ]} contentFit="cover" />
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
                      <View style={styles.proMicroBadge}>
                        <Crown size={10} color={colors.pro} />
                      </View>
                    )}
                    {user?.is_business && (
                      <View style={styles.businessMicroBadge}>
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
          {/* Category badge — top right */}
          {category && (
            <View style={[styles.categoryBadge, { backgroundColor: `${category.color}20` }]}>
              {CategoryIcon && <CategoryIcon size={11} color={category.color} strokeWidth={2} />}
              <Text style={[styles.categoryBadgeText, { color: category.color }]}>
                {(() => { const label = t(category.label); return label.charAt(0) + label.slice(1).toLowerCase() })()}
              </Text>
              {isNew && <View style={[styles.newDot, { backgroundColor: colors.accent }]} />}
            </View>
          )}
        </View>

        {/* Image — full width, below user row */}
        {hasImage && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: post.image_url! }}
              style={styles.image}
              contentFit="cover"
              transition={300}
              onError={() => setImgError(true)}
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
                <Crown size={14} color="#FFFFFF" />
              </View>
            )}
            {/* Nappaa urgency */}
            {isNappaa && !isPro && (
              <View style={[styles.proBadgeOnImage, { backgroundColor: '#E8A050' }]}>
                <Zap size={14} color="#FFFFFF" fill="#FFFFFF" />
              </View>
            )}
          </View>
        )}

        {/* Expiration badge */}
        {expirationInfo && (
          <View style={[styles.expirationBadge, { backgroundColor: `${expirationInfo.color}18` }]}>
            <Clock size={10} color={expirationInfo.color} />
            <Text style={[styles.expirationText, { color: expirationInfo.color }]}>{expirationInfo.label}</Text>
          </View>
        )}

        {/* Title */}
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
          {post.title}
        </Text>
        {(post as any).is_seed && (
          <Text style={[styles.seedLabel, { color: colors.mutedForeground }]}>{t('feed.examplePost')}</Text>
        )}

        {/* Description — always show when available, 2 lines */}
        {post.description ? (
          <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
            {post.description}
          </Text>
        ) : null}

        {/* Location + price */}
        {(post.daily_fee != null || post.service_price != null || post.location) && (
          <View style={styles.metaRow}>
            {post.daily_fee != null && (
              <View style={[styles.priceBadge, { backgroundColor: isDark ? '#2D2010' : '#FDF6E8' }]}>
                <Text style={[styles.priceText, { color: '#C98B2E' }]}>
                  {t('rental.perDay', { price: formatPrice(post.daily_fee, locale) })}
                </Text>
              </View>
            )}
            {post.service_price != null && (
              <View style={[styles.priceBadge, { backgroundColor: isDark ? '#1A1525' : '#F4EFFF' }]}>
                <Text style={[styles.priceText, { color: '#7C5CBF' }]}>
                  {formatPrice(post.service_price, locale)}
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
        <View style={styles.actionRow} accessibilityRole="toolbar">
          {/* Like button — always show */}
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={liked ? t('engagement.unlike') : t('engagement.like')}
            accessibilityState={{ selected: liked }}
            onPress={async (e) => {
              e.stopPropagation?.()
              if (!isHumanAction()) return
              if (!userId) { router.push('/(auth)/login'); return }
              if (likingRef.current) return
              likingRef.current = true
              try {
                try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}

                // Block interactions on seed posts (fake IDs cause FK violations)
                if ((post as any).is_seed) return

                if (liked) {
                  const prevCount = likeCount
                  setLiked(false)
                  setLikeCount(c => Math.max(0, c - 1))
                  const { error } = await (supabase.from('post_likes') as any).delete().eq('post_id', post.id).eq('user_id', userId)
                  if (error) { setLiked(true); setLikeCount(prevCount) }
                  else {
                    // Sync like_count on posts table
                    await (supabase.from('posts') as any).update({ like_count: Math.max(0, prevCount - 1) }).eq('id', post.id)
                  }
                } else {
                  const prevCount = likeCount
                  setLiked(true)
                  setLikeCount(c => c + 1)
                  Animated.sequence([
                    Animated.timing(likeAnim, { toValue: 1.5, duration: 150, useNativeDriver: true }),
                    Animated.timing(likeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
                  ]).start()
                  const { error } = await (supabase.from('post_likes') as any).insert({ post_id: post.id, user_id: userId })
                  if (error) { setLiked(false); setLikeCount(prevCount) }
                  else {
                    // Sync like_count on posts table
                    await (supabase.from('posts') as any).update({ like_count: prevCount + 1 }).eq('id', post.id)
                    onInteraction?.(post.id, 'like')
                    // Notify post author about the like (skip if own post)
                    if (post.user_id && post.user_id !== userId) {
                      (supabase.from('notifications') as any).insert({
                        user_id: post.user_id,
                        from_user_id: userId,
                        type: 'post_like',
                        title: t('post.liked'),
                        body: post.title,
                        link_type: 'post',
                        link_id: post.id,
                      }).catch(() => {})
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
            accessibilityRole="button"
            accessibilityLabel={saved ? t('post.unsave') : t('post.save')}
            accessibilityState={{ selected: saved }}
            onPress={async (e) => {
              e.stopPropagation?.()
              if (!isHumanAction()) return
              if (!userId) { router.push('/(auth)/login'); return }
              if ((post as any).is_seed) return
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
                  if (error) setSaved(false)
                  else onInteraction?.(post.id, 'save')
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
              onPress={async (e) => {
                e.stopPropagation?.()
                try {
                  Haptics.selectionAsync()
                  await Share.share({ message: post.title + '\n' + APP_URL + '/post/' + post.id })
                } catch {}
              }}
              style={styles.actionItem}
            >
              <Share2 size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
          {showMore && (
            <Pressable
              hitSlop={8}
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
            onPress={(e) => { e.stopPropagation?.(); setShowMore(p => !p) }}
            style={[styles.actionItem, !showMore && { opacity: 0.5 }]}
          >
            <MoreHorizontal size={16} color={colors.mutedForeground} />
          </Pressable>

          {/* Popular badge */}
          {likeCount >= 5 && (
            <View style={[styles.popularBadge, { backgroundColor: isDark ? '#D9770615' : '#FEF3C7' }]}>
              <TrendingUp size={11} color="#D97706" />
              <Text style={styles.popularText}>{t('feed.popular')}</Text>
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
  card: { borderRadius: 12, overflow: 'hidden', position: 'relative' as const, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  proBanner: {
    height: 22, backgroundColor: '#F59E0B',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  proBannerText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  content: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 6 },

  // Top row: user + category badge
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  topRowLeft: { flex: 1, minWidth: 0 },
  topRowUserInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userNameBlock: { flexShrink: 1, minWidth: 0 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 17 },
  timeAgoDot: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14.3, flexShrink: 0 },

  // Avatar
  avatarContainer: { position: 'relative' },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 12, fontWeight: '600' },
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
  categoryBadgeText: { fontSize: 10, fontFamily: fonts.bodyMedium, letterSpacing: 0.3, lineHeight: 13 },
  newDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#4CAF6A', marginLeft: 2,
  },

  // Image — full width, inline
  imageContainer: { borderRadius: 10, overflow: 'hidden', maxHeight: 200, marginTop: 2 },
  image: { width: '100%', height: 200 },
  multiImageBadge: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  multiImageText: { fontSize: 10, fontWeight: '600', color: '#FFFFFF', lineHeight: 13 },
  proBadgeOnImage: {
    position: 'absolute', top: 8, right: 8,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },

  // Expiration
  expirationBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
    alignSelf: 'flex-start',
  },
  expirationText: { fontSize: 9, fontWeight: '600', lineHeight: 11.7 },

  // Title + description
  title: { fontSize: 15, fontFamily: fonts.headingSemi, lineHeight: 20, letterSpacing: -0.15 },
  seedLabel: { fontSize: 10, fontFamily: fonts.body, fontStyle: 'italic' },
  description: { fontSize: 14, fontFamily: fonts.body, lineHeight: 19 },

  // Meta (price + location)
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  priceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  priceText: { fontSize: 11, fontWeight: '600', lineHeight: 14.3 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 },
  locationText: { fontSize: 11, fontFamily: fonts.body, flex: 1, lineHeight: 14.3 },

  // Action row
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 32, paddingHorizontal: 2 },
  actionText: { fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 15.6 },
  popularBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  popularText: { fontSize: 11, fontFamily: fonts.bodyMedium, color: '#D97706', lineHeight: 14.3 },
  distanceRow: { marginLeft: 'auto' as any, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3 },
  distanceText: { fontSize: 10, fontWeight: '600', lineHeight: 13 },

  // Badges
  proMicroBadge: {
    backgroundColor: '#F59E0B18',
    borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1,
  },
  businessMicroBadge: {
    backgroundColor: '#2D6B5E18',
    borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1,
  },
  // Fix 1: Nappaa urgency banner
  urgencyBanner: {
    backgroundColor: '#D94F4F', paddingVertical: 4,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  urgencyText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', fontFamily: fonts.bodySemi, letterSpacing: 0.3 },
})
