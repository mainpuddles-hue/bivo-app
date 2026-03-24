import { View, Text, Pressable, StyleSheet } from 'react-native'
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
  onVerifyPress?: () => void
}

export function TrustProgress({ level, nextTierHints, onVerifyPress }: TrustProgressProps) {
  const { colors } = useTheme()
  const { t } = useI18n()

  if (level >= 3) return null

  const nextLevel = (level + 1) as TrustLevel
  const nextTier = TRUST_TIERS[nextLevel]

  return (
    <View style={[styles.progress, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.progressHeader}>
        <TrustBadge level={level} size="medium" showLabel />
        <View style={styles.progressArrow}>
          <Text style={[styles.arrowText, { color: colors.mutedForeground }]}>{'\u2192'}</Text>
        </View>
        <TrustBadge level={nextLevel} size="medium" showLabel />
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
          <View style={[
            styles.progressFill,
            { backgroundColor: nextTier.color, width: `${Math.max(10, ((3 - nextTierHints.length) / 3) * 100)}%` },
          ]} />
        </View>
      </View>

      {nextTierHints.length > 0 && (
        <View style={styles.hints}>
          {nextTierHints.map((hint) => (
            <Text key={hint} style={[styles.hintText, { color: colors.mutedForeground }]}>
              {'\u2022'} {t(hint)}
            </Text>
          ))}
        </View>
      )}

      {level === 1 && onVerifyPress && (
        <Pressable onPress={onVerifyPress} style={[styles.verifyBtn, { backgroundColor: TRUST_TIERS[2].color }]}>
          <ShieldCheck size={16} color="#FFFFFF" />
          <Text style={styles.verifyBtnText}>{t('trust.verifyNow')}</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeLarge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  label: {
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  progress: {
    borderRadius: 12,
    padding: 14,
    gap: 10,
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
  hints: {
    gap: 3,
  },
  hintText: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  verifyBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
