declare const __DEV__: boolean

import { useState, useEffect, useCallback } from 'react'
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, Receipt, ChevronRight, CreditCard } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { formatPrice } from '@/lib/format'

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
    case 'pending': return colors.pro
    case 'failed': return colors.destructive
    default: return colors.mutedForeground
  }
}

export default function PaymentHistoryScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchPayments = useCallback(async () => {
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
        setPayments([])
      } else {
        setPayments((data ?? []) as unknown as PaymentRecord[])
      }
    } catch {
      if (__DEV__) console.log('[payments] fetch failed')
      setPayments([])
    }

    setLoading(false)
    setRefreshing(false)
  }, [supabase])

  useEffect(() => { fetchPayments() }, [fetchPayments])

  const localeStr = locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB'

  const renderPayment = ({ item }: { item: PaymentRecord }) => {
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
      <Pressable
        onPress={() => setExpandedId(prev => prev === item.id ? null : item.id)}
        style={[styles.paymentRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={styles.rowTop}>
          <View style={[styles.iconBox, { backgroundColor: `${statusColor}15` }]}>
            <Receipt size={18} color={statusColor} />
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
            <View style={[styles.miniStatus, { backgroundColor: `${statusColor}18` }]}>
              <Text style={[styles.miniStatusText, { color: statusColor }]}>{t(STATUS_KEYS[item.status])}</Text>
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
              <Pressable
                onPress={() => router.push(`/post/${item.post_id}` as any)}
                style={[styles.viewPostBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.viewPostBtnText, { color: colors.primary }]}>{t('post.viewPost') ?? 'View post'}</Text>
              </Pressable>
            )}
          </View>
        )}
      </Pressable>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('payment.history')}</Text>
        <View style={{ flex: 1 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={payments}
          keyExtractor={item => item.id}
          renderItem={renderPayment}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchPayments() }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <CreditCard size={48} color={colors.mutedForeground} style={{ opacity: 0.3 }} />
              <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>{t('payment.noPayments')}</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t('payment.noPaymentsHint')}</Text>
            </View>
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
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi },
  listContent: { padding: 16, gap: 10, paddingBottom: 40 },
  paymentRow: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowDesc: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowDate: {
    fontSize: 12,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rowAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  miniStatus: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  miniStatusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  expandedSection: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 10,
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
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  viewPostBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  viewPostBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
})
