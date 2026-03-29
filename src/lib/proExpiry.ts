import type { SupabaseClient } from '@supabase/supabase-js'

const GRACE_DAYS = 3

/**
 * Defense-in-depth: if a user's Pro subscription has expired past the
 * grace period and they have no active Stripe subscription, clear Pro
 * status both locally (mutating the profile object) and in the database.
 *
 * Returns the (possibly mutated) profile data.
 */
export async function clearExpiredPro(
  supabase: SupabaseClient,
  userId: string,
  data: Record<string, any>,
): Promise<void> {
  if (
    data.is_pro &&
    data.pro_expires_at &&
    new Date(data.pro_expires_at).getTime() + GRACE_DAYS * 86400000 < Date.now() &&
    !data.stripe_subscription_id
  ) {
    await (supabase.from('profiles') as any)
      .update({ is_pro: false, pro_expires_at: null })
      .eq('id', userId)
    data.is_pro = false
    data.pro_expires_at = null
  }
}
