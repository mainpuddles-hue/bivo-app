import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { View, Text, TextInput, FlatList, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import { ArrowLeft, Search as SearchIcon, X, SlidersHorizontal, Clock, TrendingUp, MapPin, LayoutGrid, ChevronRight, HandHelping, Gift, Heart, Zap, BookOpen, CalendarDays, Star, Trash2 } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SearchSkeleton } from '@/components/SkeletonLoaders'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { createClient } from '@/lib/supabase/client'
import { POST_SELECT, CATEGORIES } from '@/lib/constants'
import { PostCard } from '@/components/PostCard'
import { BoardIllustration } from '@/components/illustrations'
import { SearchFilters, EMPTY_FILTERS, countActiveFilters, type SearchFilterValues, type SortOption } from '@/components/SearchFilters'
import type { Post, PostType } from '@/lib/types'

const CAT_ICON_MAP: Record<string, React.ComponentType<any>> = {
  HandHelping, Gift, Heart, Zap, BookOpen, CalendarDays,
}

const HISTORY_KEY = 'tackbird-search-history'
const RECENT_SEARCHES_KEY = 'tackbird_recent_searches'
const SAVED_SEARCHES_KEY = 'tackbird-saved-searches'
const MAX_HISTORY = 5
const MAX_RECENT = 8

type TimeFilter = 'all' | 'today' | 'week'

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

