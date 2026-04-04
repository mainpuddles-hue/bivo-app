import { useState, useEffect } from 'react'
import { useSupabase } from '@/hooks/useSupabase'

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`

interface PriceSuggestion {
  min: number
  max: number
  median: number
  count: number
}

export function usePriceSuggestion(type: string | null, tags: string[], neighborhood: string | null) {
  const [suggestion, setSuggestion] = useState<PriceSuggestion | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = useSupabase()

  useEffect(() => {
    if (!type || (type !== 'tarjoan' && type !== 'lainaa')) {
      setSuggestion(null)
      return
    }

    setLoading(true)
    const controller = new AbortController()

    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      return fetch(`${FUNCTIONS_URL}/price-suggestion`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type, tags, neighborhood }),
        signal: controller.signal,
      })
    })
      .then(res => res.json())
      .then(data => {
        if (!controller.signal.aborted) setSuggestion(data.suggestion ?? null)
      })
      .catch(() => { if (!controller.signal.aborted) setSuggestion(null) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })

    return () => { controller.abort() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, JSON.stringify(tags), neighborhood, supabase])

  return { suggestion, loading }
}
