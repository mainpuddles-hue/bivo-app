declare const __DEV__: boolean

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, ChevronLeft, MapPin, Package } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { safeBack } from '@/lib/navigation'
import { useToast } from '@/components/Toast'
import { StickyCTA } from '@/components/lending'

interface LockerRow {
  id: string
  provider: 'mock' | 'gardi'
  location_name: string
  address: string
  size: 's' | 'm' | 'l' | 'xl' | null
  lat: number | null
  lng: number | null
}

const SIZE_LABELS: Record<string, string> = {
  s: 'S · pieni',
  m: 'M · keskikoko',
  l: 'L · iso',
  xl: 'XL · erityisen iso',
}

function LockerPickerScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()
  const params = useLocalSearchParams<{ bookingId: string }>()

  const [lockers, setLockers] = useState<LockerRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('lockers')
          .select('id, provider, location_name, address, size, lat, lng')
          .eq('is_active', true)
          .order('location_name', { ascending: true })
          .limit(50)
        if (!mounted) return
        if (error) {
          if (__DEV__) console.warn('[locker-picker] load failed:', error.message)
          toast.show({ message: t('common.error') ?? 'Error', type: 'error' })
          return
        }
        const rows = (data ?? []) as LockerRow[]
        setLockers(rows)
        if (params.bookingId) {
          const { data: bk } = await supabase
            .from('rental_bookings')
            .select('locker_id')
            .eq('id', params.bookingId)
            .maybeSingle()
          if (mounted && (bk as any)?.locker_id) setSelected((bk as any).locker_id)
          else if (mounted && rows.length > 0) setSelected(rows[0].id)
        } else if (rows.length > 0) {
          setSelected(rows[0].id)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [params.bookingId, supabase, t, toast])

  const handleConfirm = useCallback(async () => {
    if (submitting || !selected || !params.bookingId) return
    setSubmitting(true)
    try {
      const lockerRow = lockers.find(l => l.id === selected)
      const provider = lockerRow?.provider ?? 'mock'

      // First write the locker selection so the locker-assign Edge Function
      // can find pickup_method='gardi' + locker_id on the booking row.
      const { error: bkError } = await (supabase.from('rental_bookings') as any)
        .update({
          locker_id: selected,
          locker_provider: provider,
          pickup_method: 'gardi',
        })
        .eq('id', params.bookingId)
      if (bkError) throw bkError

      // Then ask the Edge Function to issue both PINs. The function hashes
      // them at rest (locker_assignments.pin_hash via PBKDF2), and mirrors
      // the plaintext + expiry onto rental_bookings so LockerPinCard can
      // render them on subsequent loads. Two parallel calls — pickup is
      // for the borrower, dropoff is for the lender.
      const issuePin = async (direction: 'pickup' | 'dropoff') => {
        const { error } = await supabase.functions.invoke('locker-assign', {
          body: { booking_id: params.bookingId, direction },
        })
        if (error) throw error
      }
      const results = await Promise.allSettled([issuePin('pickup'), issuePin('dropoff')])
      const failures = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[]
      if (failures.length > 0) {
        // PIN issuance is best-effort here — the booking row is already
        // written with locker_id, so the user can still complete checkout.
        // The booking-detail screen will re-issue PINs on demand when the
        // lender confirms (slice 4). Log the failure, surface a non-fatal
        // toast, and proceed.
        if (__DEV__) {
          for (const f of failures) console.warn('[locker-picker] PIN issue failed:', (f.reason as Error)?.message ?? f.reason)
        }
        toast.show({ message: t('locker.pinDelayed') ?? 'PIN-koodit luodaan kun lainanantaja vahvistaa varauksen', type: 'info' })
      }

      router.replace({ pathname: '/payment-checkout', params: { bookingId: params.bookingId } } as any)
    } catch (e) {
      if (__DEV__) console.warn('[locker-picker] save failed:', (e as Error)?.message)
      toast.show({ message: t('common.error') ?? 'Tallennus epäonnistui', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }, [submitting, selected, params.bookingId, lockers, supabase, router, t, toast])

  const renderLocker = useCallback(({ item }: { item: LockerRow }) => {
    const isSelected = item.id === selected
    return (
      <PressableOpacity
        onPress={() => setSelected(item.id)}
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={item.location_name}
        style={[
          s.row,
          isSelected
            ? { backgroundColor: colors.foreground, borderColor: colors.foreground }
            : { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={[s.iconCircle, { backgroundColor: isSelected ? colors.primaryForeground : colors.muted }]}>
          <Package size={18} color={colors.foreground} strokeWidth={1.7} />
        </View>
        <View style={s.body}>
          <Text style={[s.name, { color: isSelected ? colors.primaryForeground : colors.foreground }]} numberOfLines={1}>
            {item.location_name}
          </Text>
          <View style={s.metaRow}>
            <MapPin size={11} color={isSelected ? (colors.onInkMuted) : colors.mutedForeground} strokeWidth={2} />
            <Text style={[s.address, { color: isSelected ? (colors.onInkMuted) : colors.mutedForeground }]} numberOfLines={1}>
              {item.address}
            </Text>
          </View>
          {item.size && SIZE_LABELS[item.size] && (
            <Text style={[s.sizeLine, { color: isSelected ? (colors.onInkMuted) : colors.tertiaryForeground }]}>
              {SIZE_LABELS[item.size]}
            </Text>
          )}
        </View>
        {isSelected && (
          <View style={[s.checkCircle, { backgroundColor: colors.primaryForeground }]}>
            <Check size={12} color={colors.foreground} strokeWidth={2.5} />
          </View>
        )}
      </PressableOpacity>
    )
  }, [selected, colors])

  return (
    <View style={[ss.container, { backgroundColor: colors.background }]}>
      <View style={[ss.header, { paddingTop: insets.top + 12 }]}>
        <PressableOpacity
          onPress={() => safeBack(router, '/(tabs)')}
          hitSlop={12}
          style={[ss.backCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.back') ?? 'Takaisin'}
        >
          <ChevronLeft size={20} color={colors.foreground} strokeWidth={1.8} />
        </PressableOpacity>
        <Text style={[ss.headerTitle, { color: colors.foreground }]}>
          {t('lockerPicker.title') ?? 'Valitse Gardi-lokero'}
        </Text>
        <View style={ss.headerSpacer} />
      </View>

      {loading ? (
        <View style={ss.loadingWrap}>
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        </View>
      ) : lockers.length === 0 ? (
        <View style={ss.emptyWrap}>
          <Text style={[ss.emptyTitle, { color: colors.foreground }]}>
            {t('lockerPicker.emptyTitle') ?? 'Ei lokeroita saatavilla'}
          </Text>
          <Text style={[ss.emptyBody, { color: colors.mutedForeground }]}>
            {t('lockerPicker.emptyBody') ?? 'Lokeroverkkoa rakennetaan parhaillaan. Palaa edelliseen ja valitse toinen tapa.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={lockers}
          keyExtractor={item => item.id}
          renderItem={renderLocker}
          contentContainerStyle={[ss.list, { paddingBottom: insets.bottom + 110 }]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <StickyCTA
        label={t('lockerPicker.confirm') ?? 'Vahvista lokero'}
        onPress={handleConfirm}
        disabled={!selected || lockers.length === 0}
        loading={submitting}
        bottomInset={insets.bottom + 16}
      />
    </View>
  )
}

const ss = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingBottom: 12,
    gap: 12,
  },
  backCircle: {
    width: 38, height: 38, borderRadius: 999, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, fontSize: 14, fontWeight: '600',
    fontFamily: fonts.bodySemi, letterSpacing: -0.15, textAlign: 'center',
  },
  headerSpacer: { width: 36, height: 36 },
  list: { paddingHorizontal: 22, paddingTop: 4 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: fonts.heading },
  emptyBody: { fontSize: 13, fontFamily: fonts.body, lineHeight: 18, textAlign: 'center' },
})

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontFamily: fonts.bodySemi, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  address: { flex: 1, fontSize: 12, fontFamily: fonts.body, lineHeight: 16 },
  sizeLine: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14 },
  checkCircle: {
    width: 24, height: 24, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
})

export default function LockerPickerScreen() {
  return (
    <ScreenErrorBoundary screenName="LockerPicker">
      <LockerPickerScreenInner />
    </ScreenErrorBoundary>
  )
}
