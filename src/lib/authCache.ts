import { createClient } from '@/lib/supabase/client'

let _cachedUserId: string | null = null
let _cacheTime = 0
let _inflight: Promise<string | null> | null = null
const CACHE_TTL = 15000 // 15 seconds (reduced from 60s to minimize stale ID risk)

export async function getCachedUserId(): Promise<string | null> {
  if (_cachedUserId && Date.now() - _cacheTime < CACHE_TTL) {
    return _cachedUserId
  }
  // Deduplicate concurrent calls: reuse the in-flight promise
  if (_inflight) return _inflight
  _inflight = (async () => {
    try {
      const supabase = createClient()
      // Try getSession first (fast, cached by GoTrue)
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        _cachedUserId = session.user.id
        _cacheTime = Date.now()
        return _cachedUserId
      }
      // getSession can return null even when logged in (stale in-memory state).
      // Fall back to getUser (network call) which is authoritative.
      const { data: { user } } = await supabase.auth.getUser()
      _cachedUserId = user?.id ?? null
      _cacheTime = Date.now()
      return _cachedUserId
    } catch {
      // Network error or auth failure — clear cache and return null
      _cachedUserId = null
      _cacheTime = 0
      return null
    } finally {
      _inflight = null
    }
  })()
  return _inflight
}

export function clearAuthCache() {
  _cachedUserId = null
  _cacheTime = 0
}
