import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Image, StyleSheet, ActivityIndicator, TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RoundBtn, Sheet, Eyebrow, BigBtn, StickyCTA, BackIcon, ChatIcon,
} from '@/components/rental';
import { Avatar } from '@/components/Avatar';
import { useLegacyTokens, type LegacyTokens } from '@/lib/rental/theme';
import { useSupabase } from '@/hooks/useSupabase';
import { useI18n } from '@/lib/i18n';

const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1504148455328-c376907d081c?w=800&q=80&auto=format';

interface ItemData {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  owner_id: string;
  is_active: boolean;
  status: string;
  is_free: boolean;
  daily_fee: number | null;
  deposit_amount: number | null;
  images: { image_url: string; sort_order: number }[] | null;
  owner: { name: string; avatar_url: string | null } | null;
}

export default function ProductScreen() {
  const BIVO = useLegacyTokens();
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const supabase = useSupabase();

  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setUserId(session?.user?.id ?? null);
    });
    return () => { mounted = false; };
  }, [supabase]);

  const [item, setItem] = useState<ItemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('items')
        .select('*, images:item_images(image_url, sort_order), owner:profiles!owner_id(name, avatar_url)')
        .eq('id', id)
        .single();
      if (cancelled) return;
      setItem(data as ItemData | null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const styles = useMemo(() => createStyles(BIVO), [BIVO]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centerState]}>
        <View style={[styles.floatingBack, { top: insets.top + 10 }]}>
          <RoundBtn size={44} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
            <BackIcon size={18} strokeWidth={2} />
          </RoundBtn>
        </View>
        <ActivityIndicator color={BIVO.ink} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.container, styles.centerState]}>
        <View style={[styles.floatingBack, { top: insets.top + 10 }]}>
          <RoundBtn size={44} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
            <BackIcon size={18} strokeWidth={2} />
          </RoundBtn>
        </View>
        <Text style={styles.notFoundTitle}>{t('itemDetail.notFound')}</Text>
        <Text style={styles.notFoundBody}>
          {t('itemDetail.notFoundBody')}
        </Text>
        <View style={styles.notFoundCta}>
          <BigBtn onPress={() => router.replace('/(tabs)')}>{t('itemDetail.backToHome')}</BigBtn>
        </View>
      </View>
    );
  }

  const heroImage = item.images?.[0]?.image_url ?? PLACEHOLDER_IMG;
  const ownerName = item.owner?.name ?? t('itemDetail.neighbor');
  const isOwnItem = userId === item.owner_id;

  const handleMessageOwner = async () => {
    if (!userId || isOwnItem) return;
    // Get or create conversation directly via Supabase
    const { data: existing } = await (supabase
      .from('conversations') as any)
      .select('id')
      .or(`and(user1_id.eq.${userId},user2_id.eq.${item.owner_id}),and(user1_id.eq.${item.owner_id},user2_id.eq.${userId})`)
      .eq('item_id', item.id)
      .maybeSingle();

    if (existing) {
      router.push(`/chat/${(existing as any).id}`);
      return;
    }

    const { data: created, error } = await (supabase.from('conversations') as any).insert({
      user1_id: userId,
      user2_id: item.owner_id,
      item_id: item.id,
    }).select('id').single();

    if (error || !created) {
      Alert.alert(t('common.error'), t('itemDetail.chatOpenFailed'));
      return;
    }
    router.push(`/chat/${created.id}`);
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero image */}
        <View style={styles.hero}>
          {imgError ? (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: BIVO.surface2 }]} />
          ) : (
            <Image
              source={{ uri: heroImage }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
              onError={() => setImgError(true)}
            />
          )}
          <View style={[styles.floatingNav, { top: insets.top + 10 }]}>
            <RoundBtn size={44} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
              <BackIcon size={18} strokeWidth={2} />
            </RoundBtn>
            {/* Tallennetut tulee Phase 2:ssa — saved_items-taulu olemassa
                mutta UI-flow ei vielä. Piilotetaan heart-painike kunnes
                se aidosti toimii (audit U1). */}
          </View>
        </View>

        {/* Sheet */}
        <View style={styles.sheetContainer}>
          <View style={styles.handle} />

          {item.is_active && item.status === 'active' && (
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{t('itemDetail.availableNow')}</Text>
            </View>
          )}

          <Text style={styles.title}>{item.title}</Text>
          {item.location ? <Text style={styles.locationText}>{item.location}</Text> : null}

          {/* Price block */}
          {!item.is_free ? (
            <View style={styles.priceRow}>
              <Sheet style={styles.priceBox} padding={14}>
                <Text style={styles.priceLabel}>{t('itemDetail.rentalFee')}</Text>
                <Text style={styles.priceValue}>{item.daily_fee ?? 0} €</Text>
                <Text style={styles.priceUnit}>{t('itemDetail.perDay')}</Text>
              </Sheet>
              <Sheet style={styles.priceBox} padding={14}>
                <Text style={styles.priceLabel}>{t('itemDetail.deposit')}</Text>
                <Text style={styles.priceValue}>{item.deposit_amount ?? 0} €</Text>
                <Text style={styles.priceUnit}>{t('itemDetail.refundable')}</Text>
              </Sheet>
            </View>
          ) : (
            <Sheet style={styles.freeBlock} padding={16}>
              <Text style={styles.freeLabel}>{t('itemDetail.free')}</Text>
              <Text style={styles.freeBody}>
                {t('itemDetail.freeBody')}
              </Text>
            </Sheet>
          )}

          {/* Owner — koko kortti klikattava (jos ei oma) → avaa chat */}
          <View style={styles.ownerCardContainer}>
            <TouchableOpacity
              activeOpacity={isOwnItem ? 1 : 0.8}
              onPress={isOwnItem ? undefined : handleMessageOwner}
              disabled={isOwnItem}
            >
              <Sheet padding={14}>
                <View style={styles.ownerRow}>
                  <Avatar url={item.owner?.avatar_url} name={ownerName} size={48} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ownerName}>{ownerName}</Text>
                    <Text style={styles.ownerInfo}>{t('itemDetail.neighborInBivo')}</Text>
                  </View>
                  {!isOwnItem && (
                    <RoundBtn
                      onPress={handleMessageOwner}
                      accessibilityLabel={t('itemDetail.sendMessage', { name: ownerName })}
                    >
                      <ChatIcon size={18} />
                    </RoundBtn>
                  )}
                </View>
              </Sheet>
            </TouchableOpacity>
          </View>

          {/* Description */}
          <View style={styles.descSection}>
            <Eyebrow>{t('itemDetail.description')}</Eyebrow>
            <Text style={styles.descText}>{item.description}</Text>
          </View>

          <View style={{ height: 140 }} />
        </View>
      </ScrollView>

      {isOwnItem ? (
        <View style={styles.stickyOwnInfo}>
          <View style={styles.ownInfo}>
            <Text style={styles.ownInfoText}>{t('itemDetail.ownListing')}</Text>
          </View>
        </View>
      ) : item.is_free ? (
        <StickyCTA onPress={() => router.push(`/free/${item.id}`)} hint={t('itemDetail.freeHint')}>
          {t('itemDetail.reserveForMe')}
        </StickyCTA>
      ) : (
        <StickyCTA onPress={() => router.push(`/rental/request?itemId=${item.id}`)}>
          {t('itemDetail.requestLoan')}
        </StickyCTA>
      )}
    </View>
  );
}

