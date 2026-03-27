import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ShieldAlert, RotateCcw, Home } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'

export default function VerificationErrorScreen() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: `${colors.destructive}18` }]}>
          <ShieldAlert size={56} color={colors.destructive} />
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>{t('verification.errorTitle')}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t('verification.errorMessage')}</Text>

        <View style={styles.actions}>
          <Pressable onPress={() => router.replace('/settings' as any)} style={[styles.primaryBtn, { backgroundColor: colors.primary }]} accessibilityRole="button">
            <RotateCcw size={18} color={colors.primaryForeground} />
            <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>{t('verification.tryAgain')}</Text>
          </Pressable>

          <Pressable onPress={() => router.replace('/(tabs)')} style={[styles.secondaryBtn, { borderColor: colors.border }]} accessibilityRole="button">
            <Home size={18} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>{t('verification.backToApp')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 60 },
  iconCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3, marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 21, marginBottom: 32, paddingHorizontal: 16 },
  actions: { width: '100%', gap: 12 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  primaryBtnText: { fontSize: 16, fontWeight: '600' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  secondaryBtnText: { fontSize: 16, fontWeight: '500' },
})
