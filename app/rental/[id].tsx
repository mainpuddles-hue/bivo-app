import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, Alert, TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, Sheet, BigBtn, CheckIcon } from '@/components/rental';
import { useLegacyTokens, type LegacyTokens } from '@/lib/rental/theme';
import {
  useRentalBooking, formatDate, approveRental, rejectRental, cancelRental,
  markReturned, confirmReceipt, useReviewsForBooking,
} from '@/lib/rental';
import { triggerPush } from '@/lib/pushTrigger';
import { useSupabase } from '@/hooks/useSupabase';
import { useI18n } from '@/lib/i18n';

interface ItemData {
  id: string;
  title: string;
  owner_id: string;
  owner: { name: string } | null;
}

export default function RentalStatusScreen() {
  const BIVO = useLegacyTokens();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const supabase = useSupabase();

  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setUserId(session?.user?.id ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const { booking, loading } = useRentalBooking(supabase, id);
  const [item, setItem] = useState<ItemData | null>(null);
  const { reviews } = useReviewsForBooking(supabase, id);

  useEffect(() => {
    if (!booking?.item_id) return;
    let mounted = true;
    supabase
      .from('items')
      .select('id, title, owner_id, owner:profiles!owner_id(name)')
      .eq('id', booking.item_id)
      .maybeSingle()
      .then(({ data }) => { if (mounted) setItem(data as ItemData | null); });
    return () => { mounted = false; };
  }, [booking?.item_id]);

  const styles = useMemo(() => createStyles(BIVO), [BIVO]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={BIVO.ink} />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title="" onBack={() => router.back()} />
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>{t('rentalFlow.requestNotFound')}</Text>
        </View>
      </View>
    );
  }

  const isBorrower = userId === booking.borrower_id;
  const isLender = userId === booking.lender_id;
  const counterpartName = isBorrower ? (item?.owner?.name ?? t('rentalFlow.ownerFallback')) : t('rentalFlow.borrowerFallback');

  const statusContent = renderStatusContent(booking.status, counterpartName, isLender, BIVO, styles, t);

  const handleApprove = () => {
    Alert.alert(
      t('rentalFlow.approveRequest'),
      t('rentalFlow.approveConfirmBody', { item: item?.title ?? t('rentalFlow.itemFallback'), date: formatDate(booking.start_date), days: String(booking.days) }),
      [
        { text: t('rentalFlow.cancelNo'), style: 'cancel' },
        {
          text: t('rentalFlow.approveRequest'),
          onPress: async () => {
            const res = await approveRental(supabase, booking.id);
            if (res.error) {
              Alert.alert(t('rentalFlow.approveFailed'), res.error);
              return;
            }
            // Push lainaajalle (fire-and-forget)
            triggerPush({
              user_id: booking.borrower_id,
              title: t('rentalFlow.pushApprovedTitle'),
              body: t('rentalFlow.pushApprovedBody', { item: item?.title ?? t('rentalFlow.itemFallback') }),
              type: 'rental_approved',
              data: { booking_id: booking.id, conversation_id: res.conversationId ?? '' },
            }).catch(() => { /* hiljainen */ });
          },
        },
      ],
    );
  };

  const handleReject = () => {
    Alert.alert(
      t('rentalFlow.rejectRequest'),
      t('rentalFlow.rejectConfirmBody'),
      [
        { text: t('rentalFlow.cancelNo'), style: 'cancel' },
        {
          text: t('rentalFlow.rejectRequest'),
          style: 'destructive',
          onPress: async () => {
            const res = await rejectRental(supabase, booking.id);
            if (res.error) {
              Alert.alert(t('rentalFlow.rejectFailed'), res.error);
              return;
            }
            triggerPush({
              user_id: booking.borrower_id,
              title: t('rentalFlow.pushRejectedTitle'),
              body: t('rentalFlow.pushRejectedBody', { item: item?.title ?? t('rentalFlow.itemFallback') }),
              type: 'rental_rejected',
              data: { booking_id: booking.id },
            }).catch(() => { /* hiljainen */ });
          },
        },
      ],
    );
  };

  const handleMarkReturned = () => {
    Alert.alert(
      t('rentalFlow.markReturned'),
      t('rentalFlow.markReturnedBody'),
      [
        { text: t('rentalFlow.cancelNo'), style: 'cancel' },
        {
          text: t('rentalFlow.confirmReturn'),
          onPress: async () => {
            const res = await markReturned(supabase, booking.id);
            if (res.error) {
              Alert.alert(t('rentalFlow.returnFailed'), res.error);
              return;
            }
            // Push omistajalle
            triggerPush({
              user_id: booking.lender_id,
              title: t('rentalFlow.pushReturnedTitle'),
              body: t('rentalFlow.pushReturnedBody', { item: item?.title ?? t('rentalFlow.itemFallback') }),
              type: 'rental_returned',
              data: { booking_id: booking.id },
            }).catch(() => {});
          },
        },
      ],
    );
  };

  const handleConfirmReceipt = () => {
    Alert.alert(
      t('rentalFlow.confirmReceipt'),
      t('rentalFlow.confirmReceiptBody', { item: item?.title ?? t('rentalFlow.itemFallback') }),
      [
        { text: t('rentalFlow.cancelNo'), style: 'cancel' },
        {
          text: t('rentalFlow.confirmReceiptBtn'),
          onPress: async () => {
            const res = await confirmReceipt(supabase, booking.id);
            if (res.error) {
              Alert.alert(t('rentalFlow.confirmFailed'), res.error);
              return;
            }
            triggerPush({
              user_id: booking.borrower_id,
              title: t('rentalFlow.pushCompletedTitle'),
              body: t('rentalFlow.pushCompletedBody', { item: item?.title ?? t('rentalFlow.itemFallback') }),
              type: 'rental_completed',
              data: { booking_id: booking.id },
            }).catch(() => {});
          },
        },
      ],
    );
  };

  const handleCancel = () => {
    // Borrower peruuttaa oman pending-pyynnön.
    // Confirmed/active-tilojen peruutus vaatii Stripe-refundin (Stage 5 työ),
    // joten siellä napissa on pelkkä info kunnes flow on rakennettu.
    Alert.alert(
      t('rentalFlow.cancelRequest'),
      t('rentalFlow.cancelConfirmBody'),
      [
        { text: t('rentalFlow.cancelNo'), style: 'cancel' },
        {
          text: t('rentalFlow.cancelRequest'),
          style: 'destructive',
          onPress: async () => {
            const res = await cancelRental(supabase, booking.id);
            if (res.error) Alert.alert(t('rentalFlow.cancelFailed'), res.error);
          },
        },
      ],
    );
  };

  // Cast booking to access DB fields not in the typed interface
  const b = booking as any;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title={t('rentalFlow.rentalTitle')} onBack={() => router.replace('/(tabs)')} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 22, paddingBottom: 60 }}>
        {/* Hero */}
        <View style={styles.hero}>
          {statusContent.icon}
          <Text style={styles.stage}>{statusContent.stage}</Text>
          <Text style={styles.title}>{statusContent.title}</Text>
          {statusContent.subtitle && (
            <Text style={styles.subtitle}>{statusContent.subtitle}</Text>
          )}
        </View>

        {/* Aikajana */}
        <Sheet padding={18} style={{ marginTop: 22 }}>
          <TimelineItem
            label={t('rentalFlow.requestSent')}
            sub={new Date(booking.created_at).toLocaleString('fi-FI', {
              day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
            done
            BIVO={BIVO}
            styles={styles}
          />
          <TimelineItem
            label={t('rentalFlow.approval')}
            sub={booking.status === 'pending' ? t('rentalFlow.pending') :
              ['rejected', 'cancelled'].includes(booking.status) ? t('rentalFlow.rejected') :
              ['confirmed', 'paid', 'completed'].includes(booking.status) ? t('rentalFlow.approved') : '—'}
            done={!['pending', 'rejected', 'cancelled'].includes(booking.status)}
            BIVO={BIVO}
            styles={styles}
          />
          <TimelineItem
            label={t('rentalFlow.pickup')}
            sub={t('rentalFlow.fromDate', { date: formatDate(booking.start_date) })}
            done={booking.status === 'paid' || booking.status === 'completed'}
            BIVO={BIVO}
            styles={styles}
          />
          <TimelineItem
            label={t('rentalFlow.returnLabel')}
            sub={t('rentalFlow.byDate', { date: formatDate(booking.end_date) })}
            done={booking.status === 'completed'}
            last
            BIVO={BIVO}
            styles={styles}
          />
        </Sheet>

        {/* Tiedot */}
        {item && (
          <Sheet padding={14} style={{ marginTop: 14 }}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('rentalFlow.itemLabel')}</Text>
              <Text style={styles.rowValue}>{item.title}</Text>
            </View>
            <View style={[styles.row, styles.rowBorder]}>
              <Text style={styles.rowLabel}>{t('rentalFlow.rentalFee', { days: String(booking.days) })}</Text>
              <Text style={styles.rowValue}>{booking.total_fee} €</Text>
            </View>
            <View style={[styles.row, styles.rowBorder]}>
              <Text style={styles.rowLabel}>{t('rentalFlow.deposit')}</Text>
              <Text style={styles.rowValue}>{booking.deposit_amount} €</Text>
            </View>
          </Sheet>
        )}

        {booking.notes && (
          <Sheet padding={14} style={{ marginTop: 14 }}>
            <Text style={styles.notesLabel}>{t('rentalFlow.messageToOwner')}</Text>
            <Text style={styles.notesBody}>{booking.notes}</Text>
          </Sheet>
        )}

        {/* CTA */}
        <View style={{ marginTop: 22 }}>
          {booking.status === 'pending' && isLender && (
            <View style={{ gap: 10 }}>
              <BigBtn onPress={handleApprove}>{t('rentalFlow.approveRequest')}</BigBtn>
              <BigBtn secondary onPress={handleReject}>{t('rentalFlow.rejectRequest')}</BigBtn>
            </View>
          )}
          {booking.status === 'pending' && isBorrower && (
            // Yksi pääpainike per näyttö (Bivo-konventio): "Avaa keskustelu"
            // jos jo conversation_id, muuten neutraali "Takaisin". Peruutus
            // alempana tekstilinkkinä ettei kilpaile pääpainikkeen kanssa.
            <View style={{ gap: 14 }}>
              <View style={styles.activeBanner}>
                <Text style={styles.activeBannerTitle}>{t('rentalFlow.awaitingResponse')}</Text>
                <Text style={styles.activeBannerBody}>
                  {t('rentalFlow.notificationWhenOwnerReplies')}
                </Text>
              </View>
              <BigBtn secondary onPress={() => router.replace('/(tabs)')}>
                {t('rentalFlow.backToHome')}
              </BigBtn>
              <TouchableOpacity onPress={handleCancel} style={styles.cancelLink}>
                <Text style={styles.cancelLinkText}>{t('rentalFlow.cancelRequest')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {booking.status === 'confirmed' && (
            <View style={{ gap: 10 }}>
              {/* Pickup-tila ohjaa mitä nappia näytetään */}
              {isLender && ['awaiting_lender_dropoff', 'awaiting_borrower_pickup'].includes(booking.pickup_state) && (
                <BigBtn onPress={() => router.push(`/owner/handover/${booking.id}`)}>
                  {t('rentalFlow.showPickupQR')}
                </BigBtn>
              )}
              {isBorrower && ['awaiting_lender_dropoff', 'awaiting_borrower_pickup'].includes(booking.pickup_state) && (
                <BigBtn onPress={() => router.push(`/rental/scan?expectedBookingId=${booking.id}`)}>
                  {t('rentalFlow.scanPickupQR')}
                </BigBtn>
              )}
              {booking.pickup_state === 'in_use' && (
                <>
                  <View style={styles.activeBanner}>
                    <Text style={styles.activeBannerTitle}>
                      {isBorrower ? t('rentalFlow.itemInUse') : t('rentalFlow.withBorrower')}
                    </Text>
                    <Text style={styles.activeBannerBody}>
                      {isBorrower
                        ? t('rentalFlow.rememberToReturn', { date: formatDate(booking.end_date) })
                        : t('rentalFlow.returnBy', { date: formatDate(booking.end_date) })}
                    </Text>
                  </View>
                  {isBorrower && (
                    <BigBtn onPress={handleMarkReturned}>{t('rentalFlow.returnedItem')}</BigBtn>
                  )}
                </>
              )}
              {booking.pickup_state === 'awaiting_lender_collection' && (
                <>
                  <View style={styles.activeBanner}>
                    <Text style={styles.activeBannerTitle}>
                      {isLender ? t('rentalFlow.borrowerReturned') : t('rentalFlow.returnConfirmable')}
                    </Text>
                    <Text style={styles.activeBannerBody}>
                      {isLender
                        ? t('rentalFlow.checkItemCondition')
                        : t('rentalFlow.waitingOwnerConfirm')}
                    </Text>
                  </View>
                  {isLender && (
                    <BigBtn onPress={handleConfirmReceipt}>{t('rentalFlow.confirmReceiptAction')}</BigBtn>
                  )}
                </>
              )}
              {b.conversation_id && booking.pickup_state !== 'completed_pickup_flow' && (
                <BigBtn secondary onPress={() => router.push(`/messages/${b.conversation_id}`)}>
                  {t('rentalFlow.openChat')}
                </BigBtn>
              )}
            </View>
          )}
          {booking.status === 'completed' && (
            <View style={{ gap: 10 }}>
              {(() => {
                const myReviewSubmitted = isBorrower
                  ? !!b.borrower_review_at
                  : isLender ? !!b.lender_review_at : false;
                const otherReviewSubmitted = isBorrower
                  ? !!b.lender_review_at
                  : isLender ? !!b.borrower_review_at : false;
                if (!myReviewSubmitted && (isBorrower || isLender)) {
                  return (
                    <BigBtn onPress={() => router.push(`/rental/review/${booking.id}`)}>
                      {t('rentalFlow.giveReview')}
                    </BigBtn>
                  );
                }
                if (myReviewSubmitted && !otherReviewSubmitted) {
                  return (
                    <View style={styles.activeBanner}>
                      <Text style={styles.activeBannerTitle}>{t('rentalFlow.reviewSent')}</Text>
                      <Text style={styles.activeBannerBody}>
                        {t('rentalFlow.reviewWaitBody')}
                      </Text>
                    </View>
                  );
                }
                return null;
              })()}
              {reviews.length > 0 && (
                <Sheet padding={14} style={{ marginTop: 4 }}>
                  <Text style={styles.notesLabel}>{t('rentalFlow.reviews')}</Text>
                  {reviews.map(r => (
                    <View key={r.id} style={styles.reviewBlock}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                        <Text style={styles.reviewRole}>
                          {r.role === 'borrower' ? t('rentalFlow.fromBorrower') : t('rentalFlow.fromOwner')}
                        </Text>
                      </View>
                      {r.content && <Text style={styles.reviewContent}>{r.content}</Text>}
                    </View>
                  ))}
                </Sheet>
              )}
              {b.conversation_id && (
                <BigBtn secondary onPress={() => router.push(`/messages/${b.conversation_id}`)}>
                  {t('rentalFlow.openChat')}
                </BigBtn>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function TimelineItem({ label, sub, done, last, BIVO, styles }: {
  label: string; sub: string; done: boolean; last?: boolean;
  BIVO: LegacyTokens; styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={[styles.timeline, last && { paddingBottom: 0 }]}>
      <View style={styles.timelineLeft}>
        <View style={[styles.bullet, done && styles.bulletDone]}>
          {done && <CheckIcon size={12} color="#fff" strokeWidth={2.5} />}
        </View>
        {!last && <View style={styles.line} />}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
        <Text style={[styles.timelineLabel, done && { color: BIVO.ink3 }]}>
          {label}
        </Text>
        <Text style={styles.timelineSub}>{sub}</Text>
      </View>
    </View>
  );
}

function renderStatusContent(
  status: string,
  counterpart: string,
  isLender: boolean,
  BIVO: LegacyTokens,
  styles: ReturnType<typeof createStyles>,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  switch (status) {
    case 'pending':
      if (isLender) {
        return {
          icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.surface }]}>
            <View style={[styles.pulseDot, { backgroundColor: BIVO.ink }]} />
          </View>,
          stage: t('rentalFlow.statusNewRequest'),
          title: t('rentalFlow.statusWantsToLend', { name: counterpart }),
          subtitle: t('rentalFlow.statusReplyIn24h'),
        };
      }
      return {
        icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.surface }]}>
          <View style={[styles.pulseDot, { backgroundColor: BIVO.ink }]} />
        </View>,
        stage: t('rentalFlow.statusRequestOnWay'),
        title: t('rentalFlow.statusWaiting', { name: counterpart }),
        subtitle: t('rentalFlow.statusUsuallyUnder1h'),
      };
    case 'confirmed':
    case 'paid':
      return {
        icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.ink }]}>
          <CheckIcon size={46} color="#fff" strokeWidth={2.4} />
        </View>,
        stage: t('rentalFlow.statusApproved', { name: counterpart.toUpperCase() }),
        title: t('rentalFlow.statusApprovedTitle'),
        subtitle: t('rentalFlow.statusArrangePickup'),
      };
    case 'rejected':
      return {
        icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.surface }]} />,
        stage: t('rentalFlow.statusRejectedLabel'),
        title: t('rentalFlow.statusRejectedTitle', { name: counterpart }),
        subtitle: t('rentalFlow.statusTryOther'),
      };
    case 'active':
      return {
        icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.live }]} />,
        stage: t('rentalFlow.statusActive'),
        title: t('rentalFlow.statusItemWithYou'),
        subtitle: t('rentalFlow.statusReturnOnTime'),
      };
    case 'completed':
      return {
        icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.live }]}>
          <CheckIcon size={46} color="#fff" strokeWidth={2.4} />
        </View>,
        stage: t('rentalFlow.statusCompleted'),
        title: t('rentalFlow.statusLoanEnded'),
        subtitle: t('rentalFlow.statusReviewNow'),
      };
    case 'cancelled':
      return {
        icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.surface }]} />,
        stage: t('rentalFlow.statusCancelled'),
        title: t('rentalFlow.statusLoanCancelled'),
        subtitle: null,
      };
    default:
      return {
        icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.surface }]} />,
        stage: status.toUpperCase(),
        title: status,
        subtitle: null,
      };
  }
}

