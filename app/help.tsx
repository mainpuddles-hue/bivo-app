import { useState, useCallback } from 'react'
import { View, Text, ScrollView, StyleSheet, Linking, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, ChevronDown, ChevronUp, Mail, ExternalLink } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'

interface FAQItem {
  question: string
  answer: string
}

interface FAQCategory {
  titleKey: string
  items: { questionKey: string; answerKey: string }[]
}

const FAQ_CATEGORIES: FAQCategory[] = [
  {
    titleKey: 'help.categoryAccount',
    items: [
      { questionKey: 'help.accountQ1', answerKey: 'help.accountA1' },
      { questionKey: 'help.accountQ2', answerKey: 'help.accountA2' },
      { questionKey: 'help.accountQ3', answerKey: 'help.accountA3' },
    ],
  },
  {
    titleKey: 'help.categoryPosts',
    items: [
      { questionKey: 'help.postsQ1', answerKey: 'help.postsA1' },
      { questionKey: 'help.postsQ2', answerKey: 'help.postsA2' },
      { questionKey: 'help.postsQ3', answerKey: 'help.postsA3' },
    ],
  },
  {
    titleKey: 'help.categoryMessages',
    items: [
      { questionKey: 'help.messagesQ1', answerKey: 'help.messagesA1' },
      { questionKey: 'help.messagesQ2', answerKey: 'help.messagesA2' },
    ],
  },
  {
    titleKey: 'help.categoryPayments',
    items: [
      { questionKey: 'help.paymentsQ1', answerKey: 'help.paymentsA1' },
      { questionKey: 'help.paymentsQ2', answerKey: 'help.paymentsA2' },
    ],
  },
  {
    titleKey: 'help.categorySafety',
    items: [
      { questionKey: 'help.safetyQ1', answerKey: 'help.safetyA1' },
      { questionKey: 'help.safetyQ2', answerKey: 'help.safetyA2' },
      { questionKey: 'help.safetyQ3', answerKey: 'help.safetyA3' },
    ],
  },
]

function HelpScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())

  const toggleItem = useCallback((key: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Bar header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <PressableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[s.circleBack, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={18} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Tuki</Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <Text style={[s.subtitle, { color: colors.mutedForeground }]}>{t('help.subtitle')}</Text>

        {FAQ_CATEGORIES.map((category, ci) => (
          <View key={ci}>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t(category.titleKey)}</Text>
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {category.items.map((item, qi) => {
                const key = `${ci}-${qi}`
                const isExpanded = expandedItems.has(key)
                return (
                  <View key={key}>
                    {qi > 0 && <View style={[s.divider, { backgroundColor: colors.border }]} />}
                    <PressableOpacity onPress={() => toggleItem(key)} style={s.faqRow} accessibilityRole="button">
                      <Text style={[s.faqQuestion, { color: colors.foreground }]}>{t(item.questionKey)}</Text>
                      {isExpanded
                        ? <ChevronUp size={16} color={colors.mutedForeground} />
                        : <ChevronDown size={16} color={colors.mutedForeground} />
                      }
                    </PressableOpacity>
                    {isExpanded && (
                      <View style={s.faqAnswer}>
                        <Text style={[s.answerText, { color: colors.mutedForeground }]}>{t(item.answerKey)}</Text>
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          </View>
        ))}

        {/* Contact support */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>YHTEYDENOTTO</Text>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.contactTitle, { color: colors.foreground }]}>{t('help.contactTitle')}</Text>
          <Text style={[s.contactDesc, { color: colors.mutedForeground }]}>{t('help.contactDesc')}</Text>
          <PressableOpacity
            onPress={() => Linking.openURL('mailto:tuki@tackbird.com').catch(() => Alert.alert(t('common.error'), t('common.error')))}
            style={[s.contactBtn, { backgroundColor: colors.foreground }]}
            accessibilityLabel="tuki@tackbird.com"
            accessibilityRole="link"
          >
            <Mail size={16} color={colors.background} />
            <Text style={[s.contactBtnText, { color: colors.background }]}>tuki@tackbird.com</Text>
          </PressableOpacity>
        </View>

        {/* Links to terms and privacy */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <PressableOpacity onPress={() => router.push('/terms')} style={s.linkRow} accessibilityLabel={t('settings.terms')} accessibilityRole="button">
            <Text style={[s.linkText, { color: colors.foreground }]}>{t('settings.terms')}</Text>
            <ExternalLink size={14} color={colors.mutedForeground} />
          </PressableOpacity>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <PressableOpacity onPress={() => router.push('/privacy')} style={s.linkRow} accessibilityLabel={t('settings.privacy')} accessibilityRole="button">
            <Text style={[s.linkText, { color: colors.foreground }]}>{t('settings.privacy')}</Text>
            <ExternalLink size={14} color={colors.mutedForeground} />
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
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  subtitle: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20, marginBottom: 8 },
  sectionLabel: {
    fontSize: 10.5,
    fontFamily: fonts.bodySemi,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth },
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  faqQuestion: { fontSize: 14, lineHeight: 20, fontFamily: fonts.bodyMedium, flex: 1 },
  faqAnswer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 0 },
  answerText: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20 },
  contactTitle: { fontSize: 15, lineHeight: 22, fontFamily: fonts.bodySemi, padding: 16, paddingBottom: 4 },
  contactDesc: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20, paddingHorizontal: 16, paddingBottom: 16 },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 999,
    minHeight: 48,
  },
  contactBtnText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.bodySemi },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  linkText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.bodyMedium },
})

export default function HelpScreen() {
  return (
    <ScreenErrorBoundary screenName="Help">
      <HelpScreenInner />
    </ScreenErrorBoundary>
  )
}
