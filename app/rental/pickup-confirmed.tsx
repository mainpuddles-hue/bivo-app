import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { TopNav, Sheet, StickyCTA, StageTag, Eyebrow } from '@/components/rental';
import { useLegacyTokens } from '@/lib/rental/theme';
import { useI18n } from '@/lib/i18n';

export default function PickupConfirmedScreen() {
  const BIVO = useLegacyTokens();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { rentalId, itemTitle, returnDate, ownerName } = useLocalSearchParams<{
    rentalId?: string; itemTitle?: string; returnDate?: string; ownerName?: string;
  }>();

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 160 },
    hero: { alignItems: 'center' },
    iconCircle: {
      width: 92, height: 92, borderRadius: 999, backgroundColor: BIVO.ink,
      alignItems: 'center', justifyContent: 'center',
    },
    headline: {
      fontSize: 34, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.02 * 34, textAlign: 'center', color: BIVO.ink,
      lineHeight: 34 * 1.05, marginTop: 8,
    },
    sub: { fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 10 },
    sheet: { marginTop: 24 },
    checklistArea: { marginTop: 14, gap: 12 },
    checkItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    bullet: { width: 6, height: 6, borderRadius: 999, backgroundColor: BIVO.ink },
    checkText: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink },
  }), [BIVO]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title={t('rentalFlow.pickupConfirmedTitle')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            <Svg width={46} height={46} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M20 6L9 17l-5-5" />
            </Svg>
          </View>
          <StageTag style={{ marginTop: 48 }}>{t('rentalFlow.pickupConfirmedTag')}</StageTag>
          <Text style={styles.headline}>
            {itemTitle ?? t('rentalFlow.itemFallback')} <Text style={{ color: BIVO.ink2 }}>{t('rentalFlow.itemWithYou')}</Text>
            {returnDate ? `\n${t('rentalFlow.untilDate', { date: returnDate })}` : ''}
          </Text>
          <Text style={styles.sub}>
            {t('rentalFlow.returnTo', { date: returnDate ?? '', name: ownerName ?? t('rentalFlow.ownerFallback') })}
          </Text>
        </View>

        <Sheet padding={18} style={styles.sheet}>
          <Eyebrow>{t('rentalFlow.rememberOnReturn')}</Eyebrow>
          <View style={styles.checklistArea}>
            {[
              t('rentalFlow.checklistClean'),
              t('rentalFlow.checklistParts'),
              t('rentalFlow.checklistCondition'),
            ].map((item, i) => (
              <View key={i} style={styles.checkItem}>
                <View style={styles.bullet} />
                <Text style={styles.checkText}>{item}</Text>
              </View>
            ))}
          </View>
        </Sheet>
      </ScrollView>

      <StickyCTA onPress={() => { if (rentalId) router.push(`/rental/${rentalId}`); }}>
        {t('rentalFlow.openActiveRental')}
      </StickyCTA>
    </View>
  );
}
