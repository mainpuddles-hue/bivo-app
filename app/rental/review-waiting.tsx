import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle as SvgCircle, Path } from 'react-native-svg';
import { TopNav, Sheet, StickyCTA, StageTag, Eyebrow } from '@/components/rental';
import { Avatar } from '@/components/Avatar';
import { useLegacyTokens } from '@/lib/rental/theme';

export default function ReviewWaitingScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ownerName, ownerAvatar } = useLocalSearchParams<{
    ownerName?: string; ownerAvatar?: string;
  }>();

  const name = ownerName ?? 'toisen osapuolen';

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 160 },
    hero: { alignItems: 'center' },
    iconCircle: {
      width: 92, height: 92, borderRadius: 999, backgroundColor: BIVO.surface,
      borderWidth: 1, borderColor: BIVO.hair2,
      alignItems: 'center', justifyContent: 'center',
    },
    headline: {
      fontSize: 32, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.02 * 32, textAlign: 'center', color: BIVO.ink,
      lineHeight: 32 * 1.05, marginTop: 8,
    },
    body: {
      fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2,
      textAlign: 'center', maxWidth: 280, lineHeight: 13 * 1.45, marginTop: 12,
    },
    sheet: { marginTop: 24 },
    blurBox: {
      marginTop: 14, padding: 16, borderRadius: 14, backgroundColor: BIVO.surface,
    },
    blurText: {
      fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2, lineHeight: 13 * 1.5,
    },
    ownerCard: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
    ownerName: { fontSize: 13, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    ownerSub: { fontSize: 11, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 2 },
  }), [BIVO]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title="Arviointi" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={BIVO.ink} strokeWidth={1.6} strokeLinecap="round">
              <SvgCircle cx={12} cy={12} r={9} />
              <Path d="M12 7v5l3 2" />
            </Svg>
          </View>
          <StageTag style={{ marginTop: 48 }}>ARVIO LÄHETETTY</StageTag>
          <Text style={styles.headline}>
            Odotetaan{'\n'}
            <Text style={{ color: BIVO.ink2 }}>{name}n arviota</Text>
          </Text>
          <Text style={styles.body}>
            Arviot paljastetaan molemmille kun {name} on myös arvioinut sinut. Näin pidetään ne rehellisinä.
          </Text>
        </View>

        <Sheet padding={18} style={styles.sheet}>
          <Eyebrow>Sinun arviosi · piilotettu</Eyebrow>
          <View style={styles.blurBox}>
            <Text style={styles.blurText}>
              Arviosi paljastetaan kun molemmat ovat arvioineet.
            </Text>
          </View>
        </Sheet>

        <Sheet padding={14} style={styles.ownerCard}>
          <Avatar url={ownerAvatar} name={name} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={styles.ownerName}>{name} · ei vielä arvioinut</Text>
            <Text style={styles.ownerSub}>Yleensä 1–2 päivän kuluessa</Text>
          </View>
        </Sheet>
      </ScrollView>

      <StickyCTA secondary onPress={() => router.replace('/(tabs)')}>
        Palaa etusivulle
      </StickyCTA>
    </View>
  );
}
