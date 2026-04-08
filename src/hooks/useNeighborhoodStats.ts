declare const __DEV__: boolean

import { useState, useEffect } from 'react'
import { useSupabase } from './useSupabase'

interface NeighborhoodStats {
  postsThisWeek: number
  eventsThisWeek: number
  activeUsers: number
  loading: boolean
}

/**
 * Returns activity statistics for a neighborhood.
 * Used in feed header to show neighborhood vitality.
 */
export function useNeighborhoodStats(neighborhood: string | null): NeighborhoodStats {
  const supabase = useSupabase()
  const [stats, setStats] = useState<NeighborhoodStats>({
    postsThisWeek: 0, eventsThisWeek: 0, activeUsers: 0, loading: true,
  })

  useEffect(() => {
    if (!neighborhood) { setStats(prev => ({ ...prev, loading: false })); return }
    let mounted = true

    const currentNeighborhood = neighborhood
    async function fetchStats() {
      try {
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

        const [postsRes, eventsRes, usersRes] = await Promise.all([
          supabase.from('posts').select('id', { count: 'exact', head: true })
            .eq('is_active', true).gte('created_at', weekAgo),
          supabase.from('community_events').select('id', { count: 'exact', head: true })
            .eq('is_active', true).gte('created_at', weekAgo),
          supabase.from('profiles').select('id', { count: 'exact', head: true })
            .eq('naapurusto', currentNeighborhood!)
            .gte('last_active_date', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]),
        ])

        if (mounted) {
          setStats({
            postsThisWeek: postsRes.count ?? 0,
            eventsThisWeek: eventsRes.count ?? 0,
            activeUsers: usersRes.count ?? 0,
            loading: false,
          })
        }
      } catch {
        if (mounted) setStats(prev => ({ ...prev, loading: false }))
      }
    }

    fetchStats()
    return () => { mounted = false }
  }, [neighborhood, supabase])

  return stats
}
