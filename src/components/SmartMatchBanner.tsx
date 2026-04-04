import { memo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Zap, X } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'

interface SmartMatchBannerProps {
  matches: Array<{
    postId: string
    postTitle: string
    posterName: string
    matchedTags: string[]
    matchScore?: number
  }>
  onDismiss: (postId: string) => void
}

export const SmartMatchBanner = memo(function SmartMatchBanner({ matches, onDismiss }: SmartMatchBannerProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()

  if (matches.length === 0) return null

  const match = matches[0] // Show first match

  return (
    <Pressable
      accessibilityLabel={t('smartMatch.neighborNeeds', { name: match.posterName })}
      onPress={() => router.push(`/post/${match.postId}`)}
      style={[styles.banner, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}33` }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${colors.primary}1F` }]}>
        <Zap size={18} color={colors.primary} fill={colors.primary} />
      </View>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.foreground, flex: 1 }]} numberOfLines={1}>
            {t('smartMatch.neighborNeeds', { name: match.posterName })}
          </Text>
          {match.matchScore != null && match.matchScore > 0 && (
            <View style={[styles.scoreBadge, { backgroundColor: `${colors.primary}20` }]}>
              <Text style={[styles.scoreText, { color: colors.primary }]}>{match.matchScore}%</Text>
            </View>
          )}
        </View>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
          {match.postTitle}
        </Text>
      </View>
      <Pressable onPress={(e) => { e.stopPropagation?.(); onDismiss(match.postId) }} hitSlop={12}>
        <X size={16} color={colors.mutedForeground} />
      </Pressable>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 13, fontFamily: fonts.bodySemi },
  subtitle: { fontSize: 12, fontFamily: fonts.body },
  scoreBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  scoreText: { fontSize: 11, fontWeight: '700', fontFamily: fonts.bodySemi },
})
