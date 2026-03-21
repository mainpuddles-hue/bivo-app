import { memo, useRef, useEffect, useCallback, useMemo } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, Animated, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { CalendarDays, MapPin, ChevronRight, Globe } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { formatEventDateShort } from '@/lib/format'
import type { CityEvent, LocalPlace } from '@/lib/types'

// ── Category color maps ──
const CITY_EVENT_COLORS: Record<string, string> = {
  culture: '#8E44AD', music: '#E91E63', sport: '#27AE60', family: '#FF9800',
  food: '#E74C3C', nature: '#4CAF50', education: '#2196F3', theatre: '#9C27B0',
  exhibition: '#795548', festival: '#FF5722', market: '#FF9800', other: '#607D8B',
}

const PLACE_COLORS: Record<string, string> = {
  restaurant: '#E74C3C', cafe: '#8B5E3C', bar: '#F39C12', pub: '#D4A017',
  fast_food: '#FF6B35', shop: '#9B59B6', library: '#3498DB', health: '#E91E63',
  sport: '#27AE60', culture: '#8E44AD', hotel: '#2980B9', attraction: '#F1C40F',
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
  const shimmer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [shimmer])
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] })
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 4 }}>
      {[0, 1, 2].map(i => (
        <Animated.View key={i} style={{ width, height, borderRadius: 12, backgroundColor: colors.muted, opacity }} />
      ))}
    </ScrollView>
  )
}

export interface DiscoverySectionProps {
  cityEvents: CityEvent[]
  nearbyPlaces: LocalPlace[]
  extraLoading: boolean
  discoveryTab: 'events' | 'places'
  setDiscoveryTab: (tab: 'events' | 'places') => void
  placesSectionTitle: string
}

