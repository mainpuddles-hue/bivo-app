/**
 * Score content quality (0-100) based on completeness.
 * Used to encourage users to write better posts.
 */
export function scoreContentQuality(post: {
  title: string
  description?: string
  imageCount: number
  tags: string[]
  location?: string
  price?: number
}): { score: number; tips: string[] } {
  let score = 0
  const tips: string[] = []

  // Title (max 25)
  if (post.title.length >= 10) score += 15
  else if (post.title.length >= 5) { score += 8; tips.push('Pidempi otsikko saa enemman huomiota') }
  else tips.push('Lisaa kuvaavampi otsikko')

  if (post.title.length >= 20) score += 10

  // Description (max 25)
  if (post.description && post.description.length >= 50) score += 25
  else if (post.description && post.description.length >= 20) { score += 15; tips.push('Pidempi kuvaus auttaa loytamaan postauksesi') }
  else { score += 0; tips.push('Lisaa kuvaus — se parantaa nakyvyytta') }

  // Images (max 20)
  if (post.imageCount >= 2) score += 20
  else if (post.imageCount === 1) { score += 12; tips.push('Lisaa kuvia — postaukset kuvilla saavat 3x enemman huomiota') }
  else tips.push('Lisaa kuva — se parantaa nakyvyytta merkittavasti')

  // Tags (max 15)
  if (post.tags.length >= 2) score += 15
  else if (post.tags.length === 1) { score += 8; tips.push('Lisaa tageja auttaaksesi loydettavyydessa') }
  else tips.push('Lisaa vahintaan yksi tagi')

  // Location (max 10)
  if (post.location) score += 10
  else tips.push('Lisaa sijainti — lahella olevat loytavat sinut helpommin')

  // Price (max 5 — only for relevant types)
  if (post.price && post.price > 0) score += 5

  return { score: Math.min(100, score), tips: tips.slice(0, 3) }
}
