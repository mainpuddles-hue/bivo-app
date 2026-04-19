import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'

function TermsScreenInner() {
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
        <Text style={[s.headerTitle, { color: colors.foreground }]}>K{'\u00e4'}ytt{'\u00f6'}ehdot</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <Text style={[s.updated, { color: colors.mutedForeground }]}>{t('terms.updated')}</Text>

        {/* Feature availability disclaimer */}
        <View style={[s.disclaimer, { backgroundColor: colors.warmTint }]}>
          <Text style={[s.disclaimerText, { color: colors.mutedForeground }]}>{t('terms.featureDisclaimer')}</Text>
        </View>

        {/* Section 1: Service Description */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('terms.section1Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('terms.section1Content')}</Text>

        {/* Section 2: User Responsibilities */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('terms.section2Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('terms.section2Content')}</Text>
        <View style={s.list}>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('terms.section2List1')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('terms.section2List2')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('terms.section2List3')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('terms.section2List4')}</Text>
          <Text style={[s.listItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('terms.section2List5')}</Text>
        </View>

        {/* Section 3: Content Guidelines */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('terms.section3Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('terms.section3Content')}</Text>

        {/* Section 4: Rental Service and Liability */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('terms.section4Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('terms.section4Content')}</Text>

        {/* Section 5: Payment Terms */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('terms.section5Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('terms.section5Content')}</Text>

        {/* Section 6: Privacy */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('terms.section6Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('terms.section6Content')}</Text>
        <PressableOpacity onPress={() => router.push('/privacy')} accessibilityLabel={t('terms.section6Link')} accessibilityRole="button">
          <Text style={[s.link, { color: colors.foreground }]}>{t('terms.section6Link')} {'\u2192'}</Text>
        </PressableOpacity>

        {/* Section 7: Limitation of Liability */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('terms.section7Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('terms.section7Content')}</Text>

        {/* Section 8: Account Termination */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('terms.section8Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('terms.section8Content')}</Text>

        {/* Section 9: Changes to Terms */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('terms.section9Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('terms.section9Content')}</Text>

        {/* Section 10: Dispute Resolution */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('terms.section10Title')}</Text>
        <Text style={[s.paragraph, { color: colors.mutedForeground }]}>{t('terms.section10Content')}</Text>
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
  disclaimer: { borderRadius: 20, padding: 14, marginBottom: 20 },
  disclaimerText: { fontSize: 13, fontFamily: fonts.body, fontStyle: 'italic', lineHeight: 19 },
  sectionTitle: { fontSize: 15, fontFamily: fonts.bodySemi, marginTop: 24, marginBottom: 6, letterSpacing: -0.1 },
  paragraph: { fontSize: 14, fontFamily: fonts.body, lineHeight: 22 },
  list: { gap: 4, paddingLeft: 8, marginTop: 4, marginBottom: 8 },
  listItem: { fontSize: 14, fontFamily: fonts.body, lineHeight: 22 },
  link: { fontSize: 14, fontFamily: fonts.bodySemi, marginTop: 8, textDecorationLine: 'underline' },
})

export default function TermsScreen() {
  return (
    <ScreenErrorBoundary screenName="Terms">
      <TermsScreenInner />
    </ScreenErrorBoundary>
  )
}
