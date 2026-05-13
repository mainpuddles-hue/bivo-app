import React from 'react'
import { TouchableOpacity, Text, StyleSheet, type ViewStyle } from 'react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface BigBtnProps {
  children: React.ReactNode
  onPress?: () => void
  secondary?: boolean
  disabled?: boolean
  style?: ViewStyle
}

export function BigBtn({ children, onPress, secondary, disabled, style }: BigBtnProps) {
  const { colors } = useTheme()
  const bg = disabled
    ? colors.tertiaryForeground
    : secondary
      ? colors.card
      : colors.foreground
  const fg = secondary ? colors.foreground : colors.primaryForeground

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[styles.btn, { backgroundColor: bg }, secondary && { borderWidth: 1, borderColor: colors.border }, style]}
    >
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>{children}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  btn: {
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  text: { fontSize: 15, fontFamily: fonts.bodySemi, fontWeight: '600' },
})
