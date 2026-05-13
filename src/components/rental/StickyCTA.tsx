import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BigBtn } from './BigBtn'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface StickyCTAProps {
  children: React.ReactNode
  onPress?: () => void
  secondary?: boolean
  disabled?: boolean
  hint?: string
}

export function StickyCTA({ children, onPress, secondary, disabled, hint }: StickyCTAProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const bottom = Math.max(insets.bottom, 22)
  return (
    <View style={[styles.container, { paddingBottom: bottom }]}>
      <BigBtn onPress={onPress} secondary={secondary} disabled={disabled}>
        {children}
      </BigBtn>
      {hint && <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 8 },
  hint: { fontSize: 12, fontFamily: fonts.body, textAlign: 'center', marginTop: 8 },
})
