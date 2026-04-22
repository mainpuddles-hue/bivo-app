import { useState, useCallback, useEffect, useMemo } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, Linking, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, Crown, Check, X, Sparkles, BarChart3, Shield, Megaphone, BadgeCheck, Zap, Info } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { FEATURES as APP_FEATURES } from '@/lib/featureFlags'
import type { Profile } from '@/lib/types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

type Plan = 'monthly' | 'yearly'

// WARM_TINT now comes from useTheme().colors.warmTint

export default function ProScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()

  const FEATURES = useMemo(() => [
    { icon: Zap, free: t('pro.freeListing'), pro: t('pro.proListing') },
    { icon: Sparkles, free: t('pro.freeCommission'), pro: t('pro.proCommission') },
    { icon: Megaphone, free: t('pro.freeAds'), pro: t('pro.proAds') },
    { icon: BarChart3, free: t('pro.freeStats'), pro: t('pro.proStats') },
    { icon: BadgeCheck, free: t('pro.freeBadge'), pro: t('pro.proBadge') },
    { icon: Shield, free: t('pro.freeSupport'), pro: t('pro.proSupport') },
  ], [t])
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<Plan>('yearly')
  const [purchasing, setPurchasing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Feature flag gate — redirect if Pro subscription is disabled
  useEffect(() => {
    if (!APP_FEATURES.PRO_SUBSCRIPTION) {
      router.replace('/(tabs)')
    }
  }, [router])

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
        if (data) setProfile(data as unknown as Profile)
      } catch {} // Intentional: network error — keep loading state
    }
    load()
  }, [supabase])

  const handleSubscribe = useCallback(async () => {
    setPurchasing(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        Alert.alert(t('common.error'), t('common.loginRequired'))
        setPurchasing(false)
        return
      }

      const res = await fetch(`${FUNCTIONS_URL}/pro-subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: selectedPlan }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? t('pro.checkoutError'))
      }

      const { url } = await res.json()
      if (url) {
        await Linking.openURL(url).catch(() => {})
      }
    } catch (err: any) {
      setError(err.message ?? t('pro.checkoutError'))
    } finally {
      setPurchasing(false)
    }
  }, [selectedPlan, supabase, t])

  const isPro = profile?.is_pro
  const proExpiresAt = profile?.pro_expires_at

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const localeStr = locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB'
    return date.toLocaleDateString(localeStr, { day: 'numeric', month: 'long', year: 'numeric' })
  }

  return (
    <ScreenErrorBoundary screenName="Pro">
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header — circle back button + centered title */}
      <View style={[s.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[s.backCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={20} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>TackBird Pro</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.hero}>
          <View style={[s.heroIconCircle, { backgroundColor: colors.background }]}>
            <Crown size={28} color={colors.foreground} />
          </View>
          <Text style={[s.heroTitle, { color: colors.foreground }]} accessibilityRole="header">TackBird Pro</Text>
          <Text style={[s.heroSubtitle, { color: colors.mutedForeground }]}>
            {t('pro.subtitle')}
          </Text>
          {isPro && (
            <View style={s.heroActiveDot}>
              <View style={[s.statusDot, { backgroundColor: colors.foreground }]} />
              <Text style={[s.activeBadgeText, { color: colors.mutedForeground }]}>{t('profile.proActive')}</Text>
            </View>
          )}
          {isPro && proExpiresAt && (
            <Text style={[s.renewsText, { color: colors.mutedForeground }]}>
              {t('pro.renewsOn', { date: formatDate(proExpiresAt) })}
            </Text>
          )}
        </View>

        {/* Feature comparison — SURFACE cards with LINE border */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('pro.freeVsPro')}</Text>
        <View style={[s.comparisonCard, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
          {/* Table header */}
          <View style={[s.comparisonHeader, { borderBottomColor: colors.border }]}>
            <View style={s.comparisonIconCol} />
            <Text style={[s.comparisonColLabel, s.comparisonFreeCol, { color: colors.mutedForeground }]}>{t('pro.free')}</Text>
            <Text style={[s.comparisonColLabel, s.comparisonProCol, { color: colors.foreground }]}>{t('pro.proLabel')}</Text>
          </View>
          {FEATURES.map(({ icon: Icon, free, pro }, i) => (
            <View
              key={i}
              style={[
                s.comparisonRow,
                i < FEATURES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
              ]}
            >
              <View style={s.comparisonIconCol}>
                <View style={[s.featureIconCircle, { backgroundColor: colors.background }]}>
                  <Icon size={14} color={colors.mutedForeground} />
                </View>
              </View>
              <View style={s.comparisonFreeCol}>
                <X size={14} color={colors.destructive} />
                <Text style={[s.comparisonText, { color: colors.mutedForeground }]}>{free}</Text>
              </View>
              <View style={s.comparisonProCol}>
                <Check size={14} color={colors.foreground} />
                <Text style={[s.comparisonText, { color: colors.foreground }]}>{pro}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Pricing cards */}
        {!isPro && Platform.OS !== 'ios' && (
          <>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('pro.upgradeToPro').toUpperCase()}</Text>
            <View style={s.pricingRow}>
              {/* Free tier card — SURFACE bg */}
              <View style={[s.pricingCard, s.pricingCardFree, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.pricingTierLabel, { color: colors.mutedForeground }]}>{t('pro.free')}</Text>
                <Text style={[s.pricingPrice, { color: colors.foreground }]}>
                  0 {'\u20AC'}
                </Text>
                <Text style={[s.pricingPeriod, { color: colors.mutedForeground }]}>{t('pro.perMonth')}</Text>
              </View>

              {/* Monthly — selectable */}
              <PressableOpacity
                onPress={() => setSelectedPlan('monthly')}
                style={[
                  s.pricingCard,
                  {
                    backgroundColor: selectedPlan === 'monthly' ? colors.foreground : colors.card,
                    borderColor: selectedPlan === 'monthly' ? colors.foreground : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${t('pro.monthly')} 4.99 €`}
                accessibilityState={{ selected: selectedPlan === 'monthly' }}
              >
                <Text style={[s.pricingTierLabel, { color: selectedPlan === 'monthly' ? colors.background : colors.mutedForeground }]}>{t('pro.monthly')}</Text>
                <Text style={[s.pricingPrice, { color: selectedPlan === 'monthly' ? colors.background : colors.foreground }]}>
                  4.99 {'\u20AC'}
                </Text>
                <Text style={[s.pricingPeriod, { color: selectedPlan === 'monthly' ? colors.background : colors.mutedForeground }]}>{t('pro.perMonth')}</Text>
              </PressableOpacity>

              {/* Yearly — selectable, featured INK bg when selected */}
              <PressableOpacity
                onPress={() => setSelectedPlan('yearly')}
                style={[
                  s.pricingCard,
                  {
                    backgroundColor: selectedPlan === 'yearly' ? colors.foreground : colors.card,
                    borderColor: selectedPlan === 'yearly' ? colors.foreground : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${t('pro.yearly')} 39.99 €`}
                accessibilityState={{ selected: selectedPlan === 'yearly' }}
              >
                <View style={[s.saveBadge, { backgroundColor: selectedPlan === 'yearly' ? colors.background : colors.foreground }]}>
                  <Text style={[s.saveBadgeText, { color: selectedPlan === 'yearly' ? colors.foreground : colors.background }]}>-33%</Text>
                </View>
                <Text style={[s.pricingTierLabel, { color: selectedPlan === 'yearly' ? colors.background : colors.mutedForeground }]}>{t('pro.yearly')}</Text>
                <Text style={[s.pricingPrice, { color: selectedPlan === 'yearly' ? colors.background : colors.foreground }]}>
                  39.99 {'\u20AC'}
                </Text>
                <Text style={[s.pricingPeriod, { color: selectedPlan === 'yearly' ? colors.background : colors.mutedForeground }]}>{t('pro.perYear')}</Text>
                <Text style={[s.pricingSubtext, { color: selectedPlan === 'yearly' ? colors.background : colors.mutedForeground }]}>3.33 {'\u20AC'}{t('pro.perMonth')}</Text>
              </PressableOpacity>
            </View>

            {/* Auto-renewal disclosure (Apple Guidelines 3.1.2) */}
            <Text style={[s.autoRenewalText, { color: colors.mutedForeground }]}>
              {t('pro.autoRenewalNotice')}
            </Text>

            {/* Subscribe button — INK bg, white text, pill shape */}
            <PressableOpacity
              onPress={handleSubscribe}
              disabled={purchasing}
              style={[s.subscribeBtn, { backgroundColor: colors.foreground, opacity: purchasing ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('pro.subscribe')}
              accessibilityState={{ disabled: purchasing }}
            >
              {purchasing ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <>
                  <Crown size={20} color={colors.background} />
                  <Text style={[s.subscribeBtnText, { color: colors.background }]}>
                    {selectedPlan === 'monthly' ? '4.99 \u20AC' + t('pro.perMonth') : '39.99 \u20AC' + t('pro.perYear')}
                    {' \u2014 '}
                    {t('pro.subscribe')}
                  </Text>
                </>
              )}
            </PressableOpacity>
          </>
        )}

        {/* Restore Purchases (required by Apple for IAP) */}
        {Platform.OS === 'ios' && (
          <PressableOpacity
            onPress={() => Alert.alert(t('pro.restorePurchases'), t('pro.restorePurchasesInfo'))}
            style={[s.restoreBtn, { borderColor: colors.border }]}
          >
            <Text style={[s.restoreBtnText, { color: colors.mutedForeground }]}>
              {t('pro.restorePurchases')}
            </Text>
          </PressableOpacity>
        )}

        {/* iOS: Subscription will be available via App Store */}
        {!isPro && Platform.OS === 'ios' && (
          <View style={[s.iosInfoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.infoIconCircle, { backgroundColor: colors.background }]}>
              <Info size={16} color={colors.mutedForeground} />
            </View>
            <Text style={[s.iosInfoText, { color: colors.foreground }]}>
              {t('pro.comingSoonIOS')}
            </Text>
          </View>
        )}

        {/* Manage subscription */}
        {isPro && (
          <PressableOpacity
            onPress={() => router.push('/payment-settings' as any)}
            style={[s.manageBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[s.manageBtnText, { color: colors.foreground }]}>
              {t('pro.manageSubscription')}
            </Text>
          </PressableOpacity>
        )}

        {/* Error */}
        {error && (
          <Text style={[s.errorText, { color: colors.destructive }]}>{error}</Text>
        )}

        {/* Terms */}
        <Text style={[s.termsText, { color: colors.mutedForeground }]}>
          {t('pro.cancelAnytime')}.{' '}
          {t('pro.termsNote')}
        </Text>
      </ScrollView>
    </View>
    </ScreenErrorBoundary>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backCircle: {
    width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: { fontSize: 14, lineHeight: 22, letterSpacing: -0.3, fontFamily: fonts.headingSemi, flex: 1, textAlign: 'center' },
  content: { padding: 20, gap: 16, paddingBottom: 60 },

  // Hero
  hero: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  heroIconCircle: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  heroTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5, fontFamily: fonts.heading },
  heroSubtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', fontFamily: fonts.body, paddingHorizontal: 16 },
  heroActiveDot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  activeBadgeText: { fontSize: 14, lineHeight: 20, fontWeight: '600', fontFamily: fonts.bodySemi },
  renewsText: { fontSize: 13, lineHeight: 18, marginTop: 8, fontFamily: fonts.body },

  // Section
  sectionLabel: {
    fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 0.8,
    textTransform: 'uppercase', marginTop: 8, paddingHorizontal: 4,
    fontFamily: fonts.bodySemi,
  },

  // Feature comparison — SURFACE card with LINE border
  comparisonCard: { borderRadius: 20, overflow: 'hidden' },
  comparisonHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  comparisonIconCol: { width: 40 },
  featureIconCircle: {
    width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  comparisonFreeCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  comparisonProCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  comparisonColLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', fontFamily: fonts.bodySemi },
  comparisonRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  comparisonText: { fontSize: 13, lineHeight: 18, flex: 1, fontFamily: fonts.body },

  // Pricing
  pricingRow: { flexDirection: 'row', gap: 10 },
  pricingCard: {
    flex: 1, borderRadius: 20, borderWidth: 1,
    padding: 16, alignItems: 'center', gap: 4, position: 'relative', overflow: 'hidden',
  },
  pricingCardFree: {
    // Non-interactive free tier
  },
  pricingTierLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: fonts.bodySemi },
  pricingPrice: { fontSize: 28, lineHeight: 34, fontWeight: '800', fontFamily: fonts.heading },
  pricingPeriod: { fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
  pricingSubtext: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 2, fontFamily: fonts.bodySemi },
  saveBadge: {
    position: 'absolute', top: 8, right: -20,
    paddingHorizontal: 24, paddingVertical: 3,
    transform: [{ rotate: '30deg' }],
  },
  saveBadgeText: { fontSize: 11, lineHeight: 14, fontWeight: '800', fontFamily: fonts.bodySemi },

  // CTA — INK bg, white text, pill
  subscribeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, height: 54, borderRadius: 999, marginTop: 4,
  },
  subscribeBtnText: { fontSize: 16, lineHeight: 22, fontWeight: '700', fontFamily: fonts.bodySemi },

  // Manage
  manageBtn: {
    alignItems: 'center', paddingVertical: 16, borderRadius: 20,
    borderWidth: 1, minHeight: 48,
  },
  manageBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '600', fontFamily: fonts.bodySemi },

  // Info card
  iosInfoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 20, borderWidth: 1, marginTop: 8,
  },
  infoIconCircle: {
    width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  iosInfoText: { fontSize: 14, flex: 1, lineHeight: 20, fontFamily: fonts.body },

  // Misc
  errorText: { fontSize: 13, lineHeight: 18, textAlign: 'center', fontFamily: fonts.body },
  termsText: { fontSize: 11, textAlign: 'center', lineHeight: 16, paddingHorizontal: 8, fontFamily: fonts.body },
  autoRenewalText: { fontSize: 11, textAlign: 'center', lineHeight: 16, paddingHorizontal: 8, fontFamily: fonts.body },
  restoreBtn: {
    alignItems: 'center', paddingVertical: 12, borderRadius: 999,
    borderWidth: 1, minHeight: 48,
  },
  restoreBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '500', fontFamily: fonts.bodyMedium },
})
