import { memo, useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'

interface FeedContextHeaderProps {
  neighborhood: string | null
  postCount: number
  loading: boolean
  cityName?: string | null
}

function FeedContextHeaderInner({ neighborhood, postCount, loading, cityName }: FeedContextHeaderProps) {
  const { colors } = useTheme()
  const { t } = useI18n()

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour >= 6 && hour < 12) return t('greeting.morning')
    if (hour >= 12 && hour < 17) return t('greeting.afternoon')
    if (hour >= 17 && hour < 22) return t('greeting.evening')
    return t('greeting.night')
  }, [t])

  const area = neighborhood || cityName || 'Helsinki'

  const nugget = useMemo(() => {
    if (postCount > 0 && !loading) {
      return t('greeting.postsInArea', { count: postCount })
    }
    return t('feed.slogan')
  }, [postCount, loading, t])

  return (
    <View style={styles.container}>
      <Text style={[styles.greetingLine, { color: colors.foreground }]} numberOfLines={1}>
        {greeting},{' '}
        <Text style={styles.area}>{area}</Text>!
      </Text>
      <Text style={[styles.nugget, { color: colors.mutedForeground }]} numberOfLines={1}>
        {nugget}
      </Text>
    </View>
  )
}

export const FeedContextHeader = memo(FeedContextHeaderInner)

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 4,
    minHeight: 60,
    justifyContent: 'center',
  },
  greetingLine: {
    fontSize: 18,
    fontFamily: fonts.body,
  },
  area: {
    fontFamily: fonts.heading,
  },
  nugget: {
    fontSize: 13,
    fontFamily: fonts.body,
    textAlign: 'center',
  },
})
