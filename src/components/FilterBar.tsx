import { memo, useEffect, useRef } from 'react'
import { Text, StyleSheet, Animated } from 'react-native'
import * as Haptics from 'expo-haptics'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { CATEGORIES } from '@/lib/constants'
import { FEATURES } from '@/lib/featureFlags'
import type { PostType } from '@/lib/types'

interface FilterBarProps {
  activeFilter: PostType | null
  onFilterChange: (type: PostType | null) => void
}

// Inner chip — isolates animated scale per chip with spring physics (Apple HIG)
interface FilterChipProps {
  label: string
  color: string
  isActive: boolean
  foregroundColor: string
  onPress: () => void
}
const FilterChip = memo(function FilterChip({ label, color, isActive, foregroundColor, onPress }: FilterChipProps) {
  const reduceMotion = useReduceMotion()
  const scale = useRef(new Animated.Value(1)).current
  const isFirstRun = useRef(true)

  // Pulse spring when selection state flips — skip initial mount run
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return }
    if (reduceMotion) return
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.92, friction: 6, tension: 180, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
    ]).start()
  }, [isActive, reduceMotion, scale])

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <PressableOpacity
        accessibilityLabel={label}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        onPress={onPress}
        style={[
          styles.chip,
          isActive
            ? { backgroundColor: color }
            : { backgroundColor: color + '1A' },
        ]}
      >
        <Text style={[styles.chipText, { color: isActive ? foregroundColor : color }, isActive && { fontFamily: fonts.bodySemi }]}>
          {label}
        </Text>
      </PressableOpacity>
    </Animated.View>
  )
})

export const FilterBar = memo(function FilterBar({ activeFilter, onFilterChange }: FilterBarProps) {
  const { colors } = useTheme()
  const { t } = useI18n()

  return (
    <>
      <FilterChip
        key="all"
        label={t('feed.filterAll')}
        color={colors.primary}
        isActive={activeFilter === null}
        foregroundColor={colors.primaryForeground}
        onPress={() => { try { Haptics.selectionAsync() } catch {} onFilterChange(null) }}
      />
      {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).filter(([type]) => {
        if (type === 'lainaa' && !FEATURES.LENDING) return false
        return true
      }).map(([type, cat]) => {
        const isActive = activeFilter === type
        return (
          <FilterChip
            key={type}
            label={t(cat.label)}
            color={cat.color}
            isActive={isActive}
            foregroundColor={colors.primaryForeground}
            onPress={() => { try { Haptics.selectionAsync() } catch {} onFilterChange(isActive ? null : type) }}
          />
        )
      })}
    </>
  )
})

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minHeight: 36,
  },
  chipText: { fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 18 },
})
