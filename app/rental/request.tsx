import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, Sheet, Pill, Eyebrow, ProductThumb, StickyCTA, CheckIcon } from '@/components/rental';
import { useLegacyTokens } from '@/lib/rental/theme';
import { createRentalRequest, cancelRental, formatDate, isoDate, addDays } from '@/lib/rental';
import { startRentalCheckout } from '@/lib/rental/stripe';
import { triggerPush } from '@/lib/pushTrigger';
import { useSupabase } from '@/hooks/useSupabase';
import { useI18n } from '@/lib/i18n';

interface ItemData {
  id: string;
  title: string;
  owner_id: string;
  daily_fee: number | null;
  deposit_amount: number | null;
  is_free: boolean;
  location: string | null;
  images: { image_url: string }[] | null;
  owner: { name: string } | null;
}

interface PickupOption {
  key: string;
  label: string;
  iso: string;
}

interface DurationOption {
  key: string;
  days: number;
}

function getPickupOptions(t: (key: string) => string): PickupOption[] {
  const today = isoDate(new Date());
  return [
    { key: 'today', label: t('rentalFlow.today'), iso: today },
    { key: 'tomorrow', label: t('rentalFlow.tomorrow'), iso: addDays(today, 1) },
    { key: 'overmorrow', label: t('rentalFlow.dayAfterTomorrow'), iso: addDays(today, 2) },
  ];
}

// Max 6 vrk koska Stripe authorization hold vanhenee 7 vrk:ssa.
// MVP-vaiheessa pitää captere/uudistaa hold ennen vanhentumista.
const DURATIONS: DurationOption[] = [
  { key: '1', days: 1 },
  { key: '2', days: 2 },
  { key: '3', days: 3 },
  { key: '4', days: 4 },
  { key: '5', days: 5 },
  { key: '6', days: 6 },
];

const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=400&q=80&auto=format';

