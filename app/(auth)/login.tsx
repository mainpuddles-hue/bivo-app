declare const __DEV__: boolean

import { useState, useEffect, useRef } from 'react'
import { View, Text, TextInput, ScrollView, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Eye, EyeOff, Check, X } from 'lucide-react-native'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import * as AppleAuthentication from 'expo-apple-authentication'
import { GoogleLogo } from '@/components/GoogleLogo'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import { trackEvent } from '@/lib/analytics'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { isBannedAndSignedOut } from '@/lib/auth/bannedCheck'

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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontSize: 12, lineHeight: 16, fontFamily: fonts.body },
})

function LoginScreenInner() {
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
  const [loginAttempts, setLoginAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [lockoutRemaining, setLockoutRemaining] = useState(0)
  const lockoutIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Persist lockout across app restarts
  useEffect(() => {
    AsyncStorage.getItem('tackbird_login_lockout').then(val => {
      if (val) {
        const ts = parseInt(val, 10)
        if (ts > Date.now()) setLockedUntil(ts)
      }
    }).catch(() => {})
  }, [])

  // Countdown timer for lockout display
  useEffect(() => {
    if (lockoutIntervalRef.current) {
      clearInterval(lockoutIntervalRef.current)
      lockoutIntervalRef.current = null
    }
    if (lockedUntil > Date.now()) {
      setLockoutRemaining(Math.max(0, lockedUntil - Date.now()))
      lockoutIntervalRef.current = setInterval(() => {
        const remaining = lockedUntil - Date.now()
        if (remaining <= 0) {
          setLockoutRemaining(0)
          if (lockoutIntervalRef.current) {
            clearInterval(lockoutIntervalRef.current)
            lockoutIntervalRef.current = null
          }
        } else {
          setLockoutRemaining(remaining)
        }
      }, 1000)
    } else {
      setLockoutRemaining(0)
    }
    return () => {
      if (lockoutIntervalRef.current) {
        clearInterval(lockoutIntervalRef.current)
        lockoutIntervalRef.current = null
      }
    }
  }, [lockedUntil])
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const translateError = (msg: string) => {
    const key = AUTH_ERROR_KEYS[msg]
    return key ? t(key) : msg
  }

  const handleSubmit = async () => {
    setErrorMsg('')
    // Client-side rate limiting
    if (Date.now() < lockedUntil) {
      setErrorMsg(t('auth.tooManyAttempts'))
      return
    }

    if (!email.trim()) { setErrorMsg(t('auth.emailRequired')); return }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setErrorMsg(t('auth.invalidEmail') ?? 'Invalid email format')
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
        setErrorMsg(translateError(err.message))
      } finally { setLoading(false) }
      return
    }

    if (!password.trim()) { Alert.alert(t('common.error'), t('auth.passwordRequired')); return }

    if (mode === 'register') {
      if (!termsAccepted) { setErrorMsg(t('auth.acceptTerms')); return }
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
              ? (typeof window !== 'undefined' ? window.location.origin : 'https://tackbird.com') + '/auth/callback'
              : Linking.createURL('auth/callback'),
          },
        })
        if (error) throw error

        // Ensure profile exists (fallback if DB trigger fails)
        if (signUpData?.user) {
          const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', signUpData.user.id).maybeSingle()
          if (!existingProfile) {
            const { error: profileError } = await (supabase.from('profiles') as any).insert({
              id: signUpData.user.id,
              email: email.trim(),
              name: name.trim(),
            })
            if (profileError && __DEV__) console.error('[auth] CRITICAL: profile creation failed:', profileError.message)
          }
        }

        trackEvent('auth_register_success' as any)

        // Send OTP code via Edge Function (Resend API)
        const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`
        try {
          await fetch(`${FUNCTIONS_URL}/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' },
            body: JSON.stringify({ email: email.trim(), type: 'signup' }),
          })
        } catch {
          // If send-otp fails, user can resend from OTP screen
        }

        // Navigate to OTP verification screen
        router.push({ pathname: '/verify-otp', params: { email: email.trim(), mode: 'signup' } })
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error

        // Check if user is banned before allowing access
        if (signInData?.user) {
          const { data: profile } = await supabase.from('profiles').select('is_banned').eq('id', signInData.user.id).maybeSingle()
          if ((profile as any)?.is_banned) {
            await supabase.auth.signOut()
            Alert.alert(t('auth.accountBanned'), t('auth.accountBannedDesc'))
            return
          }
        }

        setLoginAttempts(0)
        trackEvent('auth_login_success' as any)
        router.replace('/')
      }
    } catch (err: any) {
      if (mode === 'login') {
        const attempts = loginAttempts + 1
        setLoginAttempts(attempts)
        if (attempts >= 5) {
          const lockTs = Date.now() + 15 * 60 * 1000
          setLockedUntil(lockTs)
          setLoginAttempts(0)
          AsyncStorage.setItem('tackbird_login_lockout', String(lockTs)).catch(() => {})
        }
      }
      setErrorMsg(translateError(err.message))
    } finally { setLoading(false) }
  }

  const handleGoogleOAuth = async () => {
    setLoading(true)
    try {
      if (Platform.OS === 'web') {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: (typeof window !== 'undefined' ? window.location.origin : 'https://tackbird.com') + '/auth/callback',
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
              const { data: { user } } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
              if (user) {
                const { data: oauthProfile, error: banErr } = await supabase.from('profiles').select('is_banned').eq('id', user.id).maybeSingle()
                if (banErr || (oauthProfile as any)?.is_banned) {
                  await supabase.auth.signOut()
                  if ((oauthProfile as any)?.is_banned) {
                    Alert.alert(t('auth.accountBanned'), t('auth.accountBannedDesc'))
                  } else {
                    Alert.alert(t('common.error'), t('auth.googleFailedNetwork'))
                  }
                  return
                }
              }
              router.replace('/')
              return
            } else if (code) {
              const { data: { user } } = await supabase.auth.exchangeCodeForSession(code)
              if (user) {
                const { data: oauthProfile, error: banErr } = await supabase.from('profiles').select('is_banned').eq('id', user.id).maybeSingle()
                if (banErr || (oauthProfile as any)?.is_banned) {
                  await supabase.auth.signOut()
                  if ((oauthProfile as any)?.is_banned) {
                    Alert.alert(t('auth.accountBanned'), t('auth.accountBannedDesc'))
                  } else {
                    Alert.alert(t('common.error'), t('auth.googleFailedNetwork'))
                  }
                  return
                }
              }
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
    setErrorMsg('')
    setLoading(true)
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })
      if (!credential.identityToken) throw new Error('No identity token from Apple')

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      })
      if (error) throw error
      if (!data?.user) throw new Error('No user returned from Supabase')

      if (await isBannedAndSignedOut(supabase, data.user.id)) {
        setErrorMsg(t('auth.accountBannedDesc') ?? t('auth.accountBanned'))
        return
      }

      // First-login: persist Apple-provided full name (only sent on first sign in)
      if (credential.fullName?.givenName || credential.fullName?.familyName) {
        const fullName = [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean)
          .join(' ')
        if (fullName) {
          await (supabase.from('profiles') as any)
            .update({ name: fullName })
            .eq('id', data.user.id)
            .is('name', null)
            .catch(() => {})
        }
      }

      trackEvent('auth_login_success' as any)
      router.replace('/')
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.code === 'ERR_REQUEST_CANCELED') return
      setErrorMsg(translateError(err.message ?? 'Apple sign in failed'))
    } finally {
      setLoading(false)
    }
  }

  // Format ms remaining as mm:ss
  const formatLockoutTime = (ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  // Derived
  const isSubmitDisabled = loading || (mode === 'register' && !termsAccepted)

  const submitLabel = mode === 'forgot'
    ? t('auth.sendResetLink')
    : mode === 'login'
      ? t('auth.login')
      : t('auth.register')

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.background }]}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 56 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo mark — 48x48 ink rounded square with italic "tb" */}
        <View style={[styles.logoMark, { backgroundColor: colors.foreground }]}>
          <Text style={[styles.logoText, { color: colors.primaryForeground }]}>tb</Text>
        </View>

        {/* Headline */}
        <Text style={[styles.headline, { color: colors.foreground }]}>
          {mode === 'register'
            ? t('auth.joinTackBird')
            : mode === 'forgot'
              ? t('auth.resetPassword')
              : t('auth.tagline')}
        </Text>

        {/* Subtitle */}
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {mode === 'forgot'
            ? t('auth.resetPasswordHint')
            : mode === 'register'
              ? t('auth.fillAllFields')
              : t('auth.resetDescription')}
        </Text>

        {/* Section label */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {t('auth.email').toUpperCase()}
        </Text>

        {/* Email input */}
        <View style={[styles.inputField, { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.card }]}>
          <TextInput
            style={[styles.inputText, { color: colors.foreground }]}
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.emailPlaceholder')}
            placeholderTextColor={colors.tertiaryForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType={mode === 'forgot' ? 'send' : 'next'}
            accessibilityLabel={t('auth.email')}
          />
        </View>

        {/* Name input — register only */}
        {mode === 'register' && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 18 }]}>
              {t('auth.name').toUpperCase()}
            </Text>
            <View style={[styles.inputField, { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.card }]}>
              <TextInput
                style={[styles.inputText, { color: colors.foreground }]}
                value={name}
                onChangeText={setName}
                placeholder={t('auth.namePlaceholder')}
                placeholderTextColor={colors.tertiaryForeground}
                autoCapitalize="words"
                textContentType="name"
                returnKeyType="next"
                accessibilityLabel={t('auth.name')}
              />
            </View>
          </>
        )}

        {/* Password input — login and register */}
        {mode !== 'forgot' && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 18 }]}>
              {t('auth.password').toUpperCase()}
            </Text>
            <View style={[styles.inputField, { borderColor: colors.border, borderWidth: 1 }]}>
              <TextInput
                style={[styles.inputText, { color: colors.foreground, flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder={t('auth.passwordPlaceholder')}
                placeholderTextColor={colors.tertiaryForeground}
                secureTextEntry={!showPassword}
                autoComplete="password"
                textContentType={mode === 'register' ? 'newPassword' : 'password'}
                returnKeyType={mode === 'register' ? 'next' : 'go'}
                onSubmitEditing={mode === 'login' ? handleSubmit : undefined}
                accessibilityLabel={t('auth.password')}
              />
              <PressableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                {showPassword ? (
                  <EyeOff size={18} color={colors.mutedForeground} />
                ) : (
                  <Eye size={18} color={colors.mutedForeground} />
                )}
              </PressableOpacity>
            </View>
          </>
        )}

        {/* Password strength — register only */}
        {mode === 'register' && (
          <PasswordStrength password={password} colors={colors} />
        )}

        {/* Forgot password link — login only */}
        {mode === 'login' && (
          <PressableOpacity
            onPress={() => setMode('forgot')}
            accessibilityRole="link"
            accessibilityLabel={t('auth.forgotPassword')}
            style={styles.forgotBtn}
          >
            <Text style={[styles.forgotText, { color: colors.mutedForeground }]}>{t('auth.forgotPassword')}</Text>
          </PressableOpacity>
        )}

        {/* Terms — register mode */}
        {mode === 'register' && (
          <View style={styles.termsRow}>
            <PressableOpacity
              onPress={() => setTermsAccepted(!termsAccepted)}
              style={styles.checkboxHit}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              accessibilityLabel={t('auth.acceptTerms')}
            >
              <View style={[styles.checkbox, { borderColor: termsAccepted ? colors.foreground : colors.border }]}>
                {termsAccepted && <Check size={14} color={colors.foreground} />}
              </View>
            </PressableOpacity>
            <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
              {t('auth.acceptTerms')}{' '}
              <Text onPress={() => router.push('/terms')} style={[styles.termsLink, { color: colors.foreground }]}>{t('auth.termsLink')}</Text>
              {' '}{t('common.and')}{' '}
              <Text onPress={() => router.push('/privacy')} style={[styles.termsLink, { color: colors.foreground }]}>{t('auth.privacyLink')}</Text>
            </Text>
          </View>
        )}

        {/* Terms text for login (non-interactive, like mockup) */}
        {mode === 'login' && (
          <Text style={[styles.termsInline, { color: colors.mutedForeground }]}>
            {t('auth.acceptTerms')}{' '}
            <Text onPress={() => router.push('/terms')} style={[styles.termsLink, { color: colors.foreground }]}>{t('auth.termsLink')}</Text>
            {' '}{t('common.and')}{' '}
            <Text onPress={() => router.push('/privacy')} style={[styles.termsLink, { color: colors.foreground }]}>{t('auth.privacyLink')}</Text>.
          </Text>
        )}

        {/* Error message */}
        {errorMsg ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.destructive + '14' }]}>
            <Text style={[styles.errorText, { color: colors.destructive }]}>{errorMsg}</Text>
          </View>
        ) : null}

        {/* Primary CTA */}
        <PressableOpacity
          onPress={handleSubmit}
          disabled={isSubmitDisabled}
          style={[styles.primaryBtn, { backgroundColor: colors.foreground, opacity: isSubmitDisabled ? 0.5 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
              {submitLabel}
            </Text>
          )}
        </PressableOpacity>

        {/* Lockout countdown timer */}
        {lockoutRemaining > 0 && (
          <Text style={[styles.lockoutTimer, { color: colors.destructive }]}>
            {t('auth.lockoutTimer').replace('{time}', formatLockoutTime(lockoutRemaining))}
          </Text>
        )}

        {/* Back to login — forgot mode */}
        {mode === 'forgot' && (
          <PressableOpacity
            onPress={() => setMode('login')}
            style={styles.backToLoginBtn}
            accessibilityRole="link"
            accessibilityLabel={t('auth.backToLogin')}
          >
            <Text style={[styles.backToLoginText, { color: colors.foreground }]}>{t('auth.backToLogin')}</Text>
          </PressableOpacity>
        )}

        {/* "Tai" divider — login and register */}
        {mode !== 'forgot' && (
          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.tertiaryForeground }]}>
              {t('common.or').toUpperCase()}
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>
        )}

        {/* Apple Sign In — iOS only */}
        {mode !== 'forgot' && Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={
              isDark
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={999}
            style={styles.appleBtn}
            onPress={handleAppleSignIn}
          />
        )}

        {/* Google OAuth */}
        {mode !== 'forgot' && (
          <PressableOpacity
            onPress={handleGoogleOAuth}
            style={[styles.socialBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            accessibilityRole="button"
            accessibilityLabel={t('auth.signInWithGoogle')}
          >
            <GoogleLogo size={16} />
            <Text style={[styles.socialBtnText, { color: colors.foreground }]}>
              {t('auth.continueWithGoogle')}
            </Text>
          </PressableOpacity>
        )}

        {/* Spacer to push bottom link down */}
        <View style={{ flex: 1, minHeight: 32 }} />

        {/* Bottom toggle: "Uusi kayttaja? Luo tili" / "Onko tili? Kirjaudu" */}
        {mode !== 'forgot' && (
          <View style={[styles.bottomRow, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={[styles.bottomText, { color: colors.mutedForeground }]}>
              {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}{' '}
            </Text>
            <PressableOpacity
              onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
              style={styles.bottomLinkHit}
              accessibilityRole="link"
              accessibilityLabel={mode === 'login' ? t('auth.register') : t('auth.login')}
            >
              <Text style={[styles.bottomLink, { color: colors.foreground }]}>
                {mode === 'login' ? t('auth.register') : t('auth.login')}
              </Text>
            </PressableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },

  // Logo mark — 48x48 ink rounded square
  logoMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 44,
    alignSelf: 'center',
  },
  logoText: {
    fontFamily: fonts.heading,
    fontSize: 26,
    fontStyle: 'italic',
    lineHeight: 30,
    marginTop: -2,
  },

  // Headline — H1 size, centered
  headline: {
    fontFamily: fonts.heading,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    marginBottom: 10,
    textAlign: 'center',
  },

  // Subtitle
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 21,
    marginBottom: 36,
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: 280,
  },

  // Section label — Meta style uppercase
  sectionLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },

  // Input field — pill shape
  inputField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 18,
    minHeight: 48,
  },
  inputText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    letterSpacing: 0,
    flex: 1,
    paddingVertical: 14,
  },

  // Eye toggle inside password field
  eyeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8,
  },

  // Forgot password — muted, 13px, underlined
  forgotBtn: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 4,
  },
  forgotText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    textDecorationLine: 'underline',
  },

  // Terms (inline for login) — 11px muted centered
  termsInline: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 14,
    marginBottom: 8,
    textAlign: 'center',
  },

  // Terms row (for register with checkbox)
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 12,
  },
  checkboxHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsText: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 17,
    flex: 1,
    paddingTop: 12,
  },
  termsLink: {
    textDecorationLine: 'underline',
  },

  // Error
  errorBanner: {
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },

  // Lockout countdown
  lockoutTimer: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 10,
  },

  // Primary CTA — pill, 54px height, 15px 600
  primaryBtn: {
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    minHeight: 54,
    marginTop: 18,
  },
  primaryBtnText: {
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0,
  },

  // Back to login
  backToLoginBtn: {
    alignSelf: 'center',
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  backToLoginText: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: 'underline',
  },

  // Divider — line / text / line
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    marginBottom: 18,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: {
    fontFamily: fonts.bodySemi,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  // Apple button — pill, 50px height
  appleBtn: {
    width: '100%',
    height: 50,
    minHeight: 48,
    marginBottom: 10,
  },

  // Social button — pill, surface bg, 1px border, 48-52px height
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 999,
    height: 50,
    minHeight: 48,
    marginBottom: 10,
  },
  socialBtnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 20,
  },

  // Bottom toggle
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
  },
  bottomText: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  bottomLinkHit: {
    minHeight: 44,
    justifyContent: 'center',
  },
  bottomLink: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    lineHeight: 16,
    textDecorationLine: 'underline',
  },
})

export default function LoginScreen() {
  return (
    <ScreenErrorBoundary screenName="Login">
      <LoginScreenInner />
    </ScreenErrorBoundary>
  )
}
