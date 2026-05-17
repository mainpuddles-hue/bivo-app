import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, Sheet, BigBtn, Pill, Eyebrow, RoundBtn, ProductThumb, ChatIcon, ClockIcon } from '@/components/rental';
import { Avatar } from '@/components/Avatar';
import { useLegacyTokens } from '@/lib/rental/theme';
import { useTheme } from '@/hooks/useTheme';
import { useSupabase } from '@/hooks/useSupabase';
import { useI18n } from '@/lib/i18n';

export default function OwnerActiveScreen() {
  const BIVO = useLegacyTokens();
  const { colors } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const supabase = useSupabase();
  const [rental, setRental] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    supabase
      .from('rental_bookings')
      .select('*, item:items(*), borrower:profiles!rental_bookings_borrower_id_fkey(*)')
      .eq('id', id)
      .single()
      .then(({ data }) => { if (mounted) { setRental(data); setLoading(false); } });
    return () => { mounted = false; };
  }, [id]);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    header: {
      paddingHorizontal: 22, paddingTop: 8, paddingBottom: 16,
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    headerTitle: {
      fontSize: 22, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.44, color: BIVO.ink,
    },
    scroll: { paddingHorizontal: 22, paddingBottom: 120 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
    itemTitle: { fontSize: 16, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    itemSub: { fontSize: 12, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 2 },
    timeSection: { paddingHorizontal: 16, paddingBottom: 16 },
    timeLabelRow: {
      flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8,
    },
    timeLabel: {
      fontSize: 11, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      color: BIVO.ink2, letterSpacing: 0.5,
    },
    progressTrack: {
      height: 6, backgroundColor: BIVO.bg2, borderRadius: 999, position: 'relative',
    },
    progressFill: {
      position: 'absolute', left: 0, top: 0, height: '100%',
      backgroundColor: BIVO.ink, borderRadius: 999,
    },
    progressDot: {
      position: 'absolute', top: -4, width: 14, height: 14, borderRadius: 999,
      backgroundColor: BIVO.ink, borderWidth: 3, borderColor: '#fff',
      marginLeft: -7,
    },
    timeLeft: {
      fontSize: 12, fontFamily: BIVO.sansMedium, fontWeight: '500',
      color: BIVO.ink, marginTop: 10,
    },
    managementGrid: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10,
    },
    mgmtTile: {
      width: '48%', aspectRatio: 1.6, borderRadius: 16,
      backgroundColor: BIVO.surface, borderWidth: 1, borderColor: BIVO.hair2,
      alignItems: 'center', justifyContent: 'center', padding: 12,
    },
    mgmtLabel: {
      fontSize: 13, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      color: BIVO.ink, textAlign: 'center',
    },
    mgmtLabelDanger: {
      fontSize: 13, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      color: colors.destructive, textAlign: 'center',
    },
    mgmtSub: {
      fontSize: 11, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 3, textAlign: 'center',
    },
    weekRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 12,
    },
    weekDot: { width: 8, height: 8, borderRadius: 999 },
    weekLabel: {
      flex: 1, fontSize: 14, fontFamily: BIVO.sansMedium, fontWeight: '500', color: BIVO.ink,
    },
    weekSub: { fontSize: 12, fontFamily: BIVO.sans, color: BIVO.ink2 },
  }), [BIVO, colors]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title={t('rentalFlow.activeRental')} onBack={() => router.back()} />
        <ActivityIndicator style={{ marginTop: 40 }} color={BIVO.ink} />
      </View>
    );
  }

  const borrowerName = rental?.borrower?.name || t('rentalFlow.borrowerFallback');
  const itemTitle = rental?.item?.title || t('rentalFlow.itemFallback');
  const itemImage = rental?.item?.images?.[0]?.image_url;
  const startDate = rental?.start_date ? new Date(rental.start_date) : null;
  const endDate = rental?.end_date ? new Date(rental.end_date) : null;

  const progress = (() => {
    if (!startDate || !endDate) return 0;
    const now = Date.now();
    const total = endDate.getTime() - startDate.getTime();
    if (total <= 0) return 1;
    return Math.min(1, Math.max(0, (now - startDate.getTime()) / total));
  })();

  const hoursLeft = endDate ? Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60))) : null;

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('fi', { weekday: 'short' }).toUpperCase() + ' ' +
    d.toLocaleTimeString('fi', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('rentalFlow.ownerActiveLent')}</Text>
        <Pill tone="live">{borrowerName}lla</Pill>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Sheet padding={0} style={{ overflow: 'hidden' }}>
          <View style={styles.itemRow}>
            <ProductThumb uri={itemImage} size="sm" />
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{itemTitle}</Text>
              <Text style={styles.itemSub}>{borrowerName} · {t('rentalFlow.nearbyFallback')}</Text>
            </View>
            <RoundBtn onPress={() => {
              if (!rental?.conversation_id) {
                Alert.alert(t('rentalFlow.noConversation'), t('rentalFlow.noConversationBody'));
                return;
              }
              router.push(`/chat/${rental.conversation_id}`);
            }}>
              <ChatIcon size={18} />
            </RoundBtn>
          </View>

          <View style={styles.timeSection}>
            <View style={styles.timeLabelRow}>
              {startDate && <Text style={styles.timeLabel}>{t('rentalFlow.pickupLabel2', { date: fmtDate(startDate) })}</Text>}
              {endDate && <Text style={styles.timeLabel}>{t('rentalFlow.returnLabel2', { date: fmtDate(endDate) })}</Text>}
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              <View style={[styles.progressDot, { left: `${progress * 100}%` }]} />
            </View>
            {hoursLeft !== null && (
              <Text style={styles.timeLeft}>
                {t('rentalFlow.hoursLeft', { hours: String(hoursLeft) })}{endDate ? ` · palautus ${endDate.toLocaleDateString('fi', { weekday: 'short' })} ${endDate.toLocaleTimeString('fi', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </Text>
            )}
          </View>
        </Sheet>

        <Eyebrow style={{ marginTop: 20 }}>{t('rentalFlow.management')}</Eyebrow>
        <View style={styles.managementGrid}>
          <TouchableOpacity style={styles.mgmtTile} onPress={() => {
            if (!rental?.conversation_id) {
              Alert.alert(t('rentalFlow.noConversation'), t('rentalFlow.noConversationBody'));
              return;
            }
            router.push(`/chat/${rental.conversation_id}`);
          }}>
            <Text style={styles.mgmtLabel}>{t('rentalFlow.openChat')}</Text>
            <Text style={styles.mgmtSub}>{t('rentalFlow.messages')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mgmtTile} onPress={() => router.push(`/rental/extend?rentalId=${id}`)}>
            <Text style={styles.mgmtLabel}>{t('rentalFlow.extendRental')}</Text>
            <Text style={styles.mgmtSub}>{t('rentalFlow.borrowerCanRequest')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.mgmtTile, { opacity: 0.4 }]} disabled>
            <Text style={styles.mgmtLabel}>{t('rentalFlow.markOverdue')}</Text>
            <Text style={styles.mgmtSub}>{t('rentalFlow.ifDelayed')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mgmtTile}>
            <Text style={styles.mgmtLabelDanger}>{t('rentalFlow.endRental')}</Text>
            <Text style={styles.mgmtSub}>{t('rentalFlow.inEmergency')}</Text>
          </TouchableOpacity>
        </View>

        <Eyebrow style={{ marginTop: 22 }}>{t('rentalFlow.thisWeek')}</Eyebrow>
        <Sheet padding={0} style={{ marginTop: 8 }}>
          <View style={styles.weekRow}>
            <View style={[styles.weekDot, { backgroundColor: BIVO.live }]} />
            <Text style={styles.weekLabel}>{itemTitle}</Text>
            <Text style={styles.weekSub}>
              {borrowerName}lla{endDate ? ` · ${endDate.toLocaleDateString('fi', { weekday: 'short' })} asti` : ''}
            </Text>
          </View>
        </Sheet>
      </ScrollView>
    </View>
  );
}
