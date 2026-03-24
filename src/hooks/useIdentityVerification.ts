import { useState, useCallback, useEffect } from 'react'
import { Platform, Linking, Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@/lib/supabase/client'

const WEB_BACKEND = 'https://tackbird-v2.vercel.app'
const STORAGE_KEY = 'tackbird-suomifi-state'

type VerificationStatus = 'idle' | 'pending' | 'success' | 'error'

interface UseIdentityVerificationResult {
  status: VerificationStatus
  isVerified: boolean
  startVerification: () => Promise<void>
  loading: boolean
  error: string | null
}

/**
 * Suomi.fi e-Identification hook.
 *
 * Flow:
 * 1. App generates state token, stores it in AsyncStorage
 * 2. Opens web backend /api/auth/suomifi-start?state=xxx&user_id=xxx in browser
 * 3. Backend redirects to Suomi.fi OIDC → user authenticates with bank/cert
 * 4. Suomi.fi redirects back to backend callback
 * 5. Backend validates token, inserts 'verified' badge, stores identity_verified_at
 * 6. Backend redirects to tackbird://verification/success or /error
 * 7. App deep link handler picks up result → refreshes trust level
 */
export function useIdentityVerification(userId: string | null): UseIdentityVerificationResult {
  const [status, setStatus] = useState<VerificationStatus>('idle')
  const [isVerified, setIsVerified] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check existing verification on mount
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    supabase
      .from('user_badges')
      .select('badge_type')
      .eq('user_id', userId)
      .eq('badge_type', 'verified')
      .maybeSingle()
      .then(({ data }) => {
        if (data) setIsVerified(true)
      })
  }, [userId])

  // Listen for deep link return from Suomi.fi flow
  useEffect(() => {
    function handleDeepLink(event: { url: string }) {
      const url = event.url
      if (url.includes('verification/success')) {
        setStatus('success')
        setIsVerified(true)
        setLoading(false)
        // Clean up state token
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => {})
      } else if (url.includes('verification/error')) {
        setStatus('error')
        setError('Tunnistautuminen epäonnistui')
        setLoading(false)
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => {})
      }
    }

    const subscription = Linking.addEventListener('url', handleDeepLink)

    // Check if app was opened via deep link while closed
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url })
    })

    return () => subscription.remove()
  }, [])

  const startVerification = useCallback(async () => {
    if (!userId) {
      setError('Kirjaudu sisään ensin')
      return
    }
    if (isVerified) {
      Alert.alert('', 'Henkilöllisyytesi on jo vahvistettu')
      return
    }

    setLoading(true)
    setError(null)
    setStatus('pending')

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Kirjaudu sisään ensin')
        setLoading(false)
        return
      }

      // Generate random state token for CSRF protection
      const state = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      await AsyncStorage.setItem(STORAGE_KEY, state)

      // Build the URL that starts Suomi.fi flow on our backend
      const params = new URLSearchParams({
        state,
        user_id: userId,
        token: session.access_token,
        redirect_scheme: Platform.OS === 'web' ? 'web' : 'tackbird',
      })

      const verifyUrl = `${WEB_BACKEND}/api/auth/suomifi-start?${params.toString()}`

      // Open in system browser
      if (Platform.OS === 'web') {
        window.location.href = verifyUrl
      } else {
        const canOpen = await Linking.canOpenURL(verifyUrl)
        if (canOpen) {
          await Linking.openURL(verifyUrl)
        } else {
          setError('Selainta ei voida avata')
          setLoading(false)
        }
      }
    } catch {
      setError('Vahvistuksen aloitus epäonnistui')
      setLoading(false)
      setStatus('error')
    }
  }, [userId, isVerified])

  return { status, isVerified, startVerification, loading, error }
}
