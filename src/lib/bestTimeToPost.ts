declare const __DEV__: boolean

import { createClient } from '@/lib/supabase/client'

interface BestTimeResult {
  bestHour: number // 0-23
  bestDay: string // 'monday', 'tuesday', etc.
  avgEngagement: number
}

/**
 * Analyze when posts in the user's neighborhood get the most engagement.
 * Returns the best hour and day to post.
 */
export async function getBestTimeToPost(neighborhood: string | null): Promise<BestTimeResult | null> {
  try {
    const supabase = createClient()
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString()

    const { data } = await supabase
      .from('posts')
      .select('created_at, like_count, comment_count')
      .eq('is_active', true)
      .gte('created_at', monthAgo)
      .gt('like_count', 0)
      .order('like_count', { ascending: false })
      .limit(100)

    if (!data || data.length < 10) return null

    // Analyze by hour
    const hourEngagement = new Map<number, { total: number; count: number }>()
    const dayEngagement = new Map<number, { total: number; count: number }>()

    for (const post of data as any[]) {
      const d = new Date(post.created_at)
      const hour = d.getHours()
      const day = d.getDay()
      const engagement = (post.like_count ?? 0) + (post.comment_count ?? 0)

      const h = hourEngagement.get(hour) ?? { total: 0, count: 0 }
      h.total += engagement; h.count++
      hourEngagement.set(hour, h)

      const dg = dayEngagement.get(day) ?? { total: 0, count: 0 }
      dg.total += engagement; dg.count++
      dayEngagement.set(day, dg)
    }

    // Find best hour
    let bestHour = 12
    let bestHourAvg = 0
    for (const [hour, { total, count }] of hourEngagement) {
      const avg = total / count
      if (avg > bestHourAvg) { bestHour = hour; bestHourAvg = avg }
    }

    // Find best day
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    let bestDay = 'monday'
    let bestDayAvg = 0
    for (const [day, { total, count }] of dayEngagement) {
      const avg = total / count
      if (avg > bestDayAvg) { bestDay = dayNames[day]; bestDayAvg = avg }
    }

    return { bestHour, bestDay, avgEngagement: bestHourAvg }
  } catch {
    return null
  }
}
