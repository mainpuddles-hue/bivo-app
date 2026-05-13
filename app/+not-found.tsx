import { View, Text, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { PressableOpacity } from '@/components/ui/PressableOpacity'
import { Home } from 'lucide-react-native'
import { fonts } from '@/lib/fonts'

export default function NotFoundScreen() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.code, { color: colors.mutedForeground }]}>404</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {t('common.pageNotFound') ?? 'Sivua ei löytynyt'}
      </Text>
      <PressableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        onPress={() => router.replace('/')}
        accessibilityRole="button"
        accessibilityLabel={t('common.backToHome') ?? 'Takaisin etusivulle'}
      >
        <Home size={20} color={colors.primaryForeground} />
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
          {t('common.backToHome') ?? 'Takaisin etusivulle'}
        </Text>
      </PressableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  code: { fontSize: 64, fontFamily: fonts.displayBold, marginBottom: 8 },
  title: { fontSize: 18, fontFamily: fonts.body, marginBottom: 24 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999 },
  buttonText: { fontSize: 16, fontFamily: fonts.bodySemi },
})
