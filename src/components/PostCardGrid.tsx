/**
 * PostCardGrid — 2-col Threads-style feed card.
 *
 * Layout (Threads pattern, top-to-bottom):
 *   1. Header: avatar + name + time + ⋯ menu
 *   2. Content: title, description, image (if any)
 *   3. Actions: ♥ count · 💬 count · 🔖 save
 *
 * Palette: pure black canvas, hairline borders only, single emerald accent.
 * Typography as primary visual (weight 800 on titles). No shadows.
 *
 * Variants (adaptive density):
 * - image-hero: photo → title → actions (shorter meta)
 * - event: compact date pill → title → description → actions
 * - text-rich: 6 lines of description (no image)
 * - text-compact: 3 lines of description (short posts)
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Heart, MessageCircle, MapPin, Calendar, Clock, User, MoreHorizontal, BadgeCheck } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { CATEGORIES } from '@/lib/constants'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo, formatPrice, formatEventDateShort } from '@/lib/format'
import { isHumanAction } from '@/lib/abuseDetection'
import { getImageUrl } from '@/lib/imageUtils'
import type { Post, PostType } from '@/lib/types'

type CardVariant = 'image-hero' | 'event' | 'text-rich' | 'text-compact'

export function getCardVariant(post: Post, hasImageOverride?: boolean): CardVariant {
  const hasImage = hasImageOverride ?? !!post.image_url
  if (post.type === 'tapahtuma') return 'event'
  if (hasImage) return 'image-hero'
  const descLen = (post.description ?? '').length
  if (descLen > 150) return 'text-rich'
  return 'text-compact'
}

interface PostCardGridProps {
  post: Post
  userId?: string | null
  onInteraction?: (postId: string, type: 'view' | 'click' | 'like' | 'save' | 'message' | 'skip' | 'hide') => void
  index?: number
}

export const PostCardGrid = memo(function PostCardGrid({ post, userId, onInteraction, index = 0 }: PostCardGridProps) {
  const { colors, isDark } = useTheme()
  const reduceMotion = useReduceMotion()
  const { t, locale } = useI18n()
  const router = useRouter()
  const supabase = useSupabase()

  const [imgError, setImgError] = useState(false)
  const [liked, setLiked] = useState(post.is_liked ?? false)
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0)
  const likingRef = useRef(false)
  const likeAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!likingRef.current) {
      if (post.is_liked !== undefined) setLiked(post.is_liked)
      setLikeCount(post.like_count ?? 0)
    }
  }, [post.id, post.is_liked, post.like_count])

  const category = CATEGORIES[post.type as PostType]
  const hasImage = !!(post.image_url && !imgError)
  const variant = getCardVariant(post, hasImage)
  const isAnonymous = post.is_anonymous === true
  const isExpired = !!(post.expires_at && new Date(post.expires_at).getTime() <= Date.now())
  const isUrgent = post.is_urgent && !isExpired
  const user = post.user
  const authorName = isAnonymous ? t('postCard.anonymousNeighbor') : (user?.name ?? '')
  const timeAgo = post.created_at ? formatTimeAgo(post.created_at, t, locale) : ''
  const isVerified = !isAnonymous && (post.user?.user_badges?.some((b: any) => b.badge_type === 'verified') ?? false)

  // Entrance animation
  const entranceAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (reduceMotion) { entranceAnim.setValue(1); return }
    const delay = Math.min(index * 30, 150)
    const timer = setTimeout(() => {
      try {
        Animated.spring(entranceAnim, { toValue: 1, friction: 8, tension: 100, useNativeDriver: true }).start()
      } catch {}
    }, delay)
    return () => clearTimeout(timer)
  }, [entranceAnim, reduceMotion, index])
  const entranceOpacity = entranceAnim
  const entranceTranslateY = entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] })

  const a11yLabel = useMemo(() => {
    const parts: string[] = []
    if (category) parts.push(t(category.label))
    parts.push(post.title)
    if (post.description && variant !== 'image-hero') parts.push(post.description.slice(0, 120))
    if (authorName) parts.push(`${t('common.by') ?? ''} ${authorName}`.trim())
    if (post.location) parts.push(post.location)
    if (timeAgo) parts.push(timeAgo)
    return parts.filter(Boolean).join(', ')
  }, [category, post, variant, authorName, timeAgo, t])

  const handlePress = () => {
    try { Haptics.selectionAsync() } catch {}
    onInteraction?.(post.id, 'click')
    router.push(`/post/${post.id}`)
  }

  const handleLike = async () => {
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
      setLiked(!wasLiked)
      setLikeCount(wasLiked ? Math.max(0, prevCount - 1) : prevCount + 1)
      if (!wasLiked && !reduceMotion) {
        Animated.sequence([
          Animated.spring(likeAnim, { toValue: 1.4, friction: 3, tension: 200, useNativeDriver: true }),
          Animated.spring(likeAnim, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
        ]).start()
      }
      const { error } = wasLiked
        ? await (supabase.from('post_likes') as any).delete().eq('post_id', post.id).eq('user_id', userId)
        : await (supabase.from('post_likes') as any).insert({ post_id: post.id, user_id: userId })
      if (error) {
        setLiked(wasLiked)
        setLikeCount(prevCount)
      } else if (!wasLiked) {
        onInteraction?.(post.id, 'like')
      }
    } finally { likingRef.current = false }
  }

  // ── Threads-style header: Avatar + Name + Time + ⋯ ──
  const Header = (
    <View style={styles.header}>
      {user?.avatar_url && !isAnonymous ? (
        <Image
          source={{ uri: getImageUrl(user.avatar_url, 'thumbnail')! }}
          style={styles.avatar}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={user.avatar_url}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.muted }]}>
          {isAnonymous ? (
            <User size={14} color={colors.mutedForeground} />
          ) : (
            <Text style={[styles.avatarInitial, { color: colors.foreground }]}>
              {(authorName || '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
      )}
      <View style={styles.headerNameBlock}>
        <View style={styles.authorNameRow}>
          <Text style={[styles.authorName, { color: colors.foreground }]} numberOfLines={1}>
            {authorName}
          </Text>
          {isVerified && <BadgeCheck size={12} color={colors.primary} strokeWidth={2.5} />}
        </View>
        {timeAgo && (
          <Text style={[styles.timeText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {timeAgo}
          </Text>
        )}
      </View>
      <View importantForAccessibility="no-hide-descendants">
        <MoreHorizontal size={14} color={colors.mutedForeground} strokeWidth={2} />
      </View>
    </View>
  )

  // ── Threads-style category label: tiny dot + muted uppercase text ──
  const CategoryLabel = category ? (
    <View style={styles.categoryRow} accessible={false}>
      <View style={[styles.categoryDot, { backgroundColor: category.color }]} accessible={false} importantForAccessibility="no" />
      <Text style={[styles.categoryText, { color: colors.mutedForeground }]} numberOfLines={1}>
        {t(category.label)}
      </Text>
    </View>
  ) : null

  // ── Threads-style action row: heart + comment (no save for now, keep minimal) ──
  const ActionRow = (
    <View style={styles.actions}>
      <Pressable
        onPress={handleLike}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={liked ? t('engagement.unlike') : t('engagement.like')}
        accessibilityState={{ selected: liked }}
        style={styles.action}
      >
        <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
          <Heart
            size={15}
            color={liked ? colors.destructive : colors.foreground}
            fill={liked ? colors.destructive : 'transparent'}
            strokeWidth={1.8}
          />
        </Animated.View>
        {likeCount > 0 && (
          <Text style={[styles.actionText, { color: liked ? colors.destructive : colors.mutedForeground }]}>
            {likeCount}
          </Text>
        )}
      </Pressable>
      <View
        style={styles.action}
        accessible
        accessibilityLabel={`${post.comment_count ?? 0} ${t('post.comments')}`}
        importantForAccessibility="yes"
      >
        <MessageCircle size={15} color={colors.foreground} strokeWidth={1.8} />
        {(post.comment_count ?? 0) > 0 && (
          <Text style={[styles.actionText, { color: colors.mutedForeground }]} accessible={false}>
            {post.comment_count}
          </Text>
        )}
      </View>
    </View>
  )

  // Shared card shell — hairline border only, no bg fill beyond base
  const cardStyle = [
    styles.card,
    { borderColor: colors.border },
    isExpired && { opacity: 0.55 },
  ]

  // ─── image-hero ───
  if (variant === 'image-hero') {
    return (
      <Animated.View style={{ flex: 1, opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          style={({ pressed }) => [cardStyle, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
        >
          <View style={styles.content}>
            {Header}
            <View style={styles.imageWrap}>
              <Image
                source={{ uri: getImageUrl(post.image_url, 'medium')! }}
                style={styles.image}
                contentFit="cover"
                transition={250}
                onError={() => setImgError(true)}
                cachePolicy="memory-disk"
                recyclingKey={post.image_url!}
                accessibilityLabel={post.title}
              />
              {isUrgent && (
                <View style={styles.urgentPill}>
                  <Clock size={9} color="#fff" strokeWidth={2.5} />
                  <Text style={styles.urgentText}>{t('postCard.urgent')}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {post.title}
            </Text>
            {(post.daily_fee != null || (post.service_price != null && post.service_price > 0)) && (
              <Text style={[styles.price, { color: colors.primary }]}>
                {post.daily_fee != null
                  ? t('rental.perDay', { price: formatPrice(post.daily_fee, locale) })
                  : formatPrice(post.service_price, locale)}
              </Text>
            )}
            {CategoryLabel}
            {ActionRow}
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  // ─── event ───
  if (variant === 'event') {
    return (
      <Animated.View style={{ flex: 1, opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          style={({ pressed }) => [cardStyle, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
        >
          <View style={styles.content}>
            {Header}
            <View style={styles.eventDateRow}>
              <Calendar size={12} color={category?.color ?? colors.primary} strokeWidth={2} />
              <Text style={[styles.eventDateText, { color: category?.color ?? colors.primary }]} numberOfLines={1}>
                {post.event_date ? formatEventDateShort(post.event_date, locale) : t('events.eventPending')}
              </Text>
            </View>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {post.title}
            </Text>
            {post.description && (
              <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
                {post.description}
              </Text>
            )}
            {post.location && (
              <View style={styles.locationRow}>
                <MapPin size={10} color={colors.mutedForeground} strokeWidth={2} />
                <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {post.location}
                </Text>
              </View>
            )}
            {CategoryLabel}
            {ActionRow}
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  // ─── text-rich ───
  if (variant === 'text-rich') {
    return (
      <Animated.View style={{ flex: 1, opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          style={({ pressed }) => [cardStyle, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
        >
          <View style={styles.content}>
            {Header}
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {post.title}
            </Text>
            {post.description && (
              <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={6}>
                {post.description}
              </Text>
            )}
            {CategoryLabel}
            {ActionRow}
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  // ─── text-compact ───
  return (
    <Animated.View style={{ flex: 1, opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        style={({ pressed }) => [cardStyle, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
      >
        <View style={styles.content}>
          {Header}
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
            {post.title}
          </Text>
          {post.description && (
            <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={3}>
              {post.description}
            </Text>
          )}
          {CategoryLabel}
          {ActionRow}
        </View>
      </Pressable>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  content: {
    padding: 10,
    gap: 8,
  },

  // ── Threads header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
  },
  headerNameBlock: {
    flex: 1,
    minWidth: 0,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  authorName: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.1,
    lineHeight: 15,
  },
  timeText: {
    fontSize: 10,
    fontFamily: fonts.body,
    lineHeight: 13,
    marginTop: 1,
  },

  // ── Image ──
  imageWrap: {
    position: 'relative',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0A0A0C',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  urgentPill: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DC2626',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  urgentText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: fonts.bodySemi,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // ── Event date ──
  eventDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventDateText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  // ── Typography ──
  title: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: fonts.heading,
    letterSpacing: -0.3,
    lineHeight: 19,
  },
  description: {
    fontSize: 13,
    lineHeight: 17,
    fontFamily: fonts.body,
  },
  meta: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 14,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    lineHeight: 17,
  },

  // ── Category label (muted, Threads-style dot) ──
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    lineHeight: 12,
  },

  // ── Location ──
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  // ── Action row ──
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 2,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 26,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 15,
  },
})
