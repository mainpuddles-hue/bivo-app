import React from 'react'
import { View, Text, StyleSheet, type ViewStyle } from 'react-native'
import { RoundBtn } from './RoundBtn'
import { ChevronLeft } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface TopNavProps {
  title?: string
  sub?: string
  onBack?: (() => void) | boolean
  trailing?: React.ReactNode
  style?: ViewStyle
}

export function TopNav({ title, sub, onBack, trailing, style }: TopNavProps) {
  const { colors } = useTheme()
  return (
    <View style={[styles.container, style]}>
      {onBack ? (
        <RoundBtn
          size={44}
          onPress={typeof onBack === 'function' ? onBack : undefined}
          accessibilityLabel="Takaisin"
        >
          <ChevronLeft size={18} color={colors.foreground} strokeWidth={2} />
        </RoundBtn>
      ) : (
        <View style={{ width: 44 }} />
      )}
      <View style={styles.center}>
        {title ? <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text> : null}
        {sub ? <Text style={[styles.sub, { color: colors.mutedForeground }]}>{sub}</Text> : null}
      </View>
      <View style={styles.trailing}>{trailing}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 20,
  },
  center: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontFamily: fonts.bodySemi, fontWeight: '600' },
  sub: { fontSize: 12, fontFamily: fonts.body, marginTop: 1 },
  trailing: { width: 44, alignItems: 'flex-end' },
})
