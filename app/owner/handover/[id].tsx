import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Alert, AppState,
  type AppStateStatus,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { TopNav, BigBtn } from '@/components/rental';
import { useLegacyTokens } from '@/lib/rental/theme';
import { mintHandoverToken, encodeHandoverPayload, useRentalBooking } from '@/lib/rental';
import { useSupabase } from '@/hooks/useSupabase';
import { useI18n } from '@/lib/i18n';

// Tumma näkymä — Jessen designin mukaisesti handover QR näytetään
// kontrastilla joka tekee QR:stä helposti skannattavan ulkona/sisätiloissa.
export default function OwnerHandoverScreen() {
  const BIVO = useLegacyTokens();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const supabase = useSupabase();
  const [userId, setUserId] = useState<string | null>(null);
  const { booking, loading } = useRentalBooking(supabase, id);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setUserId(session?.user?.id ?? null);
    });
    return () => { mounted = false; };
  }, []);

  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Synkroninen lukko race condition -tilanteille — useStaten asynkronisuus
  // sallii tuplakutsuja. Ref:n päivitys on välitön.
  const mintingRef = useRef(false);

  const mintToken = async () => {
    if (!id) return;
    if (mintingRef.current) return;
    mintingRef.current = true;
    setMinting(true);
    setMintError(null);
    try {
      const res = await mintHandoverToken(supabase, id);
      if (res.error || !res.data) {
        setMintError(res.error ?? t('rentalFlow.qrCreationFailed'));
        return;
      }
      setToken(res.data.token);
      setExpiresAt(res.data.expires_at);
    } finally {
      mintingRef.current = false;
      setMinting(false);
    }
  };

  useEffect(() => {
    if (booking?.status === 'confirmed' && !token && !mintingRef.current) {
      mintToken();
    }
  }, [booking?.status, id]);

  // Pysähdy/jatka kun app menee taustalle (säästä CPU:ta)
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const bookingStatusRef = useRef(booking?.status);
  bookingStatusRef.current = booking?.status;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && !tokenRef.current && bookingStatusRef.current === 'confirmed') {
        mintToken();
      }
    });
    return () => sub.remove();
  }, []);

  // Laske jäljellä oleva aika minuutin tarkkuudella
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setRemainingMs(Math.max(0, ms));
    };
    update();
    tickRef.current = setInterval(update, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [expiresAt]);

  // Realtime kuuntelee pickup_state-muutosta — kun borrower skannaa,
  // muutamme näkymää onnistumissivuksi
  useEffect(() => {
    if (booking?.pickup_state === 'in_use') {
      Alert.alert(
        t('rentalFlow.handoverConfirmed'),
        t('rentalFlow.borrowerScannedQR'),
        [{ text: 'OK', onPress: () => router.replace(`/rental/${id}`) }],
      );
    }
  }, [booking?.pickup_state]);

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0A0A0A' },
    content: { flex: 1, paddingHorizontal: 22, paddingTop: 8, alignItems: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

    title: {
      fontSize: 24, fontWeight: '700', fontFamily: BIVO.sansBold, letterSpacing: -0.4,
      color: '#fff', marginTop: 8, textAlign: 'center',
    },
    subtitle: {
      fontSize: 14, fontFamily: BIVO.sans, color: 'rgba(255,255,255,0.65)', marginTop: 10,
      textAlign: 'center', maxWidth: 300, lineHeight: 20,
    },

    qrFrame: {
      marginTop: 36, padding: 28, backgroundColor: '#fff',
      borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    },
    qrPlaceholder: {
      width: 240, height: 240, alignItems: 'center', justifyContent: 'center',
    },

    timer: {
      marginTop: 28, fontSize: 13, fontFamily: BIVO.sansMedium, color: 'rgba(255,255,255,0.7)',
      letterSpacing: 0.5, fontWeight: '500',
    },
    timerExpired: {
      marginTop: 28, fontSize: 13, fontFamily: BIVO.sansMedium, color: '#FF8A8A', fontWeight: '500',
    },

    success: { fontSize: 80, fontFamily: BIVO.sans, color: BIVO.live },
    successText: { fontSize: 22, fontWeight: '700', fontFamily: BIVO.sansBold, color: '#fff', marginTop: 14 },

    errorText: {
      fontSize: 14, fontFamily: BIVO.sans, color: '#FF8A8A', textAlign: 'center', maxWidth: 280, lineHeight: 20,
    },
  }), [BIVO]);

  if (loading || !booking) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      </View>
    );
  }

  if (userId !== booking.lender_id) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title={t('rentalFlow.handoverTitle')} onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorText}>{t('rentalFlow.onlyOwnerCanShow')}</Text>
        </View>
      </View>
    );
  }

  if (booking.status !== 'confirmed') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title={t('rentalFlow.handoverTitle')} onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {t('rentalFlow.cannotHandoverInStatus', { status: booking.status })}
          </Text>
        </View>
      </View>
    );
  }

  if (booking.pickup_state === 'in_use') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TopNav title={t('rentalFlow.handoverTitle')} onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.success}>✓</Text>
          <Text style={styles.successText}>{t('rentalFlow.pickupComplete')}</Text>
        </View>
      </View>
    );
  }

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const payload = token ? encodeHandoverPayload(booking.id, token) : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title={t('rentalFlow.handoverTitle')} onBack={() => router.back()} />
      <View style={styles.content}>
        <Text style={styles.title}>{t('rentalFlow.showToBorrower')}</Text>
        <Text style={styles.subtitle}>
          {t('rentalFlow.askBorrowerToScan')}
        </Text>

        <View style={styles.qrFrame}>
          {payload ? (
            <QRCode
              value={payload}
              size={240}
              color="#0A0A0A"
              backgroundColor="#FFFFFF"
            />
          ) : (
            <View style={styles.qrPlaceholder}>
              {minting ? (
                <ActivityIndicator color="#0A0A0A" />
              ) : mintError ? (
                <Text style={styles.errorText}>{mintError}</Text>
              ) : null}
            </View>
          )}
        </View>

        {remainingMs > 0 ? (
          <Text style={styles.timer}>
            {t('rentalFlow.validFor', { min: String(minutes), sec: seconds.toString().padStart(2, '0') })}
          </Text>
        ) : token ? (
          <Text style={styles.timerExpired}>{t('rentalFlow.qrExpired')}</Text>
        ) : null}

        {mintError && (
          <View style={{ marginTop: 22, paddingHorizontal: 22 }}>
            <BigBtn onPress={mintToken}>{t('rentalFlow.renewQR')}</BigBtn>
          </View>
        )}
        {remainingMs <= 0 && token && (
          <View style={{ marginTop: 22, paddingHorizontal: 22 }}>
            <BigBtn onPress={mintToken}>{t('rentalFlow.renewQR')}</BigBtn>
          </View>
        )}
      </View>
    </View>
  );
}
