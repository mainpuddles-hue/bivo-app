import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import {
  ArrowLeft, MessageCircle, Package, ShoppingBag, CheckCircle, XCircle,
  RotateCcw, Star, Check, ChevronRight, AlertCircle, Clock, RefreshCw,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { FEATURES } from '@/lib/featureFlags'
import { Avatar } from '@/components/Avatar'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { BookingDetailSkeleton } from '@/components/SkeletonLoaders'
import { PressableOpacity } from '@/components/ui'
import { fonts } from '@/lib/fonts'
import { formatPrice, formatDateRange } from '@/lib/format'
import { isValidUUID } from '@/lib/validation'
import { mapErrorToFinnish } from '@/lib/errorMessages'
import { safeBack } from '@/lib/navigation'
import { useToast } from '@/components/Toast'
import { StatusBanner, DepositChip, PreReturnChecklist, HubHandoffCard, LockerPinCard, type ChecklistItem } from '@/components/lending'

type PickupMethodValue = 'address' | 'hub' | 'gardi'

interface HubInfo {
  id: string
  name: string
  address: string | null
  type: string | null
  lat: number | null
  lng: number | null
}

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
  post?: {
    id: string
    title: string
    image_url: string | null
    pre_return_checklist?: { key: string; label: string; optional?: boolean }[] | null
  } | null
  other_user?: { id: string; name: string; avatar_url: string | null } | null
  other_user_role: string
  my_role: string
  // Slice 1 additions — present once supabase/manual-fixes/20260510_lending_slice1.sql
  // is applied. All optional so unmigrated DBs / partial selects still type-check.
  deposit_amount?: number | null
  deposit_status?: 'authorized' | 'captured' | 'released' | 'partial_captured' | 'none' | null
  pickup_method?: PickupMethodValue | null
  pickup_state?: string | null
  hub_id?: string | null
  locker_id?: string | null
  locker_provider?: 'mock' | 'gardi' | null
  locker_pickup_pin?: string | null
  locker_pickup_pin_expires_at?: string | null
  locker_dropoff_pin?: string | null
  locker_dropoff_pin_expires_at?: string | null
  deposit_captured_amount?: number | null
  return_record?: {
    photos?: string[]
    checks?: Record<string, boolean>
    note?: string
    submitted_at?: string
  } | null
  lender_review_at?: string | null
  borrower_review_at?: string | null
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

// Hub-handoff eyebrow + caption mapping. pickup_state drives "what should
// happen next" for the physical handoff; my_role decides whose turn it is.
// Keys map to the pickup_state CHECK constraint added by the slice 2 SQL.
function hubEyebrowFor(pickupState: string | null | undefined, myRole: string, t: (k: string) => string): string {
  switch (pickupState) {
    case 'awaiting_lender_dropoff':
      return myRole === 'lender' ? (t('hub.dropoff') ?? 'JÄTÄ HUBIIN') : (t('hub.waitingDropoff') ?? 'ODOTTAA TOIMITUSTA')
    case 'awaiting_borrower_pickup':
      return myRole === 'borrower' ? (t('hub.pickup') ?? 'NOUDA HUBISTA') : (t('hub.waitingPickup') ?? 'ODOTTAA NOUTOA')
    case 'in_use':
      return t('hub.atBorrower') ?? 'LAINASSA'
    case 'awaiting_borrower_return':
      return myRole === 'borrower' ? (t('hub.return') ?? 'PALAUTA HUBIIN') : (t('hub.waitingReturn') ?? 'ODOTTAA PALAUTUSTA')
    case 'awaiting_lender_collection':
      return myRole === 'lender' ? (t('hub.collect') ?? 'NOUDA HUBISTA') : (t('hub.returned') ?? 'PALAUTETTU')
    default:
      return t('hub.handoffPoint') ?? 'NOUTOPISTE'
  }
}

// Decides which PIN to surface on the LockerPinCard for the active viewer.
// Lender uses the dropoff PIN to put items into the locker (drop / collect
// flips between active drop or 'pickup_at_collect' which is the collect
// step — same locker, same physical action of opening). Borrower uses the
// pickup PIN to take items out (pickup or return-deposit). For mock
// provider we simply read the column written at locker-pick time; for
// real Gardi provider, slice 4 will refresh the PIN per direction.
function lockerPinFor(
  booking: { pickup_state?: string | null; my_role: string; locker_pickup_pin?: string | null; locker_pickup_pin_expires_at?: string | null; locker_dropoff_pin?: string | null; locker_dropoff_pin_expires_at?: string | null },
  lockerName: string,
  t: (k: string) => string,
): { label: string; pin: string; lockerLine: string; validity?: string; locked: boolean } {
  const role = booking.my_role
  const state = booking.pickup_state

  // Determine which side / direction is active right now.
  // Default (state=pending_method or unknown) → lender's dropoff first, since
  // that's the first physical event after a Gardi booking is paid.
  let direction: 'pickup' | 'dropoff' = 'dropoff'
  let label = t('locker.dropoffCode') ?? 'AVAUSKOODI'

  if (state === 'awaiting_borrower_pickup' || (role === 'borrower' && state === 'in_use')) {
    direction = 'pickup'
    label = t('locker.pickupCode') ?? 'NOUTOKOODI'
  } else if (state === 'awaiting_borrower_return') {
    // Borrower is putting the item back into the locker.
    direction = 'dropoff'
    label = t('locker.returnCode') ?? 'PALAUTUSKOODI'
  } else if (state === 'awaiting_lender_collection') {
    // Lender is taking the returned item out.
    direction = 'pickup'
    label = t('locker.collectCode') ?? 'NOUTOKOODI'
  }

  const pin = direction === 'dropoff' ? booking.locker_dropoff_pin : booking.locker_pickup_pin
  const expiresAt = direction === 'dropoff' ? booking.locker_dropoff_pin_expires_at : booking.locker_pickup_pin_expires_at

  const validity = expiresAt
    ? formatLockerExpiry(expiresAt, t)
    : undefined

  return {
    label,
    pin: pin || '— — — —',
    lockerLine: lockerName,
    validity,
    locked: !pin,
  }
}

function formatLockerExpiry(expiresAt: string, t: (k: string) => string): string {
  try {
    const d = new Date(expiresAt)
    const now = new Date()
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    const time = `${d.getHours().toString().padStart(2, '0')}.${d.getMinutes().toString().padStart(2, '0')}`
    if (sameDay) return (t('locker.validToday') ?? 'Voimassa tänään') + ` ${time} asti`
    const date = `${d.getDate()}.${d.getMonth() + 1}.`
    return (t('locker.validUntil') ?? 'Voimassa') + ` ${date} ${time} asti`
  } catch {
    return ''
  }
}

function hubCaptionFor(pickupState: string | null | undefined, myRole: string, t: (k: string) => string): string | undefined {
  switch (pickupState) {
    case 'awaiting_lender_dropoff':
      return myRole === 'lender'
        ? (t('hub.dropoffCaption') ?? 'Jätä laite hubiin niin lainaaja saa ilmoituksen.')
        : (t('hub.waitingDropoffCaption') ?? 'Saat ilmoituksen kun laite on hubissa noudettavissa.')
    case 'awaiting_borrower_pickup':
      return myRole === 'borrower'
        ? (t('hub.pickupCaption') ?? 'Käy noutamassa laite hubista milloin sinulle sopii.')
        : (t('hub.waitingPickupCaption') ?? 'Lainaaja saa ilmoituksen ja käy hakemassa.')
    case 'awaiting_borrower_return':
      return myRole === 'borrower'
        ? (t('hub.returnCaption') ?? 'Palauta laite hubiin loppukauden mennessä.')
        : (t('hub.waitingReturnCaption') ?? 'Saat ilmoituksen kun laite on hubissa.')
    case 'awaiting_lender_collection':
      return myRole === 'lender'
        ? (t('hub.collectCaption') ?? 'Lainaaja palautti — käy noutamassa.')
        : (t('hub.returnedCaption') ?? 'Lainaus on päätössä — kiitos.')
    default:
      return undefined
  }
}

function BookingDetailScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const toast = useToast()

  const [booking, setBooking] = useState<BookingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Review state
  const [reviewStars, setReviewStars] = useState(5)
  const [reviewTags, setReviewTags] = useState<Set<string>>(new Set())
  const [reviewComment, setReviewComment] = useState('')

  // Local pre-return checklist state for the LoanActive screen. Seeded from
  // booking.return_record.checks on first load, then mutated locally as the
  // borrower ticks items off. Persistence to the DB happens at Return-screen
  // submit time so we don't have to debounce-PATCH from here.
  const [preReturnChecks, setPreReturnChecks] = useState<Record<string, boolean>>({})
  useEffect(() => {
    setPreReturnChecks(booking?.return_record?.checks ?? {})
  }, [booking?.return_record])

  // Hub details for pickup_method='hub' bookings. Fetched lazily so the
  // hub join doesn't bloat the main booking query for the 99% address
  // case. Falls back gracefully if the hub_id column or hubs row doesn't
  // exist yet (slice 2 SQL not applied).
  const [hub, setHub] = useState<HubInfo | null>(null)
  useEffect(() => {
    const hubId = booking?.hub_id
    if (!hubId) { setHub(null); return }
    let mounted = true
    supabase
      .from('hubs')
      .select('id, name, address, type, lat, lng')
      .eq('id', hubId)
      .maybeSingle()
      .then(({ data, error }: { data: any; error: any }) => {
        if (!mounted) return
        if (error) { if (__DEV__) console.warn('[booking] hub fetch failed:', error.message); return }
        if (data) setHub(data as HubInfo)
      })
    return () => { mounted = false }
  }, [booking?.hub_id, supabase])

  // Locker details for pickup_method='gardi' bookings.
  const [locker, setLocker] = useState<{ location_name: string; address: string | null; lat: number | null; lng: number | null } | null>(null)
  useEffect(() => {
    const lockerId = booking?.locker_id
    if (!lockerId) { setLocker(null); return }
    let mounted = true
    supabase
      .from('lockers')
      .select('location_name, address, lat, lng')
      .eq('id', lockerId)
      .maybeSingle()
      .then(({ data, error }: { data: any; error: any }) => {
        if (!mounted) return
        if (error) { if (__DEV__) console.warn('[booking] locker fetch failed:', error.message); return }
        if (data) setLocker(data)
      })
    return () => { mounted = false }
  }, [booking?.locker_id, supabase])

  // Feature flag gate — allow lending bookings even when PAYMENTS is off
  useEffect(() => {
    if (!FEATURES.PAYMENTS && !FEATURES.LENDING) {
      router.replace('/(tabs)')
    }
  }, [router])

  useEffect(() => {
    setFetchError(false)
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
            deposit_amount, deposit_status, deposit_captured_amount,
            return_record, lender_review_at, borrower_review_at,
            pickup_method, pickup_state, hub_id,
            locker_id, locker_provider,
            locker_pickup_pin, locker_pickup_pin_expires_at,
            locker_dropoff_pin, locker_dropoff_pin_expires_at,
            post:posts!rental_bookings_post_id_fkey(id, title, image_url, pre_return_checklist),
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
            deposit_amount: r.deposit_amount ?? null,
            deposit_status: r.deposit_status ?? null,
            pickup_method: r.pickup_method ?? null,
            pickup_state: r.pickup_state ?? null,
            hub_id: r.hub_id ?? null,
            locker_id: r.locker_id ?? null,
            locker_provider: r.locker_provider ?? null,
            locker_pickup_pin: r.locker_pickup_pin ?? null,
            locker_pickup_pin_expires_at: r.locker_pickup_pin_expires_at ?? null,
            locker_dropoff_pin: r.locker_dropoff_pin ?? null,
            locker_dropoff_pin_expires_at: r.locker_dropoff_pin_expires_at ?? null,
            deposit_captured_amount: r.deposit_captured_amount ?? null,
            return_record: r.return_record ?? null,
            lender_review_at: r.lender_review_at ?? null,
            borrower_review_at: r.borrower_review_at ?? null,
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
        setFetchError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, supabase, retryKey])

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
      toast.show({ message: t('messages.sendFailed') ?? 'Could not start conversation', type: 'error' })
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
      // Slice 2/3: when the lender confirms a hub or gardi rental, kick the
      // pickup micro-state into 'awaiting_lender_dropoff' so the next button
      // they see is "Vahvista jätetty hubiin/lokeroon".
      if (
        newStatus === 'confirmed' &&
        booking.type === 'rental' &&
        (booking.pickup_method === 'hub' || booking.pickup_method === 'gardi')
      ) {
        updateData.pickup_state = 'awaiting_lender_dropoff'
      }
      const { error } = await (supabase.from(table) as any).update(updateData).eq('id', booking.id)
      if (error) {
        toast.show({ message: mapErrorToFinnish(error, t), type: 'error' })
      } else {
        setBooking(prev => prev ? {
          ...prev,
          status: newStatus,
          ...(updateData.pickup_state ? { pickup_state: updateData.pickup_state } : {}),
        } : prev)
      }
    } catch (err) {
      toast.show({ message: mapErrorToFinnish(err, t), type: 'error' })
    } finally {
      setActionLoading(false)
      updatingRef.current = false
    }
  }, [booking, supabase, t, userId, toast])

  const handleConfirm = useCallback(() => updateBookingStatus('confirmed'), [updateBookingStatus])

  // Slice 2/3 helper: advance the physical-handoff micro-state.
  // alsoSetStatus lets us bundle status changes with state changes (e.g.
  // borrower picks up → pickup_state='in_use' AND status='active').
  const updatePickupState = useCallback(async (newState: string, alsoSetStatus?: BookingStatus) => {
    if (!booking || !userId) return
    if (updatingRef.current) return
    updatingRef.current = true
    setActionLoading(true)
    try {
      const updateData: any = { pickup_state: newState }
      if (alsoSetStatus) updateData.status = alsoSetStatus
      if (alsoSetStatus === 'completed') updateData.completed_at = new Date().toISOString()
      const { error } = await (supabase.from('rental_bookings') as any).update(updateData).eq('id', booking.id)
      if (error) {
        toast.show({ message: mapErrorToFinnish(error, t), type: 'error' })
      } else {
        setBooking(prev => prev ? { ...prev, pickup_state: newState, ...(alsoSetStatus ? { status: alsoSetStatus } : {}) } : prev)
      }
    } catch (err) {
      toast.show({ message: mapErrorToFinnish(err, t), type: 'error' })
    } finally {
      setActionLoading(false)
      updatingRef.current = false
    }
  }, [booking, supabase, t, userId, toast])

  const handleConfirmDropoff = useCallback(
    () => updatePickupState('awaiting_borrower_pickup'),
    [updatePickupState],
  )
  const handleConfirmPickup = useCallback(
    () => updatePickupState('in_use', 'active'),
    [updatePickupState],
  )
  const handleConfirmReturnDropoff = useCallback(
    () => updatePickupState('awaiting_lender_collection'),
    [updatePickupState],
  )
  const handleConfirmCollect = useCallback(
    () => updatePickupState('completed_pickup_flow', 'completed'),
    [updatePickupState],
  )
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
      toast.show({ message: t('reviews.submitted') ?? t('common.success'), type: 'success' })
      safeBack(router, '/bookings')
    } catch {
      toast.show({ message: t('common.error'), type: 'error' })
    } finally {
      setActionLoading(false)
    }
  }, [booking, userId, reviewStars, reviewComment, reviewTags, supabase, t, toast, router])

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
        <BookingDetailSkeleton />
      </View>
    )
  }

  // ─── Not found ───
  if (!booking) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <BarHeader colors={colors} t={t} insets={insets} router={router} />
        {fetchError && (
          <PressableOpacity
            onPress={() => { setFetchError(false); setLoading(true); setRetryKey(k => k + 1) }}
            style={[s.errorBanner, { backgroundColor: colors.destructive + '18' }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry') ?? 'Yritä uudelleen'}
          >
            <RefreshCw size={16} color={colors.destructive} />
            <Text style={[s.errorBannerText, { color: colors.destructive }]}>
              {t('common.loadError') ?? 'Latausvirhe — napauta yrittääksesi uudelleen'}
            </Text>
          </PressableOpacity>
        )}
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
          {/* Lifecycle stepper */}
          <BookingLifecycleStepper booking={booking} colors={colors} isDark={isDark} t={t} />

          {/* Hero — waiting */}
          <View style={s.heroCenter}>
            <View style={[s.heroCircle, { backgroundColor: colors.muted }]}>
              <ActivityIndicator size="small" color={colors.foreground} />
            </View>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
              {t('booking.waitingConfirmation')}
            </Text>
            <Text style={[s.heroHeadline, { color: colors.foreground }]} accessibilityRole="header">
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
          {/* Lifecycle stepper */}
          <BookingLifecycleStepper booking={booking} colors={colors} isDark={isDark} t={t} />

          {/* Hero — confirmed checkmark */}
          <View style={s.heroCenter}>
            <View style={[s.heroCircle, { backgroundColor: colors.foreground }]}>
              <Check size={32} color={colors.primaryForeground} strokeWidth={2.5} />
            </View>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
              {t('booking.approved', { name: otherName })}
            </Text>
            <Text style={[s.heroHeadline, { color: colors.foreground }]} accessibilityRole="header">
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
                <Text style={[s.ribbonSubtitle, { color: colors.onInkMuted }]}>
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
          {/* Lifecycle stepper */}
          <BookingLifecycleStepper booking={booking} colors={colors} isDark={isDark} t={t} />

          {/* Status banner with progress bar */}
          <StatusBanner
            eyebrow={t('booking.inProgress') ?? 'KÄYNNISSÄ'}
            title={booking.end_date
              ? (t('booking.returnIn', { days: Math.max(0, totalDays - elapsedDays).toString() }) ?? '')
              : (t('booking.activeTitle') ?? '')}
            progress={totalDays > 0 ? progressPct : undefined}
            meta={totalDays > 0
              ? t('booking.daysProgress', { current: elapsedDays.toString(), total: totalDays.toString() })
              : undefined}
          />

          {/* Deposit chip — hidden when no deposit / already released */}
          <DepositChip
            status={booking.deposit_status}
            amount={booking.deposit_amount ?? null}
            capturedAmount={booking.deposit_captured_amount ?? null}
          />

          {/* Hub handoff card — only when pickup_method='hub'. The eyebrow
              follows pickup_state + the viewer's role so each side sees the
              right call-to-action. Address bookings render nothing here. */}
          {booking.pickup_method === 'hub' && hub && (
            <HubHandoffCard
              name={hub.name}
              address={hub.address ?? undefined}
              hours={hub.type ?? undefined}
              eyebrow={hubEyebrowFor(booking.pickup_state, booking.my_role, t)}
              caption={hubCaptionFor(booking.pickup_state, booking.my_role, t)}
              lat={hub.lat}
              lng={hub.lng}
            />
          )}

          {/* Locker PIN card — only when pickup_method='gardi'. The PIN
              the user reads off this card depends on whose turn it is:
              lender at dropoff or collection sees the dropoff PIN, borrower
              at pickup or return sees the pickup PIN. Renders in the locked
              state when the relevant PIN hasn't been issued yet. */}
          {booking.pickup_method === 'gardi' && locker && (() => {
            const pinSpec = lockerPinFor(booking, locker.location_name, t)
            return (
              <LockerPinCard
                label={pinSpec.label}
                pin={pinSpec.pin}
                locker={pinSpec.lockerLine}
                validity={pinSpec.validity}
                locked={pinSpec.locked}
              />
            )
          })()}

          {/* Item snapshot */}
          <ItemSummaryCard booking={booking} colors={colors} t={t} locale={locale} router={router} compact />

          {/* Pre-return checklist — driven by post.pre_return_checklist.
              Hidden if the listing has no checklist defined. Toggles are
              local-only on this screen; persistence happens at Return submit. */}
          {isRental && (booking.post?.pre_return_checklist?.length ?? 0) > 0 && (
            <>
              <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
                {t('booking.beforeReturn')}
              </Text>
              <PreReturnChecklist
                items={(booking.post?.pre_return_checklist ?? []) as ChecklistItem[]}
                value={preReturnChecks}
                onChange={setPreReturnChecks}
              />
            </>
          )}

          {/* Price breakdown */}
          <PriceBreakdownCard basePrice={basePrice} serviceFee={booking.service_fee} total={booking.total_amount} isService={!isRental} colors={colors} t={t} locale={locale} />

          {/* Action buttons */}
          <View style={s.actionsContainer}>
            {/* Slice 2/3: hub / gardi-specific micro-state advance buttons.
                Each one is shown only when it's that side's turn and the
                booking is using a non-address pickup method. The whole
                block is hidden for address-flow bookings, so the legacy
                "return item" CTA below stays the only call-to-action there. */}
            {isRental && (booking.pickup_method === 'hub' || booking.pickup_method === 'gardi') && (
              <>
                {/* Lender drops the item at hub/locker */}
                {booking.my_role === 'lender' && booking.pickup_state === 'awaiting_lender_dropoff' && (
                  <PressableOpacity
                    onPress={handleConfirmDropoff}
                    disabled={actionLoading}
                    style={[s.actionBtnPrimary, { backgroundColor: colors.foreground }]}
                    accessibilityRole="button"
                  >
                    {actionLoading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : (
                      <Text style={[s.actionBtnText, { color: colors.primaryForeground }]}>
                        {booking.pickup_method === 'hub'
                          ? (t('hub.confirmDropoff') ?? 'Vahvista jätetty hubiin')
                          : (t('locker.confirmDropoff') ?? 'Vahvista jätetty lokeroon')}
                      </Text>
                    )}
                  </PressableOpacity>
                )}
                {/* Borrower picks up from hub/locker */}
                {booking.my_role === 'borrower' && booking.pickup_state === 'awaiting_borrower_pickup' && (
                  <PressableOpacity
                    onPress={handleConfirmPickup}
                    disabled={actionLoading}
                    style={[s.actionBtnPrimary, { backgroundColor: colors.foreground }]}
                    accessibilityRole="button"
                  >
                    {actionLoading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : (
                      <Text style={[s.actionBtnText, { color: colors.primaryForeground }]}>
                        {booking.pickup_method === 'hub'
                          ? (t('hub.confirmPickup') ?? 'Vahvista nouto hubista')
                          : (t('locker.confirmPickup') ?? 'Vahvista nouto lokerosta')}
                      </Text>
                    )}
                  </PressableOpacity>
                )}
                {/* Borrower returns the item to hub/locker */}
                {booking.my_role === 'borrower' && booking.pickup_state === 'awaiting_borrower_return' && (
                  <PressableOpacity
                    onPress={handleConfirmReturnDropoff}
                    disabled={actionLoading}
                    style={[s.actionBtnPrimary, { backgroundColor: colors.foreground }]}
                    accessibilityRole="button"
                  >
                    {actionLoading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : (
                      <Text style={[s.actionBtnText, { color: colors.primaryForeground }]}>
                        {booking.pickup_method === 'hub'
                          ? (t('hub.confirmReturn') ?? 'Vahvista palautus hubiin')
                          : (t('locker.confirmReturn') ?? 'Vahvista palautus lokeroon')}
                      </Text>
                    )}
                  </PressableOpacity>
                )}
                {/* Lender collects the returned item from hub/locker */}
                {booking.my_role === 'lender' && booking.pickup_state === 'awaiting_lender_collection' && (
                  <PressableOpacity
                    onPress={handleConfirmCollect}
                    disabled={actionLoading}
                    style={[s.actionBtnPrimary, { backgroundColor: colors.foreground }]}
                    accessibilityRole="button"
                  >
                    {actionLoading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : (
                      <Text style={[s.actionBtnText, { color: colors.primaryForeground }]}>
                        {booking.pickup_method === 'hub'
                          ? (t('hub.confirmCollect') ?? 'Vahvista nouto hubista')
                          : (t('locker.confirmCollect') ?? 'Vahvista nouto lokerosta')}
                      </Text>
                    )}
                  </PressableOpacity>
                )}
              </>
            )}

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

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[s.scrollPadded, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false} keyboardDismissMode="interactive">
          {/* Lifecycle stepper */}
          <BookingLifecycleStepper booking={booking} colors={colors} isDark={isDark} t={t} />

          {/* Hero — avatar + prompt */}
          <View style={s.heroCenter}>
            {booking.other_user && (
              <View style={[s.reviewAvatarRing, { borderColor: colors.card }]}>
                <Avatar url={booking.other_user.avatar_url} name={booking.other_user.name} size={72} />
              </View>
            )}
            <Text style={[s.heroHeadline, { color: colors.foreground, fontSize: 24 }]} accessibilityRole="header">
              {t('booking.howDidItGo', { name: otherName })}
            </Text>
            <Text style={[s.heroSubtext, { color: colors.mutedForeground }]}>
              {t('booking.reviewHelp')}
            </Text>
          </View>

          {/* Star rating */}
          <View style={s.starsRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <PressableOpacity key={n} onPress={() => setReviewStars(n)} accessibilityLabel={t('reviewBorrower.starsAccessibility', { count: n })} accessibilityRole="button">
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
        </KeyboardAvoidingView>

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
        {/* Lifecycle stepper */}
        <BookingLifecycleStepper booking={booking} colors={colors} isDark={isDark} t={t} />

        {/* Hero — cancelled */}
        <View style={s.heroCenter}>
          <View style={[s.heroCircle, { backgroundColor: `${colors.destructive}14` }]}>
            <XCircle size={32} color={colors.destructive} />
          </View>
          <Text style={[s.heroHeadline, { color: colors.foreground }]} accessibilityRole="header">
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
        onPress={() => safeBack(router, '/bookings')}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        style={[s.circleBackBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <ArrowLeft size={16} color={colors.foreground} strokeWidth={2.2} />
      </PressableOpacity>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={[s.headerTitle, { color: colors.foreground }]} accessibilityRole="header">{title ?? t('booking.details')}</Text>
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
            style={{ width: imgSize, height: imgSize, borderRadius: 12 }}
            contentFit="cover"
            fallbackIcon={isService ? <ShoppingBag size={24} color={colors.mutedForeground} /> : <Package size={24} color={colors.mutedForeground} />}
          />
        ) : (
          <View style={[{ width: imgSize, height: imgSize, borderRadius: 12, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
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

// ─── Horizontal Lifecycle Stepper ───

const STEPPER_ICON_SIZE = 18

type StepperIconType = 'clock' | 'check' | 'package' | 'checkCircle'

interface StepperStepDef {
  key: BookingStatus
  labelKey: string
  iconType: StepperIconType
}

const RENTAL_STEPPER_STEPS: StepperStepDef[] = [
  { key: 'pending', labelKey: 'booking.stepPending', iconType: 'clock' },
  { key: 'confirmed', labelKey: 'booking.stepConfirmed', iconType: 'check' },
  { key: 'active', labelKey: 'booking.stepPickedUp', iconType: 'package' },
  { key: 'completed', labelKey: 'booking.stepReturned', iconType: 'checkCircle' },
]

const SERVICE_STEPPER_STEPS: StepperStepDef[] = [
  { key: 'pending', labelKey: 'booking.stepPending', iconType: 'clock' },
  { key: 'confirmed', labelKey: 'booking.stepConfirmed', iconType: 'check' },
  { key: 'in_progress', labelKey: 'booking.stepInProgress', iconType: 'package' },
  { key: 'completed', labelKey: 'booking.stepCompleted', iconType: 'checkCircle' },
]

function StepperIcon({ type, color, size }: { type: StepperIconType; color: string; size: number }) {
  switch (type) {
    case 'clock': return <Clock size={size} color={color} />
    case 'check': return <Check size={size} color={color} />
    case 'package': return <Package size={size} color={color} />
    case 'checkCircle': return <CheckCircle size={size} color={color} />
  }
}

function mapStatusToStepperIndex(status: BookingStatus, isRental: boolean): number {
  if (isRental) {
    const map: Partial<Record<BookingStatus, number>> = { pending: 0, paid: 0, confirmed: 1, active: 2, completed: 3 }
    return map[status] ?? -1
  }
  const map: Partial<Record<BookingStatus, number>> = { pending: 0, paid: 0, confirmed: 1, in_progress: 2, completed: 3 }
  return map[status] ?? -1
}

function BookingLifecycleStepper({ booking, colors, isDark, t }: {
  booking: BookingData; colors: any; isDark: boolean; t: any
}) {
  const isCancelled = ['cancelled', 'disputed', 'refunded'].includes(booking.status)
  const isRental = booking.type === 'rental'
  const currentIdx = mapStatusToStepperIndex(booking.status, isRental)

  const doneColor = colors.accent ?? '#4CAF6A'
  const currentColor = colors.primary
  const futureColor = colors.border
  const cancelledColor = colors.destructive

  const stepDefs = isRental ? RENTAL_STEPPER_STEPS : SERVICE_STEPPER_STEPS

  return (
    <View style={[stepperStyles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {isCancelled && (
        <View style={stepperStyles.cancelledBanner}>
          <XCircle size={14} color={cancelledColor} />
          <Text style={[stepperStyles.cancelledText, { color: cancelledColor }]}>
            {t('booking.cancelledTitle')}
          </Text>
        </View>
      )}
      <View style={stepperStyles.row}>
        {stepDefs.map((step, i) => {
          const done = !isCancelled && currentIdx > i
          const current = !isCancelled && currentIdx === i

          const iconColor = isCancelled
            ? futureColor
            : (done || current)
              ? colors.primaryForeground
              : futureColor

          const circleBg = isCancelled
            ? 'transparent'
            : done ? doneColor : current ? currentColor : 'transparent'

          const circleBorder = isCancelled
            ? futureColor
            : done ? doneColor : current ? currentColor : futureColor

          const connectorColor = isCancelled
            ? futureColor
            : done ? doneColor : current ? currentColor : futureColor

          const labelColor = isCancelled
            ? futureColor
            : done ? doneColor : current ? currentColor : futureColor

          return (
            <View key={step.key} style={stepperStyles.stepContainer}>
              {/* Connector line before this step */}
              {i > 0 && (
                <View style={[stepperStyles.connector, { backgroundColor: connectorColor }]} />
              )}
              {/* Icon circle */}
              <View style={[
                stepperStyles.iconCircle,
                { backgroundColor: circleBg, borderColor: circleBorder },
              ]}>
                <StepperIcon type={step.iconType} color={iconColor} size={STEPPER_ICON_SIZE} />
              </View>
              {/* Label */}
              <Text style={[
                stepperStyles.label,
                { color: labelColor, fontFamily: current ? fonts.bodySemi : fonts.body },
              ]} numberOfLines={1}>
                {t(step.labelKey)}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const stepperStyles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  cancelledText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stepContainer: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    top: 17,
    right: '50%',
    width: '100%',
    height: 2,
    borderRadius: 1,
    zIndex: -1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: -0.1,
    lineHeight: 16,
  },
})

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
    fontSize: 12,
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
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
  },

  // Section labels
  sectionLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    marginBottom: 8,
  },

  // Card
  card: {
    borderRadius: 16,
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
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.1,
  },
  itemMeta: {
    fontSize: 12,
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
    fontSize: 12,
    fontFamily: fonts.body,
  },
  dateValueBold: {
    fontSize: 16,
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
    borderRadius: 16,
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
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  ribbonSubtitle: {
    fontSize: 12,
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
    borderRadius: 8,
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
    fontSize: 13,
  },

  // Review avatar
  reviewAvatarRing: {
    borderWidth: 3,
    borderRadius: 999,
    marginBottom: 14,
  },

  // Comment input
  commentInput: {
    fontSize: 14,
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
  timelineLabel: { fontSize: 14, fontFamily: fonts.body, lineHeight: 18, letterSpacing: -0.1 },

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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 8,
  },
  stickyCtaText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.1,
  },

  // Error banner
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  errorBannerText: { fontSize: 13, fontFamily: fonts.body, flex: 1 },
})

export default function BookingDetailScreen() {
  return (
    <ScreenErrorBoundary screenName="BookingDetail">
      <BookingDetailScreenInner />
    </ScreenErrorBoundary>
  )
}
