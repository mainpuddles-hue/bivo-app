import { memo } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, Animated, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { MapPin, ChevronRight } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useShimmer } from '@/components/SkeletonLoaders'
import type { LocalPlace } from '@/lib/types'

const PLACE_COLORS: Record<string, string> = {
  restaurant: '#E74C3C', cafe: '#8B5E3C', bar: '#F39C12', pub: '#D4A017',
  fast_food: '#FF6B35', shop: '#9B59B6', library: '#3498DB', health: '#E91E63',
  sport: '#2B8A62', culture: '#8E44AD', hotel: '#2980B9', attraction: '#F1C40F',
  service: '#607D8B', other: '#95A5A6',
}

const PLACE_LABEL_KEYS: Record<string, string> = {
  restaurant: 'places.restaurant', cafe: 'places.cafe', bar: 'places.bar', pub: 'places.pub',
  fast_food: 'places.fastFood', shop: 'places.shop', library: 'places.library', health: 'places.health',
  sport: 'places.sport', culture: 'places.culture', hotel: 'places.hotel', attraction: 'places.attraction',
  service: 'places.service', other: 'places.other',
}

// ── Skeleton component ──
function HorizontalSkeleton({ colors, width, height }: { colors: ReturnType<typeof useTheme>['colors']; width: number; height: number }) {
  const opacity = useShimmer()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 4 }}>
      {[0, 1, 2].map(i => (
        <Animated.View key={i} style={{ width, height, borderRadius: 16, backgroundColor: colors.muted, opacity }} />
      ))}
    </ScrollView>
  )
}

interface DiscoverySectionProps {
  nearbyPlaces: LocalPlace[]
  extraLoading: boolean
  placesSectionTitle: string
}

export const DiscoverySection = memo(function DiscoverySection({
  nearbyPlaces,
  extraLoading,
  placesSectionTitle,
}: DiscoverySectionProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()

  // Loading state — show skeleton circles for places
  if (extraLoading && nearbyPlaces.length === 0) {
    return (
      <View style={{ gap: 12 }}>
        <View style={[styles.sectionHeader, { paddingHorizontal: 4 }]}>
          <View style={[styles.sectionBar, { backgroundColor: colors.foreground }]} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{placesSectionTitle}</Text>
        </View>
        <HorizontalSkeleton colors={colors} width={56} height={56} />
      </View>
    )
  }

  // Nothing to show
  if (nearbyPlaces.length === 0) {
    return null
  }

  return (
    <View style={{ gap: 12 }}>
      {/* Section header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        <View style={[styles.sectionBar, { backgroundColor: colors.foreground }]} />
        <Text style={[styles.sectionTitle, { color: colors.foreground, marginLeft: 12 }]}>{placesSectionTitle}</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => router.push('/map')}
          hitSlop={8}
          style={styles.showAllBtn}
        >
          <Text style={[styles.showAllText, { color: colors.foreground }]}>
            {t('nav.map') || 'Kartta'}
          </Text>
          <ChevronRight size={14} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Places carousel */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 4, paddingBottom: 2 }}
      >
        {nearbyPlaces.slice(0, 6).map((place) => {
          const catColor = PLACE_COLORS[place.category] || colors.mutedForeground
          const catLabel = t(PLACE_LABEL_KEYS[place.category] || 'common.other') || place.category
          const firstLetter = catLabel.charAt(0).toUpperCase()
          return (
            <Pressable
              key={place.id}
              onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`).catch(() => {})}
              style={styles.placeCompact}
            >
              <View style={[styles.placeCircle, { backgroundColor: `${catColor}26` }]}>
                <Text style={[styles.placeCircleText, { color: catColor }]}>{firstLetter}</Text>
              </View>
              <Text style={[styles.placeCompactName, { color: colors.foreground }]} numberOfLines={2}>
                {place.name}
              </Text>
              <Text style={[styles.placeCategoryLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                {catLabel}
              </Text>
            </Pressable>
          )
        })}
        {nearbyPlaces.length > 6 && (
          <Pressable onPress={() => router.push('/map')} style={styles.placeCompact}>
            <View style={[styles.placeCircle, { backgroundColor: colors.muted }]}>
              <Text style={[styles.placeCircleText, { color: colors.mutedForeground }]}>+{nearbyPlaces.length - 6}</Text>
            </View>
            <Text style={[styles.placeCompactName, { color: colors.foreground }]} numberOfLines={1}>
              {t('feed.showAll')}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  )
})

const styles = StyleSheet.create({
  // ── Section header ──
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  sectionBar: { width: 3, height: 16, borderRadius: 1.5 },
  sectionTitle: { fontSize: 16, fontFamily: fonts.headingSemi, letterSpacing: -0.16, flex: 1 },

  // ── Show All link ──
  showAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  showAllText: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi },

  // ── Nearby Place Card ──
  placeCompact: {
    width: 72, alignItems: 'center', gap: 8,
  },
  placeCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  placeCircleText: { fontSize: 20, fontWeight: '700', fontFamily: fonts.heading },
  placeCompactName: { fontSize: 11, fontFamily: fonts.body, textAlign: 'center', lineHeight: 14 },
  placeCategoryLabel: { fontSize: 11, fontFamily: fonts.body, textAlign: 'center', lineHeight: 12 },
})
