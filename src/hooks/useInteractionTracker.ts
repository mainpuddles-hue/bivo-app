import { useCallback, useRef } from 'react'
import { useSupabase } from './useSupabase'

type InteractionType = 'view' | 'click' | 'like' | 'save' | 'message' | 'skip' | 'hide'

export function useInteractionTracker(userId: string | null) {
  const supabase = useSupabase()
  const tracked = useRef(new Set<string>()) // Prevent duplicate views in same session

  const trackInteraction = useCallback(async (postId: string, type: InteractionType) => {
    if (!userId) return

    // Deduplicate views within session
    const key = `${postId}:${type}`
    if (type === 'view' && tracked.current.has(key)) return
    tracked.current.add(key)

    await (supabase.from('user_interactions') as any)
      .insert({ user_id: userId, post_id: postId, interaction_type: type })
      .catch(() => {}) // Non-blocking, don't fail the main flow
  }, [userId, supabase])

  return { trackInteraction }
}
