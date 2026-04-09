import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Checks whether a user is banned and signs them out if so.
 *
 * Returns `true` if the user is banned (and has been signed out).
 * Returns `false` if the user is allowed to proceed.
 *
 * Callers should bail out early when this returns `true`:
 *
 *   if (await isBannedAndSignedOut(supabase, user.id)) return
 */
export async function isBannedAndSignedOut(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('is_banned')
      .eq('id', userId)
      .maybeSingle()
    if ((data as any)?.is_banned) {
      await supabase.auth.signOut()
      return true
    }
  } catch {
    // Non-critical — if the check itself fails, let the user proceed.
    // The server will still enforce RLS on subsequent requests.
  }
  return false
}
