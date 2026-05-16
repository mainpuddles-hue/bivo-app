import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

type PillTone = 'on' | 'off' | 'soft' | 'live'

interface PillProps {
  tone?: PillTone
  children: React.ReactNode
}

export function Pill({ tone = 'on', children }: PillProps) {
  const { colors } = useTheme()
  const tones: Record<PillTone, { bg: string; fg: string; border?: string }> = {
    on: { bg: colors.foreground, fg: colors.primaryForeground },
    off: { bg: colors.card, fg: colors.foreground, border: colors.border },
    soft: { bg: colors.cardElevated, fg: colors.foreground },
    live: { bg: colors.accentBg, fg: colors.accent },
  }
  const t = tones[tone]
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, t.border ? { borderWidth: 1, borderColor: t.border } : null]}>
      <Text style={[styles.text, { color: t.fg }]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontSize: 13, fontFamily: fonts.bodyMedium, fontWeight: '500' },
})
