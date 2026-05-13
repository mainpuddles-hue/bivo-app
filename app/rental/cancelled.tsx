import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { StickyCTA, StageTag } from '@/components/rental';
import { useLegacyTokens } from '@/lib/rental/theme';

export default function CancelledScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ownerName } = useLocalSearchParams<{ ownerName?: string }>();

  const name = ownerName ?? 'Omistaja';

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    hero: {
      flex: 1, paddingHorizontal: 22, alignItems: 'center',
      justifyContent: 'center', paddingBottom: 120,
    },
    iconCircle: {
      width: 72, height: 72, borderRadius: 999, backgroundColor: BIVO.surface,
      borderWidth: 1.5, borderColor: BIVO.hair2,
      alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    headline: {
      fontSize: 30, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.02 * 30, textAlign: 'center', color: BIVO.ink,
      lineHeight: 30 * 1.1, marginTop: 8,
    },
    body: {
      fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2,
      textAlign: 'center', maxWidth: 280, lineHeight: 13 * 1.55, marginTop: 14,
    },
  }), [BIVO]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={BIVO.ink} strokeWidth={2} strokeLinecap="round">
            <Path d="M6 6L18 18M18 6L6 18" />
          </Svg>
        </View>
        <StageTag>PYYNTÖ PERUTTU</StageTag>
        <Text style={styles.headline}>
          Selvä.{'\n'}
          <Text style={{ color: BIVO.ink2 }}>{name} sai ilmoituksen.</Text>
        </Text>
        <Text style={styles.body}>
          Mitään ei veloitettu. Voit kysyä uudestaan myöhemmin.
        </Text>
      </View>

      <StickyCTA onPress={() => router.replace('/(tabs)')}>
        Takaisin etsimään
      </StickyCTA>
    </View>
  );
}
