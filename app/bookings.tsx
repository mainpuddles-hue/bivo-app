declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, SectionList, RefreshControl, StyleSheet, Alert, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import { ArrowLeft, Package, ShoppingBag, RefreshCw } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { EmptyState } from '@/components/EmptyState'
import { useShimmer } from '@/components/SkeletonLoaders'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { formatPrice } from '@/lib/format'
import { isValidUUID } from '@/lib/validation'
import { FEATURES } from '@/lib/featureFlags'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { getCachedUserId } from '@/lib/authCache'
import { useToast } from '@/components/Toast'

function BookingCardSkeleton() {
  const { colors } = useTheme()
  const opacity = useShimmer()
  return (
    <View style={[styles.loanCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Animated.View style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: colors.muted, opacity }} />
      <View style={{ flex: 1, gap: 6 }}>
        <Animated.View style={{ width: '65%', height: 14, borderRadius: 6, backgroundColor: colors.muted, opacity }} />
        <Animated.View style={{ width: '45%', height: 10, borderRadius: 6, backgroundColor: colors.muted, opacity }} />
        <Animated.View style={{ width: '35%', height: 10, borderRadius: 6, backgroundColor: colors.muted, opacity }} />
      </View>
      <Animated.View style={{ width: 54, height: 20, borderRadius: 999, backgroundColor: colors.muted, opacity }} />
    </View>
  )
}

type BookingStatus = 'pending' | 'confirmed' | 'paid' | 'active' | 'in_progress' | 'completed' | 'cancelled' | 'disputed' | 'refunded'
type StatusTab = 'running' | 'requests' | 'upcoming' | 'past'

interface RentalBooking {
  id: string
  post_id: string
  borrower_id: string
  lender_id: string
  start_date: string
  end_date: string
  daily_fee: number
  service_fee: number
  total_amount: number
  status: BookingStatus
  stripe_session_id: string | null
  created_at: string
  post?: {
    id: string
    title: string
    image_url: string | null
  }
  borrower?: {
    id: string
    name: string
    avatar_url: string | null
  }
  lender?: {
    id: string
    name: string
    avatar_url: string | null
  }
}

const VALID_BOOKING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'paid', 'active', 'in_progress', 'completed', 'cancelled', 'disputed', 'refunded']

function isBookingStatus(s: string): s is BookingStatus {
  return VALID_BOOKING_STATUSES.includes(s as BookingStatus)
}

const STATUS_KEYS: Record<BookingStatus, string> = {
  pending: 'rental.statusPending',
  confirmed: 'rental.statusConfirmed',
  paid: 'rental.statusPaid',
  active: 'rental.statusActive',
  in_progress: 'service.statusInProgress',
  completed: 'rental.statusCompleted',
  cancelled: 'rental.statusCancelled',
  disputed: 'rental.statusDisputed',
  refunded: 'rental.statusRefunded',
}

// Status groupings for segment tabs
const RUNNING_STATUSES: BookingStatus[] = ['active', 'in_progress']
const REQUEST_STATUSES: BookingStatus[] = ['pending']
const UPCOMING_STATUSES: BookingStatus[] = ['confirmed', 'paid']
const PAST_STATUSES: BookingStatus[] = ['completed', 'cancelled', 'disputed', 'refunded']

function getStatusStyle(status: BookingStatus, colors: ReturnType<typeof useTheme>['colors']): { bg: string; text: string } {
  switch (status) {
    case 'active': case 'in_progress':
      return { bg: colors.foreground, text: colors.primaryForeground }
    case 'completed':
      return { bg: colors.muted, text: colors.foreground }
    case 'cancelled': case 'disputed':
      return { bg: `${colors.destructive}14`, text: colors.destructive }
    case 'refunded':
      return { bg: colors.muted, text: colors.mutedForeground }
    case 'confirmed': case 'paid':
      return { bg: colors.card, text: colors.foreground }
    case 'pending':
    default:
      return { bg: colors.muted, text: colors.foreground }
  }
}

function formatShortDate(dateStr: string, locale: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString(locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB', {
      weekday: 'short', day: 'numeric', month: 'numeric',
    })
  } catch { return dateStr }
}

