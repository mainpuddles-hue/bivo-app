import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { Zap } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'

interface BoostPurchaseCardProps {
  credits: number
  priceLabel: string
  label: string
  isBestValue?: boolean
  loading?: boolean
  onPurchase: () => void
}

export function BoostPurchaseCard({ credits, priceLabel, label, isBestValue, loading, onPurchase }: BoostPurchaseCardProps) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()

  return (
    <Pressable
      onPress={onPurchase}
      disabled={loading}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.card, borderColor: isBestValue ? colors.accent : colors.border },
        isBestValue && { borderWidth: 2 },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        loading && { opacity: 0.6 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${t(label)} - ${priceLabel}`}
    >
      {isBestValue && (
        <View style={[styles.bestValueBadge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.bestValueText, { color: colors.primaryForeground }]}>{t('boost.bestValue')}</Text>
        </View>
      )}
      <View style={styles.row}>
        <View style={[styles.iconCircle, { backgroundColor: `${colors.accent}15` }]}>
          <Zap size={20} color={colors.accent} fill={colors.accent} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.creditsText, { color: colors.foreground }]}>{t(label)}</Text>
          <Text style={[styles.priceText, { color: colors.mutedForeground }]}>{priceLabel}</Text>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <View style={[styles.buyBtn, { backgroundColor: colors.accent }]}>
            <Text style={[styles.buyText, { color: colors.primaryForeground }]}>{t('boost.buyBoosts')}</Text>
          </View>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  bestValueBadge: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  bestValueText: {
    fontSize: 11,
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  creditsText: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    lineHeight: 20,
  },
  priceText: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
  },
  buyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  buyText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
})
