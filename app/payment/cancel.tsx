import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { X, RotateCcw, Home } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'

function PaymentCancelScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
      <View style={styles.content}>
        {/* Cancel icon */}
        <View style={[styles.iconCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <X size={40} color={colors.destructive} strokeWidth={2.5} />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]} accessibilityRole="header">{t('payment.cancelled')}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t('payment.cancelledMessage')}</Text>

        {/* Action buttons */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.primaryBtn, { backgroundColor: colors.foreground }]}
            accessibilityLabel={t('payment.tryAgain')}
            accessibilityRole="button"
          >
            <RotateCcw size={18} color={colors.primaryForeground} />
            <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>{t('payment.tryAgain')}</Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace('/(tabs)')}
            style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityLabel={t('payment.backToHome')}
            accessibilityRole="button"
          >
            <Home size={18} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>{t('payment.backToHome')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 80,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontFamily: fonts.heading,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 40,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 999,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: fonts.bodySemi,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontFamily: fonts.bodyMedium,
  },
})

export default function PaymentCancelScreen() {
  return (
    <ScreenErrorBoundary screenName="PaymentCancel">
      <PaymentCancelScreenInner />
    </ScreenErrorBoundary>
  )
}
