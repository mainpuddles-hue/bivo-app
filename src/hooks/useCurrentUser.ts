import { useState, useEffect } from 'react'
import { useSupabase } from './useSupabase'

export function useCurrentUser() {
  const supabase = useSupabase()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [supabase])

  return { userId, loading }
}
