declare const __DEV__: boolean

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Building2, Check, ChevronLeft, MapPin } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { safeBack } from '@/lib/navigation'
import { useToast } from '@/components/Toast'
import { StickyCTA } from '@/components/lending'

interface HubRow {
  id: string
  name: string
  address: string | null
  type: string | null
  icon: string | null
  lat: number | null
  lng: number | null
}

function HubPickerScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()
  const params = useLocalSearchParams<{ bookingId: string }>()

  const [hubs, setHubs] = useState<HubRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('hubs')
          .select('id, name, address, type, icon, lat, lng')
          .eq('is_active', true)
          .order('name', { ascending: true })
          .limit(50)
        if (!mounted) return
        if (error) {
          if (__DEV__) console.warn('[hub-picker] load failed:', error.message)
          toast.show({ message: t('common.error') ?? 'Error', type: 'error' })
          return
        }
        const rows = (data ?? []) as HubRow[]
        setHubs(rows)
        // Pre-select the previously chosen hub if the borrower came back here.
        if (params.bookingId) {
          const { data: bk } = await supabase
            .from('rental_bookings')
            .select('hub_id')
            .eq('id', params.bookingId)
            .maybeSingle()
          if (mounted && (bk as any)?.hub_id) setSelected((bk as any).hub_id)
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
      const { error } = await (supabase.from('rental_bookings') as any)
        .update({ hub_id: selected, pickup_method: 'hub' })
        .eq('id', params.bookingId)
      if (error) throw error
      router.replace({ pathname: '/payment-checkout', params: { bookingId: params.bookingId } } as any)
    } catch (e) {
      if (__DEV__) console.warn('[hub-picker] save failed:', (e as Error)?.message)
      toast.show({ message: t('common.error') ?? 'Tallennus epäonnistui', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }, [submitting, selected, params.bookingId, supabase, router, t, toast])

  const renderHub = useCallback(({ item }: { item: HubRow }) => {
    const isSelected = item.id === selected
    return (
      <PressableOpacity
        onPress={() => setSelected(item.id)}
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={item.name}
        style={[
          s.row,
          isSelected
            ? { backgroundColor: colors.foreground, borderColor: colors.foreground }
            : { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={[s.iconCircle, { backgroundColor: isSelected ? colors.primaryForeground : colors.muted }]}>
          <Building2 size={18} color={colors.foreground} strokeWidth={1.7} />
        </View>
        <View style={s.body}>
          <Text style={[s.name, { color: isSelected ? colors.primaryForeground : colors.foreground }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.address && (
            <View style={s.metaRow}>
              <MapPin size={11} color={isSelected ? (colors.onInkMuted ?? '#B8BCC0') : colors.mutedForeground} strokeWidth={2} />
              <Text style={[s.address, { color: isSelected ? (colors.onInkMuted ?? '#B8BCC0') : colors.mutedForeground }]} numberOfLines={1}>
                {item.address}
              </Text>
            </View>
          )}
          {item.type && (
            <Text style={[s.type, { color: isSelected ? (colors.onInkMuted ?? '#B8BCC0') : colors.tertiaryForeground }]} numberOfLines={1}>
              {item.type}
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
          {t('hubPicker.title') ?? 'Valitse hub'}
        </Text>
        <View style={ss.headerSpacer} />
      </View>

      {loading ? (
        <View style={ss.loadingWrap}>
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        </View>
      ) : hubs.length === 0 ? (
        <View style={ss.emptyWrap}>
          <Text style={[ss.emptyTitle, { color: colors.foreground }]}>
            {t('hubPicker.emptyTitle') ?? 'Ei hubeja saatavilla'}
          </Text>
          <Text style={[ss.emptyBody, { color: colors.mutedForeground }]}>
            {t('hubPicker.emptyBody') ?? 'Hub-verkko on vielä rakenteilla. Palaa edelliseen ja valitse "Sovittu osoite".'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={hubs}
          keyExtractor={item => item.id}
          renderItem={renderHub}
          contentContainerStyle={[ss.list, { paddingBottom: insets.bottom + 110 }]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <StickyCTA
        label={t('hubPicker.confirm') ?? 'Vahvista paikka'}
        onPress={handleConfirm}
        disabled={!selected || hubs.length === 0}
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
  type: { fontSize: 11, fontFamily: fonts.body, lineHeight: 14 },
  checkCircle: {
    width: 24, height: 24, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
})

export default function HubPickerScreen() {
  return (
    <ScreenErrorBoundary screenName="HubPicker">
      <HubPickerScreenInner />
    </ScreenErrorBoundary>
  )
}
