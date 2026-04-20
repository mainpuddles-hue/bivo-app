declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert, TextInput,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import {
  ArrowLeft, MessageCircle, Package, ShoppingBag, CheckCircle, XCircle,
  RotateCcw, Star, Check, ChevronRight, AlertCircle,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { FEATURES } from '@/lib/featureFlags'
import { Avatar } from '@/components/Avatar'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { fonts } from '@/lib/fonts'
import { formatPrice, formatDateRange } from '@/lib/format'
import { isValidUUID } from '@/lib/validation'

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
  start_date?: string
  end_date?: string
  daily_fee?: number
  service_price?: number
  completed_at?: string | null
  post?: { id: string; title: string; image_url: string | null } | null
  other_user?: { id: string; name: string; avatar_url: string | null } | null
  other_user_role: string
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

// Timeline steps
const RENTAL_STEPS: BookingStatus[] = ['pending', 'paid', 'confirmed', 'active', 'completed']
const SERVICE_STEPS: BookingStatus[] = ['pending', 'paid', 'confirmed', 'in_progress', 'completed']

function getStepIndex(status: BookingStatus, steps: BookingStatus[]): number {
  const idx = steps.indexOf(status)
  return idx >= 0 ? idx : -1
}

// ─── Helpers ───
function getDaysBetween(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))
}

