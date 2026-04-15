import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator, Linking, Platform, KeyboardAvoidingView } from 'react-native'
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
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (data) {
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
            .eq('country_id', (data as any).country_id ?? 'FI')
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
  }, [supabase, router])

  const handleUpgrade = useCallback(async () => {
    if (!businessName.trim()) {
      Alert.alert(t('common.error'), t('business.nameRequired'))
      return
    }
    if (!vatId.trim()) {
      Alert.alert(t('common.error'), t('business.vatRequired'))
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
        Alert.alert(t('common.error'), validation.message || t('business.validationFailed'))
        setSubmitting(false)
        return
      }

      // Use official PRH name if auto-approved
      if (validation.prh_company?.name) {
        // Profile already updated by Edge Function
      }

      if (!validation.auto_approved) {
        // Manual review needed — show pending message
        Alert.alert(t('common.success'), t('business.pendingReview'))
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
      Alert.alert(t('common.success'), t('business.pendingPayment'))
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message ?? t('business.upgradeError'))
    } finally {
      setSubmitting(false)
    }
  }, [businessName, vatId, category, address, profile, supabase, router, t])

  const getCategoryLabel = (id: string) => {
    const cat = BUSINESS_CATEGORIES.find(c => c.id === id)
    if (!cat) return id
    return locale === 'fi' ? cat.fi : locale === 'sv' ? cat.sv : cat.en
  }

  return (
    <ScreenErrorBoundary screenName="UpgradeBusiness">
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <PressableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={24} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('business.upgrade')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}18` }]}>
            <Building2 size={40} color={colors.primary} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>{t('business.upgrade')}</Text>
          <Text style={[styles.heroSubtitle, { color: colors.mutedForeground }]}>
            {t('business.upgradeDesc')}
          </Text>
          <Text style={[styles.heroPrice, { color: colors.primary }]}>
            {t('business.monthlyPrice')}
          </Text>
        </View>

        {/* Benefits */}
        <View style={[styles.benefitsCard, { backgroundColor: colors.card }]}>
          {([
            { icon: Camera, text: t('business.benefitProfile') },
            { icon: MapPin, text: t('business.benefitMap') },
            { icon: Shield, text: t('business.benefitVerified') },
            { icon: Megaphone, text: t('business.benefitAds') },
            { icon: BarChart3, text: t('business.benefitAnalytics') },
          ] as const).map((benefit, i) => {
            const Icon = benefit.icon
            return (
              <View key={i} style={styles.benefitRow}>
                <Icon size={16} color={colors.primary} />
                <Text style={[styles.benefitText, { color: colors.foreground }]}>{benefit.text}</Text>
              </View>
            )
          })}
        </View>

        {/* Form */}
        <Text style={[styles.label, { color: colors.foreground }]}>{t('business.businessName')} *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={businessName}
          onChangeText={setBusinessName}
          placeholder={t('business.businessNamePlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          maxLength={100}
        />

        <Text style={[styles.label, { color: colors.foreground }]}>
          {idFormat.label !== 'business.vatId' ? t(idFormat.label) : t('business.vatId')}
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={vatId}
          onChangeText={setVatId}
          placeholder={idFormat.placeholder}
          placeholderTextColor={colors.mutedForeground}
          maxLength={20}
        />

        <Text style={[styles.label, { color: colors.foreground }]}>{t('business.category')}</Text>
        <View style={styles.categoryRow}>
          {BUSINESS_CATEGORIES.map(cat => (
            <PressableOpacity
              key={cat.id}
              onPress={() => setCategory(cat.id)}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: category === cat.id ? colors.primary : colors.card,
                  borderColor: category === cat.id ? colors.primary : colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={getCategoryLabel(cat.id)}
              accessibilityState={{ selected: category === cat.id }}
            >
              <Text style={[
                styles.categoryText,
                { color: category === cat.id ? colors.primaryForeground : colors.foreground },
              ]}>
                {getCategoryLabel(cat.id)}
              </Text>
            </PressableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.foreground }]}>{t('business.address')}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={address}
          onChangeText={setAddress}
          placeholder={t('business.addressPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          maxLength={200}
        />

        {/* Submit — Stripe flow (Android/web only) */}
        {Platform.OS !== 'ios' && (
          <>
            <PressableOpacity
              onPress={handleUpgrade}
              disabled={submitting || !businessName.trim() || !vatId.trim()}
              style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting || !businessName.trim() || !vatId.trim() ? 0.6 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={t('business.subscribeCTA')}
              accessibilityState={{ disabled: submitting || !businessName.trim() || !vatId.trim() }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <Building2 size={18} color={colors.primaryForeground} />
                  <Text style={[styles.submitText, { color: colors.primaryForeground }]}>
                    {t('business.subscribeCTA')} — {t('business.monthlyPrice')}
                  </Text>
                </>
              )}
            </PressableOpacity>

            <Text style={[styles.terms, { color: colors.mutedForeground }]}>
              {t('pro.cancelAnytime')}. {t('business.termsNote')}
            </Text>
          </>
        )}

        {/* iOS: Subscription will be available via App Store */}
        {Platform.OS === 'ios' && (
          <View style={[styles.iosInfoCard, { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}30` }]}>
            <Info size={20} color={colors.primary} />
            <Text style={[styles.iosInfoText, { color: colors.foreground }]}>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, letterSpacing: -0.3, fontFamily: fonts.headingSemi },
  content: { padding: 16, gap: 8, paddingBottom: 64 },
  hero: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3, fontFamily: fonts.heading },
  heroSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22, fontFamily: fonts.body },
  heroPrice: { fontSize: 22, fontWeight: '800', marginTop: 8, fontFamily: fonts.heading },
  benefitsCard: { borderRadius: 16, padding: 16, gap: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitText: { fontSize: 14, flex: 1, fontFamily: fonts.body },
  label: { fontSize: 14, fontWeight: '600', marginTop: 8, fontFamily: fonts.bodySemi },
  input: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16, paddingVertical: 16, fontSize: 14, fontFamily: fonts.body,
  },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  categoryText: { fontSize: 13, fontWeight: '500', fontFamily: fonts.bodyMedium },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16, marginTop: 12, minHeight: 48,
  },
  submitText: { fontSize: 16, fontWeight: '700', fontFamily: fonts.bodySemi },
  terms: { fontSize: 11, textAlign: 'center', lineHeight: 16, paddingHorizontal: 8, fontFamily: fonts.body },
  iosInfoCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 16, borderWidth: 1, marginTop: 12,
  },
  iosInfoText: { fontSize: 14, flex: 1, lineHeight: 20, fontFamily: fonts.body },
})
