import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { BackButton } from '@/components/ui'

function TermsScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <BackButton />
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('terms.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.updated, { color: colors.mutedForeground }]}>{t('terms.updated')}</Text>

          {/* Feature availability disclaimer */}
          <View style={[s.disclaimer, { backgroundColor: colors.muted }]}>
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
          <Pressable onPress={() => router.push('/privacy')} accessibilityLabel={t('terms.section6Link')} accessibilityRole="button">
            <Text style={[s.link, { color: colors.primary }]}>{t('terms.section6Link')} →</Text>
          </Pressable>

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

export default function TermsScreen() {
  return (
    <ScreenErrorBoundary screenName="Terms">
      <TermsScreenInner />
    </ScreenErrorBoundary>
  )
}