function getDaysElapsed(start: string): number {
  const s = new Date(start)
  const now = new Date()
  return Math.max(0, Math.ceil((now.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))
}

function formatShortDate(dateStr: string, locale: string): string {
  try {
    const d = new Date(dateStr)
    const days = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la']
    const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dayNames = locale === 'fi' ? days : daysEn
    const day = dayNames[d.getDay()]
    const date = d.getDate()
    const month = d.getMonth() + 1
    const hours = d.getHours().toString().padStart(2, '0')
    const mins = d.getMinutes().toString().padStart(2, '0')
    return `${day} ${date}.${month} · ${hours}.${mins}`
  } catch {
    return dateStr
  }
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

  // Review state
  const [reviewStars, setReviewStars] = useState(5)
  const [reviewTags, setReviewTags] = useState<Set<string>>(new Set())
  const [reviewComment, setReviewComment] = useState('')

  // Feature flag gate
  useEffect(() => {
    if (!FEATURES.PAYMENTS) {
      router.replace('/(tabs)')
    }
  }, [router])

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

  // ─── Messaging ───
  const messagingRef = useRef(false)
  const handleSendMessage = useCallback(async () => {
    if (messagingRef.current) return
    if (!userId || !booking?.other_user) return
    messagingRef.current = true
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
    } finally {
      messagingRef.current = false
    }
  }, [userId, booking, supabase, router])

  // ─── Status actions ───
  const updatingRef = useRef(false)
  const updateBookingStatus = useCallback(async (newStatus: BookingStatus) => {
    if (!booking || !userId) return
    if (updatingRef.current) return
    if (newStatus === 'confirmed' && booking.my_role !== 'lender' && booking.my_role !== 'provider') return
    if (newStatus === 'completed' && booking.my_role !== 'lender' && booking.my_role !== 'provider') return
    if (newStatus === 'cancelled' && !['borrower', 'buyer', 'lender', 'provider'].includes(booking.my_role)) return
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
  }, [booking, supabase, t, userId])

  const handleConfirm = useCallback(() => updateBookingStatus('confirmed'), [updateBookingStatus])
  const handleCancel = useCallback(() => {
    Alert.alert(t('rental.cancelBooking'), t('rental.bookingCancelled'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => updateBookingStatus('cancelled') },
    ])
  }, [t, updateBookingStatus])
  const handleComplete = useCallback(() => updateBookingStatus('completed'), [updateBookingStatus])
  const handleStartWork = useCallback(() => updateBookingStatus('in_progress'), [updateBookingStatus])

  const handleSubmitReview = useCallback(async () => {
    if (!booking?.other_user?.id || !userId) return
    setActionLoading(true)
    try {
      const { error: revError } = await (supabase.from('reviews') as any).insert({
        reviewer_id: userId,
        reviewee_id: booking.other_user.id,
        rating: reviewStars,
        comment: reviewComment || null,
        booking_id: booking.id,
        tags: Array.from(reviewTags),
      })
      if (revError) throw revError
      Alert.alert(t('common.success'))
      router.back()
    } catch {
      Alert.alert(t('common.error'))
    } finally {
      setActionLoading(false)
    }
  }, [booking, userId, reviewStars, reviewComment, reviewTags, supabase, t, router])

  const steps = useMemo(() => booking?.type === 'service' ? SERVICE_STEPS : RENTAL_STEPS, [booking?.type])
  const currentStepIndex = useMemo(() => {
    if (!booking) return -1
    if (['cancelled', 'disputed', 'refunded'].includes(booking.status)) return -1
    return getStepIndex(booking.status, steps)
  }, [booking, steps])

  const canConfirm = booking?.my_role === 'lender' && booking?.status === 'pending'
    || booking?.my_role === 'provider' && booking?.status === 'paid'
  const canCancel = booking?.status === 'pending' || booking?.status === 'paid' || booking?.status === 'confirmed'
  const canComplete = (booking?.my_role === 'lender' && ['active', 'paid', 'confirmed'].includes(booking?.status ?? ''))
    || (booking?.my_role === 'provider' && booking?.status === 'in_progress')
  const canStart = booking?.my_role === 'provider' && booking?.status === 'confirmed'

  const otherName = booking?.other_user?.name ?? ''
  const itemTitle = booking?.post?.title ?? ''
  const isRental = booking?.type === 'rental'

  // ─── Loading ───
  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <BarHeader colors={colors} t={t} insets={insets} router={router} />
        <ActivityIndicator size="large" color={colors.foreground} style={{ marginTop: 80 }} />
      </View>
    )
  }

  // ─── Not found ───
  if (!booking) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <BarHeader colors={colors} t={t} insets={insets} router={router} />
        <Text style={[s.notFound, { color: colors.mutedForeground }]}>{t('booking.notFound')}</Text>
      </View>
    )
  }

  // ─── Compute rental day info ───
  const totalDays = booking.start_date && booking.end_date ? getDaysBetween(booking.start_date, booking.end_date) : 0
  const elapsedDays = booking.start_date ? Math.min(getDaysElapsed(booking.start_date), totalDays) : 0
  const progressPct = totalDays > 0 ? Math.min(elapsedDays / totalDays, 1) : 0
  const basePrice = booking.type === 'service'
    ? (booking.service_price ?? 0)
    : ((booking.daily_fee ?? 0) * Math.max(1, totalDays))

  // ════════════════════════════════════════════════════════════════════
  // STATUS-SPECIFIC RENDERS
  // ════════════════════════════════════════════════════════════════════

  // ── PENDING / PAID: Waiting for confirmation ──
  if (booking.status === 'pending' || booking.status === 'paid') {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <BarHeader colors={colors} t={t} insets={insets} router={router} title={t('booking.loan')} />

        <ScrollView contentContainerStyle={[s.scrollPadded, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
          {/* Hero — waiting */}
          <View style={s.heroCenter}>
            <View style={[s.heroCircle, { backgroundColor: colors.muted }]}>
              <ActivityIndicator size="small" color={colors.foreground} />
            </View>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
              {t('booking.waitingConfirmation')}
            </Text>
            <Text style={[s.heroHeadline, { color: colors.foreground }]}>
              {t('booking.waitingConfirmationDesc')}
            </Text>
          </View>

          {/* Item summary card */}
          <ItemSummaryCard booking={booking} colors={colors} t={t} locale={locale} router={router} />

          {/* Date range card */}
          {booking.start_date && booking.end_date && (
            <DateRangeCard startDate={booking.start_date} endDate={booking.end_date} colors={colors} t={t} locale={locale} />
          )}

          {/* Timeline */}
          <TimelineCard booking={booking} steps={steps} currentStepIndex={currentStepIndex} colors={colors} t={t} locale={locale} />

          {/* Price breakdown */}
          <PriceBreakdownCard basePrice={basePrice} serviceFee={booking.service_fee} total={booking.total_amount} isService={!isRental} colors={colors} t={t} locale={locale} />

          {/* Actions for lender/provider */}
          {canConfirm && (
            <View style={s.actionsContainer}>
              <PressableOpacity
                onPress={handleConfirm}
                disabled={actionLoading}
                style={[s.actionBtnPrimary, { backgroundColor: colors.foreground }]}
                accessibilityLabel={t('rental.confirmBooking')}
                accessibilityRole="button"
              >
                {actionLoading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : (
                  <><CheckCircle size={16} color={colors.primaryForeground} /><Text style={[s.actionBtnText, { color: colors.primaryForeground }]}>{t('rental.confirmBooking')}</Text></>
                )}
              </PressableOpacity>
            </View>
          )}
          {canCancel && (
            <PressableOpacity
              onPress={handleCancel}
              disabled={actionLoading}
              style={[s.actionBtnOutline, { borderColor: colors.border }]}
              accessibilityLabel={t('rental.cancelBooking')}
              accessibilityRole="button"
            >
              <XCircle size={16} color={colors.mutedForeground} />
              <Text style={[s.actionBtnText, { color: colors.mutedForeground }]}>{t('rental.cancelBooking')}</Text>
            </PressableOpacity>
          )}
        </ScrollView>

        {/* Sticky CTA */}
        {booking.other_user && (
          <StickyCTA onPress={handleSendMessage} label={t('booking.sendMessage')} colors={colors} insets={insets} icon={<MessageCircle size={18} color={colors.primaryForeground} />} />
        )}
      </View>
    )
  }

  // ── CONFIRMED: Hero checkmark + timeline + next-step ribbon (Mockup 11) ──
  if (booking.status === 'confirmed') {
    const startDay = booking.start_date ? formatShortDate(booking.start_date, locale) : ''
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <BarHeader colors={colors} t={t} insets={insets} router={router} title={t('booking.loan')} />

        <ScrollView contentContainerStyle={[s.scrollPadded, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
          {/* Hero — confirmed checkmark */}
          <View style={s.heroCenter}>
            <View style={[s.heroCircle, { backgroundColor: colors.foreground }]}>
              <Check size={32} color={colors.primaryForeground} strokeWidth={2.5} />
            </View>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
              {t('booking.approved', { name: otherName })}
            </Text>
            <Text style={[s.heroHeadline, { color: colors.foreground }]}>
              {t('booking.itemReserved', { item: itemTitle, day: startDay })}
            </Text>
          </View>

          {/* Timeline card */}
          <TimelineCard booking={booking} steps={steps} currentStepIndex={currentStepIndex} colors={colors} t={t} locale={locale} />

          {/* Next-step ribbon — dark card */}
          {booking.other_user && (
            <PressableOpacity
              onPress={handleSendMessage}
              style={[s.ribbonCard, { backgroundColor: colors.foreground }]}
              accessibilityRole="button"
              accessibilityLabel={t('booking.arrangePickup', { name: otherName })}
            >
              <View style={[s.ribbonIconCircle, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.12)' }]}>
                <MessageCircle size={16} color={colors.primaryForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.ribbonTitle, { color: colors.primaryForeground }]}>
                  {t('booking.arrangePickup', { name: otherName })}
                </Text>
                <Text style={[s.ribbonSubtitle, { color: isDark ? colors.mutedForeground : '#B8BCC0' }]}>
                  {t('booking.arrangePickupHint')}
                </Text>
              </View>
              <ChevronRight size={14} color={colors.primaryForeground} />
            </PressableOpacity>
          )}

          {/* Price breakdown */}
          <PriceBreakdownCard basePrice={basePrice} serviceFee={booking.service_fee} total={booking.total_amount} isService={!isRental} colors={colors} t={t} locale={locale} />

          {canCancel && (
            <PressableOpacity
              onPress={handleCancel}
              disabled={actionLoading}
              style={[s.actionBtnOutline, { borderColor: colors.border }]}
              accessibilityLabel={t('rental.cancelBooking')}
              accessibilityRole="button"
            >
              <XCircle size={16} color={colors.mutedForeground} />
              <Text style={[s.actionBtnText, { color: colors.mutedForeground }]}>{t('rental.cancelBooking')}</Text>
            </PressableOpacity>
          )}
        </ScrollView>

        {/* Sticky CTA */}
        <StickyCTA onPress={handleSendMessage} label={t('booking.openChat')} colors={colors} insets={insets} icon={<MessageCircle size={18} color={colors.primaryForeground} />} />
      </View>
    )
  }

  // ── ACTIVE / IN_PROGRESS: Progress bar + item + todo list (Mockup 13) ──
  if (booking.status === 'active' || booking.status === 'in_progress') {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <BarHeader
          colors={colors} t={t} insets={insets} router={router}
          title={t('booking.loan')}
          subtitle={booking.start_date && booking.end_date ? formatDateRange(booking.start_date, booking.end_date, locale) : undefined}
        />

        <ScrollView contentContainerStyle={[s.scrollPadded, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
          {/* Status banner with progress bar */}
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.statusDotRow}>
              <View style={[s.statusDot, { backgroundColor: colors.foreground }]} />
              <Text style={[s.sectionLabel, { color: colors.foreground, marginBottom: 0 }]}>
                {t('booking.inProgress')}
              </Text>
            </View>
            <Text style={[s.bannerHeadline, { color: colors.foreground }]}>
              {booking.end_date
                ? t('booking.returnIn', { days: Math.max(0, totalDays - elapsedDays).toString() })
                : t('booking.activeTitle')
              }
            </Text>
            {totalDays > 0 && (
              <View style={s.progressRow}>
                <View style={{ flex: 1 }}>
                  <View style={[s.progressTrack, { backgroundColor: colors.border }]}>
                    <View style={[s.progressFill, { backgroundColor: colors.foreground, width: `${Math.round(progressPct * 100)}%` as any }]} />
                  </View>
                </View>
                <Text style={[s.progressText, { color: colors.mutedForeground }]}>
                  {t('booking.daysProgress', { current: elapsedDays.toString(), total: totalDays.toString() })}
                </Text>
              </View>
            )}
          </View>

          {/* Item snapshot */}
          <ItemSummaryCard booking={booking} colors={colors} t={t} locale={locale} router={router} compact />

          {/* Todo list: Before returning */}
          {isRental && (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('booking.beforeReturn')}</Text>
              {[
                { text: t('rental.verifyCondition'), done: false },
                { text: t('rental.takeReturnPhotos'), done: false },
              ].map((item, i, arr) => (
                <View key={i} style={[s.todoRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                  <View style={[s.todoCheck, { backgroundColor: item.done ? colors.foreground : 'transparent', borderColor: item.done ? colors.foreground : colors.border }]}>
                    {item.done && <Check size={11} color={colors.primaryForeground} strokeWidth={3.5} />}
                  </View>
                  <Text style={[s.todoText, { color: item.done ? colors.mutedForeground : colors.foreground, textDecorationLine: item.done ? 'line-through' : 'none' }]}>
                    {item.text}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Price breakdown */}
          <PriceBreakdownCard basePrice={basePrice} serviceFee={booking.service_fee} total={booking.total_amount} isService={!isRental} colors={colors} t={t} locale={locale} />

          {/* Action buttons */}
          <View style={s.actionsContainer}>
            {canComplete && (
              <PressableOpacity
                onPress={handleComplete}
                disabled={actionLoading}
                style={[s.actionBtnPrimary, { backgroundColor: colors.foreground }]}
                accessibilityLabel={isRental ? t('rental.returnItem') : t('service.markDone')}
                accessibilityRole="button"
              >
                {actionLoading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : (
                  <><RotateCcw size={16} color={colors.primaryForeground} /><Text style={[s.actionBtnText, { color: colors.primaryForeground }]}>
                    {isRental ? t('rental.returnItem') : t('service.markDone')}
                  </Text></>
                )}
              </PressableOpacity>
            )}
            {canStart && (
              <PressableOpacity
                onPress={handleStartWork}
                disabled={actionLoading}
                style={[s.actionBtnPrimary, { backgroundColor: colors.foreground }]}
                accessibilityLabel={t('service.startWork')}
                accessibilityRole="button"
              >
                <Text style={[s.actionBtnText, { color: colors.primaryForeground }]}>{t('service.startWork')}</Text>
              </PressableOpacity>
            )}
          </View>
        </ScrollView>

        {/* Sticky CTA */}
        <StickyCTA
          onPress={canComplete && isRental
            ? () => router.push({
                pathname: '/return-item',
                params: {
                  bookingId: booking.id,
                  itemTitle: booking.post?.title ?? '',
                  itemImage: booking.post?.image_url ?? '',
                  ownerName: booking.other_user?.name ?? '',
                  days: totalDays.toString(),
                },
              })
            : canComplete ? handleComplete : handleSendMessage}
          label={canComplete ? t('booking.startReturn') : t('booking.sendMessage')}
          colors={colors}
          insets={insets}
          icon={canComplete ? <RotateCcw size={18} color={colors.primaryForeground} /> : <MessageCircle size={18} color={colors.primaryForeground} />}
        />
      </View>
    )
  }

  // ── COMPLETED: Review screen (Mockup 14) ──
  if (booking.status === 'completed') {
    const tagKeys = ['tagFastResponse', 'tagFriendly', 'tagGoodCondition', 'tagClearInstructions', 'tagFlexibleSchedule'] as const
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <BarHeader colors={colors} t={t} insets={insets} router={router} title={t('booking.reviewTitle')} />

        <ScrollView contentContainerStyle={[s.scrollPadded, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
          {/* Hero — avatar + prompt */}
          <View style={s.heroCenter}>
            {booking.other_user && (
              <View style={[s.reviewAvatarRing, { borderColor: colors.card }]}>
                <Avatar url={booking.other_user.avatar_url} name={booking.other_user.name} size={72} />
              </View>
            )}
            <Text style={[s.heroHeadline, { color: colors.foreground, fontSize: 22 }]}>
              {t('booking.howDidItGo', { name: otherName })}
            </Text>
            <Text style={[s.heroSubtext, { color: colors.mutedForeground }]}>
              {t('booking.reviewHelp')}
            </Text>
          </View>

          {/* Star rating */}
          <View style={s.starsRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <PressableOpacity key={n} onPress={() => setReviewStars(n)} accessibilityLabel={`${n} star`} accessibilityRole="button">
                <Star size={34} color={colors.foreground} fill={n <= reviewStars ? colors.foreground : 'none'} strokeWidth={1.6} />
              </PressableOpacity>
            ))}
          </View>

          {/* Tag chips */}
          <Text style={[s.sectionLabel, { color: colors.mutedForeground, paddingHorizontal: 4 }]}>
            {t('booking.whatWorkedWell')}
          </Text>
          <View style={s.tagsWrap}>
            {tagKeys.map(key => {
              const label = t(`booking.${key}`)
              const on = reviewTags.has(key)
              return (
                <PressableOpacity
                  key={key}
                  onPress={() => {
                    const next = new Set(reviewTags)
                    on ? next.delete(key) : next.add(key)
                    setReviewTags(next)
                  }}
                  style={[
                    s.tagChip,
                    on
                      ? { backgroundColor: colors.foreground }
                      : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.tagText, { color: on ? colors.primaryForeground : colors.foreground, fontFamily: on ? fonts.bodySemi : fonts.bodyMedium }]}>
                    {label}
                  </Text>
                </PressableOpacity>
              )
            })}
          </View>

          {/* Free comment */}
          <Text style={[s.sectionLabel, { color: colors.mutedForeground, paddingHorizontal: 4, marginTop: 8 }]}>
            {t('booking.freeComment')}
          </Text>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }]}>
            <TextInput
              style={[s.commentInput, { color: colors.foreground }]}
              value={reviewComment}
              onChangeText={setReviewComment}
              multiline
              numberOfLines={3}
              placeholder="..."
              placeholderTextColor={colors.tertiaryForeground}
            />
          </View>
        </ScrollView>

        {/* Sticky CTA */}
        <StickyCTA
          onPress={handleSubmitReview}
          label={t('booking.submitReview')}
          colors={colors}
          insets={insets}
          loading={actionLoading}
        />
      </View>
    )
  }

  // ── CANCELLED / DISPUTED / REFUNDED: Simple status ──
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <BarHeader colors={colors} t={t} insets={insets} router={router} />

      <ScrollView contentContainerStyle={[s.scrollPadded, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        {/* Hero — cancelled */}
        <View style={s.heroCenter}>
          <View style={[s.heroCircle, { backgroundColor: `${colors.destructive}14` }]}>
            <XCircle size={32} color={colors.destructive} />
          </View>
          <Text style={[s.heroHeadline, { color: colors.foreground }]}>
            {t(STATUS_KEYS[booking.status] ?? 'rental.statusCancelled')}
          </Text>
        </View>

        {/* Item summary */}
        <ItemSummaryCard booking={booking} colors={colors} t={t} locale={locale} router={router} />

        {/* Timeline */}
        <TimelineCard booking={booking} steps={steps} currentStepIndex={currentStepIndex} colors={colors} t={t} locale={locale} />

        {/* Price breakdown */}
        <PriceBreakdownCard basePrice={basePrice} serviceFee={booking.service_fee} total={booking.total_amount} isService={!isRental} colors={colors} t={t} locale={locale} />

        {booking.other_user && (
          <PressableOpacity
            onPress={handleSendMessage}
            style={[s.actionBtnOutline, { borderColor: colors.border }]}
            accessibilityLabel={t('booking.sendMessage')}
            accessibilityRole="button"
          >
            <MessageCircle size={16} color={colors.foreground} />
            <Text style={[s.actionBtnText, { color: colors.foreground }]}>{t('booking.sendMessage')}</Text>
          </PressableOpacity>
        )}
      </ScrollView>
    </View>
  )
}

// ════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════

function BarHeader({ colors, t, insets, router, title, subtitle }: {
  colors: any; t: any; insets: any; router: any; title?: string; subtitle?: string
}) {
  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      <PressableOpacity
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        style={[s.circleBackBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <ArrowLeft size={16} color={colors.foreground} strokeWidth={2.2} />
      </PressableOpacity>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{title ?? t('booking.details')}</Text>
        {subtitle ? <Text style={[s.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      <View style={s.headerSpacer} />
    </View>
  )
}

function ItemSummaryCard({ booking, colors, t, locale, router, compact }: {
  booking: BookingData; colors: any; t: any; locale: string; router: any; compact?: boolean
}) {
  const isService = booking.type === 'service'
  const imgSize = compact ? 54 : 64
  return (
    <PressableOpacity
      onPress={() => booking.post?.id && router.push(`/post/${booking.post.id}` as any)}
      style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 12 }]}
      accessibilityRole="button"
      accessibilityLabel={booking.post?.title ?? t('booking.viewPost')}
    >
      <View style={s.itemRow}>
        {booking.post?.image_url ? (
          <ImageWithFallback
            uri={booking.post.image_url}
            style={{ width: imgSize, height: imgSize, borderRadius: 14 }}
            contentFit="cover"
            fallbackIcon={isService ? <ShoppingBag size={24} color={colors.mutedForeground} /> : <Package size={24} color={colors.mutedForeground} />}
          />
        ) : (
          <View style={[{ width: imgSize, height: imgSize, borderRadius: 14, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
            {isService ? <ShoppingBag size={24} color={colors.mutedForeground} /> : <Package size={24} color={colors.mutedForeground} />}
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[s.itemTitle, { color: colors.foreground }]} numberOfLines={2}>
            {booking.post?.title ?? t('rental.deletedPost')}
          </Text>
          {booking.other_user && (
            <Text style={[s.itemMeta, { color: colors.mutedForeground }]}>
              {booking.other_user.name}
            </Text>
          )}
          {!compact && (
            <Text style={[s.itemPrice, { color: colors.foreground }]}>
              {booking.total_amount > 0
                ? formatPrice(booking.total_amount, locale)
                : t('booking.free')
              }
            </Text>
          )}
        </View>
      </View>
    </PressableOpacity>
  )
}

function DateRangeCard({ startDate, endDate, colors, t, locale }: {
  startDate: string; endDate: string; colors: any; t: any; locale: string
}) {
  return (
    <>
      <Text style={[s.sectionLabel, { color: colors.mutedForeground, paddingHorizontal: 4 }]}>
        {t('booking.loanDuration')}
      </Text>
      <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }]}>
        <View style={s.dateRangeRow}>
          <View>
            <Text style={[s.dateLabelSmall, { color: colors.mutedForeground }]}>{t('booking.pickup')}</Text>
            <Text style={[s.dateValueBold, { color: colors.foreground }]}>{formatShortDate(startDate, locale)}</Text>
          </View>
          <View style={[s.dateDivider, { backgroundColor: colors.border }]} />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.dateLabelSmall, { color: colors.mutedForeground }]}>{t('booking.returnDate')}</Text>
            <Text style={[s.dateValueBold, { color: colors.foreground }]}>{formatShortDate(endDate, locale)}</Text>
          </View>
        </View>
      </View>
    </>
  )
}

function TimelineCard({ booking, steps, currentStepIndex, colors, t, locale }: {
  booking: BookingData; steps: BookingStatus[]; currentStepIndex: number; colors: any; t: any; locale: string
}) {
  if (currentStepIndex < 0) return null
  const timelineSteps = steps.map((step, i) => ({
    key: step,
    label: t(STATUS_KEYS[step] ?? step),
    done: i < currentStepIndex,
    current: i === currentStepIndex,
    future: i > currentStepIndex,
  }))

  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 18 }]}>
      {timelineSteps.map((step, i) => (
        <View key={step.key} style={[s.timelineStep, { paddingBottom: i === timelineSteps.length - 1 ? 0 : 18 }]}>
          <View style={s.timelineDotCol}>
            <View style={[
              s.timelineDot,
              {
                backgroundColor: step.done || step.current ? colors.foreground : 'transparent',
                borderWidth: 2,
                borderColor: colors.foreground,
              },
            ]} />
            {i < timelineSteps.length - 1 && (
              <View style={[s.timelineLine, { backgroundColor: step.done ? colors.foreground : colors.border }]} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[
              s.timelineLabel,
              {
                color: step.done ? colors.mutedForeground : colors.foreground,
                fontFamily: step.current ? fonts.bodySemi : fonts.body,
                textDecorationLine: step.done ? 'line-through' : 'none',
              },
            ]}>
              {step.label}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function PriceBreakdownCard({ basePrice, serviceFee, total, isService, colors, t, locale }: {
  basePrice: number; serviceFee: number; total: number; isService: boolean; colors: any; t: any; locale: string
}) {
  return (
    <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('booking.priceBreakdown')}</Text>
      <View style={s.priceRow}>
        <Text style={[s.priceLabel, { color: colors.mutedForeground }]}>
          {isService ? t('service.servicePrice') : t('rental.rentalFee')}
        </Text>
        <Text style={[s.priceValue, { color: colors.foreground }]}>{formatPrice(basePrice, locale)}</Text>
      </View>
      <View style={s.priceRow}>
        <Text style={[s.priceLabel, { color: colors.mutedForeground }]}>{t('booking.serviceFee')}</Text>
        <Text style={[s.priceValue, { color: colors.foreground }]}>{formatPrice(serviceFee, locale)}</Text>
      </View>
      <View style={[s.priceRow, s.priceTotalRow, { borderTopColor: colors.border }]}>
        <Text style={[s.priceTotalLabel, { color: colors.foreground }]}>{t('booking.total')}</Text>
        <Text style={[s.priceTotalValue, { color: colors.foreground }]}>{formatPrice(total, locale)}</Text>
      </View>
    </View>
  )
}

function StickyCTA({ onPress, label, colors, insets, icon, loading: isLoading }: {
  onPress: () => void; label: string; colors: any; insets: any; icon?: React.ReactNode; loading?: boolean
}) {
  return (
    <View style={[s.stickyWrap, { bottom: insets.bottom + 22 }]}>
      <PressableOpacity
        onPress={onPress}
        disabled={isLoading}
        style={[s.stickyCta, { backgroundColor: colors.foreground }]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primaryForeground} />
        ) : (
          <>
            {icon}
            <Text style={[s.stickyCtaText, { color: colors.primaryForeground }]}>{label}</Text>
          </>
        )}
      </PressableOpacity>
    </View>
  )
}

// ════════════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  circleBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  headerTitle: {
    fontSize: 14,
    letterSpacing: -0.2,
    fontFamily: fonts.headingSemi,
    lineHeight: 20,
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: fonts.body,
    marginTop: 1,
  },
  headerSpacer: { width: 36 },

  scrollPadded: { paddingHorizontal: 16, gap: 12 },
  notFound: { fontSize: 16, fontFamily: fonts.body, textAlign: 'center', marginTop: 104, lineHeight: 22 },

  // Hero center
  heroCenter: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  heroCircle: {
    width: 72,
    height: 72,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  heroHeadline: {
    fontSize: 24,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.5,
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 8,
  },
  heroSubtext: {
    fontSize: 12.5,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
  },

  // Section labels
  sectionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    marginBottom: 8,
  },

  // Card
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },

  // Item summary
  itemRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  itemTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.1,
  },
  itemMeta: {
    fontSize: 11.5,
    fontFamily: fonts.body,
    marginTop: 3,
  },
  itemPrice: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    marginTop: 6,
  },

  // Date range
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateLabelSmall: {
    fontSize: 11,
    fontFamily: fonts.body,
  },
  dateValueBold: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    marginTop: 2,
  },
  dateDivider: {
    width: 28,
    height: 1,
  },

  // Ribbon (dark card)
  ribbonCard: {
    borderRadius: 18,
    padding: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ribbonIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ribbonTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  ribbonSubtitle: {
    fontSize: 10.5,
    fontFamily: fonts.body,
    marginTop: 1,
  },

  // Status banner
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  bannerHeadline: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.3,
  },

  // Progress
  progressRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
  },

  // Todo list
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  todoCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todoText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
  },

  // Stars
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 4,
    paddingBottom: 24,
  },

  // Tags
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  tagChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 12.5,
  },

  // Review avatar
  reviewAvatarRing: {
    borderWidth: 3,
    borderRadius: 999,
    marginBottom: 14,
  },

  // Comment input
  commentInput: {
    fontSize: 13.5,
    fontFamily: fonts.body,
    lineHeight: 20,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Timeline
  timelineStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  timelineDotCol: { alignItems: 'center', width: 14 },
  timelineDot: { width: 14, height: 14, borderRadius: 999 },
  timelineLine: { width: 1.5, flex: 1, minHeight: 30, marginTop: 4 },
  timelineLabel: { fontSize: 13.5, fontFamily: fonts.body, lineHeight: 18, letterSpacing: -0.1 },

  // Price
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  priceLabel: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20 },
  priceValue: { fontSize: 14, fontFamily: fonts.bodyMedium, lineHeight: 20 },
  priceTotalRow: { borderTopWidth: 1, paddingTop: 10, marginTop: 8 },
  priceTotalLabel: { fontSize: 16, fontFamily: fonts.headingSemi, lineHeight: 22 },
  priceTotalValue: { fontSize: 18, fontFamily: fonts.headingSemi, lineHeight: 24 },

  // Actions
  actionsContainer: { gap: 8, marginTop: 4 },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 999,
    minHeight: 48,
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 999,
    minHeight: 48,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },

  // Sticky CTA
  stickyWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  stickyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 56,
    borderRadius: 999,
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 8,
  },
  stickyCtaText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.1,
  },
})

export default function BookingDetailScreen() {
  return (
    <ScreenErrorBoundary screenName="BookingDetail">
      <BookingDetailScreenInner />
    </ScreenErrorBoundary>
  )
}
