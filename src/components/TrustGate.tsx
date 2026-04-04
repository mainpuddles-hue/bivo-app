import { View, Text, Pressable, StyleSheet, Modal } from 'react-native'
import { ShieldCheck, ShieldPlus, X, Lock } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { TRUST_TIERS } from '@/lib/constants'
import { TrustBadge } from './TrustBadge'
import { fonts } from '@/lib/fonts'
import type { TrustLevel } from '@/lib/types'

interface TrustGateModalProps {
  visible: boolean
  onClose: () => void
  requiredLevel: TrustLevel
  currentLevel: TrustLevel
  featureName: string
  onVerifyPress?: () => void
}

export function TrustGateModal({
  visible,
  onClose,
  requiredLevel,
  currentLevel,
  featureName,
  onVerifyPress,
}: TrustGateModalProps) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const requiredTier = TRUST_TIERS[requiredLevel]

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]} hitSlop={12}>
            <X size={20} color={colors.mutedForeground} />
          </Pressable>

          <View style={[styles.lockCircle, { backgroundColor: `${requiredTier.color}18` }]}>
            <Lock size={28} color={requiredTier.color} />
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>
            {t('trust.featureLocked')}
          </Text>

          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {t('trust.requiresLevel', { feature: featureName, level: t(requiredTier.nameKey) })}
          </Text>

          <View style={styles.tierComparison}>
            <View style={styles.tierColumn}>
              <Text style={[styles.tierLabel, { color: colors.mutedForeground }]}>{t('trust.yourLevel')}</Text>
              <TrustBadge level={currentLevel} size="large" showLabel />
            </View>
            <Text style={[styles.arrow, { color: colors.mutedForeground }]}>{'\u2192'}</Text>
            <View style={styles.tierColumn}>
              <Text style={[styles.tierLabel, { color: colors.mutedForeground }]}>{t('trust.required')}</Text>
              <TrustBadge level={requiredLevel} size="large" showLabel />
            </View>
          </View>

          {requiredLevel === 2 && currentLevel === 1 && (
            <View style={styles.steps}>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t('trust.howToUnlock')}</Text>
              <Text style={[styles.step, { color: colors.mutedForeground }]}>{'\u2022'} {t('trust.step1VerifyId')}</Text>
              <Text style={[styles.step, { color: colors.mutedForeground }]}>{'\u2022'} {t('trust.step2WaitDays')}</Text>
            </View>
          )}

          {requiredLevel === 3 && (
            <View style={styles.steps}>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t('trust.howToUnlock')}</Text>
              <Text style={[styles.step, { color: colors.mutedForeground }]}>{'\u2022'} {t('trust.step3Reviews')}</Text>
              <Text style={[styles.step, { color: colors.mutedForeground }]}>{'\u2022'} {t('trust.step3Rating')}</Text>
              <Text style={[styles.step, { color: colors.mutedForeground }]}>{'\u2022'} {t('trust.step3Response')}</Text>
            </View>
          )}

          {currentLevel === 1 && onVerifyPress && (
            <Pressable onPress={() => { onClose(); onVerifyPress() }} style={({ pressed }) => [styles.actionBtn, { backgroundColor: TRUST_TIERS[2].color }, pressed && { opacity: 0.7 }]}>
              <ShieldCheck size={18} color={colors.primaryForeground} />
              <Text style={[styles.actionBtnText, { color: colors.primaryForeground }]}>{t('trust.verifyNow')}</Text>
            </Pressable>
          )}

          <Pressable onPress={onClose} style={({ pressed }) => [styles.dismissBtn, { backgroundColor: colors.muted }, pressed && { opacity: 0.7 }]}>
            <Text style={[styles.dismissBtnText, { color: colors.foreground }]}>{t('common.close')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    gap: 12,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.headingSemi,
    lineHeight: 23,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  tierComparison: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  tierColumn: {
    alignItems: 'center',
    gap: 4,
  },
  tierLabel: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  arrow: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 23,
  },
  steps: {
    width: '100%',
    gap: 4,
    paddingTop: 4,
  },
  stepTitle: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
    marginBottom: 2,
  },
  step: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
    color: '#FFFFFF',
  },
  dismissBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  dismissBtnText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
})
