import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface StickyCTAProps {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  bottomInset?: number
}

export function StickyCTA({ label, onPress, disabled, loading, bottomInset = 22 }: StickyCTAProps) {
  const { colors, isDark } = useTheme()
  const isInactive = disabled || loading

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: bottomInset }]}
    >
      <PressableOpacity
        onPress={onPress}
        disabled={isInactive}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!isInactive, busy: !!loading }}
        style={[
          styles.btn,
          {
            backgroundColor: colors.foreground,
            opacity: isInactive ? 0.5 : 1,
            shadowColor: isDark ? '#000' : '#1A1D1F',
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primaryForeground} />
        ) : (
          <Text
            style={[
              styles.label,
              { color: colors.primaryForeground, opacity: disabled ? 0.7 : 1 },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        )}
      </PressableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 22,
  },
  btn: {
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 8,
  },
  label: {
    fontSize: 15,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
})
