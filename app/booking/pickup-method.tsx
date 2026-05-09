declare const __DEV__: boolean

import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Building2, ChevronLeft, MapPin, Package } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { safeBack } from '@/lib/navigation'
import { useToast } from '@/components/Toast'
import {
  ItemSnapshotCard,
  PickupMethodCard,
  StickyCTA,
  type PickupMethodKey,
} from '@/components/lending'

interface BookingTarget {
  id: string
  borrower_id: string
  pickup_method: PickupMethodKey | null
  hub_id: string | null
  post: { id: string; title: string; image_url: string | null } | null
  lender: { id: string; name: string; avatar_url: string | null } | null
}

function PickupMethodScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()
  const params = useLocalSearchParams<{ bookingId: string }>()

  const [target, setTarget] = useState<BookingTarget | null>(null)
  const [selected, setSelected] = useState<PickupMethodKey>('address')
  const [submitting, setSubmitting] = useState(false)
  const [hubCount, setHubCount] = useState(0)
  const [lockerCount, setLockerCount] = useState(0)

  // Load booking + active hub count on mount. Booking gives us the listing
  // and (if the user came back to this screen) the previously selected method
  // to seed the radio. Hub count drives whether we surface the Hub option as
  // available or "no hubs nearby" — the latter still allows selection but
  // makes the picker honest about the next screen being empty.
  useEffect(() => {
    if (!params.bookingId) return
    let mounted = true
    ;(async () => {
      try {
        const [bkRes, hubRes, lockerRes] = await Promise.all([
          supabase
            .from('rental_bookings')
            .select(`
              id, borrower_id, pickup_method, hub_id,
              post:posts!rental_bookings_post_id_fkey(id, title, image_url),
              lender:profiles!rental_bookings_lender_id_fkey(id, name, avatar_url)
            `)
            .eq('id', params.bookingId)
            .maybeSingle(),
          supabase
            .from('hubs')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true),
          // Lockers count is best-effort — if the slice 3 SQL hasn't been
          // applied yet, the table doesn't exist and the query rejects.
          // Treat that as "Gardi unavailable" and keep the card disabled.
          supabase
            .from('lockers')
            .select('id', { count: 'exact', head: true })
            .eq('is_active', true)
            .then(
              (res: { count: number | null; error: any }) => res,
              () => ({ count: 0, error: null }),
            ),
        ])
        if (!mounted) return
        if (bkRes.error || !bkRes.data) {
          if (__DEV__) console.warn('[pickup-method] booking load failed:', bkRes.error?.message)
          toast.show({ message: t('common.error') ?? 'Error', type: 'error' })
          return
        }
        const bk = bkRes.data as unknown as BookingTarget
        setTarget(bk)
        if (bk.pickup_method) setSelected(bk.pickup_method)
        setHubCount(hubRes.count ?? 0)
        // lockerRes is the result of the .then(success, failure) above —
        // either { count, error } or our { count: 0 } fallback.
        const lockerCount = (lockerRes as any)?.count ?? 0
        setLockerCount(lockerCount)
      } catch (e) {
        if (__DEV__) console.warn('[pickup-method] load threw:', (e as Error)?.message)
      }
    })()
    return () => { mounted = false }
  }, [params.bookingId, supabase, t, toast])

  const handleContinue = useCallback(async () => {
    if (submitting || !target) return
    setSubmitting(true)
    try {
      // Persist the chosen method on the booking so the rest of the lifecycle
      // UI can branch on it. hub_id is cleared if the borrower switched away
      // from the hub option after a previous selection.
      const update: Record<string, any> = { pickup_method: selected }
      if (selected !== 'hub') update.hub_id = null
      const { error } = await (supabase.from('rental_bookings') as any)
        .update(update)
        .eq('id', target.id)
      if (error) throw error

      // Branch into the right downstream screen.
      if (selected === 'hub') {
        router.push({ pathname: '/booking/hub-picker', params: { bookingId: target.id } } as any)
      } else if (selected === 'gardi') {
        router.push({ pathname: '/booking/locker-picker', params: { bookingId: target.id } } as any)
      } else {
        router.push({ pathname: '/payment-checkout', params: { bookingId: target.id } } as any)
      }
    } catch (e) {
      if (__DEV__) console.warn('[pickup-method] save failed:', (e as Error)?.message)
      toast.show({ message: t('common.error') ?? 'Tallennus epäonnistui', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }, [submitting, target, selected, supabase, router, t, toast])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <PressableOpacity
          onPress={() => safeBack(router, '/(tabs)')}
          hitSlop={12}
          style={[s.backCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.back') ?? 'Takaisin'}
        >
          <ChevronLeft size={20} color={colors.foreground} strokeWidth={1.8} />
        </PressableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>
          {t('pickup.title') ?? 'Valitse noutotapa'}
        </Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 110 }]}
      >
        {/* Item summary at top so the borrower sees what they're choosing for. */}
        {target?.post && (
          <ItemSnapshotCard
            thumbnail={target.post.image_url}
            title={target.post.title}
            subtitle={target.lender?.name ?? ''}
            eyebrow={t('pickup.lendingThis') ?? 'LAINATAAN'}
            size="comfortable"
          />
        )}

        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
          {t('pickup.howCopy') ?? 'MITEN HALUAT NOUTAA?'}
        </Text>

        <View style={s.options}>
          <PickupMethodCard
            method="address"
            title={t('pickup.address') ?? 'Sovittu osoite'}
            subtitle={t('pickup.addressSub') ?? 'Tapaa lainanantajan kanssa kasvotusten'}
            Icon={MapPin}
            selected={selected === 'address'}
            onPress={() => setSelected('address')}
          />
          <PickupMethodCard
            method="hub"
            title={t('pickup.hub') ?? 'TackBird Hub'}
            subtitle={
              hubCount > 0
                ? (t('pickup.hubSub', { count: hubCount }) ?? `${hubCount} hubia lähistöllä`)
                : (t('pickup.hubEmpty') ?? 'Ei hubeja lähistöllä toistaiseksi')
            }
            Icon={Building2}
            selected={selected === 'hub'}
            disabled={hubCount === 0}
            meta={hubCount === 0 ? (t('pickup.empty') ?? 'Ei valittavissa') : undefined}
            onPress={() => setSelected('hub')}
          />
          <PickupMethodCard
            method="gardi"
            title={t('pickup.gardi') ?? 'Gardi älylokero'}
            subtitle={
              lockerCount > 0
                ? (t('pickup.gardiSub') ?? '24/7 nouto omalla PIN-koodilla')
                : (t('pickup.gardiEmpty') ?? 'Lokeroverkkoa rakennetaan parhaillaan')
            }
            Icon={Package}
            selected={selected === 'gardi'}
            disabled={lockerCount === 0}
            meta={lockerCount === 0 ? (t('pickup.empty') ?? 'Ei valittavissa') : undefined}
            onPress={() => setSelected('gardi')}
          />
        </View>

        <Text style={[s.helper, { color: colors.mutedForeground }]}>
          {t('pickup.helper') ?? 'Voit muuttaa noutotavan ennen vahvistusta lainanantajan kanssa.'}
        </Text>
      </ScrollView>

      <StickyCTA
        label={
          selected === 'hub'
            ? (t('pickup.continueToHub') ?? 'Valitse hub')
            : selected === 'gardi'
              ? (t('pickup.continueToLocker') ?? 'Valitse lokero')
              : (t('pickup.continueToPayment') ?? 'Jatka maksuun')
        }
        onPress={handleContinue}
        loading={submitting}
        bottomInset={insets.bottom + 16}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
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
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.15,
    textAlign: 'center',
  },
  headerSpacer: { width: 36, height: 36 },

  content: { paddingHorizontal: 16, gap: 14 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4,
  },
  options: { gap: 10 },

  helper: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 17,
    marginTop: 6,
  },
})

export default function PickupMethodScreen() {
  return (
    <ScreenErrorBoundary screenName="PickupMethod">
      <PickupMethodScreenInner />
    </ScreenErrorBoundary>
  )
}
