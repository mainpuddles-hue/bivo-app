import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, Sheet, BigBtn, Eyebrow, StageTag, ProductThumb } from '@/components/rental';
import { Avatar } from '@/components/Avatar';
import { useLegacyTokens } from '@/lib/rental/theme';
import { useSupabase } from '@/hooks/useSupabase';
import { approveRental, rejectRental } from '@/lib/rental';

export default function OwnerRequestScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const supabase = useSupabase();
  const [rental, setRental] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('rental_bookings')
      .select('*, item:items(*), borrower:profiles!rental_bookings_borrower_id_fkey(*)')
      .eq('id', id)
      .single()
      .then(({ data }) => { setRental(data); setLoading(false); });
  }, [id]);

  const handleResponse = async (status: 'approved' | 'rejected') => {
    if (!id) return;
    setResponding(true);
    const result = status === 'approved'
      ? await approveRental(supabase, id)
      : await rejectRental(supabase, id);
    setResponding(false);
    if (result.error) {
      Alert.alert('Virhe', result.error);
      return;
    }
    Alert.alert(
      status === 'approved' ? 'Hyväksytty' : 'Hylätty',
      status === 'approved' ? 'Lainauspyyntö hyväksytty.' : 'Lainauspyyntö hylätty.',
      [{ text: 'OK', onPress: () => router.back() }],
    );
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 180 },
    borrowerSection: { alignItems: 'center', marginTop: 12, marginBottom: 24 },
    borrowerName: { fontSize: 20, fontFamily: BIVO.sansBold, fontWeight: '700', color: BIVO.ink, marginTop: 12 },
    borrowerSub: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 4 },
    itemCard: { marginBottom: 14 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    itemThumb: { width: 56, height: 56, borderRadius: 14, backgroundColor: BIVO.bg2 },
    itemInfo: { flex: 1 },
    itemTitle: { fontSize: 16, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    itemDates: { fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 4 },
    priceCard: { marginBottom: 14 },
    priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    priceLabel: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink2 },
    priceValue: { fontSize: 14, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    heroTitle: {
      fontSize: 24, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.02 * 24, color: BIVO.ink, textAlign: 'center',
      lineHeight: 30, marginTop: 14,
    },
    heroSub: {
      fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2,
      textAlign: 'center', marginTop: 6,
    },
    messageText: {
      fontSize: 15, fontFamily: BIVO.sans, color: BIVO.ink,
      lineHeight: 22, fontStyle: 'italic',
    },
    infoRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 14,
    },
    infoRowBorder: {
      borderBottomWidth: 1, borderBottomColor: BIVO.hair,
    },
    infoLabel: {
      fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink2,
    },
    infoValue: {
      fontSize: 14, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink,
    },
    ctaArea: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 22, gap: 10, backgroundColor: BIVO.bg, paddingTop: 16 },
    ctaRow: {
      flexDirection: 'row', gap: 10,
    },
  }), [BIVO]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title="Lainauspyyntö" onBack={() => router.back()} />
        <ActivityIndicator style={{ marginTop: 40 }} color={BIVO.ink} />
      </View>
    );
  }

  const borrowerName = rental?.borrower?.display_name || rental?.borrower?.name || 'Lainaaja';
  const itemTitle = rental?.item?.title || 'Tavara';
  const itemImage = rental?.item?.images?.[0]?.image_url;
  const borrowerRating = rental?.borrower?.avg_rating;
  const borrowerCreated = rental?.borrower?.created_at
    ? new Date(rental.borrower.created_at).toLocaleDateString('fi', { month: 'long', year: 'numeric' })
    : null;

  const startFmt = rental?.start_date
    ? new Date(rental.start_date).toLocaleDateString('fi', { weekday: 'short', day: 'numeric', month: 'numeric' })
    : null;
  const endFmt = rental?.end_date
    ? new Date(rental.end_date).toLocaleDateString('fi', { weekday: 'short', day: 'numeric', month: 'numeric' })
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title="Lainapyyntö" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.borrowerSection}>
          <Avatar url={rental?.borrower?.avatar_url} name={borrowerName} size={84} />
          <StageTag style={{ marginTop: 24 }}>UUSI PYYNTÖ</StageTag>
          <Text style={styles.heroTitle}>
            {borrowerName}{' '}
            <Text style={{ color: BIVO.ink2 }}>haluaa lainata</Text>
            {'\n'}{itemTitle.toLowerCase()}si
          </Text>
          <Text style={styles.heroSub}>vastaa 24 h sisällä</Text>
        </View>

        <Sheet padding={16} style={styles.itemCard}>
          <View style={styles.itemRow}>
            <ProductThumb uri={itemImage} size="sm" />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{itemTitle}</Text>
              {startFmt && endFmt && (
                <Text style={styles.itemDates}>{startFmt} → {endFmt}</Text>
              )}
              {rental?.deposit_amount != null && (
                <Text style={styles.itemDates}>
                  Vakuus {rental.deposit_amount} €
                </Text>
              )}
            </View>
          </View>
        </Sheet>

        {rental?.notes && (
          <>
            <Eyebrow style={{ marginTop: 22 }}>{borrowerName}n viesti</Eyebrow>
            <Sheet padding={16} style={{ marginTop: 8 }}>
              <Text style={styles.messageText}>"{rental.notes}"</Text>
            </Sheet>
          </>
        )}

        <Eyebrow style={{ marginTop: 22 }}>{borrowerName}sta</Eyebrow>
        <Sheet padding={0} style={{ marginTop: 8 }}>
          {[
            { l: 'Arvio', v: borrowerRating ? `★ ${borrowerRating.toFixed(1)}` : '—' },
            { l: 'Bivo-jäsen', v: borrowerCreated ?? '—' },
            { l: 'Vahvistettu', v: rental?.borrower?.identity_verified_at ? 'Kyllä' : 'Ei vielä' },
          ].map((r, i, a) => (
            <View key={r.l} style={[styles.infoRow, i < a.length - 1 && styles.infoRowBorder]}>
              <Text style={styles.infoLabel}>{r.l}</Text>
              <Text style={styles.infoValue}>{r.v}</Text>
            </View>
          ))}
        </Sheet>
      </ScrollView>

      <View style={[styles.ctaArea, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.ctaRow}>
          <BigBtn secondary onPress={() => handleResponse('rejected')} disabled={responding} style={{ flex: 1 }}>
            Hylkää
          </BigBtn>
          <BigBtn onPress={() => handleResponse('approved')} disabled={responding} style={{ flex: 1.4 }}>
            {responding ? 'Käsitellään…' : 'Hyväksy'}
          </BigBtn>
        </View>
      </View>
    </View>
  );
}
