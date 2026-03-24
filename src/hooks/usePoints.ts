import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type PointAction = 'post_created' | 'reply_created' | 'thanks_given' | 'thanks_received' | 'event_attended' | 'review_written' | 'first_post_bonus'

const POINT_VALUES: Record<PointAction, number> = {
  post_created: 5,
  reply_created: 3,
  thanks_given: 2,
  thanks_received: 10,
  event_attended: 5,
  review_written: 10,
  first_post_bonus: 20,
}

export function usePoints() {
  const awardPoints = useCallback(async (userId: string, action: PointAction, referenceId?: string) => {
    const supabase = createClient()
    const points = POINT_VALUES[action]

    // Insert point record
    await (supabase.from('user_points') as any).insert({
      user_id: userId,
      action,
      points,
      reference_id: referenceId ?? null,
    }).catch(() => {})

    // Update total on profile
    await (supabase.from('profiles') as any)
      .rpc('increment_points', { user_id_param: userId, points_param: points })
      .catch(async () => {
        // Fallback: direct update if RPC doesn't exist
        try {
          const { data } = await supabase.from('profiles').select('total_points').eq('id', userId).single()
          const current = (data as any)?.total_points ?? 0
          await (supabase.from('profiles') as any).update({ total_points: current + points }).eq('id', userId)
        } catch {
          // Silently fail — points just won't update
        }
      })
  }, [])

  return { awardPoints, POINT_VALUES }
}
