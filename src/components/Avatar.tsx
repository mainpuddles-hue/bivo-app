import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'
import { getImageUrl } from '@/lib/imageUtils'

interface AvatarProps {
  url: string | null | undefined
  name: string | null | undefined
  size?: number
  borderColor?: string
  borderWidth?: number
}

export const Avatar = React.memo(function Avatar({ url, name, size = 36, borderColor, borderWidth }: AvatarProps) {
  const { colors } = useTheme()
  const initial = (name || '?').charAt(0).toUpperCase()
  const fontSize = size < 24 ? 8 : size < 36 ? 10 : size < 48 ? 13 : size < 64 ? 18 : 32
  const lineHeight = size < 24 ? 10 : size < 36 ? 14 : size < 48 ? 18 : size < 64 ? 24 : 42

  const sizeStyles = useMemo(() => ({
    container: { width: size, height: size, borderRadius: size / 2 },
    border: borderColor ? { borderWidth: borderWidth ?? 1, borderColor } : undefined,
    text: { fontSize, lineHeight },
  }), [size, borderColor, borderWidth, fontSize, lineHeight])

  if (url) {
    return (
      <Image
        source={{ uri: getImageUrl(url, 'thumbnail')! }}
        style={[sizeStyles.container, sizeStyles.border]}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    )
  }

  return (
    <View style={[styles.fallback, sizeStyles.container, { backgroundColor: colors.muted }, sizeStyles.border]}>
      <Text style={[styles.initial, sizeStyles.text, { color: colors.mutedForeground }]}>{initial}</Text>
    </View>
  )
})

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
})
