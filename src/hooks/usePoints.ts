declare const __DEV__: boolean

import { useCallback } from 'react'
import { useSupabase } from '@/hooks/useSupabase'

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
  const supabase = useSupabase()
  const awardPoints = useCallback(async (userId: string, action: PointAction, referenceId?: string) => {
    const points = POINT_VALUES[action]

    // Deduplicate: check if this exact action+reference was already awarded
    if (referenceId) {
      try {
        const { count } = await (supabase.from('user_points') as any)
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('action', action)
          .eq('reference_id', referenceId)
        if ((count ?? 0) > 0) return // Already awarded
      } catch {
        // Intentional: user_points table might not exist — continue
      }
    }

    // Insert point record
    await (supabase.from('user_points') as any).insert({
      user_id: userId,
      action,
      points,
      reference_id: referenceId ?? null,
    }).catch((err: unknown) => { if (__DEV__) console.warn('usePoints insert failed:', err) })

    // Update total on profile via RPC (atomic increment — safe from race conditions)
    // The RPC should be: UPDATE profiles SET total_points = COALESCE(total_points, 0) + points WHERE id = user_id
    try {
      const { error: rpcError } = await (supabase.rpc as any)('increment_points', {
        user_id_param: userId,
        points_param: points,
      })
      if (rpcError) {
        if (__DEV__) console.error(`usePoints: increment_points RPC failed for user=${userId} action=${action} points=${points}:`, rpcError)
      }
    } catch (err) {
      if (__DEV__) console.error(`usePoints: increment_points RPC threw for user=${userId} action=${action} points=${points}:`, err)
    }
  }, [supabase])

  return { awardPoints, POINT_VALUES }
}