export const DiscoverySection = memo(function DiscoverySection({
  cityEvents,
  nearbyPlaces,
  extraLoading,
  discoveryTab,
  setDiscoveryTab,
  placesSectionTitle,
}: DiscoverySectionProps) {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()

  // Filter out past events — only show future ones in the carousel
  const futureEvents = useMemo(() => {
    const now = new Date().toISOString()
    return cityEvents.filter(e => e.start_time >= now)
  }, [cityEvents])

  const getCityEventName = useCallback((e: CityEvent) => {
    if (locale === 'en' && e.name_en) return e.name_en
    if (locale === 'sv' && e.name_sv) return e.name_sv
    return e.name_fi
  }, [locale])

  // Loading state
  if (extraLoading && futureEvents.length === 0 && nearbyPlaces.length === 0) {
    return (
      <View style={{ gap: 10 }}>
        <View style={[styles.sectionHeader, { paddingHorizontal: 4 }]}>
          <View style={[styles.sectionBar, { backgroundColor: '#3B7DD8' }]} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('nav.events')}</Text>
        </View>
        <HorizontalSkeleton colors={colors} width={160} height={140} />
      </View>
    )
  }

  // Nothing to show
  if (futureEvents.length === 0 && nearbyPlaces.length === 0) {
    return null
  }

  return (
    <View style={{ gap: 10 }}>
      {/* Tab chips row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
        <Pressable
          onPress={() => setDiscoveryTab('events')}
          style={[
            styles.discoveryChip,
            discoveryTab === 'events'
              ? { backgroundColor: colors.primary }
              : { backgroundColor: isDark ? colors.card : colors.muted },
          ]}
        >
          <CalendarDays size={13} color={discoveryTab === 'events' ? colors.primaryForeground : colors.mutedForeground} />
          <Text style={[
            styles.discoveryChipText,
            { color: discoveryTab === 'events' ? colors.primaryForeground : colors.mutedForeground },
          ]}>
            {t('nav.events')}
          </Text>
          {futureEvents.length > 0 && discoveryTab === 'events' && (
            <View style={[styles.discoveryChipCount, { backgroundColor: `${colors.primaryForeground}30` }]}>
              <Text style={[styles.discoveryChipCountText, { color: colors.primaryForeground }]}>{futureEvents.length}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => setDiscoveryTab('places')}
          style={[
            styles.discoveryChip,
            discoveryTab === 'places'
              ? { backgroundColor: colors.primary }
              : { backgroundColor: isDark ? colors.card : colors.muted },
          ]}
        >
          <MapPin size={13} color={discoveryTab === 'places' ? colors.primaryForeground : colors.mutedForeground} />
          <Text style={[
            styles.discoveryChipText,
            { color: discoveryTab === 'places' ? colors.primaryForeground : colors.mutedForeground },
          ]}>
            {t('places.places') || t('feed.placesNearYou')}
          </Text>
          {nearbyPlaces.length > 0 && discoveryTab === 'places' && (
            <View style={[styles.discoveryChipCount, { backgroundColor: `${colors.primaryForeground}30` }]}>
              <Text style={[styles.discoveryChipCountText, { color: colors.primaryForeground }]}>{nearbyPlaces.length}</Text>
            </View>
          )}
        </Pressable>
        {/* Show All link */}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => discoveryTab === 'events' ? router.push('/(tabs)/events') : router.push('/map')}
          hitSlop={8}
          style={styles.showAllBtn}
        >
          <Text style={[styles.showAllText, { color: colors.primary }]}>
            {discoveryTab === 'events' ? t('events.cityTab') : (t('nav.map') || 'Kartta')}
          </Text>
          <ChevronRight size={14} color={colors.primary} />
        </Pressable>
      </View>

      {/* Events carousel */}
      {discoveryTab === 'events' && futureEvents.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={172}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 4, paddingBottom: 4 }}
        >
          {futureEvents.map((event) => {
            const catColor = CITY_EVENT_COLORS[event.category] || '#607D8B'
            return (
              <Pressable
                key={event.id}
                onPress={() => event.info_url ? Linking.openURL(event.info_url) : router.push('/(tabs)/events')}
                style={[styles.eventCard, { backgroundColor: colors.card }]}
              >
                <View style={[styles.eventAccent, { backgroundColor: catColor }]} />
                {event.image_url ? (
                  <Image source={{ uri: event.image_url }} style={styles.eventImage} contentFit="cover" />
                ) : (
                  <View style={[styles.eventImageFallback, { backgroundColor: `${catColor}20` }]}>
                    <Globe size={20} color={catColor} />
                  </View>
                )}
                <View style={styles.eventInfo}>
                  <Text style={[styles.eventName, { color: colors.foreground }]} numberOfLines={2}>
                    {getCityEventName(event)}
                  </Text>
                  <View style={styles.eventMeta}>
                    <CalendarDays size={10} color={colors.mutedForeground} />
                    <Text style={[styles.eventDate, { color: colors.primary }]}>
                      {formatEventDateShort(event.start_time, locale)}
                    </Text>
                  </View>
                  {event.location_name && (
                    <View style={styles.eventMeta}>
                      <MapPin size={10} color={colors.mutedForeground} />
                      <Text style={[styles.eventLocation, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {event.location_name}
                      </Text>
                    </View>
                  )}
                  {event.is_free && (
                    <View style={[styles.freeBadge, { backgroundColor: `${colors.success}20` }]}>
                      <Text style={[styles.freeText, { color: colors.success }]}>{t('events.free')}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.eventChevron}>
                  <ChevronRight size={12} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
                </View>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      {/* Events empty state */}
      {discoveryTab === 'events' && futureEvents.length === 0 && (
        <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.body, paddingHorizontal: 4 }}>
          {t('events.noEvents')}
        </Text>
      )}

      {/* Places carousel */}
      {discoveryTab === 'places' && nearbyPlaces.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 14, paddingHorizontal: 4, paddingBottom: 2 }}
        >
          {nearbyPlaces.slice(0, 6).map((place) => {
            const catColor = PLACE_COLORS[place.category] || '#95A5A6'
            const catLabel = t(PLACE_LABEL_KEYS[place.category] || 'common.other') || place.category
            const firstLetter = catLabel.charAt(0).toUpperCase()
            return (
              <Pressable
                key={place.id}
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`)}
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
              <Text style={[styles.placeCompactName, { color: colors.primary }]} numberOfLines={1}>
                {t('feed.showAll')}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      )}

      {/* Places empty state */}
      {discoveryTab === 'places' && nearbyPlaces.length === 0 && (
        <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: fonts.body, paddingHorizontal: 4 }}>
          {placesSectionTitle}
        </Text>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  // ── Section header (for loading state) ──
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  sectionBar: { width: 3, height: 16, borderRadius: 1.5 },
  sectionTitle: { fontSize: 16, fontFamily: fonts.headingSemi, letterSpacing: -0.16, flex: 1 },

  // ── Show All link ──
  showAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
  },
  showAllText: { fontSize: 13, fontWeight: '600' },

  // ── Discovery tab chips ──
  discoveryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
  },
  discoveryChipText: { fontSize: 13, fontWeight: '600' },
  discoveryChipCount: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, marginLeft: 2,
  },
  discoveryChipCountText: { fontSize: 10, fontWeight: '700' },

  // ── City Event Card ──
  eventCard: {
    width: 160, borderRadius: 10, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  eventAccent: { height: 2 },
  eventImage: { width: '100%', height: 80 },
  eventImageFallback: {
    width: '100%', height: 80,
    alignItems: 'center', justifyContent: 'center',
  },
  eventInfo: { padding: 8, gap: 2 },
  eventName: { fontSize: 12, fontFamily: fonts.headingSemi, lineHeight: 15, letterSpacing: -0.16 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventDate: { fontSize: 11, fontFamily: fonts.body },
  eventLocation: { fontSize: 11, fontFamily: fonts.body, flex: 1 },
  freeBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
    alignSelf: 'flex-start', marginTop: 2,
  },
  freeText: { fontSize: 10, fontWeight: '600' },
  eventChevron: { position: 'absolute', bottom: 6, right: 6 },

  // ── Nearby Place Card ──
  placeCompact: {
    width: 72, alignItems: 'center', gap: 6,
  },
  placeCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  placeCircleText: { fontSize: 20, fontWeight: '700' },
  placeCompactName: { fontSize: 11, fontFamily: fonts.body, textAlign: 'center', lineHeight: 14 },
  placeCategoryLabel: { fontSize: 9, fontFamily: fonts.body, textAlign: 'center', lineHeight: 12 },
})
