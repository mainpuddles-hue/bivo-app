import React from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '@/hooks/useTheme'

interface SheetProps {
  children: React.ReactNode
  padding?: number
  style?: StyleProp<ViewStyle>
}

export function Sheet({ children, padding = 20, style }: SheetProps) {
  const { colors } = useTheme()
  return (
    <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding }, style]}>
      {children}
    </View>
  )
}
