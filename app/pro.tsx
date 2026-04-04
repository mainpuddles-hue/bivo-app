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
import { FEATURES as APP_FEATURES } from '@/lib/featureFlags'
import type { Profile } from '@/lib/types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

type Plan = 'monthly' | 'yearly'

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
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
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
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>TackBird Pro</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.hero}>
          <View style={[s.crownCircle, { backgroundColor: `${colors.pro}20` }]}>
            <Crown size={48} color={colors.pro} />
          </View>
          <Text style={[s.heroTitle, { color: colors.pro }]}>TackBird Pro</Text>
          <Text style={[s.heroSubtitle, { color: colors.mutedForeground }]}>
            {t('pro.subtitle')}
          </Text>
          {isPro && (
            <View style={[s.activeBadge, { backgroundColor: `${colors.pro}20` }]}>
              <Check size={16} color={colors.pro} />
              <Text style={[s.activeBadgeText, { color: colors.pro }]}>{t('profile.proActive')}</Text>
            </View>
          )}
          {isPro && proExpiresAt && (
            <Text style={[s.renewsText, { color: colors.mutedForeground }]}>
              {t('pro.renewsOn', { date: formatDate(proExpiresAt) })}
            </Text>
          )}
        </View>

        {/* Feature comparison */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('pro.freeVsPro')}</Text>
        <View style={[s.comparisonCard, { backgroundColor: colors.card }]}>
          {/* Table header */}
          <View style={[s.comparisonHeader, { borderBottomColor: colors.border }]}>
            <View style={s.comparisonIconCol} />
            <Text style={[s.comparisonColLabel, s.comparisonFreeCol, { color: colors.mutedForeground }]}>{t('pro.free')}</Text>
            <Text style={[s.comparisonColLabel, s.comparisonProCol, { color: colors.pro }]}>{t('pro.proLabel')}</Text>
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
                <Icon size={18} color={colors.mutedForeground} />
              </View>
              <View style={s.comparisonFreeCol}>
                <X size={14} color={colors.destructive} />
                <Text style={[s.comparisonText, { color: colors.mutedForeground }]}>{free}</Text>
              </View>
              <View style={s.comparisonProCol}>
                <Check size={14} color={colors.pro} />
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
              {/* Monthly */}
              <Pressable
                onPress={() => setSelectedPlan('monthly')}
                style={[
                  s.pricingCard,
                  { backgroundColor: colors.card, borderColor: selectedPlan === 'monthly' ? colors.pro : colors.border },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${t('pro.monthly')} 4.99 €`}
                accessibilityState={{ selected: selectedPlan === 'monthly' }}
              >
                <Text style={[s.pricingLabel, { color: colors.foreground }]}>{t('pro.monthly')}</Text>
                <Text style={[s.pricingPrice, { color: selectedPlan === 'monthly' ? colors.pro : colors.foreground }]}>
                  4.99 {'\u20AC'}
                </Text>
                <Text style={[s.pricingPeriod, { color: colors.mutedForeground }]}>{t('pro.perMonth')}</Text>
              </Pressable>

              {/* Yearly */}
              <Pressable
                onPress={() => setSelectedPlan('yearly')}
                style={[
                  s.pricingCard,
                  { backgroundColor: colors.card, borderColor: selectedPlan === 'yearly' ? colors.pro : colors.border },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${t('pro.yearly')} 39.99 €`}
                accessibilityState={{ selected: selectedPlan === 'yearly' }}
              >
                <View style={[s.saveBadge, { backgroundColor: colors.pro }]}>
                  <Text style={[s.saveBadgeText, { color: colors.primaryForeground }]}>-33%</Text>
                </View>
                <Text style={[s.pricingLabel, { color: colors.foreground }]}>{t('pro.yearly')}</Text>
                <Text style={[s.pricingPrice, { color: selectedPlan === 'yearly' ? colors.pro : colors.foreground }]}>
                  39.99 {'\u20AC'}
                </Text>
                <Text style={[s.pricingPeriod, { color: colors.mutedForeground }]}>{t('pro.perYear')}</Text>
                <Text style={[s.pricingSubtext, { color: colors.pro }]}>3.33 {'\u20AC'}{t('pro.perMonth')}</Text>
              </Pressable>
            </View>

            {/* Auto-renewal disclosure (Apple Guidelines 3.1.2) */}
            <Text style={[s.autoRenewalText, { color: colors.mutedForeground }]}>
              {t('pro.autoRenewalNotice')}
            </Text>

            {/* Subscribe button */}
            <Pressable
              onPress={handleSubscribe}
              disabled={purchasing}
              style={[s.subscribeBtn, { backgroundColor: colors.pro, opacity: purchasing ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('pro.subscribe')}
              accessibilityState={{ disabled: purchasing }}
            >
              {purchasing ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <Crown size={20} color={colors.primaryForeground} />
                  <Text style={[s.subscribeBtnText, { color: colors.primaryForeground }]}>
                    {selectedPlan === 'monthly' ? '4.99 \u20AC' + t('pro.perMonth') : '39.99 \u20AC' + t('pro.perYear')}
                    {' \u2014 '}
                    {t('pro.subscribe')}
                  </Text>
                </>
              )}
            </Pressable>
          </>
        )}

        {/* Restore Purchases (required by Apple for IAP) */}
        {Platform.OS === 'ios' && (
          <Pressable
            onPress={() => Alert.alert(t('pro.restorePurchases'), t('pro.restorePurchasesInfo'))}
            style={[s.restoreBtn, { borderColor: colors.border }]}
          >
            <Text style={[s.restoreBtnText, { color: colors.mutedForeground }]}>
              {t('pro.restorePurchases')}
            </Text>
          </Pressable>
        )}

        {/* iOS: Subscription will be available via App Store */}
        {!isPro && Platform.OS === 'ios' && (
          <View style={[s.iosInfoCard, { backgroundColor: `${colors.pro}12`, borderColor: `${colors.pro}30` }]}>
            <Info size={20} color={colors.pro} />
            <Text style={[s.iosInfoText, { color: colors.foreground }]}>
              {t('pro.comingSoonIOS')}
            </Text>
          </View>
        )}

        {/* Manage subscription */}
        {isPro && (
          <Pressable
            onPress={() => router.push('/payment-settings' as any)}
            style={[s.manageBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[s.manageBtnText, { color: colors.foreground }]}>
              {t('pro.manageSubscription')}
            </Text>
          </Pressable>
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
  headerTitle: { fontSize: 20, lineHeight: 28, letterSpacing: -0.3, fontFamily: fonts.headingSemi },
  content: { padding: 16, gap: 16, paddingBottom: 60 },
  hero: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  crownCircle: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  heroTitle: { fontSize: 32, lineHeight: 36, fontWeight: '700', letterSpacing: -0.5, fontFamily: fonts.heading },
  heroSubtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center', fontFamily: fonts.body },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, marginTop: 8,
  },
  activeBadgeText: { fontSize: 14, lineHeight: 20, fontWeight: '600', fontFamily: fonts.bodySemi },
  renewsText: { fontSize: 13, lineHeight: 18, marginTop: 8, fontFamily: fonts.body },
  sectionLabel: {
    fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.5,
    textTransform: 'uppercase', marginTop: 8, paddingHorizontal: 4,
    fontFamily: fonts.bodySemi,
  },
  comparisonCard: { borderRadius: 12, overflow: 'hidden' },
  comparisonHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  comparisonIconCol: { width: 32 },
  comparisonFreeCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  comparisonProCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  comparisonColLabel: { fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase', fontFamily: fonts.bodySemi },
  comparisonRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  comparisonText: { fontSize: 13, lineHeight: 18, flex: 1, fontFamily: fonts.body },
  pricingRow: { flexDirection: 'row', gap: 12 },
  pricingCard: {
    flex: 1, borderRadius: 12, borderWidth: 2,
    padding: 16, alignItems: 'center', gap: 4, position: 'relative', overflow: 'hidden',
  },
  pricingLabel: { fontSize: 14, lineHeight: 20, fontWeight: '600', fontFamily: fonts.bodySemi },
  pricingPrice: { fontSize: 32, lineHeight: 36, fontWeight: '800', fontFamily: fonts.heading },
  pricingPeriod: { fontSize: 13, lineHeight: 18, fontFamily: fonts.body },
  pricingSubtext: { fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 2, fontFamily: fonts.bodySemi },
  saveBadge: {
    position: 'absolute', top: 8, right: -20,
    paddingHorizontal: 24, paddingVertical: 3,
    transform: [{ rotate: '30deg' }],
  },
  saveBadgeText: { fontSize: 11, lineHeight: 14, fontWeight: '800', fontFamily: fonts.bodySemi },
  subscribeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 16, borderRadius: 12, marginTop: 4, minHeight: 48,
  },
  subscribeBtnText: { fontSize: 16, lineHeight: 22, fontWeight: '700', fontFamily: fonts.bodySemi },
  manageBtn: {
    alignItems: 'center', paddingVertical: 16, borderRadius: 12,
    borderWidth: 1, minHeight: 48,
  },
  manageBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '600', fontFamily: fonts.bodySemi },
  errorText: { fontSize: 13, lineHeight: 18, textAlign: 'center', fontFamily: fonts.body },
  termsText: { fontSize: 11, textAlign: 'center', lineHeight: 16, paddingHorizontal: 8, fontFamily: fonts.body },
  iosInfoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 12, borderWidth: 1, marginTop: 8,
  },
  iosInfoText: { fontSize: 14, flex: 1, lineHeight: 20, fontFamily: fonts.body },
  autoRenewalText: { fontSize: 11, textAlign: 'center', lineHeight: 16, paddingHorizontal: 8, fontFamily: fonts.body },
  restoreBtn: {
    alignItems: 'center', paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, minHeight: 48,
  },
  restoreBtnText: { fontSize: 14, lineHeight: 20, fontWeight: '500', fontFamily: fonts.bodyMedium },
})
