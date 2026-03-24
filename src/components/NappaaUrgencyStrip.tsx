import { memo, useMemo } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Zap } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import type { Post } from '@/lib/types'

const NAPPAA_COLOR = '#E8A050'

interface NappaaUrgencyStripProps {
  posts: Post[]
}

function getTimeLeft(expiresAt: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const now = Date.now()
  const diff = new Date(expiresAt).getTime() - now
  if (diff <= 0) return t('nappaa.minutesLeft', { count: 0 })
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  if (hours > 0) return t('nappaa.hoursLeft', { count: hours })
  return t('nappaa.minutesLeft', { count: minutes })
}

function NappaaUrgencyStripInner({ posts }: NappaaUrgencyStripProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()

  const urgentPosts = useMemo(() => {
    const now = Date.now()
    const in24h = now + 24 * 3600000
    return posts
      .filter(p => p.type === 'nappaa' && p.expires_at && new Date(p.expires_at).getTime() > now && new Date(p.expires_at).getTime() <= in24h)
      .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime())
  }, [posts])

  if (urgentPosts.length === 0) return null

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Zap size={14} color={NAPPAA_COLOR} fill={NAPPAA_COLOR} />
        <Text style={[styles.headerText, { color: NAPPAA_COLOR }]}>
          {t('nappaa.grabNow')} ({urgentPosts.length})
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {urgentPosts.map(post => (
          <Pressable
            key={post.id}
            onPress={() => router.push(`/post/${post.id}` as any)}
            style={[styles.card, { backgroundColor: colors.card }]}
          >
            <View style={[styles.accentBar, { backgroundColor: NAPPAA_COLOR }]} />
            <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
              {post.title}
            </Text>
            <Text style={[styles.countdown, { color: NAPPAA_COLOR }]}>
              {getTimeLeft(post.expires_at!, t)}
            </Text>
            {post.location ? (
              <Text style={[styles.location, { color: colors.mutedForeground }]} numberOfLines={1}>
                {post.location}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}

export const NappaaUrgencyStrip = memo(NappaaUrgencyStripInner)

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  headerText: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.14,
  },
  scrollContent: {
    gap: 10,
  },
  card: {
    width: 140,
    borderRadius: 10,
    padding: 10,
    gap: 4,
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    marginTop: 2,
  },
  countdown: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
  },
  location: {
    fontSize: 11,
    fontFamily: fonts.body,
  },
})
