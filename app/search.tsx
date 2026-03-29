declare const __DEV__: boolean

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { View, Text, TextInput, FlatList, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { ArrowLeft, Search as SearchIcon, X, SlidersHorizontal, Clock, TrendingUp, MapPin, LayoutGrid, ChevronRight, Star, Trash2, Heart, ChevronDown, ChevronUp, Navigation, DollarSign, Calendar, CalendarDays, Users } from 'lucide-react-native'
import * as Location from 'expo-location'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SearchSkeleton } from '@/components/SkeletonLoaders'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { POST_SELECT, CATEGORIES } from '@/lib/constants'
import { FEATURES } from '@/lib/featureFlags'
import { PostCard } from '@/components/PostCard'
import { Avatar } from '@/components/Avatar'
import { BoardIllustration } from '@/components/illustrations'
import { SearchFilters, EMPTY_FILTERS, countActiveFilters, type SearchFilterValues, type SortOption } from '@/components/SearchFilters'
import { CATEGORY_ICON_MAP } from '@/lib/categoryIcons'
import { rankSearchResults } from '@/lib/searchAlgorithm'
import { trackEvent } from '@/lib/analytics'
import { getCachedUserId } from '@/lib/authCache'
import { haversineKm } from '@/lib/geo'
import type { Post, PostType } from '@/lib/types'

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`

const HISTORY_KEY = 'tackbird-search-history'
const RECENT_SEARCHES_KEY = 'tackbird_recent_searches'
const SAVED_SEARCHES_KEY = 'tackbird-saved-searches'
const MAX_HISTORY = 5
const MAX_RECENT = 8

type TimeFilter = 'all' | 'today' | 'week' | 'month'

type DistanceFilter = 'all' | '1' | '3' | '5'

interface SavedSearch {
  id: string
  query: string
  filters: SearchFilterValues
  createdAt: string
}

/**
 * Compute a bounding box from a center point and distance in km.
 */
function boundingBox(lat: number, lng: number, km: number) {
  const latDelta = km / 111.32
  const lngDelta = km / (111.32 * Math.cos((lat * Math.PI) / 180))
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  }
}

// ── Extracted components (stable identity across renders) ──

interface DiscoveryViewProps {
  query: string
  recentSearches: string[]
  clearRecentSearches: () => void
  setQuery: (q: string) => void
  saveRecentSearch: (term: string) => Promise<void>
  executeSearch: (q?: string, f?: SearchFilterValues, cat?: PostType | null, tf?: TimeFilter) => void
  history: string[]
  handleHistoryChipTap: (h: string) => void
  removeFromHistory: (q: string) => Promise<void>
  savedSearches: SavedSearch[]
  loadSavedSearch: (saved: SavedSearch) => void
  removeSavedSearch: (id: string) => Promise<void>
  trendingPosts: { id: string; title: string; type: string; like_count: number }[]
  router: ReturnType<typeof useRouter>
  colors: ReturnType<typeof useTheme>['colors']
  isDark: boolean
  t: ReturnType<typeof useI18n>['t']
  setActiveFilter: (f: PostType | null) => void
}

function DiscoveryView({
  query, recentSearches, clearRecentSearches, setQuery, saveRecentSearch,
  executeSearch, history, handleHistoryChipTap, removeFromHistory,
  savedSearches, loadSavedSearch, removeSavedSearch, trendingPosts,
  router, colors, isDark, t, setActiveFilter,
}: DiscoveryViewProps) {
  return (
    <ScrollView contentContainerStyle={s.discovery} showsVerticalScrollIndicator={false}>
      {/* Recent searches — persistent vertical list */}
      {!query && recentSearches.length > 0 && (
        <View style={s.section}>
          <View style={s.recentHeader}>
            <Text style={[s.sectionTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.recent')}</Text>
            <Pressable onPress={clearRecentSearches} accessibilityRole="button" accessibilityLabel={t('common.clear')}>
              <Text style={[s.recentClear, { color: colors.primary, fontFamily: fonts.bodyMedium }]}>{t('common.clear')}</Text>
            </Pressable>
          </View>
          {recentSearches.map((term, i) => (
            <Pressable key={i} onPress={() => { setQuery(term); saveRecentSearch(term); executeSearch(term) }} style={s.recentItem} accessibilityRole="button" accessibilityLabel={term}>
              <Clock size={14} color={colors.mutedForeground} />
              <Text style={[s.recentText, { color: colors.foreground, fontFamily: fonts.body }]}>{term}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Recent search chips */}
      {history.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Clock size={16} color={colors.mutedForeground} />
            <Text style={[s.sectionTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.recentSearches')}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recentChipsRow}>
            {history.map((h) => (
              <Pressable
                key={h}
                onPress={() => handleHistoryChipTap(h)}
                style={[s.recentChip, { backgroundColor: isDark ? colors.card : colors.muted, borderColor: colors.border }]}
              >
                <Clock size={12} color={colors.mutedForeground} />
                <Text style={[s.recentChipText, { color: colors.foreground, fontFamily: fonts.body }]}>{h}</Text>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.()
                    removeFromHistory(h)
                  }}
                  hitSlop={8}
                >
                  <X size={12} color={colors.mutedForeground} />
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Saved Searches */}
      {savedSearches.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Star size={16} color={colors.mutedForeground} />
            <Text style={[s.sectionTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.savedSearches')}</Text>
          </View>
          {savedSearches.map((saved) => {
            const savedFilterCount = countActiveFilters(saved.filters)
            return (
              <View key={saved.id} style={s.historyRow}>
                <Pressable
                  onPress={() => loadSavedSearch(saved)}
                  style={s.historyBtn}
                >
                  <SearchIcon size={14} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.historyText, { color: colors.foreground, fontFamily: fonts.body }]}>{saved.query}</Text>
                    {savedFilterCount > 0 && (
                      <Text style={[s.savedFilterHint, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                        {t('search.activeFilters', { count: savedFilterCount })}
                      </Text>
                    )}
                  </View>
                </Pressable>
                <Pressable onPress={() => removeSavedSearch(saved.id)} hitSlop={8}>
                  <Trash2 size={14} color={colors.mutedForeground} />
                </Pressable>
              </View>
            )
          })}
        </View>
      )}

      {/* Trending */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <TrendingUp size={16} color={colors.mutedForeground} />
          <Text style={[s.sectionTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.trending')}</Text>
        </View>
        {trendingPosts.length === 0 ? (
          <Text style={[s.hintText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>{t('search.noTrending')}</Text>
        ) : (
          <View style={s.trendingList}>
            {trendingPosts.map((tp) => {
              const tpCat = CATEGORIES[tp.type as PostType]
              return (
                <Pressable
                  key={tp.id}
                  onPress={() => router.push(`/post/${tp.id}` as any)}
                  style={[s.trendingCard, { backgroundColor: colors.card }]}
                  accessibilityRole="button"
                  accessibilityLabel={tp.title}
                >
                  {tpCat && (
                    <View style={[s.trendingDot, { backgroundColor: tpCat.color }]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.trendingTitle, { color: colors.foreground, fontFamily: fonts.bodySemi }]} numberOfLines={1}>{tp.title}</Text>
                    {tpCat && <Text style={[s.trendingCat, { color: colors.mutedForeground, fontFamily: fonts.body }]}>{t(tpCat.label)}</Text>}
                  </View>
                  <View style={s.trendingLikes}>
                    <Heart size={12} color={colors.destructive} fill={colors.destructive} />
                    <Text style={[s.trendingLikeCount, { color: colors.mutedForeground, fontFamily: fonts.bodyMedium }]}>{tp.like_count}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}
      </View>

      {/* Category cards */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <LayoutGrid size={16} color={colors.mutedForeground} />
          <Text style={[s.sectionTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.browseByCategory')}</Text>
        </View>
        <View style={s.categoryGrid}>
          {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).filter(([type]) => {
            if (type === 'lainaa' && !FEATURES.LENDING) return false
            if (type === 'nappaa' && !FEATURES.GRAB) return false
            return true
          }).map(([type, cat]) => {
            const CatIcon = CATEGORY_ICON_MAP[cat.icon]
            return (
              <Pressable
                key={type}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
                  setActiveFilter(type)
                  setQuery(t(cat.label))
                  executeSearch(t(cat.label), undefined, type)
                }}
                style={[s.categoryCard, { backgroundColor: isDark ? cat.bgDark : cat.bgLight }]}
                accessibilityRole="button"
                accessibilityLabel={t(cat.label)}
              >
                <View style={[s.categoryIconBox, { backgroundColor: `${cat.color}20` }]}>
                  {CatIcon && <CatIcon size={22} color={cat.color} />}
                </View>
                <Text style={[s.categoryCardText, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>{t(cat.label)}</Text>
                <ChevronRight size={16} color={colors.mutedForeground} style={{ marginLeft: 'auto' }} />
              </Pressable>
            )
          })}
        </View>
        <Text style={[s.hintText, { color: colors.mutedForeground, textAlign: 'center', marginTop: 8, fontFamily: fonts.body }]}>{t('search.initialHint')}</Text>
      </View>
    </ScrollView>
  )
}

interface SearchEmptyStateProps {
  query: string
  colors: ReturnType<typeof useTheme>['colors']
  t: ReturnType<typeof useI18n>['t']
}

function SearchEmptyState({ query, colors, t }: SearchEmptyStateProps) {
  return (
    <View style={s.empty}>
      <BoardIllustration size={100} />
      <Text style={[s.emptyTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>
        {query.trim() ? t('search.noResultsQuery', { query: query.trim() }) : t('search.noResults')}
      </Text>
      <Text style={[s.emptyHint, { color: colors.mutedForeground, fontFamily: fonts.body }]}>{t('search.tryDifferent')}</Text>
    </View>
  )
}

function SearchScreenInner() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searched, setSearched] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [activeFilter, setActiveFilter] = useState<PostType | null>(null)
  const [activeTab, setActiveTab] = useState<'posts' | 'users' | 'events' | 'groups'>('posts')
  const [userResults, setUserResults] = useState<{ id: string; name: string; avatar_url: string | null; naapurusto: string }[]>([])
  const [eventResults, setEventResults] = useState<{ id: string; title: string; description: string | null; event_date: string | null; location_name: string | null }[]>([])
  const [groupResults, setGroupResults] = useState<{ id: string; name: string; description: string | null; member_count: number | null }[]>([])
  const [trendingPosts, setTrendingPosts] = useState<{ id: string; title: string; type: string; like_count: number }[]>([])
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  // Filter state
  const [filtersVisible, setFiltersVisible] = useState(false)
  const [filters, setFilters] = useState<SearchFilterValues>({ ...EMPTY_FILTERS })
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [userNeighborhood, setUserNeighborhood] = useState<string | null>(null)

  // Inline quick-filter state
  const [inlineFiltersExpanded, setInlineFiltersExpanded] = useState(false)
  const [inlinePriceMin, setInlinePriceMin] = useState('')
  const [inlinePriceMax, setInlinePriceMax] = useState('')
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>('all')
  const [dateFilter, setDateFilter] = useState<TimeFilter>('all')
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)

  // Debounce + abort refs
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const filterCount = useMemo(() => countActiveFilters(filters), [filters])

  // Count inline quick-filters that are active
  const inlineFilterCount = useMemo(() => {
    let count = 0
    if (inlinePriceMin) count++
    if (inlinePriceMax) count++
    if (distanceFilter !== 'all') count++
    if (dateFilter !== 'all') count++
    return count
  }, [inlinePriceMin, inlinePriceMax, distanceFilter, dateFilter])

  // Request user location for distance filter
  const requestLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setUserLat(loc.coords.latitude)
      setUserLng(loc.coords.longitude)
    } catch {}
  }, [])

  // Apply inline quick-filters client-side to results
  const applyInlineFilters = useCallback((posts: Post[]): Post[] => {
    let filtered = posts

    // Price filter
    const minP = inlinePriceMin ? parseFloat(inlinePriceMin) : null
    const maxP = inlinePriceMax ? parseFloat(inlinePriceMax) : null
    if (minP != null && !isNaN(minP)) {
      filtered = filtered.filter(p => {
        const price = (p as any).daily_fee ?? (p as any).service_price ?? 0
        return price >= minP
      })
    }
    if (maxP != null && !isNaN(maxP)) {
      filtered = filtered.filter(p => {
        const price = (p as any).daily_fee ?? (p as any).service_price ?? 0
        return price <= maxP
      })
    }

    // Distance filter
    if (distanceFilter !== 'all' && userLat != null && userLng != null) {
      const maxKm = parseFloat(distanceFilter)
      filtered = filtered.filter(p => {
        if (p.latitude == null || p.longitude == null) return false
        const dist = haversineKm(userLat, userLng, p.latitude, p.longitude)
        return dist <= maxKm
      })
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date()
      let cutoff: Date
      if (dateFilter === 'today') {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      } else if (dateFilter === 'week') {
        cutoff = new Date(now)
        cutoff.setDate(cutoff.getDate() - 7)
        cutoff.setHours(0, 0, 0, 0)
      } else {
        // month
        cutoff = new Date(now)
        cutoff.setMonth(cutoff.getMonth() - 1)
        cutoff.setHours(0, 0, 0, 0)
      }
      filtered = filtered.filter(p => new Date(p.created_at) >= cutoff)
    }

    return filtered
  }, [inlinePriceMin, inlinePriceMax, distanceFilter, dateFilter, userLat, userLng])

  // Filtered results after inline filters
  const displayResults = useMemo(() => applyInlineFilters(results), [results, applyInlineFilters])

  // Load trending posts
  useEffect(() => {
    supabase
      .from('posts')
      .select('id, title, type, like_count')
      .eq('is_active', true)
      .order('like_count', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data) setTrendingPosts((data ?? []) as any[])
      })
  }, [supabase])

  // Fetch current user's neighborhood for search ranking
  useEffect(() => {
    getCachedUserId().then(id => {
      if (!id) return
      ;(supabase.from('profiles') as any)
        .select('naapurusto')
        .eq('id', id)
        .single()
        .then(({ data }: any) => {
          if (data?.naapurusto) setUserNeighborhood(data.naapurusto)
        })
    })
  }, [supabase])

  // Load search history + saved searches + recent searches
  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then(stored => {
      if (stored) try { setHistory(JSON.parse(stored)) } catch {}
    }).catch(() => {})
    AsyncStorage.getItem(SAVED_SEARCHES_KEY).then(stored => {
      if (stored) try { setSavedSearches(JSON.parse(stored)) } catch {}
    }).catch(() => {})
    AsyncStorage.getItem(RECENT_SEARCHES_KEY).then(stored => {
      if (stored) try { setRecentSearches(JSON.parse(stored)) } catch {}
    }).catch(() => {})
  }, [])

  const addToHistory = useCallback(async (q: string) => {
    const updated = [q, ...history.filter(h => h !== q)].slice(0, MAX_HISTORY)
    setHistory(updated)
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
  }, [history])

  const removeFromHistory = useCallback(async (q: string) => {
    const updated = history.filter(h => h !== q)
    setHistory(updated)
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
  }, [history])

  const saveRecentSearch = useCallback(async (term: string) => {
    const trimmed = term.trim()
    if (!trimmed) return
    const updated = [trimmed, ...recentSearches.filter(s => s !== trimmed)].slice(0, MAX_RECENT)
    setRecentSearches(updated)
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated))
  }, [recentSearches])

  const clearRecentSearches = useCallback(async () => {
    setRecentSearches([])
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY)
  }, [])

  const saveCurrentSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) return
    const newSaved: SavedSearch = {
      id: Date.now().toString(),
      query: q,
      filters: { ...filters },
      createdAt: new Date().toISOString(),
    }
    const updated = [newSaved, ...savedSearches].slice(0, 20)
    setSavedSearches(updated)
    await AsyncStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated))
  }, [query, filters, savedSearches])

  const removeSavedSearch = useCallback(async (id: string) => {
    const updated = savedSearches.filter(s => s.id !== id)
    setSavedSearches(updated)
    await AsyncStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated))
  }, [savedSearches])

  // Note: executeSearch is defined below but will be available by the time
  // the setTimeout callback runs. We use a ref to avoid stale closures.
  const executeSearchRef = useRef<((...args: any[]) => void) | null>(null)

  const loadSavedSearch = useCallback((saved: SavedSearch) => {
    setQuery(saved.query)
    setFilters(saved.filters)
    setTimeout(() => {
      if (executeSearchRef.current) {
        executeSearchRef.current(saved.query, saved.filters)
      }
    }, 0)
  }, [])

  /**
   * Build a Supabase query applying all active filters.
   */
  const buildFilteredQuery = useCallback(
    (baseQuery: any, f: SearchFilterValues, categoryFilter: PostType | null, currentTimeFilter: TimeFilter) => {
      let q = baseQuery

      // Category filter
      if (categoryFilter) {
        q = q.eq('type', categoryFilter)
      }

      // Time filter
      if (currentTimeFilter === 'today') {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        q = q.gte('created_at', today.toISOString())
      } else if (currentTimeFilter === 'week') {
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        weekAgo.setHours(0, 0, 0, 0)
        q = q.gte('created_at', weekAgo.toISOString())
      } else if (currentTimeFilter === 'month') {
        const monthAgo = new Date()
        monthAgo.setMonth(monthAgo.getMonth() - 1)
        monthAgo.setHours(0, 0, 0, 0)
        q = q.gte('created_at', monthAgo.toISOString())
      }

      // Price range
      if (f.minPrice) {
        q = q.gte('daily_fee', parseFloat(f.minPrice))
      }
      if (f.maxPrice) {
        q = q.lte('daily_fee', parseFloat(f.maxPrice))
      }

      // Date range
      if (f.postedAfter) {
        q = q.gte('created_at', `${f.postedAfter}T00:00:00`)
      }
      if (f.postedBefore) {
        q = q.lte('created_at', `${f.postedBefore}T23:59:59`)
      }

      // Distance bounding box
      if (f.distanceKm < 50 && f.userLat != null && f.userLng != null) {
        const bb = boundingBox(f.userLat, f.userLng, f.distanceKm)
        q = q
          .gte('latitude', bb.minLat)
          .lte('latitude', bb.maxLat)
          .gte('longitude', bb.minLng)
          .lte('longitude', bb.maxLng)
      }

      // Neighborhood filter
      if (f.neighborhoods.length > 0) {
        q = q.in('location', f.neighborhoods)
      }

      // Sort order
      switch (f.sortBy) {
        case 'newest':
          q = q.order('created_at', { ascending: false })
          break
        case 'closest':
          q = q.order('created_at', { ascending: false })
          break
        case 'most_liked':
          q = q.order('like_count', { ascending: false })
          break
        case 'price_asc':
          q = q.order('daily_fee', { ascending: true, nullsFirst: false })
          break
        case 'price_desc':
          q = q.order('daily_fee', { ascending: false })
          break
      }

      return q
    },
    []
  )

  /**
   * Client-side sort by distance when sortBy === 'closest'.
   */
  const sortByDistance = useCallback(
    (posts: Post[], f: SearchFilterValues): Post[] => {
      if (f.sortBy !== 'closest' || f.userLat == null || f.userLng == null) return posts
      const { userLat, userLng } = f
      return [...posts].sort((a, b) => {
        const distA =
          a.latitude != null && a.longitude != null
            ? haversineKm(userLat, userLng, a.latitude, a.longitude)
            : Infinity
        const distB =
          b.latitude != null && b.longitude != null
            ? haversineKm(userLat, userLng, b.latitude, b.longitude)
            : Infinity
        return distA - distB
      })
    },
    []
  )

  /**
   * Fetch semantic search results from Edge Function.
   */
  const fetchSemanticResults = useCallback(async (searchQuery: string): Promise<{ post_id: string; similarity: number }[]> => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return []

      const res = await fetch(`${FUNCTIONS_URL}/semantic-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ query: searchQuery, limit: 20 }),
      })
      if (!res.ok) return []
      const { results } = await res.json()
      return results ?? []
    } catch { return [] }
  }, [supabase])

  /**
   * Core search execution — called by debounce and direct triggers.
   */
  const executeSearch = useCallback(async (
    searchQuery?: string,
    overrideFilters?: SearchFilterValues,
    overrideCategory?: PostType | null,
    overrideTimeFilter?: TimeFilter,
  ) => {
    const q = (searchQuery ?? query).trim()
    if (!q) return

    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setSearched(true)
    addToHistory(q)
    saveRecentSearch(q)
    trackEvent('search_performed', { query: q })

    const f = overrideFilters ?? filters
    const catFilter = overrideCategory !== undefined ? overrideCategory : activeFilter
    const tf = overrideTimeFilter !== undefined ? overrideTimeFilter : timeFilter

    try {
      // Search posts
      let postQuery = supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('is_active', true)
        .or(`title.ilike.%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%,description.ilike.%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`)

      // Hide disabled category types from search results (same as feed)
      const hiddenTypes: string[] = []
      if (!FEATURES.LENDING) hiddenTypes.push('lainaa')
      if (!FEATURES.GRAB) hiddenTypes.push('nappaa')
      if (hiddenTypes.length > 0 && !catFilter) {
        postQuery = postQuery.not('type', 'in', `(${hiddenTypes.join(',')})`)
      }

      postQuery = buildFilteredQuery(postQuery, f, catFilter, tf)
      postQuery = postQuery.limit(20)

      const { data: posts } = await postQuery
      // Check if this request was aborted
      if (controller.signal.aborted) return

      let postResults = (posts ?? []) as unknown as Post[]
      postResults = sortByDistance(postResults, f)
      postResults = rankSearchResults(postResults, { query: q, userNeighborhood })

      // Fetch semantic results in parallel with user search below
      const textResultIds = new Set(postResults.map(p => p.id))
      const semanticResults = await fetchSemanticResults(q)
      if (controller.signal.aborted) return

      // Merge semantic-only results
      const semanticOnlyIds = semanticResults
        .filter(s => !textResultIds.has(s.post_id))
        .map(s => s.post_id)

      if (semanticOnlyIds.length > 0) {
        const { data: extraPosts } = await supabase
          .from('posts')
          .select(POST_SELECT)
          .in('id', semanticOnlyIds)
          .eq('is_active', true)
        if (!controller.signal.aborted && extraPosts) {
          const semanticPosts = (extraPosts as unknown as Post[]).map(p => ({
            ...p,
            _semanticMatch: true,
          }))
          postResults = [...postResults, ...semanticPosts]
        }
      }

      setResults(postResults)
      setHasMore((posts ?? []).length >= 20)

      // Search users, events, and groups in parallel
      const [usersRes, eventsRes, groupsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, name, avatar_url, naapurusto')
          .ilike('name', `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`)
          .limit(10),
        supabase
          .from('community_events')
          .select('id, title, description, event_date, location_name')
          .eq('is_active', true)
          .or(`title.ilike.%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%,description.ilike.%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`)
          .order('event_date', { ascending: true })
          .limit(10)
          .then(res => {
            if (res.error) {
              if (__DEV__) console.log('[search] community_events error:', res.error.message)
              return { ...res, data: [] }
            }
            return res
          }),
        supabase
          .from('groups')
          .select('id, name, description, member_count')
          .ilike('name', `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`)
          .limit(10)
          .then(res => {
            if (res.error) {
              if (__DEV__) console.log('[search] groups error:', res.error.message)
              return { ...res, data: [] }
            }
            return res
          }),
      ])
      if (controller.signal.aborted) return

      setUserResults((usersRes.data ?? []) as any[])
      setEventResults((eventsRes.data ?? []) as any[])
      setGroupResults((groupsRes.data ?? []) as any[])
    } catch {
      // Request aborted or failed — ignore
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [query, activeFilter, timeFilter, filters, supabase, addToHistory, saveRecentSearch, buildFilteredQuery, sortByDistance, userNeighborhood, fetchSemanticResults])

  // Keep the ref in sync so loadSavedSearch can use the latest executeSearch
  executeSearchRef.current = executeSearch

  /**
   * Debounced search triggered on text input change.
   */
  const debouncedSearch = useCallback((text: string) => {
    setQuery(text)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    if (!text.trim()) {
      setSearched(false)
      setResults([])
      setUserResults([])
      return
    }
    debounceRef.current = setTimeout(() => {
      executeSearch(text)
    }, 300)
  }, [executeSearch])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const q = query.trim()
      let postQuery = supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('is_active', true)
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)

      // Hide disabled category types from search results (same as feed)
      const hiddenTypes: string[] = []
      if (!FEATURES.LENDING) hiddenTypes.push('lainaa')
      if (!FEATURES.GRAB) hiddenTypes.push('nappaa')
      if (hiddenTypes.length > 0 && !activeFilter) {
        postQuery = postQuery.not('type', 'in', `(${hiddenTypes.join(',')})`)
      }

      postQuery = buildFilteredQuery(postQuery, filters, activeFilter, timeFilter)
      postQuery = postQuery.range(results.length, results.length + 19)

      const { data } = await postQuery
      let newPosts = (data ?? []) as unknown as Post[]
      newPosts = sortByDistance(newPosts, filters)
      setResults(prev => [...prev, ...newPosts])
      setHasMore(newPosts.length >= 20)
    } catch {
    } finally {
      setLoadingMore(false)
    }
  }, [hasMore, loadingMore, query, activeFilter, timeFilter, filters, results.length, supabase, buildFilteredQuery, sortByDistance])

  const handleCategoryFilter = useCallback((type: PostType | null) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    setActiveFilter(type)
    if (searched && query.trim()) {
      setResults([])
      setLoading(true)
      setTimeout(() => executeSearch(undefined, undefined, type), 0)
    }
  }, [searched, query, executeSearch])

  const handleTimeFilter = useCallback((tf: TimeFilter) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    setTimeFilter(tf)
    if (searched && query.trim()) {
      setResults([])
      setLoading(true)
      setTimeout(() => executeSearch(undefined, undefined, undefined, tf), 0)
    }
  }, [searched, query, executeSearch])

  const handleApplyFilters = useCallback((newFilters: SearchFilterValues) => {
    setFilters(newFilters)
    if (searched && query.trim()) {
      setResults([])
      setLoading(true)
      setTimeout(() => executeSearch(undefined, newFilters), 0)
    }
  }, [searched, query, executeSearch])

  const handleHistoryChipTap = useCallback((h: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    setQuery(h)
    executeSearch(h)
  }, [executeSearch])

  // Time filter options
  const TIME_FILTERS: { key: TimeFilter; label: string }[] = [
    { key: 'all', label: t('search.timeAll') },
    { key: 'today', label: t('search.timeToday') },
    { key: 'week', label: t('search.timeWeek') },
  ]

  // Sort filter options for chips
  const SORT_CHIPS: { key: SortOption; label: string }[] = [
    { key: 'newest', label: t('search.sortNewest') },
    { key: 'closest', label: t('search.sortNearest') },
  ]

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header with search */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <View style={[s.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SearchIcon size={18} color={colors.mutedForeground} />
          <TextInput
            style={[s.searchInput, { color: colors.foreground, fontFamily: fonts.body }]}
            value={query}
            onChangeText={debouncedSearch}
            placeholder={t('feed.searchPlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            onSubmitEditing={() => executeSearch()}
            returnKeyType="search"
            autoFocus
            accessibilityLabel={t('feed.searchPlaceholder')}
            accessibilityRole="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(''); setResults([]); setUserResults([]); setSearched(false) }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.clear')}>
              <X size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
        {/* Filter button */}
        <Pressable onPress={() => setFiltersVisible(true)} hitSlop={8} style={s.filterButton} accessibilityRole="button" accessibilityLabel={t('search.filters')}>
          <SlidersHorizontal size={20} color={filterCount > 0 ? colors.primary : colors.mutedForeground} />
          {filterCount > 0 && (
            <View style={[s.filterBadge, { backgroundColor: colors.primary }]}>
              <Text style={[s.filterBadgeText, { color: colors.primaryForeground }]}>{filterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Save search + active filter indicator */}
      {searched && filterCount > 0 && (
        <View style={[s.activeFilterBar, { backgroundColor: `${colors.primary}10`, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setFiltersVisible(true)} style={s.activeFilterInfo}>
            <SlidersHorizontal size={14} color={colors.primary} />
            <Text style={[s.activeFilterText, { color: colors.primary, fontFamily: fonts.bodySemi }]}>
              {t('search.activeFilters', { count: filterCount })}
            </Text>
          </Pressable>
          <Pressable onPress={saveCurrentSearch} hitSlop={8} style={s.saveSearchBtn}>
            <Star size={14} color={colors.primary} />
            <Text style={[s.saveSearchText, { color: colors.primary, fontFamily: fonts.bodyMedium }]}>{t('search.saveThisSearch')}</Text>
          </Pressable>
        </View>
      )}

      {/* Filter chips: Category + Time + Sort */}
      {searched && (
        <View style={s.chipSections}>
          {/* Category chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.filterRow}>
            <Pressable
              onPress={() => handleCategoryFilter(null)}
              accessibilityRole="button"
              accessibilityLabel={t('common.all')}
              accessibilityState={{ selected: !activeFilter }}
              style={[s.filterChip, !activeFilter ? { backgroundColor: colors.primary } : { backgroundColor: isDark ? colors.card : colors.muted }]}
            >
              <Text style={[s.filterText, { color: !activeFilter ? colors.primaryForeground : colors.mutedForeground, fontFamily: fonts.bodyMedium }]}>{t('common.all')}</Text>
            </Pressable>
            {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).filter(([type]) => {
              if (type === 'lainaa' && !FEATURES.LENDING) return false
              if (type === 'nappaa' && !FEATURES.GRAB) return false
              return true
            }).map(([type, cat]) => (
              <Pressable
                key={type}
                onPress={() => handleCategoryFilter(type)}
                accessibilityRole="button"
                accessibilityLabel={t(cat.label)}
                accessibilityState={{ selected: activeFilter === type }}
                style={[s.filterChip, activeFilter === type ? { backgroundColor: cat.color } : { backgroundColor: isDark ? colors.card : colors.muted }]}
              >
                <Text style={[s.filterText, { color: activeFilter === type ? colors.primaryForeground : colors.mutedForeground, fontFamily: fonts.bodyMedium }]}>{t(cat.label)}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Time + Sort chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.filterRow}>
            {TIME_FILTERS.map(tf => (
              <Pressable
                key={tf.key}
                onPress={() => handleTimeFilter(tf.key)}
                style={[
                  s.filterChip,
                  s.filterChipOutline,
                  timeFilter === tf.key
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: 'transparent', borderColor: colors.border },
                ]}
              >
                <Text style={[
                  s.filterText,
                  { fontFamily: fonts.bodyMedium },
                  timeFilter === tf.key
                    ? { color: colors.primaryForeground }
                    : { color: colors.mutedForeground },
                ]}>{tf.label}</Text>
              </Pressable>
            ))}
            <View style={[s.chipDivider, { backgroundColor: colors.border }]} />
            {SORT_CHIPS.map(sc => (
              <Pressable
                key={sc.key}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
                  const newFilters = { ...filters, sortBy: sc.key }
                  setFilters(newFilters)
                  if (searched && query.trim()) {
                    setResults([])
                    setLoading(true)
                    setTimeout(() => executeSearch(undefined, newFilters), 0)
                  }
                }}
                style={[
                  s.filterChip,
                  s.filterChipOutline,
                  filters.sortBy === sc.key
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: 'transparent', borderColor: colors.border },
                ]}
              >
                <Text style={[
                  s.filterText,
                  { fontFamily: fonts.bodyMedium },
                  filters.sortBy === sc.key
                    ? { color: colors.primaryForeground }
                    : { color: colors.mutedForeground },
                ]}>{sc.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Inline quick-filters toggle + panel */}
      {searched && (
        <View style={[s.inlineFilterSection, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
              setInlineFiltersExpanded(prev => !prev)
            }}
            style={[s.inlineFilterToggle, { backgroundColor: inlineFilterCount > 0 ? `${colors.primary}10` : 'transparent' }]}
          >
            <SlidersHorizontal size={14} color={inlineFilterCount > 0 ? colors.primary : colors.mutedForeground} />
            <Text style={[s.inlineFilterToggleText, { color: inlineFilterCount > 0 ? colors.primary : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('search.filters')}{inlineFilterCount > 0 ? ` (${inlineFilterCount})` : ''}
            </Text>
            {inlineFiltersExpanded
              ? <ChevronUp size={14} color={colors.mutedForeground} />
              : <ChevronDown size={14} color={colors.mutedForeground} />
            }
          </Pressable>

          {inlineFiltersExpanded && (
            <View style={s.inlineFilterPanel}>
              {/* Price range */}
              <View style={s.inlineFilterGroup}>
                <View style={s.inlineFilterGroupHeader}>
                  <DollarSign size={14} color={colors.mutedForeground} />
                  <Text style={[s.inlineFilterGroupLabel, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>{t('search.priceRange')}</Text>
                </View>
                <View style={s.inlinePriceRow}>
                  <TextInput
                    style={[s.inlinePriceInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: fonts.body }]}
                    value={inlinePriceMin}
                    onChangeText={setInlinePriceMin}
                    placeholder={t('search.minPrice')}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                  />
                  <Text style={[s.inlinePriceSep, { color: colors.mutedForeground }]}>{'\u2014'}</Text>
                  <TextInput
                    style={[s.inlinePriceInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, fontFamily: fonts.body }]}
                    value={inlinePriceMax}
                    onChangeText={setInlinePriceMax}
                    placeholder={t('search.maxPrice')}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Distance chips */}
              <View style={s.inlineFilterGroup}>
                <View style={s.inlineFilterGroupHeader}>
                  <Navigation size={14} color={colors.mutedForeground} />
                  <Text style={[s.inlineFilterGroupLabel, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>{t('search.distance')}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.inlineChipRow}>
                  {(['1', '3', '5', 'all'] as DistanceFilter[]).map(d => {
                    const isActive = distanceFilter === d
                    const label = d === 'all' ? t('search.timeAll') : `< ${d} km`
                    return (
                      <Pressable
                        key={d}
                        onPress={() => {
                          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
                          setDistanceFilter(d)
                          if (d !== 'all' && userLat == null) requestLocation()
                        }}
                        style={[
                          s.inlineChip,
                          isActive
                            ? { backgroundColor: colors.primary, borderColor: colors.primary }
                            : { backgroundColor: 'transparent', borderColor: colors.border },
                        ]}
                      >
                        <Text style={[s.inlineChipText, { fontFamily: fonts.bodyMedium, color: isActive ? colors.primaryForeground : colors.mutedForeground }]}>{label}</Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>

              {/* Date filter chips */}
              <View style={s.inlineFilterGroup}>
                <View style={s.inlineFilterGroupHeader}>
                  <Calendar size={14} color={colors.mutedForeground} />
                  <Text style={[s.inlineFilterGroupLabel, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>{t('search.dateRange')}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.inlineChipRow}>
                  {([
                    { key: 'today' as TimeFilter, label: t('search.timeToday') },
                    { key: 'week' as TimeFilter, label: t('search.timeWeek') },
                    { key: 'month' as TimeFilter, label: t('search.thisMonth') },
                    { key: 'all' as TimeFilter, label: t('search.timeAll') },
                  ]).map(df => {
                    const isActive = dateFilter === df.key
                    return (
                      <Pressable
                        key={df.key}
                        onPress={() => {
                          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
                          setDateFilter(df.key)
                        }}
                        style={[
                          s.inlineChip,
                          isActive
                            ? { backgroundColor: colors.primary, borderColor: colors.primary }
                            : { backgroundColor: 'transparent', borderColor: colors.border },
                        ]}
                      >
                        <Text style={[s.inlineChipText, { fontFamily: fonts.bodyMedium, color: isActive ? colors.primaryForeground : colors.mutedForeground }]}>{df.label}</Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Result count */}
      {searched && !loading && displayResults.length > 0 && activeTab === 'posts' && (
        <View style={s.resultCountRow}>
          <Text style={[s.resultCountText, { color: colors.mutedForeground, fontFamily: fonts.bodyMedium }]}>
            {t('search.resultCount', { count: displayResults.length })}
          </Text>
        </View>
      )}

      {/* Results tabs */}
      {searched && !loading && (
        <View style={[s.tabRow, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setActiveTab('posts')} style={[s.tab, activeTab === 'posts' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'posts' ? colors.primary : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('places.posts')} ({displayResults.length})
            </Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab('users')} style={[s.tab, activeTab === 'users' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'users' ? colors.primary : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('common.user')} ({userResults.length})
            </Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab('events')} style={[s.tab, activeTab === 'events' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'events' ? colors.primary : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('search.tabEvents')} ({eventResults.length})
            </Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab('groups')} style={[s.tab, activeTab === 'groups' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'groups' ? colors.primary : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('search.tabGroups')} ({groupResults.length})
            </Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      {!searched ? (
        <DiscoveryView
          query={query}
          recentSearches={recentSearches}
          clearRecentSearches={clearRecentSearches}
          setQuery={setQuery}
          saveRecentSearch={saveRecentSearch}
          executeSearch={executeSearch}
          history={history}
          handleHistoryChipTap={handleHistoryChipTap}
          removeFromHistory={removeFromHistory}
          savedSearches={savedSearches}
          loadSavedSearch={loadSavedSearch}
          removeSavedSearch={removeSavedSearch}
          trendingPosts={trendingPosts}
          router={router}
          colors={colors}
          isDark={isDark}
          t={t}
          setActiveFilter={setActiveFilter}
        />
      ) : loading ? (
        <SearchSkeleton />
      ) : activeTab === 'posts' ? (
        <FlatList
          data={displayResults}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View>
              {(item as any)._semanticMatch && (
                <Text style={[s.semanticLabel, { color: colors.primary, fontFamily: fonts.bodyMedium }]}>
                  {t('search.semanticMatch')}
                </Text>
              )}
              <PostCard post={item} />
            </View>
          )}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.mutedForeground} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={<SearchEmptyState query={query} colors={colors} t={t} />}
          showsVerticalScrollIndicator={false}
        />
      ) : activeTab === 'events' ? (
        <FlatList
          data={eventResults}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/event/${item.id}` as any)}
              style={[s.userCard, { backgroundColor: colors.card }]}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <View style={[s.searchEventIcon, { backgroundColor: `${colors.primary}15` }]}>
                <CalendarDays size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.userName, { color: colors.foreground, fontFamily: fonts.bodySemi }]} numberOfLines={2}>{item.title}</Text>
                {item.event_date && (
                  <Text style={[s.userNh, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                    {new Date(item.event_date).toLocaleDateString('fi-FI', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                )}
                {item.location_name && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} color={colors.mutedForeground} />
                    <Text style={[s.userNh, { color: colors.mutedForeground, fontFamily: fonts.body }]} numberOfLines={1}>{item.location_name}</Text>
                  </View>
                )}
              </View>
              <ChevronRight size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <BoardIllustration size={80} />
              <Text style={[s.emptyTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.noResults')}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      ) : activeTab === 'groups' ? (
        <FlatList
          data={groupResults}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/groups/${item.id}` as any)}
              style={[s.userCard, { backgroundColor: colors.card }]}
              accessibilityRole="button"
              accessibilityLabel={item.name}
            >
              <View style={[s.searchEventIcon, { backgroundColor: `${colors.primary}15` }]}>
                <Users size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.userName, { color: colors.foreground, fontFamily: fonts.bodySemi }]} numberOfLines={2}>{item.name}</Text>
                {item.description && (
                  <Text style={[s.userNh, { color: colors.mutedForeground, fontFamily: fonts.body }]} numberOfLines={2}>{item.description}</Text>
                )}
                {item.member_count != null && item.member_count > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Users size={12} color={colors.mutedForeground} />
                    <Text style={[s.userNh, { color: colors.mutedForeground, fontFamily: fonts.body }]}>{item.member_count}</Text>
                  </View>
                )}
              </View>
              <ChevronRight size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <BoardIllustration size={80} />
              <Text style={[s.emptyTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.noResults')}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={userResults}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push('/profile/' + item.id as any)} style={[s.userCard, { backgroundColor: colors.card }]} accessibilityRole="button" accessibilityLabel={`${item.name}${item.naapurusto ? `, ${item.naapurusto}` : ''}`}>
              <Avatar url={item.avatar_url} name={item.name} size={44} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.userName, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>{item.name}</Text>
                {item.naapurusto && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} color={colors.mutedForeground} />
                    <Text style={[s.userNh, { color: colors.mutedForeground, fontFamily: fonts.body }]}>{item.naapurusto}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <BoardIllustration size={80} />
              <Text style={[s.emptyTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.noResults')}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Filter modal */}
      <SearchFilters
        visible={filtersVisible}
        onClose={() => setFiltersVisible(false)}
        filters={filters}
        onApply={handleApplyFilters}
      />
    </View>
  )
}

export default function SearchScreen() {
  return (
    <ScreenErrorBoundary screenName="Search">
      <SearchScreenInner />
    </ScreenErrorBoundary>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: fonts.body },
  filterButton: { position: 'relative', padding: 4 },
  filterBadge: {
    position: 'absolute', top: -2, right: -4,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  filterBadgeText: { fontSize: 9, fontWeight: '700', fontFamily: fonts.bodySemi },
  activeFilterBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  activeFilterInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeFilterText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi },
  saveSearchBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  saveSearchText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium },
  chipSections: { gap: 0 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, minHeight: 36 },
  filterChipOutline: { borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium },
  chipDivider: { width: 1, height: 24, alignSelf: 'center', marginHorizontal: 8, borderRadius: 1 },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },
  list: { padding: 16, paddingBottom: 100 },
  discovery: { padding: 16, gap: 24, paddingBottom: 100 },
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: fonts.headingSemi },
  recentChipsRow: { flexDirection: 'row', gap: 8 },
  recentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1,
  },
  recentChipText: { fontSize: 13, fontFamily: fonts.body },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  historyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyText: { fontSize: 14, fontFamily: fonts.body },
  savedFilterHint: { fontSize: 11, marginTop: 1, fontFamily: fonts.body },
  hintText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  categoryGrid: { gap: 8 },
  categoryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12,
  },
  categoryIconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  categoryCardText: { fontSize: 15, fontWeight: '600', flex: 1, fontFamily: fonts.bodySemi },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: fonts.headingSemi },
  emptyHint: { fontSize: 14, textAlign: 'center', fontFamily: fonts.body },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12 },
  searchEventIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userName: { fontSize: 15, fontWeight: '600', fontFamily: fonts.bodySemi },
  userNh: { fontSize: 13, fontFamily: fonts.body },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentClear: { fontSize: 13, fontWeight: '500', fontFamily: fonts.bodyMedium },
  recentItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  recentText: { fontSize: 14, fontFamily: fonts.body },
  resultCountRow: { paddingHorizontal: 16, paddingVertical: 8 },
  resultCountText: { fontSize: 13, fontWeight: '500', fontFamily: fonts.bodyMedium },
  trendingList: { gap: 8 },
  trendingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
  },
  trendingDot: { width: 8, height: 8, borderRadius: 4 },
  trendingTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },
  trendingCat: { fontSize: 11, marginTop: 1, fontFamily: fonts.body },
  trendingLikes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendingLikeCount: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium },
  semanticLabel: { fontSize: 11, fontWeight: '500', marginBottom: 4, paddingLeft: 2, fontFamily: fonts.bodyMedium },
  // Inline quick-filters
  inlineFilterSection: { borderBottomWidth: StyleSheet.hairlineWidth },
  inlineFilterToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  inlineFilterToggleText: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi },
  inlineFilterPanel: { paddingHorizontal: 16, paddingBottom: 12, gap: 16 },
  inlineFilterGroup: { gap: 8 },
  inlineFilterGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineFilterGroupLabel: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi },
  inlinePriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlinePriceInput: {
    flex: 1, height: 40, borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, fontSize: 14, fontFamily: fonts.body,
  },
  inlinePriceSep: { fontSize: 16, fontFamily: fonts.body },
  inlineChipRow: { flexDirection: 'row', gap: 8 },
  inlineChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  inlineChipText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium },
})
