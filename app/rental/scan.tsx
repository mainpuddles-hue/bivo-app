import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TopNav, BigBtn } from '@/components/rental';
import { useLegacyTokens } from '@/lib/rental/theme';
import { decodeHandoverPayload, verifyHandoverToken } from '@/lib/rental';
import { useSupabase } from '@/hooks/useSupabase';

let ExpoCamera: any = null;
try {
  ExpoCamera = require('expo-camera');
} catch {}

function ScanScreenInner() {
  const BIVO = useLegacyTokens();
  const { CameraView, useCameraPermissions } = ExpoCamera;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { expectedBookingId } = useLocalSearchParams<{ expectedBookingId?: string }>();
  const supabase = useSupabase();
  const [permission, requestPermission] = useCameraPermissions();
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannedRef = useRef(false);  // estä useat skannaukset samasta koodista

  // Pyydä lupa heti kun ruutu avautuu (kerran)
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission?.granted]);

  const handleScan = async ({ data }: { data: string }) => {
    // Lukko: scannedRef estää uudet skannauskutsut kunnes "Yritä uudelleen"
    // -nappi resetoi sen. Tämä estää infinite-loopin, jossa kamera laukaisee
    // saman virheellisen QR:n uudelleen joka kuva-framella.
    if (scannedRef.current || verifying) return;
    scannedRef.current = true;

    const parsed = decodeHandoverPayload(data);
    if (!parsed) {
      setError('Tämä ei ole Bivo-noutokoodi.');
      return;
    }
    if (expectedBookingId && parsed.bookingId !== expectedBookingId) {
      setError('QR ei kuulu tähän lainaan. Tarkista että olet oikealla pyyntösivulla.');
      return;
    }
    setVerifying(true);
    setError(null);

    const res = await verifyHandoverToken(supabase, parsed.bookingId, parsed.token);
    setVerifying(false);
    if (res.error) {
      setError(res.error);
      // scannedRef PYSYY true:na — käyttäjän pitää painaa "Yritä uudelleen"
      return;
    }
    // Onnistui — siirry rental-näkymälle, joka näyttää nyt "in_use" -tilan
    Alert.alert(
      'Nouto vahvistettu',
      'Tavara on nyt sinun käytössäsi. Muista palauttaa sovittuna aikana.',
      [{ text: 'OK', onPress: () => router.replace(`/rental/${parsed.bookingId}`) }],
    );
  };

  const handleRetry = () => {
    setError(null);
    scannedRef.current = false;
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0A0A0A' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    overlay: { backgroundColor: 'rgba(10,10,10,0.32)' },

    scanArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    reticle: {
      width: 260, height: 260, borderRadius: 28,
      borderWidth: 3, borderColor: '#FFFFFF',
    },

    footer: { padding: 22, paddingBottom: 38 },
    helperText: {
      color: '#fff', fontSize: 14, fontFamily: BIVO.sans, textAlign: 'center', opacity: 0.85,
    },
    hint: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    },
    hintText: { color: '#fff', fontSize: 14, fontWeight: '500', fontFamily: BIVO.sansMedium },

    errorBox: {
      backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 22,
      padding: 22, gap: 10,
    },
    errorTitle: { color: '#FF8A8A', fontSize: 14, fontWeight: '700', fontFamily: BIVO.sansBold },
    errorBody: { color: '#fff', fontSize: 14, fontFamily: BIVO.sans, lineHeight: 20, marginBottom: 8 },

    title: { color: '#fff', fontSize: 22, fontWeight: '700', fontFamily: BIVO.sansBold, textAlign: 'center' },
    body: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontFamily: BIVO.sans, textAlign: 'center', marginTop: 12, lineHeight: 20, maxWidth: 300 },
  }), [BIVO]);

  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title="Skannaa nouto-QR" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.title}>Tarvitsemme kameran</Text>
          <Text style={styles.body}>
            Bivo tarvitsee pääsyn kameraan jotta voit skannata omistajan näyttämän nouto-QR-koodin.
          </Text>
          <View style={{ marginTop: 28, width: '100%' }}>
            <BigBtn onPress={requestPermission}>Salli kamera</BigBtn>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={verifying ? undefined : handleScan}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />
      <View style={[StyleSheet.absoluteFillObject, styles.overlay]}>
        <TopNav title="Skannaa nouto-QR" onBack={() => router.back()} />
        <View style={styles.scanArea}>
          <View style={styles.reticle} />
        </View>
        <View style={styles.footer}>
          {verifying ? (
            <View style={styles.hint}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.hintText}>Tarkistetaan…</Text>
            </View>
          ) : error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Virhe</Text>
              <Text style={styles.errorBody}>{error}</Text>
              <BigBtn onPress={handleRetry}>
                Yritä uudelleen
              </BigBtn>
            </View>
          ) : (
            <Text style={styles.helperText}>
              Suuntaa kamera omistajan QR-koodiin
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ScanScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0A0A0A' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    title: { color: '#fff', fontSize: 22, fontWeight: '700', fontFamily: BIVO.sansBold, textAlign: 'center' },
    body: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontFamily: BIVO.sans, textAlign: 'center', marginTop: 12, lineHeight: 20, maxWidth: 300 },
  }), [BIVO]);

  if (!ExpoCamera) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title="Skannaa nouto-QR" onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.title}>Kamera ei saatavilla</Text>
          <Text style={styles.body}>
            Kamera ei ole käytettävissä tällä laitteella.
          </Text>
        </View>
      </View>
    );
  }

  return <ScanScreenInner />;
}
