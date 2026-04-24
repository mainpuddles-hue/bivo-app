declare const __DEV__: boolean

import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { ArrowLeft, Check, CreditCard, Smartphone, Plus } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { FEATURES } from '@/lib/featureFlags'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { getImageUrl } from '@/lib/imageUtils'
import { formatPrice } from '@/lib/format'
import { getCachedUserId } from '@/lib/authCache'
import { useToast } from '@/components/Toast'

type PaymentMethod = 'card' | 'mobilepay' | 'new'

interface MethodOption {
  id: PaymentMethod
  title: string
  subtitle: string
  icon: 'card' | 'phone' | 'plus'
}

function PaymentCheckoutScreenInner() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const params = useLocalSearchParams<{
    bookingId: string
    itemTitle: string
    itemImage: string
    dates: string
    deposit: string
    loanPrice: string
    serviceFee: string
  }>()

  const toast = useToast()
  const deposit = parseFloat(params.deposit || '0') || 0
  const loanPrice = parseFloat(params.loanPrice || '0') || 0
  const serviceFee = parseFloat(params.serviceFee || '0') || 0
  const total = deposit + loanPrice + serviceFee

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('card')
  const [paying, setPaying] = useState(false)

  const methods: MethodOption[] = [
    {
      id: 'card',
      title: 'Visa ···· 4321',
      subtitle: t('checkout.cardValid', { date: '05/28' }),
      icon: 'card',
    },
    {
      id: 'mobilepay',
      title: 'MobilePay',
      subtitle: '+358 40 ***1234',
      icon: 'phone',
    },
    {
      id: 'new',
      title: t('checkout.addPaymentMethod'),
      subtitle: '',
      icon: 'plus',
    },
  ]

  const breakdown = [
    { label: t('checkout.loanPrice'), value: loanPrice === 0 ? t('checkout.free') : formatPrice(loanPrice, locale) },
    { label: t('checkout.deposit'), value: formatPrice(deposit, locale) },
    { label: t('checkout.tackbirdFee'), value: formatPrice(serviceFee, locale) },
  ]

  const handlePay = useCallback(async () => {
    if (paying) return
    if (selectedMethod === 'new') {
      router.push('/payment-settings')
      return
    }

    setPaying(true)
    try {
      const userId = await getCachedUserId()
      if (!userId) { router.replace('/(auth)/login'); return }

      // Update booking status to paid
      const { error: payError } = await (supabase.from('bookings') as any).update({
        status: 'paid',
        payment_method: selectedMethod,
        paid_at: new Date().toISOString(),
      }).eq('id', params.bookingId)
      if (payError) throw payError

      router.replace('/payment/success')
    } catch (err) {
      if (__DEV__) console.warn('[payment-checkout] pay failed:', err)
      toast.show({ message: t('common.error'), type: 'error' })
    } finally {
      setPaying(false)
    }
  }, [paying, selectedMethod, params.bookingId, router, supabase, t, toast])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={[s.backCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={13} color={colors.foreground} />
        </PressableOpacity>
        <View style={s.headerTitleWrap}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>
            {t('checkout.title')}
          </Text>
        </View>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
      >
        {/* Item summary */}
        <View style={[s.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {params.itemImage ? (
            <Image
              source={{ uri: getImageUrl(params.itemImage, 'thumbnail') || undefined }}
              style={s.summaryImage}
              contentFit="cover"
            />
          ) : (
            <View style={[s.summaryImagePlaceholder, { backgroundColor: colors.muted }]} />
          )}
          <View style={s.summaryInfo}>
            <Text style={[s.summaryTitle, { color: colors.foreground }]} numberOfLines={1}>
              {params.itemTitle || '—'}
            </Text>
            <Text style={[s.summaryDates, { color: colors.mutedForeground }]}>
              {params.dates || ''}
            </Text>
          </View>
        </View>

        {/* Amount hero */}
        <View style={s.amountHero}>
          <Text style={[s.amountLabel, { color: colors.mutedForeground }]}>
            {t('checkout.depositToPay')}
          </Text>
          <Text style={[s.amountValue, { color: colors.foreground }]}>
            {formatPrice(total, locale)}
          </Text>
          <Text style={[s.amountHint, { color: colors.mutedForeground }]}>
            {t('checkout.refundHint')}
          </Text>
        </View>

        {/* Breakdown */}
        <View style={[s.breakdownCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {breakdown.map((row, idx) => (
            <View
              key={idx}
              style={[
                s.breakdownRow,
                idx < breakdown.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
              ]}
            >
              <Text style={[s.breakdownLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
              <Text style={[s.breakdownValue, { color: colors.foreground }]}>{row.value}</Text>
            </View>
          ))}
          <View style={[s.breakdownTotal, { borderTopColor: colors.foreground }]}>
            <Text style={[s.breakdownTotalLabel, { color: colors.foreground }]}>
              {t('checkout.total')}
            </Text>
            <Text style={[s.breakdownTotalValue, { color: colors.foreground }]}>
              {formatPrice(total, locale)}
            </Text>
          </View>
        </View>

        {/* Payment methods */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
          {t('checkout.paymentMethod')}
        </Text>
        {methods.map(method => {
          const isSelected = selectedMethod === method.id
          const isDashed = method.id === 'new'
          return (
            <PressableOpacity
              key={method.id}
              onPress={() => setSelectedMethod(method.id)}
              style={[
                s.methodCard,
                isSelected
                  ? { backgroundColor: colors.foreground }
                  : {
                      backgroundColor: colors.card,
                      borderWidth: isDashed ? 1.5 : 1,
                      borderColor: colors.border,
                      borderStyle: isDashed ? 'dashed' : 'solid',
                    },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              <View style={[s.methodIcon, { backgroundColor: isSelected ? 'rgba(255,255,255,0.12)' : colors.muted }]}>
                {method.icon === 'card' && <CreditCard size={14} color={isSelected ? colors.primaryForeground : colors.foreground} />}
                {method.icon === 'phone' && <Smartphone size={14} color={isSelected ? colors.primaryForeground : colors.foreground} />}
                {method.icon === 'plus' && <Plus size={14} color={isSelected ? colors.primaryForeground : colors.foreground} />}
              </View>
              <View style={s.methodInfo}>
                <Text style={[s.methodTitle, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>
                  {method.title}
                </Text>
                {method.subtitle ? (
                  <Text style={[s.methodSubtitle, { color: isSelected ? colors.onInkMuted : colors.mutedForeground }]}>
                    {method.subtitle}
                  </Text>
                ) : null}
              </View>
              {isSelected && <Check size={13} color={colors.primaryForeground} strokeWidth={3} />}
            </PressableOpacity>
          )
        })}
      </ScrollView>

      {/* CTA */}
      <View style={[s.ctaWrap, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
        <PressableOpacity
          onPress={handlePay}
          disabled={paying}
          style={[s.ctaBtn, { backgroundColor: colors.foreground, opacity: paying ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={`${t('checkout.pay')} ${formatPrice(total, locale)}`}
        >
          {paying ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[s.ctaBtnText, { color: colors.primaryForeground }]}>
              {t('checkout.pay')} {formatPrice(total, locale)}
            </Text>
          )}
        </PressableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12, gap: 12,
  },
  backCircle: {
    width: 36, height: 36, borderRadius: 999, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, letterSpacing: -0.15 },
  headerSpacer: { width: 36, height: 36 },

  content: { paddingHorizontal: 16 },

  /* Summary */
  summaryCard: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 18,
  },
  summaryImage: { width: 52, height: 52, borderRadius: 12 },
  summaryImagePlaceholder: { width: 52, height: 52, borderRadius: 12 },
  summaryInfo: { flex: 1 },
  summaryTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },
  summaryDates: { fontSize: 12, fontFamily: fonts.body, marginTop: 3 },

  /* Amount hero */
  amountHero: { alignItems: 'center', paddingBottom: 20 },
  amountLabel: {
    fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi,
    letterSpacing: 1.1, marginBottom: 10,
  },
  amountValue: { fontSize: 58, fontWeight: '600', fontFamily: fonts.heading, letterSpacing: -2.5, lineHeight: 58 },
  amountHint: {
    fontSize: 12, fontFamily: fonts.body, marginTop: 8,
    lineHeight: 18, textAlign: 'center', maxWidth: 260,
  },

  /* Breakdown */
  breakdownCard: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, marginBottom: 14 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  breakdownLabel: { fontSize: 13, fontFamily: fonts.body },
  breakdownValue: { fontSize: 13, fontWeight: '500', fontFamily: fonts.bodyMedium },
  breakdownTotal: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: 10, paddingBottom: 12, marginTop: 4, borderTopWidth: 1.5,
  },
  breakdownTotalLabel: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },
  breakdownTotalValue: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },

  /* Section */
  sectionLabel: {
    fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi,
    letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 6, paddingHorizontal: 4,
  },

  /* Methods */
  methodCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 14, marginBottom: 8,
  },
  methodIcon: {
    width: 30, height: 20, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  methodInfo: { flex: 1 },
  methodTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },
  methodSubtitle: { fontSize: 12, fontFamily: fonts.body, marginTop: 2 },

  /* CTA */
  ctaWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 14,
  },
  ctaBtn: {
    borderRadius: 999, height: 56,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18, shadowRadius: 28, elevation: 8,
  },
  ctaBtnText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.bodySemi },
})

export default function PaymentCheckoutScreen() {
  return (
    <ScreenErrorBoundary screenName="PaymentCheckout">
      <PaymentCheckoutScreenInner />
    </ScreenErrorBoundary>
  )
}
