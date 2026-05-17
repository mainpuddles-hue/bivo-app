/**
 * FeedMapView — Map with color-coded category markers, 10km radius circle,
 * and a bottom preview card for selected items.
 *
 * Uses onMarkerSelect (iOS native annotation event) for reliable tap handling
 * combined with custom View markers for visual distinction.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import MapView, { Marker, Circle, Callout, PROVIDER_DEFAULT } from 'react-native-maps'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Heart, Wrench, Gift, HandHelping, BookOpen, Calendar, X, MapPin } from 'lucide-react-native'
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

// Category colors
const PIN_COLORS: Record<string, string> = {
  tarvitsen: '#C75B3A',
  tarjoan: '#7C5CBF',
  ilmaista: '#3B7DD8',
  nappaa: '#D48B30',
  lainaa: '#B07A20',
  tapahtuma: '#2B8A62',
}

const EVENT_COLOR = '#2B8A62'

// Map from post type to i18n key for pin labels
const PIN_LABEL_KEYS: Record<string, string> = {
  tarvitsen: 'feed.pinTarvitsen',
  tarjoan: 'feed.pinTarjoan',
  ilmaista: 'feed.pinIlmaista',
  nappaa: 'feed.pinNappaa',
  lainaa: 'feed.pinLainaa',
}

/** Pin icon by category */
function PinIcon({ type }: { type: string }) {
  const props = { size: 13, color: '#fff', strokeWidth: 2.5 }
  switch (type) {
    case 'tarvitsen': return <Wrench {...props} />
    case 'tarjoan': return <HandHelping {...props} />
    case 'ilmaista': return <Heart {...props} />
    case 'lainaa': return <BookOpen {...props} />
    default: return <Gift {...props} />
  }
}

