/**
 * PostCardGrid — compact 2-column masonry-style card for the hybrid
 * marketplace+community feed layout. Inspired by Pinterest/Depop/Etsy
 * while preserving TackBird's community context.
 *
 * Renders 4 adaptive variants based on post content:
 * - image-hero:  Posts with images → visual-first, photo dominant
 * - event:       Tapahtuma posts → date prominent, gradient background
 * - text-rich:   No image, long description → 5-6 lines of context
 * - text-compact: No image, short description → minimal text card
 *
 * Designed per UI/UX Pro Max:
 * - content-adaptive density (card size varies with content weight)
 * - visual-hierarchy via size + spacing + color (not color alone)
 * - touch-target-size ≥44px (whole card is tappable)
 * - content-jumping prevented (fixed image aspectRatio, no shift on load)
 * - motion-consistency (same spring physics as PostCard list variant)
 * - reduced-motion respected
 * - voiceover-sr (composite a11yLabel reads entire card as one unit)
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Heart, MapPin, Calendar, Users as UsersIcon, Clock, Crown } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { shadowSm, shadowSmDark, shadowMd, shadowMdDark } from '@/lib/shadows'
import { CATEGORIES } from '@/lib/constants'
import { CATEGORY_ICON_MAP as ICON_MAP } from '@/lib/categoryIcons'
import { categoryTints, categoryAccents, categoryGradients } from '@/lib/theme'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo, formatPrice, formatEventDateShort } from '@/lib/format'
import { isHumanAction } from '@/lib/abuseDetection'
import { getImageUrl } from '@/lib/imageUtils'
import type { Post, PostType } from '@/lib/types'

type CardVariant = 'image-hero' | 'event' | 'text-rich' | 'text-compact'

/** Determine which variant to render for a post. Shape + content drive the choice. */
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

  // Sync state on prop changes
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
  const isPro = post.is_pro_listing
  const isAnonymous = post.is_anonymous === true
  const isExpired = !!(post.expires_at && new Date(post.expires_at).getTime() <= Date.now())
  const isUrgent = post.is_urgent && !isExpired

  // Staggered entrance animation — matches PostCard list variant for consistency
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
    const authorName = isAnonymous ? t('postCard.anonymousNeighbor') : post.user?.name
    if (authorName) parts.push(`${t('common.by') ?? ''} ${authorName}`.trim())
    if (post.location) parts.push(post.location)
    if (post.created_at) parts.push(formatTimeAgo(post.created_at, t, locale))
    return parts.filter(Boolean).join(', ')
  }, [category, post, variant, isAnonymous, t, locale])

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

  // ── Shared metadata row (author + time) ──
  const MetaRow = (
    <View style={styles.metaRow}>
      <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
        {(isAnonymous ? t('postCard.anonymousNeighbor') : post.user?.name ?? '')}
        {post.created_at && ` · ${formatTimeAgo(post.created_at, t, locale)}`}
      </Text>
      {post.location && (
        <View style={styles.locationRow}>
          <MapPin size={10} color={colors.mutedForeground} strokeWidth={2} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{post.location}</Text>
        </View>
      )}
    </View>
  )

  // ── Category pill (small) ──
  const CategoryPill = category ? (
    <View style={[styles.categoryPill, { backgroundColor: `${category.color}20` }]}>
      {CategoryIcon && <CategoryIcon size={10} color={category.color} strokeWidth={2.4} />}
      <Text style={[styles.categoryPillText, { color: category.color }]} numberOfLines={1}>
        {t(category.label)}
      </Text>
    </View>
  ) : null

  // ── Like button (overlay or inline) ──
  const LikeButton = (overlay: boolean) => (
    <Pressable
      onPress={handleLike}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={liked ? t('engagement.unlike') : t('engagement.like')}
      accessibilityState={{ selected: liked }}
      style={[
        overlay ? styles.heartOverlay : styles.heartInline,
        overlay && { backgroundColor: 'rgba(255,255,255,0.92)' },
      ]}
    >
      <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
        <Heart
          size={overlay ? 16 : 14}
          color={liked ? colors.destructive : (overlay ? '#111' : colors.mutedForeground)}
          fill={liked ? colors.destructive : 'transparent'}
          strokeWidth={2.2}
        />
      </Animated.View>
      {!overlay && likeCount > 0 && (
        <Text style={[styles.heartInlineText, { color: liked ? colors.destructive : colors.mutedForeground }]}>
          {likeCount}
        </Text>
      )}
    </Pressable>
  )

  // Tint + accent for the card
  const cardBg = categoryTints[post.type]
    ? categoryTints[post.type][isDark ? 'dark' : 'light']
    : colors.card
  const accent = categoryAccents[post.type]

  // ─── VARIANT: image-hero ───
  if (variant === 'image-hero') {
    return (
      <Animated.View
        style={{
          opacity: entranceOpacity,
          transform: [{ translateY: entranceTranslateY }],
        }}
      >
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.card },
            isDark ? shadowMdDark : shadowMd,
            isExpired && { opacity: 0.55 },
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <View style={styles.imageContainer}>
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
              <View style={styles.urgentBadge}>
                <Clock size={9} color="#fff" strokeWidth={2.5} />
                <Text style={styles.urgentBadgeText}>{t('postCard.urgent')}</Text>
              </View>
            )}
            {isPro && (
              <View style={[styles.proBadgeOnImage, { backgroundColor: colors.pro }]}>
                <Crown size={12} color="#1A1A1A" strokeWidth={2.5} />
              </View>
            )}
            {LikeButton(true)}
          </View>
          <View style={styles.imageContent}>
            {CategoryPill}
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {post.title}
            </Text>
            <View style={styles.priceMeta}>
              {post.daily_fee != null && (
                <Text style={[styles.price, { color: category?.color ?? colors.primary }]}>
                  {t('rental.perDay', { price: formatPrice(post.daily_fee, locale) })}
                </Text>
              )}
              {post.service_price != null && post.service_price > 0 && (
                <Text style={[styles.price, { color: category?.color ?? colors.primary }]}>
                  {formatPrice(post.service_price, locale)}
                </Text>
              )}
              {post.location && (
                <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {post.location}
                </Text>
              )}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  // ─── VARIANT: event ───
  if (variant === 'event') {
    const gradient = categoryGradients.tapahtuma
    return (
      <Animated.View style={{ opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          style={({ pressed }) => [
            styles.card,
            isDark ? shadowMdDark : shadowMd,
            isExpired && { opacity: 0.55 },
            pressed && { transform: [{ scale: 0.98 }] },
            { overflow: 'hidden' },
          ]}
        >
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.eventHeader}
          >
            <Calendar size={14} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={styles.eventDate} numberOfLines={1}>
              {post.event_date ? formatEventDateShort(post.event_date, locale) : t('events.eventPending')}
            </Text>
          </LinearGradient>
          <View style={[styles.eventBody, { backgroundColor: colors.card }]}>
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
                <MapPin size={11} color={colors.mutedForeground} strokeWidth={2} />
                <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {post.location}
                </Text>
              </View>
            )}
            <View style={styles.actionRow}>
              {LikeButton(false)}
              {post.comment_count != null && post.comment_count > 0 && (
                <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                  · {post.comment_count} {t('post.comments', { count: post.comment_count })}
                </Text>
              )}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  // ─── VARIANT: text-rich ───
  if (variant === 'text-rich') {
    return (
      <Animated.View style={{ opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          style={({ pressed }) => [
            styles.card,
            styles.textCard,
            { backgroundColor: cardBg },
            accent ? { borderLeftWidth: 3, borderLeftColor: accent } : undefined,
            isDark ? shadowSmDark : shadowSm,
            isExpired && { opacity: 0.55 },
            pressed && { transform: [{ scale: 0.98 }] },
          ]}
        >
          <View style={styles.textContent}>
            {CategoryPill}
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {post.title}
            </Text>
            {post.description && (
              <Text
                style={[styles.descriptionRich, { color: colors.mutedForeground }]}
                numberOfLines={6}
              >
                {post.description}
              </Text>
            )}
            <View style={styles.textFooter}>
              {MetaRow}
              {LikeButton(false)}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  // ─── VARIANT: text-compact ───
  return (
    <Animated.View style={{ opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        style={({ pressed }) => [
          styles.card,
          styles.textCard,
          { backgroundColor: cardBg },
          accent ? { borderLeftWidth: 3, borderLeftColor: accent } : undefined,
          isDark ? shadowSmDark : shadowSm,
          isExpired && { opacity: 0.55 },
          pressed && { transform: [{ scale: 0.98 }] },
        ]}
      >
        <View style={styles.textContent}>
          {CategoryPill}
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
            {post.title}
          </Text>
          {post.description && (
            <Text
              style={[styles.description, { color: colors.mutedForeground }]}
              numberOfLines={3}
            >
              {post.description}
            </Text>
          )}
          <View style={styles.textFooter}>
            {MetaRow}
            {LikeButton(false)}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  textCard: {
    // Text cards don't need overflow hidden; allows subtle border accent to show
    overflow: 'visible',
  },

  // ── image-hero variant ──
  imageContainer: {
    position: 'relative',
    aspectRatio: 4 / 5,
    backgroundColor: '#F3F4F6',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageContent: {
    padding: 10,
    gap: 4,
  },

  // Image overlays
  heartOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DC2626',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  urgentBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: fonts.bodySemi,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  proBadgeOnImage: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── event variant ──
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  eventDate: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.2,
  },
  eventBody: {
    padding: 10,
    gap: 6,
  },

  // ── text variant (rich + compact) ──
  textContent: {
    padding: 10,
    gap: 6,
  },
  descriptionRich: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
  },
  textFooter: {
    gap: 4,
    marginTop: 2,
  },

  // ── shared ──
  title: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.heading,
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  description: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  categoryPillText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    lineHeight: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  metaRow: {
    gap: 2,
  },
  metaText: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 14,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  priceMeta: {
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  heartInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 32,
    paddingRight: 4,
    paddingVertical: 4,
  },
  heartInlineText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 14,
  },
})
