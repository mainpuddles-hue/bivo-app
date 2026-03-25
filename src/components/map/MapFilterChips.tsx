import { memo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { CATEGORIES } from '@/lib/constants'
import type { PostType } from '@/lib/types'

const shadow = { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 }

const PLACE_CATEGORIES = [
  { key: null, label: 'common.all' },
  { key: 'restaurant', label: 'places.restaurant' },
  { key: 'cafe', label: 'places.cafe' },
  { key: 'bar', label: 'places.bar' },
  { key: 'shop', label: 'places.shop' },
  { key: 'culture', label: 'places.culture' },
  { key: 'service', label: 'places.service' },
  { key: 'library', label: 'places.library' },
]

// City event category config matching web exactly
const CITY_EVENT_CATS: Record<string, { color: string; icon: string }> = {
  culture: { color: '#8E44AD', icon: 'Palette' },
  music: { color: '#E91E63', icon: 'Music' },
  sport: { color: '#27AE60', icon: 'Dumbbell' },
  family: { color: '#FF9800', icon: 'Users' },
  food: { color: '#E74C3C', icon: 'UtensilsCrossed' },
  nature: { color: '#4CAF50', icon: 'Leaf' },
  education: { color: '#2196F3', icon: 'GraduationCap' },
  theatre: { color: '#9C27B0', icon: 'Drama' },
  exhibition: { color: '#795548', icon: 'Frame' },
  festival: { color: '#FF5722', icon: 'PartyPopper' },
  market: { color: '#FF9800', icon: 'Store' },
  other: { color: '#607D8B', icon: 'CalendarDays' },
}

interface MapFilterChipsProps {
  activeSubFilter: 'posts' | 'events' | 'places'
  // Post filter state
  postFilter: PostType | null
  onPostFilterChange: (filter: PostType | null) => void
  // Event filter state
  eventSource: 'all' | 'community' | 'city'
  onEventSourceChange: (source: 'all' | 'community' | 'city') => void
  cityEventCategory: string | null
  onCityEventCategoryChange: (cat: string | null) => void
  cityEventCategoryCounts: Record<string, number>
  // Place filter state
  placeFilter: string | null
  onPlaceFilterChange: (filter: string | null) => void
  // Theme
  colors: {
    card: string
    border: string
    primary: string
    muted: string
    mutedForeground: string
  }
  t: (key: string) => string
}

export const MapFilterChips = memo(function MapFilterChips({
  activeSubFilter,
  postFilter,
  onPostFilterChange,
  eventSource,
  onEventSourceChange,
  cityEventCategory,
  onCityEventCategoryChange,
  cityEventCategoryCounts,
  placeFilter,
  onPlaceFilterChange,
  colors,
  t,
}: MapFilterChipsProps) {
  return (
    <View style={[styles.subPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {activeSubFilter === 'posts' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable
            onPress={() => onPostFilterChange(null)}
            style={[styles.chip, !postFilter ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted }]}
          >
            <Text style={[styles.chipText, { color: !postFilter ? '#FFF' : colors.mutedForeground }]}>
              {t('common.all')}
            </Text>
          </Pressable>
          {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).map(([type, cat]) => (
            <Pressable
              key={type}
              onPress={() => onPostFilterChange(postFilter === type ? null : type)}
              style={[styles.chip, postFilter === type ? { backgroundColor: cat.color } : { backgroundColor: colors.muted }]}
            >
              <Text style={[styles.chipText, { color: postFilter === type ? '#FFF' : colors.mutedForeground }]}>
                {t(cat.label)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {activeSubFilter === 'events' && (
        <View style={{ gap: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {(['all', 'community', 'city'] as const).map((src) => (
              <Pressable
                key={src}
                onPress={() => onEventSourceChange(src)}
                style={[styles.chip, eventSource === src ? { backgroundColor: '#2B8A62' } : { backgroundColor: colors.muted }]}
              >
                <Text style={[styles.chipText, { color: eventSource === src ? '#FFF' : colors.mutedForeground }]}>
                  {src === 'all' ? t('common.all') : src === 'community' ? t('events.communityTab') : 'Helsinki'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {(eventSource === 'all' || eventSource === 'city') && Object.keys(cityEventCategoryCounts).length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <Pressable
                onPress={() => onCityEventCategoryChange(null)}
                style={[styles.chip, !cityEventCategory ? { backgroundColor: '#3B7DD8' } : { backgroundColor: colors.muted }]}
              >
                <Text style={[styles.chipText, { color: !cityEventCategory ? '#FFF' : colors.mutedForeground }]}>
                  {t('common.all')}
                </Text>
              </Pressable>
              {Object.entries(cityEventCategoryCounts).map(([cat, count]) => {
                const cfg = CITY_EVENT_CATS[cat]
                return (
                  <Pressable
                    key={cat}
                    onPress={() => onCityEventCategoryChange(cityEventCategory === cat ? null : cat)}
                    style={[
                      styles.chip,
                      cityEventCategory === cat ? { backgroundColor: cfg?.color ?? '#3B7DD8' } : { backgroundColor: colors.muted },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: cityEventCategory === cat ? '#FFF' : colors.mutedForeground }]}>
                      {cat} ({count})
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          )}
        </View>
      )}
      {activeSubFilter === 'places' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {PLACE_CATEGORIES.map(({ key, label }) => (
            <Pressable
              key={key ?? 'all'}
              onPress={() => onPlaceFilterChange(key)}
              style={[styles.chip, placeFilter === key ? { backgroundColor: '#78716C' } : { backgroundColor: colors.muted }]}
            >
              <Text style={[styles.chipText, { color: placeFilter === key ? '#FFF' : colors.mutedForeground }]}>
                {t(label)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  subPanel: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    ...shadow,
  },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  chipText: { fontSize: 11, fontWeight: '500' },
})
