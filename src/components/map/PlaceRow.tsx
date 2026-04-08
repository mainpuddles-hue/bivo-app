import { View, Text, Pressable, StyleSheet } from 'react-native'
import { PressableOpacity } from '@/components/ui'
import { ChevronDown } from 'lucide-react-native'
import { fonts } from '@/lib/fonts'
import type { LocalPlace } from '@/lib/types'
import type { ListItem, ThemeColors } from './types'
import { LAYER_COLORS, PLACE_LABEL, formatDistance } from './constants'

interface PlaceRowProps {
  item: ListItem
  colors: ThemeColors
  t: (key: string) => string
  onPress: (item: ListItem) => void
  onDirections: (lat: number, lng: number) => void
  onShowAllPlaces?: () => void
}

export function PlaceRow({ item, colors, t, onPress, onDirections, onShowAllPlaces }: PlaceRowProps) {
  // "Show all" button
  if (item.id === '__show_all_places__') {
    return (
      <PressableOpacity
        style={[styles.showAllPlacesBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => onShowAllPlaces?.()}
      >
        <Text style={[styles.showAllPlacesText, { color: colors.primary }]}>{item.title}</Text>
        <ChevronDown size={16} color={colors.primary} />
      </PressableOpacity>
    )
  }

  const placeData = item.sourceData as LocalPlace
  const placeCategory = PLACE_LABEL[placeData.category] ?? ''
  // Category-specific color for left border accent
  const placeCatColor = placeData.category === 'restaurant' || placeData.category === 'fast_food' ? '#C75B3A'
    : placeData.category === 'cafe' ? '#E8A050'
    : placeData.category === 'bar' || placeData.category === 'pub' ? '#7C5CBF'
    : placeData.category === 'culture' || placeData.category === 'library' ? '#3B7DD8'
    : placeData.category === 'sport' ? '#2B8A62'
    : placeData.category === 'health' ? '#C75B3A'
    : LAYER_COLORS.place

  return (
    <PressableOpacity
      style={[styles.placeRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => onPress(item)}
    >
      <View style={[styles.placeColorBar, { backgroundColor: placeCatColor }]} />
      <Text style={[styles.placeTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
      {placeCategory ? (
        <View style={[styles.placeCatBadge, { backgroundColor: `${placeCatColor}15` }]}>
          <Text style={[styles.placeCatText, { color: placeCatColor }]}>{placeCategory}</Text>
        </View>
      ) : null}
      <Text style={[styles.placeDistance, { color: colors.mutedForeground }]}>
        {formatDistance(item.distance)}
      </Text>
      <Pressable
        onPress={() => {
          onDirections(item.latitude, item.longitude)
        }}
        hitSlop={8}
        style={styles.placeDirectionsBtn}
      >
        <Text style={[styles.placeDirectionsText, { color: colors.accent }]}>{t('map.directions')}</Text>
      </Pressable>
    </PressableOpacity>
  )
}

const styles = StyleSheet.create({
  placeRow: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 52,
    gap: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  placeColorBar: {
    width: 3,
    flex: 0.7,
    borderRadius: 2,
  },
  placeTitle: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    lineHeight: 21,
    flex: 1,
  },
  showAllPlacesBtn: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  showAllPlacesText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 21,
  },
  placeCatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  placeCatText: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    lineHeight: 14,
  },
  placeDistance: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  placeDirectionsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  placeDirectionsText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
})
