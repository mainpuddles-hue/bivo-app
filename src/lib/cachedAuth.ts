/**
 * PERF: Cached auth user ID to avoid redundant supabase.auth.getUser() calls.
 *
 * On startup, the app made 5+ parallel getUser() calls from different components.
 * Each is a network request. This module caches the result in memory so only
 * the first call hits the network.
 */

let _cachedUserId: string | null = null
let _cachedUserIdPromise: Promise<string | null> | null = null

export function getCachedUserId(
  supabase: { auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } }
): Promise<string | null> {
  if (_cachedUserId) return Promise.resolve(_cachedUserId)
  if (_cachedUserIdPromise) return _cachedUserIdPromise

  _cachedUserIdPromise = supabase.auth.getUser().then(({ data: { user } }) => {
    _cachedUserId = user?.id ?? null
    _cachedUserIdPromise = null
    return _cachedUserId
  }).catch(() => {
    _cachedUserIdPromise = null
    return null
  })

  return _cachedUserIdPromise
}

/** Clear cached user ID (call on logout) */
export function clearCachedUserId(): void {
  _cachedUserId = null
  _cachedUserIdPromise = null
}
