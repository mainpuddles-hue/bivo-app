import { View, Text, StyleSheet } from 'react-native'
import { WifiOff } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'

interface OfflineBannerProps {
  visible: boolean
}

export function OfflineBanner({ visible }: OfflineBannerProps) {
  const { colors } = useTheme()
  const { t } = useI18n()

  if (!visible) return null

  return (
    <View
      style={[styles.banner, { backgroundColor: colors.destructive }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <WifiOff size={14} color={colors.primaryForeground} />
      <Text style={[styles.text, { color: colors.primaryForeground }]}>
        {t('common.offline')}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
})
