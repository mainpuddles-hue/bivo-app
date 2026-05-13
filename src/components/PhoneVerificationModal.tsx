import { memo, useRef, useEffect } from 'react'
import { View, Text, Modal, Pressable, TextInput, StyleSheet, ActivityIndicator } from 'react-native'
import { Phone, X, CheckCircle, ArrowLeft } from 'lucide-react-native'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { usePhoneVerification } from '@/hooks/usePhoneVerification'
import { fonts } from '@/lib/fonts'

interface PhoneVerificationModalProps {
  visible: boolean
  onClose: () => void
  onVerified?: () => void
}

export const PhoneVerificationModal = memo(function PhoneVerificationModal({
  visible, onClose, onVerified,
}: PhoneVerificationModalProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
  }, [])
  const {
    step, phone, setPhone, code, setCode,
    loading, error, countdown, delivery,
    sendOtp, verifyOtp, reset,
  } = usePhoneVerification()

  const handleClose = () => {
    if (!loading) {
      reset()
      onClose()
    }
  }

  const handleSend = async () => {
    await sendOtp()
  }

  const handleVerify = async () => {
    const ok = await verifyOtp()
    if (ok) {
      successTimerRef.current = setTimeout(() => {
        successTimerRef.current = null
        onVerified?.()
        handleClose()
      }, 1500)
    }
  }

  const isPhoneValid = phone.replace(/[\s\-()]/g, '').match(/^\+358\d{6,10}$/)

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={s.backdrop} onPress={handleClose}>
        <Pressable accessibilityViewIsModal style={[s.card, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={s.header}>
            {step === 'otp' ? (
              <PressableOpacity onPress={() => { setCode(''); reset() }} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
                <ArrowLeft size={20} color={colors.foreground} />
              </PressableOpacity>
            ) : (
              <Phone size={20} color={colors.foreground} />
            )}
            <Text style={[s.title, { color: colors.foreground }]}>
              {step === 'success' ? t('phoneVerification.verified') : t('phoneVerification.title')}
            </Text>
            <PressableOpacity onPress={handleClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <X size={20} color={colors.mutedForeground} />
            </PressableOpacity>
          </View>

          {step === 'success' ? (
            <View style={s.successContainer}>
              <CheckCircle size={48} color={colors.success} />
              <Text style={[s.successText, { color: colors.foreground }]}>{t('phoneVerification.successMessage')}</Text>
            </View>
          ) : step === 'otp' ? (
            <>
              <Text style={[s.desc, { color: colors.mutedForeground }]}>
                {delivery === 'email'
                  ? t('phoneVerification.codeSentEmail')
                  : t('phoneVerification.codeSent', { phone: phone.replace(/[\s\-()]/g, '') })
                }
              </Text>

              <TextInput
                style={[s.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                value={code}
                onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                textAlign="center"
                accessibilityLabel={t('phoneVerification.codeLabel')}
              />

              {error && (
                <Text style={[s.errorText, { color: colors.destructive }]}>{error}</Text>
              )}

              <PressableOpacity
                onPress={handleVerify}
                disabled={loading || code.length < 6}
                style={[s.primaryBtn, { backgroundColor: colors.foreground, opacity: loading || code.length < 6 ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={t('phoneVerification.verify')}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={[s.primaryBtnText, { color: colors.primaryForeground }]}>{t('phoneVerification.verify')}</Text>
                )}
              </PressableOpacity>

              <PressableOpacity
                onPress={sendOtp}
                disabled={countdown > 0 || loading}
                style={[s.secondaryBtn, { backgroundColor: colors.muted, opacity: countdown > 0 ? 0.5 : 1 }]}
                accessibilityRole="button"
              >
                <Text style={[s.secondaryBtnText, { color: colors.foreground }]}>
                  {countdown > 0
                    ? t('phoneVerification.resendIn', { seconds: countdown })
                    : t('phoneVerification.resend')
                  }
                </Text>
              </PressableOpacity>
            </>
          ) : (
            <>
              <Text style={[s.desc, { color: colors.mutedForeground }]}>{t('phoneVerification.description')}</Text>

              <TextInput
                style={[s.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                value={phone}
                onChangeText={setPhone}
                placeholder="+358 40 1234567"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                maxLength={16}
                autoFocus
                accessibilityLabel={t('phoneVerification.phoneLabel')}
              />

              {error && (
                <Text style={[s.errorText, { color: colors.destructive }]}>{error}</Text>
              )}

              <PressableOpacity
                onPress={handleSend}
                disabled={loading || !isPhoneValid}
                style={[s.primaryBtn, { backgroundColor: colors.foreground, opacity: loading || !isPhoneValid ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={t('phoneVerification.sendCode')}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={[s.primaryBtnText, { color: colors.primaryForeground }]}>{t('phoneVerification.sendCode')}</Text>
                )}
              </PressableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
})

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.headingSemi,
    lineHeight: 24,
    flex: 1,
    textAlign: 'center',
  },
  desc: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  input: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontFamily: fonts.heading,
    lineHeight: 24,
    letterSpacing: 2,
  },
  errorText: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 17,
    textAlign: 'center',
  },
  primaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 999,
    minHeight: 48,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: fonts.bodySemi,
    lineHeight: 22,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 999,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  successContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  successText: {
    fontSize: 16,
    fontFamily: fonts.bodySemi,
    lineHeight: 22,
  },
})
