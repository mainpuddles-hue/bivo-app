declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { ArrowLeft, Package, CheckCircle, XCircle, RotateCcw, Star, Calendar, ShoppingBag } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { createClient } from '@/lib/supabase/client'
import { formatPrice, formatDateRange } from '@/lib/format'

const TARJOAN_COLOR = '#7C5CBF'

type BookingStatus = 'pending' | 'confirmed' | 'paid' | 'active' | 'completed' | 'cancelled' | 'disputed' | 'refunded'

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

const VALID_BOOKING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'paid', 'active', 'completed', 'cancelled', 'disputed', 'refunded']

function isBookingStatus(s: string): s is BookingStatus {
  return VALID_BOOKING_STATUSES.includes(s as BookingStatus)
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
}

function getStatusColor(status: BookingStatus, colors: ReturnType<typeof useTheme>['colors']): string {
  switch (status) {
    case 'pending': return colors.pro
    case 'confirmed': case 'paid': return colors.info
    case 'active': return colors.primary
    case 'completed': return colors.success
    case 'cancelled': return colors.destructive
    case 'disputed': return '#E8A050'
    case 'refunded': return colors.mutedForeground
    default: return colors.mutedForeground
  }
}


export default function BookingsScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [userId, setUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'borrower' | 'lender' | 'services'>('borrower')
  const [bookings, setBookings] = useState<RentalBooking[]>([])
  const [serviceBookings, setServiceBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchBookings = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)

      const { data, error } = await supabase
        .from('rental_bookings')
        .select(`
          id, post_id, borrower_id, lender_id, start_date, end_date,
          daily_fee, service_fee, total_amount, status, stripe_session_id, created_at,
          post:posts!rental_bookings_post_id_fkey(id, title, image_url),
          borrower:profiles!rental_bookings_borrower_id_fkey(id, name, avatar_url),
          lender:profiles!rental_bookings_lender_id_fkey(id, name, avatar_url)
        `)
        .or(`borrower_id.eq.${user.id},lender_id.eq.${user.id}`)
        .order('created_at', { ascending: false })

      if (error) {
        if (__DEV__) console.log('[bookings] error:', error.message)
        setBookings([])
      } else {
        setBookings((data ?? []) as unknown as RentalBooking[])
      }

      // Also fetch service bookings
      const { data: svcData, error: svcError } = await supabase
        .from('service_bookings')
        .select(`
          id, post_id, buyer_id, provider_id, service_price, service_fee,
          total_amount, notes, status, stripe_session_id, completed_at, created_at,
          post:posts!service_bookings_post_id_fkey(id, title, image_url),
          buyer:profiles!service_bookings_buyer_id_fkey(id, name, avatar_url),
          provider:profiles!service_bookings_provider_id_fkey(id, name, avatar_url)
        `)
        .or(`buyer_id.eq.${user.id},provider_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
      if (svcError) {
        if (__DEV__) console.log('[bookings] service_bookings error:', svcError.message)
      }
      setServiceBookings((svcData ?? []) as any[])
    } catch (err) {
      if (__DEV__) console.log('[bookings] fetchBookings error:', err)
      setBookings([])
      setServiceBookings([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase, t])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  const filteredBookings = useMemo(() => {
    if (!userId) return []
    if (activeTab === 'borrower') {
      return bookings.filter(b => b.borrower_id === userId)
    }
    return bookings.filter(b => b.lender_id === userId)
  }, [bookings, userId, activeTab])

  const handleConfirm = useCallback(async (booking: RentalBooking) => {
    setActionLoading(booking.id)
    const { error } = await (supabase.from('rental_bookings') as any)
      .update({ status: 'confirmed' })
      .eq('id', booking.id)
    if (error) {
      Alert.alert(t('common.error'), t('rental.confirmFailed'))
    } else {
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'confirmed' as BookingStatus } : b))
    }
    setActionLoading(null)
  }, [supabase, t])

  const handleCancel = useCallback(async (booking: RentalBooking) => {
    Alert.alert(
      t('rental.cancelBooking'),
      t('rental.bookingCancelled'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            setActionLoading(booking.id)
            const { error } = await (supabase.from('rental_bookings') as any)
              .update({ status: 'cancelled' })
              .eq('id', booking.id)
            if (error) {
              Alert.alert(t('common.error'), t('rental.cancelFailed'))
            } else {
              setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' as BookingStatus } : b))
            }
            setActionLoading(null)
          },
        },
      ],
    )
  }, [supabase, t])

  const handleMarkReturned = useCallback(async (booking: RentalBooking) => {
    setActionLoading(booking.id)
    const { error } = await (supabase.from('rental_bookings') as any)
      .update({ status: 'completed' })
      .eq('id', booking.id)
    if (error) {
      Alert.alert(t('common.error'), t('rental.completeFailed'))
    } else {
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'completed' as BookingStatus } : b))
      Alert.alert(t('common.success'), t('rental.markedReturned'))
    }
    setActionLoading(null)
  }, [supabase, t])

  const handleLeaveReview = useCallback((booking: RentalBooking) => {
    const revieweeId = activeTab === 'borrower' ? booking.lender_id : booking.borrower_id
    router.push(`/profile/${revieweeId}` as any)
  }, [activeTab, router])

  // Service booking actions
  const handleServiceConfirm = useCallback(async (booking: any) => {
    setActionLoading(booking.id)
    await (supabase.from('service_bookings') as any).update({ status: 'confirmed' }).eq('id', booking.id)
    setServiceBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'confirmed' } : b))
    setActionLoading(null)
  }, [supabase])

  const handleServiceStart = useCallback(async (booking: any) => {
    setActionLoading(booking.id)
    await (supabase.from('service_bookings') as any).update({ status: 'in_progress' }).eq('id', booking.id)
    setServiceBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'in_progress' } : b))
    setActionLoading(null)
  }, [supabase])

  const handleServiceComplete = useCallback(async (booking: any) => {
    setActionLoading(booking.id)
    await (supabase.from('service_bookings') as any).update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', booking.id)
    setServiceBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'completed' } : b))
    Alert.alert(t('common.success'), t('service.markedComplete'))
    setActionLoading(null)
  }, [supabase, t])

  const handleServiceCancel = useCallback(async (booking: any) => {
    Alert.alert(t('service.cancelBooking'), t('service.cancelConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: async () => {
        setActionLoading(booking.id)
        await (supabase.from('service_bookings') as any).update({ status: 'cancelled' }).eq('id', booking.id)
        setServiceBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b))
        setActionLoading(null)
      }},
    ])
  }, [supabase, t])

  const isActionLoading = (id: string) => actionLoading === id

  const renderBooking = ({ item }: { item: RentalBooking }) => {
    const statusColor = getStatusColor(item.status, colors)
    const otherUser = activeTab === 'borrower' ? item.lender : item.borrower
    const isLender = activeTab === 'lender'
    const canConfirm = isLender && item.status === 'pending'
    const canCancel = item.status === 'pending' || item.status === 'confirmed'
    const canMarkReturned = isLender && (item.status === 'active' || item.status === 'paid' || item.status === 'confirmed')
    const canReview = item.status === 'completed'

    return (
      <Pressable
        onPress={() => item.post?.id ? router.push(`/post/${item.post.id}` as any) : undefined}
        style={[styles.bookingCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={styles.cardTop}>
          {item.post?.image_url ? (
            <Image source={{ uri: item.post.image_url }} style={styles.itemImage} contentFit="cover" />
          ) : (
            <View style={[styles.itemImage, styles.itemImageFb, { backgroundColor: colors.muted }]}>
              <Package size={24} color={colors.mutedForeground} />
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={2}>
              {item.post?.title ?? t('rental.deletedPost')}
            </Text>
            <View style={styles.dateRow}>
              <Calendar size={13} color={colors.mutedForeground} />
              <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
                {formatDateRange(item.start_date, item.end_date, locale)}
              </Text>
            </View>
            {otherUser && (
              <View style={styles.userRow}>
                {otherUser.avatar_url ? (
                  <Image source={{ uri: otherUser.avatar_url }} style={styles.tinyAvatar} />
                ) : (
                  <View style={[styles.tinyAvatar, styles.tinyAvatarFb, { backgroundColor: colors.muted }]}>
                    <Text style={{ fontSize: 8, fontWeight: '600', color: colors.mutedForeground }}>
                      {otherUser.name?.charAt(0)?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
                <Text style={[styles.userName, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {otherUser.name}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.cardRight}>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {t(STATUS_KEYS[item.status])}
              </Text>
            </View>
            <Text style={[styles.priceText, { color: colors.primary }]}>
              {formatPrice(item.total_amount, locale)}
            </Text>
          </View>
        </View>

        {/* Action buttons */}
        {(canConfirm || canCancel || canMarkReturned || canReview) && (
          <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
            {canConfirm && (
              <Pressable
                onPress={() => handleConfirm(item)}
                disabled={isActionLoading(item.id)}
                style={[styles.actionBtn, { backgroundColor: colors.success }]}
              >
                {isActionLoading(item.id) ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle size={14} color="#FFFFFF" />
                    <Text style={styles.actionBtnText}>{t('rental.confirmBooking')}</Text>
                  </>
                )}
              </Pressable>
            )}
            {canMarkReturned && (
              <Pressable
                onPress={() => handleMarkReturned(item)}
                disabled={isActionLoading(item.id)}
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
              >
                {isActionLoading(item.id) ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <>
                    <RotateCcw size={14} color={colors.primaryForeground} />
                    <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>{t('rental.returnItem')}</Text>
                  </>
                )}
              </Pressable>
            )}
            {canCancel && (
              <Pressable
                onPress={() => handleCancel(item)}
                disabled={isActionLoading(item.id)}
                style={[styles.actionBtn, { backgroundColor: `${colors.destructive}15`, borderColor: colors.destructive, borderWidth: 1 }]}
              >
                <XCircle size={14} color={colors.destructive} />
                <Text style={[styles.actionBtnText, { color: colors.destructive }]}>{t('rental.cancelBooking')}</Text>
              </Pressable>
            )}
            {canReview && (
              <Pressable
                onPress={() => handleLeaveReview(item)}
                style={[styles.actionBtn, { backgroundColor: `${colors.pro}15`, borderColor: colors.pro, borderWidth: 1 }]}
              >
                <Star size={14} color={colors.pro} />
                <Text style={[styles.actionBtnText, { color: colors.pro }]}>{t('rental.leaveReview')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </Pressable>
    )
  }

  const borrowerCount = useMemo(() => bookings.filter(b => b.borrower_id === userId).length, [bookings, userId])
  const lenderCount = useMemo(() => bookings.filter(b => b.lender_id === userId).length, [bookings, userId])
  const serviceCount = useMemo(() => serviceBookings.length, [serviceBookings])

  const renderServiceBooking = ({ item }: { item: any }) => {
    const safeStatus: BookingStatus = isBookingStatus(item.status) ? item.status : 'pending'
    const statusColor = getStatusColor(safeStatus, colors)
    const isBuyer = item.buyer_id === userId
    const otherUser = isBuyer ? item.provider : item.buyer
    const isProvider = item.provider_id === userId
    const canConfirm = isProvider && item.status === 'paid'
    const canStart = isProvider && item.status === 'confirmed'
    const canComplete = isProvider && item.status === 'in_progress'
    const canCancel = item.status === 'pending' || item.status === 'paid' || item.status === 'confirmed'
    const canReview = item.status === 'completed'

    return (
      <Pressable
        onPress={() => item.post?.id ? router.push(`/post/${item.post.id}` as any) : undefined}
        style={[styles.bookingCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={styles.cardTop}>
          {item.post?.image_url ? (
            <Image source={{ uri: item.post.image_url }} style={styles.itemImage} contentFit="cover" />
          ) : (
            <View style={[styles.itemImage, styles.itemImageFb, { backgroundColor: colors.muted }]}>
              <ShoppingBag size={24} color={colors.mutedForeground} />
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={2}>
              {item.post?.title ?? t('service.deletedPost')}
            </Text>
            <Text style={{ fontSize: 11, color: TARJOAN_COLOR, fontWeight: '600' }}>
              {isBuyer ? t('service.youBought') : t('service.youProvide')}
            </Text>
            {otherUser && (
              <View style={styles.userRow}>
                {otherUser.avatar_url ? (
                  <Image source={{ uri: otherUser.avatar_url }} style={styles.tinyAvatar} />
                ) : (
                  <View style={[styles.tinyAvatar, styles.tinyAvatarFb, { backgroundColor: colors.muted }]}>
                    <Text style={{ fontSize: 8, fontWeight: '600', color: colors.mutedForeground }}>
                      {otherUser.name?.charAt(0)?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
                <Text style={[styles.userName, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {otherUser.name}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.cardRight}>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {t(STATUS_KEYS[safeStatus])}
              </Text>
            </View>
            <Text style={[styles.priceText, { color: TARJOAN_COLOR }]}>
              {formatPrice(item.total_amount, locale)}
            </Text>
          </View>
        </View>

        {(canConfirm || canStart || canComplete || canCancel || canReview) && (
          <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
            {canConfirm && (
              <Pressable onPress={() => handleServiceConfirm(item)} disabled={isActionLoading(item.id)} style={[styles.actionBtn, { backgroundColor: colors.success }]}>
                <CheckCircle size={14} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>{t('service.acceptJob')}</Text>
              </Pressable>
            )}
            {canStart && (
              <Pressable onPress={() => handleServiceStart(item)} disabled={isActionLoading(item.id)} style={[styles.actionBtn, { backgroundColor: colors.primary }]}>
                <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>{t('service.startWork')}</Text>
              </Pressable>
            )}
            {canComplete && (
              <Pressable onPress={() => handleServiceComplete(item)} disabled={isActionLoading(item.id)} style={[styles.actionBtn, { backgroundColor: colors.success }]}>
                <CheckCircle size={14} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>{t('service.markDone')}</Text>
              </Pressable>
            )}
            {canCancel && (
              <Pressable onPress={() => handleServiceCancel(item)} disabled={isActionLoading(item.id)} style={[styles.actionBtn, { backgroundColor: `${colors.destructive}15`, borderColor: colors.destructive, borderWidth: 1 }]}>
                <XCircle size={14} color={colors.destructive} />
                <Text style={[styles.actionBtnText, { color: colors.destructive }]}>{t('service.cancelBooking')}</Text>
              </Pressable>
            )}
            {canReview && (
              <Pressable onPress={() => { const id = isBuyer ? item.provider_id : item.buyer_id; router.push(`/profile/${id}` as any) }} style={[styles.actionBtn, { backgroundColor: `${colors.pro}15`, borderColor: colors.pro, borderWidth: 1 }]}>
                <Star size={14} color={colors.pro} />
                <Text style={[styles.actionBtnText, { color: colors.pro }]}>{t('rental.leaveReview')}</Text>
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
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('bookings.title')}</Text>
        <View style={{ flex: 1 }} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => setActiveTab('borrower')}
          style={[styles.tab, activeTab === 'borrower' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.tabText, { color: activeTab === 'borrower' ? colors.primary : colors.mutedForeground }]}>
            {t('rental.myRentals')} ({borrowerCount})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('lender')}
          style={[styles.tab, activeTab === 'lender' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.tabText, { color: activeTab === 'lender' ? colors.primary : colors.mutedForeground }]}>
            {t('rental.lendingOut')} ({lenderCount})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('services')}
          style={[styles.tab, activeTab === 'services' && { borderBottomColor: TARJOAN_COLOR, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.tabText, { color: activeTab === 'services' ? TARJOAN_COLOR : colors.mutedForeground }]}>
            {t('service.services')} ({serviceCount})
          </Text>
        </Pressable>
      </View>

      {/* Booking list */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={activeTab === 'services' ? serviceBookings : filteredBookings}
          keyExtractor={item => item.id}
          renderItem={activeTab === 'services' ? renderServiceBooking : renderBooking}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchBookings() }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              {activeTab === 'services' ? (
                <ShoppingBag size={48} color={colors.mutedForeground} style={{ opacity: 0.3 }} />
              ) : (
                <Package size={48} color={colors.mutedForeground} style={{ opacity: 0.3 }} />
              )}
              <Text style={[styles.emptyTitle, { color: colors.mutedForeground }]}>
                {activeTab === 'services' ? t('service.noBookings') : t('rental.noBookings')}
              </Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                {activeTab === 'services' ? t('service.noBookingsHint') : activeTab === 'borrower' ? t('rental.noBookingsHint') : t('rental.noLendingHint')}
              </Text>
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
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi, lineHeight: 28 },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 20 },
  listContent: { padding: 16, gap: 12, paddingBottom: 40 },
  bookingCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
  },
  itemImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  itemImageFb: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    fontFamily: fonts.bodySemi,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    lineHeight: 17,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  tinyAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  tinyAvatarFb: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    fontFamily: fonts.bodySemi,
    lineHeight: 14,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.headingSemi,
    lineHeight: 23,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: fonts.bodySemi,
    lineHeight: 17,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 23,
  },
  emptyHint: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 17,
  },
})
