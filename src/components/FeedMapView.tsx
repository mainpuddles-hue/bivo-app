/**
 * FeedMapView — Map showing feed posts and city events with native pins.
 *
 * Uses native iOS/Android map markers (pinColor) instead of custom views
 * for reliable tap handling. Shows a 10km radius circle and a preview
 * card at the bottom when a marker is selected.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import MapView, { Marker, Circle, Callout, PROVIDER_DEFAULT } from 'react-native-maps'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { X } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { CATEGORIES } from '@/lib/constants'
import type { PostType, CityEvent } from '@/lib/types'
import { formatPrice, formatTimeAgo } from '@/lib/format'
import { getImageUrl } from '@/lib/imageUtils'
import { DARK_MAP_STYLE } from '@/components/map/useMapData'
import { PressableOpacity } from '@/components/ui'
import type { Post } from '@/lib/types'

// Helsinki center fallback
const HELSINKI_CENTER = { latitude: 60.1699, longitude: 24.9384, latitudeDelta: 0.06, longitudeDelta: 0.06 }

const FEED_RADIUS_KM = 10
const FEED_RADIUS_M = FEED_RADIUS_KM * 1000

// Category pin colors (native iOS/Android marker colors)
const PIN_COLORS: Record<string, string> = {
  tarvitsen: '#C75B3A',
  tarjoan: '#7C5CBF',
  ilmaista: '#3B7DD8',
  nappaa: '#D48B30',
  lainaa: '#B07A20',
  tapahtuma: '#2B8A62',
}

const EVENT_PIN_COLOR = '#2B8A62'

/** Check if coordinates are within Finland */
function isInFinland(lat: number, lng: number): boolean {
  return lat >= 59 && lat <= 71 && lng >= 19 && lng <= 32
}

/**
 * Generate a deterministic offset from a string ID.
 * Same ID always produces the same position, spread ~0.5-2km from center.
 */
function deterministicOffset(id: string): { dLat: number; dLng: number } {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  const angle = ((hash & 0xffff) / 0xffff) * Math.PI * 2
  const radius = 0.005 + ((hash >>> 16) & 0xfff) / 0xfff * 0.012
  return {
    dLat: Math.sin(angle) * radius,
    dLng: Math.cos(angle) * radius * 1.8,
  }
}

// Short Finnish category labels for marker titles
const CATEGORY_LABELS: Record<string, string> = {
  tarvitsen: 'Tarvitsen',
  tarjoan: 'Tarjoan',
  ilmaista: 'Ilmaista',
  nappaa: 'Nappaa',
  lainaa: 'Lainaa',
  tapahtuma: 'Tapahtuma',
}

interface MappablePost {
  post: Post
  latitude: number
  longitude: number
  approximate: boolean
}

type SelectedItem =
  | { kind: 'post'; data: Post }
  | { kind: 'event'; data: CityEvent }

interface FeedMapViewProps {
  posts: Post[]
  cityEvents?: CityEvent[]
  userLocation?: { latitude: number; longitude: number } | null
  activeFilter?: string | null
}

