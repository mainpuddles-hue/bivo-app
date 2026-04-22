declare const __DEV__: boolean

import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { Image } from 'expo-image'
import { ArrowLeft, TrendingUp, ChevronRight, Archive } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { FEATURES } from '@/lib/featureFlags'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { getImageUrl } from '@/lib/imageUtils'
import { formatPrice, resolveLocale } from '@/lib/format'
import { getCachedUserId } from '@/lib/authCache'

interface PayoutTransaction {
  id: string
  item_title: string
  item_image: string | null
  borrower_name: string
  amount: number
  created_at: string
}

interface MonthlyBar {
  month: string
  label: string
  amount: number
}

function PayoutsScreenInner() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [totalEarnings, setTotalEarnings] = useState(0)
  const [loanCount, setLoanCount] = useState(0)
  const [monthlyData, setMonthlyData] = useState<MonthlyBar[]>([])
  const [transactions, setTransactions] = useState<PayoutTransaction[]>([])
  const [nextPayout, setNextPayout] = useState(0)
  const [nextPayoutDate, setNextPayoutDate] = useState('')

  const MONTH_LABELS_FI = ['T', 'H', 'M', 'H', 'T', 'K', 'H', 'E', 'S', 'L', 'M', 'J']
  const MONTH_LABELS_EN = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  const monthLabels = locale === 'fi' ? MONTH_LABELS_FI : MONTH_LABELS_EN

  const loadData = useCallback(async () => {
    try {
      const userId = await getCachedUserId()
      if (!userId) { router.replace('/(auth)/login'); return }

      // Fetch completed bookings where user is the lender
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, total_amount, service_fee, created_at, completed_at, post:posts(title, image_url), borrower:profiles!bookings_borrower_id_fkey(name)')
        .eq('lender_id', userId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(50)

      const rows = (bookings ?? []) as any[]
      const total = rows.reduce((sum: number, b: any) => sum + ((b.total_amount || 0) - (b.service_fee || 0)), 0)
      setTotalEarnings(total)
      setLoanCount(rows.length)

      // Build monthly data
      const monthly = new Map<number, number>()
      for (const b of rows) {
        const d = new Date(b.completed_at || b.created_at)
        const m = d.getMonth()
        monthly.set(m, (monthly.get(m) || 0) + ((b.total_amount || 0) - (b.service_fee || 0)))
      }
      const bars: MonthlyBar[] = Array.from({ length: 12 }, (_, i) => ({
        month: `${i}`,
        label: monthLabels[i],
        amount: monthly.get(i) || 0,
      }))
      setMonthlyData(bars)

      // Build transactions
      const txns: PayoutTransaction[] = rows.slice(0, 10).map((b: any) => ({
        id: b.id,
        item_title: b.post?.title || '—',
        item_image: b.post?.image_url || null,
        borrower_name: b.borrower?.name || '—',
        amount: (b.total_amount || 0) - (b.service_fee || 0),
        created_at: b.completed_at || b.created_at,
      }))
      setTransactions(txns)

      // Estimate next payout (pending completed bookings not yet paid out)
      const { data: pending } = await supabase
        .from('bookings')
        .select('total_amount, service_fee')
        .eq('lender_id', userId)
        .eq('status', 'completed')
        .is('payout_at', null)
      const pendingTotal = ((pending ?? []) as any[]).reduce(
        (sum: number, b: any) => sum + ((b.total_amount || 0) - (b.service_fee || 0)), 0,
      )
      setNextPayout(pendingTotal)

      // Next Wednesday
      const now = new Date()
      const daysUntilWed = (3 - now.getDay() + 7) % 7 || 7
      const nextWed = new Date(now)
      nextWed.setDate(now.getDate() + daysUntilWed)
      setNextPayoutDate(nextWed.toLocaleDateString(
        resolveLocale(locale),
        { weekday: 'short', day: 'numeric', month: 'numeric' },
      ))
    } catch (err) {
      if (__DEV__) console.warn('[payouts] load failed:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase, router, locale, monthLabels])

  useFocusEffect(useCallback(() => { loadData() }, [loadData]))

  const maxBarAmount = Math.max(...monthlyData.map(b => b.amount), 1)
  const currentMonth = new Date().getMonth()

  const avgPerLoan = loanCount > 0 ? totalEarnings / loanCount : 0

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
            {t('payouts.title')}
          </Text>
        </View>
        <PressableOpacity
          onPress={() => router.push('/payment-history' as any)}
          hitSlop={12}
          style={s.headerRight}
          accessibilityRole="button"
          accessibilityLabel={t('payouts.history')}
        >
          <Archive size={18} color={colors.foreground} strokeWidth={1.8} />
        </PressableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData() }}
            tintColor={colors.foreground}
          />
        }
      >
        {/* Total earnings hero */}
        <View style={s.totalSection}>
          <Text style={[s.totalLabel, { color: colors.mutedForeground }]}>
            {t('payouts.thisYear')}
          </Text>
          <Text style={[s.totalValue, { color: colors.foreground }]}>
            {formatPrice(totalEarnings, locale)}
          </Text>
          <Text style={[s.totalMeta, { color: colors.mutedForeground }]}>
            {loanCount} {t('payouts.loans')} · {t('payouts.avg')} {formatPrice(avgPerLoan, locale)} / {t('payouts.perLoan')}
          </Text>
        </View>

        {/* Bar chart */}
        <View style={[s.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={s.chartHeader}>
            <Text style={[s.chartTitle, { color: colors.foreground }]}>
              {t('payouts.monthly')}
            </Text>
          </View>
          <View style={s.chartBars}>
            {monthlyData.map((bar, idx) => {
              const isCurrentMonth = idx === currentMonth
              const barHeight = maxBarAmount > 0 ? Math.max((bar.amount / maxBarAmount) * 80, 4) : 4
              return (
                <View key={idx} style={s.chartBarCol}>
                  <View style={s.chartBarValueWrap}>
                    {isCurrentMonth && bar.amount > 0 && (
                      <Text style={[s.chartBarValue, { color: colors.foreground }]}>
                        {Math.round(bar.amount)} €
                      </Text>
                    )}
                  </View>
                  <View
                    style={[
                      s.chartBar,
                      {
                        height: barHeight,
                        backgroundColor: isCurrentMonth ? colors.foreground : colors.border,
                      },
                    ]}
                  />
                  <Text style={[s.chartBarLabel, { color: colors.tertiaryForeground }]}>
                    {bar.label}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>

        {/* Next payout */}
        {nextPayout > 0 && (
          <View style={[s.nextPayoutCard, { backgroundColor: colors.foreground }]}>
            <View style={s.nextPayoutInfo}>
              <Text style={[s.nextPayoutLabel, { color: colors.onInkMuted }]}>
                {t('payouts.nextPayout')}
              </Text>
              <Text style={[s.nextPayoutValue, { color: colors.primaryForeground }]}>
                {formatPrice(nextPayout, locale)} · {nextPayoutDate}
              </Text>
            </View>
            <ChevronRight size={14} color={colors.primaryForeground} />
          </View>
        )}

        {/* Recent transactions */}
        {transactions.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
              {t('payouts.recent')}
            </Text>
            <View style={[s.txnCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {transactions.map((txn, idx) => (
                <View key={txn.id}>
                  <View style={s.txnRow}>
                    {txn.item_image ? (
                      <Image
                        source={{ uri: getImageUrl(txn.item_image, 'thumbnail') || undefined }}
                        style={s.txnImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[s.txnImagePlaceholder, { backgroundColor: colors.muted }]} />
                    )}
                    <View style={s.txnInfo}>
                      <Text style={[s.txnTitle, { color: colors.foreground }]} numberOfLines={1}>
                        {txn.item_title} · {txn.borrower_name}
                      </Text>
                      <Text style={[s.txnDate, { color: colors.mutedForeground }]}>
                        {new Date(txn.created_at).toLocaleDateString(resolveLocale(locale), {
                          day: 'numeric', month: 'numeric',
                        })}
                      </Text>
                    </View>
                    <Text style={[s.txnAmount, { color: colors.foreground }]}>
                      +{formatPrice(txn.amount, locale)}
                    </Text>
                  </View>
                  {idx < transactions.length - 1 && (
                    <View style={[s.txnDivider, { backgroundColor: colors.border }]} />
                  )}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
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
  headerRight: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },

  content: { paddingHorizontal: 16 },

  /* Total */
  totalSection: { paddingVertical: 4, paddingHorizontal: 4, marginBottom: 22 },
  totalLabel: {
    fontSize: 10.5, fontWeight: '600', fontFamily: fonts.bodySemi,
    letterSpacing: 1, marginBottom: 6,
  },
  totalValue: {
    fontSize: 48, fontWeight: '600', fontFamily: fonts.heading,
    letterSpacing: -2, lineHeight: 48,
  },
  totalMeta: { fontSize: 11.5, fontFamily: fonts.body, marginTop: 4 },

  /* Chart */
  chartCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 18 },
  chartHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', marginBottom: 14,
  },
  chartTitle: { fontSize: 11.5, fontWeight: '600', fontFamily: fonts.bodySemi },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 100 },
  chartBarCol: { flex: 1, alignItems: 'center', gap: 5 },
  chartBarValueWrap: { height: 16, justifyContent: 'flex-end' },
  chartBarValue: { fontSize: 9.5, fontWeight: '700', fontFamily: fonts.bodySemi },
  chartBar: { width: '100%', borderRadius: 3, minHeight: 4 },
  chartBarLabel: { fontSize: 9, fontWeight: '600', fontFamily: fonts.bodySemi },

  /* Next payout */
  nextPayoutCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 14, paddingHorizontal: 16,
    marginBottom: 20,
  },
  nextPayoutInfo: { flex: 1 },
  nextPayoutLabel: {
    fontSize: 10.5, letterSpacing: 1,
    fontWeight: '600', fontFamily: fonts.bodySemi, marginBottom: 4,
  },
  nextPayoutValue: {
    fontSize: 18, fontWeight: '600', fontFamily: fonts.heading,
    letterSpacing: -0.4,
  },

  /* Section */
  sectionLabel: {
    fontSize: 10.5, fontWeight: '600', fontFamily: fonts.bodySemi,
    letterSpacing: 1, textTransform: 'uppercase',
    paddingHorizontal: 4, marginBottom: 10,
  },

  /* Transactions */
  txnCard: { borderRadius: 14, borderWidth: 1 },
  txnRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, paddingHorizontal: 14,
  },
  txnImage: { width: 38, height: 38, borderRadius: 9 },
  txnImagePlaceholder: { width: 38, height: 38, borderRadius: 9 },
  txnInfo: { flex: 1 },
  txnTitle: { fontSize: 13, fontWeight: '500', fontFamily: fonts.bodyMedium, letterSpacing: -0.1 },
  txnDate: { fontSize: 11, fontFamily: fonts.body, marginTop: 1 },
  txnAmount: { fontSize: 13.5, fontWeight: '600', fontFamily: fonts.bodySemi },
  txnDivider: { height: 1, marginLeft: 14 },
})

export default function PayoutsScreen() {
  return (
    <ScreenErrorBoundary screenName="Payouts">
      <PayoutsScreenInner />
    </ScreenErrorBoundary>
  )
}
