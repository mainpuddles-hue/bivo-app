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

interface ItemData {
  id: string;
  title: string;
  owner_id: string;
  owner: { name: string } | null;
}

export default function RentalStatusScreen() {
  const BIVO = useLegacyTokens();
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
          <Text style={styles.errorTitle}>Pyyntöä ei löytynyt</Text>
        </View>
      </View>
    );
  }

  const isBorrower = userId === booking.borrower_id;
  const isLender = userId === booking.lender_id;
  const counterpartName = isBorrower ? (item?.owner?.name ?? 'Omistaja') : 'Lainaaja';

  const statusContent = renderStatusContent(booking.status, counterpartName, isLender, BIVO, styles);

  const handleApprove = () => {
    Alert.alert(
      'Hyväksy pyyntö',
      `Vahvistat, että ${item?.title ?? 'tavara'} on ${formatDate(booking.start_date)} alkaen ${booking.days} vrk ajan lainaajan käytössä.`,
      [
        { text: 'Peruuta', style: 'cancel' },
        {
          text: 'Hyväksy',
          onPress: async () => {
            const res = await approveRental(supabase, booking.id);
            if (res.error) {
              Alert.alert('Hyväksyntä epäonnistui', res.error);
              return;
            }
            // Push lainaajalle (fire-and-forget)
            triggerPush({
              user_id: booking.borrower_id,
              title: 'Lainapyyntösi hyväksyttiin',
              body: `${item?.title ?? 'Tavara'} on hyväksytty. Sopikaa noutoaika keskustelussa.`,
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
      'Hylkää pyyntö',
      'Haluatko varmasti hylätä tämän lainapyynnön? Lainaaja saa ilmoituksen.',
      [
        { text: 'Peruuta', style: 'cancel' },
        {
          text: 'Hylkää',
          style: 'destructive',
          onPress: async () => {
            const res = await rejectRental(supabase, booking.id);
            if (res.error) {
              Alert.alert('Hylkäys epäonnistui', res.error);
              return;
            }
            triggerPush({
              user_id: booking.borrower_id,
              title: 'Lainapyyntösi hylättiin',
              body: `${item?.title ?? 'Tavara'} ei tällä kertaa onnistunut. Selaa muita naapureita.`,
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
      'Olen palauttanut',
      'Vahvistat, että olet luovuttanut tavaran omistajalle. Omistaja vahvistaa vastaanoton.',
      [
        { text: 'Peruuta', style: 'cancel' },
        {
          text: 'Vahvista palautus',
          onPress: async () => {
            const res = await markReturned(supabase, booking.id);
            if (res.error) {
              Alert.alert('Palautuksen merkitseminen epäonnistui', res.error);
              return;
            }
            // Push omistajalle
            triggerPush({
              user_id: booking.lender_id,
              title: 'Tavara palautettu',
              body: `${item?.title ?? 'Tavara'} on palautettu. Vahvista vastaanotto.`,
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
      'Vahvista vastaanotto',
      `Vahvistat, että ${item?.title ?? 'tavara'} on palautunut sinulle. Tämän jälkeen voitte molemmat jättää arviot.`,
      [
        { text: 'Peruuta', style: 'cancel' },
        {
          text: 'Vahvistan',
          onPress: async () => {
            const res = await confirmReceipt(supabase, booking.id);
            if (res.error) {
              Alert.alert('Vahvistus epäonnistui', res.error);
              return;
            }
            triggerPush({
              user_id: booking.borrower_id,
              title: 'Lainaus päättyi',
              body: `${item?.title ?? 'Tavara'} on vastaanotettu. Voit nyt jättää arvion.`,
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
      'Peruuta pyyntö',
      'Haluatko varmasti peruuttaa lainapyynnön? Omistaja saa ilmoituksen.',
      [
        { text: 'En', style: 'cancel' },
        {
          text: 'Peruuta pyyntö',
          style: 'destructive',
          onPress: async () => {
            const res = await cancelRental(supabase, booking.id);
            if (res.error) Alert.alert('Peruutus epäonnistui', res.error);
          },
        },
      ],
    );
  };

  // Cast booking to access DB fields not in the typed interface
  const b = booking as any;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title="Lainaus" onBack={() => router.replace('/(tabs)')} />

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
            label="Pyyntö lähetetty"
            sub={new Date(booking.created_at).toLocaleString('fi-FI', {
              day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
            done
            BIVO={BIVO}
            styles={styles}
          />
          <TimelineItem
            label="Hyväksyntä"
            sub={booking.status === 'pending' ? 'odottaa…' :
              ['rejected', 'cancelled'].includes(booking.status) ? 'hylätty' :
              ['confirmed', 'paid', 'completed'].includes(booking.status) ? 'hyväksytty' : '—'}
            done={!['pending', 'rejected', 'cancelled'].includes(booking.status)}
            BIVO={BIVO}
            styles={styles}
          />
          <TimelineItem
            label="Nouto"
            sub={`${formatDate(booking.start_date)} alkaen`}
            done={booking.status === 'paid' || booking.status === 'completed'}
            BIVO={BIVO}
            styles={styles}
          />
          <TimelineItem
            label="Palautus"
            sub={`${formatDate(booking.end_date)} mennessä`}
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
              <Text style={styles.rowLabel}>Tavara</Text>
              <Text style={styles.rowValue}>{item.title}</Text>
            </View>
            <View style={[styles.row, styles.rowBorder]}>
              <Text style={styles.rowLabel}>Vuokra ({booking.days} vrk)</Text>
              <Text style={styles.rowValue}>{booking.total_fee} €</Text>
            </View>
            <View style={[styles.row, styles.rowBorder]}>
              <Text style={styles.rowLabel}>Vakuus</Text>
              <Text style={styles.rowValue}>{booking.deposit_amount} €</Text>
            </View>
          </Sheet>
        )}

        {booking.notes && (
          <Sheet padding={14} style={{ marginTop: 14 }}>
            <Text style={styles.notesLabel}>Viesti omistajalle</Text>
            <Text style={styles.notesBody}>{booking.notes}</Text>
          </Sheet>
        )}

        {/* CTA */}
        <View style={{ marginTop: 22 }}>
          {booking.status === 'pending' && isLender && (
            <View style={{ gap: 10 }}>
              <BigBtn onPress={handleApprove}>Hyväksy pyyntö</BigBtn>
              <BigBtn secondary onPress={handleReject}>Hylkää</BigBtn>
            </View>
          )}
          {booking.status === 'pending' && isBorrower && (
            // Yksi pääpainike per näyttö (Bivo-konventio): "Avaa keskustelu"
            // jos jo conversation_id, muuten neutraali "Takaisin". Peruutus
            // alempana tekstilinkkinä ettei kilpaile pääpainikkeen kanssa.
            <View style={{ gap: 14 }}>
              <View style={styles.activeBanner}>
                <Text style={styles.activeBannerTitle}>Odotetaan vastausta</Text>
                <Text style={styles.activeBannerBody}>
                  Saat ilmoituksen heti kun omistaja vastaa pyyntöösi.
                </Text>
              </View>
              <BigBtn secondary onPress={() => router.replace('/(tabs)')}>
                Takaisin etusivulle
              </BigBtn>
              <TouchableOpacity onPress={handleCancel} style={styles.cancelLink}>
                <Text style={styles.cancelLinkText}>Peruuta pyyntö</Text>
              </TouchableOpacity>
            </View>
          )}
          {booking.status === 'confirmed' && (
            <View style={{ gap: 10 }}>
              {/* Pickup-tila ohjaa mitä nappia näytetään */}
              {isLender && ['awaiting_lender_dropoff', 'awaiting_borrower_pickup'].includes(booking.pickup_state) && (
                <BigBtn onPress={() => router.push(`/owner/handover/${booking.id}`)}>
                  Näytä nouto-QR
                </BigBtn>
              )}
              {isBorrower && ['awaiting_lender_dropoff', 'awaiting_borrower_pickup'].includes(booking.pickup_state) && (
                <BigBtn onPress={() => router.push(`/rental/scan?expectedBookingId=${booking.id}`)}>
                  Skannaa nouto-QR
                </BigBtn>
              )}
              {booking.pickup_state === 'in_use' && (
                <>
                  <View style={styles.activeBanner}>
                    <Text style={styles.activeBannerTitle}>
                      {isBorrower ? 'Tavara on käytössäsi' : 'Lainaajalla nyt'}
                    </Text>
                    <Text style={styles.activeBannerBody}>
                      {isBorrower
                        ? `Muista palauttaa ${formatDate(booking.end_date)} mennessä.`
                        : `Palautus ${formatDate(booking.end_date)} mennessä.`}
                    </Text>
                  </View>
                  {isBorrower && (
                    <BigBtn onPress={handleMarkReturned}>Olen palauttanut tavaran</BigBtn>
                  )}
                </>
              )}
              {booking.pickup_state === 'awaiting_lender_collection' && (
                <>
                  <View style={styles.activeBanner}>
                    <Text style={styles.activeBannerTitle}>
                      {isLender ? 'Lainaaja palautti' : 'Palautus vahvistettavissa'}
                    </Text>
                    <Text style={styles.activeBannerBody}>
                      {isLender
                        ? 'Tarkista, että tavara on kunnossa, ja vahvista vastaanotto.'
                        : 'Odotetaan, että omistaja vahvistaa saaneensa tavaran.'}
                    </Text>
                  </View>
                  {isLender && (
                    <BigBtn onPress={handleConfirmReceipt}>Vahvistan vastaanoton</BigBtn>
                  )}
                </>
              )}
              {b.conversation_id && booking.pickup_state !== 'completed_pickup_flow' && (
                <BigBtn secondary onPress={() => router.push(`/chat/${b.conversation_id}`)}>
                  Avaa keskustelu
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
                      Anna arvio
                    </BigBtn>
                  );
                }
                if (myReviewSubmitted && !otherReviewSubmitted) {
                  return (
                    <View style={styles.activeBanner}>
                      <Text style={styles.activeBannerTitle}>Arviosi lähetetty</Text>
                      <Text style={styles.activeBannerBody}>
                        Toisen osapuolen arvio tulee näkyviin kun hän on myös lähettänyt sen, tai 14 päivän kuluttua.
                      </Text>
                    </View>
                  );
                }
                return null;
              })()}
              {reviews.length > 0 && (
                <Sheet padding={14} style={{ marginTop: 4 }}>
                  <Text style={styles.notesLabel}>Arviot</Text>
                  {reviews.map(r => (
                    <View key={r.id} style={styles.reviewBlock}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.reviewStars}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</Text>
                        <Text style={styles.reviewRole}>
                          {r.role === 'borrower' ? 'Lainaajalta' : 'Omistajalta'}
                        </Text>
                      </View>
                      {r.content && <Text style={styles.reviewContent}>{r.content}</Text>}
                    </View>
                  ))}
                </Sheet>
              )}
              {b.conversation_id && (
                <BigBtn secondary onPress={() => router.push(`/chat/${b.conversation_id}`)}>
                  Avaa keskustelu
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
) {
  switch (status) {
    case 'pending':
      if (isLender) {
        return {
          icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.surface }]}>
            <View style={[styles.pulseDot, { backgroundColor: BIVO.ink }]} />
          </View>,
          stage: 'UUSI PYYNTÖ',
          title: `${counterpart} haluaa lainata.`,
          subtitle: 'Vastaa 24 h sisällä.',
        };
      }
      return {
        icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.surface }]}>
          <View style={[styles.pulseDot, { backgroundColor: BIVO.ink }]} />
        </View>,
        stage: 'PYYNTÖ MATKALLA',
        title: `Odotetaan ${counterpart}a…`,
        subtitle: 'Vastausta yleensä alle tunti. Saat ilmoituksen.',
      };
    case 'confirmed':
    case 'paid':
      return {
        icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.ink }]}>
          <CheckIcon size={46} color="#fff" strokeWidth={2.4} />
        </View>,
        stage: `${counterpart.toUpperCase()} HYVÄKSYI`,
        title: 'Hyväksytty',
        subtitle: 'Sopikaa noutoajasta keskustelussa.',
      };
    case 'rejected':
      return {
        icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.surface }]} />,
        stage: 'PYYNTÖ HYLÄTTY',
        title: `${counterpart} hylkäsi pyynnön.`,
        subtitle: 'Kokeile muita naapuruston tavaroita.',
      };
    case 'active':
      return {
        icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.live }]} />,
        stage: 'KÄYNNISSÄ',
        title: 'Tavara on sinulla.',
        subtitle: 'Muista palauttaa ajoissa.',
      };
    case 'completed':
      return {
        icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.live }]}>
          <CheckIcon size={46} color="#fff" strokeWidth={2.4} />
        </View>,
        stage: 'VALMIS',
        title: 'Laina päättyi.',
        subtitle: 'Jos et vielä arvioinut, sen voi tehdä nyt.',
      };
    case 'cancelled':
      return {
        icon: <View style={[styles.heroIcon, { backgroundColor: BIVO.surface }]} />,
        stage: 'PERUUTETTU',
        title: 'Lainaus peruutettu.',
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
      fontSize: 11, fontWeight: '600', fontFamily: BIVO.sansSemiBold, letterSpacing: 1.6, textTransform: 'uppercase',
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

    notesLabel: { fontSize: 11, color: BIVO.ink2, letterSpacing: 0.9, textTransform: 'uppercase', fontWeight: '600', fontFamily: BIVO.sansSemiBold },
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