export function FeedMapView({ posts, cityEvents = [], userLocation, activeFilter }: FeedMapViewProps) {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()
  const mapRef = useRef<MapView | null>(null)
  const [selected, setSelected] = useState<SelectedItem | null>(null)

  // Valid user location within Finland
  const validLocation = useMemo(() => {
    if (userLocation && isInFinland(userLocation.latitude, userLocation.longitude)) {
      return userLocation
    }
    return null
  }, [userLocation])

  const centerLat = validLocation?.latitude ?? HELSINKI_CENTER.latitude
  const centerLng = validLocation?.longitude ?? HELSINKI_CENTER.longitude

  // ALL posts get mapped — those without coordinates get placed near user
  const mappablePosts = useMemo(() => {
    return posts.map((p): MappablePost => {
      if (p.latitude != null && p.longitude != null && p.latitude !== 0 && p.longitude !== 0) {
        return { post: p, latitude: p.latitude, longitude: p.longitude, approximate: false }
      }
      const offset = deterministicOffset(p.id)
      return {
        post: p,
        latitude: centerLat + offset.dLat,
        longitude: centerLng + offset.dLng,
        approximate: true,
      }
    })
  }, [posts, centerLat, centerLng])

  // Filter events with valid coordinates
  const mappableEvents = useMemo(() =>
    cityEvents.filter(e =>
      e.latitude != null && e.longitude != null &&
      e.latitude !== 0 && e.longitude !== 0
    ),
  [cityEvents])

  const initialRegion = useMemo(() => {
    if (validLocation) {
      return { ...validLocation, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    }
    return HELSINKI_CENTER
  }, [validLocation])

  // Build lookup maps for identifier-based selection
  const postMap = useMemo(() => {
    const map = new Map<string, Post>()
    mappablePosts.forEach(mp => map.set(`p-${mp.post.id}`, mp.post))
    return map
  }, [mappablePosts])

  const eventMap = useMemo(() => {
    const map = new Map<string, CityEvent>()
    mappableEvents.forEach(e => map.set(`e-${e.id}`, e))
    return map
  }, [mappableEvents])

  // Use onSelect (iOS native annotation selection) — most reliable on iOS
  const handleMarkerSelect = useCallback((e: any) => {
    const id = e?.nativeEvent?.id ?? e?.nativeEvent?.identifier
    if (!id) return
    try { Haptics.selectionAsync() } catch {}
    const post = postMap.get(id)
    if (post) { setSelected({ kind: 'post', data: post }); return }
    const event = eventMap.get(id)
    if (event) { setSelected({ kind: 'event', data: event }) }
  }, [postMap, eventMap])

  // Deselect on marker deselect (iOS native)
  const handleMarkerDeselect = useCallback(() => {
    setSelected(null)
  }, [])

  const handleCardPress = useCallback(() => {
    if (!selected) return
    if (selected.kind === 'post') {
      router.push(`/post/${selected.data.id}`)
    } else {
      router.push(`/event/${selected.data.id}` as any)
    }
  }, [selected, router])

  const totalCount = mappablePosts.length + mappableEvents.length

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        showsUserLocation={!!validLocation}
        showsMyLocationButton={false}
        customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
        onPress={() => setSelected(null)}
        onMarkerSelect={handleMarkerSelect}
        onMarkerDeselect={handleMarkerDeselect}
      >
        {/* 10km radius circle */}
        {validLocation && (
          <Circle
            center={validLocation}
            radius={FEED_RADIUS_M}
            strokeColor={isDark ? 'rgba(111,207,151,0.35)' : 'rgba(45,107,94,0.3)'}
            fillColor={isDark ? 'rgba(111,207,151,0.06)' : 'rgba(45,107,94,0.05)'}
            strokeWidth={1.5}
          />
        )}

        {/* Post markers — native pins with pinColor, no custom views */}
        {mappablePosts.map(mp => (
          <Marker
            key={`p-${mp.post.id}`}
            identifier={`p-${mp.post.id}`}
            coordinate={{ latitude: mp.latitude, longitude: mp.longitude }}
            pinColor={PIN_COLORS[mp.post.type] ?? colors.foreground}
            title={mp.post.title ?? ''}
            description={`${CATEGORY_LABELS[mp.post.type] ?? ''}${mp.post.location ? ` · ${mp.post.location}` : ''}`}
            opacity={mp.approximate ? 0.7 : 1}
          >
            <Callout tooltip>
              <View style={styles.calloutHidden} />
            </Callout>
          </Marker>
        ))}

        {/* Event markers — native pins */}
        {mappableEvents.map(event => (
          <Marker
            key={`e-${event.id}`}
            identifier={`e-${event.id}`}
            coordinate={{ latitude: event.latitude!, longitude: event.longitude! }}
            pinColor={EVENT_PIN_COLOR}
            title={event.name_fi ?? 'Tapahtuma'}
            description={event.location_name ?? ''}
          >
            <Callout tooltip>
              <View style={styles.calloutHidden} />
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Preview card — shown when a marker is selected */}
      {selected && (
        <View style={[styles.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable onPress={handleCardPress} style={styles.previewContent}>
            {selected.kind === 'post' && selected.data.image_url && (
              <Image
                source={{ uri: getImageUrl(selected.data.image_url, 'thumbnail')! }}
                style={styles.previewImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            )}
            {selected.kind === 'event' && selected.data.image_url && (
              <Image
                source={{ uri: selected.data.image_url }}
                style={styles.previewImage}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            )}
            <View style={styles.previewText}>
              <View style={styles.previewCategoryRow}>
                <View style={[styles.previewCategoryDot, {
                  backgroundColor: selected.kind === 'post'
                    ? (PIN_COLORS[selected.data.type] ?? colors.foreground)
                    : EVENT_PIN_COLOR,
                }]} />
                <Text style={[styles.previewCategory, { color: colors.mutedForeground }]}>
                  {selected.kind === 'post'
                    ? t(CATEGORIES[selected.data.type as PostType]?.label ?? '')
                    : (t('common.event') ?? 'Tapahtuma')}
                </Text>
              </View>
              <Text style={[styles.previewTitle, { color: colors.foreground }]} numberOfLines={2}>
                {selected.kind === 'post' ? selected.data.title : selected.data.name_fi}
              </Text>
              <Text style={[styles.previewMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                {selected.kind === 'post'
                  ? `${selected.data.location ?? ''}${selected.data.created_at ? ` · ${formatTimeAgo(selected.data.created_at, t, locale)}` : ''}${selected.data.service_price != null && selected.data.service_price > 0 ? ` · ${formatPrice(selected.data.service_price, locale)}` : ''}`
                  : `${selected.data.location_name ?? ''}${selected.data.start_time ? ` · ${new Date(selected.data.start_time).toLocaleDateString(locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-US', { day: 'numeric', month: 'short' })}` : ''}`}
              </Text>
              <Text style={[styles.previewTap, { color: colors.primary }]}>
                {t('feed.tapToOpen') ?? 'Avaa ilmoitus →'}
              </Text>
            </View>
          </Pressable>
          <PressableOpacity
            onPress={() => setSelected(null)}
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
          {totalCount} {t('feed.postsOnMap')}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  calloutHidden: { width: 0, height: 0 },
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
  previewCategory: { fontSize: 12, fontFamily: fonts.bodySemi, textTransform: 'uppercase', letterSpacing: 0.3, lineHeight: 16 },
  previewTitle: { fontSize: 15, fontFamily: fonts.heading, lineHeight: 20 },
  previewMeta: { fontSize: 12, fontFamily: fonts.body, lineHeight: 16 },
  previewTap: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 18, marginTop: 2 },
  previewClose: { position: 'absolute', top: 8, right: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  countBadge: {
    position: 'absolute', top: 12, alignSelf: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
  },
  countText: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 16 },
})
