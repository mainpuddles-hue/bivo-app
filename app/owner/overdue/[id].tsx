import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, Sheet, BigBtn, Eyebrow, Pill, ClockIcon } from '@/components/rental';
import { Avatar } from '@/components/Avatar';
import { useLegacyTokens } from '@/lib/rental/theme';
import { useSupabase } from '@/hooks/useSupabase';

export default function OwnerOverdueScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const supabase = useSupabase();
  const [rental, setRental] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    supabase
      .from('rental_bookings')
      .select('*, item:items(*), borrower:profiles!rental_bookings_borrower_id_fkey(*)')
      .eq('id', id)
      .single()
      .then(({ data }) => { if (mounted) { setRental(data); setLoading(false); } });
    return () => { mounted = false; };
  }, [id]);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 200 },
    card: { marginBottom: 14 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    itemThumb: { width: 56, height: 56, borderRadius: 14, backgroundColor: BIVO.bg2 },
    itemInfo: { flex: 1 },
    itemTitle: { fontSize: 16, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    borrowerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    borrowerName: { fontSize: 15, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    borrowerSub: { fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 2 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, gap: 10 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: BIVO.hair },
    rowLabel: { flex: 1, fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink2 },
    rowValue: { fontSize: 14, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    rowValueBold: { fontSize: 15, fontFamily: BIVO.sansBold, fontWeight: '700', color: BIVO.ink },
    footnote: { fontSize: 12, fontFamily: BIVO.sans, color: BIVO.ink3, lineHeight: 18, marginTop: 14, textAlign: 'center' },
    ctaArea: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 22, gap: 10, backgroundColor: BIVO.bg, paddingTop: 16 },
  }), [BIVO]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title="Myöhässä" onBack={() => router.back()} />
        <ActivityIndicator style={{ marginTop: 40 }} color={BIVO.ink} />
      </View>
    );
  }

  const borrowerName = rental?.borrower?.name || 'Lainaaja';
  const itemTitle = rental?.item?.title || 'Tavara';
  const endDate = rental?.end_date ? new Date(rental.end_date) : null;
  const hoursLate = endDate ? Math.max(0, Math.ceil((Date.now() - endDate.getTime()) / (1000 * 60 * 60))) : 0;
  const lateFee = (hoursLate * 1.5).toFixed(2);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title="Myöhässä" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Sheet padding={18} style={styles.card}>
          <View style={styles.itemRow}>
            <View style={styles.itemThumb} />
            <View style={styles.itemInfo}>
              <Text style={styles.itemTitle}>{itemTitle}</Text>
              <View style={{ marginTop: 6 }}><Pill tone="on">Myöhässä</Pill></View>
            </View>
          </View>
        </Sheet>

        <Sheet padding={18} style={styles.card}>
          <View style={styles.borrowerRow}>
            <Avatar url={rental?.borrower?.avatar_url} name={borrowerName} size={42} />
            <View style={{ flex: 1 }}>
              <Text style={styles.borrowerName}>{borrowerName}</Text>
              <Text style={styles.borrowerSub}>Lainaaja</Text>
            </View>
          </View>
        </Sheet>

        <Eyebrow style={{ marginTop: 4 }}>Myöhästyminen</Eyebrow>
        <Sheet padding={0} style={styles.card}>
          <View style={[styles.row, styles.rowBorder]}>
            <ClockIcon size={18} color={BIVO.ink2} />
            <Text style={styles.rowLabel}>Myöhässä</Text>
            <Text style={styles.rowValue}>{hoursLate} tuntia</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Myöhästymismaksu</Text>
            <Text style={styles.rowValueBold}>{lateFee} €</Text>
          </View>
        </Sheet>

        <Text style={styles.footnote}>
          Bivo on lähettänyt lainaajalle muistutuksia palautuksesta. Myöhästymismaksu 1,50 € / alkava tunti veloitetaan automaattisesti vakuudesta.
        </Text>
      </ScrollView>

      <View style={[styles.ctaArea, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <BigBtn
          disabled={!rental?.conversation_id}
          onPress={() => {
            if (!rental?.conversation_id) {
              Alert.alert('Virhe', 'Keskustelua ei löydy.');
              return;
            }
            router.push(`/chat/${rental.conversation_id}`);
          }}
        >
          Lähetä viesti lainaajalle
        </BigBtn>
        <BigBtn secondary onPress={() => router.push('/support-chat')}>
          Ota yhteyttä tukeen
        </BigBtn>
      </View>
    </View>
  );
}
