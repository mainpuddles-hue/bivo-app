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

// v3 pill chip — 36px height, pill radius, with spring press
interface FilterChipProps {
  label: string
  isActive: boolean
  onPress: () => void
  dotColor?: string
}
const FilterChip = memo(function FilterChip({ label, isActive, onPress, dotColor }: FilterChipProps) {
  const { colors } = useTheme()
  const reduceMotion = useReduceMotion()
  const scale = useRef(new Animated.Value(1)).current
  const isFirstRun = useRef(true)

  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return }
    if (reduceMotion) return
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.90, friction: 5, tension: 200, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 3, tension: 120, useNativeDriver: true }),
    ]).start()
  }, [isActive, reduceMotion, scale])

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <PressableOpacity
        accessibilityLabel={label}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive }}
        onPress={onPress}
        hitSlop={8}
        style={[
          styles.chip,
          isActive
            ? { backgroundColor: colors.foreground, borderWidth: 0 }
            : { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[
          styles.chipText,
          { color: isActive ? colors.primaryForeground : colors.foreground },
        ]}>
          {label}
        </Text>
      </PressableOpacity>
    </Animated.View>
  )
})

export const FilterBar = memo(function FilterBar({ activeFilter, onFilterChange }: FilterBarProps) {
  const { t } = useI18n()

  return (
    <>
      <FilterChip
        key="all"
        label={t('feed.filterAll')}
        isActive={activeFilter === null}
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
            isActive={isActive}
            dotColor={cat.color}
            onPress={() => { try { Haptics.selectionAsync() } catch {} onFilterChange(isActive ? null : type) }}
          />
        )
      })}
    </>
  )
})

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 16,
    letterSpacing: -0.065,
  },
})
