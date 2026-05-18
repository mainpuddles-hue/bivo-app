declare const __DEV__: boolean

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Pressable,
  useWindowDimensions,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Eye, EyeOff, Check, X, ChevronLeft } from 'lucide-react-native'
import * as Linking from 'expo-linking'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
  runOnJS,
  Extrapolation,
} from 'react-native-reanimated'
import { useVideoPlayer, VideoView } from 'expo-video'
import { LinearGradient } from 'expo-linear-gradient'
import { GoogleLogo } from '@/components/GoogleLogo'
import { BivoTextLogo } from '@/components/BivoTextLogo'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import { trackEvent } from '@/lib/analytics'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { isBannedAndSignedOut } from '@/lib/auth/bannedCheck'
import { useToast } from '@/components/Toast'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SPLASH_MS = 2000
const ANIM_MS = 600
const LOGO_W = 220
const LOGO_SCALE = 0.5
const LOGO_APPROX_W = 200
const LOGO_APPROX_H = 80

const AUTH_ERROR_KEYS: Record<string, string> = {
  'Invalid login credentials': 'auth.invalidCredentials',
  'User already registered': 'auth.userAlreadyRegistered',
  'Email not confirmed': 'auth.emailNotConfirmed',
  'Password should be at least 6 characters': 'auth.passwordTooShort',
  'Signup requires a valid password': 'auth.invalidPassword',
}

const videoSource = require('../../assets/herovideo-loop.mp4')