export default function RequestScreen() {
  const BIVO = useLegacyTokens();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const supabase = useSupabase();

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setUserId(session?.user?.id ?? null);
      setUserName(session?.user?.user_metadata?.name ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const [item, setItem] = useState<ItemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const pickupOptions = useMemo(() => getPickupOptions(t), [t]);
  const [pickup, setPickup] = useState(pickupOptions[1]); // default: huomenna
  const [duration, setDuration] = useState(DURATIONS[1]); // default: 2 vrk
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('items')
          .select('id, title, owner_id, daily_fee, deposit_amount, is_free, location, images(image_url), owner:profiles!owner_id(name)')
          .eq('id', itemId)
          .maybeSingle();
        if (cancelled) return;
        setItem(data as ItemData | null);
      } catch {
        // query error logged internally
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [itemId]);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    errorTitle: { fontSize: 22, fontWeight: '700', fontFamily: BIVO.sansBold, color: BIVO.ink, textAlign: 'center', letterSpacing: -0.4 },
    errorBody: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink2, textAlign: 'center', marginTop: 10, lineHeight: 20, maxWidth: 280 },
    itemCard: { marginTop: 4 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    itemTitle: { fontSize: 15, fontWeight: '600', fontFamily: BIVO.sansSemiBold, color: BIVO.ink },
    itemSub: { fontSize: 12, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 2 },
    itemPrice: { fontSize: 12, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 2 },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    messageField: {
      marginTop: 10, paddingHorizontal: 16, paddingVertical: 14,
      borderRadius: 18, backgroundColor: BIVO.surface,
      borderWidth: 1, borderColor: BIVO.hair2,
      fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink, minHeight: 100, lineHeight: 21,
      textAlignVertical: 'top',
    },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
    summaryBorder: { borderTopWidth: 1, borderTopColor: BIVO.hair },
    summaryLabel: { fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2 },
    summaryValue: { fontSize: 13, fontWeight: '600', fontFamily: BIVO.sansSemiBold, color: BIVO.ink },
    summaryTotal: { paddingTop: 12 },
    summaryTotalLabel: { fontSize: 15, fontWeight: '600', fontFamily: BIVO.sansSemiBold, color: BIVO.ink },
    summaryTotalValue: { fontSize: 17, fontWeight: '700', fontFamily: BIVO.sansBold, color: BIVO.ink, letterSpacing: -0.3 },
    termsRow: {
      flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 20,
    },
    termsCheck: {
      width: 22, height: 22, borderRadius: 6, backgroundColor: BIVO.ink,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    termsText: {
      flex: 1, fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2, lineHeight: 19,
    },
  }), [BIVO]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: BIVO.ink2, fontFamily: BIVO.sans }}>{t('rentalFlow.loading')}</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, padding: 32, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.errorTitle}>{t('rentalFlow.itemNotFound')}</Text>
        <Text style={styles.errorBody}>{t('rentalFlow.linkExpired')}</Text>
      </View>
    );
  }

  if (item.is_free) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, padding: 32, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.errorTitle}>{t('rentalFlow.itemIsFree')}</Text>
        <Text style={styles.errorBody}>{t('rentalFlow.freeItemsBookDifferently')}</Text>
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, padding: 32, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.errorTitle}>{t('rentalFlow.loginRequired')}</Text>
        <Text style={styles.errorBody}>{t('rentalFlow.loginRequiredBody')}</Text>
      </View>
    );
  }

  if (item.owner_id === userId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, padding: 32, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.errorTitle}>{t('rentalFlow.ownListing')}</Text>
        <Text style={styles.errorBody}>{t('rentalFlow.cannotBorrowOwnItem')}</Text>
      </View>
    );
  }

  const endDateIso = addDays(pickup.iso, duration.days);
  const totalFee = (item.daily_fee ?? 0) * duration.days;
  const deposit = item.deposit_amount ?? 0;

  const handleSubmit = async () => {
    setSubmitting(true);
    // 1) Luo pending-pyyntö-rivi
    const result = await createRentalRequest(supabase, {
      itemId: item.id,
      borrowerId: userId,
      lenderId: item.owner_id,
      startDate: pickup.iso,
      endDate: endDateIso,
      dailyFee: item.daily_fee ?? 0,
      depositAmount: deposit,
      notes: message.trim() || undefined,
    });

    if ('error' in result) {
      setSubmitting(false);
      Alert.alert(t('rentalFlow.requestFailed'), result.error);
      return;
    }

    // 2) Avaa Stripe-checkout — manual capture eli kortilta pidätetään,
    //    mutta raha siirtyy omistajalle vasta kun he hyväksyvät pyynnön.
    const pay = await startRentalCheckout(supabase, result.id);
    setSubmitting(false);

    if (pay.errorCode === 'lender_not_onboarded') {
      // Erikoistapaus: omistaja ei vielä viimeistellyt Stripe-onboardingia.
      Alert.alert(
        t('rentalFlow.lenderNotOnboarded'),
        t('rentalFlow.lenderNotOnboardedBody', { name: item.owner?.name ?? t('rentalFlow.ownerFallback') }),
      );
      // Peruuta pending-rivi jottei jää roikkumaan ilman maksua
      await cancelRental(supabase, result.id);
      return;
    }
    if (pay.error) {
      Alert.alert(t('rentalFlow.paymentFailed'), pay.error);
      await cancelRental(supabase, result.id);
      return;
    }
    if (pay.cancelled) {
      try {
        await cancelRental(supabase, result.id);
      } catch {
        Alert.alert(t('rentalFlow.cancellationFailed'), t('rentalFlow.cancellationFailedBody'));
        return;
      }
      router.back();
      return;
    }

    // Maksu auth-holdattu — pyyntö on nyt aidosti pending.
    // Lähetä push omistajalle (fire-and-forget, ei estä navigointia)
    triggerPush({
      user_id: item.owner_id,
      title: t('rentalFlow.pushNewRequestTitle'),
      body: t('rentalFlow.pushNewRequestBody', { name: userName ?? t('rentalFlow.neighborFallback'), item: item.title }),
      type: 'rental_request',
      data: { booking_id: result.id, item_id: item.id },
    }).catch(() => { /* hiljainen */ });

    router.replace(`/rental/${result.id}`);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <TopNav title={t('rentalFlow.requestTitle')} onBack={() => router.back()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 160 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Tuote-yhteenveto */}
        <Sheet padding={14} style={styles.itemCard}>
          <View style={styles.itemRow}>
            <ProductThumb uri={item.images?.[0]?.image_url ?? PLACEHOLDER_IMG} size="sm" />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemSub}>
                {item.owner?.name ?? t('rentalFlow.neighborFallback')} · {item.location ?? t('rentalFlow.nearbyFallback')}
              </Text>
              <Text style={styles.itemPrice}>
                {t('rentalFlow.perDay', { fee: String(item.daily_fee), deposit: String(deposit) })}
              </Text>
            </View>
          </View>
        </Sheet>

        {/* Nouto-päivä */}
        <Eyebrow style={{ marginTop: 22 }}>{t('rentalFlow.pickupLabel')}</Eyebrow>
        <View style={styles.pillRow}>
          {pickupOptions.map((p) => (
            <TouchableOpacity key={p.key} onPress={() => setPickup(p)} activeOpacity={0.7}>
              <Pill tone={pickup.key === p.key ? 'on' : 'off'}>{p.label}</Pill>
            </TouchableOpacity>
          ))}
        </View>

        {/* Kesto */}
        <Eyebrow style={{ marginTop: 18 }}>{t('rentalFlow.durationLabel')}</Eyebrow>
        <View style={styles.pillRow}>
          {DURATIONS.map((d) => (
            <TouchableOpacity key={d.key} onPress={() => setDuration(d)} activeOpacity={0.7}>
              <Pill tone={duration.key === d.key ? 'on' : 'off'}>{t('rentalFlow.durationDays', { days: String(d.days) })}</Pill>
            </TouchableOpacity>
          ))}
        </View>

        {/* Viesti */}
        <Eyebrow style={{ marginTop: 18 }}>{t('rentalFlow.messageTo', { name: item.owner?.name ?? t('rentalFlow.ownerFallback') })}</Eyebrow>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder={t('rentalFlow.messagePlaceholder')}
          placeholderTextColor={BIVO.ink3}
          style={styles.messageField}
          multiline
          maxLength={500}
        />

        {/* Yhteenveto */}
        <Sheet padding={16} style={{ marginTop: 22 }}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t('rentalFlow.loanDuration')}</Text>
            <Text style={styles.summaryValue}>
              {formatDate(pickup.iso)} → {formatDate(endDateIso)}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryBorder]}>
            <Text style={styles.summaryLabel}>{t('rentalFlow.rentalFeeDays', { days: String(duration.days) })}</Text>
            <Text style={styles.summaryValue}>{totalFee} €</Text>
          </View>
          {deposit > 0 && (
            <View style={[styles.summaryRow, styles.summaryBorder]}>
              <Text style={styles.summaryLabel}>{t('rentalFlow.depositNotCharged')}</Text>
              <Text style={[styles.summaryValue, { color: BIVO.ink3 }]}>{deposit} €</Text>
            </View>
          )}
          <View style={[styles.summaryRow, styles.summaryBorder, styles.summaryTotal]}>
            <Text style={styles.summaryTotalLabel}>{t('rentalFlow.totalCharged')}</Text>
            <Text style={styles.summaryTotalValue}>{totalFee} €</Text>
          </View>
        </Sheet>

        <View style={styles.termsRow}>
          <View style={styles.termsCheck}>
            <CheckIcon size={14} color="#fff" />
          </View>
          <Text style={styles.termsText}>
            {t('rentalFlow.termsAcceptance')}
          </Text>
        </View>
      </ScrollView>

      <StickyCTA
        onPress={handleSubmit}
        disabled={submitting}
        hint={t('rentalFlow.ctaHint', { fee: String(totalFee), owner: item.owner?.name ?? t('rentalFlow.ownerFallback') })}
      >
        {submitting ? t('rentalFlow.openingPayment') : t('rentalFlow.payAndSend', { fee: String(totalFee) })}
      </StickyCTA>
    </KeyboardAvoidingView>
  );
}
