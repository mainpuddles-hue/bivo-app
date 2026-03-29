import { useEffect, useRef } from 'react'
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ShieldCheck, Home, BookOpen } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { TRUST_TIERS } from '@/lib/constants'

export default function VerificationSuccessScreen() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const scaleAnim = useRef(new Animated.Value(0)).current
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start()
  }, [scaleAnim, fadeAnim])

  const tier2Color = TRUST_TIERS[2].color

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
      <View style={styles.content}>
        {/* Animated shield */}
        <Animated.View style={[styles.iconCircle, { backgroundColor: `${tier2Color}18`, transform: [{ scale: scaleAnim }] }]}>
          <ShieldCheck size={56} color={tier2Color} />
        </Animated.View>

        <Text style={[styles.title, { color: colors.foreground }]}>{t('verification.successTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t('verification.successMessage')}</Text>

        {/* Unlocked features */}
        <Animated.View style={[styles.unlockedCard, { backgroundColor: colors.card, borderColor: colors.border, opacity: fadeAnim }]}>
          <Text style={[styles.unlockedTitle, { color: colors.foreground }]}>{t('verification.unlockedTitle')}</Text>

          <View style={styles.featureRow}>
            <View style={[styles.featureIcon, { backgroundColor: `${tier2Color}18` }]}>
              <BookOpen size={18} color={tier2Color} />
            </View>
            <View style={styles.featureText}>
              <Text style={[styles.featureName, { color: colors.foreground }]}>{t('verification.featureBorrow')}</Text>
              <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>{t('verification.featureBorrowDesc')}</Text>
            </View>
          </View>

          <View style={styles.featureRow}>
            <View style={[styles.featureIcon, { backgroundColor: `${colors.info}18` }]}>
              <ShieldCheck size={18} color={colors.info} />
            </View>
            <View style={styles.featureText}>
              <Text style={[styles.featureName, { color: colors.foreground }]}>{t('verification.featureServices')}</Text>
              <Text style={[styles.featureDesc, { color: colors.mutedForeground }]}>{t('verification.featureServicesDesc')}</Text>
            </View>
          </View>
        </Animated.View>

        <View style={styles.actions}>
          <Pressable onPress={() => router.replace('/(tabs)')} style={[styles.primaryBtn, { backgroundColor: tier2Color }]} accessibilityLabel={t('verification.backToApp')} accessibilityRole="button">
            <Home size={18} color={colors.primaryForeground} />
            <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>{t('verification.backToApp')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 64 },
  iconCircle: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { fontSize: 24, fontFamily: fonts.heading, letterSpacing: -0.3, marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: fonts.body, textAlign: 'center', lineHeight: 21, marginBottom: 32, paddingHorizontal: 16 },
  unlockedCard: { width: '100%', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 16, marginBottom: 32 },
  unlockedTitle: { fontSize: 16, fontFamily: fonts.heading, marginBottom: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1, gap: 2 },
  featureName: { fontSize: 14, fontFamily: fonts.bodySemi },
  featureDesc: { fontSize: 12, fontFamily: fonts.body, lineHeight: 16 },
  actions: { width: '100%', gap: 12 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 12 },
  primaryBtnText: { fontSize: 16, fontFamily: fonts.bodySemi },
})
