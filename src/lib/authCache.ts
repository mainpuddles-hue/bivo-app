import { createClient } from '@/lib/supabase/client'

let _cachedUserId: string | null = null
let _cacheTime = 0
const CACHE_TTL = 60000 // 1 minute

export async function getCachedUserId(): Promise<string | null> {
  if (_cachedUserId && Date.now() - _cacheTime < CACHE_TTL) {
    return _cachedUserId
  }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  _cachedUserId = user?.id ?? null
  _cacheTime = Date.now()
  return _cachedUserId
}

export function clearAuthCache() {
  _cachedUserId = null
  _cacheTime = 0
}
