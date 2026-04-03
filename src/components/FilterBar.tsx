import { memo } from 'react'
import { Text, Pressable, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
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
          <Pressable
            key={type}
            accessibilityLabel={t(cat.label)}
            onPress={() => { try { Haptics.selectionAsync() } catch {} onFilterChange(isActive ? null : type) }}
            style={({ pressed }) => [
              styles.chip,
              isActive
                ? { backgroundColor: cat.color }
                : {
                    backgroundColor: cat.color + '12',
                    borderWidth: 1,
                    borderColor: cat.color + '30',
                  },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[
              styles.chipText,
              { color: isActive ? '#FFFFFF' : cat.color }
            ]}>
              {t(cat.label)}
            </Text>
          </Pressable>
        )
      })}
    </>
  )
})

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minHeight: 36,
  },
  chipText: { fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 18 },
})
