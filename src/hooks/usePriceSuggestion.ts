import { useState, useEffect } from 'react'

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

  useEffect(() => {
    if (!type || (type !== 'tarjoan' && type !== 'lainaa')) {
      setSuggestion(null)
      return
    }

    setLoading(true)
    fetch(`${FUNCTIONS_URL}/price-suggestion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, tags, neighborhood }),
    })
      .then(res => res.json())
      .then(data => {
        setSuggestion(data.suggestion ?? null)
      })
      .catch(() => setSuggestion(null))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, tags.join(','), neighborhood])

  return { suggestion, loading }
}
