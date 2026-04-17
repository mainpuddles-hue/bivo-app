import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { XCircle, RotateCcw, ArrowLeft } from 'lucide-react-native'
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
        <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
          <XCircle size={56} color={colors.destructive} />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>{t('payment.cancelled')}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t('payment.cancelledMessage')}</Text>

        {/* Action buttons */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.primaryBtn, { backgroundColor: colors.foreground }]}
            accessibilityLabel={t('payment.tryAgain')}
            accessibilityRole="button"
          >
            <RotateCcw size={18} color={colors.background} />
            <Text style={[styles.primaryBtnText, { color: colors.background }]}>{t('payment.tryAgain')}</Text>
          </Pressable>

          <Pressable
            onPress={() => router.replace('/(tabs)')}
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            accessibilityLabel={t('payment.backToHome')}
            accessibilityRole="button"
          >
            <ArrowLeft size={24} color={colors.foreground} />
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
    width: 104,
    height: 104,
    borderRadius: 52,
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
    lineHeight: 21,
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
    borderRadius: 24,
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
    borderRadius: 16,
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
