import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, Pressable, SectionList,
  StyleSheet, ActivityIndicator, RefreshControl, TextInput,
  Dimensions, Animated as RNAnimated,
  type SectionListData,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps'
import * as Haptics from 'expo-haptics'
import {
  ChevronDown, ChevronUp, MapPin, Search, Crosshair, ArrowLeft, Plus, X, Building2, List,
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

// Bottom sheet snap points
const SHEET_COLLAPSED = 200
const SHEET_EXPANDED = SCREEN_HEIGHT * 0.65

// ==============================================================
// Main component
// ==============================================================

export default function MapScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const mapRef = useRef<MapView | null>(null)
  const sectionListRef = useRef<SectionList<ListItem, Section> | null>(null)

  // View toggle: 'map' (default) vs 'list'
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map')
  // Bottom sheet expanded state
  const [sheetExpanded, setSheetExpanded] = useState(false)

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

  // -- Business markers --
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
        // Silently ignore -- businesses are a non-critical layer
      }
    })()
    return () => { cancelled = true }
  }, [supabase])

  // -- Out-of-area detection --
  const HKI_BOUNDS = useMemo(() => ({ south: 60.14, north: 60.27, west: 24.83, east: 25.20 }), [])
  const isOutOfArea = useMemo(() => {
    if (!userLocation) return false
    return !isInCityBounds(userLocation.latitude, userLocation.longitude, HKI_BOUNDS)
  }, [userLocation, HKI_BOUNDS])

  // -- Clustering --
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
    const zoom = region.latitudeDelta > 0 ? Math.round(Math.log2(360 / region.latitudeDelta)) : 14
    setZoomLevel(zoom)
  }, [])

  // -- Animate map on item navigate --
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

  // -- Animate map when center changes --
  useEffect(() => {
    const delta = DENSE_NEIGHBORHOODS.has(selectedNeighborhood) ? 0.012 : 0.022
    mapRef.current?.animateToRegion({
      ...center,
      latitudeDelta: delta,
      longitudeDelta: delta,
    }, 500)
  }, [center, selectedNeighborhood])

  // -- Render helpers --

  const renderSectionHeader = useCallback(({ section }: { section: SectionListData<ListItem, Section> }) => {
    const sectionColor = (section as Section).color
    return (
      <View style={[styles.sectionHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.sectionColorDot, { backgroundColor: sectionColor ?? colors.border }]} />
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
        <View style={[styles.emptyCard, { backgroundColor: 'transparent', borderColor: colors.border }]}>
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

  // Count of items to show in bottom sheet header
  const itemCount = filteredItems.filter(i => !i.id.startsWith('__empty_') && !i.id.startsWith('__show_all_')).length

  // ==============================================================
  // JSX
  // ==============================================================

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* -- Full-screen Map -- */}
      {viewMode === 'map' && (
        <View style={styles.mapFull}>
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
                      mapRef.current?.animateToRegion({
                        latitude: item.latitude,
                        longitude: item.longitude,
                        latitudeDelta: 0.008,
                        longitudeDelta: 0.008,
                      }, 400)
                    }}
                  >
                    <View style={[styles.clusterMarker, { backgroundColor: colors.foreground }]}>
                      <Text style={[styles.clusterText, { color: colors.primaryForeground }]}>{item.count}</Text>
                    </View>
                  </Marker>
                )
              }
              const m = item
              return (
                <Marker
                  key={m.id}
                  coordinate={{ latitude: m.latitude, longitude: m.longitude }}
                  pinColor={colors.foreground}
                  title={m.title}
                  description={m.description}
                  tracksViewChanges={false}
                  onPress={() => {
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
                <View style={[styles.businessMarker, { backgroundColor: colors.foreground }]}>
                  <Building2 size={14} color={colors.primaryForeground} />
                </View>
              </Marker>
            ))}
          </MapView>

          {(loading || neighborhoodLoading) && (
            <View style={[styles.mapLoadingBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.foreground} />
            </View>
          )}
        </View>
      )}

      {/* -- Overlaid controls (map mode) -- */}
      {viewMode === 'map' && (
        <>
          {/* Back button - circle, top-left */}
          <Pressable
            onPress={() => router.back()}
            style={[styles.backButton, { top: insets.top + 12, backgroundColor: colors.card, borderColor: colors.border }]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ArrowLeft size={18} color={colors.foreground} />
          </Pressable>

          {/* Search bar overlay - pill shape */}
          <View style={[styles.searchOverlay, { top: insets.top + 12 }]}>
            <Pressable
              style={[styles.searchBarPill, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                if (!showSearch) {
                  setShowSearch(true)
                }
              }}
            >
              <Search size={16} color={colors.mutedForeground} />
              {showSearch ? (
                <TextInput
                  style={[styles.searchInput, { color: colors.foreground }]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={t('map.searchPlaceholder')}
                  placeholderTextColor={colors.tertiaryForeground}
                  accessibilityLabel={t('map.searchPlaceholder')}
                  autoFocus
                />
              ) : (
                <Pressable
                  onPress={() => setNeighborhoodModalVisible(true)}
                  style={styles.searchTextWrap}
                >
                  <Text style={[styles.searchBarText, { color: colors.foreground }]} numberOfLines={1}>
                    {displayNeighborhood}
                  </Text>
                </Pressable>
              )}
              {showSearch && (
                <Pressable
                  onPress={() => {
                    if (searchQuery.length > 0) {
                      setSearchQuery('')
                    } else {
                      setShowSearch(false)
                    }
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={searchQuery.length > 0 ? t('common.clear') : t('common.close')}
                >
                  <X size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            </Pressable>
          </View>

          {/* GPS button - circle, right side */}
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
                top: insets.top + 68,
                backgroundColor: userLocation ? colors.foreground : colors.card,
                borderColor: userLocation ? colors.foreground : colors.border,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('map.myLocation') ?? 'My location'}
          >
            <Crosshair size={18} color={userLocation ? colors.primaryForeground : colors.foreground} />
          </Pressable>

          {/* Filter chips overlay - below search */}
          <View style={[styles.filterChipsOverlay, { top: insets.top + 68 }]}>
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

          {/* Business toggle chip */}
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
                  top: insets.top + 120,
                  backgroundColor: showBusinesses ? colors.foreground : colors.card,
                  borderColor: showBusinesses ? colors.foreground : colors.border,
                },
              ]}
            >
              <Building2 size={14} color={showBusinesses ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.businessToggleText, { color: showBusinesses ? colors.primaryForeground : colors.mutedForeground }]}>
                {t('map.businesses')}
              </Text>
            </Pressable>
          )}

          {/* Out of area banner */}
          <OutOfAreaBanner visible={isOutOfArea} cityName="Helsinki" />
        </>
      )}

      {/* -- List/Map Toggle pill -- */}
      <View style={[styles.viewToggleWrap, { bottom: viewMode === 'map' ? (sheetExpanded ? SHEET_EXPANDED + 16 : SHEET_COLLAPSED + 16) : insets.bottom + 16 }]}>
        <View style={[styles.viewTogglePill, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
              setViewMode('list')
            }}
            style={[
              styles.viewToggleBtn,
              viewMode === 'list' && { backgroundColor: colors.foreground },
            ]}
          >
            <List size={14} color={viewMode === 'list' ? colors.primaryForeground : colors.foreground} />
            <Text style={[styles.viewToggleLabel, { color: viewMode === 'list' ? colors.primaryForeground : colors.foreground }]}>
              {t('map.listView') || 'Listaa'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
              setViewMode('map')
            }}
            style={[
              styles.viewToggleBtn,
              viewMode === 'map' && { backgroundColor: colors.foreground },
            ]}
          >
            <MapPin size={14} color={viewMode === 'map' ? colors.primaryForeground : colors.foreground} />
            <Text style={[styles.viewToggleLabel, { color: viewMode === 'map' ? colors.primaryForeground : colors.foreground }]}>
              {t('map.mapView') || 'Kartta'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* -- Bottom Sheet (map mode) -- */}
      {viewMode === 'map' && (
        <View style={[
          styles.bottomSheet,
          {
            height: sheetExpanded ? SHEET_EXPANDED : SHEET_COLLAPSED,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}>
          {/* Drag handle */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
              setSheetExpanded(prev => !prev)
            }}
            style={styles.sheetHandleArea}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          </Pressable>

          {/* Sheet header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={[styles.sheetHeaderLabel, { color: colors.mutedForeground }]}>
                {t('map.inAreaNow') || 'Alueella nyt'}
              </Text>
              <Text style={[styles.sheetHeaderTitle, { color: colors.foreground }]}>
                {itemCount} {t('map.items')}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
                setViewMode('list')
              }}
            >
              <Text style={[styles.sheetHeaderAction, { color: colors.foreground }]}>
                {t('map.listView') || 'Listaksi'}
              </Text>
            </Pressable>
          </View>

          {/* Sheet content - preview cards */}
          {loading && filteredItems.length === 0 ? (
            <View style={styles.sheetLoading}>
              <ActivityIndicator size="small" color={colors.foreground} />
            </View>
          ) : (
            <SectionList
              ref={sectionListRef}
              sections={sections}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={{ paddingBottom: 24, paddingTop: 4 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleFullRefresh} tintColor={colors.foreground} />}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.3}
              ListEmptyComponent={
                <View style={styles.sheetEmpty}>
                  <PinIllustration size={48} />
                  <Text style={[styles.sheetEmptyText, { color: colors.mutedForeground }]}>
                    {searchQuery ? t('map.noSearchResults') : t('map.noContentInArea')}
                  </Text>
                </View>
              }
              ListFooterComponent={
                (activeFilter === 'all' || activeFilter === 'events') && hasMore ? (
                  <View style={styles.loadMoreFooter}>
                    {loadingMore ? (
                      <ActivityIndicator size="small" color={colors.foreground} />
                    ) : (
                      <PressableOpacity onPress={handleLoadMore} style={[styles.loadMoreBtn, { borderColor: colors.border }]}>
                        <Text style={[styles.loadMoreText, { color: colors.foreground }]}>
                          {t('map.loadMoreEvents')} ({totalEvents} {t('map.totalEvents')})
                        </Text>
                      </PressableOpacity>
                    )}
                  </View>
                ) : null
              }
            />
          )}
        </View>
      )}

      {/* -- Full List view -- */}
      {viewMode === 'list' && (
        <View style={[styles.listFull, { backgroundColor: colors.background }]}>
          {/* List header */}
          <View style={[styles.listHeader, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Pressable
              onPress={() => router.back()}
              style={[styles.listBackBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <ArrowLeft size={18} color={colors.foreground} />
            </Pressable>
            <Pressable
              style={[styles.listNeighborhoodBtn, { borderColor: colors.border }]}
              onPress={() => setNeighborhoodModalVisible(true)}
            >
              <MapPin size={14} color={colors.foreground} />
              <Text style={[styles.listNeighborhoodText, { color: colors.foreground }]} numberOfLines={1}>
                {displayNeighborhood}
              </Text>
              <ChevronDown size={14} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              onPress={() => { if (showSearch) { setShowSearch(false); setSearchQuery('') } else { setShowSearch(true) } }}
              style={[styles.listSearchBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.search')}
            >
              <Search size={18} color={showSearch ? colors.foreground : colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Search bar in list mode */}
          {showSearch && (
            <View style={[styles.listSearchBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <Search size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.listSearchInput, { color: colors.foreground }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('map.searchPlaceholder')}
                placeholderTextColor={colors.tertiaryForeground}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <X size={16} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
          )}

          {/* Filter pills in list mode */}
          <View style={[styles.listFilterWrap, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
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

          {/* Section list */}
          {loading && sections.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={colors.foreground} />
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
                    {t('map.noSearchResults')} &apos;{searchQuery}&apos;
                  </Text>
                  <Pressable onPress={() => setSearchQuery('')} style={[styles.emptyActionBtn, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 }}>{t('map.clearSearch')}</Text>
                  </Pressable>
                </>
              ) : activeFilter !== 'all' ? (
                <>
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    {t('map.noContentInArea')} {displayNeighborhood}
                  </Text>
                  <Pressable onPress={() => setActiveFilter('all')} style={[styles.emptyActionBtn, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 }}>{t('map.showAll')}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                    {t('map.noContentInArea')} {displayNeighborhood}
                  </Text>
                  <Pressable
                    onPress={() => router.push('/(tabs)/create')}
                    style={[styles.emptyCreateBtn, { backgroundColor: colors.foreground }]}
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
              sections={sections}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled
              contentContainerStyle={{ paddingBottom: insets.bottom + 80, paddingTop: 4 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleFullRefresh} tintColor={colors.foreground} />}
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
                      <ActivityIndicator size="small" color={colors.foreground} />
                    ) : (
                      <PressableOpacity onPress={handleLoadMore} style={[styles.loadMoreBtn, { borderColor: colors.border }]}>
                        <Text style={[styles.loadMoreText, { color: colors.foreground }]}>
                          {t('map.loadMoreEvents')} ({totalEvents} {t('map.totalEvents')})
                        </Text>
                      </PressableOpacity>
                    )}
                  </View>
                ) : null
              }
            />
          )}
        </View>
      )}

      {/* -- Detail Sheet -- */}
      <DetailModal
        item={selectedItem}
        colors={colors}
        locale={locale}
        t={t}
        router={router}
        onClose={() => setSelectedItem(null)}
      />

      {/* -- Business Preview Card -- */}
      {FEATURES.BUSINESS_ACCOUNT && selectedBusiness && (
        <View style={[styles.businessCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable
            onPress={() => setSelectedBusiness(null)}
            style={[styles.businessCardClose, { backgroundColor: colors.background }]}
            hitSlop={8}
          >
            <X size={14} color={colors.mutedForeground} />
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
            style={[styles.businessCardButton, { backgroundColor: colors.foreground }]}
          >
            <Text style={[styles.businessCardButtonText, { color: colors.primaryForeground }]}>{t('map.showProfile')}</Text>
          </Pressable>
        </View>
      )}

      {/* -- Neighborhood Modal -- */}
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

// ==============================================================
// Styles
// ==============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // -- Full-screen map --
  mapFull: {
    ...StyleSheet.absoluteFillObject,
  },
  map: {
    flex: 1,
  },
  mapLoadingBadge: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  // -- Overlaid controls --
  backButton: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  searchOverlay: {
    position: 'absolute',
    left: 62,
    right: 62,
    zIndex: 10,
  },
  searchBarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 8,
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  searchBarText: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    letterSpacing: -0.1,
    lineHeight: 18,
  },
  searchTextWrap: {
    flex: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
    paddingVertical: 0,
  },

  gpsButton: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  filterChipsOverlay: {
    position: 'absolute',
    left: 16,
    right: 56,
    zIndex: 9,
  },

  businessToggle: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    zIndex: 9,
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  businessToggleText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // -- View toggle pill --
  viewToggleWrap: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 15,
  },
  viewTogglePill: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    padding: 3,
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  viewToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  viewToggleLabel: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // -- Bottom sheet --
  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    zIndex: 12,
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  sheetHandleArea: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sheetHeaderLabel: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  sheetHeaderTitle: {
    fontSize: 17,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
    lineHeight: 22,
    marginTop: 2,
  },
  sheetHeaderAction: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
    textDecorationLine: 'underline',
  },
  sheetLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetEmpty: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  sheetEmptyText: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // -- Cluster markers (INK colored) --
  clusterMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  clusterText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.headingSemi,
    lineHeight: 16,
  },

  // -- Business markers --
  businessMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },

  // -- Business card --
  businessCard: {
    position: 'absolute',
    bottom: 220,
    left: 12,
    right: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    zIndex: 20,
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  businessCardClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
    width: 28,
    height: 28,
    borderRadius: 999,
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
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  businessCardInfo: {
    flex: 1,
    gap: 4,
  },
  businessCardName: {
    fontSize: 15,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.15,
    lineHeight: 20,
  },
  businessCategoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
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
    borderRadius: 999,
  },
  businessCardButtonText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },

  // -- List mode --
  listFull: {
    flex: 1,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  listBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listNeighborhoodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  listNeighborhoodText: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.14,
    lineHeight: 18,
  },
  listSearchBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listSearchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    paddingVertical: 4,
  },
  listFilterWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  // -- Section headers --
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    lineHeight: 16,
  },
  sectionCountBadge: {
    minWidth: 24,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  sectionCount: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    lineHeight: 13,
  },

  // -- Empty states --
  emptyCard: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  emptyCardText: {
    padding: 16,
    fontStyle: 'italic',
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
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
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 8,
  },
  emptyCreateBtnText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },

  // -- Load more --
  loadMoreFooter: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loadMoreBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  loadMoreText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
})
