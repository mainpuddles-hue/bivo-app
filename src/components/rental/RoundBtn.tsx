import React from 'react'
import { TouchableOpacity, type ViewStyle } from 'react-native'
import { useTheme } from '@/hooks/useTheme'

interface RoundBtnProps {
  children: React.ReactNode
  size?: number
  onPress?: () => void
  style?: ViewStyle
  accessibilityLabel?: string
  disabled?: boolean
}

export function RoundBtn({ children, size = 38, onPress, style, accessibilityLabel, disabled }: RoundBtnProps) {
  const { colors } = useTheme()
  const hitTarget = Math.max(0, 44 - size) / 2
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={onPress ? 0.7 : 1}
      hitSlop={{ top: hitTarget, bottom: hitTarget, left: hitTarget, right: hitTarget }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || !onPress }}
      style={[{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: colors.muted,
        alignItems: 'center',
        justifyContent: 'center',
      }, style]}
    >
      {children}
    </TouchableOpacity>
  )
}
