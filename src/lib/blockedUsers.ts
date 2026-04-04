import { createClient } from '@/lib/supabase/client'

let _cachedBlockedIds: Set<string> | null = null
let _cacheTime = 0
const CACHE_TTL = 60000 // 1 minute

/**
 * Fetch the set of user IDs that the current user has blocked.
 * Cached for 1 minute to avoid repeated queries.
 *
 * Usage:
 *   const blocked = await getBlockedUserIds(userId)
 *   const filtered = posts.filter(p => !blocked.has(p.user_id))
 */
export async function getBlockedUserIds(userId: string): Promise<Set<string>> {
  if (_cachedBlockedIds && Date.now() - _cacheTime < CACHE_TTL) {
    return _cachedBlockedIds
  }

  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', userId)

    const ids = new Set((data ?? []).map((b: any) => b.blocked_id))
    _cachedBlockedIds = ids
    _cacheTime = Date.now()
    return ids
  } catch {
    // Table may not exist — return empty set
    return _cachedBlockedIds ?? new Set()
  }
}

/** Clear cache (call on block/unblock) */
export function clearBlockedCache() {
  _cachedBlockedIds = null
  _cacheTime = 0
}
