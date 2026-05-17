import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, Sheet, BigBtn, Pill, Eyebrow, StageTag, CheckIcon } from '@/components/rental';
import { useLegacyTokens } from '@/lib/rental/theme';
import { useSupabase } from '@/hooks/useSupabase';
import { confirmReceipt } from '@/lib/rental';
import { useI18n } from '@/lib/i18n';
import { useToast } from '@/components/Toast';

type Condition = 'ok' | 'minor' | 'damaged';

const CONDITIONS: { key: Condition; labelKey: string; descKey: string }[] = [
  { key: 'ok', labelKey: 'rentalFlow.conditionOk', descKey: 'rentalFlow.conditionOkDesc' },
  { key: 'minor', labelKey: 'rentalFlow.conditionMinor', descKey: 'rentalFlow.conditionMinorDesc' },
  { key: 'damaged', labelKey: 'rentalFlow.conditionDamaged', descKey: 'rentalFlow.conditionDamagedDesc' },
];

export default function OwnerReturnScreen() {
  const BIVO = useLegacyTokens();
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const supabase = useSupabase();
  const [condition, setCondition] = useState<Condition>('ok');
  const [submitting, setSubmitting] = useState(false);
  const [rental, setRental] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    supabase.from('rental_bookings')
      .select('*, item:items(title), borrower:profiles!rental_bookings_borrower_id_fkey(name)')
      .eq('id', id).single()
      .then(({ data }) => { if (mounted) setRental(data); });
    return () => { mounted = false; };
  }, [id]);

  const borrowerName = rental?.borrower?.name || t('rentalFlow.borrowerFallback');
  const itemTitle = rental?.item?.title ?? t('rentalFlow.itemFallback');
  const depositAmount = rental?.deposit_amount != null
    ? `${rental.deposit_amount} €`
    : '30 €';

  const handleConfirm = async () => {
    if (!id) return;
    setSubmitting(true);

    if (condition === 'damaged') {
      setSubmitting(false);
      toast.show({ message: t('rentalFlow.damageReportBody'), type: 'info' });
      return;
    }

    const { error: confirmError } = await confirmReceipt(supabase, id);
    setSubmitting(false);
    const error = confirmError ? { message: confirmError } : null;

    if (error) {
      toast.show({ message: error.message, type: 'error' });
      return;
    }
    toast.show({ message: t('rentalFlow.depositReleasedToBorrower'), type: 'success' });
    router.back();
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 120 },
    heroSection: { alignItems: 'center', marginTop: 12, marginBottom: 24 },
    heroIcon: {
      width: 84, height: 84, borderRadius: 999,
      backgroundColor: BIVO.surface, borderWidth: 1, borderColor: BIVO.hair2,
      alignItems: 'center', justifyContent: 'center',
    },
    heroIconText: { fontSize: 40, color: BIVO.ink },
    heroTitle: {
      fontSize: 24, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.48, color: BIVO.ink, textAlign: 'center',
      lineHeight: 30, marginTop: 14,
    },
    scanConfirm: {
      flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center',
      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
      backgroundColor: BIVO.surface, borderWidth: 1, borderColor: BIVO.hair2,
    },
    scanCheck: {
      width: 22, height: 22, borderRadius: 999, backgroundColor: BIVO.live,
      alignItems: 'center', justifyContent: 'center',
    },
    scanText: { fontSize: 13, fontFamily: BIVO.sansMedium, fontWeight: '500', color: BIVO.ink },
    condCard: { marginBottom: 10, borderWidth: 1, borderColor: BIVO.hair2, marginTop: 8 },
    condCardSelected: { borderWidth: 2, borderColor: BIVO.ink },
    condRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    checkbox: {
      width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: BIVO.hair2,
      alignItems: 'center', justifyContent: 'center',
    },
    checkboxSelected: { backgroundColor: BIVO.ink, borderColor: BIVO.ink },
    condText: { flex: 1 },
    condLabel: { fontSize: 15, fontFamily: BIVO.sansMedium, fontWeight: '500', color: BIVO.ink },
    condLabelSelected: { fontFamily: BIVO.sansSemiBold, fontWeight: '600' },
    condDesc: { fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 3 },
    depositRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    depositLabel: {
      fontSize: 11, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      color: BIVO.ink2, letterSpacing: 0.7, textTransform: 'uppercase',
    },
    depositAmount: {
      fontSize: 28, fontFamily: BIVO.sansBold, fontWeight: '700',
      color: BIVO.ink, letterSpacing: -0.56, marginTop: 4,
    },
    btnRow: {
      flexDirection: 'row', gap: 8, marginTop: 14, paddingTop: 14,
      borderTopWidth: 1, borderTopColor: BIVO.hair,
    },
  }), [BIVO]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title={t('rentalFlow.ownerReturnTitle')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <View style={styles.heroIcon}>
            <Text style={styles.heroIconText}>↩</Text>
          </View>
          <StageTag style={{ marginTop: 24 }}>{t('rentalFlow.borrowerReturns', { name: borrowerName.toUpperCase() })}</StageTag>
          <Text style={styles.heroTitle}>
            {t('rentalFlow.inspectAndRelease', { item: itemTitle.toLowerCase() }).split('\n')[0]}{'\n'}
            <Text style={{ color: BIVO.ink2 }}>{t('rentalFlow.inspectAndRelease', { item: itemTitle.toLowerCase() }).split('\n')[1]}</Text>
          </Text>
        </View>

        <View style={styles.scanConfirm}>
          <View style={styles.scanCheck}>
            <CheckIcon size={12} color="#fff" />
          </View>
          <Text style={styles.scanText}>{t('rentalFlow.qrScanned')}</Text>
        </View>

        <Eyebrow style={{ marginTop: 22 }}>{t('rentalFlow.conditionChecklist')}</Eyebrow>
        {CONDITIONS.map((c) => {
          const selected = condition === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => setCondition(c.key)}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Sheet padding={18} style={selected ? [styles.condCard, styles.condCardSelected] : styles.condCard}>
                <View style={styles.condRow}>
                  <View style={selected ? [styles.checkbox, styles.checkboxSelected] : styles.checkbox}>
                    {selected && <CheckIcon size={14} color="#fff" />}
                  </View>
                  <View style={styles.condText}>
                    <Text style={[styles.condLabel, selected && styles.condLabelSelected]}>{t(c.labelKey)}</Text>
                    <Text style={styles.condDesc}>{t(c.descKey)}</Text>
                  </View>
                </View>
              </Sheet>
            </TouchableOpacity>
          );
        })}

        <Eyebrow style={{ marginTop: 22 }}>{t('rentalFlow.depositSection')}</Eyebrow>
        <Sheet padding={16} style={{ marginTop: 8 }}>
          <View style={styles.depositRow}>
            <View>
              <Text style={styles.depositLabel}>{t('rentalFlow.held')}</Text>
              <Text style={styles.depositAmount}>{depositAmount}</Text>
            </View>
            {condition === 'ok' && <Pill tone="soft">{t('rentalFlow.releasedImmediately')}</Pill>}
          </View>
          <View style={styles.btnRow}>
            <BigBtn secondary onPress={() => {}} disabled={submitting} style={{ flex: 1 }}>
              {t('rentalFlow.chargePartial')}
            </BigBtn>
            <BigBtn onPress={handleConfirm} disabled={submitting} style={{ flex: 1.4 }}>
              {submitting ? t('rentalFlow.sendingReview') : t('rentalFlow.releaseDeposit')}
            </BigBtn>
          </View>
        </Sheet>
      </ScrollView>
    </View>
  );
}
