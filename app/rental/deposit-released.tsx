import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Sheet, StickyCTA, StageTag } from '@/components/rental';
import { useLegacyTokens } from '@/lib/rental/theme';

export default function DepositReleasedScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { deposit = '30', days = '3', rentalId } = useLocalSearchParams<{
    deposit?: string; days?: string; rentalId?: string;
  }>();

  const amount = Number(deposit) || 30;

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 160 },
    hero: {
      alignItems: 'center', justifyContent: 'center',
      paddingTop: 80, paddingBottom: 24,
    },
    iconCircle: {
      width: 72, height: 72, borderRadius: 999, backgroundColor: BIVO.live,
      alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    headline: {
      fontSize: 32, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.02 * 32, textAlign: 'center', color: BIVO.ink,
      lineHeight: 32 * 1.1, marginTop: 8,
    },
    body: {
      fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2,
      textAlign: 'center', maxWidth: 280, lineHeight: 13 * 1.55, marginTop: 14,
    },
    sheet: { marginTop: 28 },
    row: {
      flexDirection: 'row', justifyContent: 'space-between',
      paddingHorizontal: 18, paddingVertical: 14,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: BIVO.hair },
    rowLabel: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink2 },
    rowValue: { fontSize: 14, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
  }), [BIVO]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M20 6L9 17l-5-5" />
            </Svg>
          </View>
          <StageTag>VAKUUS VAPAUTETTU</StageTag>
          <Text style={styles.headline}>
            {amount} €{'\n'}
            <Text style={{ color: BIVO.ink2 }}>palaa kortillesi</Text>
          </Text>
          <Text style={styles.body}>
            Näkyy tiliotteella 1–3 arkipäivän kuluessa.
          </Text>
        </View>

        <Sheet padding={0} style={styles.sheet}>
          {[
            { l: 'Lainan kesto', v: `${days} päivää` },
            { l: 'Lopullinen kulu', v: '0 €' },
          ].map((r, i, a) => (
            <View key={r.l} style={[styles.row, i < a.length - 1 && styles.rowBorder]}>
              <Text style={styles.rowLabel}>{r.l}</Text>
              <Text style={styles.rowValue}>{r.v}</Text>
            </View>
          ))}
        </Sheet>
      </ScrollView>

      <StickyCTA onPress={() => { if (rentalId) router.push(`/rental/review/${rentalId}`); }}>
        Jätä arvio
      </StickyCTA>
    </View>
  );
}
