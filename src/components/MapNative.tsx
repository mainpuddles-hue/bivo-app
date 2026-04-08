import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, Pressable, SectionList,
  StyleSheet, ActivityIndicator, RefreshControl, TextInput,
  type SectionListData,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps'
import * as Haptics from 'expo-haptics'
import {
  ChevronDown, ChevronUp, MapPin, Search, Crosshair, ArrowLeft, Plus, X, Building2,
} from 'lucide-react-native'
import { Image } from 'expo-image'
import { PressableOpacity } from '@/components/ui'
import { PinIllustration } from '@/components/illustrations'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { NEIGHBORHOODS } from '@/lib/constants'
import { FEATURES } from '@/lib/featureFlags'

import { useSupabase } from '@/hooks/useSupabase'
import { getImageUrl } from '@/lib/imageUtils'
import { isInCityBounds } from '@/lib/geo'
import { OutOfAreaBanner } from '@/components/OutOfAreaBanner'
import { clusterMarkers, isCluster, type Cluster } from '@/lib/mapClustering'
import type { ListItem, Section } from './map/types'
import { EventCard } from './map/EventCard'
import { PlaceRow } from './map/PlaceRow'
import { PostCard } from './map/PostCard'
import { MapFilters } from './map/MapFilters'
import { NeighborhoodModal } from './map/NeighborhoodModal'
import { DetailModal } from './map/DetailModal'
import {
  useMapData,
  NEIGHBORHOOD_CENTERS,
  DENSE_NEIGHBORHOODS,
  MAP_HEIGHT,
  DARK_MAP_STYLE,
} from './map/useMapData'

// ══════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════

