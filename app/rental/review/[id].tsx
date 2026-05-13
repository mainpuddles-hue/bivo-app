import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, StickyCTA, Eyebrow } from '@/components/rental';
import { useLegacyTokens } from '@/lib/rental/theme';
import { useRentalBooking, submitReview } from '@/lib/rental';
import { useSupabase } from '@/hooks/useSupabase';

export default function ReviewScreen() {
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

  const [rating, setRating] = useState<number>(0);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    errorTitle: { fontSize: 22, fontFamily: BIVO.sansBold, fontWeight: '700', color: BIVO.ink, letterSpacing: -0.02 * 22, textAlign: 'center' },
    errorBody: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 12, textAlign: 'center', maxWidth: 280, lineHeight: 20 },

    title: { fontSize: 28, fontFamily: BIVO.sansBold, fontWeight: '700', letterSpacing: -0.02 * 28, color: BIVO.ink, marginTop: 8 },
    subtitle: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 10, lineHeight: 20 },

    starsRow: { flexDirection: 'row', justifyContent: 'space-between', maxWidth: 320 },
    star: { fontSize: 44, fontFamily: BIVO.sans, color: BIVO.ink3 },
    starFilled: { color: BIVO.ink },

    field: {
      paddingHorizontal: 18, paddingVertical: 14,
      borderRadius: 18, backgroundColor: BIVO.surface,
      borderWidth: 1, borderColor: BIVO.hair2,
      fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink, minHeight: 120, lineHeight: 21,
      textAlignVertical: 'top',
    },
    charCounter: { fontSize: 11, fontFamily: BIVO.sans, color: BIVO.ink3, textAlign: 'right', marginTop: 6 },
  }), [BIVO]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title="" onBack={() => router.back()} />
        <View style={styles.center}><ActivityIndicator color={BIVO.ink} /></View>
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title="" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Vuokrausta ei löytynyt</Text>
          <Text style={styles.errorBody}>Linkki on vanhentunut.</Text>
        </View>
      </View>
    );
  }

  const isBorrower = userId === booking.borrower_id;
  const isLender = userId === booking.lender_id;
  const reviewedRole = isBorrower ? 'omistajaa' : 'lainaajaa';

  // Cast to access DB fields not in typed interface
  const b = booking as any;
  const alreadySubmitted = isBorrower ? !!b.borrower_review_at : isLender ? !!b.lender_review_at : false;

  if (!isBorrower && !isLender) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title="Arvio" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Et voi arvioida tätä vuokrausta</Text>
        </View>
      </View>
    );
  }

  if (alreadySubmitted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title="Arvio" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Olet jo arvioinut</Text>
          <Text style={styles.errorBody}>Toisen arvio tulee näkyviin kun hän on lähettänyt sen.</Text>
        </View>
      </View>
    );
  }

  if (booking.status !== 'completed') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title="Arvio" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Lainaus ei ole vielä päättynyt</Text>
          <Text style={styles.errorBody}>Arviointi avautuu kun palautus on vahvistettu.</Text>
        </View>
      </View>
    );
  }

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Valitse arvosana', 'Anna 1–5 tähteä.');
      return;
    }
    setSubmitting(true);
    const res = await submitReview(supabase, booking.id, rating, content.trim());
    setSubmitting(false);
    if (res.error) {
      Alert.alert('Arvion lähetys epäonnistui', res.error);
      return;
    }
    Alert.alert(
      'Kiitos arviostasi',
      'Toisen osapuolen arvio tulee näkyviin kun hän on myös lähettänyt sen.',
      [{ text: 'OK', onPress: () => router.replace(`/rental/${booking.id}`) }],
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <TopNav title="Arvio" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 180 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Miten {reviewedRole} sujui?</Text>
        <Text style={styles.subtitle}>
          Arvio näkyy toiselle vasta kun hän on myös arvioinut sinut, tai 14 päivän kuluttua.
        </Text>

        <Eyebrow style={{ marginTop: 28, marginBottom: 12 }}>Tähdet</Eyebrow>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map(n => (
            <TouchableOpacity
              key={n}
              onPress={() => setRating(n)}
              activeOpacity={0.6}
              hitSlop={10}
              accessibilityLabel={`${n} tähteä`}
            >
              <Text style={[styles.star, n <= rating && styles.starFilled]}>
                {n <= rating ? '★' : '☆'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>Sanat (valinnainen)</Eyebrow>
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="Kuvaile lyhyesti millaista yhteistyö oli. Mitä toivottavasti tapahtuu uudestaan, mitä parannettavaa."
          placeholderTextColor={BIVO.ink3}
          style={styles.field}
          multiline
          maxLength={2000}
        />
        <Text style={styles.charCounter}>{content.length} / 2000</Text>
      </ScrollView>

      <StickyCTA
        onPress={handleSubmit}
        disabled={submitting || rating === 0}
        hint="Arvio on julkinen kun toinen on myös lähettänyt. Arviota ei voi peruuttaa."
      >
        {submitting ? 'Lähetetään…' : 'Lähetä arvio'}
      </StickyCTA>
    </KeyboardAvoidingView>
  );
}
