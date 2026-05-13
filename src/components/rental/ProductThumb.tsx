import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useTheme } from '@/hooks/useTheme'

interface ProductThumbProps {
  uri?: string | null
  size?: 'sm' | 'md' | 'lg'
}

const sizes = { sm: 64, md: 88, lg: 120 }

export function ProductThumb({ uri, size = 'md' }: ProductThumbProps) {
  const { colors } = useTheme()
  const px = sizes[size]
  const [failed, setFailed] = useState(false)
  const showFallback = !uri || failed

  if (showFallback) {
    return <View style={[styles.thumb, { width: px, height: px, backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.border }]} />
  }

  return (
    <Image
      source={{ uri }}
      onError={() => setFailed(true)}
      style={[styles.thumb, { width: px, height: px, backgroundColor: colors.cardElevated }]}
    />
  )
}

const styles = StyleSheet.create({
  thumb: { borderRadius: 14 },
})
