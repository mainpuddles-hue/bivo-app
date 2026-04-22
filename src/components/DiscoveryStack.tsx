/**
 * DiscoveryStack — Swipeable card stack for feed discovery.
 *
 * Replaces the static hero card with a Tinder-style swipeable stack
 * showing top-ranked posts from the feed algorithm.
 *
 * Swipe RIGHT = like + save (optimistic)
 * Swipe LEFT  = skip (track interaction)
 * Swipe UP    = open post detail
 * Tap         = open post detail
 *
 * Uses react-native-gesture-handler Gesture API (v2) +
 * react-native-reanimated for 60fps animations.
 */
import { memo, useCallback, useMemo, useState } from 'react'
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { GestureDetector, Gesture } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
} from 'react-native-reanimated'
import { Heart, Star, ChevronRight, ArrowRight } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import { CATEGORIES } from '@/lib/constants'
import { getImageUrl } from '@/lib/imageUtils'
import { haversineKm } from '@/lib/geo'
import { PressableOpacity } from '@/components/ui'
import type { Post, PostType } from '@/lib/types'

const SWIPE_THRESHOLD = 120
const SWIPE_UP_THRESHOLD = 80
const SPRING_CONFIG = { damping: 15, stiffness: 180 }
const MAX_ROTATION = 15

interface DiscoveryStackProps {
  posts: Post[]
  userId?: string | null
  onInteraction?: (postId: string, type: 'view' | 'click' | 'like' | 'save' | 'message' | 'skip' | 'hide') => void
  userNeighborhood?: string | null
  userLocation?: { latitude: number; longitude: number } | null
}

