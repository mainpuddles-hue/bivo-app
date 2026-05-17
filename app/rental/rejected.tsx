import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { TopNav, Sheet, BigBtn, StageTag, Eyebrow } from '@/components/rental';
import { useLegacyTokens } from '@/lib/rental/theme';
import { useI18n } from '@/lib/i18n';

export default function RejectedScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { ownerName, ownerMessage, itemTitle } = useLocalSearchParams<{
    ownerName?: string; ownerMessage?: string; itemTitle?: string;
  }>();

  const name = ownerName ?? t('rentalFlow.ownerFallback');

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 200 },
    hero: { alignItems: 'center' },
    iconCircle: {
      width: 92, height: 92, borderRadius: 999, backgroundColor: BIVO.surface,
      borderWidth: 1.5, borderColor: BIVO.hair2,
      alignItems: 'center', justifyContent: 'center',
    },
    headline: {
      fontSize: 32, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.02 * 32, textAlign: 'center', color: BIVO.ink,
      lineHeight: 32 * 1.05, marginTop: 8,
    },
    body: {
      fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2,
      textAlign: 'center', maxWidth: 280, marginTop: 12, lineHeight: 13 * 1.45,
    },
    messageSheet: { marginTop: 24 },
    messageText: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink, marginTop: 12, lineHeight: 14 * 1.5 },
    ctaArea: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      paddingHorizontal: 22, gap: 10, backgroundColor: BIVO.bg, paddingTop: 16,
    },
  }), [BIVO]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title={t('rentalFlow.rejectedTitle')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={BIVO.ink} strokeWidth={2} strokeLinecap="round">
              <Path d="M6 6L18 18M18 6L6 18" />
            </Svg>
          </View>
          <StageTag style={{ marginTop: 48 }}>{t('rentalFlow.notThisTime')}</StageTag>
          <Text style={styles.headline}>
            {t('rentalFlow.ownerCouldntLend', { name })}
          </Text>
          <Text style={styles.body}>
            {t('rentalFlow.depositCancelledBody', { item: itemTitle ?? t('rentalFlow.itemFallback').toLowerCase() })}
          </Text>
        </View>

        {ownerMessage ? (
          <Sheet padding={16} style={styles.messageSheet}>
            <Eyebrow>{t('rentalFlow.ownersMessage', { name })}</Eyebrow>
            <Text style={styles.messageText}>{ownerMessage}</Text>
          </Sheet>
        ) : null}
      </ScrollView>

      <View style={[styles.ctaArea, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <BigBtn onPress={() => router.replace('/search')}>{t('rentalFlow.searchAnother', { item: itemTitle ?? t('rentalFlow.itemFallback').toLowerCase() })}</BigBtn>
        <BigBtn secondary onPress={() => router.back()}>{t('rentalFlow.backToLoans')}</BigBtn>
      </View>
    </View>
  );
}
