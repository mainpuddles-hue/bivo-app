import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Image, type ImageProps } from 'expo-image'
import { ImageOff } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { getImageUrl, type ImageSize } from '@/lib/imageUtils'

interface ImageWithFallbackProps extends Omit<ImageProps, 'source'> {
  uri: string | null | undefined
  fallbackIcon?: React.ReactNode
  /** Image optimization size preset. Defaults to 'medium'. */
  imageSize?: ImageSize
}

/**
 * Image with automatic error fallback.
 *
 * UI/UX Pro Max rules applied:
 * - Placeholder: muted background color (no layout shift)
 * - Loading: expo-image transition (200ms crossfade)
 * - Error: centered icon on muted background
 * - Consistent across all screens
 *
 * Usage:
 *   <ImageWithFallback uri={post.image_url} style={styles.image} contentFit="cover" />
 */
export function ImageWithFallback({ uri, fallbackIcon, style, imageSize = 'medium', ...props }: ImageWithFallbackProps) {
  const { colors } = useTheme()
  const [error, setError] = useState(false)

  const optimizedUri = getImageUrl(uri, imageSize)

  if (!optimizedUri || error) {
    return (
      <View style={[styles.fallback, { backgroundColor: colors.muted }, style]}>
        {fallbackIcon ?? <ImageOff size={24} color={colors.mutedForeground} strokeWidth={1.5} />}
      </View>
    )
  }

  return (
    <Image
      source={{ uri: optimizedUri }}
      style={style}
      onError={() => setError(true)}
      transition={200}
      cachePolicy="memory-disk"
      {...props}
    />
  )
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
