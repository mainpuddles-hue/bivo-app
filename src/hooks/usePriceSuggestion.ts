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

    supabase.auth.getSession().then(({ data: { session } }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      return fetch(`${FUNCTIONS_URL}/price-suggestion`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type, tags, neighborhood }),
      })
    })
      .then(res => res.json())
      .then(data => {
        setSuggestion(data.suggestion ?? null)
      })
      .catch(() => setSuggestion(null))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, tags.join(','), neighborhood, supabase])

  return { suggestion, loading }
}
