import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native'
import { PressableOpacity } from '@/components/ui'
import { Shield, ShieldCheck, ShieldPlus, X, Info } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { TRUST_TIERS } from '@/lib/constants'
import { fonts } from '@/lib/fonts'
import type { TrustLevel } from '@/lib/types'
import { useState } from 'react'

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
  showExplainer?: boolean
}

export function TrustBadge({ level, size = 'small', showLabel = false, onPress, showExplainer = false }: TrustBadgeProps) {
  const { t } = useI18n()
  const { colors } = useTheme()
  const [explainerVisible, setExplainerVisible] = useState(false)
  const tier = TRUST_TIERS[level]
  const Icon = ICONS[tier.icon]

  const iconSize = size === 'large' ? 20 : size === 'medium' ? 16 : 12
  const fontSize = size === 'large' ? 13 : size === 'medium' ? 11 : 9

  const infoIconSize = size === 'large' ? 14 : size === 'medium' ? 12 : 10

  const content = (
    <View style={[styles.badge, size === 'large' && styles.badgeLarge]}>
      <Icon size={iconSize} color={tier.color} strokeWidth={1.5} />
      {showLabel && (
        <Text style={[styles.label, { color: tier.color, fontSize }]}>
          {t(tier.nameKey)}
        </Text>
      )}
      {showExplainer && (
        <Info size={infoIconSize} color={colors.mutedForeground} strokeWidth={1.5} />
      )}
    </View>
  )

  const handlePress = onPress ?? (showExplainer ? () => setExplainerVisible(true) : undefined)

  const nextLevel = level < 3 ? (level + 1) as TrustLevel : null
  const nextTier = nextLevel ? TRUST_TIERS[nextLevel] : null

  return (
    <>
      {handlePress ? (
        <Pressable onPress={handlePress} hitSlop={12}>{content}</Pressable>
      ) : content}

      {showExplainer && (
        <Modal
          visible={explainerVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setExplainerVisible(false)}
        >
          <Pressable style={styles.explainerOverlay} onPress={() => setExplainerVisible(false)}>
            <Pressable style={[styles.explainerCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
              {/* Header */}
              <View style={styles.explainerHeader}>
                <Text style={[styles.explainerTitle, { color: colors.foreground }]}>{t('trust.explainerTitle')}</Text>
                <Pressable onPress={() => setExplainerVisible(false)} hitSlop={8}>
                  <X size={20} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Tier rows */}
                {([1, 2, 3] as TrustLevel[]).map((lvl) => {
                  const t2 = TRUST_TIERS[lvl]
                  const TierIcon = ICONS[t2.icon]
                  const isCurrentTier = lvl === level
                  return (
                    <View
                      key={lvl}
                      style={[
                        styles.tierRow,
                        { borderColor: isCurrentTier ? t2.color : colors.border },
                        isCurrentTier && { backgroundColor: colors.muted },
                      ]}
                    >
                      <TierIcon size={20} color={t2.color} strokeWidth={1.5} />
                      <View style={styles.tierRowText}>
                        <Text style={[styles.tierRowName, { color: t2.color }]}>{t(t2.nameKey)}{isCurrentTier ? ' \u2605' : ''}</Text>
                        <Text style={[styles.tierRowDesc, { color: colors.mutedForeground }]}>{t(`trust.tier${lvl}Desc`)}</Text>
                      </View>
                    </View>
                  )
                })}

                {/* Next tier requirements */}
                {nextTier && (
                  <View style={styles.requirementsSection}>
                    <Text style={[styles.requirementsTitle, { color: colors.foreground }]}>{t('trust.nextTierRequirements')}</Text>
                    {level === 1 && (
                      <>
                        <Text style={[styles.requirementItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('trust.step1VerifyId')}</Text>
                        <Text style={[styles.requirementItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('trust.step2WaitDays')}</Text>
                      </>
                    )}
                    {level === 2 && (
                      <>
                        <Text style={[styles.requirementItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('trust.step3Reviews')}</Text>
                        <Text style={[styles.requirementItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('trust.step3Rating')}</Text>
                        <Text style={[styles.requirementItem, { color: colors.mutedForeground }]}>{'\u2022'} {t('trust.step3Response')}</Text>
                      </>
                    )}
                  </View>
                )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </>
  )
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

      {/* Factor breakdown hidden — raw scores confuse users even in dev */}

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
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  badgeLarge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  label: {
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  progress: {
    borderRadius: 20,
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
    lineHeight: 24,
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
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 14,
  },
  hints: {
    gap: 4,
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
    borderRadius: 20,
    marginTop: 4,
  },
  verifyBtnText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
    // color set via inline style with colors.primaryForeground
  },
  explainerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  explainerCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 16,
    maxHeight: 480,
  },
  explainerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  explainerTitle: {
    fontSize: 17,
    fontFamily: fonts.headingSemi,
    fontWeight: '600',
    lineHeight: 22,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  tierRowText: {
    flex: 1,
    gap: 2,
  },
  tierRowName: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    lineHeight: 18,
  },
  tierRowDesc: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  requirementsSection: {
    gap: 6,
    marginTop: 4,
  },
  requirementsTitle: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 2,
  },
  requirementItem: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
})
