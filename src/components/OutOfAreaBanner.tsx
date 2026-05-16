import { View, Text, Pressable, StyleSheet } from 'react-native'
import { ChevronRight, MapPin } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useRouter } from 'expo-router'
import { fonts } from '@/lib/fonts'
import { SectionEyebrow } from '@/components/SectionEyebrow'

interface OutOfAreaBannerProps {
  visible: boolean
  cityName?: string
}

/**
 * Trust-critical context per Aesthetic-Usability — when the app is unable
 * to show the user the events / places that the page promises, polish the
 * "we know about it and here's what to do" surface so they don't read it
 * as broken. Uses a destructive eyebrow dot to signal the state, the same
 * 8px-dot vocabulary the rest of the app uses for status banners.
 */
export function OutOfAreaBanner({ visible, cityName }: OutOfAreaBannerProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()

  if (!visible) return null

  return (
    <View style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
        <MapPin size={18} color={colors.foreground} strokeWidth={1.7} />
      </View>
      <View style={styles.textWrap}>
        <SectionEyebrow
          label={(t('map.outOfAreaLabel') ?? 'ALUEEN ULKOPUOLELLA') as string}
          dotColor={colors.destructive}
          style={styles.eyebrow}
        />
        <Text style={[styles.title, { color: colors.foreground }]}>
          {t('map.outOfArea')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {t('map.outOfAreaDesc', { city: cityName ?? 'Bivo' })}
        </Text>
      </View>
      <Pressable
        onPress={() => router.push('/settings')}
        hitSlop={8}
        style={styles.changeBtn}
        accessibilityRole="link"
      >
        <Text style={[styles.changeBtnText, { color: colors.foreground }]}>
          {t('map.changeCity')}
        </Text>
        <ChevronRight size={14} color={colors.foreground} strokeWidth={2} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    letterSpacing: -0.15,
    lineHeight: 19,
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
    marginTop: 16,
  },
  changeBtnText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
  },
})
