import React from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface StageTagProps {
  children: React.ReactNode
  style?: StyleProp<TextStyle>
}

export function StageTag({ children, style }: StageTagProps) {
  const { colors } = useTheme()
  return (
    <Text style={[{
      fontSize: 11,
      fontFamily: fonts.bodySemi,
      fontWeight: '600',
      letterSpacing: 1.75,
      textTransform: 'uppercase',
      color: colors.mutedForeground,
      textAlign: 'center',
    }, style]}>
      {children}
    </Text>
  )
}
