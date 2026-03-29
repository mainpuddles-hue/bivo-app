declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import {
  ArrowLeft, MessageCircle, Package, ShoppingBag, CheckCircle, XCircle,
  RotateCcw, Star, Calendar, Check,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { Avatar } from '@/components/Avatar'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { fonts } from '@/lib/fonts'
import { cardShadow, cardShadowDark } from '@/lib/shadows'
import { formatPrice, formatDateRange } from '@/lib/format'
import { isValidUUID } from '@/lib/validation'
import { SERVICE_FEE_RATE } from '@/lib/constants'

type BookingStatus = 'pending' | 'paid' | 'confirmed' | 'in_progress' | 'active' | 'completed' | 'cancelled' | 'disputed' | 'refunded'

type BookingType = 'rental' | 'service'

interface BookingData {
  id: string
  type: BookingType
  status: BookingStatus
  created_at: string
  total_amount: number
  service_fee: number
  notes?: string | null
  // Rental fields
  start_date?: string
  end_date?: string
  daily_fee?: number
  // Service fields
  service_price?: number
  completed_at?: string | null
  // Joined data
  post?: { id: string; title: string; image_url: string | null } | null
  other_user?: { id: string; name: string; avatar_url: string | null } | null
  other_user_role: string // 'lender' | 'borrower' | 'provider' | 'buyer'
  my_role: string
}

const STATUS_KEYS: Record<BookingStatus, string> = {
  pending: 'rental.statusPending',
  confirmed: 'rental.statusConfirmed',
  paid: 'rental.statusPaid',
  active: 'rental.statusActive',
  completed: 'rental.statusCompleted',
  cancelled: 'rental.statusCancelled',
  disputed: 'rental.statusDisputed',
  refunded: 'rental.statusRefunded',
  in_progress: 'service.statusInProgress',
}

function getStatusColor(status: BookingStatus, colors: ReturnType<typeof useTheme>['colors']): string {
  switch (status) {
    case 'pending': return colors.pro
    case 'confirmed': case 'paid': return colors.info
    case 'active': case 'in_progress': return colors.primary
    case 'completed': return colors.success
    case 'cancelled': return colors.destructive
    case 'disputed': return colors.pro
    case 'refunded': return colors.mutedForeground
    default: return colors.mutedForeground
  }
}

// Timeline steps for rental bookings
const RENTAL_STEPS: BookingStatus[] = ['pending', 'paid', 'confirmed', 'active', 'completed']
// Timeline steps for service bookings
const SERVICE_STEPS: BookingStatus[] = ['pending', 'paid', 'confirmed', 'in_progress', 'completed']

function getStepIndex(status: BookingStatus, steps: BookingStatus[]): number {
  const idx = steps.indexOf(status)
  return idx >= 0 ? idx : -1
}

function BookingDetailScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()

  const [booking, setBooking] = useState<BookingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) setUserId(user.id)
        if (!id || !isValidUUID(id as string)) { setLoading(false); return }

        // Try rental_bookings first
        const { data: rental, error: rentalError } = await supabase
          .from('rental_bookings')
          .select(`
            id, post_id, borrower_id, lender_id, start_date, end_date,
            daily_fee, service_fee, total_amount, status, created_at,
            post:posts!rental_bookings_post_id_fkey(id, title, image_url),
            borrower:profiles!rental_bookings_borrower_id_fkey(id, name, avatar_url),
            lender:profiles!rental_bookings_lender_id_fkey(id, name, avatar_url)
          `)
          .eq('id', id)
          .maybeSingle()

        if (rental && !rentalError) {
          const r = rental as any
          const isBorrower = user?.id === r.borrower_id
          setBooking({
            id: r.id,
            type: 'rental',
            status: r.status,
            created_at: r.created_at,
            total_amount: r.total_amount,
            service_fee: r.service_fee,
            start_date: r.start_date,
            end_date: r.end_date,
            daily_fee: r.daily_fee,
            post: r.post,
            other_user: isBorrower ? r.lender : r.borrower,
            other_user_role: isBorrower ? 'lender' : 'borrower',
            my_role: isBorrower ? 'borrower' : 'lender',
          })
          setLoading(false)
          return
        }

        // Try service_bookings
        const { data: service, error: serviceError } = await supabase
          .from('service_bookings')
          .select(`
            id, post_id, buyer_id, provider_id, service_price, service_fee,
            total_amount, notes, status, completed_at, created_at,
            post:posts!service_bookings_post_id_fkey(id, title, image_url),
            buyer:profiles!service_bookings_buyer_id_fkey(id, name, avatar_url),
            provider:profiles!service_bookings_provider_id_fkey(id, name, avatar_url)
          `)
          .eq('id', id)
          .maybeSingle()

        if (service && !serviceError) {
          const s = service as any
          const isBuyer = user?.id === s.buyer_id
          setBooking({
            id: s.id,
            type: 'service',
            status: s.status,
            created_at: s.created_at,
            total_amount: s.total_amount,
            service_fee: s.service_fee,
            service_price: s.service_price,
            completed_at: s.completed_at,
            notes: s.notes,
            post: s.post,
            other_user: isBuyer ? s.provider : s.buyer,
            other_user_role: isBuyer ? 'provider' : 'buyer',
            my_role: isBuyer ? 'buyer' : 'provider',
          })
        }
      } catch (err) {
        if (__DEV__) console.log('[booking detail] load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, supabase])

  const handleSendMessage = useCallback(async () => {
    if (!userId || !booking?.other_user) return
    try {
      const otherId = booking.other_user.id
      const { data: existing } = await supabase
        .from('conversations').select('id')
        .or(`and(user1_id.eq.${userId},user2_id.eq.${otherId}),and(user1_id.eq.${otherId},user2_id.eq.${userId})`)
        .maybeSingle()
      if (existing) {
        router.push(`/messages/${(existing as any).id}`)
      } else {
        const { data: newConv, error } = await (supabase.from('conversations') as any)
          .insert({ user1_id: userId, user2_id: otherId }).select('id').single()
        if (error || !newConv) return
        router.push(`/messages/${newConv.id}`)
      }
    } catch {
      // silent
    }
  }, [userId, booking, supabase, router])

  // Actions
  const updatingRef = useRef(false)
  const updateBookingStatus = useCallback(async (newStatus: BookingStatus) => {
    if (!booking) return
    if (updatingRef.current) return
    updatingRef.current = true
    setActionLoading(true)
    try {
      const table = booking.type === 'rental' ? 'rental_bookings' : 'service_bookings'
      const updateData: any = { status: newStatus }
      if (newStatus === 'completed' && booking.type === 'service') {
        updateData.completed_at = new Date().toISOString()
      }
      const { error } = await (supabase.from(table) as any).update(updateData).eq('id', booking.id)
      if (error) {
        Alert.alert(t('common.error'), error.message)
      } else {
        setBooking(prev => prev ? { ...prev, status: newStatus } : prev)
      }
    } catch {
      Alert.alert(t('common.error'))
    } finally {
      setActionLoading(false)
      updatingRef.current = false
    }
  }, [booking, supabase, t])

  const handleConfirm = useCallback(() => updateBookingStatus('confirmed'), [updateBookingStatus])
  const handleCancel = useCallback(() => {
    Alert.alert(t('rental.cancelBooking'), t('rental.bookingCancelled'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => updateBookingStatus('cancelled') },
    ])
  }, [t, updateBookingStatus])
  const handleComplete = useCallback(() => updateBookingStatus('completed'), [updateBookingStatus])
  const handleStartWork = useCallback(() => updateBookingStatus('in_progress'), [updateBookingStatus])
  const handleLeaveReview = useCallback(() => {
    if (booking?.other_user?.id) {
      router.push(`/profile/${booking.other_user.id}` as any)
    }
  }, [booking, router])

  const steps = useMemo(() => booking?.type === 'service' ? SERVICE_STEPS : RENTAL_STEPS, [booking?.type])
  const currentStepIndex = useMemo(() => {
    if (!booking) return -1
    if (booking.status === 'cancelled' || booking.status === 'disputed' || booking.status === 'refunded') return -1
    return getStepIndex(booking.status, steps)
  }, [booking, steps])

  // Determine action buttons
  const canConfirm = booking?.my_role === 'lender' && booking?.status === 'pending'
    || booking?.my_role === 'provider' && booking?.status === 'paid'
  const canCancel = booking?.status === 'pending' || booking?.status === 'paid' || booking?.status === 'confirmed'
  const canComplete = (booking?.my_role === 'lender' && (booking?.status === 'active' || booking?.status === 'paid' || booking?.status === 'confirmed'))
    || (booking?.my_role === 'provider' && booking?.status === 'in_progress')
  const canStart = booking?.my_role === 'provider' && booking?.status === 'confirmed'
  const canReview = booking?.status === 'completed'

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </View>
    )
  }

  if (!booking) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={t('common.back')} accessibilityRole="button"><ArrowLeft size={24} color={colors.foreground} /></Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('booking.details')}</Text>
          <View style={{ flex: 1 }} />
        </View>
        <Text style={[styles.notFound, { color: colors.mutedForeground, fontFamily: fonts.body }]}>{t('booking.notFound')}</Text>
      </View>
    )
  }

  const statusColor = getStatusColor(booking.status, colors)
  const isService = booking.type === 'service'
  const basePrice = isService ? (booking.service_price ?? 0) : ((booking.daily_fee ?? 0) * (() => {
    if (!booking.start_date || !booking.end_date) return 0
    const s = new Date(booking.start_date); const e = new Date(booking.end_date)
    const d = Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))
    return d > 0 ? d : 0
  })())

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={t('common.back')} accessibilityRole="button"><ArrowLeft size={24} color={colors.foreground} /></Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('booking.details')}</Text>
        <View style={{ flex: 1 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Post info card */}
        <Pressable
          onPress={() => booking.post?.id && router.push(`/post/${booking.post.id}` as any)}
          style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }, isDark ? cardShadowDark : cardShadow]}
        >
          {booking.post?.image_url ? (
            <Image source={{ uri: booking.post.image_url }} style={styles.postImage} contentFit="cover" />
          ) : (
            <View style={[styles.postImage, styles.postImageFb, { backgroundColor: colors.muted }]}>
              {isService ? <ShoppingBag size={28} color={colors.mutedForeground} /> : <Package size={28} color={colors.mutedForeground} />}
            </View>
          )}
          <View style={styles.postInfo}>
            <Text style={[styles.postTitle, { color: colors.foreground }]} numberOfLines={2}>
              {booking.post?.title ?? t('rental.deletedPost')}
            </Text>
            <Text style={{ fontSize: 12, color: isService ? colors.info : colors.primary, fontFamily: fonts.bodySemi }}>
              {isService ? t('service.services') : t('rental.booking')}
            </Text>
          </View>
        </Pressable>

        {/* Other party info */}
        {booking.other_user && (
          <Pressable
            onPress={() => router.push(`/profile/${booking.other_user!.id}` as any)}
            style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }, isDark ? cardShadowDark : cardShadow]}
          >
            <Avatar url={booking.other_user.avatar_url} name={booking.other_user.name} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>{booking.other_user.name ?? t('common.user')}</Text>
              <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.body }}>{t(`booking.otherParty`)}</Text>
            </View>
          </Pressable>
        )}

        {/* Status badge */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }, isDark ? cardShadowDark : cardShadow]}>
          <View style={[styles.statusBadgeLarge, { backgroundColor: `${statusColor}18` }]}>
            <Text style={[styles.statusTextLarge, { color: statusColor }]}>
              {t(STATUS_KEYS[booking.status] ?? 'rental.statusPending')}
            </Text>
          </View>
        </View>

        {/* Status timeline */}
        {currentStepIndex >= 0 && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }, isDark ? cardShadowDark : cardShadow]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('booking.statusTimeline')}</Text>
            <View style={styles.timeline}>
              {steps.map((step, i) => {
                const isCompleted = i <= currentStepIndex
                const isCurrent = i === currentStepIndex
                const isFuture = i > currentStepIndex
                const dotColor = isCompleted ? colors.success : isCurrent ? colors.primary : colors.muted
                const textColor = isCompleted ? colors.foreground : isFuture ? colors.mutedForeground : colors.foreground

                return (
                  <View key={step} style={styles.timelineStep}>
                    <View style={styles.timelineDotCol}>
                      <View style={[
                        styles.timelineDot,
                        { backgroundColor: dotColor },
                        isCurrent && { borderWidth: 3, borderColor: `${colors.primary}40` },
                      ]}>
                        {isCompleted && !isCurrent && <Check size={10} color={colors.primaryForeground} />}
                      </View>
                      {i < steps.length - 1 && (
                        <View style={[styles.timelineLine, { backgroundColor: isCompleted ? colors.success : colors.muted }]} />
                      )}
                    </View>
                    <Text style={[styles.timelineLabel, { color: textColor, fontWeight: isCurrent ? '700' : '400' }]}>
                      {t(STATUS_KEYS[step] ?? step)}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Dates section (rentals) */}
        {booking.start_date && booking.end_date && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }, isDark ? cardShadowDark : cardShadow]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('booking.dates')}</Text>
            <View style={styles.dateRow}>
              <Calendar size={16} color={colors.mutedForeground} />
              <Text style={{ fontSize: 15, color: colors.foreground, fontFamily: fonts.bodyMedium }}>
                {formatDateRange(booking.start_date, booking.end_date, locale)}
              </Text>
            </View>
          </View>
        )}

        {/* Price breakdown */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }, isDark ? cardShadowDark : cardShadow]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('booking.priceBreakdown')}</Text>
          <View style={styles.priceRow}>
            <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>
              {isService ? t('service.servicePrice') : t('rental.rentalFee')}
            </Text>
            <Text style={[styles.priceValue, { color: colors.foreground }]}>{formatPrice(basePrice, locale)}</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>{t('booking.serviceFee')}</Text>
            <Text style={[styles.priceValue, { color: colors.foreground }]}>{formatPrice(booking.service_fee, locale)}</Text>
          </View>
          <View style={[styles.priceRow, styles.priceTotalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.priceTotalLabel, { color: colors.foreground }]}>{t('booking.total')}</Text>
            <Text style={[styles.priceTotalValue, { color: isService ? colors.info : colors.primary }]}>
              {formatPrice(booking.total_amount, locale)}
            </Text>
          </View>
        </View>

        {/* Notes (service bookings) */}
        {booking.notes && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }, isDark ? cardShadowDark : cardShadow]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('booking.notes')}</Text>
            <Text style={{ fontSize: 14, color: colors.foreground, lineHeight: 20, fontFamily: fonts.body }}>{booking.notes}</Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionsContainer}>
          {canConfirm && (
            <Pressable
              onPress={handleConfirm}
              disabled={actionLoading}
              style={[styles.actionBtn, { backgroundColor: colors.success }]}
              accessibilityLabel={t('rental.confirmBooking')}
              accessibilityRole="button"
            >
              {actionLoading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : (
                <><CheckCircle size={16} color={colors.primaryForeground} /><Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>{t('rental.confirmBooking')}</Text></>
              )}
            </Pressable>
          )}
          {canStart && (
            <Pressable
              onPress={handleStartWork}
              disabled={actionLoading}
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              accessibilityLabel={t('service.startWork')}
              accessibilityRole="button"
            >
              <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>{t('service.startWork')}</Text>
            </Pressable>
          )}
          {canComplete && (
            <Pressable
              onPress={handleComplete}
              disabled={actionLoading}
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              accessibilityLabel={booking.type === 'rental' ? t('rental.returnItem') : t('service.markDone')}
              accessibilityRole="button"
            >
              {actionLoading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : (
                <><RotateCcw size={16} color={colors.primaryForeground} /><Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>
                  {booking.type === 'rental' ? t('rental.returnItem') : t('service.markDone')}
                </Text></>
              )}
            </Pressable>
          )}
          {canCancel && (
            <Pressable
              onPress={handleCancel}
              disabled={actionLoading}
              style={[styles.actionBtn, { backgroundColor: `${colors.destructive}15`, borderColor: colors.destructive, borderWidth: 1 }]}
              accessibilityLabel={t('rental.cancelBooking')}
              accessibilityRole="button"
            >
              <XCircle size={16} color={colors.destructive} />
              <Text style={[styles.actionBtnText, { color: colors.destructive }]}>{t('rental.cancelBooking')}</Text>
            </Pressable>
          )}
          {canReview && (
            <Pressable
              onPress={handleLeaveReview}
              style={[styles.actionBtn, { backgroundColor: `${colors.pro}15`, borderColor: colors.pro, borderWidth: 1 }]}
              accessibilityLabel={t('rental.leaveReview')}
              accessibilityRole="button"
            >
              <Star size={16} color={colors.pro} />
              <Text style={[styles.actionBtnText, { color: colors.pro }]}>{t('rental.leaveReview')}</Text>
            </Pressable>
          )}

          {/* Send message button */}
          {booking.other_user && (
            <Pressable
              onPress={handleSendMessage}
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              accessibilityLabel={t('booking.sendMessage')}
              accessibilityRole="button"
            >
              <MessageCircle size={16} color={colors.primaryForeground} />
              <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>{t('booking.sendMessage')}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi, lineHeight: 28 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 40 },
  notFound: { fontSize: 16, fontFamily: fonts.body, textAlign: 'center', marginTop: 104 },

  // Post card
  postCard: {
    flexDirection: 'row', padding: 12, gap: 12, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  postImage: { width: 72, height: 72, borderRadius: 12 },
  postImageFb: { alignItems: 'center', justifyContent: 'center' },
  postInfo: { flex: 1, gap: 4, justifyContent: 'center' },
  postTitle: { fontSize: 16, fontWeight: '600', lineHeight: 22, fontFamily: fonts.bodySemi },

  // User card
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
  },
  userName: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi },

  // Section card
  section: {
    padding: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', fontFamily: fonts.headingSemi },

  // Status badge
  statusBadgeLarge: {
    alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8,
  },
  statusTextLarge: {
    fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5,
    fontFamily: fonts.bodySemi,
  },

  // Timeline
  timeline: { gap: 0, marginTop: 4 },
  timelineStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 36 },
  timelineDotCol: { alignItems: 'center', width: 20 },
  timelineDot: {
    width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  timelineLine: { width: 2, flex: 1, minHeight: 14, marginVertical: 2 },
  timelineLabel: { fontSize: 14, fontFamily: fonts.body, paddingTop: 1, lineHeight: 20 },

  // Date row
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Price breakdown
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { fontSize: 14, fontFamily: fonts.body },
  priceValue: { fontSize: 14, fontFamily: fonts.bodyMedium },
  priceTotalRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 4 },
  priceTotalLabel: { fontSize: 16, fontWeight: '700', fontFamily: fonts.headingSemi },
  priceTotalValue: { fontSize: 18, fontWeight: '700', fontFamily: fonts.headingSemi },

  // Actions
  actionsContainer: { gap: 8, marginTop: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 12, minHeight: 48,
  },
  actionBtnText: { fontSize: 15, fontFamily: fonts.bodySemi },
})

export default function BookingDetailScreen() {
  return (
    <ScreenErrorBoundary screenName="BookingDetail">
      <BookingDetailScreenInner />
    </ScreenErrorBoundary>
  )
}
