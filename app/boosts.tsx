import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { ArrowLeft, Zap, TrendingUp, Clock, CheckCircle } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useBoosts } from '@/hooks/useBoosts'
import { useSupabase } from '@/hooks/useSupabase'
import { BOOST_PRODUCTS, getDiscountedPrice, formatBoostPrice, getBoostDurationHours, isSandboxMode } from '@/lib/iap'
import { BoostPurchaseCard } from '@/components/BoostPurchaseCard'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { getCachedUserId } from '@/lib/authCache'
import type { BoostTier } from '@/lib/types'

function BoostsScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    getCachedUserId().then(id => setUserId(id)).catch(() => {})
  }, [])

  const { balance, tier, loading, purchasing, activeBoosts, purchaseBoost, refreshBalance } = useBoosts(userId)

  // Refresh balance when screen gains focus (e.g. returning from post detail)
  useFocusEffect(useCallback(() => {
    refreshBalance()
  }, [refreshBalance]))

  const tierLabels: Record<BoostTier, string> = {
    free: t('boost.tierFree'),
    pro: t('boost.tierPro'),
    business: t('boost.tierBusiness'),
  }

  const durationLabel = (() => {
    const hours = getBoostDurationHours(tier)
    if (hours >= 168) return t('boost.days7')
    if (hours >= 72) return t('boost.days3')
    return t('boost.hours24')
  })()

  const formatRemainingTime = useCallback((endDate: string): string => {
    const remaining = new Date(endDate).getTime() - Date.now()
    if (remaining <= 0) return t('postCard.expired')
    const hours = Math.floor(remaining / 3600000)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h`
  }, [t])

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <PressableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={[styles.backCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <ArrowLeft size={18} color={colors.foreground} />
          </PressableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('boost.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.foreground} />
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      {/* Bar header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[styles.backCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={18} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('boost.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        {/* Balance display */}
        <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.balanceCircle, { backgroundColor: colors.muted }]}>
            <Zap size={32} color={colors.foreground} />
          </View>
          <Text style={[styles.balanceNumber, { color: colors.foreground }]}>{balance}</Text>
          <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>
            {balance === 1 ? t('boost.balanceOne') : balance === 0 ? t('boost.balanceZero') : t('boost.balance', { count: balance })}
          </Text>
        </View>

        {/* Tier info */}
        <View style={[styles.tierCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.tierRow}>
            <View style={styles.tierInfo}>
              <Text style={[styles.tierLabel, { color: colors.foreground }]}>{tierLabels[tier]}</Text>
              <Text style={[styles.durationLabel, { color: colors.mutedForeground }]}>
                {t('boost.duration', { duration: durationLabel })}
              </Text>
            </View>
            <View style={[styles.tierBadge, { backgroundColor: colors.muted }]}>
              <Text style={[styles.tierBadgeText, { color: colors.mutedForeground }]}>
                {tier.charAt(0).toUpperCase() + tier.slice(1)}
              </Text>
            </View>
          </View>
          {/* All tier descriptions */}
          {(['free', 'pro', 'business'] as BoostTier[]).map(t2 => (
            <View
              key={t2}
              style={[
                styles.tierItem,
                { borderColor: t2 === tier ? colors.foreground : colors.border },
                t2 === tier && { borderWidth: 1 },
              ]}
            >
              {t2 === tier && <CheckCircle size={14} color={colors.foreground} />}
              <Text style={[styles.tierItemText, { color: t2 === tier ? colors.foreground : colors.mutedForeground }]}>
                {tierLabels[t2]}
              </Text>
            </View>
          ))}
        </View>

        {/* Purchase options */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{t('boost.buyBoosts')}</Text>

        <View style={styles.purchaseList}>
          {BOOST_PRODUCTS.map((product, index) => {
            const discountedCents = getDiscountedPrice(product.priceCents, tier)
            const priceLabel = formatBoostPrice(discountedCents)
            const isDiscounted = discountedCents < product.priceCents
            return (
              <BoostPurchaseCard
                key={product.id}
                credits={product.credits}
                priceLabel={isDiscounted ? `${priceLabel} (${formatBoostPrice(product.priceCents)})` : priceLabel}
                label={product.label}
                isBestValue={index === BOOST_PRODUCTS.length - 1}
                loading={purchasing}
                onPurchase={() => purchaseBoost(product.id)}
              />
            )
          })}
        </View>

        {/* Sandbox note */}
        {isSandboxMode() && (
          <Text style={[styles.sandboxNote, { color: colors.mutedForeground }]}>{t('boost.sandboxNote')}</Text>
        )}

        {/* Active boosts */}
        {activeBoosts.length > 0 && (
          <View style={styles.activeSection}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{t('boost.activeBoosts')}</Text>
            {activeBoosts.map(boost => (
              <PressableOpacity key={boost.id} onPress={() => router.push(`/post/${boost.post_id}` as any)} style={[styles.activeBoostCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TrendingUp size={16} color={colors.foreground} />
                <View style={styles.activeBoostInfo}>
                  <Text style={[styles.activeBoostTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {boost.post_id.slice(0, 8)}...
                  </Text>
                  <View style={styles.activeBoostMeta}>
                    <Clock size={11} color={colors.mutedForeground} />
                    <Text style={[styles.activeBoostTime, { color: colors.mutedForeground }]}>
                      {t('boost.boostEndsIn', { time: formatRemainingTime(boost.boost_end) })}
                    </Text>
                  </View>
                </View>
              </PressableOpacity>
            ))}
          </View>
        )}

        {/* Hint */}
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>{t('boost.boostHint')}</Text>
      </ScrollView>
    </View>
  )
}

export default function BoostsScreen() {
  return (
    <ScreenErrorBoundary screenName="Boosts">
      <BoostsScreenInner />
    </ScreenErrorBoundary>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  headerSpacer: { width: 36 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  balanceCard: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  balanceCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceNumber: {
    fontSize: 32,
    fontFamily: fonts.heading,
    lineHeight: 42,
  },
  balanceLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
  },
  tierCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierInfo: {
    flex: 1,
    gap: 2,
  },
  tierLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.bodySemi,
  },
  durationLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tierBadgeText: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.bodySemi,
  },
  tierItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  tierItemText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 10.5,
    lineHeight: 16,
    fontFamily: fonts.bodySemi,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  purchaseList: {
    gap: 12,
  },
  sandboxNote: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.body,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  activeSection: {
    gap: 8,
    marginTop: 8,
  },
  activeBoostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  activeBoostInfo: {
    flex: 1,
    gap: 2,
  },
  activeBoostTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.bodyMedium,
  },
  activeBoostMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeBoostTime: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.body,
  },
  hint: {
    fontSize: 12,
    fontFamily: fonts.body,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
})
