/**
 * PostCardGrid — 2-col Pinterest-style feed card.
 *
 * Layout (Helsinki Monochrome mockup 05):
 *   - image-hero: photo fills top, frosted-glass category pill overlaid,
 *     title + mini avatar + meta below
 *   - event: ink background, inverted text, calendar + category, attendee hint
 *   - text: warm tint background (#F0EEE9), uppercase category, large title, mini avatar + meta
 *
 * No Threads-style header. Photo-first, content-dense, Pinterest masonry.
 */
import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet, Animated, Platform } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Heart, Calendar, Clock, Eye } from 'lucide-react-native'
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

type CardVariant = 'image-hero' | 'event' | 'text'

function getCardVariant(post: Post, hasImageOverride?: boolean): CardVariant {
  const hasImage = hasImageOverride ?? !!post.image_url
  if (post.type === 'tapahtuma') return 'event'
  if (hasImage) return 'image-hero'
  return 'text'
}

interface PostCardGridProps {
  post: Post
  userId?: string | null
  onInteraction?: (postId: string, type: 'view' | 'click' | 'like' | 'save' | 'message' | 'skip' | 'hide') => void
  index?: number
  sortBy?: string
  followedIds?: string[]
  viewCount?: number
}

// Warm tint for text-only cards — now from theme.warmTint

