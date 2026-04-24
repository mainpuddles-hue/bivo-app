import { memo, useState, useMemo, useRef, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, Animated, Share, ActionSheetIOS, Alert, Platform } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import {
  MapPin, Crown, ImageIcon, ImageOff, Heart,
  MessageCircle, Clock, Building2,
  Bookmark, BookmarkCheck, User,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { CATEGORIES } from '@/lib/constants'
import { categoryColorsDark } from '@/lib/theme'
import { CATEGORY_ICON_MAP as ICON_MAP } from '@/lib/categoryIcons'
import { useSupabase } from '@/hooks/useSupabase'
import { formatTimeAgo, formatPrice } from '@/lib/format'
import { haversineKm } from '@/lib/geo'
import { isHumanAction } from '@/lib/abuseDetection'
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
  index?: number
}

export const PostCard = memo(function PostCard({ post, userLocation, userId, onInteraction, onHide, index = 0 }: PostCardProps) {
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

  // Image shimmer placeholder
  const [imgLoaded, setImgLoaded] = useState(false)
  const shimmerAnim = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    if (imgLoaded || imgError || !post.image_url) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [imgLoaded, imgError, post.image_url, shimmerAnim])

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
  const user = post.user
  const hasImage = post.image_url && !imgError
  const CategoryIcon = category ? ICON_MAP[category.icon] : null

  const isAnonymous = post.is_anonymous === true
  const isUrgentPost = post.is_urgent && post.expires_at && new Date(post.expires_at).getTime() > Date.now()
  const isExpired = !!(post.expires_at && new Date(post.expires_at).getTime() <= Date.now())

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

  const distanceText = useMemo(() => {
    if (!userLocation || !post.latitude || !post.longitude) return null
    const dist = haversineKm(userLocation.latitude, userLocation.longitude, post.latitude, post.longitude)
    if (dist < 0.1) return '< 0.1 km'
    return t('postCard.distanceKm', { distance: dist < 10 ? dist.toFixed(1) : Math.round(dist).toString() })
  }, [userLocation, post.latitude, post.longitude, t])

  return (
    <Pressable
      accessibilityLabel={a11yLabel}
      accessibilityRole="button"
      accessibilityHint={t('postCard.tapToOpenLongPress') ?? 'Tap to open. Long press for more options'}
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
        onInteraction?.(post.id, 'click')
        // Seed posts have fake IDs — don't navigate to detail (would show eternal spinner)
        if (post.is_seed) return
        router.push(`/post/${post.id}`)
      }}
      onLongPress={async () => {
        if (!isHumanAction()) return
        if (post.is_seed) return
        // Apple HIG: long-press reveals a context menu with options
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}

        const toggleSave = async () => {
          if (!userId) { router.push('/(auth)/login'); return }
          if (savingRef.current) return
          savingRef.current = true
          try {
            if (saved) {
              setSaved(false)
              const { error } = await (supabase.from('saved_posts') as any).delete().eq('post_id', post.id).eq('user_id', userId)
              if (error) setSaved(true)
            } else {
              setSaved(true)
              const { error } = await (supabase.from('saved_posts') as any).insert({ post_id: post.id, user_id: userId })
              if (error && error.code !== '23505') setSaved(false)
            }
          } finally { savingRef.current = false }
        }
        const sharePost = async () => {
          try { await Share.share({ message: post.title + '\n' + APP_URL + '/post/' + post.id }) } catch {}
        }
        const reportPost = () => {
          if (!userId) { router.push('/(auth)/login'); return }
          router.push(`/post/${post.id}`)
        }
        const hidePost = () => {
          if (!userId) { router.push('/(auth)/login'); return }
          onInteraction?.(post.id, 'hide')
          onHide?.(post.id)
        }

        const labels = [
          saved ? t('post.unsave') : t('post.save'),
          t('common.share'),
          t('post.report'),
          userId ? t('postCard.hide') : null,
          t('common.cancel'),
        ].filter(Boolean) as string[]
        const actions: (() => void | Promise<void>)[] = [
          toggleSave,
          sharePost,
          reportPost,
          ...(userId ? [hidePost] : []),
          () => {},
        ]

        if (Platform.OS === 'ios') {
          ActionSheetIOS.showActionSheetWithOptions(
            {
              options: labels,
              cancelButtonIndex: labels.length - 1,
              // Report is destructive-ish → not technically destructive index
              title: post.title,
            },
            (buttonIndex) => {
              if (buttonIndex >= 0 && buttonIndex < actions.length) actions[buttonIndex]()
            },
          )
        } else {
          // Android fallback: Alert.alert with buttons
          Alert.alert(post.title, '', labels.map((text, i) => ({
            text,
            style: i === labels.length - 1 ? ('cancel' as const) : undefined,
            onPress: actions[i],
          })))
        }
      }}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        isUrgentPost && { borderLeftWidth: 3, borderLeftColor: colors.destructive },
        !isUrgentPost && isPro && { borderLeftWidth: 3, borderLeftColor: colors.foreground },
        isExpired && { opacity: 0.55 },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {/* Pro banner — only when no image (crown badge handles image cards) */}
      {isPro && !hasImage && (
        <View style={[styles.proBanner, { backgroundColor: colors.foreground }]}>
          <Crown size={12} color={colors.primaryForeground} />
          <Text style={[styles.proBannerText, { color: colors.primaryForeground }]}>Pro</Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {/* TOP ROW: Avatar + Name + timeAgo on LEFT, Category badge on RIGHT */}
        <View style={styles.topRow}>
          <View style={styles.topRowLeft}>
            {isAnonymous ? (
              <View style={styles.topRowUserInfo}>
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: `${colors.foreground}14`, borderColor: `${colors.foreground}20` }]}>
                  <User size={16} color={colors.foreground} style={styles.iconDimmed} />
                </View>
                <Text style={[styles.userName, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {t('postCard.anonymousNeighbor')}
                </Text>
                {post.created_at && (
                  <Text style={[styles.timeAgoDot, { color: colors.mutedForeground }]}>
                    {'· ' + formatTimeAgo(post.created_at, t, locale)}
                  </Text>
                )}
                {post.location && (
                  <Text style={[styles.timeAgoDot, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {'· ' + post.location}
                  </Text>
                )}
              </View>
            ) : (
              <Pressable onPress={(e) => { e.stopPropagation?.(); if (user?.id) router.push(`/profile/${user.id}` as any) }} style={styles.topRowUserInfo} accessibilityRole="button" accessibilityLabel={user?.name ?? t('postCard.anonymousUser')}>
                <View style={styles.avatarContainer}>
                  {user?.avatar_url ? (
                    <Image source={{ uri: getImageUrl(user.avatar_url, 'thumbnail')! }} style={[
                      styles.avatar,
                      { borderColor: isPro ? `${colors.foreground}80` : `${colors.border}66` }
                    ]} contentFit="cover" cachePolicy="memory-disk" recyclingKey={user.avatar_url} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.muted, borderColor: `${colors.border}66` }]}>
                      <Text style={[styles.avatarInitial, { color: colors.mutedForeground }]}>
                        {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  {isPro && <View style={[styles.statusDot, { backgroundColor: colors.foreground, borderColor: colors.card }]} />}
                </View>
                <View style={styles.userNameBlock}>
                  <View style={styles.userNameRow}>
                    <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
                      {user?.name ?? t('postCard.anonymousUser')}
                    </Text>
                    {isPro && (
                      <View style={[styles.proMicroBadge, { backgroundColor: `${colors.foreground}18` }]}>
                        <Crown size={10} color={colors.foreground} />
                      </View>
                    )}
                    {user?.is_business && (
                      <View style={[styles.businessMicroBadge, { backgroundColor: `${colors.foreground}18` }]}>
                        <Building2 size={10} color={colors.foreground} />
                      </View>
                    )}
                  </View>
                </View>
                {post.created_at && (
                  <Text style={[styles.timeAgoDot, { color: colors.mutedForeground }]}>
                    {'· ' + formatTimeAgo(post.created_at, t, locale)}
                  </Text>
                )}
                {post.location && (
                  <Text style={[styles.timeAgoDot, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {'· ' + post.location}
                  </Text>
                )}
              </Pressable>
            )}
          </View>
          {/* Category badge — top right */}
          <View style={styles.topRowRight}>
            {category && (() => {
              const catColor = isDark ? (categoryColorsDark[post.type] ?? category.color) : category.color
              return (
                <View style={[styles.categoryBadge, { backgroundColor: `${catColor}30` }]}>
                  {CategoryIcon && <CategoryIcon size={14} color={catColor} strokeWidth={2.2} />}
                  <Text style={[styles.categoryBadgeText, { color: catColor }]}>
                    {(() => { const label = t(category.label); return label.charAt(0) + label.slice(1).toLowerCase() })()}
                  </Text>
                </View>
              )
            })()}
          </View>
        </View>

        {/* Image — full width, below user row (Apple News hero style with gradient) */}
        {hasImage ? (
          <View style={styles.imageContainer}>
            {!imgLoaded && (
              <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.muted, opacity: shimmerAnim }]} />
            )}
            <Image
              source={{ uri: getImageUrl(post.image_url, 'medium')! }}
              style={[styles.image, !imgLoaded && { backgroundColor: 'transparent' }]}
              contentFit="cover"
              transition={200}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
              accessibilityLabel={post.title}
              cachePolicy="memory-disk"
              recyclingKey={post.image_url!}
            />
            {/* Subtle bottom overlay for depth */}
            <View style={[styles.imageGradient, { pointerEvents: 'none' }]} />
            {/* Multi-image badge */}
            {post.images && post.images.length > 1 && (
              <View style={styles.multiImageBadge}>
                <ImageIcon size={12} color="#FFFFFF" />
                <Text style={styles.multiImageText}>{post.images.length + 1}</Text>
              </View>
            )}
            {/* Pro crown */}
            {isPro && (
              <View style={[styles.proBadgeOnImage, { backgroundColor: colors.foreground }]}>
                <Crown size={14} color={colors.primaryForeground} />
              </View>
            )}
          </View>
        ) : post.image_url && imgError ? (
          <View style={[styles.imageFallback, { backgroundColor: colors.muted }]}>
            <ImageOff size={32} color={colors.mutedForeground} />
          </View>
        ) : null}

        {/* Expiration badge */}
        {expirationInfo && (() => {
          const expirationColor = expirationInfo.severity === 'urgent' ? colors.destructive : colors.pro
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

        {/* Description — single line preview for context */}
        {post.description ? (
          <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={1}>
            {post.description}
          </Text>
        ) : null}

        {/* Price + condition meta row (location moved to avatar row) */}
        {(post.daily_fee != null || post.service_price != null || (post.type === 'tarjoan' && post.tags?.includes('tarjoan_item'))) && (
          <View style={styles.metaRow}>
            {post.daily_fee != null && (
              <View style={[styles.priceBadge, { backgroundColor: isDark ? CATEGORIES.lainaa.bgDark : CATEGORIES.lainaa.bgLight }]}>
                <Text style={[styles.priceText, { color: isDark ? categoryColorsDark.lainaa : CATEGORIES.lainaa.color }]}>
                  {t('rental.perDay', { price: formatPrice(post.daily_fee, locale) })}
                </Text>
              </View>
            )}
            {post.service_price != null && post.service_price > 0 && (
              <View style={[styles.priceBadge, { backgroundColor: isDark ? CATEGORIES.tarjoan.bgDark : CATEGORIES.tarjoan.bgLight }]}>
                <Text style={[styles.priceText, { color: isDark ? categoryColorsDark.tarjoan : CATEGORIES.tarjoan.color }]}>
                  {formatPrice(post.service_price, locale)}
                </Text>
              </View>
            )}
            {post.type === 'tarjoan' && post.tags?.includes('tarjoan_item') && (post.service_price == null || post.service_price === 0) && (
              <View style={[styles.priceBadge, { backgroundColor: isDark ? CATEGORIES.ilmaista.bgDark : CATEGORIES.ilmaista.bgLight }]}>
                <Text style={[styles.priceText, { color: isDark ? categoryColorsDark.ilmaista : CATEGORIES.ilmaista.color }]}>
                  {t('create.freeItem')}
                </Text>
              </View>
            )}
            {post.type === 'tarjoan' && post.tags?.some(tag => tag.startsWith('condition_')) && (
              <View style={[styles.conditionBadge, { backgroundColor: isDark ? CATEGORIES.tarjoan.bgDark : CATEGORIES.tarjoan.bgLight }]}>
                <Text style={[styles.conditionBadgeText, { color: isDark ? categoryColorsDark.tarjoan : CATEGORIES.tarjoan.color }]}>
                  {(() => {
                    const condTag = post.tags?.find(tag => tag.startsWith('condition_'))
                    if (!condTag) return ''
                    const condKey = 'create.condition' + condTag.replace('condition_', '').charAt(0).toUpperCase() + condTag.replace('condition_', '').slice(1)
                    return t(condKey)
                  })()}
                </Text>
              </View>
            )}
            {/* Location moved to avatar row — inline with name + time */}
          </View>
        )}

        {/* Action row: Like · Comment · Save | More … Distance */}
        <View style={[styles.actionRow, { borderTopColor: `${colors.border}33` }]} accessibilityRole="toolbar" onStartShouldSetResponder={() => true}>
          {/* Like button — always show */}
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={liked ? t('engagement.unlike') : t('engagement.like')}
            accessibilityState={{ selected: liked }}
            style={({ pressed }) => [styles.actionItem, likingRef.current && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
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
                    Animated.spring(likeAnim, { toValue: 1.4, friction: 3, tension: 200, useNativeDriver: true }),
                    Animated.spring(likeAnim, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
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
          >
            <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
              <Heart size={16} color={liked ? colors.destructive : colors.mutedForeground} fill={liked ? colors.destructive : 'transparent'} />
            </Animated.View>
            {likeCount > 0 && <Text style={[styles.actionText, { color: liked ? colors.destructive : colors.mutedForeground }]}>{likeCount}</Text>}
          </Pressable>

          {/* Comment count */}
          <View
            style={styles.actionItem}
            accessibilityRole="text"
            accessibilityLabel={t('engagement.comments', { count: post.comment_count ?? 0 })}
          >
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
            style={({ pressed }) => [styles.actionItem, savingRef.current && { opacity: 0.5 }, pressed && { opacity: 0.7 }]}
          >
            {saved ? (
              <BookmarkCheck size={16} color={colors.foreground} fill={colors.foreground} />
            ) : (
              <Bookmark size={16} color={colors.mutedForeground} />
            )}
          </Pressable>

          {/* Distance — push to right edge */}
          {distanceText && (
            <>
              <View style={styles.flexSpacer} />
              <View style={styles.distanceRow}>
                <MapPin size={12} color={colors.foreground} />
                <Text style={[styles.distanceText, { color: colors.foreground }]}>{distanceText}</Text>
              </View>
            </>
          )}
        </View>
      </View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden', position: 'relative' as const },
  proBanner: {
    height: 22,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  proBannerText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, fontFamily: fonts.bodySemi },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 },

  // Top row: user + category badge
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  topRowLeft: { flex: 1, minWidth: 0 },
  topRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  topRowUserInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userNameBlock: { flexShrink: 1, minWidth: 0 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 17 },
  timeAgoDot: { fontSize: 12, fontFamily: fonts.body, lineHeight: 16, flexShrink: 0 },

  // Avatar
  avatarContainer: { position: 'relative' },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 16 },
  statusDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 7, height: 7, borderRadius: 3.5, borderWidth: 1,
  },

  // Category badge — top right pill
  categoryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999,
    flexShrink: 0,
  },
  categoryBadgeText: { fontSize: 13, fontFamily: fonts.heading, letterSpacing: 0.2, lineHeight: 16 },

  // Image — full width, inline
  imageContainer: { borderRadius: 16, overflow: 'hidden', maxHeight: 200, marginTop: 4 },
  image: { width: '100%', height: 200 },
  imageFallback: { width: '100%', height: 200, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  imageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  multiImageBadge: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  multiImageText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF', lineHeight: 14, fontFamily: fonts.bodySemi },
  proBadgeOnImage: {
    position: 'absolute', top: 8, right: 8,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },

  // Expiration
  expirationBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    alignSelf: 'flex-start',
  },
  expirationText: { fontSize: 11, fontWeight: '600', lineHeight: 12, fontFamily: fonts.bodySemi },

  // Title + description
  title: { fontSize: 17, fontFamily: fonts.heading, lineHeight: 22, letterSpacing: -0.3 },
  seedLabel: { fontSize: 11, fontFamily: fonts.body, fontStyle: 'italic', lineHeight: 14 },
  description: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20 },

  // Meta (price + location)
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  priceBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  priceText: { fontSize: 11, fontWeight: '600', lineHeight: 14, fontFamily: fonts.bodySemi },
  conditionBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  conditionBadgeText: { fontSize: 11, fontWeight: '600', lineHeight: 14, fontFamily: fonts.bodySemi },
  // Action row — tight, touch targets met via hitSlop not minHeight
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, minWidth: 44, paddingHorizontal: 4, justifyContent: 'center' as const },
  actionText: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 16 },
  distanceRow: { marginLeft: 'auto' as any, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  distanceText: { fontSize: 12, fontWeight: '600', lineHeight: 16, fontFamily: fonts.bodySemi },

  // Badges
  proMicroBadge: {
    borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2,
  },
  businessMicroBadge: {
    borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2,
  },
  flexSpacer: { flex: 1 },
  iconDimmed: { opacity: 0.6 },
})
