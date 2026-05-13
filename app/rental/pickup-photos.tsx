import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, TextInput, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, Sheet, StickyCTA, StageTag, Eyebrow, CheckIcon, PlusIcon } from '@/components/rental';
import { useLegacyTokens } from '@/lib/rental/theme';
import { useSupabase } from '@/hooks/useSupabase';

interface PhotoSlot {
  id: string;
  label: string;
  required: boolean;
  uri: string | null;
}

const INITIAL_SLOTS: PhotoSlot[] = [
  { id: 'front', label: 'Edestä', required: true, uri: null },
  { id: 'back', label: 'Takaa', required: true, uri: null },
  { id: 'acc', label: 'Lisävarusteet', required: false, uri: null },
  { id: 'flaw', label: 'Mahdolliset vauriot', required: false, uri: null },
];

export default function PickupPhotosScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const supabase = useSupabase();
  const { rentalId } = useLocalSearchParams<{ rentalId: string }>();
  const [slots, setSlots] = useState<PhotoSlot[]>(INITIAL_SLOTS);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filledCount = slots.filter(s => s.uri).length;
  const requiredCount = slots.filter(s => s.required).length;
  const requiredFilled = slots.filter(s => s.required && s.uri).length;
  const allRequiredDone = requiredFilled >= requiredCount;

  async function pickPhoto(slotId: string) {
    try {
      const ImagePicker = require('expo-image-picker');
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
      });
      if (result.canceled) return;
      const uri = result.assets[0].uri;
      setSlots(prev => prev.map(s => s.id === slotId ? { ...s, uri } : s));
    } catch {
      Alert.alert('Virhe', 'Kuvan ottaminen epäonnistui.');
    }
  }

  async function uploadPhotos(): Promise<string[]> {
    const urls: string[] = [];
    for (const slot of slots) {
      if (!slot.uri) continue;
      const ext = slot.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `pickup/${rentalId}/${slot.id}_${Date.now()}.${ext}`;
      const response = await fetch(slot.uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();
      const { error } = await supabase.storage
        .from('rental-photos')
        .upload(path, arrayBuffer, { contentType: `image/${ext}` });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from('rental-photos').getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  }

  async function handleConfirm() {
    if (!allRequiredDone) {
      Alert.alert('Kuvat puuttuvat', `Ota vähintään ${requiredCount} pakollista kuvaa.`);
      return;
    }

    setSubmitting(true);
    try {
      const photoUrls = await uploadPhotos();
      await (supabase
        .from('rental_bookings') as any)
        .update({
          pickup_photos: photoUrls,
          pickup_note: note.trim() || null,
        })
        .eq('id', rentalId);

      router.replace({
        pathname: '/rental/pickup-confirmed',
        params: { rentalId },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tuntematon virhe';
      Alert.alert('Virhe', msg);
    } finally {
      setSubmitting(false);
    }
  }

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 160 },
    headline: {
      fontSize: 28, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.02 * 28, color: BIVO.ink, lineHeight: 28 * 1.1, marginTop: 14,
    },
    subtext: {
      fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2,
      marginTop: 10, lineHeight: 13 * 1.5, marginBottom: 22,
    },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    slotEmpty: {
      width: '48%', aspectRatio: 1, borderRadius: 16,
      backgroundColor: BIVO.surface, borderWidth: 1.5, borderColor: BIVO.ink4, borderStyle: 'dashed',
    },
    slotFilled: {
      width: '48%', aspectRatio: 1, borderRadius: 16,
      overflow: 'hidden', position: 'relative',
    },
    slotImage: { width: '100%', height: '100%' },
    slotBadge: {
      position: 'absolute', top: 8, left: 8,
      backgroundColor: BIVO.ink, width: 20, height: 20, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    slotLabelOverlay: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      paddingHorizontal: 10, paddingVertical: 8,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    slotLabelFilled: {
      fontSize: 11, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      color: '#FFFFFF', letterSpacing: 0.5,
    },
    slotPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    slotPlusCircle: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: BIVO.ink,
      alignItems: 'center', justifyContent: 'center',
    },
    slotLabel: { fontSize: 12, fontFamily: BIVO.sansMedium, fontWeight: '500', color: BIVO.ink2, marginTop: 10 },
    slotOptional: { fontSize: 10, fontFamily: BIVO.sans, color: BIVO.ink3, marginTop: 4 },
    noteInput: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink, minHeight: 60, lineHeight: 21 },
    infoBox: {
      marginTop: 22, padding: 14, borderRadius: 16, backgroundColor: BIVO.bg2,
      flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    },
    infoBadge: {
      width: 28, height: 28, borderRadius: 8, backgroundColor: BIVO.ink,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    infoBadgeText: { fontSize: 13, fontFamily: BIVO.sansBold, fontWeight: '700', color: '#FFFFFF' },
    infoText: { fontSize: 12, fontFamily: BIVO.sans, color: BIVO.ink2, lineHeight: 12 * 1.5, flex: 1 },
  }), [BIVO]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title="Dokumentoi kunto" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <StageTag>VAIHE 2 / 3</StageTag>
        <Text style={styles.headline}>
          Ota muutama kuva{'\n'}
          <Text style={{ color: BIVO.ink2 }}>nykytilasta</Text>
        </Text>
        <Text style={styles.subtext}>
          Kuvilla dokumentoidaan tavaran lähtötila. Molemmat osapuolet näkevät kuvat.
        </Text>

        <View style={styles.photoGrid}>
          {slots.map((slot) => (
            <TouchableOpacity
              key={slot.id}
              style={slot.uri ? styles.slotFilled : styles.slotEmpty}
              onPress={() => pickPhoto(slot.id)}
              activeOpacity={0.7}
            >
              {slot.uri ? (
                <>
                  <Image source={{ uri: slot.uri }} style={styles.slotImage} />
                  <View style={styles.slotBadge}>
                    <CheckIcon size={10} color="#fff" />
                  </View>
                  <View style={styles.slotLabelOverlay}>
                    <Text style={styles.slotLabelFilled}>{slot.label.toUpperCase()}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.slotPlaceholder}>
                  <View style={styles.slotPlusCircle}>
                    <PlusIcon size={18} color="#fff" />
                  </View>
                  <Text style={styles.slotLabel}>{slot.label}</Text>
                  {!slot.required && <Text style={styles.slotOptional}>vapaaehtoinen</Text>}
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <Eyebrow style={{ marginTop: 22 }}>Lisää huomio (valinnainen)</Eyebrow>
        <Sheet padding={16} style={{ marginTop: 8 }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder='Esim. "Toisessa akussa pieni naarmu" tai "Laturin johto on taittunut"'
            placeholderTextColor={BIVO.ink3}
            style={styles.noteInput}
            multiline
            maxLength={300}
          />
        </Sheet>

        <View style={styles.infoBox}>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeText}>i</Text>
          </View>
          <Text style={styles.infoText}>
            Kuvat tallentuvat lainan tietoihin. Palautuksessa omistaja näkee saman kuvasarjan rinnakkain.
          </Text>
        </View>
      </ScrollView>

      <StickyCTA
        onPress={handleConfirm}
        disabled={!allRequiredDone || submitting}
        hint={`${filledCount} / ${requiredCount} pakollista kuvaa otettu`}
      >
        {submitting ? 'Tallennetaan…' : 'Vahvista nouto'}
      </StickyCTA>
    </View>
  );
}
