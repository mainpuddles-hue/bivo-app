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
      <MapPin size={20} color="#F59E0B" />
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
        <Text style={[styles.changeBtnText, { color: colors.primary }]}>
          {t('map.changeCity')}
        </Text>
        <ChevronRight size={16} color={colors.primary} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
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
