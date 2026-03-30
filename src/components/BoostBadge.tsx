import { View, Text, StyleSheet } from 'react-native'
import { TrendingUp } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'

interface BoostBadgeProps {
  /** Optional subtitle text, e.g. remaining time */
  subtitle?: string
}

export function BoostBadge({ subtitle }: BoostBadgeProps) {
  const { colors } = useTheme()
  const { t } = useI18n()

  return (
    <View style={[styles.badge, { backgroundColor: `${colors.accent}20`, borderColor: `${colors.accent}40` }]}>
      <TrendingUp size={10} color={colors.accent} />
      <Text style={[styles.text, { color: colors.accent }]}>{t('feed.boosted')}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.accent }]}>{subtitle}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  text: {
    fontSize: 10,
    fontFamily: fonts.bodySemi,
    lineHeight: 13,
  },
  subtitle: {
    fontSize: 9,
    fontFamily: fonts.body,
    lineHeight: 12,
  },
})
