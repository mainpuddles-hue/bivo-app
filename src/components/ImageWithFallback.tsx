import { useState, useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import { Image, type ImageProps } from 'expo-image'
import { ImageOff } from 'lucide-react-native'
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation, withSequence, Easing } from 'react-native-reanimated'
import { useTheme } from '@/hooks/useTheme'
import { getImageUrl, type ImageSize } from '@/lib/imageUtils'

interface ImageWithFallbackProps extends Omit<ImageProps, 'source'> {
  uri: string | null | undefined
  fallbackIcon?: React.ReactNode
  /** Image optimization size preset. Defaults to 'medium'. */
  imageSize?: ImageSize
}

/**
 * Image with shimmer placeholder and automatic error fallback.
 *
 * - Shimmer: pulsing opacity animation while loading
 * - Loading: expo-image transition (200ms crossfade)
 * - Error: centered icon on muted background
 *
 * Usage:
 *   <ImageWithFallback uri={post.image_url} style={styles.image} contentFit="cover" />
 */
export function ImageWithFallback({ uri, fallbackIcon, style, imageSize = 'medium', ...props }: ImageWithFallbackProps) {
  const { colors } = useTheme()
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const shimmerOpacity = useSharedValue(0.4)

  const optimizedUri = getImageUrl(uri, imageSize)

  useEffect(() => {
    if (!optimizedUri || loaded || error) return
    shimmerOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    )
    return () => { cancelAnimation(shimmerOpacity) }
  }, [optimizedUri, loaded, error, shimmerOpacity])

  const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmerOpacity.value }))

  if (!optimizedUri || error) {
    return (
      <View style={[styles.fallback, { backgroundColor: colors.muted }, style]}>
        {fallbackIcon ?? <ImageOff size={24} color={colors.mutedForeground} strokeWidth={1.6} />}
      </View>
    )
  }

  return (
    <View style={style}>
      {!loaded && (
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.muted }, shimmerStyle]}
        />
      )}
      <Image
        source={{ uri: optimizedUri }}
        style={StyleSheet.absoluteFill}
        onError={() => setError(true)}
        onLoad={() => setLoaded(true)}
        transition={200}
        cachePolicy="memory-disk"
        {...props}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
