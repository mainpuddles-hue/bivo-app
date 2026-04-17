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
}, t: (key: string) => string): { score: number; tips: string[] } {
  let score = 0
  const tips: string[] = []

  // Title (max 25)
  if (post.title.length >= 10) score += 15
  else if (post.title.length >= 5) { score += 8; tips.push(t('contentQuality.longerTitle')) }
  else tips.push(t('contentQuality.addTitle'))

  if (post.title.length >= 20) score += 10

  // Description (max 25)
  if (post.description && post.description.length >= 50) score += 25
  else if (post.description && post.description.length >= 20) { score += 15; tips.push(t('contentQuality.longerDescription')) }
  else { score += 0; tips.push(t('contentQuality.addDescription')) }

  // Images (max 20)
  if (post.imageCount >= 2) score += 20
  else if (post.imageCount === 1) { score += 12; tips.push(t('contentQuality.addMoreImages')) }
  else tips.push(t('contentQuality.addImage'))

  // Tags (max 15)
  if (post.tags.length >= 2) score += 15
  else if (post.tags.length === 1) { score += 8; tips.push(t('contentQuality.addMoreTags')) }
  else tips.push(t('contentQuality.addTag'))

  // Location (max 10)
  if (post.location) score += 10
  else tips.push(t('contentQuality.addLocation'))

  // Price (max 5 — only for relevant types)
  if (post.price && post.price > 0) score += 5

  return { score: Math.min(100, score), tips: tips.slice(0, 3) }
}
