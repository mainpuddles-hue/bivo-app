import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import * as Haptics from 'expo-haptics'
import { ArrowLeft } from 'lucide-react-native'
import { fonts } from '@/lib/fonts'
import type { FilterKey, ThemeColors } from './types'
import { LAYER_COLORS, POST_SUBCATS, EVENT_SUBCATS, PLACE_SUBCATS, TIME_FILTERS } from './constants'

interface MapFiltersProps {
  activeFilter: FilterKey
  subCategory: string | null
  timeFilter: 'all' | 'today' | 'tomorrow' | 'week'
  counts: { all: number; posts: number; events: number; places: number }
  subCounts: Map<string, number>
  colors: ThemeColors
  isDark: boolean
  t: (key: string) => string
  neighborhoodLoading: boolean
  onFilterChange: (filter: FilterKey) => void
  onSubCategoryChange: (sub: string | null) => void
  onTimeFilterChange: (time: 'all' | 'today' | 'tomorrow' | 'week') => void
}

export function MapFilters({
  activeFilter,
  subCategory,
  timeFilter,
  counts,
  subCounts,
  colors,
  isDark,
  t,
  neighborhoodLoading,
  onFilterChange,
  onSubCategoryChange,
  onTimeFilterChange,
}: MapFiltersProps) {
  return (
    <View style={styles.filterOverlay}>
      {neighborhoodLoading && (
        <ActivityIndicator size="small" color={colors.foreground} style={{ marginRight: 4 }} />
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
        {(activeFilter === 'posts' || activeFilter === 'events' || activeFilter === 'places') ? (
          <>
            {/* Back to main filters */}
            <Pressable
              style={[styles.filterPill, {
                backgroundColor: colors.foreground,
                borderColor: colors.foreground,
              }]}
              hitSlop={8}
              onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} onFilterChange('all'); onSubCategoryChange(null); onTimeFilterChange('all') }}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <ArrowLeft size={14} color={colors.primaryForeground} />
              <Text style={[styles.backPillText, { color: colors.primaryForeground }]}>
                {activeFilter === 'posts' ? t('map.layerPosts') : activeFilter === 'events' ? t('map.layerEvents') : t('map.layerPlaces')}
              </Text>
            </Pressable>

            {/* Time filters (events only) */}
            {activeFilter === 'events' && TIME_FILTERS.map(tf => (
              <Pressable
                key={tf.key}
                style={[
                  styles.filterPill,
                  {
                    borderColor: timeFilter === tf.key ? colors.foreground : colors.border,
                    backgroundColor: timeFilter === tf.key ? colors.foreground : colors.card,
                  },
                ]}
                hitSlop={8}
                onPress={() => { try { Haptics.selectionAsync() } catch {} onTimeFilterChange(timeFilter === tf.key ? 'all' : tf.key) }}
                accessibilityRole="button"
                accessibilityLabel={t(tf.labelKey)}
                accessibilityState={{ selected: timeFilter === tf.key }}
              >
                <Text style={[styles.filterPillText, { color: timeFilter === tf.key ? colors.primaryForeground : colors.foreground }]}>
                  {t(tf.labelKey)}
                </Text>
              </Pressable>
            ))}

            {/* Sub-category pills */}
            {activeFilter === 'posts' ? (
              POST_SUBCATS.map(sc => {
                const isActive = subCategory === sc.key
                const count = sc.key ? (subCounts.get(`post:${sc.key}`) ?? 0) : counts.posts
                return (
                  <Pressable
                    key={sc.key ?? '__all__'}
                    style={[
                      styles.filterPill,
                      {
                        borderColor: isActive ? colors.foreground : colors.border,
                        backgroundColor: isActive ? colors.foreground : colors.card,
                      },
                    ]}
                    hitSlop={8}
                    onPress={() => { try { Haptics.selectionAsync() } catch {} onSubCategoryChange(subCategory === sc.key ? null : sc.key) }}
                    accessibilityRole="button"
                    accessibilityLabel={t(sc.labelKey)}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text style={[styles.filterPillText, { color: isActive ? colors.primaryForeground : colors.foreground }]}>
                      {t(sc.labelKey)} ({count})
                    </Text>
                  </Pressable>
                )
              })
            ) : (
              (activeFilter === 'events' ? EVENT_SUBCATS : PLACE_SUBCATS).map(sc => {
                const isActive = subCategory === sc.key
                const prefix = activeFilter === 'events' ? 'event' : 'place'
                const count = sc.key ? (subCounts.get(`${prefix}:${sc.key}`) ?? 0) : (activeFilter === 'events' ? counts.events : counts.places)
                return (
                  <Pressable
                    key={sc.key ?? '__all__'}
                    style={[
                      styles.filterPill,
                      {
                        borderColor: isActive ? colors.foreground : colors.border,
                        backgroundColor: isActive ? colors.foreground : colors.card,
                      },
                    ]}
                    hitSlop={8}
                    onPress={() => { try { Haptics.selectionAsync() } catch {} onSubCategoryChange(subCategory === sc.key ? null : sc.key) }}
                    accessibilityRole="button"
                    accessibilityLabel={t(sc.labelKey)}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text style={[styles.filterPillText, { color: isActive ? colors.primaryForeground : colors.foreground }]}>
                      {t(sc.labelKey)} ({count})
                    </Text>
                  </Pressable>
                )
              })
            )}
          </>
        ) : (
          /* Main layer filters */
          ([
            { key: 'all' as FilterKey, label: t('events.filterAll'), hasSubFilter: false },
            { key: 'posts' as FilterKey, label: t('map.layerPosts'), hasSubFilter: true },
            { key: 'events' as FilterKey, label: t('map.layerEvents'), hasSubFilter: true },
            { key: 'places' as FilterKey, label: t('map.layerPlaces'), hasSubFilter: true },
          ]).map(f => {
            const isActive = activeFilter === f.key
            return (
              <Pressable
                key={f.key}
                style={[
                  styles.filterPill,
                  {
                    borderColor: isActive ? colors.foreground : colors.border,
                    backgroundColor: isActive ? colors.foreground : colors.card,
                  },
                ]}
                hitSlop={8}
                onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} onFilterChange(f.key); onSubCategoryChange(null); onTimeFilterChange('all') }}
                accessibilityRole="button"
                accessibilityLabel={`${f.label} (${counts[f.key]})`}
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.filterPillText, { color: isActive ? colors.primaryForeground : colors.foreground }]}>
                  {f.label} ({counts[f.key]}){f.hasSubFilter ? ' \u25B8' : ''}
                </Text>
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  filterOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  filterScrollContent: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    lineHeight: 16,
  },
  backPillText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
})
