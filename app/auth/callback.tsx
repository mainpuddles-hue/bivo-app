import { useEffect, useMemo, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { TackBirdLogo } from '@/components/TackBirdLogo'

/**
 * Auth callback screen — handles OAuth redirect from Google/Supabase.
 * Supabase appends ?code=xxx or #access_token=xxx to this URL after OAuth.
 * We exchange the code/token for a session and redirect to home.
 */
export default function AuthCallbackScreen() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()
  const params = useLocalSearchParams()
  const supabase = useMemo(() => createClient(), [])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleCallback() {
      try {
        // For Expo web, Supabase may put tokens in the URL hash
        // The Supabase client auto-detects hash tokens on init
        // But we also check for ?code= param (PKCE flow)
        const code = params.code as string | undefined
        const errorParam = params.error as string | undefined

        if (errorParam) {
          setError(params.error_description as string ?? errorParam)
          return
        }

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            setError(exchangeError.message)
            return
          }
        }

        // Check if we have a session now (from hash tokens or code exchange)
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          router.replace('/')
        } else {
          // Wait a moment for Supabase to process hash tokens
          await new Promise(resolve => setTimeout(resolve, 1500))
          const { data: { session: retrySession } } = await supabase.auth.getSession()
          if (retrySession) {
            router.replace('/')
          } else {
            setError(t('auth.loginFailed'))
          }
        }
      } catch (err: any) {
        setError(err.message ?? t('auth.loginFailed'))
      }
    }

    handleCallback()
  }, [params, supabase, router, t])

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
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>{t('common.loading')}</Text>
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
