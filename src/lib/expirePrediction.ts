/**
 * Suggest expiration days based on post type and category.
 * Based on typical lifecycle of different post types.
 */
export function suggestExpirationDays(type: string, tags: string[]): number {
  // Base by type
  const baseByType: Record<string, number> = {
    tarvitsen: 14,   // Needs usually resolved within 2 weeks
    tarjoan: 30,     // Services available longer
    ilmaista: 3,     // Free items go fast
    nappaa: 1,       // Grab-now items are immediate
    lainaa: 14,      // Lending items moderate
    tapahtuma: 7,    // Events are time-bound
  }

  let days = baseByType[type] ?? 14

  // Adjust by tags
  const urgentTags = ['ruoka', 'ateria'] // Food expires fast
  const longTags = ['korjaus', 'opetus', 'valmennus'] // Services last longer

  if (tags.some(t => urgentTags.includes(t))) days = Math.min(days, 3)
  if (tags.some(t => longTags.includes(t))) days = Math.max(days, 30)

  return days
}
