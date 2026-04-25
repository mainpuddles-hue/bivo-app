declare const __DEV__: boolean

import { useState, useCallback, useEffect } from 'react'
import { useSupabase } from '@/hooks/useSupabase'

type VerificationStatus = 'idle' | 'pending' | 'verifying' | 'success' | 'error'

interface UseIdentityVerificationResult {
  status: VerificationStatus
  isVerified: boolean
  /** Opens the in-app verification modal (set showModal to true) */
  startVerification: () => void
  /** Actually performs the verification (called from modal confirm) */
  confirmVerification: () => Promise<void>
  showModal: boolean
  setShowModal: (v: boolean) => void
  loading: boolean
  error: string | null
}

/**
 * Suomi.fi identity verification hook.
 *
 * Currently: in-app verification flow that writes verified badge directly.
 * Production: will integrate with Suomi.fi OIDC via web backend callback.
 *
 * The hook exposes a modal-based flow:
 * 1. startVerification() → opens modal
 * 2. User reads info + confirms → confirmVerification()
 * 3. Badge inserted into user_badges + identity_verified_at set
 * 4. Trust level recalculates → Tier 2 unlocked
 */
export function useIdentityVerification(userId: string | null): UseIdentityVerificationResult {
  const [status, setStatus] = useState<VerificationStatus>('idle')
  const [isVerified, setIsVerified] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = useSupabase()

  // Check existing verification on mount
  useEffect(() => {
    if (!userId) return
    let mounted = true
    Promise.resolve(
      supabase
        .from('user_badges')
        .select('badge_type')
        .eq('user_id', userId)
        .eq('badge_type', 'verified')
        .maybeSingle()
    ).then(({ data }) => {
        if (data && mounted) {
          setIsVerified(true)
          setStatus('success')
        }
      })
      .catch((e: unknown) => { if (__DEV__) console.warn('[verification] badge check failed:', e) })
    return () => { mounted = false }
  }, [userId, supabase])

  const startVerification = useCallback(() => {
    if (!userId) {
      setError('auth_required')
      return
    }
    if (isVerified) {
      setError('already_verified')
      return
    }
    setError(null)
    setShowModal(true)
  }, [userId, isVerified])

  const confirmVerification = useCallback(async () => {
    if (!userId || isVerified) return

    setLoading(true)
    setError(null)
    setStatus('verifying')

    try {
      // Check not already verified (race condition guard)
      const { data: existing } = await supabase
        .from('user_badges')
        .select('badge_type')
        .eq('user_id', userId)
        .eq('badge_type', 'verified')
        .maybeSingle()

      if (existing) {
        setIsVerified(true)
        setStatus('success')
        setShowModal(false)
        setLoading(false)
        return
      }

      // Call server-side Edge Function to perform verification.
      // Direct client-side badge insertion is blocked — only the server can
      // grant 'verified' badges after identity validation (Suomi.fi OIDC).
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession?.access_token) {
        setError('auth_required')
        setStatus('error')
        return
      }
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      const res = await fetch(`${supabaseUrl}/functions/v1/verify-identity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({ user_id: userId }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        if (__DEV__) console.log('[verification] Edge Function error:', errBody)
        setError(errBody?.error === 'not_available' ? 'not_available' : 'verification_failed')
        setStatus('error')
        return
      }

      setIsVerified(true)
      setStatus('success')
      setShowModal(false)
    } catch (err) {
      if (__DEV__) console.warn('[verification] verification failed:', err)
      setError('verification_failed')
      setStatus('error')
    } finally {
      setLoading(false)
    }
  }, [userId, isVerified, supabase])

  return { status, isVerified, startVerification, confirmVerification, showModal, setShowModal, loading, error }
}
