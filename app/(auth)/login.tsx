import { useState, useMemo } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Eye, EyeOff, Check, X } from 'lucide-react-native'
import { GoogleLogo } from '@/components/GoogleLogo'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { TackBirdLogo } from '@/components/TackBirdLogo'

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
  const supabase = useMemo(() => createClient(), [])

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  const translateError = (msg: string) => {
    const key = AUTH_ERROR_KEYS[msg]
    return key ? t(key) : msg
  }

  const handleSubmit = async () => {
    if (!email.trim()) { Alert.alert(t('common.error'), t('auth.emailRequired')); return }

    if (mode === 'forgot') {
      setLoading(true)
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
        if (error) throw error
        setForgotSent(true)
      } catch (err: any) {
        Alert.alert(t('common.error'), translateError(err.message))
      } finally { setLoading(false) }
      return
    }

    if (!password.trim()) { Alert.alert(t('common.error'), t('auth.passwordRequired')); return }

    setLoading(true)
    try {
      if (mode === 'register') {
        if (!name.trim()) { Alert.alert(t('common.error'), t('auth.nameRequired')); setLoading(false); return }
        if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
          Alert.alert(t('common.error'), t('settings.passwordTooWeak'))
          setLoading(false)
          return
        }
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() } },
        })
        if (error) throw error
        Alert.alert(t('common.success'), t('auth.checkEmail'))
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
        router.replace('/')
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), translateError(err.message))
    } finally { setLoading(false) }
  }

  const handleGoogleOAuth = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'https://dist-two-navy-29.vercel.app/auth/callback',
          queryParams: {
            prompt: 'select_account',
          },
          skipBrowserRedirect: false,
        },
      })
      if (error) {
        Alert.alert(t('common.error'), t('auth.googleFailed'))
        setLoading(false)
      }
      // Don't reset loading — browser navigates to Google
    } catch {
      Alert.alert(t('common.error'), t('auth.googleFailedNetwork'))
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

              {/* Submit */}
              <Pressable
                onPress={handleSubmit}
                disabled={loading}
                style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]}
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
  content: { paddingHorizontal: 24, paddingBottom: 60 },
  logoSection: { alignItems: 'center', gap: 12, marginBottom: 32 },
  logoBigCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  appName: { fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  tagline: { fontSize: 14, textAlign: 'center' },
  modeToggle: {
    flexDirection: 'row', borderRadius: 12, padding: 4, marginBottom: 16,
  },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  modeText: { fontSize: 14, fontWeight: '600' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingVertical: 14, minHeight: 48, marginBottom: 16,
  },
  googleBtnText: { fontSize: 15, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13 },
  forgotTitle: { fontSize: 20, fontWeight: '700' },
  forgotHint: { fontSize: 14, lineHeight: 20 },
  form: { gap: 12 },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 15, minHeight: 48,
  },
  eyeBtn: { position: 'absolute', right: 14, top: 14 },
  forgotLink: { fontSize: 13, fontWeight: '500', alignSelf: 'flex-end' },
  submitBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    justifyContent: 'center', minHeight: 48, marginTop: 8,
  },
  submitText: { fontSize: 16, fontWeight: '600' },
  linkText: { fontSize: 14, fontWeight: '500' },
  successBox: {
    borderRadius: 12, padding: 24, alignItems: 'center', gap: 12,
  },
  successText: { fontSize: 15, fontWeight: '500', textAlign: 'center' },
})
