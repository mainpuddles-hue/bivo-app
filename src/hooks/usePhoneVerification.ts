import { useState, useCallback, useRef, useEffect } from 'react'
import { useSupabase } from '@/hooks/useSupabase'
import { useI18n } from '@/lib/i18n'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

type Step = 'input' | 'otp' | 'success'
type DeliveryMethod = 'sms' | 'email' | null

export function usePhoneVerification() {
  const supabase = useSupabase()
  const { t } = useI18n()

  const [step, setStep] = useState<Step>('input')
  const [phone, setPhone] = useState('+358 ')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [delivery, setDelivery] = useState<DeliveryMethod>(null)

  const mountedRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Resend cooldown timer
  useEffect(() => {
    if (countdown <= 0) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      return
    }
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current)
          timerRef.current = null
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [countdown > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const sendOtp = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError(t('common.loginRequired'))
        return false
      }

      const cleanPhone = phone.replace(/[\s\-()]/g, '')
      const res = await fetch(`${FUNCTIONS_URL}/send-phone-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ phone: cleanPhone }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const errorKey = body.error ?? 'unknown'
        const msg = t(`phoneVerification.error_${errorKey}`) !== `phoneVerification.error_${errorKey}`
          ? t(`phoneVerification.error_${errorKey}`)
          : t('phoneVerification.sendFailed')
        setError(msg)
        return false
      }

      const resBody = await res.json().catch(() => ({}))
      if (!mountedRef.current) return false
      setDelivery(resBody.delivery === 'email' ? 'email' : 'sms')
      setStep('otp')
      setCountdown(60)
      return true
    } catch {
      setError(t('phoneVerification.sendFailed'))
      return false
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [phone, supabase, t])

  const verifyOtp = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError(t('common.loginRequired'))
        return false
      }

      const cleanPhone = phone.replace(/[\s\-()]/g, '')
      const res = await fetch(`${FUNCTIONS_URL}/verify-phone-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ phone: cleanPhone, code: code.trim() }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const errorKey = body.error ?? 'unknown'
        const msg = t(`phoneVerification.error_${errorKey}`) !== `phoneVerification.error_${errorKey}`
          ? t(`phoneVerification.error_${errorKey}`)
          : t('phoneVerification.verifyFailed')
        setError(msg)
        return false
      }

      if (!mountedRef.current) return false
      setStep('success')
      return true
    } catch {
      setError(t('phoneVerification.verifyFailed'))
      return false
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [phone, code, supabase, t])

  const reset = useCallback(() => {
    setStep('input')
    setPhone('+358 ')
    setCode('')
    setError(null)
    setLoading(false)
    setCountdown(0)
    setDelivery(null)
  }, [])

  return {
    step, phone, setPhone, code, setCode,
    loading, error, countdown, delivery,
    sendOtp, verifyOtp, reset,
  }
}
