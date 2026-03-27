import { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { TackBirdLogo } from '@/components/TackBirdLogo'

/**
 * Auth callback screen — handles OAuth redirect from Google/Supabase.
 *
 * Supabase OAuth returns tokens in two possible ways:
 * 1. PKCE flow: ?code=xxx in query params
 * 2. Implicit flow: #access_token=xxx&refresh_token=xxx in URL hash
 *
 * We handle both cases.
 */
export default function AuthCallbackScreen() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()
  const params = useLocalSearchParams()
  const supabase = useSupabase()
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(true)

  useEffect(() => {
    async function handleCallback() {
      try {
        // Check for error from Supabase
        const errorParam = params.error as string | undefined
        if (errorParam) {
          setError(params.error_description as string ?? errorParam)
          setProcessing(false)
          return
        }

        // Method 1: PKCE flow — code in query params
        const code = params.code as string | undefined
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            setError(exchangeError.message)
            setProcessing(false)
            return
          }
          // Check if this is a password recovery flow
          const type = params.type as string | undefined
          if (type === 'recovery') {
            router.replace('/settings')
            return
          }
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            router.replace('/(tabs)')
            return
          }
        }

        // Method 1b: Native deep link — tokens arrive as query params
        // Supabase email links use #fragment which Expo Router may pass as params
        const accessTokenParam = params.access_token as string | undefined
        const refreshTokenParam = params.refresh_token as string | undefined
        if (accessTokenParam && refreshTokenParam) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessTokenParam,
            refresh_token: refreshTokenParam,
          })
          if (setSessionError) {
            setError(setSessionError.message)
            setProcessing(false)
            return
          }
          // Check if this is a password recovery flow
          const type = params.type as string | undefined
          if (type === 'recovery') {
            router.replace('/settings')
          } else {
            router.replace('/(tabs)')
          }
          return
        }

        // Method 2: Implicit flow — tokens in URL hash fragment
        // On web, check window.location.hash
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const hash = window.location.hash
          if (hash && hash.includes('access_token')) {
            // Supabase JS client auto-detects hash tokens when getSession is called
            // But we need to give it a moment to process
            await new Promise(resolve => setTimeout(resolve, 500))

            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
              // Clear the hash to prevent re-processing
              window.location.hash = ''
              router.replace('/(tabs)')
              return
            }

            // Try setting session manually from hash params
            const hashParams = new URLSearchParams(hash.substring(1))
            const accessToken = hashParams.get('access_token')
            const refreshToken = hashParams.get('refresh_token')

            if (accessToken && refreshToken) {
              const { error: setSessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              })
              if (!setSessionError) {
                window.location.hash = ''
                router.replace('/(tabs)')
                return
              }
              setError(setSessionError.message)
              setProcessing(false)
              return
            }
          }
        }

        // Method 3: Wait and check — sometimes Supabase processes async
        await new Promise(resolve => setTimeout(resolve, 2000))
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          router.replace('/(tabs)')
          return
        }

        setError(t('auth.loginFailed'))
        setProcessing(false)
      } catch (err: any) {
        setError(err.message ?? t('auth.loginFailed'))
        setProcessing(false)
      }
    }

    handleCallback()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Run once on mount — params intentionally omitted

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
        <TackBirdLogo size={32} color={colors.primaryForeground} />
      </View>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          <Text
            style={[styles.backLink, { color: colors.primary }]}
            onPress={() => router.replace('/(auth)/login')}
          >
            {t('auth.backToLogin')}
          </Text>
        </View>
      ) : (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            {t('common.loading')}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  logoCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  loadingBox: { alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14 },
  errorBox: { alignItems: 'center', gap: 12 },
  errorText: { fontSize: 15, textAlign: 'center' },
  backLink: { fontSize: 14, fontWeight: '500' },
})
