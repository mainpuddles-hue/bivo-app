import React from 'react'
import { Text, type TextStyle } from 'react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface EyebrowProps {
  children: React.ReactNode
  style?: TextStyle
}

export function Eyebrow({ children, style }: EyebrowProps) {
  const { colors } = useTheme()
  return (
    <Text accessibilityRole="header" style={[{
      fontSize: 11,
      fontFamily: fonts.bodySemi,
      fontWeight: '600',
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      color: colors.tertiaryForeground,
      marginBottom: 14,
    }, style]}>
      {children}
    </Text>
  )
}
