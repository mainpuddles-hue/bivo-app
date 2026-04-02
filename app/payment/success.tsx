import { useState, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { CheckCircle, Calendar, Home } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import { formatPrice } from '@/lib/format'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'

interface BookingSummary {
  id: string
  post_title: string
  start_date: string
  end_date: string
  total_amount: number
  status: string
}

function PaymentSuccessScreenInner() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { session_id } = useLocalSearchParams<{ session_id?: string }>()
  const supabase = useSupabase()

  const [booking, setBooking] = useState<BookingSummary | null>(null)
  const [loading, setLoading] = useState(!!session_id)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!session_id) return

    async function fetchBooking() {
      let found = false

      // Try rental_bookings first
      try {
        const { data } = await (supabase
          .from('rental_bookings') as any)
          .select('id, start_date, end_date, total_amount, status, post:posts!rental_bookings_post_id_fkey(title)')
          .eq('stripe_session_id', session_id!)
          .maybeSingle()

        if (data) {
          setBooking({
            id: (data as any).id,
            post_title: (data as any).post?.title ?? '',
            start_date: (data as any).start_date,
            end_date: (data as any).end_date,
            total_amount: (data as any).total_amount,
            status: (data as any).status,
          })
          found = true
        }
      } catch {
        // rental_bookings table may not exist yet — ignore
      }

      // Fallback: try service_bookings
      if (!found) {
        try {
          const { data: serviceData } = await (supabase
            .from('service_bookings') as any)
            .select('id, created_at, total_amount, status, post:posts!service_bookings_post_id_fkey(title)')
            .eq('stripe_session_id', session_id!)
            .maybeSingle()

          if (serviceData) {
            setBooking({
              id: (serviceData as any).id,
              post_title: (serviceData as any).post?.title ?? '',
              start_date: (serviceData as any).created_at,
              end_date: (serviceData as any).created_at,
              total_amount: (serviceData as any).total_amount,
              status: (serviceData as any).status,
            })
            found = true
          }
        } catch {
          // service_bookings table may not exist yet — ignore
        }
      }

      // Fallback: check advertisements
      if (!found) {
        try {
          const { data: adData } = await (supabase.from('advertisements') as any)
            .select('id, title, status')
            .eq('stripe_session_id', session_id!)
            .maybeSingle()
          if (adData) {
            setBooking({
              id: adData.id,
              post_title: adData.title ?? 'Ad Campaign',
              start_date: new Date().toISOString(),
              end_date: new Date().toISOString(),
              total_amount: 0,
              status: adData.status ?? 'active',
            })
            found = true
          }
        } catch {}
      }

      if (!found) setNotFound(true)
      setLoading(false)
    }

    fetchBooking()
  }, [session_id, supabase])

  const localeStr = locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB'

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 20 }]}>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
      ) : (
        <View style={styles.content}>
          {/* Success icon */}
          <View style={[styles.iconCircle, { backgroundColor: `${colors.success}18` }]}>
            <CheckCircle size={56} color={colors.success} />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>{t('payment.success')}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{t('payment.successMessage')}</Text>

          {/* Order summary — show info message when no booking found */}
          {notFound && !booking && (
            <Text style={[styles.subtitle, { color: colors.mutedForeground, marginBottom: 16 }]}>
              {t('payment.subscriptionActivating') ?? 'Payment successful! Your subscription will be activated shortly.'}
            </Text>
          )}
          {booking && (
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.summaryTitle, { color: colors.foreground }]}>{booking.post_title}</Text>

              {booking.start_date === booking.end_date ? (
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t('payment.date')}</Text>
                  <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                    {new Date(booking.start_date).toLocaleDateString(localeStr, { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t('rental.startDate')}</Text>
                    <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                      {new Date(booking.start_date).toLocaleDateString(localeStr, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </View>

                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{t('rental.endDate')}</Text>
                    <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                      {new Date(booking.end_date).toLocaleDateString(localeStr, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </View>
                </>
              )}

              <View style={[styles.summaryRow, styles.totalRow, { borderTopColor: colors.border }]}>
                <Text style={[styles.totalLabel, { color: colors.foreground }]}>{t('rental.total')}</Text>
                <Text style={[styles.totalValue, { color: colors.primary }]}>
                  {formatPrice(booking.total_amount, locale)}
                </Text>
              </View>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            <Pressable
              onPress={() => router.push('/bookings' as any)}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              accessibilityLabel={t('payment.viewBooking')}
              accessibilityRole="button"
            >
              <Calendar size={18} color={colors.primaryForeground} />
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>{t('payment.viewBooking')}</Text>
            </Pressable>

            <Pressable
              onPress={() => router.replace('/(tabs)')}
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              accessibilityLabel={t('payment.backToHome')}
              accessibilityRole="button"
            >
              <Home size={18} color={colors.foreground} />
              <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>{t('payment.backToHome')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 64,
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontFamily: fonts.heading,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 32,
  },
  summaryCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
    marginBottom: 32,
  },
  summaryTitle: {
    fontSize: 18,
    fontFamily: fonts.bodySemi,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: fonts.body,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
  },
  totalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: fonts.bodySemi,
  },
  totalValue: {
    fontSize: 20,
    fontFamily: fonts.heading,
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: fonts.bodySemi,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontFamily: fonts.bodyMedium,
  },
})

export default function PaymentSuccessScreen() {
  return (
    <ScreenErrorBoundary screenName="PaymentSuccess">
      <PaymentSuccessScreenInner />
    </ScreenErrorBoundary>
  )
}
