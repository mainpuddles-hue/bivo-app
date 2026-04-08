import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  X,
  MapPin,
  DollarSign,
  Calendar,
  Navigation,
  ChevronDown,
  ChevronUp,
  Check,
  RotateCcw,
} from 'lucide-react-native'
import * as Location from 'expo-location'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { NEIGHBORHOODS } from '@/lib/constants'
import { fonts } from '@/lib/fonts'

export type SortOption = 'newest' | 'closest' | 'most_liked' | 'price_asc' | 'price_desc'

export interface SearchFilterValues {
  minPrice: string
  maxPrice: string
  postedAfter: string
  postedBefore: string
  distanceKm: number
  neighborhoods: string[]
  sortBy: SortOption
  userLat: number | null
  userLng: number | null
}

export const EMPTY_FILTERS: SearchFilterValues = {
  minPrice: '',
  maxPrice: '',
  postedAfter: '',
  postedBefore: '',
  distanceKm: 50,
  neighborhoods: [],
  sortBy: 'newest',
  userLat: null,
  userLng: null,
}

export function countActiveFilters(filters: SearchFilterValues): number {
  let count = 0
  if (filters.minPrice) count++
  if (filters.maxPrice) count++
  if (filters.postedAfter) count++
  if (filters.postedBefore) count++
  if (filters.distanceKm < 50) count++
  if (filters.neighborhoods.length > 0) count++
  if (filters.sortBy !== 'newest') count++
  return count
}

interface SearchFiltersProps {
  visible: boolean
  onClose: () => void
  filters: SearchFilterValues
  onApply: (filters: SearchFilterValues) => void
}

const SORT_OPTIONS: { key: SortOption; labelKey: string }[] = [
  { key: 'newest', labelKey: 'search.sortNewest' },
  { key: 'closest', labelKey: 'search.sortClosest' },
  { key: 'most_liked', labelKey: 'search.sortMostLiked' },
  { key: 'price_asc', labelKey: 'search.sortPriceLow' },
  { key: 'price_desc', labelKey: 'search.sortPriceHigh' },
]

const DISTANCE_STEPS = [1, 2, 5, 10, 15, 20, 30, 50]

