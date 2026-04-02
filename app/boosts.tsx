import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
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
import { getCachedUserId } from '@/lib/authCache'
import type { BoostTier } from '@/lib/types'

function BoostsScreenInner() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    getCachedUserId().then(id => setUserId(id))
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
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('boost.title')}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('boost.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Balance display */}
        <View style={[styles.balanceCard, { backgroundColor: colors.card }]}>
          <View style={[styles.balanceCircle, { backgroundColor: `${colors.accent}15` }]}>
            <Zap size={32} color={colors.accent} fill={colors.accent} />
          </View>
          <Text style={[styles.balanceNumber, { color: colors.foreground }]}>{balance}</Text>
          <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>
            {balance === 1 ? t('boost.balanceOne') : balance === 0 ? t('boost.balanceZero') : t('boost.balance', { count: balance })}
          </Text>
        </View>

        {/* Tier info */}
        <View style={[styles.tierCard, { backgroundColor: colors.card }]}>
          <View style={styles.tierRow}>
            <View style={styles.tierInfo}>
              <Text style={[styles.tierLabel, { color: colors.foreground }]}>{tierLabels[tier]}</Text>
              <Text style={[styles.durationLabel, { color: colors.mutedForeground }]}>
                {t('boost.duration', { duration: durationLabel })}
              </Text>
            </View>
            <View style={[styles.tierBadge, {
              backgroundColor: tier === 'business' ? `${colors.pro}20` : tier === 'pro' ? `${colors.primary}20` : `${colors.accent}20`,
            }]}>
              <Text style={[styles.tierBadgeText, {
                color: tier === 'business' ? colors.pro : tier === 'pro' ? colors.primary : colors.accent,
              }]}>
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
                { borderColor: t2 === tier ? colors.accent : colors.border },
                t2 === tier && { borderWidth: 2, backgroundColor: `${colors.accent}08` },
              ]}
            >
              {t2 === tier && <CheckCircle size={14} color={colors.accent} />}
              <Text style={[styles.tierItemText, { color: t2 === tier ? colors.foreground : colors.mutedForeground }]}>
                {tierLabels[t2]}
              </Text>
            </View>
          ))}
        </View>

        {/* Purchase options */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('boost.buyBoosts')}</Text>

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
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('boost.activeBoosts')}</Text>
            {activeBoosts.map(boost => (
              <View key={boost.id} style={[styles.activeBoostCard, { backgroundColor: colors.card, borderColor: `${colors.accent}40` }]}>
                <TrendingUp size={16} color={colors.accent} />
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
              </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontFamily: fonts.headingSemi,
  },
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
    borderRadius: 12,
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
    fontSize: 36,
    fontFamily: fonts.heading,
    lineHeight: 42,
  },
  balanceLabel: {
    fontSize: 14,
    fontFamily: fonts.body,
  },
  tierCard: {
    padding: 16,
    borderRadius: 12,
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
    fontFamily: fonts.bodySemi,
  },
  durationLabel: {
    fontSize: 12,
    fontFamily: fonts.body,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tierBadgeText: {
    fontSize: 11,
    fontFamily: fonts.bodySemi,
  },
  tierItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  tierItemText: {
    fontSize: 12,
    fontFamily: fonts.body,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: fonts.headingSemi,
    marginTop: 8,
  },
  purchaseList: {
    gap: 12,
  },
  sandboxNote: {
    fontSize: 11,
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
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  activeBoostInfo: {
    flex: 1,
    gap: 2,
  },
  activeBoostTitle: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
  },
  activeBoostMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeBoostTime: {
    fontSize: 11,
    fontFamily: fonts.body,
  },
  hint: {
    fontSize: 12,
    fontFamily: fonts.body,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 17,
  },
})
