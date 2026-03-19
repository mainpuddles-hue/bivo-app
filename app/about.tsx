import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, ExternalLink, FileText, Lock, HelpCircle } from 'lucide-react-native'
import Constants from 'expo-constants'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'

export default function AboutScreen() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const appVersion = Constants.expoConfig?.version ?? '1.0.0'

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('about.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Logo & name */}
        <View style={s.logoSection}>
          <View style={[s.logoPlaceholder, { backgroundColor: colors.primary }]}>
            <Text style={[s.logoText, { color: colors.primaryForeground }]}>TB</Text>
          </View>
          <Text style={[s.appName, { color: colors.foreground }]}>TackBird</Text>
          <Text style={[s.versionText, { color: colors.mutedForeground }]}>v{appVersion}</Text>
          <Text style={[s.tagline, { color: colors.mutedForeground }]}>{t('about.tagline')}</Text>
        </View>

        {/* Description */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.description, { color: colors.foreground }]}>{t('about.description')}</Text>
        </View>

        {/* Links */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Pressable onPress={() => router.push('/terms')} style={s.linkRow}>
            <FileText size={18} color={colors.mutedForeground} />
            <Text style={[s.linkText, { color: colors.foreground }]}>{t('settings.terms')}</Text>
            <ExternalLink size={14} color={colors.mutedForeground} />
          </Pressable>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <Pressable onPress={() => router.push('/privacy')} style={s.linkRow}>
            <Lock size={18} color={colors.mutedForeground} />
            <Text style={[s.linkText, { color: colors.foreground }]}>{t('settings.privacy')}</Text>
            <ExternalLink size={14} color={colors.mutedForeground} />
          </Pressable>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <Pressable onPress={() => router.push('/help' as any)} style={s.linkRow}>
            <HelpCircle size={18} color={colors.mutedForeground} />
            <Text style={[s.linkText, { color: colors.foreground }]}>{t('help.title')}</Text>
            <ExternalLink size={14} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Website */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Pressable
            onPress={() => Linking.openURL('https://tackbird-v2.vercel.app')}
            style={s.linkRow}
          >
            <ExternalLink size={18} color={colors.primary} />
            <Text style={[s.linkText, { color: colors.primary }]}>tackbird-v2.vercel.app</Text>
          </Pressable>
        </View>

        {/* Credits */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.creditsTitle, { color: colors.foreground }]}>{t('about.credits')}</Text>
          <Text style={[s.creditsText, { color: colors.mutedForeground }]}>{t('about.creditsContent')}</Text>
        </View>

        <Text style={[s.copyrightText, { color: colors.mutedForeground }]}>
          {t('about.copyright')}
        </Text>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  logoSection: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  logoPlaceholder: {
    width: 80, height: 80, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 28, fontWeight: '800' },
  appName: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  versionText: { fontSize: 14 },
  tagline: { fontSize: 15, marginTop: 4 },
  card: { borderRadius: 12, overflow: 'hidden' },
  description: { fontSize: 14, lineHeight: 22, padding: 16 },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16,
  },
  linkText: { fontSize: 15, flex: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  creditsTitle: { fontSize: 14, fontWeight: '600', padding: 16, paddingBottom: 4 },
  creditsText: { fontSize: 13, lineHeight: 20, paddingHorizontal: 16, paddingBottom: 16 },
  copyrightText: { fontSize: 12, textAlign: 'center', marginTop: 12 },
})
