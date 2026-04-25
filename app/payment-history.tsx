declare const __DEV__: boolean

import { useState, useEffect, useCallback } from 'react'
import { View, Text, FlatList, RefreshControl, StyleSheet, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { ArrowLeft, Receipt, ChevronRight, CreditCard } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { FEATURES } from '@/lib/featureFlags'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { SectionSkeleton } from '@/components/SkeletonLoaders'
import { formatPrice } from '@/lib/format'
import { isValidUUID } from '@/lib/validation'

type PaymentStatus = 'paid' | 'refunded' | 'pending' | 'failed'

interface PaymentRecord {
  id: string
  amount: number
  description: string
  status: PaymentStatus
  type: string
  post_id: string | null
  booking_id: string | null
  stripe_session_id: string | null
  created_at: string
  post?: {
    title: string
  } | null
}

const STATUS_KEYS: Record<PaymentStatus, string> = {
  paid: 'payment.statusPaid',
  refunded: 'payment.statusRefunded',
  pending: 'payment.statusPending',
  failed: 'payment.statusFailed',
}

function getStatusColor(status: PaymentStatus, colors: ReturnType<typeof useTheme>['colors']): string {
  switch (status) {
    case 'paid': return colors.success
    case 'refunded': return colors.info
    case 'pending': return colors.foreground
    case 'failed': return colors.destructive
    default: return colors.mutedForeground
  }
}

/** Group payments by month string */
function groupByMonth(payments: PaymentRecord[], localeStr: string): { month: string; items: PaymentRecord[] }[] {
  const groups: Map<string, PaymentRecord[]> = new Map()
  for (const p of payments) {
    const d = new Date(p.created_at)
    const key = d.toLocaleDateString(localeStr, { month: 'long', year: 'numeric' })
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }
  return Array.from(groups.entries()).map(([month, items]) => ({ month, items }))
}

function PaymentHistoryScreenInner() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState(false)

  // Feature flag gate — redirect if Payments are disabled
  useEffect(() => {
    if (!FEATURES.PAYMENTS) {
      router.replace('/(tabs)')
    }
  }, [router])

  // Auth gate — redirect to login if not authenticated
  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/(auth)/login')
      }
    }
    checkAuth()
  }, [supabase, router])

  const fetchPayments = useCallback(async () => {
    setFetchError(false)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data, error } = await supabase
        .from('payments')
        .select(`
          id, amount, description, status, type, post_id, booking_id,
          stripe_session_id, created_at,
          post:posts!payments_post_id_fkey(title)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        if (__DEV__) console.log('[payments] error:', error.message)
        setFetchError(true)
        setPayments([])
      } else {
        setPayments((data ?? []) as unknown as PaymentRecord[])
      }
    } catch {
      if (__DEV__) console.log('[payments] fetch failed')
      setFetchError(true)
      setPayments([])
    }

    setLoading(false)
    setRefreshing(false)
  }, [supabase])

  useFocusEffect(useCallback(() => { fetchPayments() }, [fetchPayments]))

  const localeStr = locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB'
  const grouped = groupByMonth(payments, localeStr)

  const renderPayment = useCallback((item: PaymentRecord) => {
    const statusColor = getStatusColor(item.status, colors)
    const isExpanded = expandedId === item.id
    const dateStr = new Date(item.created_at).toLocaleDateString(localeStr, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    const timeStr = new Date(item.created_at).toLocaleTimeString(localeStr, {
      hour: '2-digit',
      minute: '2-digit',
    })

    return (
      <PressableOpacity
        key={item.id}
        onPress={() => setExpandedId(prev => prev === item.id ? null : item.id)}
        style={[styles.paymentRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={styles.rowTop}>
          <View style={[styles.iconCircle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Receipt size={16} color={colors.mutedForeground} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowDesc, { color: colors.foreground }]} numberOfLines={1}>
              {item.post?.title ?? item.description}
            </Text>
            <Text style={[styles.rowDate, { color: colors.mutedForeground }]}>{dateStr}</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={[styles.rowAmount, { color: item.status === 'refunded' ? colors.mutedForeground : colors.foreground }]}>
              {item.status === 'refunded' ? '-' : ''}{formatPrice(item.amount, locale)}
            </Text>
            {/* Dot + label status */}
            <View style={styles.statusDotRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.miniStatusText, { color: colors.mutedForeground }]}>{t(STATUS_KEYS[item.status])}</Text>
            </View>
          </View>
          <ChevronRight
            size={16}
            color={colors.mutedForeground}
            style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }}
          />
        </View>

        {isExpanded && (
          <View style={[styles.expandedSection, { borderTopColor: colors.border }]}>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{t('payment.date')}</Text>
              <Text style={[styles.detailValue, { color: colors.foreground }]}>{dateStr} {timeStr}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{t('payment.description')}</Text>
              <Text style={[styles.detailValue, { color: colors.foreground }]}>{item.description}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{t('payment.amount')}</Text>
              <Text style={[styles.detailValue, { color: colors.foreground }]}>{formatPrice(item.amount, locale)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{t('payment.status')}</Text>
              <Text style={[styles.detailValue, { color: statusColor }]}>{t(STATUS_KEYS[item.status])}</Text>
            </View>
            {item.post_id && (
              <PressableOpacity
                onPress={() => item.post_id && isValidUUID(item.post_id) && router.push(`/post/${item.post_id}` as any)}
                style={[styles.viewPostBtn, { backgroundColor: colors.foreground }]}
                accessibilityLabel={t('post.viewPost') ?? 'View post'}
                accessibilityRole="button"
              >
                <Text style={[styles.viewPostBtnText, { color: colors.primaryForeground }]}>{t('post.viewPost') ?? 'View post'}</Text>
              </PressableOpacity>
            )}
          </View>
        )}
      </PressableOpacity>
    )
  }, [colors, expandedId, localeStr, locale, t, router])

  const renderGroupItem = useCallback(({ item: group }: { item: { month: string; items: PaymentRecord[] } }) => (
    <View>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
        {group.month.toUpperCase()}
      </Text>
      <View style={styles.sectionCards}>
        {group.items.map(p => renderPayment(p))}
      </View>
    </View>
  ), [colors, renderPayment])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Bar header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[styles.backCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={18} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('payment.history')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
          <SectionSkeleton count={5} />
        </View>
      ) : fetchError ? (
        <View style={styles.empty}>
          <CreditCard size={48} color={colors.mutedForeground} style={{ opacity: 0.3 }} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>
            {t('common.error') || 'Jotain meni pieleen'}
          </Text>
          <Pressable
            onPress={() => { setFetchError(false); setLoading(true); fetchPayments() }}
            style={{ backgroundColor: colors.foreground, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, marginTop: 4 }}
          >
            <Text style={{ color: colors.primaryForeground, fontFamily: fonts.bodySemi, fontSize: 13 }}>
              {t('common.retry') || 'Yritä uudelleen'}
            </Text>
          </Pressable>
        </View>
      ) : payments.length === 0 ? (
        <View style={styles.empty}>
          <CreditCard size={48} color={colors.mutedForeground} style={{ opacity: 0.3 }} />
          <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>{t('payment.noPayments')}</Text>
          <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t('payment.noPaymentsHint')}</Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={g => g.month}
          renderItem={renderGroupItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 40 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchPayments() }}
              tintColor={colors.foreground}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backCircle: {
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
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  headerSpacer: { width: 36 },
  listContent: { padding: 16, gap: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionCards: { gap: 8 },
  paymentRow: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowDesc: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
  },
  rowDate: {
    fontSize: 12,
    fontFamily: fonts.body,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rowAmount: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
  },
  miniStatusText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  expandedSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: fonts.body,
  },
  detailValue: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    maxWidth: '60%',
    textAlign: 'right',
  },
  viewPostBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 8,
  },
  viewPostBtnText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: fonts.bodySemi,
  },
  emptyHint: {
    fontSize: 13,
    fontFamily: fonts.body,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
})

export default function PaymentHistoryScreen() {
  return (
    <ScreenErrorBoundary screenName="PaymentHistory">
      <PaymentHistoryScreenInner />
    </ScreenErrorBoundary>
  )
}
