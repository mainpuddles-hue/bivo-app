import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  Image, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, Sheet, StickyCTA, Eyebrow, Pill } from '@/components/rental';
import { Avatar } from '@/components/Avatar';
import { useLegacyTokens } from '@/lib/rental/theme';
import { useSupabase } from '@/hooks/useSupabase';

const MAX_RENTAL_DAYS = 6;

const WEEKDAYS_FI = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'] as const;
const MONTHS_FI = ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'] as const;

function formatDateFi(d: Date): string {
  return `${WEEKDAYS_FI[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

function formatDateLong(d: Date): string {
  return `${WEEKDAYS_FI[d.getDay()].charAt(0).toUpperCase()}${WEEKDAYS_FI[d.getDay()].slice(1)} ${d.getDate()}. ${MONTHS_FI[d.getMonth()]}`;
}

interface RentalData {
  itemTitle: string;
  ownerName: string;
  ownerAvatar: string | null;
  imageUrl: string | null;
  dailyFee: number;
  currentDays: number;
  endDate: string;
}

export default function RentalExtendScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const supabase = useSupabase();
  const { rentalId } = useLocalSearchParams<{ rentalId: string }>();

  const [rental, setRental] = useState<RentalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!rentalId) return;
    let mounted = true;
    (supabase
      .from('rental_bookings') as any)
      .select(`
        daily_fee, days, end_date,
        item:items!rental_bookings_item_id_fkey ( title, images:item_images ( image_url, sort_order ) ),
        lender:profiles!rental_bookings_lender_id_fkey ( name, avatar_url )
      `)
      .eq('id', rentalId)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (!mounted) return;
        if (!data) { setLoading(false); return; }
        const item = data.item as any;
        const images = (item?.images ?? []) as any[];
        const sorted = [...images].sort((a: any, b: any) => a.sort_order - b.sort_order);
        setRental({
          itemTitle: item?.title ?? 'Tuntematon',
          ownerName: (data.lender as any)?.name ?? '',
          ownerAvatar: (data.lender as any)?.avatar_url ?? null,
          imageUrl: sorted[0]?.image_url ?? null,
          dailyFee: Number(data.daily_fee) || 0,
          currentDays: data.days ?? 0,
          endDate: data.end_date,
        });
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [rentalId, supabase]);

  const maxExtend = rental ? Math.max(0, MAX_RENTAL_DAYS - rental.currentDays) : 0;
  const options = Array.from({ length: Math.min(3, maxExtend) }, (_, i) => i + 1);

  const currentEndDate = rental?.endDate ? new Date(rental.endDate) : null;
  const newEndDate = currentEndDate ? new Date(currentEndDate) : null;
  if (newEndDate) newEndDate.setDate(newEndDate.getDate() + selected);

  const cost = rental ? selected * rental.dailyFee : 0;

  const handleExtend = async () => {
    if (!rentalId || !rental) return;
    setSubmitting(true);
    try {
      const WebBrowser = require('expo-web-browser');
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        Alert.alert('Virhe', 'Et ole kirjautunut.');
        return;
      }

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/extend-rental`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ rentalId, extraDays: selected }),
        },
      );

      const payload = await res.json();
      if (!res.ok || !payload.url) {
        Alert.alert('Virhe', payload.error ?? 'Pidennys epäonnistui.');
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(
        payload.url,
        'bivo://payment/extend-success',
      );

      if (result.type === 'success' && result.url?.includes('extend-success')) {
        Alert.alert(
          'Laina-aika pidennetty',
          `Vuokra-aikaa pidennetty ${selected} päivällä. Uusi palautus: ${newEndDate ? formatDateLong(newEndDate) : ''}`,
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // Ei tehdä mitään
      } else {
        Alert.alert('Virhe', 'Maksu ei onnistunut.');
      }
    } catch {
      Alert.alert('Virhe', 'Pidennys epäonnistui. Yritä uudelleen.');
    } finally {
      setSubmitting(false);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 160 },
    itemCard: { marginBottom: 4 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    itemThumb: { width: 52, height: 52, borderRadius: BIVO.r.tile, backgroundColor: BIVO.surface2 },
    itemTitle: { fontSize: 14, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    itemSub: { fontSize: 12, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 2 },
    sectionEyebrow: { marginTop: 22, marginBottom: 10 },
    optionsRow: { flexDirection: 'row', gap: 8 },
    optionCard: {
      flex: 1, padding: 16, borderRadius: 18, alignItems: 'center',
    },
    optionDefault: {
      backgroundColor: BIVO.surface, borderWidth: 1, borderColor: BIVO.hair2,
    },
    optionSel: { backgroundColor: BIVO.ink },
    optionLabel: {
      fontSize: 20, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.02 * 20, color: BIVO.ink,
    },
    optionPrice: { fontSize: 12, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 6, opacity: 0.75 },
    oldDate: { fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2 },
    newDate: {
      fontSize: 24, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.02 * 24, color: BIVO.ink, marginTop: 4,
    },
    dayCount: { fontSize: 12, fontFamily: BIVO.sans, color: BIVO.ink3, marginTop: 8 },
    approvalNote: {
      marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    approvalText: { flex: 1, fontSize: 12, fontFamily: BIVO.sans, color: BIVO.ink2, lineHeight: 12 * 1.45 },
    emptyText: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink2, textAlign: 'center', lineHeight: 21 },
  }), [BIVO]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title="Pidennä laina" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BIVO.ink} />
        </View>
      </View>
    );
  }

  if (!rental || maxExtend === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title="Pidennä laina" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={styles.emptyText}>
            {!rental ? 'Lainaa ei löytynyt.' : `Laina on jo ${rental.currentDays} vuorokautta, enimmäisaika on ${MAX_RENTAL_DAYS} vuorokautta.`}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title="Pidennä laina" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Sheet padding={14} style={styles.itemCard}>
          <View style={styles.itemRow}>
            {rental.imageUrl ? (
              <Image source={{ uri: rental.imageUrl }} style={styles.itemThumb} />
            ) : (
              <View style={styles.itemThumb} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{rental.itemTitle}</Text>
              <Text style={styles.itemSub}>
                {rental.ownerName}lta · palautus {currentEndDate ? formatDateFi(currentEndDate) : ''}
              </Text>
            </View>
            <Pill tone="live">Käynnissä</Pill>
          </View>
        </Sheet>

        <Eyebrow style={styles.sectionEyebrow}>LISÄÄ AIKAA</Eyebrow>
        <View style={styles.optionsRow}>
          {options.map(days => {
            const sel = selected === days;
            const optCost = days * rental.dailyFee;
            return (
              <TouchableOpacity
                key={days}
                style={[styles.optionCard, sel ? styles.optionSel : styles.optionDefault]}
                onPress={() => setSelected(days)}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionLabel, sel && { color: '#fff' }]}>+ {days} vrk</Text>
                <Text style={[styles.optionPrice, sel && { color: 'rgba(255,255,255,0.75)' }]}>{optCost} €</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Eyebrow style={styles.sectionEyebrow}>UUSI PALAUTUS</Eyebrow>
        <Sheet padding={18}>
          <Text style={styles.oldDate}>
            Nykyinen: {currentEndDate ? formatDateFi(currentEndDate) : '—'}
          </Text>
          <Text style={styles.newDate}>
            {newEndDate ? formatDateLong(newEndDate) : '—'}
          </Text>
          <Text style={styles.dayCount}>
            Yhteensä {rental.currentDays + selected} / {MAX_RENTAL_DAYS} vrk
          </Text>
        </Sheet>

        <Sheet padding={14} style={styles.approvalNote}>
          <Avatar name={rental.ownerName} url={rental.ownerAvatar} size={36} />
          <Text style={styles.approvalText}>
            Pidennys veloitetaan heti. Omistajalle ilmoitetaan uudesta palautuspäivästä.
          </Text>
        </Sheet>
      </ScrollView>

      <StickyCTA onPress={handleExtend} disabled={submitting}>
        {submitting ? 'Käsitellään…' : `Maksa pidennys · ${cost} €`}
      </StickyCTA>
    </View>
  );
}
