import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MapPin, ChevronRight } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useRouter } from 'expo-router'
import { fonts } from '@/lib/fonts'

interface OutOfAreaBannerProps {
  visible: boolean
  cityName?: string
}

export function OutOfAreaBanner({ visible, cityName }: OutOfAreaBannerProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()

  if (!visible) return null

  return (
    <View style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <MapPin size={20} color={colors.foreground} />
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {t('map.outOfArea')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {t('map.outOfAreaDesc', { city: cityName ?? 'TackBird' })}
        </Text>
      </View>
      <Pressable
        onPress={() => router.push('/settings')}
        hitSlop={8}
        style={styles.changeBtn}
      >
        <Text style={[styles.changeBtnText, { color: colors.foreground }]}>
          {t('map.changeCity')}
        </Text>
        <ChevronRight size={16} color={colors.foreground} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  changeBtnText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
})
