import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { BlurView } from 'expo-blur'
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
    <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={[styles.filterOverlay, { borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }]}>
      {neighborhoodLoading && (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 4 }} />
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
        {(activeFilter === 'posts' || activeFilter === 'events' || activeFilter === 'places') ? (
          <>
            {/* Back to main filters */}
            <Pressable
              style={[styles.filterPill, {
                backgroundColor: activeFilter === 'posts' ? LAYER_COLORS.post : activeFilter === 'events' ? LAYER_COLORS.event : LAYER_COLORS.place,
                borderColor: 'transparent',
              }]}
              onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} onFilterChange('all'); onSubCategoryChange(null); onTimeFilterChange('all') }}
            >
              <ArrowLeft size={14} color="#FFF" />
              <Text style={[styles.backPillText, { color: '#FFF' }]}>
                {activeFilter === 'posts' ? t('map.layerPosts') : activeFilter === 'events' ? t('map.layerEvents') : t('map.layerPlaces')}
              </Text>
            </Pressable>

            {/* Time filters (events only) */}
            {activeFilter === 'events' && TIME_FILTERS.map(tf => (
              <Pressable
                key={tf.key}
                style={[
                  styles.filterPill,
                  { borderColor: timeFilter === tf.key ? LAYER_COLORS.event : colors.border },
                  timeFilter === tf.key && { backgroundColor: LAYER_COLORS.event },
                ]}
                onPress={() => { try { Haptics.selectionAsync() } catch {} onTimeFilterChange(timeFilter === tf.key ? 'all' : tf.key) }}
              >
                <Text style={[styles.filterPillText, { color: timeFilter === tf.key ? '#FFF' : colors.foreground }]}>
                  {tf.label}
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
                      { borderColor: isActive ? sc.color : colors.border },
                      isActive && { backgroundColor: sc.color },
                    ]}
                    onPress={() => { try { Haptics.selectionAsync() } catch {} onSubCategoryChange(subCategory === sc.key ? null : sc.key) }}
                  >
                    <Text style={[styles.filterPillText, { color: isActive ? '#FFF' : colors.foreground }]}>
                      {sc.label} ({count})
                    </Text>
                  </Pressable>
                )
              })
            ) : (
              (activeFilter === 'events' ? EVENT_SUBCATS : PLACE_SUBCATS).map(sc => {
                const layerColor = activeFilter === 'events' ? LAYER_COLORS.event : LAYER_COLORS.place
                const isActive = subCategory === sc.key
                const prefix = activeFilter === 'events' ? 'event' : 'place'
                const count = sc.key ? (subCounts.get(`${prefix}:${sc.key}`) ?? 0) : (activeFilter === 'events' ? counts.events : counts.places)
                return (
                  <Pressable
                    key={sc.key ?? '__all__'}
                    style={[
                      styles.filterPill,
                      { borderColor: isActive ? layerColor : colors.border },
                      isActive && { backgroundColor: layerColor },
                    ]}
                    onPress={() => { try { Haptics.selectionAsync() } catch {} onSubCategoryChange(subCategory === sc.key ? null : sc.key) }}
                  >
                    <Text style={[styles.filterPillText, { color: isActive ? '#FFF' : colors.foreground }]}>
                      {sc.label} ({count})
                    </Text>
                  </Pressable>
                )
              })
            )}
          </>
        ) : (
          /* Main layer filters */
          ([
            { key: 'all' as FilterKey, label: t('events.filterAll'), color: colors.primary, hasSubFilter: false },
            { key: 'posts' as FilterKey, label: t('map.layerPosts'), color: LAYER_COLORS.post, hasSubFilter: true },
            { key: 'events' as FilterKey, label: t('map.layerEvents'), color: LAYER_COLORS.event, hasSubFilter: true },
            { key: 'places' as FilterKey, label: t('map.layerPlaces'), color: LAYER_COLORS.place, hasSubFilter: true },
          ]).map(f => {
            const isActive = activeFilter === f.key
            return (
              <Pressable
                key={f.key}
                style={[
                  styles.filterPill,
                  { borderColor: isActive ? f.color : colors.border },
                  isActive && { backgroundColor: f.color },
                ]}
                onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} onFilterChange(f.key); onSubCategoryChange(null); onTimeFilterChange('all') }}
              >
                <Text style={[styles.filterPillText, { color: isActive ? '#FFF' : colors.foreground }]}>
                  {f.label} ({counts[f.key]}){f.hasSubFilter ? ' \u25B8' : ''}
                </Text>
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </BlurView>
  )
}

const styles = StyleSheet.create({
  filterOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 6,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  filterScrollContent: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
  },
  backPillText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
  },
})
