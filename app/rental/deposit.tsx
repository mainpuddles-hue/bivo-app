import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, Sheet, StickyCTA, StageTag } from '@/components/rental';
import { useLegacyTokens } from '@/lib/rental/theme';
import { useI18n } from '@/lib/i18n';

export default function DepositScreen() {
  const BIVO = useLegacyTokens();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { deposit = '30', rentalId } = useLocalSearchParams<{ deposit?: string; rentalId?: string }>();
  const amount = Number(deposit) || 30;

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 160 },
    hero: { alignItems: 'center', paddingTop: 14 },
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
    row: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, paddingHorizontal: 18 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: BIVO.hair },
    rowLabel: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink2 },
    rowValue: { fontSize: 14, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    totalRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 18, paddingVertical: 16,
      backgroundColor: BIVO.surface, borderTopWidth: 1, borderTopColor: BIVO.hair2,
    },
    totalLabel: { fontSize: 14, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    totalValue: { fontSize: 22, fontFamily: BIVO.sansSemiBold, fontWeight: '600', letterSpacing: -0.02 * 22, color: BIVO.ink },
    cardRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
    visaBadge: {
      width: 38, height: 26, borderRadius: 5, backgroundColor: BIVO.ink,
      alignItems: 'center', justifyContent: 'center',
    },
    visaText: { fontSize: 10, fontFamily: BIVO.sansBold, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
    cardNumber: { fontSize: 13, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    cardExp: { fontSize: 11, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 2 },
    changeLink: { fontSize: 12, fontFamily: BIVO.sans, color: BIVO.ink2 },
  }), [BIVO]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title={t('rentalFlow.depositTitle')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <StageTag style={{ marginTop: 8 }}>{t('rentalFlow.confirmDeposit')}</StageTag>
          <Text style={styles.headline}>
            {amount} € <Text style={{ color: BIVO.ink2 }}>{t('rentalFlow.amountReserved')}</Text>
            {'\n'}{t('rentalFlow.fromYourCard')}
          </Text>
          <Text style={styles.body}>
            {t('rentalFlow.reservedNotCharged')}
          </Text>
        </View>

        <Sheet padding={0} style={styles.sheet}>
          {[
            { l: t('rentalFlow.rentalFeeLabel'), v: '0 €' },
            { l: t('rentalFlow.depositReserved'), v: `${amount} €` },
            { l: t('rentalFlow.serviceFee'), v: '0 €' },
          ].map((r, i, a) => (
            <View key={r.l} style={[styles.row, i < a.length - 1 && styles.rowBorder]}>
              <Text style={styles.rowLabel}>{r.l}</Text>
              <Text style={styles.rowValue}>{r.v}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('rentalFlow.totalChargedLabel')}</Text>
            <Text style={styles.totalValue}>0 €</Text>
          </View>
        </Sheet>

        <Sheet padding={14} style={styles.cardRow}>
          <View style={styles.visaBadge}>
            <Text style={styles.visaText}>VISA</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardNumber}>•••• 4821</Text>
            <Text style={styles.cardExp}>{t('rentalFlow.validUntil')} 11/27</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/payments')}>
            <Text style={styles.changeLink}>{t('rentalFlow.changeCard')}</Text>
          </TouchableOpacity>
        </Sheet>
      </ScrollView>

      <StickyCTA
        onPress={() => router.back()}
        hint={t('rentalFlow.depositReleaseHint')}
      >
        {t('rentalFlow.confirmAndSend')}
      </StickyCTA>
    </View>
  );
}
