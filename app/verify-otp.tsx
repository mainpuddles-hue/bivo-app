import { useState, useRef, useEffect } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Mail, ArrowLeft, RefreshCw } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { trackEvent } from '@/lib/analytics'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'

type OtpMode = 'signup' | 'recovery'

export default function VerifyOtpScreen() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const { email, mode: modeParam } = useLocalSearchParams<{ email: string; mode?: string }>()
  const otpMode: OtpMode = modeParam === 'recovery' ? 'recovery' : 'signup'

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [error, setError] = useState('')
  const inputRef = useRef<TextInput>(null)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus()
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

  const handleVerify = async () => {
    if (!code.trim() || code.trim().length < 6) {
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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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

  const handleCodeChange = (text: string) => {
    // Only allow digits
    const digits = text.replace(/[^0-9]/g, '')
    setCode(digits)
    setError('')
  }

  const maskedEmail = email
    ? email.replace(/^(.{2})(.*)(@.*)$/, (_match, start, middle, domain) =>
        start + '*'.repeat(Math.min(middle.length, 5)) + domain
      )
    : ''

  return (
    <ScreenErrorBoundary screenName="VerifyOtp">
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Icon */}
          <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
            <Mail size={32} color={colors.primary} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.foreground }]}>
            {otpMode === 'recovery' ? t('auth.otpRecoveryTitle') : t('auth.otpTitle')}
          </Text>

          {/* Description */}
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {otpMode === 'recovery' ? t('auth.otpRecoveryDescription') : t('auth.otpDescription')}
          </Text>

          {/* Email display */}
          <Text style={[styles.emailDisplay, { color: colors.foreground }]}>
            {maskedEmail}
          </Text>

          {/* Code input */}
          <TextInput
            ref={inputRef}
            style={[
              styles.codeInput,
              {
                backgroundColor: colors.card,
                color: colors.foreground,
                borderColor: error ? colors.destructive : colors.border,
              },
            ]}
            value={code}
            onChangeText={handleCodeChange}
            placeholder="000000"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            accessibilityLabel={t('auth.otpTitle')}
          />

          {/* Error message */}
          {error ? (
            <Text style={[styles.errorText, { color: colors.destructive }]} accessibilityRole="alert">{error}</Text>
          ) : null}

          {/* Verify button */}
          <Pressable
            onPress={handleVerify}
            disabled={loading || code.length < 6}
            style={[
              styles.verifyBtn,
              {
                backgroundColor: colors.primary,
                opacity: loading || code.length < 6 ? 0.6 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('auth.otpVerify')}
            accessibilityState={{ disabled: loading || code.length < 6 }}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.verifyBtnText, { color: colors.primaryForeground }]}>
                {t('auth.otpVerify')}
              </Text>
            )}
          </Pressable>

          {/* Resend link */}
          <View style={styles.resendRow}>
            <Text style={[styles.resendLabel, { color: colors.mutedForeground }]}>
              {t('auth.otpNotReceived')}
            </Text>
            <Pressable onPress={handleResend} disabled={resendCooldown > 0 || resending} accessibilityRole="button" accessibilityLabel={t('auth.otpResend')}>
              <View style={styles.resendBtnInner}>
                {resending ? (
                  <ActivityIndicator size={14} color={colors.primary} />
                ) : (
                  <RefreshCw size={14} color={resendCooldown > 0 ? colors.mutedForeground : colors.primary} />
                )}
                <Text
                  style={[
                    styles.resendBtnText,
                    { color: resendCooldown > 0 ? colors.mutedForeground : colors.primary },
                  ]}
                >
                  {resendCooldown > 0
                    ? `${t('auth.otpResendIn')} ${resendCooldown}s`
                    : t('auth.otpResend')}
                </Text>
              </View>
            </Pressable>
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
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: fonts.headingSemi,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
    fontFamily: fonts.body,
  },
  emailDisplay: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
    fontFamily: fonts.bodySemi,
  },
  codeInput: {
    width: '100%',
    maxWidth: 280,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
    minHeight: 64,
    fontFamily: fonts.heading,
  },
  errorText: {
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
  verifyBtn: {
    width: '100%',
    maxWidth: 280,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 24,
  },
  verifyBtnText: {
    fontSize: 16,
    fontFamily: fonts.bodySemi,
  },
  resendRow: {
    alignItems: 'center',
    marginTop: 24,
    gap: 8,
  },
  resendLabel: {
    fontSize: 14,
    fontFamily: fonts.body,
  },
  resendBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resendBtnText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
  },
})
