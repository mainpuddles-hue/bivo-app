import { useState, useRef, useEffect, useCallback } from 'react'
import { View, Text, TextInput, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowLeft, Info } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { trackEvent } from '@/lib/analytics'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'

type OtpMode = 'signup' | 'recovery'

const DIGIT_COUNT = 6

export default function VerifyOtpScreen() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const { email, mode: modeParam } = useLocalSearchParams<{ email: string; mode?: string }>()
  const otpMode: OtpMode = modeParam === 'recovery' ? 'recovery' : 'signup'

  const [digits, setDigits] = useState<string[]>(Array(DIGIT_COUNT).fill(''))
  const [activeIndex, setActiveIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [error, setError] = useState('')

  const inputRefs = useRef<(TextInput | null)[]>([])
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Helper: get full code string from digits
  const getCode = useCallback(() => digits.join(''), [digits])

  // Auto-focus first input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus()
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) {
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current)
        cooldownRef.current = null
      }
      return
    }
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current)
          cooldownRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
    }
  }, [resendCooldown > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleVerify = async (codeOverride?: string) => {
    const code = codeOverride ?? getCode()
    if (code.length < 6) {
      setError(t('auth.otpTooShort'))
      return
    }

    setLoading(true)
    setError('')

    try {
      // Verify OTP via our Edge Function (not Supabase built-in)
      const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`
      const verifyRes = await fetch(`${FUNCTIONS_URL}/verify-otp-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' },
        body: JSON.stringify({ email: email ?? '', code: code.trim(), type: otpMode }),
      })
      const verifyData = await verifyRes.json()

      if (!verifyRes.ok || !verifyData.verified) {
        const errMsg = verifyData.error
        if (errMsg === 'invalid_code') {
          setError(t('auth.otpInvalid'))
        } else if (errMsg?.includes('expired')) {
          setError(t('auth.otpExpired'))
        } else {
          setError(t('auth.otpInvalid'))
        }
        setLoading(false)
        return
      }

      if (otpMode === 'recovery') {
        // Establish a session using the recovery token hash from the Edge Function
        if (verifyData.token_hash) {
          const { error: sessionError } = await supabase.auth.verifyOtp({
            token_hash: verifyData.token_hash,
            type: 'recovery',
          })
          if (sessionError) {
            if (__DEV__) console.warn('[verify-otp] Failed to establish recovery session:', sessionError.message)
          }
        }
        trackEvent('auth_login_success' as any)
        router.replace('/settings?recovery=true')
      } else {
        trackEvent('auth_register_success' as any)
        // User is already logged in (autoconfirm=true), navigate to onboarding or feed
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('naapurusto')
            .eq('id', user.id)
            .maybeSingle()

          if (!(profile as any)?.naapurusto) {
            router.replace('/onboarding')
            return
          }
        }
        router.replace('/')
      }
    } catch (err: any) {
      setError(err?.message ?? t('common.error'))
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || resending) return

    setResending(true)
    setError('')

    try {
      const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`
      const res = await fetch(`${FUNCTIONS_URL}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' },
        body: JSON.stringify({ email: email ?? '', type: otpMode }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error ?? 'Failed to send')
      }
      setResendCooldown(60)
      Alert.alert(t('common.success'), t('auth.otpResent'))
    } catch (err: any) {
      setError(err?.message ?? t('common.error'))
    } finally {
      setResending(false)
    }
  }

  const handleDigitChange = (text: string, index: number) => {
    // Only allow digits
    const cleaned = text.replace(/[^0-9]/g, '')

    if (cleaned.length === 0) {
      // Deletion
      const newDigits = [...digits]
      newDigits[index] = ''
      setDigits(newDigits)
      setError('')
      return
    }

    // Handle paste: user pasted full code into one field
    if (cleaned.length > 1) {
      const pastedDigits = cleaned.slice(0, DIGIT_COUNT).split('')
      const newDigits = [...digits]
      pastedDigits.forEach((d, i) => {
        if (index + i < DIGIT_COUNT) {
          newDigits[index + i] = d
        }
      })
      setDigits(newDigits)
      setError('')
      const nextIndex = Math.min(index + pastedDigits.length, DIGIT_COUNT - 1)
      setActiveIndex(nextIndex)
      inputRefs.current[nextIndex]?.focus()
      // Auto-verify if all filled
      const fullCode = newDigits.join('')
      if (fullCode.length === DIGIT_COUNT) {
        setTimeout(() => handleVerify(fullCode), 100)
      }
      return
    }

    // Single digit entry
    const newDigits = [...digits]
    newDigits[index] = cleaned[0]
    setDigits(newDigits)
    setError('')

    // Auto-advance to next field
    if (index < DIGIT_COUNT - 1) {
      setActiveIndex(index + 1)
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-verify when last digit entered
    const fullCode = newDigits.join('')
    if (fullCode.length === DIGIT_COUNT) {
      setTimeout(() => handleVerify(fullCode), 100)
    }
  }

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      // Move to previous field on backspace when current is empty
      const newDigits = [...digits]
      newDigits[index - 1] = ''
      setDigits(newDigits)
      setActiveIndex(index - 1)
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleFocus = (index: number) => {
    setActiveIndex(index)
  }

  const maskedEmail = email
    ? email.replace(/^(.{2})(.*)(@.*)$/, (_match, start, middle, domain) =>
        start + '*'.repeat(Math.min(middle.length, 5)) + domain
      )
    : ''

  const formatCooldown = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <ScreenErrorBoundary screenName="VerifyOtp">
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: '#FFFFFF', paddingTop: insets.top }]}>
        {/* Bar header with circle back button */}
        <View style={styles.header}>
          <PressableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            style={[styles.backCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ArrowLeft size={16} color={colors.foreground} strokeWidth={2.2} />
          </PressableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Large serif headline */}
          <Text style={[styles.headline, { color: colors.foreground }]}>
            {otpMode === 'recovery' ? t('auth.otpRecoveryTitle') : t('auth.otpTitle')}
          </Text>

          {/* Subtitle with email */}
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {otpMode === 'recovery' ? t('auth.otpRecoveryDescription') : t('auth.otpDescription')}{' '}
            <Text style={[styles.subtitleEmail, { color: colors.foreground }]}>{maskedEmail}</Text>.
          </Text>

          {/* 6 digit boxes — surface bg, 1px border, borderRadius 14, 54x72 */}
          <View style={styles.digitRow}>
            {digits.map((digit, index) => {
              const isFilled = digit !== ''
              const isActive = activeIndex === index && !isFilled
              return (
                <View
                  key={index}
                  style={[
                    styles.digitBox,
                    {
                      borderColor: isFilled || isActive ? colors.foreground : colors.border,
                      borderWidth: 1,
                      backgroundColor: colors.card,
                    },
                  ]}
                >
                  <TextInput
                    ref={(ref) => { inputRefs.current[index] = ref }}
                    style={[styles.digitInput, { color: colors.foreground }]}
                    value={digit}
                    onChangeText={(text) => handleDigitChange(text, index)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                    onFocus={() => handleFocus(index)}
                    keyboardType="number-pad"
                    maxLength={6}
                    textContentType="oneTimeCode"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    selectTextOnFocus
                    caretHidden
                    accessibilityLabel={`${t('auth.otpTitle')} ${index + 1}`}
                  />
                </View>
              )
            })}
          </View>

          {/* Error message */}
          {error ? (
            <Text style={[styles.errorText, { color: colors.destructive }]} accessibilityRole="alert">{error}</Text>
          ) : null}

          {/* Loading indicator */}
          {loading ? (
            <ActivityIndicator size="small" color={colors.foreground} style={styles.loadingIndicator} />
          ) : null}

          {/* Resend countdown text */}
          {/* "Lahetä uudelleen" — underlined muted text with timer */}
          <PressableOpacity
            onPress={handleResend}
            disabled={resendCooldown > 0 || resending}
            accessibilityRole="button"
            accessibilityLabel={t('auth.otpResend')}
            style={styles.resendBtn}
          >
            {resending ? (
              <ActivityIndicator size={12} color={colors.mutedForeground} />
            ) : (
              <Text style={[styles.resendText, { color: colors.mutedForeground, textDecorationLine: 'underline' }]}>
                {resendCooldown > 0
                  ? `${t('auth.otpResend')} `
                  : t('auth.otpResend')}
                {resendCooldown > 0 ? (
                  <Text style={{ color: colors.tertiaryForeground, textDecorationLine: 'none' }}>
                    ({formatCooldown(resendCooldown)})
                  </Text>
                ) : null}
              </Text>
            )}
          </PressableOpacity>

          {/* Info box — warm-tint bg */}
          <View style={[styles.infoBox, { backgroundColor: colors.warmTint }]}>
            <Info size={15} color={colors.foreground} strokeWidth={1.8} style={styles.infoIcon} />
            <Text style={[styles.infoText, { color: colors.foreground }]}>
              {t('auth.otpNotReceived')}
            </Text>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
    </ScreenErrorBoundary>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  headline: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    fontFamily: fonts.heading,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 21,
    fontFamily: fonts.body,
    marginBottom: 36,
  },
  subtitleEmail: {
    fontFamily: fonts.bodySemi,
  },
  digitRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
    justifyContent: 'center',
  },
  digitBox: {
    width: 54,
    height: 72,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  digitInput: {
    fontSize: 36,
    fontWeight: '600',
    fontFamily: fonts.heading,
    textAlign: 'center',
    width: '100%',
    height: '100%',
    padding: 0,
  },
  errorText: {
    fontSize: 13,
    marginBottom: 8,
    fontFamily: fonts.body,
  },
  loadingIndicator: {
    marginBottom: 8,
  },
  resendBtn: {
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 32,
  },
  resendText: {
    fontSize: 13,
    fontFamily: fonts.body,
  },
  infoBox: {
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  infoIcon: {
    flexShrink: 0,
    marginTop: 1,
  },
  infoText: {
    fontSize: 11.5,
    lineHeight: 17,
    fontFamily: fonts.body,
    flex: 1,
  },
})
