import { useCallback, useRef } from 'react'
import { useSupabase } from './useSupabase'

type InteractionType = 'view' | 'click' | 'like' | 'save' | 'message' | 'skip' | 'hide'

const MAX_TRACKED_ITEMS = 500 // Cap to prevent memory leak in long sessions

export function useInteractionTracker(userId: string | null) {
  const supabase = useSupabase()
  const tracked = useRef(new Set<string>()) // Prevent duplicate views in same session

  const trackInteraction = useCallback(async (postId: string, type: InteractionType) => {
    if (!userId) return

    // Deduplicate views within session
    const key = `${postId}:${type}`
    if (type === 'view' && tracked.current.has(key)) return
    // Evict oldest entries when set grows too large to prevent memory leaks
    if (tracked.current.size >= MAX_TRACKED_ITEMS) {
      const iter = tracked.current.values()
      // Remove the first ~100 entries (oldest)
      for (let i = 0; i < 100; i++) {
        const val = iter.next()
        if (val.done) break
        tracked.current.delete(val.value)
      }
    }
    tracked.current.add(key)

    try {
      await (supabase.from('user_interactions') as any)
        .insert({ user_id: userId, post_id: postId, interaction_type: type })
    } catch {} // Intentional: non-critical analytics — don't fail the main flow
  }, [userId, supabase])

  return { trackInteraction }
}