export default function MapScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const mapRef = useRef<MapView | null>(null)
  const sectionListRef = useRef<SectionList<ListItem, Section> | null>(null)

  const {
    loading, refreshing, loadingMore, mapExpanded, setMapExpanded,
    showSearch, setShowSearch, searchQuery, setSearchQuery,
    selectedNeighborhood, neighborhoodModalVisible, setNeighborhoodModalVisible,
    activeFilter, setActiveFilter, subCategory, setSubCategory,
    timeFilter, setTimeFilter, selectedItem, setSelectedItem,
    neighborhoodLoading, showAllPlaces, setShowAllPlaces,
    userLocation, center, displayNeighborhood,
    filteredItems, sections, renderedMarkers, counts, subCounts,
    hasMore, totalEvents,
    dynamicNeighborhoods,
    handleFullRefresh, handleLoadMore, handleListItemNavigate,
    handleMarkerPress, handleGPSSelect, handleNeighborhoodSelect,
    handleCenterOnUser, openDirections,
  } = useMapData(t, locale)

  // ── Business markers ──
  const supabase = useSupabase()
  const [businesses, setBusinesses] = useState<any[]>([])
  const [showBusinesses, setShowBusinesses] = useState(true)
  const [selectedBusiness, setSelectedBusiness] = useState<any | null>(null)

  useEffect(() => {
    if (!FEATURES.BUSINESS_ACCOUNT) return
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, name, business_name, business_category, business_images, business_lat, business_lng, business_address, avatar_url')
          .eq('is_business', true)
          .not('business_lat', 'is', null)
          .not('business_lng', 'is', null)
        if (!cancelled && data) {
          setBusinesses(data)
        }
      } catch {
        // Silently ignore — businesses are a non-critical layer
      }
    })()
    return () => { cancelled = true }
  }, [supabase])

  // ── Out-of-area detection ──
  // Helsinki default bounds (same as MapWeb fallback)
  const HKI_BOUNDS = useMemo(() => ({ south: 60.14, north: 60.27, west: 24.83, east: 25.20 }), [])
  const isOutOfArea = useMemo(() => {
    if (!userLocation) return false
    return !isInCityBounds(userLocation.latitude, userLocation.longitude, HKI_BOUNDS)
  }, [userLocation, HKI_BOUNDS])

  // ── Clustering ──
  const [zoomLevel, setZoomLevel] = useState(14)

  const clusteredMarkers = useMemo(() => {
    const items = renderedMarkers.map(m => ({
      id: m.key,
      latitude: m.latitude,
      longitude: m.longitude,
      type: 'marker' as const,
      pinColor: m.pinColor,
      title: m.title,
      description: m.description,
    }))
    return clusterMarkers(items, zoomLevel)
  }, [renderedMarkers, zoomLevel])

  const handleRegionChange = useCallback((region: { latitudeDelta: number; longitudeDelta: number }) => {
    // Approximate zoom level from latitudeDelta
    const zoom = region.latitudeDelta > 0 ? Math.round(Math.log2(360 / region.latitudeDelta)) : 14
    setZoomLevel(zoom)
  }, [])

  // ── Animate map on item navigate (wraps hook handler) ──
  const onItemPress = useCallback((item: ListItem) => {
    handleListItemNavigate(item)
    if (!item.id.startsWith('__empty_')) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      mapRef.current?.animateToRegion({
        latitude: item.latitude, longitude: item.longitude,
        latitudeDelta: 0.005, longitudeDelta: 0.005,
      }, 400)
    }
  }, [handleListItemNavigate])

  // ── Animate map when center changes ──
  useEffect(() => {
    const delta = DENSE_NEIGHBORHOODS.has(selectedNeighborhood) ? 0.012 : 0.022
    mapRef.current?.animateToRegion({
      ...center,
      latitudeDelta: delta,
      longitudeDelta: delta,
    }, 500)
  }, [center, selectedNeighborhood])

  // ── Render helpers ──

  const renderSectionHeader = useCallback(({ section }: { section: SectionListData<ListItem, Section> }) => {
    const sectionColor = (section as Section).color
    return (
      <View style={[styles.sectionHeader, { backgroundColor: colors.background, borderBottomColor: colors.border, borderLeftWidth: 4, borderLeftColor: sectionColor ?? colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {section.title}
        </Text>
        <View style={[styles.sectionCountBadge, { backgroundColor: colors.muted }]}>
          <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
            {section.data.filter((d: ListItem) => !d.id.startsWith('__empty_') && !d.id.startsWith('__show_all_')).length}
          </Text>
        </View>
      </View>
    )
  }, [colors])

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.id.startsWith('__empty_')) {
      return (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.emptyCardText, { color: colors.mutedForeground }]}>{item.title}</Text>
        </View>
      )
    }

    if (item.kind === 'community_event' || item.kind === 'city_event') {
      return <EventCard item={item} colors={colors} locale={locale} t={t} onPress={onItemPress} />
    }

    if (item.id === '__show_all_places__' || item.kind === 'place') {
      return <PlaceRow item={item} colors={colors} t={t} onPress={onItemPress} onDirections={openDirections} onShowAllPlaces={() => setShowAllPlaces(true)} />
    }

    if (item.kind === 'post') {
      return <PostCard item={item} colors={colors} locale={locale} t={t} onPress={onItemPress} />
    }

    return null
  }, [colors, onItemPress, locale, t, openDirections, setShowAllPlaces])

  const keyExtractor = useCallback((item: ListItem) => item.id, [])

  // ══════════════════════════════════════════════════════════════
  // JSX
  // ══════════════════════════════════════════════════════════════

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Top Bar ── */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8, backgroundColor: isDark ? 'rgba(30,30,30,0.95)' : 'rgba(255,255,255,0.95)', borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.topBarIcon} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Pressable
          style={[styles.neighborhoodButton, { borderColor: colors.border }]}
          onPress={() => setNeighborhoodModalVisible(true)}
        >
          <MapPin size={14} color={colors.primary} />
          <Text style={[styles.neighborhoodText, { color: colors.foreground }]} numberOfLines={1}>
            {displayNeighborhood}
          </Text>
          <ChevronDown size={14} color={colors.mutedForeground} />
        </Pressable>
        <Pressable onPress={() => { if (showSearch) { setShowSearch(false); setSearchQuery('') } else { setShowSearch(true) } }} style={styles.topBarIcon} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.search')}>
          <Search size={20} color={showSearch ? colors.primary : colors.mutedForeground} />
        </Pressable>
      </View>

      {/* ── Search Bar ── */}
      {showSearch && (
        <>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <Search size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('map.searchPlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <X size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
        {searchQuery.trim().length > 0 && (
          <Text style={[styles.searchCount, { color: colors.mutedForeground }]}>
            {filteredItems.length} {t('map.items')}
          </Text>
        )}
        </>
      )}

      {/* ── Out of Area Banner ── */}
      <OutOfAreaBanner visible={isOutOfArea} cityName="Helsinki" />

      {/* ── Mini Map ── */}
      <View style={[styles.mapContainer, mapExpanded && { height: 400 }]}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={{
            ...center,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }}
          customMapStyle={isDark ? DARK_MAP_STYLE : undefined}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          pitchEnabled={false}
          rotateEnabled={false}
          onRegionChangeComplete={handleRegionChange}
        >
          {clusteredMarkers.map(item => {
            if (isCluster(item)) {
              return (
                <Marker
                  key={item.id}
                  coordinate={{ latitude: item.latitude, longitude: item.longitude }}
                  tracksViewChanges={false}
                  onPress={() => {
                    // Zoom in on cluster
                    mapRef.current?.animateToRegion({
                      latitude: item.latitude,
                      longitude: item.longitude,
                      latitudeDelta: 0.008,
                      longitudeDelta: 0.008,
                    }, 400)
                  }}
                >
                  <View style={[styles.clusterMarker, { backgroundColor: colors.primary }]}>
                    <Text style={styles.clusterText}>{item.count}</Text>
                  </View>
                </Marker>
              )
            }
            const m = item
            return (
              <Marker
                key={m.id}
                coordinate={{ latitude: m.latitude, longitude: m.longitude }}
                pinColor={m.pinColor}
                title={m.title}
                description={m.description}
                tracksViewChanges={false}
                onPress={() => {
                  // For post markers, navigate directly to post detail
                  const listItem = filteredItems.find(fi => fi.id === m.id)
                  if (listItem?.kind === 'post') {
                    const postData = listItem.sourceData as import('@/lib/types').Post
                    router.push(`/post/${postData.id}` as any)
                    return
                  }
                  handleMarkerPress({ key: m.id, latitude: m.latitude, longitude: m.longitude, pinColor: m.pinColor ?? '', title: m.title ?? '', description: m.description ?? '' })
                }}
              />
            )
          })}
          {FEATURES.BUSINESS_ACCOUNT && showBusinesses && businesses.map(biz => (
            <Marker
              key={`biz-${biz.id}`}
              coordinate={{ latitude: biz.business_lat, longitude: biz.business_lng }}
              tracksViewChanges={false}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                setSelectedBusiness(biz)
              }}
            >
              <View style={[styles.businessMarker, { backgroundColor: colors.primary }]}>
                <Building2 size={14} color="#FFF" />
              </View>
            </Marker>
          ))}
        </MapView>
        {(loading || neighborhoodLoading) && (
          <View style={[styles.mapOverlay, { backgroundColor: isDark ? 'rgba(30,30,30,0.85)' : 'rgba(255,255,255,0.85)' }]}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}
        <Pressable
          onPress={() => setMapExpanded(prev => !prev)}
          style={[styles.mapToggleBtn, { backgroundColor: colors.card, top: 8 }]}
        >
          {mapExpanded ? <ChevronUp size={18} color={colors.foreground} /> : <ChevronDown size={18} color={colors.foreground} />}
        </Pressable>
        <Pressable
          onPress={async () => {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
            const loc = await handleCenterOnUser()
            if (loc) {
              mapRef.current?.animateToRegion({ ...loc, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500)
            }
          }}
          style={[
            styles.gpsButton,
            {
              backgroundColor: userLocation ? colors.primary : colors.card,
              shadowColor: '#000',
            },
          ]}
        >
          <Crosshair size={20} color={selectedNeighborhood === '__gps__' ? colors.primaryForeground : colors.foreground} />
        </Pressable>

        {/* ── Business toggle chip ── */}
        {FEATURES.BUSINESS_ACCOUNT && (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
            setShowBusinesses(prev => !prev)
            if (selectedBusiness && showBusinesses) setSelectedBusiness(null)
          }}
          style={[
            styles.businessToggle,
            {
              backgroundColor: showBusinesses ? colors.primary : colors.card,
              borderColor: showBusinesses ? colors.primary : colors.border,
            },
          ]}
        >
          <Building2 size={14} color={showBusinesses ? colors.primaryForeground : colors.mutedForeground} />
          <Text style={[styles.businessToggleText, { color: showBusinesses ? colors.primaryForeground : colors.mutedForeground }]}>
            {t('map.businesses')}
          </Text>
        </Pressable>
        )}

        {/* ── Filter Pills ── */}
        <MapFilters
          activeFilter={activeFilter}
          subCategory={subCategory}
          timeFilter={timeFilter}
          counts={counts}
          subCounts={subCounts}
          colors={colors}
          isDark={isDark}
          t={t}
          neighborhoodLoading={neighborhoodLoading}
          onFilterChange={setActiveFilter}
          onSubCategoryChange={setSubCategory}
          onTimeFilterChange={setTimeFilter}
        />
      </View>

      {/* ── Section List ── */}
      {loading && sections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {t('map.loadingMap')}
          </Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <PinIllustration size={80} />
          {searchQuery.trim() ? (
            <>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {t('map.noSearchResults')} '{searchQuery}'
              </Text>
              <Pressable onPress={() => setSearchQuery('')} style={[styles.emptyActionBtn, { borderColor: colors.accent }]}>
                <Text style={{ color: colors.accent, fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 }}>{t('map.clearSearch')}</Text>
              </Pressable>
            </>
          ) : activeFilter !== 'all' ? (
            <>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {t('map.noContentInArea')} {displayNeighborhood}
              </Text>
              <Pressable onPress={() => setActiveFilter('all')} style={[styles.emptyActionBtn, { borderColor: colors.accent }]}>
                <Text style={{ color: colors.accent, fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 }}>{t('map.showAll')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {t('map.noContentInArea')} {displayNeighborhood}
              </Text>
              <Pressable
                onPress={() => router.push('/(tabs)/create')}
                style={[styles.emptyCreateBtn, { backgroundColor: colors.accent }]}
              >
                <Plus size={16} color={colors.primaryForeground} />
                <Text style={[styles.emptyCreateBtnText, { color: colors.primaryForeground }]}>{t('map.createFirstPost')}</Text>
              </Pressable>
              <Pressable onPress={() => setNeighborhoodModalVisible(true)} style={[styles.emptyActionBtn, { borderColor: colors.border }]}>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: fonts.body, lineHeight: 16 }}>{t('map.tryAnotherArea')}</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <SectionList
          ref={sectionListRef}
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: insets.bottom + 80, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleFullRefresh} tintColor={colors.primary} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <MapPin size={32} color={colors.mutedForeground} style={{ opacity: 0.3 }} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {searchQuery ? t('map.noResults') : t('map.noResultsFilterHint')}
              </Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                {searchQuery ? t('map.noSearchResults') : t('map.noResultsFilterHint')}
              </Text>
            </View>
          }
          ListFooterComponent={
            (activeFilter === 'all' || activeFilter === 'events') && hasMore ? (
              <View style={styles.loadMoreFooter}>
                {loadingMore ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <PressableOpacity onPress={handleLoadMore} style={[styles.loadMoreBtn, { borderColor: colors.border }]}>
                    <Text style={[styles.loadMoreText, { color: colors.primary }]}>
                      {t('map.loadMoreEvents')} ({totalEvents} {t('map.totalEvents')})
                    </Text>
                  </PressableOpacity>
                )}
              </View>
            ) : null
          }
        />
      )}

      {/* ── Detail Sheet ── */}
      <DetailModal
        item={selectedItem}
        colors={colors}
        locale={locale}
        t={t}
        router={router}
        onClose={() => setSelectedItem(null)}
      />

      {/* ── Business Preview Card ── */}
      {FEATURES.BUSINESS_ACCOUNT && selectedBusiness && (
        <View style={[styles.businessCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            onPress={() => setSelectedBusiness(null)}
            style={styles.businessCardClose}
            hitSlop={8}
          >
            <X size={16} color={colors.mutedForeground} />
          </Pressable>
          <View style={styles.businessCardRow}>
            <Image
              source={{
                uri: getImageUrl(
                  (Array.isArray(selectedBusiness.business_images) && selectedBusiness.business_images.length > 0
                    ? selectedBusiness.business_images[0]
                    : null) ??
                  selectedBusiness.avatar_url ??
                  null,
                  'thumbnail',
                ) ?? undefined,
              }}
              style={[styles.businessCardImage, { backgroundColor: colors.muted }]}
              contentFit="cover"
            />
            <View style={styles.businessCardInfo}>
              <Text style={[styles.businessCardName, { color: colors.foreground }]} numberOfLines={1}>
                {selectedBusiness.business_name || selectedBusiness.name}
              </Text>
              {selectedBusiness.business_category ? (
                <View style={[styles.businessCategoryBadge, { backgroundColor: colors.muted }]}>
                  <Text style={[styles.businessCategoryText, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {selectedBusiness.business_category}
                  </Text>
                </View>
              ) : null}
              {selectedBusiness.business_address ? (
                <Text style={[styles.businessCardAddress, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {selectedBusiness.business_address}
                </Text>
              ) : null}
            </View>
          </View>
          <Pressable
            onPress={() => {
              const bizId = selectedBusiness.id
              setSelectedBusiness(null)
              router.push(`/profile/${bizId}` as any)
            }}
            style={[styles.businessCardButton, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.businessCardButtonText}>{t('map.showProfile')}</Text>
          </Pressable>
        </View>
      )}

      {/* ── Neighborhood Modal ── */}
      <NeighborhoodModal
        visible={neighborhoodModalVisible}
        selected={selectedNeighborhood}
        neighborhoods={dynamicNeighborhoods.length > 0 ? dynamicNeighborhoods : NEIGHBORHOODS}
        centers={NEIGHBORHOOD_CENTERS}
        userLocation={userLocation}
        colors={colors}
        t={t}
        onSelect={handleNeighborhoodSelect}
        onGPSSelect={handleGPSSelect}
        onClose={() => setNeighborhoodModalVisible(false)}
      />
    </View>
  )
}

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  topBarIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  neighborhoodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  neighborhoodText: {
    flex: 1,
    fontSize: 16,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.16,
    lineHeight: 20,
  },
  mapContainer: {
    height: MAP_HEIGHT,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 16,
    padding: 8,
  },
  gpsButton: {
    position: 'absolute',
    bottom: 8,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    zIndex: 11,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: fonts.headingSemi,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: 18,
  },
  sectionCountBadge: {
    minWidth: 24,
    height: 22,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  sectionCount: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    lineHeight: 13,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    paddingVertical: 4,
  },
  searchCount: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    lineHeight: 14,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  emptyList: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.16,
    lineHeight: 20,
  },
  emptyHint: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptyActionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  emptyCreateBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
  mapToggleBtn: {
    position: 'absolute',
    right: 8,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  loadMoreFooter: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  loadMoreText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  emptyCard: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  emptyCardText: {
    padding: 16,
    fontStyle: 'italic',
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  clusterMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  clusterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.headingSemi,
    lineHeight: 16,
  },
  businessMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  businessToggle: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    zIndex: 11,
  },
  businessToggleText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  businessCard: {
    position: 'absolute',
    bottom: 90,
    left: 12,
    right: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 20,
  },
  businessCardClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  businessCardImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
    // backgroundColor set inline via colors.muted for dark mode support
  },
  businessCardInfo: {
    flex: 1,
    gap: 4,
  },
  businessCardName: {
    fontSize: 16,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.16,
    lineHeight: 20,
  },
  businessCategoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  businessCategoryText: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    lineHeight: 14,
  },
  businessCardAddress: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  businessCardButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  businessCardButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
})
