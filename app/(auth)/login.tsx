import { useState, useEffect } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Eye, EyeOff, Check, X } from 'lucide-react-native'
import Svg, { Path } from 'react-native-svg'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { GoogleLogo } from '@/components/GoogleLogo'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { TackBirdLogo } from '@/components/TackBirdLogo'
import { fonts } from '@/lib/fonts'
import { trackEvent } from '@/lib/analytics'

function AppleLogo({ size = 20, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </Svg>
  )
}

const AUTH_ERROR_KEYS: Record<string, string> = {
  'Invalid login credentials': 'auth.invalidCredentials',
  'User already registered': 'auth.userAlreadyRegistered',
  'Email not confirmed': 'auth.emailNotConfirmed',
  'Password should be at least 6 characters': 'auth.passwordTooShort',
  'Signup requires a valid password': 'auth.invalidPassword',
}

function PasswordStrength({ password, colors }: { password: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  const { t } = useI18n()
  const checks = [
    { key: 'minLength', label: t('auth.passwordMinLength'), met: password.length >= 8 },
    { key: 'uppercase', label: t('auth.passwordUppercase'), met: /[A-Z]/.test(password) },
    { key: 'number', label: t('auth.passwordNumber'), met: /[0-9]/.test(password) },
  ]
  return (
    <View style={pwStyles.container}>
      {checks.map((check) => (
        <View key={check.key} style={pwStyles.row}>
          {check.met ? (
            <Check size={14} color={colors.success} />
          ) : (
            <X size={14} color={colors.destructive} />
          )}
          <Text style={[pwStyles.text, { color: check.met ? colors.success : colors.destructive }]}>
            {check.label}
          </Text>
        </View>
      ))}
    </View>
  )
}

const pwStyles = StyleSheet.create({
  container: { gap: 4, paddingTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontSize: 12 },
})

export default function LoginScreen() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [appleAvailable, setAppleAvailable] = useState(false)
  const [loginAttempts, setLoginAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [termsAccepted, setTermsAccepted] = useState(false)

  // Check Apple Sign-In availability (native only)
  useEffect(() => {
    if (Platform.OS === 'web') return
    async function checkApple() {
      try {
        const AppleAuth = require('expo-apple-authentication')
        const available = await AppleAuth.isAvailableAsync()
        setAppleAvailable(available)
      } catch {
        setAppleAvailable(false)
      }
    }
    checkApple()
  }, [])

  const translateError = (msg: string) => {
    const key = AUTH_ERROR_KEYS[msg]
    return key ? t(key) : msg
  }

  const handleSubmit = async () => {
    // Client-side rate limiting
    if (Date.now() < lockedUntil) {
      Alert.alert(t('common.error'), t('auth.tooManyAttempts'))
      return
    }

    if (!email.trim()) { Alert.alert(t('common.error'), t('auth.emailRequired')); return }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      Alert.alert(t('common.error'), t('auth.invalidEmail') ?? 'Invalid email format')
      return
    }

    if (mode === 'forgot') {
      setLoading(true)
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
        if (error) throw error
        // Navigate to OTP verification screen for password recovery
        router.push({ pathname: '/verify-otp', params: { email: email.trim(), mode: 'recovery' } })
      } catch (err: any) {
        Alert.alert(t('common.error'), translateError(err.message))
      } finally { setLoading(false) }
      return
    }

    if (!password.trim()) { Alert.alert(t('common.error'), t('auth.passwordRequired')); return }

    if (mode === 'register') {
      if (!name.trim()) { Alert.alert(t('common.error'), t('auth.nameRequired')); return }
      if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        Alert.alert(t('common.error'), t('settings.passwordTooWeak'))
        return
      }
    }

    setLoading(true)
    try {
      if (mode === 'register') {
        trackEvent('auth_register_start' as any)
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { name: name.trim() },
            emailRedirectTo: Platform.OS === 'web'
              ? (typeof window !== 'undefined' ? window.location.origin : 'https://tackbird.fi') + '/auth/callback'
              : Linking.createURL('auth/callback'),
          },
        })
        if (error) throw error

        // Ensure profile exists (fallback if DB trigger fails)
        if (signUpData?.user) {
          const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', signUpData.user.id).maybeSingle()
          if (!existingProfile) {
            await (supabase.from('profiles') as any).insert({
              id: signUpData.user.id,
              email: email.trim(),
              name: name.trim(),
            })
          }
        }

        trackEvent('auth_register_success' as any)

        // Send OTP code via Edge Function (Resend API)
        const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`
        try {
          await fetch(`${FUNCTIONS_URL}/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), type: 'signup' }),
          })
        } catch {
          // If send-otp fails, user can resend from OTP screen
        }

        // Navigate to OTP verification screen
        router.push({ pathname: '/verify-otp', params: { email: email.trim(), mode: 'signup' } })
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
        setLoginAttempts(0)
        trackEvent('auth_login_success' as any)
        router.replace('/')
      }
    } catch (err: any) {
      if (mode === 'login') {
        const attempts = loginAttempts + 1
        setLoginAttempts(attempts)
        if (attempts >= 5) {
          setLockedUntil(Date.now() + 15 * 60 * 1000) // 15 min lockout
          setLoginAttempts(0)
        }
      }
      Alert.alert(t('common.error'), translateError(err.message))
    } finally { setLoading(false) }
  }

  const handleGoogleOAuth = async () => {
    setLoading(true)
    try {
      if (Platform.OS === 'web') {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: (typeof window !== 'undefined' ? window.location.origin : 'https://tackbird.fi') + '/auth/callback',
            queryParams: { prompt: 'select_account' },
            skipBrowserRedirect: false,
          },
        })
        if (error) Alert.alert(t('common.error'), t('auth.googleFailed'))
      } else {
        // Native: use WebBrowser to open OAuth flow and capture redirect
        const redirectTo = 'tackbird://auth/callback'
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            queryParams: { prompt: 'select_account' },
            skipBrowserRedirect: true,
          },
        })
        if (error) throw error
        if (data?.url) {
          const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
          if (result.type === 'success' && result.url) {
            const url = result.url
            const fragment = url.split('#')[1] || ''
            const query = url.split('?')[1]?.split('#')[0] || ''
            const raw = fragment || query
            const params = new URLSearchParams(raw)
            const accessToken = params.get('access_token')
            const refreshToken = params.get('refresh_token')
            const code = params.get('code')
            if (accessToken && refreshToken) {
              await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
              router.replace('/')
              return
            } else if (code) {
              await supabase.auth.exchangeCodeForSession(code)
              router.replace('/')
              return
            }
          }
        }
      }
    } catch {
      Alert.alert(t('common.error'), t('auth.googleFailedNetwork'))
    } finally {
      setLoading(false)
    }
  }

  const handleAppleSignIn = async () => {
    if (Platform.OS === 'web') return
    setLoading(true)
    try {
      const AppleAuth = require('expo-apple-authentication')
      const credential = await AppleAuth.signInAsync({
        requestedScopes: [
          AppleAuth.AppleAuthenticationScope.FULL_NAME,
          AppleAuth.AppleAuthenticationScope.EMAIL,
        ],
      })

      if (!credential.identityToken) {
        Alert.alert(t('common.error'), t('auth.appleFailed'))
        setLoading(false)
        return
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      })

      if (error) throw error
      router.replace('/')
    } catch (err: any) {
      // User cancelled — Apple throws ERR_REQUEST_CANCELED
      if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === 'ERR_CANCELED') {
        setLoading(false)
        return
      }
      Alert.alert(t('common.error'), t('auth.appleFailed'))
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={[styles.logoBigCircle, { backgroundColor: colors.primary }]}>
            <TackBirdLogo size={40} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.appName, { color: colors.primary }]}>TACKBIRD</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            {t('events.heroTitle')}
          </Text>
        </View>

        {/* Forgot password success */}
        {mode === 'forgot' && forgotSent ? (
          <View style={[styles.successBox, { backgroundColor: `${colors.success}15` }]}>
            <Check size={24} color={colors.success} />
            <Text style={[styles.successText, { color: colors.success }]}>{t('auth.resetLinkSent')}</Text>
            <Pressable onPress={() => { setMode('login'); setForgotSent(false) }}>
              <Text style={[styles.linkText, { color: colors.primary }]}>{t('auth.backToLogin')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Mode toggle */}
            {mode !== 'forgot' && (
              <View style={[styles.modeToggle, { backgroundColor: colors.muted }]}>
                <Pressable
                  onPress={() => setMode('login')}
                  style={[styles.modeBtn, mode === 'login' && { backgroundColor: colors.card }]}
                >
                  <Text style={[styles.modeText, { color: mode === 'login' ? colors.foreground : colors.mutedForeground }]}>
                    {t('auth.login')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode('register')}
                  style={[styles.modeBtn, mode === 'register' && { backgroundColor: colors.card }]}
                >
                  <Text style={[styles.modeText, { color: mode === 'register' ? colors.foreground : colors.mutedForeground }]}>
                    {t('auth.register')}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Google OAuth */}
            {mode !== 'forgot' && (
              <Pressable
                onPress={handleGoogleOAuth}
                style={[styles.googleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <GoogleLogo size={20} />
                <Text style={[styles.googleBtnText, { color: colors.foreground }]}>
                  {t('auth.signInWithGoogle')}
                </Text>
              </Pressable>
            )}

            {/* Apple Sign-In (native only, supported devices) */}
            {mode !== 'forgot' && Platform.OS !== 'web' && appleAvailable && (
              <Pressable
                onPress={handleAppleSignIn}
                style={[styles.appleBtn, { borderWidth: 1, borderColor: isDark ? colors.border : '#000000' }]}
              >
                <AppleLogo size={20} color="#FFFFFF" />
                <Text style={styles.appleBtnText}>
                  {t('auth.signInWithApple')}
                </Text>
              </Pressable>
            )}

            {/* Divider */}
            {mode !== 'forgot' && (
              <View style={styles.divider}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>{t('common.or')}</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>
            )}

            {/* Forgot password header */}
            {mode === 'forgot' && (
              <View style={{ gap: 8, marginBottom: 16 }}>
                <Text style={[styles.forgotTitle, { color: colors.foreground }]}>{t('auth.resetPassword')}</Text>
                <Text style={[styles.forgotHint, { color: colors.mutedForeground }]}>{t('auth.resetPasswordHint')}</Text>
              </View>
            )}

            {/* Form */}
            <View style={styles.form}>
              {mode === 'register' && (
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('auth.namePlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="words"
                />
              )}
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                value={email}
                onChangeText={setEmail}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
              {mode !== 'forgot' && (
                <View>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, paddingRight: 48 }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t('auth.passwordPlaceholder')}
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                  />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    hitSlop={8}
                  >
                    {showPassword ? (
                      <EyeOff size={20} color={colors.mutedForeground} />
                    ) : (
                      <Eye size={20} color={colors.mutedForeground} />
                    )}
                  </Pressable>
                </View>
              )}

              {/* Password strength (register only) */}
              {mode === 'register' && password.length > 0 && (
                <PasswordStrength password={password} colors={colors} />
              )}

              {/* Forgot password link */}
              {mode === 'login' && (
                <Pressable onPress={() => setMode('forgot')}>
                  <Text style={[styles.forgotLink, { color: colors.primary }]}>{t('auth.forgotPassword')}</Text>
                </Pressable>
              )}

              {/* Terms checkbox (register mode only) */}
              {mode === 'register' && (
                <View style={styles.termsRow}>
                  <Pressable onPress={() => setTermsAccepted(!termsAccepted)} style={styles.checkbox} hitSlop={8}>
                    {termsAccepted ? <Check size={16} color={colors.primary} /> : <View style={[styles.emptyCheckbox, { borderColor: colors.border }]} />}
                  </Pressable>
                  <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
                    {t('auth.acceptTerms')}{' '}
                    <Text onPress={() => router.push('/terms')} style={{ color: colors.primary }}>{t('auth.termsLink')}</Text>
                    {' '}{t('common.and')}{' '}
                    <Text onPress={() => router.push('/privacy')} style={{ color: colors.primary }}>{t('auth.privacyLink')}</Text>
                  </Text>
                </View>
              )}

              {/* Submit */}
              <Pressable
                onPress={handleSubmit}
                disabled={loading || (mode === 'register' && !termsAccepted)}
                style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: (loading || (mode === 'register' && !termsAccepted)) ? 0.6 : 1 }]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={[styles.submitText, { color: colors.primaryForeground }]}>
                    {mode === 'forgot' ? t('auth.sendResetLink') : mode === 'login' ? t('auth.login') : t('auth.register')}
                  </Text>
                )}
              </Pressable>

              {/* Back to login from forgot */}
              {mode === 'forgot' && (
                <Pressable onPress={() => setMode('login')} style={{ alignSelf: 'center' }}>
                  <Text style={[styles.linkText, { color: colors.primary }]}>{t('auth.backToLogin')}</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 24, paddingBottom: 64 },
  logoSection: { alignItems: 'center', gap: 12, marginBottom: 32 },
  logoBigCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  appName: { fontSize: 18, fontWeight: '700', letterSpacing: 1.7, fontFamily: fonts.heading },
  tagline: { fontSize: 14, textAlign: 'center' },
  modeToggle: {
    flexDirection: 'row', borderRadius: 12, padding: 4, marginBottom: 16,
  },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  modeText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingVertical: 14, minHeight: 48, marginBottom: 8,
  },
  googleBtnText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.bodySemi },
  appleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#000000', borderRadius: 12, paddingVertical: 14, minHeight: 48, marginBottom: 16,
  },
  appleBtnText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', fontFamily: fonts.bodySemi },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },
  forgotTitle: { fontSize: 20, fontWeight: '700', fontFamily: fonts.heading },
  forgotHint: { fontSize: 14, lineHeight: 20 },
  form: { gap: 12 },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 15, minHeight: 48,
  },
  eyeBtn: { position: 'absolute', right: 14, top: 14 },
  forgotLink: { fontSize: 13, fontWeight: '500', alignSelf: 'flex-end', fontFamily: fonts.bodyMedium },
  submitBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    justifyContent: 'center', minHeight: 48, marginTop: 8,
  },
  submitText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi },
  linkText: { fontSize: 14, fontWeight: '500', fontFamily: fonts.bodySemi },
  successBox: {
    borderRadius: 12, padding: 24, alignItems: 'center', gap: 12,
  },
  successText: { fontSize: 15, fontWeight: '500', textAlign: 'center', fontFamily: fonts.bodyMedium },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  emptyCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2 },
  termsText: { fontSize: 13, flex: 1, lineHeight: 18 },
})
