import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native'
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

/**
 * Pick the theme-aware tint for a given trust tier. Light/dark switching is
 * handled by the theme tokens (`trustTier1/2/3`). Keeps the trust palette
 * out of TRUST_TIERS so a brand recolor doesn't require touching the
 * permissions data.
 */
function trustTierColor(level: TrustLevel, colors: { trustTier1: string; trustTier2: string; trustTier3: string }): string {
  if (level === 1) return colors.trustTier1
  if (level === 2) return colors.trustTier2
  return colors.trustTier3
}

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
  const fontSize = size === 'large' ? 13 : size === 'medium' ? 12 : 10

  const infoIconSize = size === 'large' ? 14 : size === 'medium' ? 12 : 10

  const content = (
    <View style={[styles.badge, size === 'large' && styles.badgeLarge]}>
      <Icon size={iconSize} color={trustTierColor(level, colors)} strokeWidth={1.5} />
      {showLabel && (
        <Text style={[styles.label, { color: trustTierColor(level, colors), fontSize }]}>
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
                  const tintColor = trustTierColor(lvl, colors)
                  return (
                    <View
                      key={lvl}
                      style={[
                        styles.tierRow,
                        { borderColor: isCurrentTier ? tintColor : colors.border },
                        isCurrentTier && { backgroundColor: colors.muted },
                      ]}
                    >
                      <TierIcon size={20} color={tintColor} strokeWidth={1.5} />
                      <View style={styles.tierRowText}>
                        <Text style={[styles.tierRowName, { color: tintColor }]}>{t(t2.nameKey)}{isCurrentTier ? ' \u2605' : ''}</Text>
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
