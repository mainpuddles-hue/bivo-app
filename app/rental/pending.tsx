import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, Sheet, BigBtn, StageTag } from '@/components/rental';
import { useLegacyTokens } from '@/lib/rental/theme';
import { cancelRental } from '@/lib/rental';
import { useSupabase } from '@/hooks/useSupabase';

export default function PendingRequestScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const supabase = useSupabase();
  const { rentalId, itemTitle, ownerName, conversationId } = useLocalSearchParams<{
    rentalId?: string; itemTitle?: string; ownerName?: string; conversationId?: string;
  }>();

  const handleCancel = async () => {
    Alert.alert(
      'Peruuta pyyntö',
      `Haluatko perua lainapyynnön?`,
      [
        { text: 'Ei', style: 'cancel' },
        {
          text: 'Peruuta',
          style: 'destructive',
          onPress: async () => {
            if (rentalId) {
              const res = await cancelRental(supabase, rentalId);
              if (res.error) {
                Alert.alert('Peruutus epäonnistui', res.error);
                return;
              }
            }
            router.replace('/(tabs)/loans');
          },
        },
      ],
    );
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 200 },
    hero: { alignItems: 'center', paddingTop: 0 },
    pulseCircle: {
      width: 92, height: 92, borderRadius: 999, backgroundColor: BIVO.surface,
      borderWidth: 1, borderColor: BIVO.hair2,
      alignItems: 'center', justifyContent: 'center',
    },
    pulseDot: { width: 14, height: 14, borderRadius: 999, backgroundColor: BIVO.ink },
    headline: {
      fontSize: 32, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.02 * 32, textAlign: 'center', color: BIVO.ink,
      lineHeight: 32 * 1.05, marginTop: 8,
    },
    subtext: { fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 10 },
    sheet: { marginTop: 24 },
    sheetLabel: { fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2 },
    itemRow: { flexDirection: 'row', gap: 14, marginTop: 10, alignItems: 'center' },
    itemThumb: {
      width: 56, height: 56, borderRadius: 14, backgroundColor: BIVO.surface2,
    },
    itemTitle: { fontSize: 15, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    ctaArea: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      paddingHorizontal: 22, gap: 10, backgroundColor: BIVO.bg, paddingTop: 16,
    },
  }), [BIVO]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title="Odottaa vastausta" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.pulseCircle}>
            <View style={styles.pulseDot} />
          </View>
          <StageTag style={{ marginTop: 48 }}>PYYNTÖ LÄHETETTY</StageTag>
          <Text style={styles.headline}>
            Odottaa {ownerName ?? 'omistajan'}{'\n'}
            <Text style={{ color: BIVO.ink2 }}>vastausta</Text>
          </Text>
          <Text style={styles.subtext}>Vastaa yleensä tunnin kuluessa.</Text>
        </View>

        <Sheet padding={18} style={styles.sheet}>
          <Text style={styles.sheetLabel}>Pyyntö koskee</Text>
          <View style={styles.itemRow}>
            <View style={styles.itemThumb} />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{itemTitle ?? 'Tavara'}</Text>
            </View>
          </View>
        </Sheet>
      </ScrollView>

      <View style={[styles.ctaArea, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <BigBtn secondary onPress={() => { if (conversationId) router.push(`/chat/${conversationId}`); }}>
          Avaa keskustelu
        </BigBtn>
        <BigBtn
          secondary
          onPress={handleCancel}
          style={{ backgroundColor: 'transparent', borderWidth: 0 }}
        >
          Peruuta pyyntö
        </BigBtn>
      </View>
    </View>
  );
}
