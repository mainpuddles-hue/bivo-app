import { View, Text, Pressable, StyleSheet } from 'react-native'
import { PressableOpacity } from '@/components/ui'
import { Shield, ShieldCheck, ShieldPlus } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { TRUST_TIERS } from '@/lib/constants'
import { fonts } from '@/lib/fonts'
import type { TrustLevel } from '@/lib/types'

const ICONS = {
  Shield,
  ShieldCheck,
  ShieldPlus,
} as const

interface TrustBadgeProps {
  level: TrustLevel
  size?: 'small' | 'medium' | 'large'
  showLabel?: boolean
  onPress?: () => void
}

export function TrustBadge({ level, size = 'small', showLabel = false, onPress }: TrustBadgeProps) {
  const { t } = useI18n()
  const tier = TRUST_TIERS[level]
  const Icon = ICONS[tier.icon]

  const iconSize = size === 'large' ? 20 : size === 'medium' ? 16 : 12
  const fontSize = size === 'large' ? 13 : size === 'medium' ? 11 : 9

  const content = (
    <View style={[styles.badge, { backgroundColor: `${tier.color}18` }, size === 'large' && styles.badgeLarge]}>
      <Icon size={iconSize} color={tier.color} />
      {showLabel && (
        <Text style={[styles.label, { color: tier.color, fontSize }]}>
          {t(tier.nameKey)}
        </Text>
      )}
    </View>
  )

  if (onPress) {
    return <Pressable onPress={onPress} hitSlop={8}>{content}</Pressable>
  }
  return content
}

interface TrustProgressProps {
  level: TrustLevel
  nextTierHints: string[]
  score?: number
  factors?: Record<string, number>
  onVerifyPress?: () => void
}

// TODO: This function uses hardcoded hex colors because it's defined outside
// the component and cannot access useTheme(). These map to colors.destructive,
// colors.pro, and colors.primary respectively. To fix, pass `colors` as a
// parameter from the calling component — skipped for now to avoid signature changes.
function getScoreColor(score: number, colors: { destructive: string; pro: string; primary: string }): string {
  if (score < 40) return colors.destructive
  if (score < 75) return colors.pro
  return colors.primary
}

export function TrustProgress({ level, nextTierHints, score = 0, factors = {}, onVerifyPress }: TrustProgressProps) {
  const { colors } = useTheme()
  const { t } = useI18n()

  const scoreColor = getScoreColor(score, colors)
  const factorEntries = Object.entries(factors)

  return (
    <View style={[styles.progress, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Score display */}
      <View style={styles.scoreRow}>
        <TrustBadge level={level} size="medium" showLabel />
        <Text style={[styles.scoreLabel, { color: colors.foreground }]}>
          {t('trust.score')}
        </Text>
        <Text style={[styles.scoreValue, { color: scoreColor }]}>
          {score}/100
        </Text>
      </View>

      {/* Score progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View style={[
            styles.progressFill,
            { backgroundColor: scoreColor, width: `${Math.max(2, score)}%` },
          ]} />
        </View>
      </View>

      {/* Factor breakdown — DEV only (raw scores confuse users) */}
      {__DEV__ && factorEntries.length > 0 && (
        <View style={styles.factors}>
          {factorEntries.map(([key, value]) => (
            <Text key={key} style={[styles.factorText, { color: colors.mutedForeground }]}>
              {key}: {typeof value === 'number' ? value.toFixed(0) : value}
            </Text>
          ))}
        </View>
      )}

      {/* Next tier hints */}
      {level < 3 && (
        <View style={styles.progressHeader}>
          <TrustBadge level={level} size="small" showLabel />
          <View style={styles.progressArrow}>
            <Text style={[styles.arrowText, { color: colors.mutedForeground }]}>{'\u2192'}</Text>
          </View>
          <TrustBadge level={(level + 1) as TrustLevel} size="small" showLabel />
        </View>
      )}

      {nextTierHints.length > 0 && (
        <View style={styles.hints}>
          {nextTierHints.map((hint) => (
            <Text key={hint} style={[styles.hintText, { color: colors.mutedForeground }]}>
              {'\u2022'} {t(hint)}
            </Text>
          ))}
        </View>
      )}

      {/* Tier description — helps new users understand what their level means */}
      <Text style={[styles.tierDesc, { color: colors.mutedForeground }]}>
        {t(`trust.tier${level}Desc`)}
      </Text>

      {level === 1 && onVerifyPress && (
        <>
          <PressableOpacity onPress={onVerifyPress} style={[styles.verifyBtn, { backgroundColor: TRUST_TIERS[2].color }]}>
            <ShieldCheck size={16} color={colors.primaryForeground} />
            <Text style={[styles.verifyBtnText, { color: colors.primaryForeground }]}>{t('trust.verifyNow')}</Text>
          </PressableOpacity>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 16,
  },
  badgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  label: {
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  progress: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressArrow: {
    paddingHorizontal: 4,
  },
  arrowText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 23,
  },
  progressBar: {
    height: 6,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreLabel: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    lineHeight: 17,
    flex: 1,
  },
  scoreValue: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    fontWeight: '700',
    lineHeight: 20,
  },
  factors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  factorText: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 14,
  },
  hints: {
    gap: 3,
  },
  hintText: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  tierDesc: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  verifyExplainer: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    marginTop: 4,
  },
  verifyBtnText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
    color: '#FFFFFF',
  },
})
