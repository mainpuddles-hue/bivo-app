import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { BackButton } from '@/components/ui'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'

function PrivacyScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <BackButton />
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('privacy.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.updated, { color: colors.mutedForeground }]}>{t('privacy.updated')}</Text>

          {/* Feature availability disclaimer */}
          <View style={[s.disclaimer, { backgroundColor: colors.muted }]}>
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
        </View>

        {/* Data export CTA */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('privacy.right1')}</Text>
          <Pressable onPress={() => router.push('/settings')} accessibilityLabel={t('settings.export')} accessibilityRole="button">
            <Text style={[s.link, { color: colors.primary }]}>{t('settings.export')} →</Text>
          </Pressable>
        </View>
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
  headerTitle: { fontSize: 20, fontFamily: fonts.headingSemi, letterSpacing: -0.3, lineHeight: 28 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  card: { borderRadius: 12, padding: 16, gap: 4 },
  updated: { fontSize: 12, fontFamily: fonts.body, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontFamily: fonts.bodySemi, marginTop: 16, marginBottom: 4 },
  paragraph: { fontSize: 14, fontFamily: fonts.body, lineHeight: 21 },
  list: { gap: 4, paddingLeft: 8, marginBottom: 8 },
  listItem: { fontSize: 14, fontFamily: fonts.body, lineHeight: 21 },
  link: { fontSize: 14, fontFamily: fonts.bodyMedium, marginTop: 8 },
  disclaimer: { borderRadius: 8, padding: 12, marginBottom: 12 },
  disclaimerText: { fontSize: 13, fontFamily: fonts.body, fontStyle: 'italic', lineHeight: 19 },
})

export default function PrivacyScreen() {
  return (
    <ScreenErrorBoundary screenName="Privacy">
      <PrivacyScreenInner />
    </ScreenErrorBoundary>
  )
}
