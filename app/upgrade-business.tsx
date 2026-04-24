import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, ActivityIndicator, Linking, Platform, KeyboardAvoidingView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, Building2, MapPin, Camera, Shield, Megaphone, BarChart3, Info } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { getBusinessAdapter } from '@/lib/adapters'
import { FEATURES } from '@/lib/featureFlags'
import { mapErrorToFinnish } from '@/lib/errorMessages'
import { useToast } from '@/components/Toast'
import type { Profile } from '@/lib/types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

const BUSINESS_CATEGORIES = [
  { id: 'kahvila', fi: 'Kahvila / Ravintola', en: 'Cafe / Restaurant', sv: 'Cafe / Restaurang' },
  { id: 'kampaamo', fi: 'Kampaamo / Kauneus', en: 'Hair / Beauty', sv: 'Frisör / Skönhet' },
  { id: 'siivous', fi: 'Siivous', en: 'Cleaning', sv: 'Städning' },
  { id: 'korjaus', fi: 'Korjaus / Remontti', en: 'Repair / Renovation', sv: 'Reparation / Renovering' },
  { id: 'muu', fi: 'Muu', en: 'Other', sv: 'Annat' },
]

const MONTHLY_PRICE = 2999 // cents — 29.99€

export default function UpgradeBusinessScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [vatId, setVatId] = useState('')
  const [category, setCategory] = useState('muu')
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [businessValidationType, setBusinessValidationType] = useState('prh')

  // Get business adapter for format hints — defaults to PRH (Finland)
  const businessAdapter = useMemo(
    () => getBusinessAdapter(businessValidationType),
    [businessValidationType],
  )
  const idFormat = useMemo(() => businessAdapter.getIdFormat(), [businessAdapter])

  // Feature flag gate — redirect if Business accounts are disabled
  useEffect(() => {
    if (!FEATURES.BUSINESS_ACCOUNT) {
      router.replace('/(tabs)')
    }
  }, [router])

  useEffect(() => {
    let mounted = true
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !mounted) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (data && mounted) {
        const p = data as unknown as Profile
        setProfile(p)
        if (p.is_business) {
          // Already a business — go to dashboard
          router.replace('/organization')
          return
        }
        setBusinessName(p.business_name ?? p.name ?? '')

        // Load country-specific business validation type if available
        try {
          const { data: countryConfig } = await (supabase.from('country_configs') as any)
            .select('business_validation')
            .eq('country_id', (data as any).detected_country ?? 'FI')
            .maybeSingle()
          if (countryConfig?.business_validation) {
            setBusinessValidationType(countryConfig.business_validation)
          }
        } catch {
          // country_configs table may not exist yet — use default (prh)
        }
      }
    }
    load()
    return () => { mounted = false }
  }, [supabase, router])

  const handleUpgrade = useCallback(async () => {
    if (!businessName.trim()) {
      toast.show({ message: t('business.nameRequired'), type: 'error' })
      return
    }
    if (!vatId.trim()) {
      toast.show({ message: t('business.vatRequired'), type: 'error' })
      return
    }
    if (!profile) return

    setSubmitting(true)
    try {
      // Step 1: Validate business via PRH (Finnish Patent and Registration Office)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const validateRes = await fetch(`${FUNCTIONS_URL}/validate-business`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ytunnus: vatId.trim(),
          business_name: businessName.trim(),
          category,
          address: address.trim(),
        }),
      })

      if (!validateRes.ok) {
        const body = await validateRes.json().catch(() => ({}))
        throw new Error(body.error ?? body.message ?? t('business.validationFailed'))
      }

      const validation = await validateRes.json()

      if (!validation.valid) {
        toast.show({ message: validation.message || t('business.validationFailed'), type: 'error' })
        setSubmitting(false)
        return
      }

      // Use official PRH name if auto-approved
      if (validation.prh_company?.name) {
        // Profile already updated by Edge Function
      }

      if (!validation.auto_approved) {
        // Manual review needed — show pending message
        toast.show({ message: t('business.pendingReview'), type: 'success' })
        setSubmitting(false)
        router.back()
        return
      }

      // Create Stripe subscription for business account
      // session already fetched above for PRH validation

      const res = await fetch(`${FUNCTIONS_URL}/pro-subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: 'business_monthly' }),
      })

      if (!res.ok) {
        // Fallback: use stripe-checkout for one-time setup
        const checkoutRes = await fetch(`${FUNCTIONS_URL}/stripe-checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            amount: MONTHLY_PRICE,
            description: `TackBird Business Account - ${businessName.trim()}`,
            type: 'ad_campaign',
            seller_id: profile.id,
            metadata: {
              type: 'business_subscription',
              business_name: businessName.trim(),
            },
            success_url: 'tackbird://payment/success?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'tackbird://payment/cancel',
          }),
        })

        if (!checkoutRes.ok) {
          const body = await checkoutRes.json().catch(() => ({}))
          throw new Error(body.error ?? 'Payment failed')
        }

        const { url } = await checkoutRes.json()
        if (url) {
          // Don't set is_business here — webhook will confirm after payment
          await Linking.openURL(url).catch(() => {})
        }
      } else {
        const { url } = await res.json()
        if (url) {
          // Don't set is_business here — webhook will confirm after payment
          await Linking.openURL(url).catch(() => {})
        }
      }

      // Don't navigate away — user will return via deep link after Stripe checkout
      toast.show({ message: t('business.pendingPayment'), type: 'success' })
    } catch (err: any) {
      toast.show({ message: mapErrorToFinnish(err, t), type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }, [businessName, vatId, category, address, profile, supabase, router, t, toast])

  const getCategoryLabel = (id: string) => {
    const cat = BUSINESS_CATEGORIES.find(c => c.id === id)
    if (!cat) return id
    return locale === 'fi' ? cat.fi : locale === 'sv' ? cat.sv : cat.en
  }

  return (
    <ScreenErrorBoundary screenName="UpgradeBusiness">
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
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('business.upgrade')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View style={s.hero}>
          <View style={[s.heroIconCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Building2 size={28} color={colors.foreground} />
          </View>
          <Text style={[s.heroTitle, { color: colors.foreground }]} accessibilityRole="header">{t('business.upgrade')}</Text>
          <Text style={[s.heroSubtitle, { color: colors.mutedForeground }]}>
            {t('business.upgradeDesc')}
          </Text>
          <Text style={[s.heroPrice, { color: colors.foreground }]}>
            {t('business.monthlyPrice')}
          </Text>
        </View>

        {/* Benefits — SURFACE card with LINE border, icon circles */}
        <View style={[s.benefitsCard, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
          {([
            { icon: Camera, text: t('business.benefitProfile') },
            { icon: MapPin, text: t('business.benefitMap') },
            { icon: Shield, text: t('business.benefitVerified') },
            { icon: Megaphone, text: t('business.benefitAds') },
            { icon: BarChart3, text: t('business.benefitAnalytics') },
          ] as const).map((benefit, i) => {
            const Icon = benefit.icon
            return (
              <View key={i} style={s.benefitRow}>
                <View style={[s.benefitIconCircle, { backgroundColor: colors.background }]}>
                  <Icon size={14} color={colors.foreground} />
                </View>
                <Text style={[s.benefitText, { color: colors.foreground }]}>{benefit.text}</Text>
              </View>
            )
          })}
        </View>

        {/* Form */}
        <Text style={[s.label, { color: colors.foreground }]}>{t('business.businessName')} *</Text>
        <TextInput
          style={[s.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={businessName}
          onChangeText={setBusinessName}
          placeholder={t('business.businessNamePlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          maxLength={100}
        />

        <Text style={[s.label, { color: colors.foreground }]}>
          {idFormat.label !== 'business.vatId' ? t(idFormat.label) : t('business.vatId')}
        </Text>
        <TextInput
          style={[s.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={vatId}
          onChangeText={setVatId}
          placeholder={idFormat.placeholder}
          placeholderTextColor={colors.mutedForeground}
          maxLength={20}
        />

        <Text style={[s.label, { color: colors.foreground }]}>{t('business.category')}</Text>
        <View style={s.categoryRow}>
          {BUSINESS_CATEGORIES.map(cat => (
            <PressableOpacity
              key={cat.id}
              onPress={() => setCategory(cat.id)}
              style={[
                s.categoryChip,
                {
                  backgroundColor: category === cat.id ? colors.foreground : colors.card,
                  borderColor: category === cat.id ? colors.foreground : colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={getCategoryLabel(cat.id)}
              accessibilityState={{ selected: category === cat.id }}
            >
              <Text style={[
                s.categoryText,
                { color: category === cat.id ? colors.background : colors.foreground },
              ]}>
                {getCategoryLabel(cat.id)}
              </Text>
            </PressableOpacity>
          ))}
        </View>

        <Text style={[s.label, { color: colors.foreground }]}>{t('business.address')}</Text>
        <TextInput
          style={[s.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={address}
          onChangeText={setAddress}
          placeholder={t('business.addressPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          maxLength={200}
        />

        {/* Pricing section — INK card */}
        {Platform.OS !== 'ios' && (
          <View style={[s.pricingCard, { backgroundColor: colors.foreground }]}>
            <Text style={[s.pricingTierLabel, { color: colors.background }]}>BUSINESS</Text>
            <Text style={[s.pricingPrice, { color: colors.background }]}>
              {t('business.monthlyPrice')}
            </Text>
            <Text style={[s.pricingPeriod, { color: colors.background }]}>{t('pro.perMonth')}</Text>
          </View>
        )}

        {/* Submit — INK bg, white text, pill shape */}
        {Platform.OS !== 'ios' && (
          <>
            <PressableOpacity
              onPress={handleUpgrade}
              disabled={submitting || !businessName.trim() || !vatId.trim()}
              style={[s.submitBtn, { backgroundColor: colors.foreground, opacity: submitting || !businessName.trim() || !vatId.trim() ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('business.subscribeCTA')}
              accessibilityState={{ disabled: submitting || !businessName.trim() || !vatId.trim() }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <>
                  <Building2 size={18} color={colors.background} />
                  <Text style={[s.submitText, { color: colors.background }]}>
                    {t('business.subscribeCTA')} — {t('business.monthlyPrice')}
                  </Text>
                </>
              )}
            </PressableOpacity>

            <Text style={[s.terms, { color: colors.mutedForeground }]}>
              {t('pro.cancelAnytime')}. {t('business.termsNote')}
            </Text>
          </>
        )}

        {/* iOS: Subscription will be available via App Store */}
        {Platform.OS === 'ios' && (
          <View style={[s.iosInfoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.infoIconCircle, { backgroundColor: colors.background }]}>
              <Info size={16} color={colors.mutedForeground} />
            </View>
            <Text style={[s.iosInfoText, { color: colors.foreground }]}>
              {t('business.comingSoonIOS')}
            </Text>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
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
  content: { padding: 20, gap: 12, paddingBottom: 64 },

  // Hero
  hero: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  heroIconCircle: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, marginBottom: 4,
  },
  heroTitle: { fontSize: 24, lineHeight: 30, letterSpacing: -0.3, fontFamily: fonts.heading },
  heroSubtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', fontFamily: fonts.body, paddingHorizontal: 16 },
  heroPrice: { fontSize: 22, lineHeight: 28, marginTop: 8, fontFamily: fonts.heading },

  // Benefits — SURFACE card
  benefitsCard: { borderRadius: 20, padding: 16, gap: 14 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIconCircle: {
    width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  benefitText: { fontSize: 14, flex: 1, lineHeight: 20, fontFamily: fonts.body },

  // Form
  label: { fontSize: 13, lineHeight: 18, marginTop: 8, fontFamily: fonts.bodySemi },
  input: {
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 16, fontSize: 14, fontFamily: fonts.body,
  },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
  },
  categoryText: { fontSize: 13, fontFamily: fonts.bodyMedium },

  // Pricing card — INK bg
  pricingCard: {
    borderRadius: 20, padding: 20, alignItems: 'center', gap: 4, marginTop: 8,
  },
  pricingTierLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: fonts.bodySemi },
  pricingPrice: { fontSize: 28, lineHeight: 34, fontWeight: '800', fontFamily: fonts.heading },
  pricingPeriod: { fontSize: 13, lineHeight: 18, fontFamily: fonts.body, opacity: 0.7 },

  // CTA — INK bg, pill
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 54, borderRadius: 999, marginTop: 12,
  },
  submitText: { fontSize: 16, lineHeight: 22, fontFamily: fonts.bodySemi },
  terms: { fontSize: 11, textAlign: 'center', lineHeight: 16, paddingHorizontal: 8, fontFamily: fonts.body },

  // iOS info
  iosInfoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 20, borderWidth: 1, marginTop: 12,
  },
  infoIconCircle: {
    width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  iosInfoText: { fontSize: 14, flex: 1, lineHeight: 20, fontFamily: fonts.body },
})
