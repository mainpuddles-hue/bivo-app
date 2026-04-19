import { View, Text, ScrollView, StyleSheet, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, ExternalLink, FileText, Lock, HelpCircle } from 'lucide-react-native'
import Constants from 'expo-constants'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'

function AboutScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const appVersion = Constants.expoConfig?.version ?? '1.0.0'

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Bar header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <PressableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[s.circleBack, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={18} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('about.title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        {/* Logo & name */}
        <View style={s.logoSection}>
          <View style={[s.logoPlaceholder, { backgroundColor: colors.foreground }]}>
            <Text style={[s.logoText, { color: colors.background }]}>TB</Text>
          </View>
          <Text style={[s.appName, { color: colors.foreground }]}>TackBird</Text>
          <Text style={[s.versionText, { color: colors.mutedForeground }]}>v{appVersion}</Text>
          <Text style={[s.tagline, { color: colors.mutedForeground }]}>{t('about.tagline')}</Text>
        </View>

        {/* Description */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.description, { color: colors.foreground }]}>{t('about.description')}</Text>
        </View>

        {/* Links */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('about.linksSection').toUpperCase()}</Text>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <PressableOpacity onPress={() => router.push('/terms')} style={s.linkRow} accessibilityLabel={t('settings.terms')} accessibilityRole="button">
            <FileText size={18} color={colors.mutedForeground} />
            <Text style={[s.linkText, { color: colors.foreground }]}>{t('settings.terms')}</Text>
            <ExternalLink size={14} color={colors.mutedForeground} />
          </PressableOpacity>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <PressableOpacity onPress={() => router.push('/privacy')} style={s.linkRow} accessibilityLabel={t('settings.privacy')} accessibilityRole="button">
            <Lock size={18} color={colors.mutedForeground} />
            <Text style={[s.linkText, { color: colors.foreground }]}>{t('settings.privacy')}</Text>
            <ExternalLink size={14} color={colors.mutedForeground} />
          </PressableOpacity>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <PressableOpacity onPress={() => router.push('/help' as any)} style={s.linkRow} accessibilityLabel={t('help.title')} accessibilityRole="button">
            <HelpCircle size={18} color={colors.mutedForeground} />
            <Text style={[s.linkText, { color: colors.foreground }]}>{t('help.title')}</Text>
            <ExternalLink size={14} color={colors.mutedForeground} />
          </PressableOpacity>
        </View>

        {/* Website */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <PressableOpacity
            onPress={() => Linking.openURL('https://tackbird.com').catch(() => {})}
            style={s.linkRow}
            accessibilityLabel="tackbird.com"
            accessibilityRole="link"
          >
            <ExternalLink size={18} color={colors.foreground} />
            <Text style={[s.linkText, { color: colors.foreground }]}>tackbird.com</Text>
          </PressableOpacity>
        </View>

        {/* Credits */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('about.creditsSection').toUpperCase()}</Text>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  circleBack: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.1,
  },
  headerSpacer: { width: 36 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  logoSection: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  logoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 28, fontFamily: fonts.heading },
  appName: { fontSize: 22, fontFamily: fonts.heading, letterSpacing: -0.5 },
  versionText: { fontSize: 13, fontFamily: fonts.body },
  tagline: { fontSize: 14, fontFamily: fonts.body, marginTop: 2 },
  sectionLabel: {
    fontSize: 10.5,
    fontFamily: fonts.bodySemi,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  description: { fontSize: 14, fontFamily: fonts.body, lineHeight: 22, padding: 16 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  linkText: { fontSize: 14, fontFamily: fonts.bodyMedium, flex: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  creditsTitle: { fontSize: 14, fontFamily: fonts.bodySemi, padding: 16, paddingBottom: 4 },
  creditsText: { fontSize: 13, fontFamily: fonts.body, lineHeight: 20, paddingHorizontal: 16, paddingBottom: 16 },
  copyrightText: { fontSize: 12, fontFamily: fonts.body, textAlign: 'center', marginTop: 16 },
})

export default function AboutScreen() {
  return (
    <ScreenErrorBoundary screenName="About">
      <AboutScreenInner />
    </ScreenErrorBoundary>
  )
}
