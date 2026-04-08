import { memo } from 'react'
import { Text, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { CATEGORIES } from '@/lib/constants'
import { FEATURES } from '@/lib/featureFlags'
import type { PostType } from '@/lib/types'

interface FilterBarProps {
  activeFilter: PostType | null
  onFilterChange: (type: PostType | null) => void
}

export const FilterBar = memo(function FilterBar({ activeFilter, onFilterChange }: FilterBarProps) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()

  return (
    <>
      {/* Category chips — tapping active chip deselects (shows all) */}
      {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).filter(([type]) => {
        if (type === 'lainaa' && !FEATURES.LENDING) return false
        if (type === 'nappaa' && !FEATURES.GRAB) return false
        return true
      }).map(([type, cat]) => {
        const isActive = activeFilter === type

        return (
          <PressableOpacity
            key={type}
            accessibilityLabel={t(cat.label)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => { try { Haptics.selectionAsync() } catch {} onFilterChange(isActive ? null : type) }}
            style={[
              styles.chip,
              isActive
                ? { backgroundColor: cat.color }
                : {
                    backgroundColor: cat.color + '12',
                    borderWidth: 1,
                    borderColor: cat.color + '30',
                  },
            ]}
          >
            <Text style={[
              styles.chipText,
              { color: isActive ? colors.primaryForeground : cat.color }
            ]}>
              {t(cat.label)}
            </Text>
          </PressableOpacity>
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