export const PostCardGrid = memo(function PostCardGrid({ post, userId, onInteraction, index = 0, sortBy, followedIds, viewCount }: PostCardGridProps) {
  const { colors, isDark } = useTheme()
  const reduceMotion = useReduceMotion()
  const { t, locale } = useI18n()
  const router = useRouter()
  const supabase = useSupabase()

  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [liked, setLiked] = useState(post.is_liked ?? false)
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0)
  const likingRef = useRef(false)
  const mountedRef = useRef(true)
  const likeGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const likeAnim = useRef(new Animated.Value(1)).current
  const shimmerAnim = useRef(new Animated.Value(0.4)).current

  // Cleanup mountedRef + grace timer on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (likeGraceTimerRef.current) clearTimeout(likeGraceTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const imgUrl = post.image_url || (post.images?.[0]?.image_url ?? null)
    if (imgLoaded || imgError || !imgUrl) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [imgLoaded, imgError, post.image_url, post.images?.[0]?.image_url, shimmerAnim])

  // Sync state when post prop changes (e.g., feed refresh)
  useEffect(() => {
    if (!likingRef.current) {
      if (post.is_liked !== undefined) setLiked(post.is_liked)
      setLikeCount(post.like_count ?? 0)
    }
  }, [post.id, post.is_liked, post.like_count])

  const category = CATEGORIES[post.type as PostType]
  // Fallback: use post_images[0] if post.image_url is null
  const effectiveImageUrl = post.image_url || (post.images?.[0]?.image_url ?? null)
  const hasImage = !!(effectiveImageUrl && !imgError)
  const variant = getCardVariant(post, hasImage)
  const isAnonymous = post.is_anonymous === true
  const isExpired = !!(post.expires_at && new Date(post.expires_at).getTime() <= Date.now())
  const isUrgent = post.is_urgent && !isExpired
  const user = post.user
  const authorName = isAnonymous ? t('postCard.anonymousNeighbor') : (user?.name ?? '')
  const timeAgo = post.created_at ? formatTimeAgo(post.created_at, t, locale) : ''

  // Recommendation reason (only shown when sort is 'recommended')
  const isFollowed = sortBy === 'recommended' && followedIds?.includes(post.user_id)
  const isBoosted = sortBy === 'recommended' && (post as any).is_boosted === true

  // Consistent image height — FlatList numColumns forces equal row heights,
  // so variable heights only create uneven whitespace below shorter cards.
  const imageHeight = 150

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
    // Inline event cards have id prefixed with "event-"
    if (post.id.startsWith('event-')) {
      router.push(`/event/${post.id.replace('event-', '')}`)
    } else {
      router.push(`/post/${post.id}`)
    }
  }

  const handleLike = async () => {
    if (!isHumanAction()) return
    if (!userId) { router.push('/(auth)/login'); return }
    if (post.user_id === userId) return
    if (post.is_seed) return
    if (likingRef.current) return
    likingRef.current = true
    // Clear any previous grace timer so back-to-back taps don't stack
    if (likeGraceTimerRef.current) clearTimeout(likeGraceTimerRef.current)
    const wasLiked = liked
    const prevCount = likeCount
    try {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
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
        if (mountedRef.current) {
          setLiked(wasLiked)
          setLikeCount(prevCount)
        }
        likingRef.current = false
        return
      }
      if (!wasLiked) onInteraction?.(post.id, 'like')
    } catch {
      if (mountedRef.current) {
        setLiked(wasLiked)
        setLikeCount(prevCount)
      }
      likingRef.current = false
      return
    }
    // Grace period: keep likingRef true for 2s so the sync useEffect
    // won't reset optimistic state from stale server data
    likeGraceTimerRef.current = setTimeout(() => {
      likingRef.current = false
    }, 2000)
  }

  // ── Mini avatar + meta footer (shared across variants) ──
  const MetaFooter = (metaColor: string) => (
    <View style={styles.metaRow}>
      {user?.avatar_url && !isAnonymous ? (
        <Image
          source={{ uri: getImageUrl(user.avatar_url, 'thumbnail')! }}
          style={styles.miniAvatar}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={user.avatar_url}
          accessible={false}
        />
      ) : (
        <View style={[styles.miniAvatar, styles.miniAvatarFallback, { backgroundColor: `${metaColor}20` }]}>
          <Text style={{ fontSize: 12, fontFamily: fonts.bodySemi, color: metaColor }}>{user?.name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
        </View>
      )}
      <Text style={[styles.metaText, { color: metaColor }]} numberOfLines={1}>
        {authorName}{post.location ? ` · ${post.location}` : ''}
      </Text>
      {viewCount != null && viewCount > 2 && (
        <View style={styles.viewCountPill}>
          <Eye size={12} color={metaColor} strokeWidth={2} />
          <Text style={[styles.viewCountText, { color: metaColor }]}>{viewCount}</Text>
        </View>
      )}
    </View>
  )

  // ── Like pill (overlaid on image cards, inline on others) ──
  const LikePill = (overlaid: boolean) => {
    if (!overlaid && likeCount === 0 && !liked) return null
    return (
      <Pressable
        onPress={(e) => { e?.stopPropagation?.(); handleLike() }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={liked ? t('engagement.unlike') : t('engagement.like')}
        accessibilityState={{ selected: liked }}
        style={({ pressed }) => [
          overlaid ? styles.likePillOverlaid : styles.likePillInline,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
          <Heart
            size={12}
            color={overlaid ? colors.primaryForeground : (liked ? colors.destructive : colors.mutedForeground)}
            fill={liked ? (overlaid ? colors.primaryForeground : colors.destructive) : 'transparent'}
            strokeWidth={2}
          />
        </Animated.View>
        {likeCount > 0 && (
          <Text style={[styles.likePillText, { color: overlaid ? colors.primaryForeground : (liked ? colors.destructive : colors.mutedForeground) }]}>
            {likeCount}
          </Text>
        )}
      </Pressable>
    )
  }

  // Spring-physics press feedback
  const cardScale = useRef(new Animated.Value(1)).current
  const handleCardPressIn = useCallback(() => {
    if (reduceMotion) { cardScale.setValue(0.96); return }
    Animated.spring(cardScale, { toValue: 0.96, friction: 4, tension: 200, useNativeDriver: true }).start()
  }, [cardScale, reduceMotion])
  const handleCardPressOut = useCallback(() => {
    if (reduceMotion) { cardScale.setValue(1); return }
    Animated.spring(cardScale, { toValue: 1, friction: 3, tension: 300, useNativeDriver: true }).start()
  }, [cardScale, reduceMotion])

  // ─── image-hero: photo-first Pinterest card ───
  if (variant === 'image-hero') {
    return (
      <Animated.View style={{ flex: 1, transform: [{ scale: cardScale }] }}>
        <Pressable
          onPress={handlePress}
          onPressIn={handleCardPressIn}
          onPressOut={handleCardPressOut}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
            isExpired && { opacity: 0.55 },
          ]}
        >
          {/* Photo with overlaid badges */}
          <View style={[styles.imageWrap, { height: imageHeight, backgroundColor: colors.muted }]}>
            {!imgLoaded && (
              <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.muted, opacity: shimmerAnim, zIndex: 1 }]} />
            )}
            <Image
              source={{ uri: getImageUrl(effectiveImageUrl, 'medium')! }}
              style={styles.image}
              contentFit="cover"
              transition={200}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              cachePolicy="memory-disk"
              recyclingKey={effectiveImageUrl!}
              accessibilityLabel={post.title}
            />
            {/* Category pill — frosted glass, top-left */}
            {category && (
              <View style={styles.categoryPill}>
                <Text style={styles.categoryPillText}>{t(category.label)}</Text>
              </View>
            )}
            {/* Urgent pill — top-right */}
            {isUrgent && (
              <View style={[styles.urgentPill, { backgroundColor: colors.destructive }]}>
                <Clock size={12} color={colors.primaryForeground} strokeWidth={2.5} />
                <Text style={[styles.urgentText, { color: colors.primaryForeground }]}>{t('postCard.urgent')}</Text>
              </View>
            )}
            {/* Like count pill — top-right (if not urgent) */}
            {!isUrgent && likeCount > 0 && LikePill(true)}
          </View>
          {/* Content below image */}
          <View style={styles.imageCardContent}>
            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {post.title}
            </Text>
            {post.is_seed && (
              <Text style={[styles.seedLabel, { color: colors.mutedForeground }]}>{t('feed.examplePost')}</Text>
            )}
            {(post.daily_fee != null || (post.service_price != null && post.service_price > 0)) && (
              <Text style={[styles.price, { color: colors.foreground }]}>
                {post.daily_fee != null
                  ? t('rental.perDay', { price: formatPrice(post.daily_fee, locale) })
                  : formatPrice(post.service_price, locale)}
              </Text>
            )}
            {/* Recommendation reason pills */}
            {(isBoosted || isFollowed) && (
              <View style={styles.reasonRow}>
                {isBoosted && (
                  <View style={[styles.reasonPill, { backgroundColor: `${colors.primary}15` }]}>
                    <Text style={[styles.reasonPillText, { color: colors.primary }]}>
                      {t('postCard.boosted')}
                    </Text>
                  </View>
                )}
                {isFollowed && (
                  <View style={[styles.reasonPill, { backgroundColor: `${colors.primary}15` }]}>
                    <Text style={[styles.reasonPillText, { color: colors.primary }]}>
                      {t('postCard.fromFollowed')}
                    </Text>
                  </View>
                )}
              </View>
            )}
            {MetaFooter(colors.mutedForeground)}
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  // ─── event: ink background, inverted text ───
  if (variant === 'event') {
    return (
      <Animated.View style={{ flex: 1, transform: [{ scale: cardScale }] }}>
        <Pressable
          onPress={handlePress}
          onPressIn={handleCardPressIn}
          onPressOut={handleCardPressOut}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          style={[
            styles.card,
            styles.eventCard,
            { backgroundColor: colors.foreground },
            isExpired && { opacity: 0.55 },
          ]}
        >
          <View style={styles.eventContent}>
            {/* Calendar + category */}
            <View style={styles.eventCategoryRow}>
              <Calendar size={12} color={colors.onInkMuted} strokeWidth={2} />
              <Text style={[styles.eventCategoryText, { color: colors.mutedForeground }]}>
                {t(category?.label ?? 'categories.tapahtuma')}
              </Text>
            </View>
            {/* Title */}
            <Text style={[styles.eventTitle, { color: colors.background }]} numberOfLines={2}>
              {post.title}
            </Text>
            {/* Date + location */}
            <Text style={[styles.eventMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
              {post.location ? `${post.location} · ` : ''}
              {post.event_date ? formatEventDateShort(post.event_date, locale) : t('events.eventPending')}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  // ─── text: warm tint background, no image ───
  return (
    <Animated.View style={{ flex: 1, transform: [{ scale: cardScale }] }}>
      <Pressable
        onPress={handlePress}
        onPressIn={handleCardPressIn}
        onPressOut={handleCardPressOut}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        style={[
          styles.card,
          { backgroundColor: colors.warmTint, borderColor: colors.border },
          isExpired && { opacity: 0.55 },
        ]}
      >
        <View style={styles.textContent}>
          {/* Category label — uppercase, muted */}
          {category && (
            <Text style={[styles.textCategoryLabel, { color: colors.mutedForeground }]}>
              {t(category.label)}
            </Text>
          )}
          {/* Title — larger for text-only cards */}
          <Text style={[styles.textTitle, { color: colors.foreground }]} numberOfLines={3}>
            {post.title}
          </Text>
          {post.is_seed && (
            <Text style={[styles.seedLabel, { color: colors.mutedForeground }]}>{t('feed.examplePost')}</Text>
          )}
          {/* Meta footer */}
          {MetaFooter(colors.mutedForeground)}
        </View>
      </Pressable>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },

  // ── Image hero card ──
  imageWrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  categoryPill: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    ...Platform.select({
      ios: { },
      default: { },
    }),
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#1A1D1F',
  },
  urgentPill: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  urgentText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  imageCardContent: {
    padding: 12,
    paddingTop: 12,
    gap: 8,
  },

  // ── Like pills ──
  likePillOverlaid: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  likePillInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 2,
  },
  likePillText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // ── Reason pills ──
  reasonRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  reasonPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  reasonPillText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    lineHeight: 16,
  },

  // ── Typography ──
  title: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.1,
    lineHeight: 16,
  },
  seedLabel: {
    fontSize: 11,
    fontFamily: fonts.body,
    fontStyle: 'italic',
    lineHeight: 14,
    marginTop: 2,
  },
  price: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // ── Mini avatar + meta (shared) ──
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  miniAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  miniAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaText: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
    flex: 1,
  },
  viewCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewCountText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // ── Event card (ink bg, inverted) ──
  eventCard: {
    borderWidth: 0,
  },
  eventContent: {
    padding: 14,
    gap: 8,
  },
  eventCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventCategoryText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    lineHeight: 16,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.25,
    lineHeight: 20,
  },
  eventMeta: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },

  // ── Text card (warm tint bg) ──
  textContent: {
    padding: 14,
    gap: 6,
  },
  textCategoryLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 2,
    lineHeight: 16,
  },
  textTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.25,
    lineHeight: 20,
  },
})
