import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { TopNav, Sheet, BigBtn, StageTag, Eyebrow, RoundBtn, ChatIcon } from '@/components/rental';
import { Avatar } from '@/components/Avatar';
import { useLegacyTokens } from '@/lib/rental/theme';

export default function OverdueBorrowerScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    ownerName = 'Maria',
    itemTitle = 'Porakone',
    hoursLate = '4',
    minutesLate = '12',
    deposit = '30',
    charged = '6',
    remaining = '24',
    ownerId,
    rentalId,
    conversationId,
  } = useLocalSearchParams<{
    ownerName?: string; itemTitle?: string;
    hoursLate?: string; minutesLate?: string;
    deposit?: string; charged?: string; remaining?: string;
    ownerId?: string; rentalId?: string; conversationId?: string;
  }>();

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 200 },
    hero: { alignItems: 'center' },
    iconCircle: {
      width: 92, height: 92, borderRadius: 999, backgroundColor: BIVO.ink,
      alignItems: 'center', justifyContent: 'center',
    },
    headline: {
      fontSize: 30, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.02 * 30, color: BIVO.ink, lineHeight: 30 * 1.05,
      marginTop: 8, textAlign: 'center', maxWidth: 300,
    },
    body: {
      fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2,
      marginTop: 12, maxWidth: 280, lineHeight: 13 * 1.5, textAlign: 'center',
    },
    feeSheet: { marginTop: 24 },
    feeRow: {
      flexDirection: 'row', justifyContent: 'space-between',
      paddingHorizontal: 18, paddingVertical: 13,
    },
    feeBorder: { borderBottomWidth: 1, borderBottomColor: BIVO.hair },
    feeLabel: { fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2 },
    feeValue: { fontSize: 13, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink, fontVariant: ['tabular-nums'] },
    feeValueBold: { fontFamily: BIVO.sansSemiBold, fontWeight: '600' },
    ownerCard: {
      marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
    },
    ownerName: { fontSize: 13, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    ownerSub: { fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 2 },
    ctaArea: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      paddingHorizontal: 22, gap: 10, backgroundColor: BIVO.bg, paddingTop: 16,
    },
  }), [BIVO]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title="Laina · myöhässä" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.6}>
              <Circle cx={12} cy={12} r={9} />
              <Path d="M12 7v5l3 2" />
            </Svg>
          </View>
          <StageTag style={{ marginTop: 24 }}>{hoursLate} T {minutesLate} MIN MYÖHÄSSÄ</StageTag>
          <Text style={styles.headline}>
            Palauta {itemTitle.toLowerCase()}{'\n'}
            <Text style={{ color: BIVO.ink2 }}>{ownerName}lle</Text>
          </Text>
          <Text style={styles.body}>
            Sovittu palautus oli su klo 19.00. Jokainen alkava tunti veloittaa 1,5 € vakuudesta.
          </Text>
        </View>

        <Sheet padding={0} style={styles.feeSheet}>
          {[
            { l: 'Vakuus', v: `${deposit} €` },
            { l: 'Veloitettu nyt', v: `${charged} €`, bold: true },
            { l: 'Jäljellä', v: `${remaining} €` },
          ].map((r, i, a) => (
            <View key={r.l} style={[styles.feeRow, i < a.length - 1 && styles.feeBorder]}>
              <Text style={styles.feeLabel}>{r.l}</Text>
              <Text style={[styles.feeValue, r.bold && styles.feeValueBold]}>{r.v}</Text>
            </View>
          ))}
        </Sheet>

        <Sheet padding={14} style={styles.ownerCard}>
          <Avatar url={null} name={ownerName} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={styles.ownerName}>{ownerName} odottaa.</Text>
            <Text style={styles.ownerSub}>Lähetä viesti kun olet matkalla.</Text>
          </View>
          <RoundBtn size={36} onPress={() => {
            if (conversationId) router.push(`/chat/${conversationId}`);
          }}>
            <ChatIcon size={16} />
          </RoundBtn>
        </Sheet>
      </ScrollView>

      <View style={[styles.ctaArea, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <BigBtn onPress={() => router.back()}>Olen matkalla</BigBtn>
        <BigBtn secondary onPress={() => {
          if (rentalId) router.push(`/rental/extend?rentalId=${rentalId}`);
        }}>Pyydä virallinen pidennys</BigBtn>
      </View>
    </View>
  );
}