function PasswordStrength({ password, colors }: { password: string; colors: any }) {
  const { t } = useI18n()
  const checks = [
    { key: 'len', label: t('auth.passwordMinLength'), met: password.length >= 8 },
    { key: 'up', label: t('auth.passwordUppercase'), met: /[A-Z]/.test(password) },
    { key: 'num', label: t('auth.passwordNumber'), met: /[0-9]/.test(password) },
  ]
  return (
    <View style={pwS.container}>
      {checks.map(c => (
        <View key={c.key} style={pwS.row}>
          {c.met ? <Check size={14} color={colors.success} /> : <X size={14} color={colors.destructive} />}
          <Text style={[pwS.text, { color: c.met ? colors.success : colors.destructive }]}>{c.label}</Text>
        </View>
      ))}
    </View>
  )
}
const pwS = StyleSheet.create({
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
  const toast = useToast()
  const { width: SW, height: SH } = useWindowDimensions()

  // Auth state
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loginAttempts, setLoginAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [lockoutRemaining, setLockoutRemaining] = useState(0)
  const lockoutRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [touchedEmail, setTouchedEmail] = useState(false)
  const [touchedPassword, setTouchedPassword] = useState(false)
  const [appleAvailable, setAppleAvailable] = useState(false)

  // Phase & animation
  const [phase, setPhase] = useState<'splash' | 'welcome' | 'form'>('splash')
  const [formMounted, setFormMounted] = useState(false)
  const splashAnim = useSharedValue(0)
  const formAnim = useSharedValue(0)
  const splashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Video
  const player = useVideoPlayer(videoSource, p => {
    p.loop = true
    p.muted = true
    p.play()
  })

  // Lockout persistence
  useEffect(() => {
    AsyncStorage.getItem('tackbird_login_lockout').then(val => {
      if (val) {
        const ts = parseInt(val, 10)
        if (ts > Date.now()) setLockedUntil(ts)
        else AsyncStorage.removeItem('tackbird_login_lockout').catch(() => {})
      }
    }).catch(e => { if (__DEV__) console.warn('Session storage failed:', e) })
  }, [])

  // Lockout countdown
  useEffect(() => {
    if (lockoutRef.current) { clearInterval(lockoutRef.current); lockoutRef.current = null }
    if (lockedUntil > Date.now()) {
      setLockoutRemaining(Math.max(0, lockedUntil - Date.now()))
      lockoutRef.current = setInterval(() => {
        const r = lockedUntil - Date.now()
        if (r <= 0) { setLockoutRemaining(0); if (lockoutRef.current) { clearInterval(lockoutRef.current); lockoutRef.current = null } }
        else setLockoutRemaining(r)
      }, 1000)
    } else { setLockoutRemaining(0) }
    return () => { if (lockoutRef.current) { clearInterval(lockoutRef.current); lockoutRef.current = null } }
  }, [lockedUntil])

  // Apple availability
  useEffect(() => {
    if (Platform.OS !== 'ios') return
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false))
  }, [])

  // Splash → welcome auto-transition
  useEffect(() => {
    splashTimer.current = setTimeout(() => {
      splashAnim.value = withTiming(1, { duration: ANIM_MS, easing: Easing.out(Easing.cubic) })
      setPhase('welcome')
    }, SPLASH_MS)
    return () => { if (splashTimer.current) clearTimeout(splashTimer.current) }
  }, [])

  const skipSplash = useCallback(() => {
    if (phase !== 'splash') return
    if (splashTimer.current) clearTimeout(splashTimer.current)
    splashAnim.value = withTiming(1, { duration: ANIM_MS, easing: Easing.out(Easing.cubic) })
    setPhase('welcome')
  }, [phase])

  const showForm = useCallback((m: 'login' | 'register') => {
    setMode(m)
    setErrorMsg('')
    setFormMounted(true)
    setPhase('form')
    formAnim.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) })
  }, [])

  const hideForm = useCallback(() => {
    formAnim.value = withTiming(0, { duration: 400, easing: Easing.in(Easing.cubic) }, () => {
      runOnJS(setFormMounted)(false)
      runOnJS(setPhase)('welcome')
    })
    setErrorMsg('')
  }, [])

  // Validation
  const emailError = touchedEmail && email.trim() && !emailRegex.test(email.trim()) ? (t('auth.invalidEmail') ?? 'Invalid email') : ''
  const passwordError = touchedPassword && mode === 'register' && password.trim() && (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) ? (t('settings.passwordTooWeak') ?? 'Weak password') : ''
  const translateError = (msg: string) => { const key = AUTH_ERROR_KEYS[msg]; return key ? t(key) : msg }

  // Submit
  const handleSubmit = async () => {
    setErrorMsg('')
    if (Date.now() < lockedUntil) { setErrorMsg(t('auth.tooManyAttempts')); return }
    if (!email.trim()) { setErrorMsg(t('auth.emailRequired')); return }
    if (!emailRegex.test(email.trim())) { setErrorMsg(t('auth.invalidEmail') ?? 'Invalid email format'); return }

    if (mode === 'forgot') {
      setLoading(true)
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
        if (error) throw error
        router.push({ pathname: '/verify-otp', params: { email: email.trim(), mode: 'recovery' } })
      } catch (err: any) { setErrorMsg(translateError(err.message)) }
      finally { setLoading(false) }
      return
    }

    if (!password.trim()) { setErrorMsg(t('auth.passwordRequired')); return }
    if (mode === 'register') {
      if (!termsAccepted) { setErrorMsg(t('auth.acceptTerms')); return }
      if (!name.trim()) { setErrorMsg(t('auth.nameRequired')); return }
      if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) { setErrorMsg(t('settings.passwordTooWeak')); return }
    }

    setLoading(true)
    try {
      if (mode === 'register') {
        trackEvent('auth_register_start')
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: {
            data: { name: name.trim() },
            emailRedirectTo: Platform.OS === 'web'
              ? (typeof window !== 'undefined' ? window.location.origin : 'https://tackbird.com') + '/auth/callback'
              : Linking.createURL('auth/callback'),
          },
        })
        if (error) throw error
        if (signUpData?.user) {
          const { data: existing } = await supabase.from('profiles').select('id').eq('id', signUpData.user.id).maybeSingle()
          if (!existing) {
            const { error: pErr } = await (supabase.from('profiles') as any).insert({ id: signUpData.user.id, email: email.trim(), name: name.trim() })
            if (pErr && __DEV__) console.error('[auth] CRITICAL: profile creation failed:', pErr.message)
          }
        }
        trackEvent('auth_register_success')
        const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`
        try { await fetch(`${FUNCTIONS_URL}/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' }, body: JSON.stringify({ email: email.trim(), type: 'signup' }) }) } catch {}
        router.push({ pathname: '/verify-otp', params: { email: email.trim(), mode: 'signup' } })
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        if (signInData?.user) {
          const { data: profile } = await supabase.from('profiles').select('is_banned').eq('id', signInData.user.id).maybeSingle()
          if ((profile as any)?.is_banned) { await supabase.auth.signOut(); toast.show({ message: t('auth.accountBannedDesc'), type: 'error' }); return }
        }
        setLoginAttempts(0)
        trackEvent('auth_login_success')
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
        toast.show({ message: t('auth.welcomeBack') ?? 'Tervetuloa takaisin!', type: 'success' })
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
          AsyncStorage.setItem('tackbird_login_lockout', String(lockTs)).catch(e => { if (__DEV__) console.warn('Login lockout persistence failed:', e) })
        }
      }
      setErrorMsg(translateError(err.message))
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error) } catch {}
    } finally { setLoading(false) }
  }

  // Google OAuth
  const handleGoogleOAuth = async () => {
    setErrorMsg('')
    setLoading(true)
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin')
      GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID })
      await GoogleSignin.hasPlayServices()
      const result = await GoogleSignin.signIn()
      const idToken = result.data?.idToken
      if (!idToken) throw new Error('No ID token from Google')
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
      if (error) throw error
      if (!data?.user) throw new Error('No user returned from Supabase')
      if (await isBannedAndSignedOut(supabase, data.user.id)) { setErrorMsg(t('auth.accountBannedDesc') ?? t('auth.accountBanned')); return }
      trackEvent('auth_login_success')
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
      toast.show({ message: t('auth.welcomeBack') ?? 'Tervetuloa takaisin!', type: 'success' })
      router.replace('/')
    } catch (err: any) {
      if (err?.code === 'SIGN_IN_CANCELLED' || err?.code === 'ERR_CANCELED') return
      toast.show({ message: t('auth.googleFailedNetwork'), type: 'error' })
    } finally { setLoading(false) }
  }

  // Apple Sign In
  const handleAppleSignIn = async () => {
    setErrorMsg('')
    setLoading(true)
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      })
      if (!credential.identityToken) throw new Error('No identity token from Apple')
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken })
      if (error) throw error
      if (!data?.user) throw new Error('No user returned from Supabase')
      if (await isBannedAndSignedOut(supabase, data.user.id)) { setErrorMsg(t('auth.accountBannedDesc') ?? t('auth.accountBanned')); return }
      if (credential.fullName?.givenName || credential.fullName?.familyName) {
        const fullName = [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(' ')
        if (fullName) {
          const { error: nameErr } = await (supabase.from('profiles') as any).update({ name: fullName }).eq('id', data.user.id).is('name', null)
          if (nameErr && __DEV__) console.warn('[auth] Apple name save failed:', nameErr.message)
        }
      }
      trackEvent('auth_login_success')
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
      toast.show({ message: t('auth.welcomeBack') ?? 'Tervetuloa takaisin!', type: 'success' })
      router.replace('/')
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.code === 'ERR_REQUEST_CANCELED') return
      const known = err?.message ? translateError(err.message) : ''
      setErrorMsg(known && known !== err.message ? known : t('auth.appleFailed'))
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error) } catch {}
    } finally { setLoading(false) }
  }

  const formatLockoutTime = (ms: number): string => {
    const s = Math.ceil(ms / 1000)
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  const isSubmitDisabled = loading || (mode === 'register' && !termsAccepted)
  const submitLabel = mode === 'forgot' ? t('auth.sendResetLink') : mode === 'login' ? t('auth.login') : t('auth.register')

  // Animated styles
  const logoStyle = useAnimatedStyle(() => {
    const s = interpolate(splashAnim.value, [0, 1], [1, LOGO_SCALE])
    const x0 = (SW - LOGO_APPROX_W) / 2
    const y0 = SH * 0.40
    const x1 = 22
    const y1 = insets.top + 16
    const tX = interpolate(splashAnim.value, [0, 1], [x0, x1])
    const tY = interpolate(splashAnim.value, [0, 1], [y0, y1])
    const oX = LOGO_APPROX_W * (1 - s) / 2
    const oY = LOGO_APPROX_H * (1 - s) / 2
    return { transform: [{ translateX: tX - oX }, { translateY: tY - oY }, { scale: s }] }
  })

  const welcomeStyle = useAnimatedStyle(() => {
    const opacity = interpolate(splashAnim.value, [0.5, 1], [0, 1], Extrapolation.CLAMP)
    const ty = interpolate(splashAnim.value, [0.5, 1], [30, 0], Extrapolation.CLAMP)
    const ff = interpolate(formAnim.value, [0, 0.3], [1, 0], Extrapolation.CLAMP)
    return { opacity: opacity * ff, transform: [{ translateY: ty }] }
  })

  const formCardStyle = useAnimatedStyle(() => {
    const ty = interpolate(formAnim.value, [0, 1], [SH, 0])
    return { transform: [{ translateY: ty }] }
  })

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="cover" allowsPictureInPicture={false} />

      <LinearGradient colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.8)']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />

      {phase === 'splash' && <Pressable onPress={skipSplash} style={StyleSheet.absoluteFill} />}

      <Animated.View style={[styles.logoAbsolute, logoStyle]} pointerEvents="none">
        <BivoTextLogo width={LOGO_W} color="#FFFFFF" />
      </Animated.View>

      <Animated.View style={[styles.welcomeWrap, welcomeStyle]} pointerEvents={phase === 'welcome' ? 'auto' : 'none'}>
        <View style={styles.welcomeText}>
          <Text style={styles.welcomeHeadline}>{t('auth.welcomeHeadline')}</Text>
          <Text style={styles.welcomeSub}>{t('auth.welcomeSubtitle')}</Text>
        </View>
        <View style={[styles.welcomeCTAs, { paddingBottom: insets.bottom + 28 }]}>
          <PressableOpacity onPress={() => showForm('register')} style={styles.ctaFilled} accessibilityRole="button" accessibilityLabel={t('auth.createAccount')}>
            <Text style={styles.ctaFilledText}>{t('auth.createAccount')}</Text>
          </PressableOpacity>
          <PressableOpacity onPress={() => showForm('login')} style={styles.ctaGlass} accessibilityRole="button" accessibilityLabel={t('auth.login')}>
            <Text style={styles.ctaGlassText}>{t('auth.login')}</Text>
          </PressableOpacity>
        </View>
      </Animated.View>

      {formMounted && (
        <Animated.View style={[styles.formCard, { top: SH * 0.12, backgroundColor: colors.background }, formCardStyle]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.formHeader}>
              <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
              <View style={styles.formHeaderRow}>
                <PressableOpacity onPress={mode === 'forgot' ? () => setMode('login') : hideForm} style={styles.backBtn} accessibilityRole="button">
                  <ChevronLeft size={24} color={colors.foreground} />
                </PressableOpacity>
                <Text style={[styles.formTitle, { color: colors.foreground }]}>
                  {mode === 'register' ? t('auth.joinBivo') : mode === 'forgot' ? t('auth.resetPassword') : t('auth.login')}
                </Text>
                <View style={{ width: 44 }} />
              </View>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('auth.email').toUpperCase()}</Text>
              <View style={[styles.inputField, { borderColor: emailError ? colors.destructive : colors.border, borderWidth: emailError ? 1.5 : 1, backgroundColor: colors.card }]}>
                <TextInput style={[styles.inputText, { color: colors.foreground }]} value={email} onChangeText={setEmail} onBlur={() => setTouchedEmail(true)} placeholder={t('auth.emailPlaceholder')} placeholderTextColor={colors.tertiaryForeground} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" returnKeyType={mode === 'forgot' ? 'send' : 'next'} accessibilityLabel={t('auth.email')} />
              </View>
              {emailError ? <Text style={[styles.fieldError, { color: colors.destructive }]} accessibilityRole="alert">{emailError}</Text> : null}

              {mode === 'register' && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 18 }]}>{t('auth.name').toUpperCase()}</Text>
                  <View style={[styles.inputField, { borderColor: colors.border, borderWidth: 1, backgroundColor: colors.card }]}>
                    <TextInput style={[styles.inputText, { color: colors.foreground }]} value={name} onChangeText={setName} placeholder={t('auth.namePlaceholder')} placeholderTextColor={colors.tertiaryForeground} autoCapitalize="words" textContentType="name" returnKeyType="next" accessibilityLabel={t('auth.name')} />
                  </View>
                </>
              )}

              {mode !== 'forgot' && (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 18 }]}>{t('auth.password').toUpperCase()}</Text>
                  <View style={[styles.inputField, { borderColor: passwordError ? colors.destructive : colors.border, borderWidth: passwordError ? 1.5 : 1, backgroundColor: colors.card }]}>
                    <TextInput style={[styles.inputText, { color: colors.foreground, flex: 1 }]} value={password} onChangeText={setPassword} onBlur={() => setTouchedPassword(true)} placeholder={t('auth.passwordPlaceholder')} placeholderTextColor={colors.tertiaryForeground} secureTextEntry={!showPassword} autoComplete="password" textContentType={mode === 'register' ? 'newPassword' : 'password'} returnKeyType={mode === 'register' ? 'next' : 'go'} onSubmitEditing={mode === 'login' ? handleSubmit : undefined} accessibilityLabel={t('auth.password')} />
                    <PressableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}>
                      {showPassword ? <EyeOff size={18} color={colors.mutedForeground} /> : <Eye size={18} color={colors.mutedForeground} />}
                    </PressableOpacity>
                  </View>
                </>
              )}

              {mode === 'register' && <PasswordStrength password={password} colors={colors} />}

              {mode === 'login' && (
                <PressableOpacity onPress={() => setMode('forgot')} accessibilityRole="link" style={styles.forgotBtn}>
                  <Text style={[styles.forgotText, { color: colors.mutedForeground }]}>{t('auth.forgotPassword')}</Text>
                </PressableOpacity>
              )}

              {mode === 'register' && (
                <View style={styles.termsRow}>
                  <PressableOpacity onPress={() => setTermsAccepted(!termsAccepted)} style={styles.checkboxHit} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: termsAccepted }}>
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

              {mode === 'login' && (
                <Text style={[styles.termsInline, { color: colors.mutedForeground }]}>
                  {t('auth.acceptTerms')}{' '}
                  <Text onPress={() => router.push('/terms')} style={[styles.termsLink, { color: colors.foreground }]}>{t('auth.termsLink')}</Text>
                  {' '}{t('common.and')}{' '}
                  <Text onPress={() => router.push('/privacy')} style={[styles.termsLink, { color: colors.foreground }]}>{t('auth.privacyLink')}</Text>.
                </Text>
              )}

              {errorMsg ? (
                <View style={[styles.errorBanner, { backgroundColor: colors.destructive + '14' }]}>
                  <Text style={[styles.errorText, { color: colors.destructive }]}>{errorMsg}</Text>
                </View>
              ) : null}

              <PressableOpacity onPress={handleSubmit} disabled={isSubmitDisabled} style={[styles.primaryBtn, { backgroundColor: colors.foreground, opacity: isSubmitDisabled ? 0.5 : 1 }]} accessibilityRole="button" accessibilityLabel={submitLabel}>
                {loading ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>{submitLabel}</Text>}
              </PressableOpacity>

              {lockoutRemaining > 0 && (
                <Text style={[styles.lockoutTimer, { color: colors.destructive }]}>{t('auth.lockoutTimer').replace('{time}', formatLockoutTime(lockoutRemaining))}</Text>
              )}

              {mode !== 'forgot' && (
                <>
                  <View style={styles.divider}>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                    <Text style={[styles.dividerText, { color: colors.tertiaryForeground }]}>{t('common.or').toUpperCase()}</Text>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                  </View>

                  {Platform.OS === 'ios' && appleAvailable && (
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                      buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                      cornerRadius={14}
                      style={styles.appleBtn}
                      onPress={handleAppleSignIn}
                    />
                  )}

                  <PressableOpacity onPress={handleGoogleOAuth} style={[styles.socialBtn, { borderColor: colors.border, backgroundColor: colors.card }]} accessibilityRole="button" accessibilityLabel={t('auth.signInWithGoogle')}>
                    <GoogleLogo size={16} />
                    <Text style={[styles.socialBtnText, { color: colors.foreground }]}>{t('auth.continueWithGoogle')}</Text>
                  </PressableOpacity>
                </>
              )}

              <View style={{ flex: 1, minHeight: 32 }} />

              {mode !== 'forgot' && (
                <View style={[styles.bottomRow, { paddingBottom: insets.bottom + 16 }]}>
                  <Text style={[styles.bottomText, { color: colors.mutedForeground }]}>
                    {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}{' '}
                  </Text>
                  <PressableOpacity onPress={() => setMode(mode === 'login' ? 'register' : 'login')} style={styles.bottomLinkHit} accessibilityRole="link">
                    <Text style={[styles.bottomLink, { color: colors.foreground }]}>{mode === 'login' ? t('auth.register') : t('auth.login')}</Text>
                  </PressableOpacity>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  logoAbsolute: { position: 'absolute', zIndex: 10 },

  // Welcome
  welcomeWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    paddingHorizontal: 22,
    zIndex: 5,
  },
  welcomeText: { marginBottom: 40 },
  welcomeHeadline: {
    fontFamily: fonts.displayBold,
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -2,
    color: '#FFFFFF',
  },
  welcomeSub: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 12,
    maxWidth: 280,
  },
  welcomeCTAs: { gap: 12 },
  ctaFilled: {
    height: 56,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaFilledText: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    lineHeight: 20,
    color: '#1A1A1A',
    letterSpacing: -0.3,
  },
  ctaGlass: {
    height: 56,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaGlassText: {
    fontFamily: fonts.bodySemi,
    fontSize: 16,
    lineHeight: 20,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },

  // Form card
  formCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  formHeader: { alignItems: 'center', paddingTop: 10 },
  dragHandle: { width: 36, height: 4, borderRadius: 999, marginBottom: 8 },
  formHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 6,
    marginBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.headingSemi,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  formContent: { paddingHorizontal: 22, flexGrow: 1 },

  // Form fields
  sectionLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  inputField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 18,
    minHeight: 52,
  },
  inputText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    letterSpacing: -0.1,
    flex: 1,
    paddingVertical: 15,
  },
  fieldError: { fontSize: 12, fontFamily: fonts.body, marginTop: 4 },
  eyeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8,
  },
  forgotBtn: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginTop: 4 },
  forgotText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, textDecorationLine: 'underline' },
  termsInline: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 14, marginBottom: 8, textAlign: 'center' },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 },
  checkboxHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  termsText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, flex: 1, paddingTop: 12 },
  termsLink: { textDecorationLine: 'underline' },
  errorBanner: { borderRadius: 14, padding: 12, marginTop: 8 },
  errorText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  lockoutTimer: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 10 },
  primaryBtn: { borderRadius: 14, alignItems: 'center', justifyContent: 'center', height: 56, minHeight: 56, marginTop: 24 },
  primaryBtnText: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 20, letterSpacing: -0.3 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 24 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' },
  appleBtn: { width: '100%', height: 52, minHeight: 48, marginBottom: 10 },
  socialBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderRadius: 14, height: 52, minHeight: 48, marginBottom: 10 },
  socialBtnText: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 20 },
  bottomRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 16 },
  bottomText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  bottomLinkHit: { minHeight: 44, justifyContent: 'center' },
  bottomLink: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 16, textDecorationLine: 'underline' },
})

export default function LoginScreen() {
  return (
    <ScreenErrorBoundary screenName="Login">
      <LoginScreenInner />
    </ScreenErrorBoundary>
  )
}
