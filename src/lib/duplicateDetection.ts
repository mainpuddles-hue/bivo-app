declare const __DEV__: boolean

import { createClient } from '@/lib/supabase/client'

interface DuplicateResult {
  isDuplicate: boolean
  similarPosts: { id: string; title: string; similarity: number }[]
}

/**
 * Check if a post title is similar to existing active posts.
 * Uses pg_trgm similarity for fast fuzzy matching.
 */
export async function checkForDuplicates(
  title: string,
  type: string,
  userId: string,
): Promise<DuplicateResult> {
  if (!title || title.length < 5) return { isDuplicate: false, similarPosts: [] }

  try {
    const supabase = createClient()

    // Use RPC to call similarity function
    const { data } = await (supabase.rpc as any)('find_similar_posts', {
      p_title: title,
      p_type: type,
      p_user_id: userId,
      p_threshold: 0.3,
      p_limit: 3,
    })

    if (!data || data.length === 0) return { isDuplicate: false, similarPosts: [] }

    return {
      isDuplicate: data.some((d: any) => d.sim > 0.6),
      similarPosts: (data as any[]).map(d => ({
        id: d.id,
        title: d.title,
        similarity: d.sim,
      })),
    }
  } catch {
    return { isDuplicate: false, similarPosts: [] }
  }
}
