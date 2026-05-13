import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, Sheet, StickyCTA, Eyebrow, Pill, StarIcon, StarOIcon } from '@/components/rental';
import { Avatar } from '@/components/Avatar';
import { useLegacyTokens } from '@/lib/rental/theme';
import { useSupabase } from '@/hooks/useSupabase';
import { submitReview } from '@/lib/rental';

const TRAITS = ['Täsmällinen', 'Hyvä viestintä', 'Tavara palautui samassa kunnossa', 'Ystävällinen', 'Kunnioitti sääntöjä'];

export default function OwnerReviewScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const supabase = useSupabase();
  const [userId, setUserId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rental, setRental] = useState<any>(null);
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setUserId(session?.user?.id ?? null);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    supabase.from('rental_bookings')
      .select('*, borrower:profiles!rental_bookings_borrower_id_fkey(display_name, name, avatar_url)')
      .eq('id', id).single()
      .then(({ data }) => { if (mounted) setRental(data); });
    return () => { mounted = false; };
  }, [id]);

  const borrowerName = rental?.borrower?.display_name || rental?.borrower?.name || 'Lainaaja';
  const toggleTrait = (t: string) =>
    setSelectedTraits(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const handleSubmit = async () => {
    if (!id || !userId || rating === 0) return;
    setSubmitting(true);
    const { error } = await submitReview(supabase, id, rating, comment.trim() || '');
    setSubmitting(false);

    if (error) {
      Alert.alert('Virhe', error);
      return;
    }
    Alert.alert('Arvio lähetetty', 'Arvio näkyy lainaajalle, kun molemmat ovat arvioineet.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 160 },
    avatarSection: { alignItems: 'center', marginTop: 12, marginBottom: 16 },
    headline: {
      fontSize: 28, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.56, textAlign: 'center', color: BIVO.ink,
      lineHeight: 32, marginTop: 18,
    },
    stars: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12 },
    traitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    sheet: { marginTop: 4 },
    input: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink, minHeight: 100, lineHeight: 21 },
    charCount: { fontSize: 11, fontFamily: BIVO.sans, color: BIVO.ink3, textAlign: 'right', marginTop: 8 },
  }), [BIVO]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title={`Arvioi ${borrowerName}`} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarSection}>
          <Avatar url={rental?.borrower?.avatar_url} name={borrowerName} size={76} />
          <Text style={styles.headline}>
            Miten meni {borrowerName}n{'\n'}kanssa?
          </Text>
        </View>

        <Eyebrow>Yleisarvio</Eyebrow>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.7}>
              {n <= rating
                ? <StarIcon size={36} color={BIVO.ink} />
                : <StarOIcon size={36} color={BIVO.ink4} />}
            </TouchableOpacity>
          ))}
        </View>

        <Eyebrow style={{ marginTop: 22 }}>Mikä toimi hyvin</Eyebrow>
        <View style={styles.traitRow}>
          {TRAITS.map(t => (
            <TouchableOpacity key={t} onPress={() => toggleTrait(t)} activeOpacity={0.7}>
              <Pill tone={selectedTraits.includes(t) ? 'on' : 'soft'}>{t}</Pill>
            </TouchableOpacity>
          ))}
        </View>

        <Eyebrow style={{ marginTop: 22 }}>Yksityinen palaute (vain Bivolle)</Eyebrow>
        <Sheet padding={16} style={styles.sheet}>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Kerro lyhyesti kokemuksestasi…"
            placeholderTextColor={BIVO.ink3}
            style={styles.input}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{comment.length} / 500</Text>
        </Sheet>
      </ScrollView>

      <StickyCTA
        onPress={handleSubmit}
        disabled={rating === 0 || submitting}
        hint={`${borrowerName}n arvio sinusta julkaistaan samaan aikaan`}
      >
        {submitting ? 'Lähetetään…' : 'Lähetä arvio'}
      </StickyCTA>
    </View>
  );
}