function deterministicOffset(id: string): { dLat: number; dLng: number } {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  const angle = ((hash & 0xffff) / 0xffff) * Math.PI * 2
  // Tight spread ~200-400m so pins stay in the correct neighborhood
  const radius = 0.002 + ((hash >>> 16) & 0xfff) / 0xfff * 0.002
  return {
    dLat: Math.sin(angle) * radius,
    dLng: Math.cos(angle) * radius * 1.8,
  }
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
  const insets = useSafeAreaInsets()
  const mapRef = useRef<MapView | null>(null)
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const deselectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasMounted = useRef(false)

  // Clear stale selection when filter changes
  useEffect(() => {
    setSelected(null)
  }, [activeFilter])

  // Cleanup deselect timer on unmount
  useEffect(() => {
    return () => {
      if (deselectTimer.current) clearTimeout(deselectTimer.current)
    }
  }, [])

  // Center on user or Helsinki
  const center = useMemo(() => {
    if (userLocation && userLocation.latitude >= 59 && userLocation.latitude <= 71
        && userLocation.longitude >= 19 && userLocation.longitude <= 32) {
      return userLocation
    }
    return null
  }, [userLocation])

  const centerLat = center?.latitude ?? HELSINKI_CENTER.latitude
  const centerLng = center?.longitude ?? HELSINKI_CENTER.longitude

  // Apply activeFilter to posts
  const filteredPosts = useMemo(() => {
    if (!activeFilter) return posts
    return posts.filter(p => p.type === activeFilter)
  }, [posts, activeFilter])

  const mappablePosts = useMemo(() => {
    return filteredPosts.map((p): MappablePost => {
      if (p.latitude != null && p.longitude != null && p.latitude !== 0 && p.longitude !== 0) {
        // Micro-jitter (~30m) so pins at exact same address don't stack perfectly
        const jitter = deterministicOffset(p.id)
        return {
          post: p,
          latitude: p.latitude + jitter.dLat * 0.1,
          longitude: p.longitude + jitter.dLng * 0.1,
          approximate: false,
        }
      }
      const offset = deterministicOffset(p.id)
      return {
        post: p,
        latitude: centerLat + offset.dLat,
        longitude: centerLng + offset.dLng,
        approximate: true,
      }
    })
  }, [filteredPosts, centerLat, centerLng])

  // Only show events when no category filter or tapahtuma filter
  const mappableEvents = useMemo(() => {
    if (activeFilter && activeFilter !== 'tapahtuma') return []
    return cityEvents.filter(e =>
      e.latitude != null && e.longitude != null &&
      e.latitude !== 0 && e.longitude !== 0
    )
  }, [cityEvents, activeFilter])

  const initialRegion = useMemo(() => {
    if (center) {
      return { ...center, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    }
    return HELSINKI_CENTER
  }, [center])

  // Lookup maps for onMarkerSelect
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

  // iOS native annotation selection — reliable even with custom views
  // Cancel any pending deselect when a new marker is selected (prevents flash)
  const handleMarkerSelect = useCallback((e: any) => {
    if (deselectTimer.current) {
      clearTimeout(deselectTimer.current)
      deselectTimer.current = null
    }
    const id = e?.nativeEvent?.id ?? e?.nativeEvent?.identifier
    if (!id) return
    try { Haptics.selectionAsync() } catch {}
    const post = postMap.get(id)
    if (post) { setSelected({ kind: 'post', data: post }); return }
    const event = eventMap.get(id)
    if (event) { setSelected({ kind: 'event', data: event }) }
  }, [postMap, eventMap])

  // Debounced deselect — iOS fires deselect before select when switching markers
  const handleMarkerDeselect = useCallback(() => {
    deselectTimer.current = setTimeout(() => {
      setSelected(null)
      deselectTimer.current = null
    }, 100)
  }, [])

  const handleCardPress = useCallback(() => {
    if (!selected) return
    if (selected.kind === 'post') {
      router.push(`/post/${selected.data.id}`)
    } else {
      router.push(`/event/${selected.data.id}` as any)
    }
  }, [selected, router])

  // Zoom to fit all markers — skip initial mount (uses initialRegion), run on filter changes
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }
    if (!mapRef.current) return
    const coords: { latitude: number; longitude: number }[] = []
    mappablePosts.forEach(mp => coords.push({ latitude: mp.latitude, longitude: mp.longitude }))
    mappableEvents.forEach(e => coords.push({ latitude: e.latitude!, longitude: e.longitude! }))
    if (coords.length === 0) return
    const timer = setTimeout(() => {
      if (coords.length === 1) {
        mapRef.current?.animateToRegion({
          ...coords[0],
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }, 300)
      } else {
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 60, right: 40, bottom: 180, left: 40 },
          animated: true,
        })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [mappablePosts, mappableEvents])

  const totalCount = mappablePosts.length + mappableEvents.length
  // Bottom offset for preview card — above tab bar
  const previewBottom = insets.bottom + 56

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={s.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
        onPress={() => setSelected(null)}
        onMarkerSelect={handleMarkerSelect}
        onMarkerDeselect={handleMarkerDeselect}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
      >
        {/* 10km radius circle — always show around center point */}
        <Circle
          center={{ latitude: centerLat, longitude: centerLng }}
          radius={FEED_RADIUS_M}
          strokeColor={isDark ? 'rgba(111,207,151,0.4)' : 'rgba(45,107,94,0.35)'}
          fillColor={isDark ? 'rgba(111,207,151,0.08)' : 'rgba(45,107,94,0.06)'}
          strokeWidth={2}
        />

        {/* Post markers — custom colored pins */}
        {mappablePosts.map(mp => {
          const color = PIN_COLORS[mp.post.type] ?? '#888'
          const labelKey = PIN_LABEL_KEYS[mp.post.type]
          const label = labelKey ? t(labelKey) : ''
          return (
            <Marker
              key={`p-${mp.post.id}`}
              identifier={`p-${mp.post.id}`}
              coordinate={{ latitude: mp.latitude, longitude: mp.longitude }}
              tracksViewChanges={false}
              opacity={mp.approximate ? 0.65 : 1}
            >
              <View style={s.markerWrap} pointerEvents="none">
                <View style={[s.markerBubble, { backgroundColor: color }]}>
                  <PinIcon type={mp.post.type} />
                  <Text style={s.markerLabel}>{label}</Text>
                </View>
                <View style={[s.markerArrow, { borderTopColor: color }]} />
              </View>
              <Callout tooltip>
                <View style={s.noCallout} />
              </Callout>
            </Marker>
          )
        })}

        {/* Event markers */}
        {mappableEvents.map(event => (
          <Marker
            key={`e-${event.id}`}
            identifier={`e-${event.id}`}
            coordinate={{ latitude: event.latitude!, longitude: event.longitude! }}
            tracksViewChanges={false}
          >
            <View style={s.markerWrap} pointerEvents="none">
              <View style={[s.markerBubble, { backgroundColor: EVENT_COLOR }]}>
                <Calendar size={13} color="#fff" strokeWidth={2.5} />
                <Text style={s.markerLabel}>{t('feed.pinTapahtuma')}</Text>
              </View>
              <View style={[s.markerArrow, { borderTopColor: EVENT_COLOR }]} />
            </View>
            <Callout tooltip>
              <View style={s.noCallout} />
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Count badge */}
      <View style={[s.badge, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <MapPin size={12} color={colors.foreground} />
        <Text style={[s.badgeText, { color: colors.foreground }]}>
          {totalCount} {t('feed.postsOnMap')}
        </Text>
      </View>

      {/* Preview card when marker selected */}
      {selected && (
        <View style={[s.preview, { backgroundColor: colors.card, borderColor: colors.border, bottom: previewBottom }]}>
          <PressableOpacity onPress={handleCardPress} style={s.previewInner} accessibilityRole="button" accessibilityLabel={selected.kind === 'post' ? selected.data.title : selected.data.name_fi}>
            {selected.kind === 'post' && selected.data.image_url && (
              <Image
                source={{ uri: getImageUrl(selected.data.image_url, 'thumbnail')! }}
                style={s.previewImg}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            )}
            {selected.kind === 'event' && selected.data.image_url && (
              <Image
                source={{ uri: selected.data.image_url }}
                style={s.previewImg}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            )}
            <View style={s.previewBody}>
              <View style={s.previewCatRow}>
                <View style={[s.previewDot, {
                  backgroundColor: selected.kind === 'post'
                    ? (PIN_COLORS[selected.data.type] ?? colors.foreground)
                    : EVENT_COLOR,
                }]} />
                <Text style={[s.previewCat, { color: colors.mutedForeground }]}>
                  {selected.kind === 'post'
                    ? t(CATEGORIES[selected.data.type as PostType]?.label ?? '')
                    : t('common.event')}
                </Text>
              </View>
              <Text style={[s.previewTitle, { color: colors.foreground }]} numberOfLines={2}>
                {selected.kind === 'post' ? selected.data.title : selected.data.name_fi}
              </Text>
              <Text style={[s.previewMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                {selected.kind === 'post'
                  ? `${selected.data.location ?? ''}${selected.data.created_at ? ` · ${formatTimeAgo(selected.data.created_at, t, locale)}` : ''}${selected.data.service_price != null && selected.data.service_price > 0 ? ` · ${formatPrice(selected.data.service_price, locale)}` : ''}`
                  : `${selected.data.location_name ?? ''}${selected.data.start_time ? ` · ${new Date(selected.data.start_time).toLocaleDateString(locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-US', { day: 'numeric', month: 'short' })}` : ''}`}
              </Text>
              <Text style={[s.previewCta, { color: colors.primary }]}>
                {t('feed.tapToOpen')}
              </Text>
            </View>
          </PressableOpacity>
          <PressableOpacity
            onPress={() => setSelected(null)}
            hitSlop={8}
            style={s.previewX}
            accessibilityLabel={t('common.close')}
          >
            <X size={16} color={colors.mutedForeground} />
          </PressableOpacity>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  // Marker bubble with arrow
  markerWrap: { alignItems: 'center' },
  markerBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  markerLabel: {
    color: '#fff',
    fontSize: 11,
    fontFamily: fonts.bodySemi,
    fontWeight: '700',
    letterSpacing: 0.88,
  },
  markerArrow: {
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 6,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    marginTop: -1,
  },
  noCallout: { width: 0, height: 0 },
  // Count badge
  badge: {
    position: 'absolute', top: 12, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 16 },
  // Preview card
  preview: {
    position: 'absolute', left: 22, right: 22,
    borderRadius: 18, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  previewInner: { flexDirection: 'row', padding: 12, gap: 12 },
  previewImg: { width: 72, height: 72, borderRadius: 14 },
  previewBody: { flex: 1, gap: 2 },
  previewCatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewDot: { width: 8, height: 8, borderRadius: 4 },
  previewCat: { fontSize: 11, fontFamily: fonts.bodySemi, textTransform: 'uppercase', letterSpacing: 0.88, lineHeight: 14 },
  previewTitle: { fontSize: 16, fontFamily: fonts.heading, lineHeight: 21 },
  previewMeta: { fontSize: 12, fontFamily: fonts.body, lineHeight: 16 },
  previewCta: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 18, marginTop: 2 },
  previewX: { position: 'absolute', top: 8, right: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
})
