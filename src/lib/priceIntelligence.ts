declare const __DEV__: boolean

import { createClient } from '@/lib/supabase/client'

export interface PriceInsight {
  median: number
  min: number
  max: number
  count: number
  neighborhood: string | null
}

/**
 * Get market price insights for similar items/services in the neighborhood.
 * Queries recent posts with similar tags or type.
 */
export async function getPriceInsight(
  type: 'lainaa' | 'tarjoan',
  tags: string[],
  neighborhood: string | null,
): Promise<PriceInsight | null> {
  try {
    const supabase = createClient()
    const priceField = type === 'lainaa' ? 'daily_fee' : 'service_price'

    const query = supabase
      .from('posts')
      .select(priceField)
      .eq('type', type)
      .eq('is_active', true)
      .not(priceField, 'is', null)
      .gt(priceField, 0)
      .gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString())

    const { data } = await query.limit(100)
    if (!data || data.length < 3) return null

    const prices = (data as any[])
      .map(d => d[priceField])
      .filter(Boolean)
      .sort((a: number, b: number) => a - b)
    if (prices.length < 3) return null

    return {
      median: prices[Math.floor(prices.length / 2)],
      min: prices[0],
      max: prices[prices.length - 1],
      count: prices.length,
      neighborhood,
    }
  } catch {
    return null
  }
}
