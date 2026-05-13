import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, Sheet, StickyCTA, Eyebrow, PinIcon, HomeIcon, CheckIcon } from '@/components/rental';
import { useLegacyTokens } from '@/lib/rental/theme';
import { useSupabase } from '@/hooks/useSupabase';

type PickupMethod = 'meetup' | 'doorstep' | 'locker';
const DB_METHOD: Record<PickupMethod, string> = { meetup: 'address', doorstep: 'address', locker: 'hub' };

const METHODS: { key: PickupMethod; label: string; desc: string; icon: typeof PinIcon }[] = [
  { key: 'meetup', label: 'Tapaaminen', desc: 'Sovitte ajan ja paikan kasvotusten', icon: PinIcon },
  { key: 'doorstep', label: 'Oven eteen', desc: 'Omistaja jättää tavaran osoitteeseensa', icon: HomeIcon },
];

export default function PickupMethodScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const supabase = useSupabase();
  const { rentalId, itemId } = useLocalSearchParams<{ rentalId: string; itemId: string }>();
  const [selected, setSelected] = useState<PickupMethod | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (!selected) return;

    if (rentalId) {
      setSaving(true);
      const { error } = await (supabase
        .from('rental_bookings') as any)
        .update({ pickup_method: DB_METHOD[selected] })
        .eq('id', rentalId);
      setSaving(false);
      if (error) {
        Alert.alert('Virhe', 'Noutotavan tallennus epäonnistui.');
        return;
      }
      router.back();
      return;
    }

    router.push({
      pathname: '/rental/request',
      params: { itemId, pickupMethod: DB_METHOD[selected] },
    });
  }

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 160 },
    stage: { textAlign: 'center', marginBottom: 14 },
    headline: { fontSize: 30, fontFamily: BIVO.sansBold, fontWeight: '700', letterSpacing: -0.8, textAlign: 'center', color: BIVO.ink, lineHeight: 34, marginBottom: 24 },
    methodCard: { marginBottom: 10, borderWidth: 1, borderColor: BIVO.hair2 },
    methodCardSelected: { borderWidth: 2, borderColor: BIVO.ink },
    methodRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: BIVO.bg2, alignItems: 'center', justifyContent: 'center' },
    iconCircleSelected: { backgroundColor: BIVO.ink },
    methodLabel: { fontSize: 15, fontFamily: BIVO.sansMedium, fontWeight: '500', color: BIVO.ink },
    methodLabelSelected: { fontFamily: BIVO.sansSemiBold, fontWeight: '600' },
    methodDesc: { fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 3 },
  }), [BIVO]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title="Nouto" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Eyebrow style={styles.stage}>Noutotapa</Eyebrow>
        <Text style={styles.headline}>Miten haluat{'\n'}noutaa tavaran?</Text>

        {METHODS.map((method) => {
          const isSelected = selected === method.key;
          const Icon = method.icon;
          return (
            <TouchableOpacity
              key={method.key}
              onPress={() => setSelected(method.key)}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              <Sheet padding={18} style={isSelected ? [styles.methodCard, styles.methodCardSelected] : styles.methodCard}>
                <View style={styles.methodRow}>
                  <View style={isSelected ? [styles.iconCircle, styles.iconCircleSelected] : styles.iconCircle}>
                    {isSelected ? <CheckIcon size={16} color="#fff" /> : <Icon size={20} color={BIVO.ink2} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.methodLabel, isSelected && styles.methodLabelSelected]}>{method.label}</Text>
                    <Text style={styles.methodDesc}>{method.desc}</Text>
                  </View>
                </View>
              </Sheet>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <StickyCTA onPress={handleConfirm} disabled={!selected || saving}>
        {saving ? 'Tallennetaan…' : 'Jatka'}
      </StickyCTA>
    </View>
  );
}