function getTimeLabel(booking: RentalBooking, locale: string, t: (k: string, p?: any) => string): string {
  const s = booking.status
  if (s === 'active' || s === 'in_progress') {
    return t('bookings.returnBy', { date: formatShortDate(booking.end_date, locale) })
  }
  if (s === 'pending') {
    return t('bookings.requestAt', { date: formatShortDate(booking.created_at, locale) })
  }
  if (s === 'confirmed' || s === 'paid') {
    return t('bookings.pickupAt', { date: formatShortDate(booking.start_date, locale) })
  }
  return formatShortDate(booking.created_at, locale)
}

// Section builder: group bookings by status category
interface BookingSection {
  title: string
  data: RentalBooking[]
}

function BookingsScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [userId, setUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'borrower' | 'lender' | 'services'>('borrower')
  const [statusTab, setStatusTab] = useState<StatusTab>('running')
  const [bookings, setBookings] = useState<RentalBooking[]>([])
  const [serviceBookings, setServiceBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  // Feature flag gate
  useEffect(() => {
    if (!FEATURES.PAYMENTS) { router.replace('/(tabs)') }
  }, [router])

  // Auth gate
  useEffect(() => {
    let mounted = true
    async function checkAuth() {
      const cachedId = await getCachedUserId()
      if (!mounted) return
      if (!cachedId) { router.replace('/(auth)/login') }
    }
    checkAuth()
    return () => { mounted = false }
  }, [router])

  const fetchBookings = useCallback(async () => {
    setFetchError(false)
    try {
      const cachedId = await getCachedUserId()
      if (!cachedId) { setLoading(false); return }
      setUserId(cachedId)
      if (!isValidUUID(cachedId)) { setLoading(false); return }

      const { data, error } = await supabase
        .from('rental_bookings')
        .select(`
          id, post_id, borrower_id, lender_id, start_date, end_date,
          daily_fee, service_fee, total_amount, status, stripe_session_id, created_at,
          post:posts!rental_bookings_post_id_fkey(id, title, image_url),
          borrower:profiles!rental_bookings_borrower_id_fkey(id, name, avatar_url),
          lender:profiles!rental_bookings_lender_id_fkey(id, name, avatar_url)
        `)
        .or(`borrower_id.eq.${cachedId},lender_id.eq.${cachedId}`)
        .order('created_at', { ascending: false })

      if (error) {
        if (__DEV__) console.log('[bookings] error:', error.message)
        setFetchError(true)
        setBookings([])
      } else {
        setBookings((data ?? []) as unknown as RentalBooking[])
      }

      const { data: svcData, error: svcError } = await supabase
        .from('service_bookings')
        .select(`
          id, post_id, buyer_id, provider_id, service_price, service_fee,
          total_amount, notes, status, stripe_session_id, completed_at, created_at,
          post:posts!service_bookings_post_id_fkey(id, title, image_url),
          buyer:profiles!service_bookings_buyer_id_fkey(id, name, avatar_url),
          provider:profiles!service_bookings_provider_id_fkey(id, name, avatar_url)
        `)
        .or(`buyer_id.eq.${cachedId},provider_id.eq.${cachedId}`)
        .order('created_at', { ascending: false })
      if (svcError && __DEV__) console.log('[bookings] service error:', svcError.message)
      setServiceBookings((svcData ?? []) as any[])
    } catch (err) {
      if (__DEV__) console.log('[bookings] fetchBookings error:', err)
      setBookings([])
      setServiceBookings([])
      setFetchError(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase])

  useFocusEffect(useCallback(() => { fetchBookings() }, [fetchBookings]))

  // Role-filtered bookings
  const roleBookings = useMemo(() => {
    if (!userId) return []
    return activeTab === 'borrower'
      ? bookings.filter(b => b.borrower_id === userId)
      : activeTab === 'lender'
        ? bookings.filter(b => b.lender_id === userId)
        : []
  }, [bookings, userId, activeTab])

  // Service bookings for service tab
  const roleServiceBookings = useMemo(() => {
    if (activeTab !== 'services') return []
    return serviceBookings
  }, [serviceBookings, activeTab])

  // Counts for segment tabs
  const counts = useMemo(() => {
    const src = activeTab === 'services'
      ? roleServiceBookings.map(b => ({ status: (isBookingStatus(b.status) ? b.status : 'pending') as BookingStatus }))
      : roleBookings
    return {
      running: src.filter(b => RUNNING_STATUSES.includes(b.status)).length,
      requests: src.filter(b => REQUEST_STATUSES.includes(b.status)).length,
      upcoming: src.filter(b => UPCOMING_STATUSES.includes(b.status)).length,
      past: src.filter(b => PAST_STATUSES.includes(b.status)).length,
    }
  }, [roleBookings, roleServiceBookings, activeTab])

  // Build sections for SectionList based on active status tab
  const sections = useMemo((): BookingSection[] => {
    const src = activeTab === 'services'
      ? roleServiceBookings as unknown as RentalBooking[]
      : roleBookings

    if (statusTab === 'running') {
      const running = src.filter(b => RUNNING_STATUSES.includes(b.status))
      const requests = src.filter(b => REQUEST_STATUSES.includes(b.status))
      const upcoming = src.filter(b => UPCOMING_STATUSES.includes(b.status))
      const result: BookingSection[] = []
      if (running.length > 0) result.push({ title: t('bookings.running'), data: running })
      if (requests.length > 0) result.push({ title: t('bookings.waitingResponse'), data: requests })
      if (upcoming.length > 0) result.push({ title: t('bookings.upcoming'), data: upcoming })
      return result
    }
    if (statusTab === 'requests') {
      const items = src.filter(b => REQUEST_STATUSES.includes(b.status))
      return items.length > 0 ? [{ title: t('bookings.requests'), data: items }] : []
    }
    if (statusTab === 'upcoming') {
      const items = src.filter(b => UPCOMING_STATUSES.includes(b.status))
      return items.length > 0 ? [{ title: t('bookings.upcoming'), data: items }] : []
    }
    // past
    const items = src.filter(b => PAST_STATUSES.includes(b.status))
    return items.length > 0 ? [{ title: t('bookings.past'), data: items }] : []
  }, [roleBookings, roleServiceBookings, statusTab, activeTab, t])

  // Counts for role tabs
  const borrowerCount = useMemo(() => bookings.filter(b => b.borrower_id === userId).length, [bookings, userId])
  const lenderCount = useMemo(() => bookings.filter(b => b.lender_id === userId).length, [bookings, userId])
  const serviceCount = useMemo(() => serviceBookings.length, [serviceBookings])

  // Role tab config
  const ROLE_TABS: { key: 'borrower' | 'lender' | 'services'; label: string; count: number }[] = [
    { key: 'borrower', label: t('rental.myRentals'), count: borrowerCount },
    { key: 'lender', label: t('rental.lendingOut'), count: lenderCount },
    { key: 'services', label: t('service.services'), count: serviceCount },
  ]

  // Status segment tabs
  const STATUS_TABS: { key: StatusTab; label: string; count: number }[] = [
    { key: 'running', label: t('bookings.running'), count: counts.running },
    { key: 'requests', label: t('bookings.requests'), count: counts.requests },
    { key: 'upcoming', label: t('bookings.upcoming'), count: counts.upcoming },
    { key: 'past', label: t('bookings.past'), count: counts.past },
  ]

  const renderSectionHeader = useCallback(({ section }: { section: BookingSection }) => (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{section.title}</Text>
    </View>
  ), [colors])

  const renderItem = useCallback(({ item }: { item: RentalBooking }) => {
    const statusStyle = getStatusStyle(item.status, colors)
    const otherUser = activeTab === 'borrower'
      ? item.lender
      : activeTab === 'lender'
        ? item.borrower
        : (item as any).buyer_id === userId ? (item as any).provider : (item as any).buyer
    const otherName = otherUser?.name ?? ''
    const timeLabel = getTimeLabel(item, locale, t)

    return (
      <PressableOpacity
        onPress={() => router.push(`/booking/${item.id}` as any)}
        accessibilityRole="button"
        accessibilityLabel={item.post?.title ?? t('rental.deletedPost')}
        style={[styles.loanCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <ImageWithFallback
          uri={item.post?.image_url}
          style={styles.loanImage}
          contentFit="cover"
          fallbackIcon={
            activeTab === 'services'
              ? <ShoppingBag size={22} color={colors.mutedForeground} />
              : <Package size={22} color={colors.mutedForeground} />
          }
        />
        <View style={styles.loanInfo}>
          <Text style={[styles.loanTitle, { color: colors.foreground }]} numberOfLines={2}>
            {item.post?.title ?? t('rental.deletedPost')}
          </Text>
          <Text style={[styles.loanSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {otherName ? `${otherName}` : ''}
          </Text>
          <Text style={[styles.loanTime, { color: colors.foreground }]} numberOfLines={1}>
            {timeLabel}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {t(STATUS_KEYS[isBookingStatus(item.status) ? item.status : 'pending'])}
          </Text>
        </View>
      </PressableOpacity>
    )
  }, [colors, activeTab, userId, router, t, locale])

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[styles.circleBackBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={20} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('bookings.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Role tabs — pill chips */}
      <View style={styles.roleTabRow}>
        {ROLE_TABS.map(tab => {
          const isActive = activeTab === tab.key
          return (
            <PressableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[
                styles.roleChip,
                isActive
                  ? { backgroundColor: colors.foreground }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.roleChipText, { color: isActive ? colors.primaryForeground : colors.mutedForeground }]}>
                {tab.label} ({tab.count})
              </Text>
            </PressableOpacity>
          )
        })}
      </View>

      {/* Status segment control — matches mockup 26 */}
      <View style={styles.segmentWrap}>
        <View style={[styles.segmentContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
          {STATUS_TABS.map(tab => {
            const isActive = statusTab === tab.key
            return (
              <PressableOpacity
                key={tab.key}
                onPress={() => setStatusTab(tab.key)}
                style={[
                  styles.segmentTab,
                  isActive && [styles.segmentTabActive, {
                    backgroundColor: colors.card,
                    shadowColor: '#000',
                    shadowOpacity: 0.06,
                    shadowOffset: { width: 0, height: 1 },
                    shadowRadius: 3,
                  }],
                ]}
              >
                <Text style={[styles.segmentLabel, { color: isActive ? colors.foreground : colors.mutedForeground }]}>
                  {tab.label}{' '}
                </Text>
                <Text style={[styles.segmentCount, { color: colors.tertiaryForeground }]}>
                  {tab.count}
                </Text>
              </PressableOpacity>
            )
          })}
        </View>
      </View>

      {/* Error banner */}
      {fetchError && !loading && (
        <PressableOpacity
          onPress={() => { setRefreshing(true); fetchBookings() }}
          style={[styles.errorBanner, { backgroundColor: `${colors.destructive}10` }]}
          accessibilityRole="button"
        >
          <RefreshCw size={14} color={colors.destructive} />
          <Text style={[styles.errorBannerText, { color: colors.destructive }]}>{t('common.loadError')}</Text>
        </PressableOpacity>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.skeletonWrap}>
          <BookingCardSkeleton />
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchBookings() }}
              tintColor={colors.foreground}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={activeTab === 'services'
                ? <ShoppingBag size={36} color={colors.mutedForeground} />
                : <Package size={36} color={colors.mutedForeground} />
              }
              title={activeTab === 'services' ? t('service.noBookings') : t('rental.noBookings')}
              description={activeTab === 'services' ? t('service.noBookingsHint') : activeTab === 'borrower' ? t('rental.noBookingsHint') : t('rental.noLendingHint')}
            />
          }
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      )}
    </View>
  )
}

export default function BookingsScreen() {
  return (
    <ScreenErrorBoundary screenName="Bookings">
      <BookingsScreenInner />
    </ScreenErrorBoundary>
  )
}

const styles = StyleSheet.create({
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
  },
  headerTitle: {
    flex: 1,
    fontSize: 14,
    letterSpacing: -0.2,
    fontFamily: fonts.headingSemi,
    lineHeight: 24,
    textAlign: 'center',
  },
  headerSpacer: { width: 36 },

  // Role tab chips
  roleTabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleChipText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },

  // Segment control — mockup 26 style
  segmentWrap: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
  },
  segmentTabActive: {
    elevation: 1,
  },
  segmentLabel: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  segmentCount: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    lineHeight: 16,
  },

  // Section headers — uppercase muted labels
  sectionHeader: {
    paddingTop: 4,
    paddingBottom: 6,
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  skeletonWrap: {
    padding: 16,
    gap: 10,
  },

  // Loan card — mockup 26 style
  loanCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  loanImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
  },
  loanInfo: {
    flex: 1,
    gap: 3,
  },
  loanTitle: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  loanSub: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  loanTime: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
    marginTop: 3,
  },

  // Status badge pill
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    lineHeight: 16,
  },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    padding: 12,
    borderRadius: 20,
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    flex: 1,
  },
})
