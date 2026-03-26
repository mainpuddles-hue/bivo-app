import { useState, useEffect, useCallback } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, Building2, MapPin, FileText, Check } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        const p = data as unknown as Profile
        setProfile(p)
        if (p.is_business) {
          // Already a business — go to dashboard
          router.replace('/organization')
          return
        }
        setBusinessName(p.business_name ?? p.name ?? '')
      }
    }
    load()
  }, [supabase, router])

  const handleUpgrade = useCallback(async () => {
    if (!businessName.trim()) {
      Alert.alert(t('common.error'), t('business.nameRequired'))
      return
    }
    if (!profile) return

    setSubmitting(true)
    try {
      // Update profile with business info
      await (supabase.from('profiles') as any).update({
        business_name: businessName.trim(),
        business_vat_id: vatId.trim() || null,
        business_category: category,
        business_address: address.trim() || null,
      }).eq('id', profile.id)

      // Create Stripe subscription for business account
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

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
          // Mark as business after payment success (webhook will confirm)
          await (supabase.from('profiles') as any).update({
            is_business: true,
          }).eq('id', profile.id)
          await Linking.openURL(url)
        }
      } else {
        const { url } = await res.json()
        if (url) {
          await (supabase.from('profiles') as any).update({
            is_business: true,
          }).eq('id', profile.id)
          await Linking.openURL(url)
        }
      }

      router.back()
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('business.upgrade')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
          {[
            t('business.benefitAds'),
            t('business.benefitMap'),
            t('business.benefitDashboard'),
            t('business.benefitSupport'),
          ].map((benefit, i) => (
            <View key={i} style={styles.benefitRow}>
              <Check size={16} color={colors.success} />
              <Text style={[styles.benefitText, { color: colors.foreground }]}>{benefit}</Text>
            </View>
          ))}
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

        <Text style={[styles.label, { color: colors.foreground }]}>{t('business.vatId')}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={vatId}
          onChangeText={setVatId}
          placeholder="1234567-8"
          placeholderTextColor={colors.mutedForeground}
          maxLength={20}
        />

        <Text style={[styles.label, { color: colors.foreground }]}>{t('business.category')}</Text>
        <View style={styles.categoryRow}>
          {BUSINESS_CATEGORIES.map(cat => (
            <Pressable
              key={cat.id}
              onPress={() => setCategory(cat.id)}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: category === cat.id ? colors.primary : colors.card,
                  borderColor: category === cat.id ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[
                styles.categoryText,
                { color: category === cat.id ? colors.primaryForeground : colors.foreground },
              ]}>
                {getCategoryLabel(cat.id)}
              </Text>
            </Pressable>
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

        {/* Submit */}
        <Pressable
          onPress={handleUpgrade}
          disabled={submitting || !businessName.trim()}
          style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting || !businessName.trim() ? 0.6 : 1 }]}
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
        </Pressable>

        <Text style={[styles.terms, { color: colors.mutedForeground }]}>
          {t('pro.cancelAnytime')}. {t('business.termsNote')}
        </Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi },
  content: { padding: 16, gap: 8, paddingBottom: 60 },
  hero: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  heroSubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  heroPrice: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  benefitsCard: { borderRadius: 14, padding: 16, gap: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { fontSize: 14, flex: 1 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 8, fontFamily: fonts.bodySemi },
  input: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  categoryText: { fontSize: 13, fontWeight: '500' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 14, marginTop: 12,
  },
  submitText: { fontSize: 16, fontWeight: '700' },
  terms: { fontSize: 11, textAlign: 'center', lineHeight: 16, paddingHorizontal: 8 },
})
