declare const __DEV__: boolean

import { useState, useEffect } from 'react'
import { useSupabase } from './useSupabase'

export interface DemandItem {
  tag: string
  count: number
}

/**
 * Returns most in-demand categories based on "tarvitsen" posts.
 * Shows what people in the neighborhood need most.
 *
 * Falls back to a direct query on the posts table if the
 * materialized view mv_demand_insights does not exist yet.
 */
export function useDemandInsights() {
  const supabase = useSupabase()
  const [demands, setDemands] = useState<DemandItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function fetchDemands() {
      try {
        // Try materialized view first
        const { data, error } = await (supabase.from('mv_demand_insights') as any)
          .select('tag, demand_count')
          .order('demand_count', { ascending: false })
          .limit(5)

        if (!error && mounted && data) {
          setDemands((data as any[]).map(d => ({ tag: d.tag, count: d.demand_count })))
        } else if (mounted) {
          // Fallback: query posts directly for recent tarvitsen tags
          const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
          const { data: posts } = await supabase
            .from('posts')
            .select('tags')
            .eq('type', 'tarvitsen')
            .eq('is_active', true)
            .gte('created_at', thirtyDaysAgo)
            .limit(100)

          if (mounted && posts) {
            const tagCounts = new Map<string, number>()
            for (const post of posts as any[]) {
              const tags: string[] = post.tags ?? []
              for (const tag of tags) {
                tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
              }
            }
            const sorted = [...tagCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([tag, count]) => ({ tag, count }))
            setDemands(sorted)
          }
        }
      } catch {
        // Silently fail — demand insights are non-critical
      }
      if (mounted) setLoading(false)
    }
    fetchDemands()
    return () => { mounted = false }
  }, [supabase])

  return { demands, loading }
}