export default function SearchScreen() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searched, setSearched] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [activeFilter, setActiveFilter] = useState<PostType | null>(null)
  const [activeTab, setActiveTab] = useState<'posts' | 'users'>('posts')
  const [userResults, setUserResults] = useState<{ id: string; name: string; avatar_url: string | null; naapurusto: string }[]>([])
  const [trendingPosts, setTrendingPosts] = useState<{ id: string; title: string; type: string; like_count: number }[]>([])
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [recentSearches, setRecentSearches] = useState<string[]>([])

  // Filter state
  const [filtersVisible, setFiltersVisible] = useState(false)
  const [filters, setFilters] = useState<SearchFilterValues>({ ...EMPTY_FILTERS })
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])

  // Debounce + abort refs
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const filterCount = useMemo(() => countActiveFilters(filters), [filters])

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

  // Load search history + saved searches + recent searches
  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then(stored => {
      if (stored) setHistory(JSON.parse(stored))
    })
    AsyncStorage.getItem(SAVED_SEARCHES_KEY).then(stored => {
      if (stored) setSavedSearches(JSON.parse(stored))
    })
    AsyncStorage.getItem(RECENT_SEARCHES_KEY).then(stored => {
      if (stored) setRecentSearches(JSON.parse(stored))
    })
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

  const loadSavedSearch = useCallback((saved: SavedSearch) => {
    setQuery(saved.query)
    setFilters(saved.filters)
    setTimeout(() => executeSearch(saved.query, saved.filters), 0)
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
            ? Math.hypot(a.latitude - userLat, a.longitude - userLng)
            : Infinity
        const distB =
          b.latitude != null && b.longitude != null
            ? Math.hypot(b.latitude - userLat, b.longitude - userLng)
            : Infinity
        return distA - distB
      })
    },
    []
  )

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

    const f = overrideFilters ?? filters
    const catFilter = overrideCategory !== undefined ? overrideCategory : activeFilter
    const tf = overrideTimeFilter !== undefined ? overrideTimeFilter : timeFilter

    try {
      // Search posts
      let postQuery = supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('is_active', true)
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)

      postQuery = buildFilteredQuery(postQuery, f, catFilter, tf)
      postQuery = postQuery.limit(20)

      const { data: posts } = await postQuery
      // Check if this request was aborted
      if (controller.signal.aborted) return

      let postResults = (posts ?? []) as unknown as Post[]
      postResults = sortByDistance(postResults, f)
      setResults(postResults)
      setHasMore((posts ?? []).length >= 20)

      // Search users
      const { data: users } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, naapurusto')
        .ilike('name', `%${q}%`)
        .limit(10)
      if (controller.signal.aborted) return

      setUserResults((users ?? []) as any[])
    } catch {
      // Request aborted or failed — ignore
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [query, activeFilter, timeFilter, filters, supabase, addToHistory, saveRecentSearch, buildFilteredQuery, sortByDistance])

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
    const q = query.trim()
    let postQuery = supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('is_active', true)
      .or(`title.ilike.%${q}%,description.ilike.%${q}%`)

    postQuery = buildFilteredQuery(postQuery, filters, activeFilter, timeFilter)
    postQuery = postQuery.range(results.length, results.length + 19)

    const { data } = await postQuery
    let newPosts = (data ?? []) as unknown as Post[]
    newPosts = sortByDistance(newPosts, filters)
    setResults(prev => [...prev, ...newPosts])
    setHasMore(newPosts.length >= 20)
    setLoadingMore(false)
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

  // -- Discovery View (no search yet) --
  const DiscoveryView = () => (
    <ScrollView contentContainerStyle={s.discovery} showsVerticalScrollIndicator={false}>
      {/* Recent searches — persistent vertical list */}
      {!query && recentSearches.length > 0 && (
        <View style={s.section}>
          <View style={s.recentHeader}>
            <Text style={[s.sectionTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.recent')}</Text>
            <Pressable onPress={clearRecentSearches}>
              <Text style={[s.recentClear, { color: colors.primary, fontFamily: fonts.bodyMedium }]}>{t('common.clear')}</Text>
            </Pressable>
          </View>
          {recentSearches.map((term, i) => (
            <Pressable key={i} onPress={() => { setQuery(term); saveRecentSearch(term); executeSearch(term) }} style={s.recentItem}>
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
          {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).map(([type, cat]) => {
            const CatIcon = CAT_ICON_MAP[cat.icon]
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

  // -- Empty state --
  const EmptyState = () => (
    <View style={s.empty}>
      <BoardIllustration size={100} />
      <Text style={[s.emptyTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>
        {query.trim() ? t('search.noResultsQuery', { query: query.trim() }) : t('search.noResults')}
      </Text>
      <Text style={[s.emptyHint, { color: colors.mutedForeground, fontFamily: fonts.body }]}>{t('search.tryDifferent')}</Text>
    </View>
  )

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header with search */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
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
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(''); setResults([]); setUserResults([]); setSearched(false) }} hitSlop={8}>
              <X size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
        {/* Filter button */}
        <Pressable onPress={() => setFiltersVisible(true)} hitSlop={8} style={s.filterButton}>
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
              style={[s.filterChip, !activeFilter ? { backgroundColor: colors.primary } : { backgroundColor: isDark ? colors.card : colors.muted }]}
            >
              <Text style={[s.filterText, { color: !activeFilter ? colors.primaryForeground : colors.mutedForeground, fontFamily: fonts.bodyMedium }]}>{t('common.all')}</Text>
            </Pressable>
            {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).map(([type, cat]) => (
              <Pressable
                key={type}
                onPress={() => handleCategoryFilter(type)}
                style={[s.filterChip, activeFilter === type ? { backgroundColor: cat.color } : { backgroundColor: isDark ? colors.card : colors.muted }]}
              >
                <Text style={[s.filterText, { color: activeFilter === type ? '#FFFFFF' : colors.mutedForeground, fontFamily: fonts.bodyMedium }]}>{t(cat.label)}</Text>
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

      {/* Result count */}
      {searched && !loading && results.length > 0 && activeTab === 'posts' && (
        <View style={s.resultCountRow}>
          <Text style={[s.resultCountText, { color: colors.mutedForeground, fontFamily: fonts.bodyMedium }]}>
            {t('search.resultCount', { count: results.length })}
          </Text>
        </View>
      )}

      {/* Results tabs */}
      {searched && !loading && (
        <View style={[s.tabRow, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setActiveTab('posts')} style={[s.tab, activeTab === 'posts' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'posts' ? colors.primary : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('places.posts')} ({results.length})
            </Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab('users')} style={[s.tab, activeTab === 'users' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'users' ? colors.primary : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('common.user')} ({userResults.length})
            </Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      {!searched ? (
        <DiscoveryView />
      ) : loading ? (
        <SearchSkeleton />
      ) : activeTab === 'posts' ? (
        <FlatList
          data={results}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <PostCard post={item} />}
          contentContainerStyle={s.list}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.mutedForeground} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={<EmptyState />}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={userResults}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <Pressable style={[s.userCard, { backgroundColor: colors.card }]}>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={s.userAvatar} />
              ) : (
                <View style={[s.userAvatar, { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.mutedForeground, fontFamily: fonts.bodySemi }}>{item.name?.charAt(0)?.toUpperCase()}</Text>
                </View>
              )}
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
  searchInput: { flex: 1, fontSize: 15 },
  filterButton: { position: 'relative', padding: 4 },
  filterBadge: {
    position: 'absolute', top: -2, right: -4,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  filterBadgeText: { fontSize: 9, fontWeight: '700' },
  activeFilterBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  activeFilterInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeFilterText: { fontSize: 12, fontWeight: '600' },
  saveSearchBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  saveSearchText: { fontSize: 12, fontWeight: '500' },
  chipSections: { gap: 0 },
  filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  filterChipOutline: { borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: '500' },
  chipDivider: { width: 1, height: 20, alignSelf: 'center', marginHorizontal: 4, borderRadius: 1 },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 14, fontWeight: '600' },
  list: { padding: 16, paddingBottom: 20 },
  discovery: { padding: 16, gap: 24, paddingBottom: 40 },
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  recentChipsRow: { flexDirection: 'row', gap: 8 },
  recentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1,
  },
  recentChipText: { fontSize: 13 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  historyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyText: { fontSize: 14 },
  savedFilterHint: { fontSize: 11, marginTop: 1 },
  hintText: { fontSize: 14, lineHeight: 20 },
  categoryGrid: { gap: 8 },
  categoryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12,
  },
  categoryIconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  categoryCardText: { fontSize: 15, fontWeight: '600', flex: 1 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyHint: { fontSize: 14, textAlign: 'center' },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12 },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userName: { fontSize: 15, fontWeight: '600' },
  userNh: { fontSize: 13 },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recentClear: { fontSize: 13, fontWeight: '500' },
  recentItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  recentText: { fontSize: 14 },
  resultCountRow: { paddingHorizontal: 16, paddingVertical: 6 },
  resultCountText: { fontSize: 13, fontWeight: '500' },
  trendingList: { gap: 6 },
  trendingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
  },
  trendingDot: { width: 8, height: 8, borderRadius: 4 },
  trendingTitle: { fontSize: 14, fontWeight: '600' },
  trendingCat: { fontSize: 11, marginTop: 1 },
  trendingLikes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendingLikeCount: { fontSize: 12, fontWeight: '500' },
})
