import { memo, useState, useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import {
  MapPin, Crown, ImageIcon, BadgeCheck, Heart, Zap,
  HandHelping, Gift, BookOpen, CalendarDays, MessageCircle, Clock, Navigation,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { CATEGORIES } from '@/lib/constants'
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
}

export const PostCard = memo(function PostCard({ post, userLocation }: PostCardProps) {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()
  const [imgError, setImgError] = useState(false)

  const category = CATEGORIES[post.type as PostType]
  const isPro = post.is_pro_listing
  const isNappaa = post.type === 'nappaa'
  const user = post.user
  const hasImage = post.image_url && !imgError
  const CategoryIcon = category ? ICON_MAP[category.icon] : null
  const isVerified = user?.user_badges?.some(b => b.badge_type === 'verified') ?? false

  const expirationInfo = useMemo(() => getExpirationInfo(post.expires_at, t), [post.expires_at, t])

  const distanceText = useMemo(() => {
    if (!userLocation || !post.latitude || !post.longitude) return null
    const dist = calculateDistance(userLocation.latitude, userLocation.longitude, post.latitude, post.longitude)
    if (dist < 0.1) return '< 0.1 km'
    return t('postCard.distanceKm', { distance: dist < 10 ? dist.toFixed(1) : Math.round(dist).toString() })
  }, [userLocation, post.latitude, post.longitude, t])

  return (
    <Pressable
      onPress={() => router.push(`/post/${post.id}`)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card },
        isPro && { borderWidth: 2, borderColor: 'rgba(245,158,11,0.5)' },
        isNappaa && !isPro && { borderWidth: 2, borderColor: '#E8A050' },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
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

      {/* Content */}
      <View style={styles.content}>
        {/* Category row + expiration badge */}
        <View style={styles.categoryExpRow}>
          {category && (
            <View style={styles.categoryRow}>
              {CategoryIcon && <CategoryIcon size={14} color={category.color} />}
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

        {/* Title */}
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
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
                <Navigation size={10} color={colors.primary} />
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

        {/* Engagement — always show heart + comment counts */}
        <View style={styles.engagementRow}>
          <View style={styles.engagementItem}>
            <Heart size={12} color={post.like_count > 0 ? '#D94F4F' : colors.mutedForeground} />
            <Text style={[styles.engagementText, { color: colors.mutedForeground }]}>{post.like_count}</Text>
          </View>
          <View style={styles.engagementItem}>
            <MessageCircle size={12} color={colors.mutedForeground} />
            <Text style={[styles.engagementText, { color: colors.mutedForeground }]}>{post.comment_count}</Text>
          </View>
        </View>

        {/* User row */}
        <View style={styles.userRow}>
          <Pressable onPress={(e) => { e.stopPropagation?.(); if (user?.id) router.push(`/profile/${user.id}` as any) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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

            <Text style={[styles.userName, { color: colors.mutedForeground }]} numberOfLines={1}>
              {user?.name ?? t('postCard.anonymousUser')}
            </Text>

            {isVerified && <BadgeCheck size={14} color={colors.info} />}
          </Pressable>

          {post.created_at && (
            <Text style={[styles.timeAgo, { color: `${colors.mutedForeground}CC` }]}>
              {formatTimeAgo(post.created_at, t, locale)}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  card: { borderRadius: 12, overflow: 'hidden' },
  accentLine: { height: 2 },
  imageContainer: { aspectRatio: 3 / 2, position: 'relative' },
  image: { width: '100%', height: '100%' },
  multiImageBadge: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  multiImageText: { fontSize: 10, fontWeight: '600', color: '#FFFFFF' },
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
  expirationText: { fontSize: 9, fontWeight: '600' },
  categoryLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  categorySubtitle: { fontSize: 10 },
  title: { fontSize: 16, fontWeight: '600', lineHeight: 22, letterSpacing: -0.3 },
  description: { fontSize: 13, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  priceBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  priceText: { fontSize: 11, fontWeight: '600' },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  distanceText: { fontSize: 10, fontWeight: '600' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1, minWidth: 0 },
  locationText: { fontSize: 11, flex: 1 },
  engagementRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  engagementItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  engagementText: { fontSize: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  avatarContainer: { position: 'relative' },
  avatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 1 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 10, fontWeight: '600' },
  statusDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 8, height: 8, borderRadius: 4, borderWidth: 1,
  },
  userName: { fontSize: 11, flex: 1 },
  timeAgo: { fontSize: 11 },
})