export function SearchFilters({ visible, onClose, filters, onApply }: SearchFiltersProps) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()

  const [local, setLocal] = useState<SearchFilterValues>(filters)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    price: true,
    date: false,
    distance: false,
    neighborhoods: false,
    sort: true,
  })
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'granted' | 'denied'>('idle')

  // Sync local state when modal opens
  useEffect(() => {
    if (visible) {
      setLocal(filters)
    }
  }, [visible, filters])

  // Request location when distance section is expanded
  useEffect(() => {
    if (expandedSections.distance && locationStatus === 'idle') {
      requestLocation()
    }
  }, [expandedSections.distance, locationStatus])

  const requestLocation = useCallback(async () => {
    setLocationStatus('loading')
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setLocationStatus('denied')
        return
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      setLocal(prev => ({
        ...prev,
        userLat: loc.coords.latitude,
        userLng: loc.coords.longitude,
      }))
      setLocationStatus('granted')
    } catch {
      setLocationStatus('denied')
    }
  }, [])

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleNeighborhood = (nh: string) => {
    setLocal(prev => ({
      ...prev,
      neighborhoods: prev.neighborhoods.includes(nh)
        ? prev.neighborhoods.filter(n => n !== nh)
        : [...prev.neighborhoods, nh],
    }))
  }

  const handleClear = () => {
    setLocal({ ...EMPTY_FILTERS })
  }

  const handleApply = () => {
    onApply(local)
    onClose()
  }

  const activeCount = useMemo(() => countActiveFilters(local), [local])

  const distanceIndex = useMemo(() => {
    const idx = DISTANCE_STEPS.indexOf(local.distanceKm)
    return idx >= 0 ? idx : DISTANCE_STEPS.length - 1
  }, [local.distanceKm])

  const renderSectionHeader = (key: string, icon: React.ReactNode, title: string) => {
    const expanded = expandedSections[key]
    return (
      <Pressable
        onPress={() => toggleSection(key)}
        style={({ pressed }) => [styles.sectionHeader, { borderBottomColor: colors.border }, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.sectionHeaderLeft}>
          {icon}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
        </View>
        {expanded ? (
          <ChevronUp size={18} color={colors.mutedForeground} />
        ) : (
          <ChevronDown size={18} color={colors.mutedForeground} />
        )}
      </Pressable>
    )
  }

  // Validate date input format (YYYY-MM-DD)
  const formatDateInput = (text: string): string => {
    // Strip non-numeric except dashes
    const clean = text.replace(/[^0-9-]/g, '')
    // Auto-insert dashes
    if (clean.length <= 4) return clean
    if (clean.length <= 7) {
      const y = clean.slice(0, 4)
      const m = clean.slice(4).replace(/-/g, '')
      return m ? `${y}-${m.slice(0, 2)}` : y
    }
    const y = clean.slice(0, 4)
    const rest = clean.slice(4).replace(/-/g, '')
    const m = rest.slice(0, 2)
    const d = rest.slice(2, 4)
    return d ? `${y}-${m}-${d}` : `${y}-${m}`
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View
          style={[
            styles.header,
            {
              paddingTop: Platform.OS === 'ios' ? insets.top + 8 : 16,
              borderBottomColor: colors.border,
            },
          ]}
        >
          <View style={styles.headerLeft}>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={24} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              {t('search.filters')}
            </Text>
            {activeCount > 0 && (
              <View style={[styles.headerBadge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.headerBadgeText, { color: colors.primaryForeground }]}>
                  {activeCount}
                </Text>
              </View>
            )}
          </View>
          <Pressable onPress={handleClear} hitSlop={8}>
            <View style={styles.clearBtn}>
              <RotateCcw size={14} color={colors.mutedForeground} />
              <Text style={[styles.clearText, { color: colors.mutedForeground }]}>
                {t('search.clearAll')}
              </Text>
            </View>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Price Range ── */}
          {renderSectionHeader(
            'price',
            <DollarSign size={16} color={colors.primary} />,
            t('search.priceRange')
          )}
          {expandedSections.price && (
            <View style={styles.sectionBody}>
              <View style={styles.priceRow}>
                <View style={styles.priceInputWrap}>
                  <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>
                    {t('search.minPrice')}
                  </Text>
                  <TextInput
                    style={[
                      styles.priceInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                    value={local.minPrice}
                    onChangeText={v => setLocal(prev => ({ ...prev, minPrice: v.replace(/[^0-9.]/g, '') }))}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                  />
                </View>
                <Text style={[styles.priceDash, { color: colors.mutedForeground }]}>—</Text>
                <View style={styles.priceInputWrap}>
                  <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>
                    {t('search.maxPrice')}
                  </Text>
                  <TextInput
                    style={[
                      styles.priceInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                    value={local.maxPrice}
                    onChangeText={v => setLocal(prev => ({ ...prev, maxPrice: v.replace(/[^0-9.]/g, '') }))}
                    placeholder="999"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>
          )}

          {/* ── Date Range ── */}
          {renderSectionHeader(
            'date',
            <Calendar size={16} color={colors.primary} />,
            t('search.dateRange')
          )}
          {expandedSections.date && (
            <View style={styles.sectionBody}>
              <View style={styles.dateRow}>
                <View style={styles.dateInputWrap}>
                  <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>
                    {t('search.postedAfter')}
                  </Text>
                  <TextInput
                    style={[
                      styles.dateInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                    value={local.postedAfter}
                    onChangeText={v =>
                      setLocal(prev => ({ ...prev, postedAfter: formatDateInput(v) }))
                    }
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    maxLength={10}
                  />
                </View>
                <View style={styles.dateInputWrap}>
                  <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>
                    {t('search.postedBefore')}
                  </Text>
                  <TextInput
                    style={[
                      styles.dateInput,
                      {
                        color: colors.foreground,
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                    value={local.postedBefore}
                    onChangeText={v =>
                      setLocal(prev => ({ ...prev, postedBefore: formatDateInput(v) }))
                    }
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    maxLength={10}
                  />
                </View>
              </View>
            </View>
          )}

          {/* ── Distance ── */}
          {renderSectionHeader(
            'distance',
            <Navigation size={16} color={colors.primary} />,
            t('search.distance')
          )}
          {expandedSections.distance && (
            <View style={styles.sectionBody}>
              {locationStatus === 'denied' ? (
                <Text style={[styles.locationHint, { color: colors.destructive }]}>
                  {t('search.locationRequired')}
                </Text>
              ) : (
                <>
                  <Text style={[styles.distanceLabel, { color: colors.foreground }]}>
                    {local.distanceKm < 50
                      ? t('search.distanceKm', { km: local.distanceKm })
                      : `50+ km`}
                  </Text>
                  <View style={styles.distanceSteps}>
                    {DISTANCE_STEPS.map((step, idx) => (
                      <Pressable
                        key={step}
                        onPress={() => setLocal(prev => ({ ...prev, distanceKm: step }))}
                        style={({ pressed }) => [
                          styles.distanceStep,
                          {
                            backgroundColor:
                              idx <= distanceIndex
                                ? colors.primary
                                : isDark
                                  ? colors.card
                                  : colors.muted,
                          },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.distanceStepText,
                            {
                              color:
                                idx <= distanceIndex
                                  ? colors.primaryForeground
                                  : colors.mutedForeground,
                            },
                          ]}
                        >
                          {step}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}

          {/* ── Neighborhoods ── */}
          {renderSectionHeader(
            'neighborhoods',
            <MapPin size={16} color={colors.primary} />,
            t('search.neighborhoods')
          )}
          {expandedSections.neighborhoods && (
            <View style={styles.sectionBody}>
              <View style={styles.chipGrid}>
                {NEIGHBORHOODS.map(nh => {
                  const selected = local.neighborhoods.includes(nh)
                  return (
                    <Pressable
                      key={nh}
                      onPress={() => toggleNeighborhood(nh)}
                      style={({ pressed }) => [
                        styles.nhChip,
                        selected
                          ? { backgroundColor: colors.primary }
                          : {
                              backgroundColor: isDark ? colors.card : colors.muted,
                              borderColor: colors.border,
                              borderWidth: 1,
                            },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      {selected && <Check size={12} color={colors.primaryForeground} />}
                      <Text
                        style={[
                          styles.nhChipText,
                          {
                            color: selected ? colors.primaryForeground : colors.foreground,
                          },
                        ]}
                      >
                        {nh}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          )}

          {/* ── Sort By ── */}
          {renderSectionHeader(
            'sort',
            <ChevronDown size={16} color={colors.primary} />,
            t('search.sortLabel')
          )}
          {expandedSections.sort && (
            <View style={styles.sectionBody}>
              {SORT_OPTIONS.map(opt => {
                const selected = local.sortBy === opt.key
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setLocal(prev => ({ ...prev, sortBy: opt.key }))}
                    style={({ pressed }) => [
                      styles.sortOption,
                      {
                        backgroundColor: selected
                          ? `${colors.primary}15`
                          : 'transparent',
                        borderColor: selected ? colors.primary : colors.border,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View
                      style={[
                        styles.sortRadio,
                        {
                          borderColor: selected ? colors.primary : colors.border,
                          backgroundColor: selected ? colors.primary : 'transparent',
                        },
                      ]}
                    >
                      {selected && <View style={[styles.sortRadioDot, { backgroundColor: colors.primaryForeground }]} />}
                    </View>
                    <Text
                      style={[
                        styles.sortText,
                        { color: selected ? colors.primary : colors.foreground },
                      ]}
                    >
                      {t(opt.labelKey)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          )}
        </ScrollView>

        {/* Footer buttons */}
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 12,
              borderTopColor: colors.border,
              backgroundColor: colors.background,
            },
          ]}
        >
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [styles.footerBtn, styles.footerBtnSecondary, { borderColor: colors.border }, pressed && { opacity: 0.7 }]}
          >
            <Text style={[styles.footerBtnText, { color: colors.foreground }]}>
              {t('search.clearAll')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleApply}
            style={({ pressed }) => [styles.footerBtn, styles.footerBtnPrimary, { backgroundColor: colors.primary }, pressed && { opacity: 0.7 }]}
          >
            <Text style={[styles.footerBtnText, { color: colors.primaryForeground }]}>
              {t('search.apply')}
              {activeCount > 0 ? ` (${activeCount})` : ''}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', lineHeight: 24, fontFamily: fonts.heading },
  headerBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  headerBadgeText: { fontSize: 11, fontWeight: '700', lineHeight: 16, fontFamily: fonts.bodySemi },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clearText: { fontSize: 13, fontWeight: '500', lineHeight: 18, fontFamily: fonts.bodyMedium },
  scrollContent: { paddingBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '600', lineHeight: 20, fontFamily: fonts.headingSemi },
  sectionBody: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  priceInputWrap: { flex: 1, gap: 4 },
  inputLabel: { fontSize: 12, fontWeight: '500', lineHeight: 16, fontFamily: fonts.bodyMedium },
  priceInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
  },
  priceDash: { fontSize: 18, paddingBottom: 10, lineHeight: 24 },
  dateRow: { flexDirection: 'row', gap: 12 },
  dateInputWrap: { flex: 1, gap: 4 },
  dateInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
  },
  locationHint: { fontSize: 13, textAlign: 'center', paddingVertical: 8, lineHeight: 18, fontFamily: fonts.body },
  distanceLabel: { fontSize: 20, fontWeight: '700', textAlign: 'center', lineHeight: 28, fontFamily: fonts.heading },
  distanceSteps: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  distanceStep: {
    minWidth: 44,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  distanceStepText: { fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: fonts.bodySemi },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nhChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  nhChipText: { fontSize: 13, fontWeight: '500', lineHeight: 18, fontFamily: fonts.bodyMedium },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sortRadio: {
    width: 20,
    height: 20,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortRadioDot: { width: 8, height: 8, borderRadius: 4 },
  sortText: { fontSize: 14, fontWeight: '500', lineHeight: 20, fontFamily: fonts.bodyMedium },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnSecondary: { borderWidth: 1 },
  footerBtnPrimary: {},
  footerBtnText: { fontSize: 14, fontWeight: '600', lineHeight: 20, fontFamily: fonts.bodySemi },
})