function createStyles(BIVO: LegacyTokens) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    errorTitle: { fontSize: 20, fontWeight: '700', fontFamily: BIVO.sansBold, color: BIVO.ink },

    hero: { alignItems: 'center', paddingTop: 14 },
    heroIcon: {
      width: 92, height: 92, borderRadius: 999,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: BIVO.hair2,
    },
    pulseDot: { width: 12, height: 12, borderRadius: 999 },
    stage: {
      fontSize: 11, fontWeight: '600', fontFamily: BIVO.sansSemiBold, letterSpacing: 0.88, textTransform: 'uppercase',
      color: BIVO.ink3, marginTop: 38,
    },
    title: {
      fontSize: 30, fontWeight: '700', fontFamily: BIVO.sansBold, letterSpacing: -0.6, lineHeight: 34,
      color: BIVO.ink, marginTop: 8, textAlign: 'center',
    },
    subtitle: {
      fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 10, textAlign: 'center',
    },

    timeline: { flexDirection: 'row', gap: 14 },
    timelineLeft: { alignItems: 'center' },
    bullet: {
      width: 20, height: 20, borderRadius: 999,
      borderWidth: 1.5, borderColor: BIVO.ink3,
      alignItems: 'center', justifyContent: 'center',
    },
    bulletDone: { backgroundColor: BIVO.ink, borderColor: BIVO.ink },
    line: { width: 1.5, flex: 1, backgroundColor: BIVO.hair2, marginTop: 2 },
    timelineLabel: { fontSize: 15, fontWeight: '600', fontFamily: BIVO.sansSemiBold, color: BIVO.ink },
    timelineSub: { fontSize: 12, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 3 },

    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
    rowBorder: { borderTopWidth: 1, borderTopColor: BIVO.hair },
    rowLabel: { fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2 },
    rowValue: { fontSize: 13, fontWeight: '600', fontFamily: BIVO.sansSemiBold, color: BIVO.ink },

    notesLabel: { fontSize: 11, color: BIVO.ink2, letterSpacing: 0.88, textTransform: 'uppercase', fontWeight: '600', fontFamily: BIVO.sansSemiBold },
    notesBody: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink, marginTop: 6, lineHeight: 21 },

    activeBanner: {
      backgroundColor: BIVO.liveBg, borderRadius: 18,
      paddingHorizontal: 18, paddingVertical: 16,
      borderWidth: 1, borderColor: BIVO.live,
    },
    activeBannerTitle: {
      fontSize: 15, fontWeight: '700', fontFamily: BIVO.sansBold, color: BIVO.live, letterSpacing: -0.2,
    },
    activeBannerBody: {
      fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 4, lineHeight: 18,
    },

    reviewBlock: {
      marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: BIVO.hair,
    },
    reviewStars: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink, letterSpacing: 1 },

    cancelLink: { paddingVertical: 12, alignItems: 'center' },
    cancelLinkText: { fontSize: 14, fontFamily: BIVO.sansMedium, fontWeight: '500', color: BIVO.ink2, textDecorationLine: 'underline' },
    reviewRole: { fontSize: 11, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink2, letterSpacing: 0.5 },
    reviewContent: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink, marginTop: 6, lineHeight: 20 },
  });
}
