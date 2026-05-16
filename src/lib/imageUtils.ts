/**
 * Image optimization utilities for Bivo Mobile.
 *
 * Uses Supabase Storage image transformations to serve resized/compressed
 * images instead of full-resolution originals (5-10 MB).
 *
 * The transform URL pattern replaces `/object/public/` with
 * `/render/image/public/` and appends width, quality, and resize params.
 * If transformations are not available on the Supabase plan, the original
 * URL is returned transparently — no client crash.
 */

export type ImageSize = 'thumbnail' | 'medium' | 'full'

const SIZE_CONFIG: Record<ImageSize, { width: number; quality: number }> = {
  thumbnail: { width: 200, quality: 60 },
  medium: { width: 800, quality: 80 },
  full: { width: 1920, quality: 90 },
}

/**
 * Generate an optimized image URL using Supabase Storage transformations.
 * Falls back to the original URL when:
 *  - The URL is null/undefined
 *  - The URL is not a Supabase Storage URL
 *
 * Usage:
 *   <Image source={{ uri: getImageUrl(post.image_url, 'thumbnail') }} />
 */
export function getImageUrl(
  originalUrl: string | null | undefined,
  size: ImageSize = 'medium',
): string | null {
  if (!originalUrl) return null

  // Only transform Supabase Storage URLs (skip AI-generated images — already optimized)
  if (!originalUrl.includes('supabase.co/storage')) return originalUrl
  if (originalUrl.includes('/generated/')) return originalUrl

  const config = SIZE_CONFIG[size]

  // Supabase Storage transform URL pattern:
  //   original:  /storage/v1/object/public/<bucket>/<path>
  //   transform: /storage/v1/render/image/public/<bucket>/<path>?width=N&quality=N&resize=contain
  const renderUrl = originalUrl.replace(
    '/object/public/',
    '/render/image/public/',
  )

  return `${renderUrl}?width=${config.width}&quality=${config.quality}&resize=contain`
}

