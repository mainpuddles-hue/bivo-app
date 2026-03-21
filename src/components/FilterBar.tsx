import { memo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { CATEGORIES } from '@/lib/constants'
import { CATEGORY_ICON_MAP as ICON_MAP } from '@/lib/categoryIcons'
import type { PostType } from '@/lib/types'

interface FilterBarProps {
  activeFilter: PostType | null
  onFilterChange: (type: PostType | null) => void
}

export const FilterBar = memo(function FilterBar({ activeFilter, onFilterChange }: FilterBarProps) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      style={styles.scroll}
    >
      {/* Category chips — tapping active chip deselects (shows all) */}
      {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).map(([type, cat]) => {
        const Icon = ICON_MAP[cat.icon]
        const isActive = activeFilter === type

        return (
          <Pressable
            key={type}
            accessibilityLabel={t(cat.label)}
            onPress={() => { try { Haptics.selectionAsync() } catch {} onFilterChange(isActive ? null : type) }}
            style={[
              styles.chip,
              isActive
                ? { backgroundColor: cat.color }
                : { backgroundColor: isDark ? colors.card : colors.muted },
            ]}
          >
            {Icon && <Icon size={14} color={isActive ? '#FFFFFF' : colors.mutedForeground} strokeWidth={1.75} />}
            <Text style={[
              styles.chipText,
              { color: isActive ? '#FFFFFF' : colors.mutedForeground }
            ]}>
              {t(cat.label)}
            </Text>
            {isActive && (
              <Text style={[styles.chipSubtitle, { color: 'rgba(255,255,255,0.8)' }]}>
                {t(cat.subtitle)}
              </Text>
            )}
          </Pressable>
        )
      })}
    </ScrollView>
  )
})

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  scrollContent: { flexDirection: 'row', gap: 6, paddingRight: 16 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, minHeight: 36,
  },
  chipText: { fontSize: 12, fontFamily: fonts.bodyMedium },
  chipSubtitle: { fontSize: 10, fontFamily: fonts.body },
})
