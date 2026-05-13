/**
 * PostCardGrid v3 — Helsinki Monochrome, three-variant card system.
 *
 * Variants (intentional visual rhythm in 2-col masonry):
 *   IMAGE → 4:5 photo hero, gradient overlay, price pill, category chip
 *   INK   → solid foreground bg (events), large date display, inverted text
 *   TINT  → warm-tint bg, text-only posts, category label, large title
 */
import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet, Animated, Platform } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Heart, Calendar, Clock, Eye, Users, ShieldCheck } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { isValidUUID } from '@/lib/validation'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { CATEGORIES } from '@/lib/constants'
import { useSupabase } from '@/hooks/useSupabase'
import { useToast } from '@/components/Toast'
import { formatTimeAgo, formatPrice, formatEventDateShort } from '@/lib/format'
import { isHumanAction } from '@/lib/abuseDetection'
import { getImageUrl } from '@/lib/imageUtils'
import type { Post, PostType } from '@/lib/types'

type CardVariant = 'image' | 'ink' | 'tint'

function getCardVariant(post: Post, hasImageOverride?: boolean): CardVariant {
  const hasImage = hasImageOverride ?? !!post.image_url
  if (post.type === 'tapahtuma') return 'ink'
  if (hasImage) return 'image'
  return 'tint'
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

export const PostCardGrid = memo(function PostCardGrid({ post, userId, onInteraction, index = 0, sortBy, followedIds, viewCount }: PostCardGridProps) {
  const { colors, isDark } = useTheme()
  const reduceMotion = useReduceMotion()
  const { t, locale } = useI18n()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()

  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [liked, setLiked] = useState(post.is_liked ?? false)
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0)
  const likingRef = useRef(false)
  const mountedRef = useRef(true)
  const likeAnim = useRef(new Animated.Value(1)).current
  const shimmerAnim = useRef(new Animated.Value(0.4)).current
  const entryOpacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current
  const entryTranslateY = useRef(new Animated.Value(reduceMotion ? 0 : 22)).current

  useEffect(() => {
    mountedRef.current = true
    if (reduceMotion) return
    const delay = Math.min(index * 60, 300)
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(entryOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.spring(entryTranslateY, { toValue: 0, friction: 7, tension: 65, useNativeDriver: true }),
      ]).start()
    }, delay)
    return () => { mountedRef.current = false; clearTimeout(timer) }
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

  useEffect(() => {
    if (!likingRef.current) {
      if (post.is_liked !== undefined) setLiked(post.is_liked)
      setLikeCount(post.like_count ?? 0)
    }
  }, [post.id, post.is_liked, post.like_count])

  const category = CATEGORIES[post.type as PostType]
  const effectiveImageUrl = post.image_url || (post.images?.[0]?.image_url ?? null)
  const hasImage = !!(effectiveImageUrl && !imgError)
  const variant = getCardVariant(post, hasImage)
  const isAnonymous = post.is_anonymous === true
  const isExpired = !!(post.expires_at && new Date(post.expires_at).getTime() <= Date.now())
  const isUrgent = post.is_urgent && !isExpired
  const user = post.user
  const authorName = isAnonymous ? t('postCard.anonymousNeighbor') : (user?.name ?? '')
  const timeAgo = post.created_at ? formatTimeAgo(post.created_at, t, locale) : ''

  const a11yLabel = useMemo(() => {
    const parts: string[] = []
    if (category) parts.push(t(category.label))
    parts.push(post.title)
    if (authorName) parts.push(`${t('common.by') ?? ''} ${authorName}`.trim())
    if (post.location) parts.push(post.location)
    if (timeAgo) parts.push(timeAgo)
    return parts.filter(Boolean).join(', ')
  }, [category, post, variant, authorName, timeAgo, t])

  const handlePress = () => {
    try { Haptics.selectionAsync() } catch {}
    onInteraction?.(post.id, 'click')
    if (post.id.startsWith('event-')) {
      const eventId = post.id.replace('event-', '')
      if (isValidUUID(eventId)) router.push(`/event/${eventId}`)
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
        if (__DEV__) console.warn('[card] like failed:', error.message, error.code)
        if (mountedRef.current) {
          setLiked(wasLiked)
          setLikeCount(prevCount)
          // Surface failure to the user — silent revert hides missing-table
          // errors (PGRST205 / 42P01) and looks like the tap simply did nothing.
          if (error.code !== '23505') {
            toast.show({ message: t('engagement.likeFailed'), type: 'error' })
          } else {
            // Duplicate key: already liked, keep optimistic state
            setLiked(true)
          }
        }
        return
      }
      if (!wasLiked) onInteraction?.(post.id, 'like')
    } catch {
      if (mountedRef.current) {
        setLiked(wasLiked)
        setLikeCount(prevCount)
      }
    } finally {
      likingRef.current = false
    }
  }

  // Spring-physics press feedback
  const cardScale = useRef(new Animated.Value(1)).current
  const handleCardPressIn = useCallback(() => {
    if (reduceMotion) { cardScale.setValue(0.965); return }
    Animated.spring(cardScale, { toValue: 0.965, friction: 5, tension: 220, useNativeDriver: true }).start()
  }, [cardScale, reduceMotion])
  const handleCardPressOut = useCallback(() => {
    if (reduceMotion) { cardScale.setValue(1); return }
    Animated.spring(cardScale, { toValue: 1, friction: 3.5, tension: 280, useNativeDriver: true }).start()
  }, [cardScale, reduceMotion])

  // ── Mini avatar + meta footer ──
  const MetaFooter = (metaColor: string, nameColor?: string) => (
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
          <Text style={{ fontSize: 9, fontFamily: fonts.bodySemi, color: metaColor }}>{user?.name?.charAt(0)?.toUpperCase() ?? '?'}</Text>
        </View>
      )}
      <Text style={[styles.metaName, { color: nameColor ?? colors.foreground }]} numberOfLines={1}>
        {authorName}
      </Text>
      {(user as any)?.is_verified && (
        <ShieldCheck size={11} color={colors.success} strokeWidth={2.4} />
      )}
      <Text style={[styles.metaDivider, { color: colors.tertiaryForeground }]}>·</Text>
      <Text style={[styles.metaDistance, { color: metaColor }]} numberOfLines={1}>
        {post.location ?? timeAgo}
      </Text>
    </View>
  )

  // ── Like count chip (overlaid on image) ──
  const LikeChip = () => {
    if (likeCount < 10 && !liked) return null
    return (
      <Pressable
        onPress={(e) => { e?.stopPropagation?.(); handleLike() }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={liked ? t('engagement.unlike') : t('engagement.like')}
        accessibilityState={{ selected: liked }}
        style={({ pressed }) => [styles.countChip, pressed && { opacity: 0.7 }]}
      >
        <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
          <Heart
            size={11}
            color="#FFFFFF"
            fill={liked ? '#FFFFFF' : 'transparent'}
            strokeWidth={2}
          />
        </Animated.View>
        <Text style={styles.countChipText}>{likeCount}</Text>
      </Pressable>
    )
  }

  // ─── IMAGE: photo-first, 4:5 aspect ratio ───
  if (variant === 'image') {
    return (
      <Animated.View style={{ flex: 1, opacity: entryOpacity, transform: [{ scale: cardScale }, { translateY: entryTranslateY }] }}>
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
          {/* Photo with 4:5 aspect ratio */}
          <View style={[styles.imageWrap, { backgroundColor: colors.muted }]}>
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
            {/* Gradient overlay */}
            <View style={styles.imgGradient} />
            {/* Top row: availability badge + like/urgent chip */}
            <View style={styles.imgTopRow}>
              {!isExpired ? (
                <View style={styles.availBadge}>
                  <View style={[styles.availDot, { backgroundColor: colors.success }]} />
                  <Text style={[styles.availText, { color: colors.success }]}>{t('postCard.now') ?? 'Nyt'}</Text>
                </View>
              ) : category ? (
                <View style={[styles.catChip, isDark && styles.catChipDark]}>
                  <Text style={[styles.catChipText, isDark && styles.catChipTextDark]}>{t(category.label)}</Text>
                </View>
              ) : <View />}
              {isUrgent ? (
                <View style={[styles.urgentChip, { backgroundColor: colors.destructive }]}>
                  <Clock size={10} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.urgentChipText}>{t('postCard.urgent')}</Text>
                </View>
              ) : (
                <LikeChip />
              )}
            </View>
            {/* Bottom row: price pill — Wolt-grade 2-line stack so the
                price reads as the focal element of the card, not as
                metadata. Free items collapse to a single ILMAISTA label. */}
            {(post.daily_fee != null || (post.service_price != null && post.service_price > 0)) && (
              <View style={styles.imgBottomRow}>
                {post.daily_fee != null && post.daily_fee === 0 ? (
                  <View style={[styles.pricePillFree, isDark && styles.pricePillDark]}>
                    <Text style={[styles.pricePillFreeText, isDark && styles.pricePillTextDark]}>
                      {t('common.free')}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.pricePillStack, isDark && styles.pricePillDark]}>
                    <Text style={[styles.pricePillAmount, isDark && styles.pricePillTextDark]}>
                      {post.daily_fee != null
                        ? formatPrice(post.daily_fee, locale)
                        : formatPrice(post.service_price ?? 0, locale)}
                    </Text>
                    <Text style={[styles.pricePillUnit, { color: isDark ? '#9AA0A6' : '#535A60' }]}>
                      {post.daily_fee != null
                        ? (t('rental.perDayUnit') ?? 'PER PÄIVÄ')
                        : (t('service.perTaskUnit') ?? 'PER TYÖ')}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
          {/* Content below image */}
          <View style={styles.imgContent}>
            <Text style={[styles.imgTitle, { color: colors.foreground }]} numberOfLines={1}>
              {post.title}
            </Text>
            <Text style={[styles.imgSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
              {[
                post.location ?? timeAgo,
                post.daily_fee != null ? formatPrice(post.daily_fee, locale) : post.service_price != null && post.service_price > 0 ? formatPrice(post.service_price, locale) : null,
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  // ─── INK: events with dark background, large date display ───
  if (variant === 'ink') {
    // Parse event date for display
    const eventDateStr = post.event_date ? new Date(post.event_date) : null
    const dayLabel = eventDateStr
      ? eventDateStr.toLocaleDateString(locale === 'fi' ? 'fi-FI' : locale, { weekday: 'short' }).toUpperCase()
      : ''
    const dateNum = eventDateStr
      ? `${eventDateStr.getDate()}.${eventDateStr.getMonth() + 1}.`
      : ''

    return (
      <Animated.View style={{ flex: 1, opacity: entryOpacity, transform: [{ scale: cardScale }, { translateY: entryTranslateY }] }}>
        <Pressable
          onPress={handlePress}
          onPressIn={handleCardPressIn}
          onPressOut={handleCardPressOut}
          accessibilityRole="button"
          accessibilityLabel={a11yLabel}
          style={[
            styles.card,
            styles.inkCard,
            { backgroundColor: colors.foreground, shadowOpacity: isDark ? 0.22 : 0.10 },
            isExpired && { opacity: 0.55 },
          ]}
        >
          {/* Date display */}
          <View>
            <Text style={[styles.inkDay, { color: colors.onInkMuted }]}>{dayLabel}</Text>
            <Text style={[styles.inkDate, { color: colors.background }]}>{dateNum}</Text>
          </View>
          {/* Title */}
          <Text style={[styles.inkTitle, { color: colors.background }]} numberOfLines={3}>
            {post.title}
          </Text>
          {/* Bottom meta */}
          <View style={[styles.inkBottom, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)' }]}>
            <Users size={12} color={colors.onInkMuted} strokeWidth={2} />
            <Text style={[styles.inkBottomText, { color: colors.onInkMuted }]}>
              {post.location ?? ''}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    )
  }

  // ─── TINT: warm-tint background, text-only posts ───
  return (
    <Animated.View style={{ flex: 1, opacity: entryOpacity, transform: [{ scale: cardScale }, { translateY: entryTranslateY }] }}>
      <Pressable
        onPress={handlePress}
        onPressIn={handleCardPressIn}
        onPressOut={handleCardPressOut}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        style={[
          styles.card,
          styles.tintCard,
          { backgroundColor: colors.warmTint, borderColor: colors.border },
          isExpired && { opacity: 0.55 },
        ]}
      >
        {/* Top row: category + urgent */}
        <View style={styles.tintTopRow}>
          {category && (
            <Text style={[styles.tintCatLabel, { color: colors.mutedForeground }]}>
              {t(category.label)}
            </Text>
          )}
          {isUrgent && (
            <View style={[styles.urgentInline, { backgroundColor: colors.foreground }]}>
              <Text style={[styles.urgentInlineText, { color: colors.background }]}>
                {t('postCard.urgent')}
              </Text>
            </View>
          )}
        </View>
        {/* Title */}
        <Text style={[styles.tintTitle, { color: colors.foreground }]} numberOfLines={3}>
          {post.title}
        </Text>
        {!!post.description && (
          <Text style={[styles.descSnippet, { color: colors.mutedForeground }]} numberOfLines={2}>
            {post.description}
          </Text>
        )}
        {post.is_seed && (
          <Text style={[styles.seedLabel, { color: colors.mutedForeground }]}>{t('feed.examplePost')}</Text>
        )}
        {/* Meta footer */}
        {MetaFooter(colors.mutedForeground)}
      </Pressable>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    // Depth: soft shadow system for physical-object feel
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    ...Platform.select({ android: { elevation: 4 } }),
  },

  // ── IMAGE variant ──
  imageWrap: {
    position: 'relative',
    overflow: 'hidden',
    aspectRatio: 4 / 5,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imgGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  imgTopRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  catChipDark: {
    backgroundColor: 'rgba(30,30,30,0.92)',
  },
  catChipText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#1A1D1F',
  },
  catChipTextDark: {
    color: '#E8E6E0',
  },
  urgentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  urgentChipText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#FFFFFF',
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  countChipText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    color: '#FFFFFF',
    lineHeight: 14,
  },
  imgBottomRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pricePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  pricePillStack: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'flex-start',
  },
  pricePillFree: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  pricePillDark: {
    backgroundColor: 'rgba(30,30,30,0.92)',
  },
  pricePillAmount: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: fonts.displayBold,
    letterSpacing: -0.8,
    lineHeight: 24,
    color: '#1A1D1F',
    fontVariant: ['tabular-nums'],
  },
  pricePillUnit: {
    fontSize: 8,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  pricePillFreeText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#1A1D1F',
  },
  pricePillText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.1,
    color: '#1A1D1F',
  },
  pricePillTextDark: {
    color: '#E8E6E0',
  },
  availBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  availDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  availText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    letterSpacing: 1,
    lineHeight: 12,
  },
  imgContent: {
    padding: 14,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 3,
  },
  imgTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.3,
    lineHeight: 18,
  },
  imgSubtitle: {
    fontSize: 11,
    fontFamily: fonts.body,
    letterSpacing: 0.2,
    lineHeight: 15,
    marginTop: 2,
  },

  // ── INK variant (events) ──
  inkCard: {
    borderWidth: 0,
    padding: 22,
    paddingTop: 24,
    gap: 12,
    minHeight: 280,
    // Deeper shadow for ink cards — they sit forward
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    ...Platform.select({ android: { elevation: 8 } }),
  },
  inkDay: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    letterSpacing: 3,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  inkDate: {
    fontSize: 52,
    fontWeight: '700',
    fontFamily: fonts.displayBold,
    letterSpacing: -3,
    lineHeight: 48,
    marginTop: 4,
  },
  inkTitle: {
    fontSize: 17,
    fontWeight: '600',
    fontFamily: fonts.display,
    letterSpacing: -0.4,
    lineHeight: 22,
    flex: 1,
    marginTop: 4,
  },
  inkBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 'auto',
  },
  inkBottomText: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 14,
    letterSpacing: 0.2,
    flex: 1,
  },

  // ── TINT variant (text-only) ──
  // minHeight aligned with INK (280) so a TINT card sitting next to an INK
  // event card or a 4:5 IMAGE card occupies the same visual slot.
  tintCard: {
    padding: 20,
    paddingTop: 22,
    gap: 8,
    minHeight: 280,
  },
  tintTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  tintCatLabel: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  urgentInline: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  urgentInlineText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    lineHeight: 12,
  },
  tintTitle: {
    fontSize: 21,
    fontWeight: '600',
    fontFamily: fonts.display,
    letterSpacing: -0.7,
    lineHeight: 26,
    flex: 1,
  },

  // ── Shared ──
  descSnippet: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
  },
  seedLabel: {
    fontSize: 11,
    fontFamily: fonts.body,
    fontStyle: 'italic',
    lineHeight: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 'auto',
    paddingTop: 6,
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
  metaName: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    flex: 1,
    lineHeight: 14,
  },
  metaDivider: {
    fontSize: 11,
    lineHeight: 14,
  },
  metaDistance: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 14,
  },
})
