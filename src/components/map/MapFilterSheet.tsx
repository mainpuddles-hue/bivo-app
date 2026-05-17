import { useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { SlidersHorizontal, X, ChevronDown, ChevronUp } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { PressableOpacity } from '@/components/ui'
import { EVENT_CATEGORIES } from '@/lib/eventAlgorithm'

export type MapSortMode = 'newest' | 'popular' | 'nearest' | 'calendar'

export interface MapFilterState {
  sortMode: MapSortMode
  eventSubcategories: string[]
  freeOnly: boolean
  showEventTypes: boolean
}

export const DEFAULT_MAP_FILTERS: MapFilterState = {
  sortMode: 'newest',
  eventSubcategories: [],
  freeOnly: false,
  showEventTypes: false,
}

const SORT_OPTIONS: { key: MapSortMode; label: string }[] = [
  { key: 'newest', label: 'feed.mapSortNewest' },
  { key: 'popular', label: 'feed.mapSortPopular' },
  { key: 'nearest', label: 'feed.mapSortNearest' },
  { key: 'calendar', label: 'feed.mapSortCalendar' },
]

const EVENT_TYPE_LABELS: Record<string, string> = {
  music: 'feed.mapCatMusic',
  sport: 'feed.mapCatSport',
  culture: 'feed.mapCatCulture',
  food: 'feed.mapCatFood',
  family: 'feed.mapCatFamily',
  nature: 'feed.mapCatNature',
  theatre: 'feed.mapCatTheatre',
  exhibition: 'feed.mapCatExhibition',
  education: 'feed.mapCatEducation',
  festival: 'feed.mapCatFestival',
  underground: 'feed.mapCatUnderground',
  other: 'feed.mapCatOther',
}

interface Props {
  filters: MapFilterState
  onChange: (filters: MapFilterState) => void
  onClose: () => void
  resultCount: number
}

export function MapFilterSheet({ filters, onChange, onClose, resultCount }: Props) {
  const { colors } = useTheme()
  const { t } = useI18n()

  const handleSortChange = useCallback((mode: MapSortMode) => {
    onChange({ ...filters, sortMode: mode })
  }, [filters, onChange])

  const handleToggleEventType = useCallback((cat: string) => {
    const current = filters.eventSubcategories
    const next = current.includes(cat)
      ? current.filter(c => c !== cat)
      : [...current, cat]
    onChange({ ...filters, eventSubcategories: next })
  }, [filters, onChange])

  const handleToggleFree = useCallback(() => {
    onChange({ ...filters, freeOnly: !filters.freeOnly })
  }, [filters, onChange])

  const handleToggleEventTypes = useCallback(() => {
    onChange({ ...filters, showEventTypes: !filters.showEventTypes })
  }, [filters, onChange])

  const handleReset = useCallback(() => {
    onChange({ ...DEFAULT_MAP_FILTERS })
  }, [onChange])

  const isDefault = useMemo(() => {
    return filters.sortMode === 'newest'
      && filters.eventSubcategories.length === 0
      && !filters.freeOnly
  }, [filters])

  return (
    <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <SlidersHorizontal size={16} color={colors.foreground} />
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('feed.mapFilters')}</Text>
        </View>
        <View style={s.headerRight}>
          {!isDefault && (
            <PressableOpacity onPress={handleReset} hitSlop={8}>
              <Text style={[s.resetText, { color: colors.primary }]}>{t('feed.mapResetFilters')}</Text>
            </PressableOpacity>
          )}
          <PressableOpacity onPress={onClose} hitSlop={8} style={s.closeBtn} accessibilityLabel={t('common.close')}>
            <X size={18} color={colors.mutedForeground} />
          </PressableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={s.body}>
        {/* Sort */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('feed.mapSort')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {SORT_OPTIONS.map(opt => {
            const active = filters.sortMode === opt.key
            return (
              <PressableOpacity
                key={opt.key}
                onPress={() => handleSortChange(opt.key)}
                style={[
                  s.chip,
                  active
                    ? { backgroundColor: colors.foreground }
                    : { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={[s.chipText, { color: active ? colors.background : colors.foreground }]}>
                  {t(opt.label)}
                </Text>
              </PressableOpacity>
            )
          })}
        </ScrollView>

        {/* Event types — expandable */}
        <PressableOpacity onPress={handleToggleEventTypes} style={s.expandHeader}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>
            {t('feed.mapEventTypes')}
          </Text>
          {filters.eventSubcategories.length > 0 && (
            <View style={[s.activeCount, { backgroundColor: colors.primary }]}>
              <Text style={s.activeCountText}>{filters.eventSubcategories.length}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          {filters.showEventTypes
            ? <ChevronUp size={16} color={colors.mutedForeground} />
            : <ChevronDown size={16} color={colors.mutedForeground} />}
        </PressableOpacity>

        {filters.showEventTypes && (
          <View style={s.chipWrap}>
            {EVENT_CATEGORIES.map(cat => {
              const active = filters.eventSubcategories.includes(cat)
              const label = EVENT_TYPE_LABELS[cat]
              return (
                <PressableOpacity
                  key={cat}
                  onPress={() => handleToggleEventType(cat)}
                  style={[
                    s.chip,
                    active
                      ? { backgroundColor: colors.foreground }
                      : { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 },
                  ]}
                >
                  <Text style={[s.chipText, { color: active ? colors.background : colors.foreground }]}>
                    {label ? t(label) : cat}
                  </Text>
                </PressableOpacity>
              )
            })}
          </View>
        )}

        {/* Free only toggle */}
        <PressableOpacity onPress={handleToggleFree} style={s.toggleRow}>
          <Text style={[s.toggleLabel, { color: colors.foreground }]}>{t('feed.mapFreeOnly')}</Text>
          <View style={[s.toggle, filters.freeOnly ? { backgroundColor: colors.primary } : { backgroundColor: colors.muted, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={[s.toggleKnob, filters.freeOnly ? { transform: [{ translateX: 16 }], backgroundColor: '#fff' } : { backgroundColor: colors.mutedForeground }]} />
          </View>
        </PressableOpacity>
      </ScrollView>

      {/* Footer — result count */}
      <PressableOpacity onPress={onClose} style={[s.showBtn, { backgroundColor: colors.foreground }]}>
        <Text style={[s.showBtnText, { color: colors.background }]}>
          {t('feed.mapShowResults', { count: resultCount })}
        </Text>
      </PressableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderBottomWidth: 0,
    maxHeight: '60%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 12,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 16, fontFamily: fonts.heading, lineHeight: 20 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resetText: { fontSize: 13, fontFamily: fonts.bodySemi },
  closeBtn: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 20 },
  sectionLabel: {
    fontSize: 11, fontFamily: fonts.bodySemi, textTransform: 'uppercase',
    letterSpacing: 0.88, marginBottom: 8, marginTop: 12,
  },
  chipRow: { gap: 8, paddingBottom: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 16 },
  expandHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, marginTop: 8,
  },
  activeCount: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  activeCountText: { color: '#fff', fontSize: 11, fontFamily: fonts.bodySemi, fontWeight: '700' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, marginTop: 4,
  },
  toggleLabel: { fontSize: 14, fontFamily: fonts.body },
  toggle: { width: 44, height: 28, borderRadius: 14, justifyContent: 'center', paddingHorizontal: 3 },
  toggleKnob: { width: 22, height: 22, borderRadius: 11 },
  showBtn: {
    marginHorizontal: 20, marginBottom: 20, marginTop: 8,
    paddingVertical: 14, borderRadius: 14, alignItems: 'center',
  },
  showBtnText: { fontSize: 15, fontFamily: fonts.heading },
})
