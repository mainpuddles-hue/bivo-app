import { View, Text, Pressable, StyleSheet, Modal, ActivityIndicator } from 'react-native'
import { ShieldCheck, X, Building2, Smartphone, Lock, CheckCircle, Globe, Mail } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import type { IdentityBranding } from '@/lib/adapters/types'

const SUOMIFI_BLUE = '#003580'

const ICON_MAP: Record<string, typeof ShieldCheck> = {
  ShieldCheck,
  Smartphone,
  Globe,
  Mail,
}

interface VerificationModalProps {
  visible: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  loading: boolean
  error: string | null
  isSuccess: boolean
  /** Optional adapter branding. Falls back to Suomi.fi if not provided. */
  branding?: IdentityBranding
}

export function VerificationModal({ visible, onClose, onConfirm, loading, error, isSuccess, branding }: VerificationModalProps) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()

  // Use adapter branding or fall back to Suomi.fi defaults
  const brandColor = branding?.color ?? SUOMIFI_BLUE
  const brandTitle = branding?.title ?? 'Suomi.fi'
  const brandDesc = branding?.description ? t(branding.description) : t('verification.suomifiInfo')
  const BrandIcon = branding?.icon ? (ICON_MAP[branding.icon] ?? ShieldCheck) : ShieldCheck

  if (isSuccess) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={[styles.modal, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.successCircle, { backgroundColor: '#10B98118' }]}>
              <CheckCircle size={48} color="#10B981" />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>{t('verification.successTitle')}</Text>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>{t('verification.successMessage')}</Text>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.primaryBtn, { backgroundColor: '#10B981' }, pressed && { opacity: 0.7 }]}>
              <Text style={styles.primaryBtnText}>{t('verification.backToApp')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    )
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]} hitSlop={12}>
            <X size={20} color={colors.mutedForeground} />
          </Pressable>

          {/* Provider header — adapts to identity adapter branding */}
          <View style={[styles.suomifiHeader, { backgroundColor: brandColor }]}>
            <BrandIcon size={24} color="#FFFFFF" />
            <Text style={styles.suomifiTitle}>{brandTitle}</Text>
            <Text style={styles.suomifiSubtitle}>{t('verification.startButton')}</Text>
          </View>

          <Text style={[styles.title, { color: colors.foreground }]}>{t('verification.modalTitle')}</Text>

          {/* How it works */}
          <View style={styles.steps}>
            <View style={styles.stepRow}>
              <View style={[styles.stepIcon, { backgroundColor: `${brandColor}15` }]}>
                <Building2 size={18} color={brandColor} />
              </View>
              <View style={styles.stepText}>
                <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t('verification.step1')}</Text>
                <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>{t('verification.step1Desc')}</Text>
              </View>
            </View>

            <View style={styles.stepRow}>
              <View style={[styles.stepIcon, { backgroundColor: `${brandColor}15` }]}>
                <Smartphone size={18} color={brandColor} />
              </View>
              <View style={styles.stepText}>
                <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t('verification.step2')}</Text>
                <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>{t('verification.step2Desc')}</Text>
              </View>
            </View>

            <View style={styles.stepRow}>
              <View style={[styles.stepIcon, { backgroundColor: `${brandColor}15` }]}>
                <Lock size={18} color={brandColor} />
              </View>
              <View style={styles.stepText}>
                <Text style={[styles.stepTitle, { color: colors.foreground }]}>{t('verification.step3')}</Text>
                <Text style={[styles.stepDesc, { color: colors.mutedForeground }]}>{t('verification.step3Desc')}</Text>
              </View>
            </View>
          </View>

          {/* Privacy note */}
          <View style={[styles.privacyNote, { backgroundColor: isDark ? '#1A1A2E' : '#F0F4FF' }]}>
            <Lock size={14} color={brandColor} />
            <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>{brandDesc}</Text>
          </View>

          {error && (
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {t(`verification.error_${error}`) !== `verification.error_${error}` ? t(`verification.error_${error}`) : error}
            </Text>
          )}

          <Pressable
            onPress={onConfirm}
            disabled={loading}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: loading ? colors.muted : brandColor }, pressed && { opacity: 0.7 }]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <BrandIcon size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>{t('verification.startButton')}</Text>
              </>
            )}
          </Pressable>

          <Pressable onPress={onClose} style={({ pressed }) => [styles.cancelBtn, { backgroundColor: colors.muted }, pressed && { opacity: 0.7 }]}>
            <Text style={[styles.cancelBtnText, { color: colors.foreground }]}>{t('common.cancel')}</Text>
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
    padding: 20,
  },
  modal: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    gap: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
  },
  suomifiHeader: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 6,
  },
  suomifiTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: fonts.heading,
    lineHeight: 28,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  suomifiSubtitle: {
    fontSize: 13,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: fonts.body,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.headingSemi,
    lineHeight: 23,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  description: {
    fontSize: 14,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  steps: {
    paddingHorizontal: 20,
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    gap: 2,
  },
  stepTitle: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
  stepDesc: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 12,
  },
  privacyText: {
    flex: 1,
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 15,
  },
  errorText: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 23,
    color: '#FFFFFF',
  },
  cancelBtn: {
    marginHorizontal: 20,
    marginBottom: 20,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 24,
  },
})
