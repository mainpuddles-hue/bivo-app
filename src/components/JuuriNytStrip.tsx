import { memo, useMemo, useState, useEffect } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Zap, Clock, MapPin } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { CATEGORIES } from '@/lib/constants'
import { CATEGORY_ICON_MAP } from '@/lib/categoryIcons'
import { fonts } from '@/lib/fonts'
import type { Post, PostType } from '@/lib/types'

interface JuuriNytStripProps {
  posts: Post[]
}

function getTimeLeft(expiresAt: string): { label: string; isUrgent: boolean } {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return { label: '0min', isUrgent: true }
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  if (hours > 0) return { label: `${hours}h ${minutes}min`, isUrgent: hours < 1 }
  return { label: `${minutes}min`, isUrgent: minutes < 30 }
}

function getUrgencyColor(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 1800000) return '#EF4444'   // < 30min: red
  if (diff <= 3600000) return '#F59E0B'   // < 1h: amber
  return '#E8A050'                         // > 1h: orange
}

function JuuriNytStripInner({ posts }: JuuriNytStripProps) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const router = useRouter()

  // Tick every 10s to keep countdowns fresh
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10000)
    return () => clearInterval(id)
  }, [])

  const urgentPosts = useMemo(() => {
    const now = Date.now()
    return posts
      .filter(p => {
        if (!p.expires_at) return false
        const expiresMs = new Date(p.expires_at).getTime()
        if (expiresMs <= now) return false
        // Show if: is_urgent flag set, OR nappaa expiring within 24h
        if (p.is_urgent) return true
        if (p.type === 'nappaa' && (expiresMs - now) <= 24 * 3600000) return true
        return false
      })
      .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime())
  }, [posts, tick])

  if (urgentPosts.length === 0) return null

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.pulseCircle, { backgroundColor: isDark ? '#EF444440' : '#EF444420' }]}>
          <Zap size={14} color={colors.destructive} fill={colors.destructive} />
        </View>
        <Text style={[styles.headerText, { color: colors.destructive }]}>
          {t('urgency.juuriNyt')} ({urgentPosts.length})
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {urgentPosts.map(post => {
          const { label, isUrgent } = getTimeLeft(post.expires_at!)
          const urgencyColor = getUrgencyColor(post.expires_at!)
          const category = CATEGORIES[post.type as PostType]
          const CatIcon = category ? CATEGORY_ICON_MAP[category.icon] : null

          return (
            <Pressable
              key={post.id}
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
                router.push(`/post/${post.id}`)
              }}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.card },
                pressed && { transform: [{ scale: 0.96 }] },
              ]}
            >
              {/* Urgency color bar */}
              <View style={[styles.accentBar, { backgroundColor: urgencyColor }]} />

              {/* Category + countdown row */}
              <View style={styles.topRow}>
                {CatIcon && <CatIcon size={12} color={category?.color ?? colors.primary} />}
                <View style={[styles.countdownBadge, { backgroundColor: `${urgencyColor}18` }]}>
                  <Clock size={10} color={urgencyColor} />
                  <Text style={[styles.countdownText, { color: urgencyColor }]}>{label}</Text>
                </View>
              </View>

              {/* Title */}
              <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                {post.title}
              </Text>

              {/* Location */}
              {post.location && (
                <View style={styles.locationRow}>
                  <MapPin size={10} color={colors.mutedForeground} />
                  <Text style={[styles.locationText, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {post.location}
                  </Text>
                </View>
              )}

              {/* User name */}
              <Text style={[styles.userName, { color: colors.mutedForeground }]} numberOfLines={1}>
                {post.user?.name ?? ''}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

export const JuuriNytStrip = memo(JuuriNytStripInner)

const styles = StyleSheet.create({
  container: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  pulseCircle: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.15,
  },
  scrollContent: { gap: 10, paddingRight: 8 },
  card: {
    width: 160,
    borderRadius: 12,
    padding: 12,
    gap: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  accentBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 3,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countdownText: {
    fontSize: 10,
    fontFamily: fonts.bodySemi,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    lineHeight: 17,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  locationText: {
    fontSize: 10,
    fontFamily: fonts.body,
    flex: 1,
  },
  userName: {
    fontSize: 10,
    fontFamily: fonts.body,
  },
})
