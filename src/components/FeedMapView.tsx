/**
 * FeedMapView — Inline map showing feed posts with color-coded pins.
 *
 * Used in feed screen when user toggles to map view.
 * Lightweight — no events, places, or bottom sheet. Just posts on a map.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, Dimensions, Pressable } from 'react-native'
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from 'react-native-maps'
import ClusteredMapView from 'react-native-map-clustering'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { MapPin, X, Home } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { CATEGORIES } from '@/lib/constants'
import type { PostType } from '@/lib/types'
import { formatPrice, formatTimeAgo } from '@/lib/format'
import { getImageUrl } from '@/lib/imageUtils'
import { DARK_MAP_STYLE } from '@/components/map/useMapData'
import { PressableOpacity } from '@/components/ui'
import { useSupabase } from '@/hooks/useSupabase'
import type { Post } from '@/lib/types'

interface Building {
  id: string
  street_address: string
  lat: number
  lng: number
  member_count: number
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')

// Helsinki center fallback
const HELSINKI_CENTER = { latitude: 60.1699, longitude: 24.9384, latitudeDelta: 0.05, longitudeDelta: 0.05 }

// Category pin colors
const PIN_COLORS: Record<string, string> = {
  tarvitsen: '#C75B3A',
  tarjoan: '#7C5CBF',
  ilmaista: '#3B7DD8',
  nappaa: '#E8A050',
  lainaa: '#C98B2E',
  tapahtuma: '#2B8A62',
}

interface FeedMapViewProps {
  posts: Post[]
  userLocation?: { latitude: number; longitude: number } | null
  activeFilter?: string | null
}

export function FeedMapView({ posts, userLocation, activeFilter }: FeedMapViewProps) {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()
  const supabase = useSupabase()
  const mapRef = useRef<MapView | null>(null)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [buildings, setBuildings] = useState<Building[]>([])

  // Fetch nearby buildings with members
  useEffect(() => {
    Promise.resolve(
      supabase
        .from('buildings')
        .select('id, street_address, lat, lng, member_count')
        .gt('member_count', 0)
        .not('lat', 'is', null)
        .limit(100)
    ).then(({ data }) => {
      if (data) setBuildings(data as Building[])
    }).catch(() => {})
  }, [supabase])

  // Filter posts with valid coordinates
  const mappablePosts = useMemo(() =>
    posts.filter(p => {
      const lat = (p as any).latitude
      const lng = (p as any).longitude
      return lat && lng && lat > 59 && lat < 61 && lng > 24 && lng < 26
    }),
  [posts])

  const initialRegion = useMemo(() => {
    if (userLocation) {
      return { ...userLocation, latitudeDelta: 0.03, longitudeDelta: 0.03 }
    }
    if (mappablePosts.length > 0) {
      const first = mappablePosts[0]
      return { latitude: (first as any).latitude, longitude: (first as any).longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    }
    return HELSINKI_CENTER
  }, [userLocation, mappablePosts])

  const handleMarkerPress = useCallback((post: Post) => {
    try { Haptics.selectionAsync() } catch {}
    setSelectedPost(post)
  }, [])

  const handleBuildingPress = useCallback((b: Building) => {
    try { Haptics.selectionAsync() } catch {}
    router.push(`/community-events` as any)
  }, [router])

  const handleCardPress = useCallback(() => {
    if (selectedPost) {
      router.push(`/post/${selectedPost.id}`)
    }
  }, [selectedPost, router])

  return (
    <View style={styles.container}>
      <ClusteredMapView
        ref={mapRef as any}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        showsUserLocation={!!userLocation}
        showsMyLocationButton={false}
        customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
        onPress={() => setSelectedPost(null)}
        clusterColor={colors.primary}
        clusterTextColor="#fff"
        clusterFontFamily={fonts.bodySemi}
        radius={50}
        minZoomLevel={0}
        maxZoom={15}
        spiralEnabled={false}
      >
        {mappablePosts.map(post => (
          <Marker
            key={post.id}
            coordinate={{ latitude: (post as any).latitude, longitude: (post as any).longitude }}
            onPress={() => handleMarkerPress(post)}
            tracksViewChanges={false}
          >
            <View
              style={[styles.pin, { backgroundColor: PIN_COLORS[post.type] ?? colors.foreground }]}
              accessibilityLabel={`${CATEGORIES[post.type as PostType]?.label ?? post.type}: ${post.title}`}
              accessibilityRole="button"
            >
              <MapPin size={12} color="#fff" fill="#fff" />
            </View>
          </Marker>
        ))}
        {buildings.map(b => (
          <Marker
            key={`bldg-${b.id}`}
            coordinate={{ latitude: b.lat, longitude: b.lng }}
            tracksViewChanges={false}
            zIndex={-1}
            onPress={() => handleBuildingPress(b)}
          >
            <View
              style={[styles.buildingPin, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityLabel={`${b.street_address}, ${b.member_count} ${t('common.members') ?? 'members'}`}
              accessibilityRole="button"
            >
              <Home size={10} color={colors.foreground} />
              {b.member_count > 1 && (
                <Text style={[styles.buildingCount, { color: colors.foreground }]}>
                  {b.member_count}
                </Text>
              )}
            </View>
          </Marker>
        ))}
      </ClusteredMapView>

      {/* Post preview card */}
      {selectedPost && (
        <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={handleCardPress} style={styles.previewContent}>
            {selectedPost.image_url && (
              <Image
                source={{ uri: getImageUrl(selectedPost.image_url, 'thumbnail')! }}
                style={styles.previewImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            )}
            <View style={styles.previewText}>
              <View style={styles.previewCategoryRow}>
                <View style={[styles.previewCategoryDot, { backgroundColor: PIN_COLORS[selectedPost.type] ?? colors.foreground }]} />
                <Text style={[styles.previewCategory, { color: colors.mutedForeground }]}>
                  {t(CATEGORIES[selectedPost.type as PostType]?.label ?? '')}
                </Text>
              </View>
              <Text style={[styles.previewTitle, { color: colors.foreground }]} numberOfLines={2}>
                {selectedPost.title}
              </Text>
              <Text style={[styles.previewMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                {selectedPost.location ?? ''}{selectedPost.created_at ? ` · ${formatTimeAgo(selectedPost.created_at, t, locale)}` : ''}
                {selectedPost.service_price != null && selectedPost.service_price > 0 ? ` · ${formatPrice(selectedPost.service_price, locale)}` : ''}
              </Text>
            </View>
          </Pressable>
          <PressableOpacity
            onPress={() => setSelectedPost(null)}
            hitSlop={8}
            style={styles.previewClose}
            accessibilityLabel={t('common.close')}
          >
            <X size={16} color={colors.mutedForeground} />
          </PressableOpacity>
        </View>
      )}

      {/* Count badge */}
      <View style={[styles.countBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.countText, { color: colors.foreground }]}>
          {mappablePosts.length} {t('feed.postsOnMap')}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  pin: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  previewCard: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    borderRadius: 20, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  previewContent: { flexDirection: 'row', padding: 12, gap: 12 },
  previewImage: { width: 64, height: 64, borderRadius: 12 },
  previewText: { flex: 1, gap: 2 },
  previewCategoryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewCategoryDot: { width: 8, height: 8, borderRadius: 4 },
  previewCategory: { fontSize: 11, fontFamily: fonts.bodySemi, textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 14 },
  previewTitle: { fontSize: 15, fontFamily: fonts.heading, lineHeight: 20 },
  previewMeta: { fontSize: 12, fontFamily: fonts.body, lineHeight: 16 },
  previewClose: { position: 'absolute', top: 8, right: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  countBadge: {
    position: 'absolute', top: 12, alignSelf: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
  },
  countText: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 16 },
  buildingPin: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10,
    borderWidth: 1, opacity: 0.85,
  },
  buildingCount: { fontSize: 10, fontFamily: fonts.bodySemi, lineHeight: 12 },
})
