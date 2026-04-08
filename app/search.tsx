declare const __DEV__: boolean

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { View, Text, TextInput, FlatList, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { PressableOpacity } from '@/components/ui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { ArrowLeft, Search as SearchIcon, X, SlidersHorizontal, Clock, TrendingUp, MapPin, LayoutGrid, ChevronRight, Star, Trash2, Heart, CalendarDays, Users } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SearchSkeleton } from '@/components/SkeletonLoaders'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { resolveLocale } from '@/lib/format'
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
import { useSearchSuggestions, type SearchSuggestion } from '@/hooks/useSearchSuggestions'
import { useDemandInsights } from '@/hooks/useDemandInsights'
import type { Post, PostType } from '@/lib/types'

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`

const HISTORY_KEY = 'tackbird-search-history'
const SAVED_SEARCHES_KEY = 'tackbird-saved-searches'
const MAX_HISTORY = 5

const SearchSeparator16 = () => <View style={{ height: 16 }} />
const SearchSeparator8 = () => <View style={{ height: 8 }} />

type TimeFilter = 'all' | 'today' | 'week' | 'month'

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
  setQuery: (q: string) => void
  executeSearch: (q?: string, f?: SearchFilterValues, cat?: PostType | null, tf?: TimeFilter) => void
  history: string[]
  handleHistoryChipTap: (h: string) => void
  removeFromHistory: (q: string) => Promise<void>
  savedSearches: SavedSearch[]
  loadSavedSearch: (saved: SavedSearch) => void
  removeSavedSearch: (id: string) => Promise<void>
  trendingPosts: { id: string; title: string; type: string; like_count: number }[]
  demandInsights: { tag: string; count: number }[]
  router: ReturnType<typeof useRouter>
  colors: ReturnType<typeof useTheme>['colors']
  isDark: boolean
  t: ReturnType<typeof useI18n>['t']
  setActiveFilter: (f: PostType | null) => void
}

function DiscoveryView({
  query, setQuery,
  executeSearch, history, handleHistoryChipTap, removeFromHistory,
  savedSearches, loadSavedSearch, removeSavedSearch, trendingPosts,
  demandInsights,
  router, colors, isDark, t, setActiveFilter,
}: DiscoveryViewProps) {
  return (
    <ScrollView contentContainerStyle={s.discovery} showsVerticalScrollIndicator={false}>
      {/* Recent search chips */}
      {history.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Clock size={16} color={colors.mutedForeground} />
            <Text style={[s.sectionTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.recentSearches')}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recentChipsRow}>
            {history.map((h) => (
              <PressableOpacity
                key={h}
                onPress={() => handleHistoryChipTap(h)}
                style={[s.recentChip, { backgroundColor: isDark ? colors.card : colors.muted, borderColor: colors.border }]}
              >
                <Clock size={12} color={colors.mutedForeground} />
                <Text style={[s.recentChipText, { color: colors.foreground, fontFamily: fonts.body }]}>{h}</Text>
                <PressableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.()
                    removeFromHistory(h)
                  }}
                  hitSlop={8}
                >
                  <X size={12} color={colors.mutedForeground} />
                </PressableOpacity>
              </PressableOpacity>
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
                <PressableOpacity
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
                </PressableOpacity>
                <PressableOpacity onPress={() => removeSavedSearch(saved.id)} hitSlop={8}>
                  <Trash2 size={14} color={colors.mutedForeground} />
                </PressableOpacity>
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
                <PressableOpacity
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
                </PressableOpacity>
              )
            })}
          </View>
        )}
      </View>

      {/* Demand insights — what neighbors need most */}
      {demandInsights.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <TrendingUp size={16} color={colors.primary} />
            <Text style={[s.sectionTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.demandInsightsTitle')}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.recentChipsRow}>
            {demandInsights.map((d) => (
              <PressableOpacity
                key={d.tag}
                onPress={() => {
                  setQuery(d.tag)
                  executeSearch(d.tag)
                }}
                style={[s.demandChip, { backgroundColor: isDark ? colors.card : colors.muted, borderColor: colors.border }]}
              >
                <Text style={[s.recentChipText, { color: colors.foreground, fontFamily: fonts.bodyMedium }]}>{d.tag}</Text>
                <Text style={[s.demandChipCount, { color: colors.mutedForeground, fontFamily: fonts.body }]}>({d.count})</Text>
              </PressableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

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
              <PressableOpacity
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
              </PressableOpacity>
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
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Post[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searched, setSearched] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [dbResultCount, setDbResultCount] = useState(0)
  const [history, setHistory] = useState<string[]>([])
  const [activeFilter, setActiveFilter] = useState<PostType | null>(null)
  const [activeTab, setActiveTab] = useState<'posts' | 'users' | 'events' | 'groups'>('posts')
  const [userResults, setUserResults] = useState<{ id: string; name: string; avatar_url: string | null; naapurusto: string }[]>([])
  const [eventResults, setEventResults] = useState<{ id: string; title: string; description: string | null; event_date: string | null; location_name: string | null }[]>([])
  const [groupResults, setGroupResults] = useState<{ id: string; name: string; description: string | null; member_count: number | null }[]>([])
  const [trendingPosts, setTrendingPosts] = useState<{ id: string; title: string; type: string; like_count: number }[]>([])
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  // Filter state
  const [filtersVisible, setFiltersVisible] = useState(false)
  const [filters, setFilters] = useState<SearchFilterValues>({ ...EMPTY_FILTERS })
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [userNeighborhood, setUserNeighborhood] = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Search suggestions (trending + personal history)
  const searchSuggestions = useSearchSuggestions()
  const suggestions = useMemo(
    () => searchSuggestions.getSuggestions(query),
    [searchSuggestions.getSuggestions, query],
  )

  // Demand insights for discovery view
  const { demands: demandInsights } = useDemandInsights()

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

  // Fetch current user's neighborhood for search ranking
  useEffect(() => {
    getCachedUserId().then(id => {
      if (!id) return
      ;(supabase.from('profiles') as any)
        .select('naapurusto')
        .eq('id', id)
        .maybeSingle()
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

      // Filter out posts from blocked users
      const searchUserId = await getCachedUserId()
      let blockedIds = new Set<string>()
      if (searchUserId) {
        try {
          const { data: blockedData } = await supabase
            .from('blocked_users')
            .select('blocked_id')
            .eq('blocker_id', searchUserId)
          blockedIds = new Set((blockedData ?? []).map((b: any) => b.blocked_id))
          if (blockedIds.size > 0) {
            postResults = postResults.filter(p => !blockedIds.has(p.user_id))
          }
        } catch {
          // blocked_users table may not exist yet — continue without filtering
        }
      }
      if (controller.signal.aborted) return

      postResults = sortByDistance(postResults, f)
      postResults = rankSearchResults(postResults, { query: q, userNeighborhood })

      // Fetch semantic results in parallel with user search below
      const textResultIds = new Set(postResults.map(p => p.id))
      const semanticResults = await fetchSemanticResults(q)
      if (controller.signal.aborted) return

      // Build similarity lookup from semantic results
      const semanticScoreMap = new Map<string, number>()
      for (const sr of semanticResults) {
        semanticScoreMap.set(sr.post_id, sr.similarity)
      }

      // Fetch semantic-only posts (not already in text results)
      const semanticOnlyIds = semanticResults
        .filter(s => !textResultIds.has(s.post_id))
        .map(s => s.post_id)

      let semanticOnlyPosts: Post[] = []
      if (semanticOnlyIds.length > 0) {
        const { data: extraPosts } = await supabase
          .from('posts')
          .select(POST_SELECT)
          .in('id', semanticOnlyIds)
          .eq('is_active', true)
        if (!controller.signal.aborted && extraPosts) {
          semanticOnlyPosts = (extraPosts as unknown as Post[]).map(p => ({
            ...p,
            _semanticMatch: true,
          }))
        }
      }
      if (controller.signal.aborted) return

      // Unified scoring: combine text and semantic results
      // Text matches get score 1.0; semantic matches get their similarity (0.0-1.0)
      // Posts in both results get max(text, semantic) + 0.2 bonus
      const allPosts = [...postResults, ...semanticOnlyPosts]
      const seenIds = new Set<string>()
      const uniquePosts: (Post & { _hybridScore?: number; _semanticMatch?: boolean })[] = []

      for (const p of allPosts) {
        if (seenIds.has(p.id)) continue
        seenIds.add(p.id)

        const isTextMatch = textResultIds.has(p.id)
        const semanticSimilarity = semanticScoreMap.get(p.id) ?? 0
        const textScore = isTextMatch ? 1.0 : 0
        const inBoth = isTextMatch && semanticSimilarity > 0

        const hybridScore = inBoth
          ? Math.max(textScore, semanticSimilarity) + 0.2
          : Math.max(textScore, semanticSimilarity)

        uniquePosts.push({ ...p, _hybridScore: hybridScore })
      }

      // Sort by hybrid score descending
      uniquePosts.sort((a, b) => (b._hybridScore ?? 0) - (a._hybridScore ?? 0))

      setResults(uniquePosts)
      setDbResultCount((posts ?? []).length)
      setHasMore((posts ?? []).length >= 20)

      // Search users, events, and groups in parallel
      const [usersSettled, eventsSettled, groupsSettled] = await Promise.allSettled([
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

      const usersRes = usersSettled.status === 'fulfilled' ? usersSettled.value : { data: null }
      const eventsRes = eventsSettled.status === 'fulfilled' ? eventsSettled.value : { data: [] }
      const groupsRes = groupsSettled.status === 'fulfilled' ? groupsSettled.value : { data: [] }
      let userResultsData = (usersRes.data ?? []) as any[]
      if (blockedIds.size > 0) {
        userResultsData = userResultsData.filter((u: any) => !blockedIds.has(u.id))
      }
      setUserResults(userResultsData)
      setEventResults((eventsRes.data ?? []) as any[])
      setGroupResults((groupsRes.data ?? []) as any[])
    } catch {
      // Request aborted or failed — ignore
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [query, activeFilter, timeFilter, filters, supabase, addToHistory, buildFilteredQuery, sortByDistance, userNeighborhood, fetchSemanticResults])

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
      setDbResultCount(0)
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
      const escapedQ = q.replace(/%/g, '\\%').replace(/_/g, '\\_')
      let postQuery = supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('is_active', true)
        .or(`title.ilike.%${escapedQ}%,description.ilike.%${escapedQ}%`)

      // Hide disabled category types from search results (same as feed)
      const hiddenTypes: string[] = []
      if (!FEATURES.LENDING) hiddenTypes.push('lainaa')
      if (!FEATURES.GRAB) hiddenTypes.push('nappaa')
      if (hiddenTypes.length > 0 && !activeFilter) {
        postQuery = postQuery.not('type', 'in', `(${hiddenTypes.join(',')})`)
      }

      postQuery = buildFilteredQuery(postQuery, filters, activeFilter, timeFilter)
      postQuery = postQuery.range(dbResultCount, dbResultCount + 19)

      const { data } = await postQuery
      let newPosts = (data ?? []) as unknown as Post[]

      // Filter out posts from blocked users
      const loadMoreUserId = await getCachedUserId()
      if (loadMoreUserId) {
        try {
          const { data: blockedData } = await supabase
            .from('blocked_users')
            .select('blocked_id')
            .eq('user_id', loadMoreUserId)
          const blockedIds = new Set((blockedData ?? []).map((b: any) => b.blocked_id))
          if (blockedIds.size > 0) {
            newPosts = newPosts.filter(p => !blockedIds.has(p.user_id))
          }
        } catch {
          // blocked_users table may not exist yet — continue without filtering
        }
      }

      newPosts = sortByDistance(newPosts, filters)
      setDbResultCount(prev => prev + newPosts.length)
      setResults(prev => [...prev, ...newPosts])
      setHasMore(newPosts.length >= 20)
    } catch {
    } finally {
      setLoadingMore(false)
    }
  }, [hasMore, loadingMore, query, activeFilter, timeFilter, filters, dbResultCount, supabase, buildFilteredQuery, sortByDistance])

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
        <PressableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={24} color={colors.foreground} />
        </PressableOpacity>
        <View style={[s.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SearchIcon size={18} color={colors.mutedForeground} />
          <TextInput
            style={[s.searchInput, { color: colors.foreground, fontFamily: fonts.body }]}
            value={query}
            onChangeText={(text) => { debouncedSearch(text); setShowSuggestions(true) }}
            placeholder={t('feed.searchPlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            onSubmitEditing={() => { setShowSuggestions(false); searchSuggestions.addToHistory(query); executeSearch() }}
            onFocus={() => setShowSuggestions(true)}
            returnKeyType="search"
            autoFocus
            accessibilityLabel={t('feed.searchPlaceholder')}
            accessibilityRole="search"
          />
          {query.length > 0 && (
            <PressableOpacity onPress={() => { setQuery(''); setResults([]); setDbResultCount(0); setUserResults([]); setSearched(false) }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.clear')}>
              <X size={18} color={colors.mutedForeground} />
            </PressableOpacity>
          )}
        </View>
        {/* Filter button */}
        <PressableOpacity onPress={() => setFiltersVisible(true)} hitSlop={8} style={s.filterButton} accessibilityRole="button" accessibilityLabel={t('search.filters')}>
          <SlidersHorizontal size={20} color={filterCount > 0 ? colors.primary : colors.mutedForeground} />
          {filterCount > 0 && (
            <View style={[s.filterBadge, { backgroundColor: colors.primary }]}>
              <Text style={[s.filterBadgeText, { color: colors.primaryForeground }]}>{filterCount}</Text>
            </View>
          )}
        </PressableOpacity>
      </View>

      {/* Search suggestions dropdown */}
      {showSuggestions && !searched && suggestions.length > 0 && (
        <View style={[s.suggestionsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {suggestions.map((suggestion, idx) => (
            <PressableOpacity
              key={`${suggestion.type}-${suggestion.text}-${idx}`}
              onPress={() => {
                setQuery(suggestion.text)
                setShowSuggestions(false)
                searchSuggestions.addToHistory(suggestion.text)
                executeSearch(suggestion.text)
              }}
              style={s.suggestionRow}
            >
              {suggestion.type === 'history' ? (
                <Clock size={14} color={colors.mutedForeground} />
              ) : (
                <TrendingUp size={14} color={colors.primary} />
              )}
              <Text style={[s.suggestionText, { color: colors.foreground, fontFamily: fonts.body }]} numberOfLines={1}>
                {suggestion.text}
              </Text>
              <Text style={[s.suggestionBadge, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                {suggestion.type === 'history' ? t('search.recent') : t('search.trending')}
              </Text>
            </PressableOpacity>
          ))}
        </View>
      )}

      {/* Save search + active filter indicator */}
      {searched && filterCount > 0 && (
        <View style={[s.activeFilterBar, { backgroundColor: `${colors.primary}10`, borderBottomColor: colors.border }]}>
          <PressableOpacity onPress={() => setFiltersVisible(true)} style={s.activeFilterInfo}>
            <SlidersHorizontal size={14} color={colors.primary} />
            <Text style={[s.activeFilterText, { color: colors.primary, fontFamily: fonts.bodySemi }]}>
              {t('search.activeFilters', { count: filterCount })}
            </Text>
          </PressableOpacity>
          <PressableOpacity onPress={saveCurrentSearch} hitSlop={8} style={s.saveSearchBtn}>
            <Star size={14} color={colors.primary} />
            <Text style={[s.saveSearchText, { color: colors.primary, fontFamily: fonts.bodyMedium }]}>{t('search.saveThisSearch')}</Text>
          </PressableOpacity>
        </View>
      )}

      {/* Filter chips: Category + Time + Sort */}
      {searched && (
        <View style={s.chipSections}>
          {/* Category chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.filterRow}>
            <PressableOpacity
              onPress={() => handleCategoryFilter(null)}
              accessibilityRole="button"
              accessibilityLabel={t('common.all')}
              accessibilityState={{ selected: !activeFilter }}
              style={[s.filterChip, !activeFilter ? { backgroundColor: colors.primary } : { backgroundColor: isDark ? colors.card : colors.muted }]}
            >
              <Text style={[s.filterText, { color: !activeFilter ? colors.primaryForeground : colors.mutedForeground, fontFamily: fonts.bodyMedium }]}>{t('common.all')}</Text>
            </PressableOpacity>
            {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).filter(([type]) => {
              if (type === 'lainaa' && !FEATURES.LENDING) return false
              if (type === 'nappaa' && !FEATURES.GRAB) return false
              return true
            }).map(([type, cat]) => (
              <PressableOpacity
                key={type}
                onPress={() => handleCategoryFilter(type)}
                accessibilityRole="button"
                accessibilityLabel={t(cat.label)}
                accessibilityState={{ selected: activeFilter === type }}
                style={[s.filterChip, activeFilter === type ? { backgroundColor: cat.color } : { backgroundColor: isDark ? colors.card : colors.muted }]}
              >
                <Text style={[s.filterText, { color: activeFilter === type ? colors.primaryForeground : colors.mutedForeground, fontFamily: fonts.bodyMedium }]}>{t(cat.label)}</Text>
              </PressableOpacity>
            ))}
          </ScrollView>

          {/* Time + Sort chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.filterRow}>
            {TIME_FILTERS.map(tf => (
              <PressableOpacity
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
              </PressableOpacity>
            ))}
            <View style={[s.chipDivider, { backgroundColor: colors.border }]} />
            {SORT_CHIPS.map(sc => (
              <PressableOpacity
                key={sc.key}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
                  const newFilters = { ...filters, sortBy: sc.key }
                  setFilters(newFilters)
                  if (searched && query.trim()) {
                    setResults([])
                    setDbResultCount(0)
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
              </PressableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Inline quick-filters removed — all filtering via header SearchFilters modal */}

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
          <PressableOpacity onPress={() => setActiveTab('posts')} style={[s.tab, activeTab === 'posts' && [s.tabActive, { borderBottomColor: colors.primary }]]} accessibilityRole="tab" accessibilityLabel={t('places.posts')} accessibilityState={{ selected: activeTab === 'posts' }}>
            <Text style={[s.tabText, { color: activeTab === 'posts' ? colors.primary : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('places.posts')} ({results.length})
            </Text>
          </PressableOpacity>
          <PressableOpacity onPress={() => setActiveTab('users')} style={[s.tab, activeTab === 'users' && [s.tabActive, { borderBottomColor: colors.primary }]]} accessibilityRole="tab" accessibilityLabel={t('common.user')} accessibilityState={{ selected: activeTab === 'users' }}>
            <Text style={[s.tabText, { color: activeTab === 'users' ? colors.primary : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('common.user')} ({userResults.length})
            </Text>
          </PressableOpacity>
          <PressableOpacity onPress={() => setActiveTab('events')} style={[s.tab, activeTab === 'events' && [s.tabActive, { borderBottomColor: colors.primary }]]} accessibilityRole="tab" accessibilityLabel={t('search.tabEvents')} accessibilityState={{ selected: activeTab === 'events' }}>
            <Text style={[s.tabText, { color: activeTab === 'events' ? colors.primary : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('search.tabEvents')} ({eventResults.length})
            </Text>
          </PressableOpacity>
          <PressableOpacity onPress={() => setActiveTab('groups')} style={[s.tab, activeTab === 'groups' && [s.tabActive, { borderBottomColor: colors.primary }]]} accessibilityRole="tab" accessibilityLabel={t('search.tabGroups')} accessibilityState={{ selected: activeTab === 'groups' }}>
            <Text style={[s.tabText, { color: activeTab === 'groups' ? colors.primary : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('search.tabGroups')} ({groupResults.length})
            </Text>
          </PressableOpacity>
        </View>
      )}

      {/* Content */}
      {!searched ? (
        <DiscoveryView
          query={query}
          setQuery={setQuery}
          executeSearch={executeSearch}
          history={history}
          handleHistoryChipTap={handleHistoryChipTap}
          removeFromHistory={removeFromHistory}
          savedSearches={savedSearches}
          loadSavedSearch={loadSavedSearch}
          removeSavedSearch={removeSavedSearch}
          trendingPosts={trendingPosts}
          demandInsights={demandInsights}
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
          data={results}
          keyExtractor={item => item.id}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
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
          ItemSeparatorComponent={SearchSeparator16}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.mutedForeground} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={<SearchEmptyState query={query} colors={colors} t={t} />}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      ) : activeTab === 'events' ? (
        <FlatList
          data={eventResults}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <PressableOpacity
              onPress={() => router.push(`/event/${item.id}` as any)}
              style={[s.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}
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
                    {new Date(item.event_date).toLocaleDateString(resolveLocale(locale), { weekday: 'short', day: 'numeric', month: 'short' })}
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
            </PressableOpacity>
          )}
          ItemSeparatorComponent={SearchSeparator8}
          ListEmptyComponent={
            <View style={s.empty}>
              <BoardIllustration size={80} />
              <Text style={[s.emptyTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.noResults')}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      ) : activeTab === 'groups' ? (
        <FlatList
          data={groupResults}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <PressableOpacity
              onPress={() => router.push(`/groups/${item.id}` as any)}
              style={[s.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}
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
            </PressableOpacity>
          )}
          ItemSeparatorComponent={SearchSeparator8}
          ListEmptyComponent={
            <View style={s.empty}>
              <BoardIllustration size={80} />
              <Text style={[s.emptyTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.noResults')}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      ) : (
        <FlatList
          data={userResults}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <PressableOpacity onPress={() => router.push('/profile/' + item.id as any)} style={[s.userCard, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={`${item.name}${item.naapurusto ? `, ${item.naapurusto}` : ''}`}>
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
            </PressableOpacity>
          )}
          ItemSeparatorComponent={SearchSeparator8}
          ListEmptyComponent={
            <View style={s.empty}>
              <BoardIllustration size={80} />
              <Text style={[s.emptyTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>{t('search.noResults')}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
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
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, height: 48,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.body, lineHeight: 20 },
  filterButton: { position: 'relative', padding: 4 },
  filterBadge: {
    position: 'absolute', top: -2, right: -4,
    minWidth: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  filterBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: fonts.bodySemi, lineHeight: 16 },
  activeFilterBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  activeFilterInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeFilterText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 16 },
  saveSearchBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  saveSearchText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 16 },
  chipSections: { gap: 0 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, minHeight: 36, justifyContent: 'center' as const },
  filterChipOutline: { borderWidth: 1 },
  filterText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 16 },
  chipDivider: { width: 1, height: 24, alignSelf: 'center', marginHorizontal: 8, borderRadius: 1 },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 20 },
  list: { padding: 16, paddingBottom: 100 },
  discovery: { padding: 16, gap: 24, paddingBottom: 100 },
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', fontFamily: fonts.headingSemi, lineHeight: 22 },
  recentChipsRow: { flexDirection: 'row', gap: 8 },
  recentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1,
  },
  recentChipText: { fontSize: 13, fontFamily: fonts.body, lineHeight: 18 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  historyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyText: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20 },
  savedFilterHint: { fontSize: 11, marginTop: 1, fontFamily: fonts.body, lineHeight: 16 },
  hintText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  categoryGrid: { gap: 8 },
  categoryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 16, borderRadius: 12,
  },
  categoryIconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  categoryCardText: { fontSize: 14, fontWeight: '600', flex: 1, fontFamily: fonts.bodySemi, lineHeight: 20 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: fonts.headingSemi, lineHeight: 22 },
  emptyHint: { fontSize: 14, textAlign: 'center', fontFamily: fonts.body, lineHeight: 20 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  searchEventIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userName: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 20 },
  userNh: { fontSize: 13, fontFamily: fonts.body, lineHeight: 18 },
  resultCountRow: { paddingHorizontal: 16, paddingVertical: 8 },
  resultCountText: { fontSize: 13, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 18 },
  trendingList: { gap: 8 },
  trendingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
  },
  trendingDot: { width: 10, height: 10, borderRadius: 5 },
  trendingTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 20 },
  trendingCat: { fontSize: 11, marginTop: 1, fontFamily: fonts.body, lineHeight: 16 },
  trendingLikes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendingLikeCount: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 16 },
  semanticLabel: { fontSize: 11, fontWeight: '500', marginBottom: 4, paddingLeft: 2, fontFamily: fonts.bodyMedium, lineHeight: 16 },
  suggestionsContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16, paddingVertical: 4,
  },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10,
  },
  suggestionText: { flex: 1, fontSize: 14, lineHeight: 20 },
  suggestionBadge: { fontSize: 11, lineHeight: 16 },
  demandChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1,
  },
  demandChipCount: { fontSize: 11, lineHeight: 16 },
})
