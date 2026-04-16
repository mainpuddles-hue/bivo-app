/**
 * PostCardGrid — 2-col feed card, Threads-inspired dark minimalism.
 *
 * Design principles (UI/UX Pro Max validated):
 * - Typography as primary visual (no color-blocking backgrounds)
 * - Single-accent monochrome palette
 * - Hairline separators instead of shadows
 * - Avatar visible on every card for community/social context
 * - Content-adaptive density: image-dominant vs text-dominant variants
 *
 * Variants:
 * - image-hero:   Posts with photos → image dominant, minimal meta
 * - event:        Tapahtuma → date highlighted in compact header
 * - text-rich:    No image, long description → 6 lines shown
 * - text-compact: No image, short description → tight card
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Heart, MapPin, Calendar, Clock, User } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { CATEGORIES } from '@/lib/constants'
import { CATEGORY_ICON_MAP as ICON_MAP } from '@/lib/categoryIcons'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo, formatPrice, formatEventDateShort } from '@/lib/format'
import { isHumanAction } from '@/lib/abuseDetection'
import { getImageUrl } from '@/lib/imageUtils'
import type { Post, PostType } from '@/lib/types'

type CardVariant = 'image-hero' | 'event' | 'text-rich' | 'text-compact'

/** Pick a variant based on content shape. Image dominates when present. */
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
  const CategoryIcon = category ? ICON_MAP[category.icon] : null
  const hasImage = !!(post.image_url && !imgError)
  const variant = getCardVariant(post, hasImage)
  const isAnonymous = post.is_anonymous === true
  const isExpired = !!(post.expires_at && new Date(post.expires_at).getTime() <= Date.now())
  const isUrgent = post.is_urgent && !isExpired
  const user = post.user
  const authorName = isAnonymous ? t('postCard.anonymousNeighbor') : (user?.name ?? '')
  const timeAgo = post.created_at ? formatTimeAgo(post.created_at, t, locale) : ''

  // Staggered entrance animation
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
  const entranceTranslateY = entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] })

  // Composite accessibility label
  const a11yLabel = useMemo(() => {
    const parts: string[] = []
    if (category) parts.push(t(category.label))
    parts.push(post.title)
    if (post.description && variant !== 'image-hero') parts.push(post.description.slice(0, 140))
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

  // ── Threads-style author row (avatar + name + time) ──
  const AuthorRow = (
    <View style={styles.authorRow}>
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
            <User size={12} color={colors.mutedForeground} />
          ) : (
            <Text style={[styles.avatarInitial, { color: colors.mutedForeground }]}>
              {(authorName || '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
      )}
      <Text style={[styles.authorName, { color: colors.foreground }]} numberOfLines={1}>
        {authorName}
      </Text>
      {timeAgo && (
        <Text style={[styles.timeDot, { color: colors.mutedForeground }]} numberOfLines={1}>
          {timeAgo}
        </Text>
      )}
    </View>
  )

  // ── Category label (small, muted, Threads-style) ──
  const CategoryLabel = category ? (
    <View style={styles.categoryRow}>
      {CategoryIcon && <CategoryIcon size={10} color={category.color} strokeWidth={2.4} />}
      <Text style={[styles.categoryLabel, { color: category.color }]} numberOfLines={1}>
        {t(category.label).toUpperCase()}
      </Text>
    </View>
  ) : null

  // ── Like (inline, Threads-style) ──
  const LikeInline = (
    <Pressable
      onPress={handleLike}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={liked ? t('engagement.unlike') : t('engagement.like')}
      accessibilityState={{ selected: liked }}
      style={styles.likeInline}
    >
      <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
        <Heart
          size={14}
          color={liked ? colors.destructive : colors.mutedForeground}
          fill={liked ? colors.destructive : 'transparent'}
          strokeWidth={2}
        />
      </Animated.View>
      {likeCount > 0 && (
        <Text style={[styles.likeText, { color: liked ? colors.destructive : colors.mutedForeground }]}>
          {likeCount}
        </Text>
      )}
    </Pressable>
  )

  // ─── VARIANT: image-hero ───
  if (variant === 'image-hero') {
    return (
      <Animated.View style={{ flex: 1, opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
            isExpired && { opacity: 0.55 },
            pressed && { opacity: 0.85 },
          ]}
        >
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
          <View style={styles.content}>
            {CategoryLabel}
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {post.title}
            </Text>
            <View style={styles.priceRow}>
              {post.daily_fee != null && (
                <Text style={[styles.price, { color: colors.foreground }]}>
                  {t('rental.perDay', { price: formatPrice(post.daily_fee, locale) })}
                </Text>
              )}
              {post.service_price != null && post.service_price > 0 && (
                <Text style={[styles.price, { color: colors.foreground }]}>
                  {formatPrice(post.service_price, locale)}
                </Text>
              )}
              {post.location && (
                <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {post.location}
                </Text>
              )}
            </View>
            <View style={styles.bottomRow}>
              {AuthorRow}
              {LikeInline}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  // ─── VARIANT: event ───
  if (variant === 'event') {
    return (
      <Animated.View style={{ flex: 1, opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
            isExpired && { opacity: 0.55 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={[styles.eventDateBox, { backgroundColor: `${category?.color ?? colors.primary}18`, borderBottomColor: colors.border }]}>
            <Calendar size={12} color={category?.color ?? colors.primary} strokeWidth={2.2} />
            <Text style={[styles.eventDateText, { color: category?.color ?? colors.primary }]} numberOfLines={1}>
              {post.event_date ? formatEventDateShort(post.event_date, locale) : t('events.eventPending')}
            </Text>
          </View>
          <View style={styles.content}>
            {CategoryLabel}
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
            <View style={styles.bottomRow}>
              {AuthorRow}
              {LikeInline}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  // ─── VARIANT: text-rich ───
  if (variant === 'text-rich') {
    return (
      <Animated.View style={{ flex: 1, opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
            isExpired && { opacity: 0.55 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <View style={styles.content}>
            {CategoryLabel}
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {post.title}
            </Text>
            {post.description && (
              <Text style={[styles.descriptionRich, { color: colors.mutedForeground }]} numberOfLines={6}>
                {post.description}
              </Text>
            )}
            <View style={styles.bottomRow}>
              {AuthorRow}
              {LikeInline}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  // ─── VARIANT: text-compact ───
  return (
    <Animated.View style={{ flex: 1, opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth },
          isExpired && { opacity: 0.55 },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={styles.content}>
          {CategoryLabel}
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
            {post.title}
          </Text>
          {post.description && (
            <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={3}>
              {post.description}
            </Text>
          )}
          <View style={styles.bottomRow}>
            {AuthorRow}
            {LikeInline}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  // ── Card shell ──
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },

  // ── Image variant ──
  imageWrap: {
    position: 'relative',
    aspectRatio: 4 / 5,
    backgroundColor: '#111',
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

  // ── Event variant ──
  eventDateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eventDateText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  // ── Content (shared) ──
  content: {
    padding: 10,
    gap: 6,
  },

  // ── Category label (Threads-style: small, colored, uppercase) ──
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  categoryLabel: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.6,
    lineHeight: 12,
  },

  // ── Typography ──
  title: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.heading,
    letterSpacing: -0.3,
    lineHeight: 19,
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
  },
  descriptionRich: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
  },
  meta: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 14,
  },

  // ── Price row (image-hero) ──
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  price: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // ── Location ──
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  // ── Bottom row: author + like ──
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 6,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  authorName: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  timeDot: {
    fontSize: 11,
    fontFamily: fonts.body,
    flexShrink: 0,
  },

  // ── Like inline ──
  likeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 24,
    paddingHorizontal: 2,
  },
  likeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 14,
  },
})
