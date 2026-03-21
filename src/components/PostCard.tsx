import { memo, useState, useMemo, useRef, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, Animated, Share } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import {
  MapPin, Crown, ImageIcon, BadgeCheck, Heart, Zap,
  HandHelping, Gift, BookOpen, CalendarDays, MessageCircle, Clock,
  Share2, Bookmark, BookmarkCheck,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { CATEGORIES } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { formatTimeAgo, formatPrice } from '@/lib/format'
import type { Post, PostType } from '@/lib/types'

function getExpirationInfo(expiresAt: string | null, t: (key: string, params?: Record<string, string | number>) => string): { label: string; color: string } | null {
  if (!expiresAt) return null
  const now = new Date()
  const expires = new Date(expiresAt)
  const diffMs = expires.getTime() - now.getTime()
  if (diffMs <= 0) return { label: t('postCard.expired'), color: '#D94F4F' }
  const diffDays = Math.ceil(diffMs / 86400000)
  if (diffDays <= 0) return { label: t('postCard.expiresToday'), color: '#D94F4F' }
  if (diffDays === 1) return { label: t('postCard.expiresTomorrow'), color: '#E8A050' }
  if (diffDays <= 7) return { label: t('postCard.expiresIn', { count: diffDays }), color: '#E8A050' }
  return null
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
  HandHelping, Gift, Heart, Zap, BookOpen, CalendarDays,
}

interface PostCardProps {
  post: Post
  userLocation?: { latitude: number; longitude: number } | null
  userId?: string | null
}

export const PostCard = memo(function PostCard({ post, userLocation, userId }: PostCardProps) {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()
  const [imgError, setImgError] = useState(false)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0)
  const [saved, setSaved] = useState(false)

  const category = CATEGORIES[post.type as PostType]
  const isPro = post.is_pro_listing
  const isNappaa = post.type === 'nappaa'
  const user = post.user
  const hasImage = post.image_url && !imgError
  const CategoryIcon = category ? ICON_MAP[category.icon] : null
  const isVerified = user?.user_badges?.some(b => b.badge_type === 'verified') ?? false

  const expirationInfo = useMemo(() => getExpirationInfo(post.expires_at, t), [post.expires_at, t])

  // Fix 2: "Uutta" badge — post created less than 1 hour ago
  const isNew = useMemo(() => post.created_at ? Date.now() - new Date(post.created_at).getTime() < 3600000 : false, [post.created_at])

  // Fix 4: Smooth card entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    try {
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    } catch {}
  }, [fadeAnim])

  const distanceText = useMemo(() => {
    if (!userLocation || !post.latitude || !post.longitude) return null
    const dist = calculateDistance(userLocation.latitude, userLocation.longitude, post.latitude, post.longitude)
    if (dist < 0.1) return '< 0.1 km'
    return t('postCard.distanceKm', { distance: dist < 10 ? dist.toFixed(1) : Math.round(dist).toString() })
  }, [userLocation, post.latitude, post.longitude, t])

  const catBgColor = category ? `${category.color}${isDark ? '15' : '08'}` : undefined

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
    <Pressable
      accessibilityLabel={post.title}
      onPress={() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
        router.push(`/post/${post.id}`)
      }}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card },
        isNappaa && !isPro && { borderWidth: 2, borderColor: '#E8A050' },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {/* Left category color bar */}
      <View style={[styles.categoryBar, { backgroundColor: category?.color ?? colors.primary }]} />

      {/* Pro banner at top of card */}
      {isPro && (
        <View style={styles.proBanner}>
          <Text style={styles.proBannerText}>{'⭐ Pro'}</Text>
        </View>
      )}

      {/* Top accent line */}
      <View style={[
        styles.accentLine,
        { backgroundColor: isPro ? colors.pro : isNappaa ? '#E8A050' : category?.color ?? colors.primary }
      ]} />

      {/* Image */}
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
          {post.images && post.images.length > 0 && (
            <View style={styles.multiImageBadge}>
              <ImageIcon size={12} color="#FFFFFF" />
              <Text style={styles.multiImageText}>{post.images.length + 1}</Text>
            </View>
          )}
          {/* Pro crown */}
          {isPro && (
            <View style={[styles.proBadge, { backgroundColor: colors.pro }]}>
              <Crown size={14} color="#FFFFFF" />
            </View>
          )}
          {/* Nappaa urgency */}
          {isNappaa && !isPro && (
            <View style={[styles.proBadge, { backgroundColor: '#E8A050' }]}>
              <Zap size={14} color="#FFFFFF" fill="#FFFFFF" />
            </View>
          )}
        </View>
      )}

      {/* Fix 2: "Uutta" badge for posts less than 1 hour old */}
      {isNew && (
        <View style={styles.newBadge}>
          <Text style={styles.newBadgeText}>{t('feed.new')}</Text>
        </View>
      )}

      {/* Fix 1: Nappaa urgency banner — expiring today */}
      {isNappaa && expirationInfo && expirationInfo.color === '#D94F4F' && (
        <View style={styles.urgencyBanner}>
          <Text style={styles.urgencyText}>{t('feed.expiringToday')}</Text>
        </View>
      )}

      {/* Content — category color background for imageless cards */}
      <View style={[styles.content, !hasImage && catBgColor ? { backgroundColor: catBgColor } : undefined]}>
        {/* Category row + expiration badge */}
        <View style={styles.categoryExpRow}>
          {category && (
            <View style={styles.categoryRow}>
              {CategoryIcon && <CategoryIcon size={10} color={category.color} strokeWidth={2.5} />}
              <Text style={[styles.categoryLabel, { color: category.color }]}>
                {t(category.label)}
              </Text>
              <Text style={[styles.categorySubtitle, { color: colors.mutedForeground }]}>
                {t(category.subtitle)}
              </Text>
            </View>
          )}
          {expirationInfo && (
            <View style={[styles.expirationBadge, { backgroundColor: `${expirationInfo.color}18` }]}>
              <Clock size={10} color={expirationInfo.color} />
              <Text style={[styles.expirationText, { color: expirationInfo.color }]}>{expirationInfo.label}</Text>
            </View>
          )}
        </View>

        {/* Title — larger style for imageless cards */}
        <Text style={[
          styles.title,
          { color: colors.foreground },
          !hasImage && styles.titleLarge,
        ]} numberOfLines={2}>
          {post.title}
        </Text>

        {/* Description for imageless posts */}
        {!hasImage && post.description ? (
          <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
            {post.description}
          </Text>
        ) : null}

        {/* Location + price + distance */}
        {(post.daily_fee != null || post.location || distanceText) && (
          <View style={styles.metaRow}>
            {post.daily_fee != null && (
              <View style={[styles.priceBadge, { backgroundColor: isDark ? '#2D2010' : '#FDF6E8' }]}>
                <Text style={[styles.priceText, { color: '#C98B2E' }]}>
                  {t('rental.perDay', { price: formatPrice(post.daily_fee, locale) })}
                </Text>
              </View>
            )}
            {distanceText && (
              <View style={styles.distanceRow}>
                <MapPin size={11} color={colors.primary} />
                <Text style={[styles.distanceText, { color: colors.primary }]}>{distanceText}</Text>
              </View>
            )}
            {post.location && (
              <View style={styles.locationRow}>
                <MapPin size={12} color={colors.mutedForeground} />
                <Text style={[styles.locationText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {post.location}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Engagement — like button is interactive */}
        <View style={styles.engagementRow}>
          <Pressable
            hitSlop={12}
            onPress={async (e) => {
              e.stopPropagation?.()
              if (!userId) { router.push('/(auth)/login'); return }
              try { Haptics.selectionAsync() } catch {}
              const supabase = createClient()
              if (liked) {
                await (supabase.from('post_likes') as any).delete().eq('post_id', post.id).eq('user_id', userId)
                setLiked(false)
                setLikeCount(c => Math.max(0, c - 1))
              } else {
                await (supabase.from('post_likes') as any).insert({ post_id: post.id, user_id: userId })
                setLiked(true)
                setLikeCount(c => c + 1)
              }
            }}
            style={[styles.engagementItem, !liked && likeCount === 0 && { opacity: 0.3 }]}
          >
            <Heart size={14} color={liked ? '#D94F4F' : colors.mutedForeground} fill={liked ? '#D94F4F' : 'transparent'} />
            <Text style={[styles.engagementText, { color: liked ? '#D94F4F' : colors.mutedForeground }]}>{likeCount}</Text>
          </Pressable>
          <View style={[styles.engagementItem, post.comment_count === 0 && likeCount === 0 && { opacity: 0.3 }]}>
            <MessageCircle size={14} color={colors.mutedForeground} />
            {post.comment_count === 0 && likeCount > 0 ? (
              <Text style={[styles.engagementText, { color: colors.mutedForeground, fontStyle: 'italic' }]}>{t('feed.startConversation')}</Text>
            ) : (
              <Text style={[styles.engagementText, { color: colors.mutedForeground }]}>{post.comment_count}</Text>
            )}
          </View>
          <Pressable
            hitSlop={12}
            onPress={async (e) => {
              e.stopPropagation?.()
              try {
                Haptics.selectionAsync()
                await Share.share({ message: post.title + '\nhttps://tackbird-v2.vercel.app/post/' + post.id })
              } catch {}
            }}
            style={styles.engagementItem}
          >
            <Share2 size={14} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            hitSlop={12}
            onPress={async (e) => {
              e.stopPropagation?.()
              if (!userId) { router.push('/(auth)/login'); return }
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
              const supabase = createClient()
              if (saved) {
                await (supabase.from('saved_posts') as any).delete().eq('post_id', post.id).eq('user_id', userId)
                setSaved(false)
              } else {
                await (supabase.from('saved_posts') as any).insert({ post_id: post.id, user_id: userId })
                setSaved(true)
              }
            }}
            style={styles.engagementItem}
          >
            {saved ? (
              <BookmarkCheck size={14} color={colors.primary} fill={colors.primary} />
            ) : (
              <Bookmark size={14} color={colors.mutedForeground} />
            )}
          </Pressable>
          {likeCount >= 5 && (
            <View style={[styles.popularBadge, { backgroundColor: isDark ? '#D9770615' : '#FEF3C7' }]}>
              <Text style={styles.popularText}>🔥 {t('feed.popular')}</Text>
            </View>
          )}
        </View>

        {/* User row */}
        <View style={styles.userRow}>
          <Pressable onPress={(e) => { e.stopPropagation?.(); if (user?.id) router.push(`/profile/${user.id}` as any) }} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={styles.avatarContainer}>
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={[
                  styles.avatar,
                  { borderColor: isPro ? `${colors.pro}80` : `${colors.border}66` }
                ]} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.muted, borderColor: `${colors.border}66` }]}>
                  <Text style={[styles.avatarInitial, { color: colors.mutedForeground }]}>
                    {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
              {isPro && <View style={[styles.statusDot, { backgroundColor: colors.pro, borderColor: colors.card }]} />}
            </View>

            <View style={styles.userInfo}>
              <View style={styles.userNameRow}>
                <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
                  {user?.name ?? t('postCard.anonymousUser')}
                </Text>
                {isVerified && <BadgeCheck size={14} color={colors.info} />}
              </View>
              {post.created_at && (
                <Text style={[styles.timeAgo, { color: colors.mutedForeground }]}>
                  {formatTimeAgo(post.created_at, t, locale)}
                </Text>
              )}
            </View>
          </Pressable>
        </View>
      </View>
    </Pressable>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  card: { borderRadius: 12, overflow: 'hidden', position: 'relative' as const },
  categoryBar: { position: 'absolute' as const, left: 0, top: 0, bottom: 0, width: 6, zIndex: 1, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  proBanner: {
    height: 22, backgroundColor: '#F59E0B',
    alignItems: 'center', justifyContent: 'center',
  },
  proBannerText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
  accentLine: { height: 2 },
  imageContainer: { aspectRatio: 3 / 2, position: 'relative' },
  image: { width: '100%', height: '100%' },
  multiImageBadge: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  multiImageText: { fontSize: 10, fontWeight: '600', color: '#FFFFFF', lineHeight: 13 },
  proBadge: {
    position: 'absolute', top: 10, right: 10,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 8 },
  categoryExpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  expirationBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
  },
  expirationText: { fontSize: 9, fontWeight: '600', lineHeight: 11.7 },
  categoryLabel: { fontSize: 10, fontFamily: fonts.bodyMedium, letterSpacing: 0.5, textTransform: 'uppercase', lineHeight: 13 },
  categorySubtitle: { fontSize: 10, fontFamily: fonts.body, lineHeight: 13 },
  title: { fontSize: 16, fontFamily: fonts.headingSemi, lineHeight: 22, letterSpacing: -0.16 },
  titleLarge: { fontSize: 18, fontFamily: fonts.headingSemi, letterSpacing: -0.18, lineHeight: 24 },
  description: { fontSize: 13, fontFamily: fonts.body, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  priceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  priceText: { fontSize: 11, fontWeight: '600', lineHeight: 14.3 },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  distanceText: { fontSize: 10, fontWeight: '600', lineHeight: 13 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 },
  locationText: { fontSize: 11, fontFamily: fonts.body, flex: 1, lineHeight: 14.3 },
  engagementRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  engagementItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  engagementText: { fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 15.6 },
  popularBadge: { marginLeft: 'auto' as any, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  popularText: { fontSize: 11, fontFamily: fonts.bodyMedium, color: '#D97706', lineHeight: 14.3 },
  userRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 8 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 13, fontWeight: '600' },
  statusDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 8, height: 8, borderRadius: 4, borderWidth: 1,
  },
  userInfo: { flex: 1, gap: 1 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userName: { fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 17 },
  timeAgo: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14.3 },
  // Fix 2: "Uutta" / "New" badge
  newBadge: {
    position: 'absolute' as const, top: 10, left: 16, zIndex: 2,
    backgroundColor: '#2B8A62', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  newBadgeText: { fontSize: 9, fontWeight: '700', color: '#FFFFFF', fontFamily: fonts.bodySemi },
  // Fix 1: Nappaa urgency banner
  urgencyBanner: {
    backgroundColor: '#D94F4F', paddingVertical: 4,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  urgencyText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF', fontFamily: fonts.bodySemi, letterSpacing: 0.3 },
})