export const DiscoveryStack = memo(function DiscoveryStack({
  posts,
  userId,
  onInteraction,
  userNeighborhood,
  userLocation,
}: DiscoveryStackProps) {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()
  const reduceMotion = useReduceMotion()
  const supabase = useSupabase()
  const { width: screenWidth } = useWindowDimensions()

  const [currentIndex, setCurrentIndex] = useState(0)
  const stackDone = currentIndex >= posts.length

  // Shared values for the top card
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)

  const currentPost = posts[currentIndex]
  const nextPost = posts[currentIndex + 1]

  const advanceCard = useCallback(() => {
    setCurrentIndex(prev => prev + 1)
    translateX.value = 0
    translateY.value = 0
  }, [translateX, translateY])

  const handleSwipeRight = useCallback(() => {
    if (!currentPost) return
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    onInteraction?.(currentPost.id, 'like')
    // Optimistic like
    if (userId) {
      (supabase.from('post_likes') as any)
        .insert({ post_id: currentPost.id, user_id: userId })
        .catch(() => {})
    }
    advanceCard()
  }, [currentPost, userId, supabase, onInteraction, advanceCard])

  const handleSwipeLeft = useCallback(() => {
    if (!currentPost) return
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    onInteraction?.(currentPost.id, 'skip')
    advanceCard()
  }, [currentPost, onInteraction, advanceCard])

  const handleSwipeUp = useCallback(() => {
    if (!currentPost) return
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
    onInteraction?.(currentPost.id, 'click')
    router.push(`/post/${currentPost.id}`)
    advanceCard()
  }, [currentPost, onInteraction, router, advanceCard])

  const handleTap = useCallback(() => {
    if (!currentPost) return
    try { Haptics.selectionAsync() } catch {}
    onInteraction?.(currentPost.id, 'click')
    router.push(`/post/${currentPost.id}`)
  }, [currentPost, onInteraction, router])

  // Gesture handler
  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX
      translateY.value = e.translationY
    })
    .onEnd((e) => {
      // Swipe up
      if (e.translationY < -SWIPE_UP_THRESHOLD && Math.abs(e.translationX) < SWIPE_THRESHOLD) {
        translateY.value = reduceMotion
          ? withTiming(-400, { duration: 0 })
          : withSpring(-400, SPRING_CONFIG)
        runOnJS(handleSwipeUp)()
        return
      }
      // Swipe right
      if (e.translationX > SWIPE_THRESHOLD) {
        translateX.value = reduceMotion
          ? withTiming(screenWidth, { duration: 0 })
          : withSpring(screenWidth, SPRING_CONFIG)
        runOnJS(handleSwipeRight)()
        return
      }
      // Swipe left
      if (e.translationX < -SWIPE_THRESHOLD) {
        translateX.value = reduceMotion
          ? withTiming(-screenWidth, { duration: 0 })
          : withSpring(-screenWidth, SPRING_CONFIG)
        runOnJS(handleSwipeLeft)()
        return
      }
      // Snap back
      translateX.value = reduceMotion
        ? withTiming(0, { duration: 0 })
        : withSpring(0, SPRING_CONFIG)
      translateY.value = reduceMotion
        ? withTiming(0, { duration: 0 })
        : withSpring(0, SPRING_CONFIG)
    })

  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(handleTap)()
  })

  const composedGesture = Gesture.Race(panGesture, tapGesture)

  // Animated styles for top card
  const topCardStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      translateX.value,
      [-screenWidth, 0, screenWidth],
      [-MAX_ROTATION, 0, MAX_ROTATION],
    )
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation}deg` },
      ],
    }
  })

  // Animated style for next card (peek)
  const nextCardStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      Math.abs(translateX.value),
      [0, SWIPE_THRESHOLD],
      [0.95, 1],
      'clamp',
    )
    return {
      transform: [{ scale }],
      opacity: interpolate(
        Math.abs(translateX.value),
        [0, SWIPE_THRESHOLD],
        [0.7, 1],
        'clamp',
      ),
    }
  })

  if (stackDone) {
    return (
      <View style={[styles.doneWrapper, { paddingHorizontal: 20 }]}>
        <PressableOpacity
          onPress={() => setCurrentIndex(0)}
          style={[styles.seeAllBtn, { backgroundColor: colors.foreground }]}
          accessibilityLabel={t('feed.morePosts')}
          accessibilityRole="button"
        >
          <ArrowRight size={16} color={colors.background} />
          <Text style={[styles.seeAllText, { color: colors.background }]}>
            {t('feed.morePosts') ?? 'More posts'}
          </Text>
        </PressableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.wrapper}>
      {/* Next card (behind) */}
      {nextPost && (
        <Animated.View style={[styles.cardContainer, styles.nextCard, nextCardStyle]}>
          <CardContent
            post={nextPost}
            colors={colors}
            isDark={isDark}
            t={t}
            locale={locale}
            userNeighborhood={userNeighborhood}
            userLocation={userLocation}
          />
        </Animated.View>
      )}

      {/* Top card (interactive) */}
      {currentPost && (
        <GestureDetector gesture={composedGesture}>
          <Animated.View
            style={[styles.cardContainer, topCardStyle]}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`${currentPost.title}, ${(currentPost.user as any)?.name ?? ''}`}
            accessibilityHint={t('discover.swipeHintA11y') ?? 'Tap to open. Swipe right to like, left to skip, up to open details'}
          >
            <CardContent
              post={currentPost}
              colors={colors}
              isDark={isDark}
              t={t}
              locale={locale}
              userNeighborhood={userNeighborhood}
              userLocation={userLocation}
            />
          </Animated.View>
        </GestureDetector>
      )}

      {/* Swipe hint */}
      <View style={styles.hintRow}>
        <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
          {t('discover.swipeHint') ?? 'Swipe to discover'}
        </Text>
        <Text style={[styles.hintCounter, { color: colors.mutedForeground }]}>
          {currentIndex + 1}/{posts.length}
        </Text>
      </View>
    </View>
  )
})

// ── Static card content (no gesture/animation) ──

interface CardContentProps {
  post: Post
  colors: any
  isDark: boolean
  t: (key: string, params?: any) => string
  locale: string
  userNeighborhood?: string | null
  userLocation?: { latitude: number; longitude: number } | null
}

function CardContent({ post, colors, isDark, t, locale, userNeighborhood, userLocation }: CardContentProps) {
  const imageUrl = useMemo(() => {
    if (post.images && post.images.length > 0) return getImageUrl(post.images[0].image_url, 'medium')
    return getImageUrl(post.image_url, 'medium')
  }, [post])

  const distance = useMemo(() => {
    if (!userLocation || post.latitude == null || post.longitude == null) return null
    const km = haversineKm(userLocation.latitude, userLocation.longitude, post.latitude, post.longitude)
    if (km < 1) return `${Math.round(km * 1000)} m`
    return `${km.toFixed(1)} km`
  }, [post, userLocation])

  const categoryLabel = useMemo(() => {
    const cat = CATEGORIES[post.type as PostType]
    return cat ? t(cat.label) : post.type
  }, [post.type, t])

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.imageWrap}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            contentFit="cover"
            transition={300}
            recyclingKey={imageUrl}
            accessible={false}
          />
        ) : (
          <View style={[styles.image, { backgroundColor: colors.warmTint }]}>
            <Text style={[styles.imagePlaceholder, { color: colors.mutedForeground }]}>
              {categoryLabel}
            </Text>
          </View>
        )}

        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.72)']}
          locations={[0.38, 0.68, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={[styles.heartCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Heart
            size={16}
            color={post.is_liked ? '#EF4444' : colors.foreground}
            fill={post.is_liked ? '#EF4444' : 'none'}
            strokeWidth={1.8}
          />
        </View>

        <View style={styles.overlay}>
          <Text style={styles.neighborhood}>
            {(post.user as any)?.naapurusto ?? userNeighborhood ?? 'Helsinki'}
          </Text>
          <Text style={styles.title} numberOfLines={2}>
            {post.title}
          </Text>
          <View style={styles.meta}>
            {post.like_count > 0 && (
              <View style={styles.ratingPill}>
                <Star size={11} color="#fff" fill="#fff" />
                <Text style={styles.ratingText}>
                  {post.like_count > 99 ? '99+' : post.like_count}
                </Text>
              </View>
            )}
            {post.comment_count > 0 && (
              <Text style={styles.metaText}>
                {post.comment_count} {t('post.comments') ?? 'kommenttia'}
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.cta}>
        <View style={styles.ctaLeft}>
          <Text style={[styles.ctaOwner, { color: colors.mutedForeground }]} numberOfLines={1}>
            {(post.user as any)?.name ?? '?'}
            {distance ? ` · ${distance}` : ''}
          </Text>
          <Text style={[styles.ctaAction, { color: colors.foreground }]}>
            {categoryLabel}
          </Text>
        </View>
        <View style={[styles.ctaArrow, { backgroundColor: colors.foreground }]}>
          <ChevronRight size={16} color={colors.background} strokeWidth={2.2} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 20,
    paddingTop: 4,
    marginBottom: 20,
    height: 340,
  },
  cardContainer: {
    position: 'absolute',
    top: 4,
    left: 20,
    right: 20,
  },
  nextCard: {
    zIndex: 0,
  },

  // Done state
  doneWrapper: {
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: 'center',
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
    minHeight: 48,
  },
  seeAllText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },

  // Hint row
  hintRow: {
    position: 'absolute',
    bottom: 0,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hintText: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    letterSpacing: 0.3,
  },
  hintCounter: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    letterSpacing: 0.3,
  },

  // Card
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
  },
  imageWrap: {
    aspectRatio: 4 / 3,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholder: {
    fontSize: 32,
    fontWeight: '600',
    fontFamily: fonts.heading,
    opacity: 0.4,
  },
  heartCircle: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  overlay: {
    position: 'absolute',
    left: 18,
    bottom: 14,
    zIndex: 2,
  },
  neighborhood: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    opacity: 0.85,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.5,
    marginTop: 2,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 999,
  },
  ratingText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontFamily: fonts.bodyMedium,
  },
  metaText: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.9,
    fontFamily: fonts.body,
  },

  // CTA row
  cta: {
    padding: 8,
    paddingLeft: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ctaLeft: {
    flex: 1,
    marginRight: 12,
  },
  ctaOwner: {
    fontSize: 11,
    letterSpacing: 0.2,
    fontFamily: fonts.body,
    lineHeight: 14,
  },
  ctaAction: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    marginTop: 2,
    lineHeight: 20,
  },
  ctaArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
