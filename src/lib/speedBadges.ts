import { createClient } from '@/lib/supabase/client'
import { SPEED_BADGE_THRESHOLDS } from '@/lib/constants'

/**
 * Check if a user responding to an urgent post qualifies for a speed badge.
 * Called after user sends a message or comment on an is_urgent post.
 *
 * @param responderId - the user who responded
 * @param postCreatedAt - when the urgent post was created
 * @param postCreatorId - who created the post (don't badge yourself)
 */
export async function checkAndAwardSpeedBadge(
  responderId: string,
  postCreatedAt: string,
  postCreatorId: string,
): Promise<'salamanopea' | 'nopea' | null> {
  if (responderId === postCreatorId) return null // can't badge yourself

  const responseMinutes = (Date.now() - new Date(postCreatedAt).getTime()) / 60000

  let badgeType: 'salamanopea' | 'nopea' | null = null
  if (responseMinutes <= SPEED_BADGE_THRESHOLDS.salamanopea) {
    badgeType = 'salamanopea'
  } else if (responseMinutes <= SPEED_BADGE_THRESHOLDS.nopea) {
    badgeType = 'nopea'
  }

  if (!badgeType) return null

  const supabase = createClient()

  // Check if user already has this badge (don't duplicate)
  const { data: existing } = await supabase
    .from('user_badges')
    .select('badge_type')
    .eq('user_id', responderId)
    .eq('badge_type', badgeType)
    .maybeSingle()

  if (existing) return badgeType // Already has it

  // Award badge
  await (supabase.from('user_badges') as any)
    .insert({ user_id: responderId, badge_type: badgeType })
    .catch(() => {}) // Graceful if fails

  // Send notification
  await (supabase.from('notifications') as any)
    .insert({
      user_id: responderId,
      type: 'badge_earned',
      title: badgeType === 'salamanopea' ? 'Salamanopea!' : 'Nopea vastaaja!',
      body: badgeType === 'salamanopea'
        ? 'Vastasit alle 15 minuutissa — uusi saavutus!'
        : 'Vastasit alle tunnissa — uusi saavutus!',
    })
    .catch(() => {})

  return badgeType
}
