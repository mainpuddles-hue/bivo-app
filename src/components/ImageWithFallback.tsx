import { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Image, type ImageProps } from 'expo-image'
import { ImageOff } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'

interface ImageWithFallbackProps extends Omit<ImageProps, 'source'> {
  uri: string | null | undefined
  fallbackIcon?: React.ReactNode
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
export function ImageWithFallback({ uri, fallbackIcon, style, ...props }: ImageWithFallbackProps) {
  const { colors } = useTheme()
  const [error, setError] = useState(false)

  if (!uri || error) {
    return (
      <View style={[styles.fallback, { backgroundColor: colors.muted }, style]}>
        {fallbackIcon ?? <ImageOff size={24} color={colors.mutedForeground} strokeWidth={1.5} />}
      </View>
    )
  }

  return (
    <Image
      source={{ uri }}
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