function createStyles(BIVO: LegacyTokens) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: BIVO.bg },
    centerState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
    floatingBack: { position: 'absolute', left: 22 },
    floatingNav: {
      position: 'absolute', left: 22, right: 22,
      flexDirection: 'row', justifyContent: 'space-between',
    },
    notFoundTitle: {
      fontSize: 22, fontWeight: '700', fontFamily: BIVO.sansBold, color: BIVO.ink, marginBottom: 8,
      letterSpacing: -0.4, textAlign: 'center',
    },
    notFoundBody: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink2, textAlign: 'center', maxWidth: 280, lineHeight: 20 },
    notFoundCta: { marginTop: 24, width: '100%', maxWidth: 320 },
    hero: { height: 340 },
    sheetContainer: {
      marginTop: -28, backgroundColor: BIVO.bg,
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      paddingHorizontal: 22, paddingTop: 20,
    },
    handle: {
      width: 36, height: 4, backgroundColor: BIVO.ink4,
      borderRadius: 999, alignSelf: 'center', marginBottom: 14,
    },
    livePill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: BIVO.liveBg, paddingHorizontal: 9, paddingVertical: 4,
      borderRadius: 999, alignSelf: 'flex-start',
    },
    liveDot: { width: 5, height: 5, borderRadius: 999, backgroundColor: BIVO.live },
    liveText: { fontSize: 11, fontWeight: '600', fontFamily: BIVO.sansSemiBold, color: BIVO.live },
    title: { fontSize: 32, fontWeight: '700', fontFamily: BIVO.sansBold, lineHeight: 34, letterSpacing: -0.6, marginTop: 12, color: BIVO.ink },
    locationText: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 8 },
    priceRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
    priceBox: { flex: 1 },
    priceLabel: { fontSize: 11, fontFamily: BIVO.sans, color: BIVO.ink2, letterSpacing: 0.88, textTransform: 'uppercase' },
    priceValue: { fontSize: 28, fontWeight: '700', fontFamily: BIVO.sansBold, marginTop: 4, color: BIVO.ink, letterSpacing: -0.5 },
    priceUnit: { fontSize: 11, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 2 },
    freeBlock: { marginTop: 18, backgroundColor: BIVO.liveBg },
    freeLabel: { fontSize: 11, fontWeight: '700', fontFamily: BIVO.sansBold, color: BIVO.live, letterSpacing: 0.88, textTransform: 'uppercase' },
    freeBody: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink, marginTop: 6, lineHeight: 20 },
    ownerCardContainer: { marginTop: 14 },
    ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    ownerName: { fontSize: 15, fontWeight: '600', fontFamily: BIVO.sansSemiBold, color: BIVO.ink },
    ownerInfo: { fontSize: 12, fontFamily: BIVO.sans, color: BIVO.ink2, marginTop: 2 },
    descSection: { marginTop: 18 },
    descText: { fontSize: 14, fontFamily: BIVO.sans, lineHeight: 22, color: BIVO.ink },
    stickyOwnInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 22, paddingBottom: 34, paddingTop: 12, backgroundColor: BIVO.bg },
    ownInfo: {
      paddingVertical: 16, paddingHorizontal: 16, borderRadius: 18,
      backgroundColor: BIVO.surface, borderWidth: 1, borderColor: BIVO.hair2,
      alignItems: 'center',
    },
    ownInfoText: { fontSize: 14, fontFamily: BIVO.sans, color: BIVO.ink2 },
  });
}
