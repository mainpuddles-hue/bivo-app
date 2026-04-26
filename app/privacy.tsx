import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'

function PrivacyScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()

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
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('privacy.title')}</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <Text style={[s.updated, { color: colors.mutedForeground }]}>{t('privacy.updated')}</Text>

        {/* Feature availability disclaimer */}
        <View style={[s.disclaimer, { backgroundColor: colors.warmTint }]}>
          <Text style={[s.disclaimerText, { color: colors.mutedForeground }]}>{t('privacy.featureDisclaimer')}</Text>
        </View>

        {/* Section 1: Data Controller */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('privacy.section1Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('privacy.section1Content')}</Text>

        {/* Section 2: Data Collected */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('privacy.section2Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('privacy.section2Content')}</Text>
        <View style={s.list}>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.section2List1')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.section2List2')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.section2List3')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.section2List4')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.section2List5')}</Text>
        </View>

        {/* Section 3: Legal Basis */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('privacy.section3Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('privacy.section3Content')}</Text>
        <View style={s.list}>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.section3List1')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.section3List2')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.section3List3')}</Text>
        </View>

        {/* Section 4: Data Retention */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('privacy.section4Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('privacy.section4Content')}</Text>

        {/* Section 5: User Rights (GDPR) */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('privacy.section5Title')}</Text>
        <View style={s.list}>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.right1')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.right2')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.right3')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.right4')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.right5')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.right6')}</Text>
        </View>

        {/* Section 6: Cookies */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('privacy.section6Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('privacy.section6Content')}</Text>

        {/* Section 7: Third Parties */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('privacy.section7Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('privacy.section7Content')}</Text>
        <View style={s.list}>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.section7List1')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.section7List2')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.section7List3')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.section7List4')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('privacy.section7List5')}</Text>
        </View>

        {/* Section 8: Data Security */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('privacy.section8Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('privacy.section8Content')}</Text>

        {/* Section 9: Contact and Complaints */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('privacy.section9Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('privacy.section9Content')}</Text>

        {/* Section 10: Age Requirement and Updates */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('privacy.section10Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('privacy.section10Content')}</Text>

        {/* Data export CTA */}
        <View style={[s.ctaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('privacy.right1')}</Text>
          <PressableOpacity onPress={() => router.push('/settings')} accessibilityLabel={t('settings.export')} accessibilityRole="button">
            <Text style={[s.link, { color: colors.foreground }]}>{t('settings.export')} {'\u2192'}</Text>
          </PressableOpacity>
        </View>
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
  content: { padding: 20, paddingBottom: 40 },
  updated: { fontSize: 12, fontFamily: fonts.body, marginBottom: 16 },
  disclaimer: { borderRadius: 16, padding: 14, marginBottom: 20 },
  disclaimerText: { fontSize: 13, fontFamily: fonts.body, fontStyle: 'italic', lineHeight: 19 },
  sectionTitle: { fontSize: 14, fontFamily: fonts.bodySemi, marginTop: 24, marginBottom: 6, letterSpacing: -0.1 },
  paragraph: { fontSize: 14, fontFamily: fonts.body, lineHeight: 22 },
  list: { gap: 4, paddingLeft: 8, marginTop: 4, marginBottom: 8 },
  listItem: { fontSize: 14, fontFamily: fonts.body, lineHeight: 22 },
  link: { fontSize: 14, fontFamily: fonts.bodySemi, marginTop: 8, textDecorationLine: 'underline' },
  ctaCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 32,
  },
})

export default function PrivacyScreen() {
  return (
    <ScreenErrorBoundary screenName="Privacy">
      <PrivacyScreenInner />
    </ScreenErrorBoundary>
  )
}
