import { View, Text, Pressable, StyleSheet } from 'react-native'
import { PressableOpacity } from '@/components/ui'
import { ChevronDown, Navigation } from 'lucide-react-native'
import { fonts } from '@/lib/fonts'
import type { LocalPlace } from '@/lib/types'
import type { ListItem, ThemeColors } from './types'
import { LAYER_COLORS, formatDistance } from './constants'

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
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <Text style={[styles.showAllPlacesText, { color: colors.foreground }]}>{item.title}</Text>
        <ChevronDown size={16} color={colors.foreground} />
      </PressableOpacity>
    )
  }

  const placeData = item.sourceData as LocalPlace
  const placeCategory = t(`map.place.${placeData.category}`) ?? ''

  return (
    <PressableOpacity
      style={[styles.placeRow, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${placeCategory}, ${formatDistance(item.distance)}`}
    >
      <View style={styles.placeInfo}>
        <Text style={[styles.placeTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
        <View style={styles.placeMeta}>
          {placeCategory ? (
            <View style={[styles.placeCatBadge, { backgroundColor: colors.muted }]}>
              <Text style={[styles.placeCatText, { color: colors.mutedForeground }]}>{placeCategory}</Text>
            </View>
          ) : null}
          <Text style={[styles.placeDistance, { color: colors.mutedForeground }]}>
            {formatDistance(item.distance)}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={() => {
          onDirections(item.latitude, item.longitude)
        }}
        hitSlop={8}
        style={[styles.placeDirectionsBtn, { backgroundColor: colors.muted }]}
        accessibilityRole="button"
        accessibilityLabel={t('map.directions')}
      >
        <Navigation size={14} color={colors.foreground} />
      </Pressable>
    </PressableOpacity>
  )
}

const styles = StyleSheet.create({
  placeRow: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 12,
    gap: 10,
    overflow: 'hidden',
  },
  placeInfo: {
    flex: 1,
    gap: 4,
  },
  placeTitle: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.14,
    lineHeight: 18,
  },
  placeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  showAllPlacesBtn: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  showAllPlacesText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
  placeCatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  placeCatText: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    lineHeight: 16,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  placeDistance: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 14,
  },
  placeDirectionsBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
