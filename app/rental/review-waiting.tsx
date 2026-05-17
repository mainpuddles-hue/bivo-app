import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle as SvgCircle, Path } from 'react-native-svg';
import { TopNav, Sheet, StickyCTA, StageTag, Eyebrow } from '@/components/rental';
import { Avatar } from '@/components/Avatar';
import { useLegacyTokens } from '@/lib/rental/theme';
import { useI18n } from '@/lib/i18n';

export default function ReviewWaitingScreen() {
  const BIVO = useLegacyTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { ownerName, ownerAvatar } = useLocalSearchParams<{
    ownerName?: string; ownerAvatar?: string;
  }>();

  const name = ownerName ?? t('rentalFlow.ownerFallback');

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    scroll: { paddingHorizontal: 22, paddingBottom: 160 },
    hero: { alignItems: 'center' },
    iconCircle: {
      width: 92, height: 92, borderRadius: 999, backgroundColor: BIVO.surface,
      borderWidth: 1, borderColor: BIVO.hair2,
      alignItems: 'center', justifyContent: 'center',
    },
    headline: {
      fontSize: 32, fontFamily: BIVO.sansSemiBold, fontWeight: '600',
      letterSpacing: -0.02 * 32, textAlign: 'center', color: BIVO.ink,
      lineHeight: 32 * 1.05, marginTop: 8,
    },
    body: {
      fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2,
      textAlign: 'center', maxWidth: 280, lineHeight: 13 * 1.45, marginTop: 12,
    },
    sheet: { marginTop: 24 },
    blurBox: {
      marginTop: 14, padding: 16, borderRadius: 14, backgroundColor: BIVO.surface,
    },
    blurText: {
      fontSize: 13, fontFamily: BIVO.sans, color: BIVO.ink2, lineHeight: 13 * 1.5,
    },
    ownerCard: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
    ownerName: { fontSize: 13, fontFamily: BIVO.sansSemiBold, fontWeight: '600', color: BIVO.ink },
    ownerSub: { fontSize: 11, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 2 },
  }), [BIVO]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TopNav title={t('rentalFlow.reviewWaitingTitle')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={BIVO.ink} strokeWidth={1.6} strokeLinecap="round">
              <SvgCircle cx={12} cy={12} r={9} />
              <Path d="M12 7v5l3 2" />
            </Svg>
          </View>
          <StageTag style={{ marginTop: 48 }}>{t('rentalFlow.reviewSentTag')}</StageTag>
          <Text style={styles.headline}>
            {t('rentalFlow.waitingForReview')}{'\n'}
            <Text style={{ color: BIVO.ink2 }}>{t('rentalFlow.othersReview', { name })}</Text>
          </Text>
          <Text style={styles.body}>
            {t('rentalFlow.reviewRevealBody', { name })}
          </Text>
        </View>

        <Sheet padding={18} style={styles.sheet}>
          <Eyebrow>{t('rentalFlow.yourReviewHidden')}</Eyebrow>
          <View style={styles.blurBox}>
            <Text style={styles.blurText}>
              {t('rentalFlow.reviewRevealWhenBoth')}
            </Text>
          </View>
        </Sheet>

        <Sheet padding={14} style={styles.ownerCard}>
          <Avatar url={ownerAvatar} name={name} size={36} />
          <View style={{ flex: 1 }}>
            <Text style={styles.ownerName}>{t('rentalFlow.notYetReviewed', { name })}</Text>
            <Text style={styles.ownerSub}>{t('rentalFlow.usually1to2days')}</Text>
          </View>
        </Sheet>
      </ScrollView>

      <StickyCTA secondary onPress={() => router.replace('/(tabs)')}>
        {t('rentalFlow.backToFeed')}
      </StickyCTA>
    </View>
  );
}
