declare const __DEV__: boolean

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { View, Text, TextInput, FlatList, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { PressableOpacity } from '@/components/ui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Search as SearchIcon, X, SlidersHorizontal, Clock, TrendingUp, MapPin, LayoutGrid, ChevronRight, ChevronDown, Star, Trash2, Heart, CalendarDays, Users, Plus, Bell, BellOff } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SearchSkeleton } from '@/components/SkeletonLoaders'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { resolveLocale, formatPrice } from '@/lib/format'
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
import { isValidUUID } from '@/lib/validation'
import { useSearchSuggestions, type SearchSuggestion } from '@/hooks/useSearchSuggestions'
import { useDemandInsights } from '@/hooks/useDemandInsights'
import type { Post, PostType } from '@/lib/types'

const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`

const HISTORY_KEY = 'tackbird_recent_searches'
const SAVED_SEARCHES_KEY = 'tackbird-saved-searches'
const MAX_HISTORY = 5

type TimeFilter = 'all' | 'today' | 'week' | 'month'

interface SavedSearch {
  id: string
  query: string
  filters: SearchFilterValues
  createdAt: string
  push_enabled?: boolean
  match_count?: number
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

/**
 * Get the first available image URL for a post.
 */
function getPostImageUrl(post: Post): string | null {
  if (post.images && post.images.length > 0) {
    return post.images[0].image_url
  }
  return post.image_url ?? null
}

// ── Extracted components (stable identity across renders) ──

interface DiscoveryViewProps {
  query: string
  setQuery: (q: string) => void
  executeSearch: (q?: string, f?: SearchFilterValues, cat?: PostType | null, tf?: TimeFilter) => void
  history: string[]
  handleHistoryChipTap: (h: string) => void
  removeFromHistory: (q: string) => Promise<void>
  clearHistory: () => Promise<void>
  savedSearches: SavedSearch[]
  loadSavedSearch: (saved: SavedSearch) => void
  removeSavedSearch: (id: string) => Promise<void>
  toggleSearchPush: (id: string) => void
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
  executeSearch, history, handleHistoryChipTap, removeFromHistory, clearHistory,
  savedSearches, loadSavedSearch, removeSavedSearch, toggleSearchPush,
  trendingPosts, demandInsights,
  router, colors, isDark, t, setActiveFilter,
}: DiscoveryViewProps) {
  return (
    <ScrollView contentContainerStyle={s.discovery} showsVerticalScrollIndicator={false}>
      {/* Recent search chips */}
      {history.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Clock size={16} color={colors.mutedForeground} />
            <Text style={[s.sectionTitle, { color: colors.mutedForeground, fontFamily: fonts.bodySemi }]}>{t('search.recentSearches')}</Text>
            <PressableOpacity onPress={clearHistory} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('search.clearHistory') ?? 'Clear history'}>
              <Text style={[s.clearHistoryLink, { color: colors.mutedForeground, fontFamily: fonts.body }]}>{t('search.clearHistory')}</Text>
            </PressableOpacity>
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
            <Text style={[s.sectionTitle, { color: colors.mutedForeground, fontFamily: fonts.bodySemi }]}>{t('search.savedSearches')}</Text>
          </View>
          {savedSearches.map((saved) => {
            const savedFilterCount = countActiveFilters(saved.filters)
            return (
              <View key={saved.id} style={[s.historyRow, { borderBottomColor: colors.border }]}>
                <PressableOpacity
                  onPress={() => loadSavedSearch(saved)}
                  style={s.historyBtn}
                >
                  <SearchIcon size={14} color={colors.foreground} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.historyText, { color: colors.foreground, fontFamily: fonts.body }]}>{saved.query}</Text>
                    {savedFilterCount > 0 && (
                      <Text style={[s.savedFilterHint, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                        {t('search.activeFilters', { count: savedFilterCount })}
                      </Text>
                    )}
                  </View>
                </PressableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {saved.id.includes('-') && (
                    <PressableOpacity onPress={() => toggleSearchPush(saved.id)} hitSlop={8} accessibilityLabel={saved.push_enabled ? t('search.pushOff') : t('search.pushOn')}>
                      {saved.push_enabled ? (
                        <Bell size={14} color={colors.primary} />
                      ) : (
                        <BellOff size={14} color={colors.mutedForeground} />
                      )}
                    </PressableOpacity>
                  )}
                  <PressableOpacity onPress={() => removeSavedSearch(saved.id)} hitSlop={8}>
                    <Trash2 size={14} color={colors.mutedForeground} />
                  </PressableOpacity>
                </View>
              </View>
            )
          })}
        </View>
      )}

      {/* Trending */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <TrendingUp size={16} color={colors.mutedForeground} />
          <Text style={[s.sectionTitle, { color: colors.mutedForeground, fontFamily: fonts.bodySemi }]}>{t('search.trending')}</Text>
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
                  style={[s.trendingCard, { borderBottomColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={tp.title}
                >
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
            <TrendingUp size={16} color={colors.foreground} />
            <Text style={[s.sectionTitle, { color: colors.mutedForeground, fontFamily: fonts.bodySemi }]}>{t('search.demandInsightsTitle')}</Text>
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
          <Text style={[s.sectionTitle, { color: colors.mutedForeground, fontFamily: fonts.bodySemi }]}>{t('search.browseByCategory')}</Text>
        </View>
        <View style={s.categoryGrid}>
          {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).filter(([type]) => {
            if (type === 'lainaa' && !FEATURES.LENDING) return false
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
                style={[s.categoryCard, { borderBottomColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={t(cat.label)}
              >
                <View style={[s.categoryIconBox, { backgroundColor: `${cat.color}15` }]}>
                  {CatIcon && <CatIcon size={20} color={cat.color} />}
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
  isDark: boolean
  t: ReturnType<typeof useI18n>['t']
  onSelectCategory: (type: PostType, label: string) => void
}

function SearchEmptyState({ query, colors, isDark, t, onSelectCategory }: SearchEmptyStateProps) {
  return (
    <View style={s.empty}>
      <View style={[s.emptyIconCircle, { backgroundColor: colors.foreground + '10' }]}>
        <BoardIllustration size={52} />
      </View>
      <Text style={[s.emptyTitle, { color: colors.foreground, fontFamily: fonts.display }]}>
        {query.trim() ? t('search.noResultsQuery', { query: query.trim() }) : t('search.noResults')}
      </Text>
      <Text style={[s.emptyHint, { color: colors.mutedForeground, fontFamily: fonts.body }]}>{t('search.noResultsHint')}</Text>
      <View style={s.emptyCategoryRow}>
        {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).map(([type, cat]) => {
          const CatIcon = CATEGORY_ICON_MAP[cat.icon]
          return (
            <PressableOpacity
              key={type}
              onPress={() => onSelectCategory(type, t(cat.label))}
              style={[s.emptyCategoryChip, { backgroundColor: isDark ? cat.bgDark : cat.bgLight, borderColor: `${cat.color}30` }]}
              accessibilityRole="button"
              accessibilityLabel={t(cat.label)}
            >
              {CatIcon && <CatIcon size={14} color={cat.color} />}
              <Text style={[s.emptyCategoryChipText, { color: cat.color, fontFamily: fonts.bodySemi }]}>{t(cat.label)}</Text>
            </PressableOpacity>
          )
        })}
      </View>
    </View>
  )
}

// ── Active filter chip labels ──

function getActiveFilterLabels(
  filters: SearchFilterValues,
  activeFilter: PostType | null,
  timeFilter: TimeFilter,
  t: ReturnType<typeof useI18n>['t'],
): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = []

  if (activeFilter) {
    const cat = CATEGORIES[activeFilter]
    if (cat) chips.push({ key: 'category', label: t(cat.label) })
  }

  if (timeFilter === 'today') chips.push({ key: 'time', label: t('search.timeToday') })
  else if (timeFilter === 'week') chips.push({ key: 'time', label: t('search.timeWeek') })

  if (filters.minPrice || filters.maxPrice) {
    const min = filters.minPrice || '0'
    const max = filters.maxPrice || '...'
    chips.push({ key: 'price', label: `${min}–${max} €` })
  }

  if (filters.neighborhoods.length > 0) {
    chips.push({ key: 'neighborhoods', label: `${filters.neighborhoods.length} ${t('search.neighborhoods').toLowerCase()}` })
  }

  if (filters.sortBy !== 'newest') {
    const sortLabels: Record<SortOption, string> = {
      newest: t('search.sortNewest'),
      closest: t('search.sortClosest'),
      most_liked: t('search.sortMostLiked'),
      price_asc: t('search.sortPriceLow'),
      price_desc: t('search.sortPriceHigh'),
    }
    chips.push({ key: 'sort', label: sortLabels[filters.sortBy] ?? filters.sortBy })
  }

  if (filters.distanceKm < 50 && filters.userLat != null) {
    chips.push({ key: 'distance', label: t('search.distanceKm', { km: filters.distanceKm }) })
  }

  return chips
}

// ── Sort label for results header ──

function getSortLabel(filters: SearchFilterValues, t: ReturnType<typeof useI18n>['t']): string {
  switch (filters.sortBy) {
    case 'newest': return t('search.sortNewest')
    case 'closest': return t('search.sortNearest')
    case 'most_liked': return t('search.sortPopular')
    case 'price_asc': return t('search.sortPriceLow')
    case 'price_desc': return t('search.sortPriceHigh')
    default: return t('search.sortNewest')
  }
}

const ListSeparator8 = () => <View style={{ height: 8 }} />

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
  const [searchError, setSearchError] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [activeFilter, setActiveFilter] = useState<PostType | null>(null)
  const [activeTab, setActiveTab] = useState<'posts' | 'users' | 'events'>('posts')
  const [userResults, setUserResults] = useState<{ id: string; name: string; avatar_url: string | null; naapurusto: string }[]>([])
  const [eventResults, setEventResults] = useState<{ id: string; title: string; description: string | null; event_date: string | null; location_name: string | null }[]>([])
  const [trendingPosts, setTrendingPosts] = useState<{ id: string; title: string; type: string; like_count: number }[]>([])
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  // Filter state
  const [filtersVisible, setFiltersVisible] = useState(false)
  const [filters, setFilters] = useState<SearchFilterValues>({ ...EMPTY_FILTERS })
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [userNeighborhood, setUserNeighborhood] = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  // "Samankaltaista" — semantic-only matches for the similar section
  const [similarPosts, setSimilarPosts] = useState<Post[]>([])

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
  const mountedRef = useRef(true)

  const filterCount = useMemo(() => countActiveFilters(filters), [filters])

  // Active filter chip labels
  const activeChips = useMemo(
    () => getActiveFilterLabels(filters, activeFilter, timeFilter, t),
    [filters, activeFilter, timeFilter, t],
  )

  // Load trending posts
  useEffect(() => {
    let mounted = true
    supabase
      .from('posts')
      .select('id, title, type, like_count')
      .eq('is_active', true)
      .order('like_count', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) { if (__DEV__) console.warn('[search] trending posts error:', error.message); return }
        if (data) setTrendingPosts((data ?? []) as any[])
      }, () => {})
    return () => { mounted = false }
  }, [supabase])

  // Fetch current user's neighborhood for search ranking
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  useEffect(() => {
    let mounted = true
    getCachedUserId().then(id => {
      if (!mounted || !id) return
      setCurrentUserId(id)
      ;(supabase.from('profiles') as any)
        .select('naapurusto')
        .eq('id', id)
        .maybeSingle()
        .then(({ data }: any) => {
          if (mounted && data?.naapurusto) setUserNeighborhood(data.naapurusto)
        })
    })
    return () => { mounted = false }
  }, [supabase])

  // Load search history + saved searches (prefer Supabase, fallback to AsyncStorage)
  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then(stored => {
      if (stored) try { setHistory(JSON.parse(stored)) } catch (e) { if (__DEV__) console.warn('[search] history parse failed:', e) }
    }).catch((e) => { if (__DEV__) console.warn('[search] history fetch failed:', e) })
    // Load saved searches from Supabase if logged in
    if (currentUserId) {
      Promise.resolve(
        supabase
          .from('saved_searches')
          .select('id, query, filters, push_enabled, match_count, created_at')
          .eq('user_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(20)
      ).then(({ data }) => {
          if (data && data.length > 0) {
            setSavedSearches((data as any[]).map(s => ({
              id: s.id,
              query: s.query,
              filters: s.filters ?? {},
              createdAt: s.created_at,
              push_enabled: s.push_enabled ?? true,
              match_count: s.match_count ?? 0,
            })))
          }
        })
        .catch(() => {
          // Fallback to local
          AsyncStorage.getItem(SAVED_SEARCHES_KEY).then(stored => {
            if (stored) try { setSavedSearches(JSON.parse(stored)) } catch (e) { if (__DEV__) console.warn('[search] saved searches parse failed:', e) }
          }).catch((e) => { if (__DEV__) console.warn('[search] saved searches fallback fetch failed:', e) })
        })
    } else {
      AsyncStorage.getItem(SAVED_SEARCHES_KEY).then(stored => {
        if (stored) try { setSavedSearches(JSON.parse(stored)) } catch (e) { if (__DEV__) console.warn('[search] saved searches parse failed:', e) }
      }).catch((e) => { if (__DEV__) console.warn('[search] saved searches fetch failed:', e) })
    }
  }, [currentUserId, supabase])

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

  const clearHistory = useCallback(async () => {
    setHistory([])
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([]))
  }, [])

  const saveCurrentSearch = useCallback(async () => {
    const q = query.trim()
    if (!q) return

    // Save to Supabase if logged in
    if (currentUserId) {
      const { data, error } = await (supabase.from('saved_searches') as any).upsert(
        { user_id: currentUserId, query: q, filters, push_enabled: true },
        { onConflict: 'user_id,query' },
      ).select('id, query, filters, push_enabled, match_count, created_at').maybeSingle()

      if (!error && data) {
        const newSaved: SavedSearch = {
          id: data.id,
          query: data.query,
          filters: data.filters ?? {},
          createdAt: data.created_at,
          push_enabled: data.push_enabled ?? true,
          match_count: data.match_count ?? 0,
        }
        setSavedSearches(prev => {
          const existing = prev.filter(s => s.id !== data.id && s.query !== q)
          return [newSaved, ...existing].slice(0, 20)
        })
        return
      }
    }

    // Fallback: local-only
    const newSaved: SavedSearch = {
      id: Date.now().toString(),
      query: q,
      filters: { ...filters },
      createdAt: new Date().toISOString(),
      push_enabled: false,
    }
    const updated = [newSaved, ...savedSearches].slice(0, 20)
    setSavedSearches(updated)
    await AsyncStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated))
  }, [query, filters, savedSearches, currentUserId, supabase])

  const removeSavedSearch = useCallback(async (id: string) => {
    const updated = savedSearches.filter(s => s.id !== id)
    setSavedSearches(updated)
    // Delete from Supabase if it looks like a UUID (server-side search)
    if (currentUserId && isValidUUID(id)) {
      await (supabase.from('saved_searches') as any).delete().eq('id', id).catch((e: any) => { if (__DEV__) console.warn('[search] saved search delete failed:', e) })
    }
    await AsyncStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated))
  }, [savedSearches, currentUserId, supabase])

  const toggleSearchPush = useCallback((id: string) => {
    setSavedSearches(prev => prev.map(s => {
      if (s.id !== id) return s
      const newEnabled = !s.push_enabled
      // Update Supabase in background
      if (currentUserId && isValidUUID(id)) {
        (supabase.from('saved_searches') as any)
          .update({ push_enabled: newEnabled })
          .eq('id', id)
          .catch((e: any) => { if (__DEV__) console.warn('[search] push toggle sync failed:', e) })
      }
      return { ...s, push_enabled: newEnabled }
    }))
  }, [currentUserId, supabase])

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

      // Price range (guard against NaN from malformed input)
      if (f.minPrice) {
        const minVal = parseFloat(f.minPrice)
        if (!isNaN(minVal)) q = q.gte('daily_fee', minVal)
      }
      if (f.maxPrice) {
        const maxVal = parseFloat(f.maxPrice)
        if (!isNaN(maxVal)) q = q.lte('daily_fee', maxVal)
      }

      // Date range (validate format before sending to Supabase)
      if (f.postedAfter && /^\d{4}-\d{2}-\d{2}$/.test(f.postedAfter)) {
        const d = new Date(`${f.postedAfter}T00:00:00`)
        if (!isNaN(d.getTime())) q = q.gte('created_at', d.toISOString())
      }
      if (f.postedBefore && /^\d{4}-\d{2}-\d{2}$/.test(f.postedBefore)) {
        const d = new Date(`${f.postedBefore}T23:59:59`)
        if (!isNaN(d.getTime())) q = q.lte('created_at', d.toISOString())
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
    setSearchError(null)
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
        .or(`title.ilike.%${q.replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[(),]/g, '')}%,description.ilike.%${q.replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[(),]/g, '')}%`)

      // Hide disabled category types from search results (same as feed)
      const hiddenTypes: string[] = []
      if (!FEATURES.LENDING) hiddenTypes.push('lainaa')
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

      // Separate: main results = text matches (or high-score), similar = semantic-only
      const mainResults = uniquePosts.filter(p => textResultIds.has(p.id))
      const similar = uniquePosts.filter(p => !textResultIds.has(p.id))

      setResults(mainResults.length > 0 ? mainResults : uniquePosts)
      setSimilarPosts(similar)
      setDbResultCount((posts ?? []).length)
      setHasMore((posts ?? []).length >= 20)

      // Search users and events in parallel
      const [usersSettled, eventsSettled] = await Promise.allSettled([
        supabase
          .from('profiles')
          .select('id, name, avatar_url, naapurusto')
          .ilike('name', `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`)
          .limit(10),
        supabase
          .from('community_events')
          .select('id, title, description, event_date, location_name')
          .eq('is_active', true)
          .or(`title.ilike.%${q.replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[(),]/g, '')}%,description.ilike.%${q.replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[(),]/g, '')}%`)
          .order('event_date', { ascending: true })
          .limit(10)
          .then(res => {
            if (res.error) {
              if (__DEV__) console.log('[search] community_events error:', res.error.message)
              return { ...res, data: [] }
            }
            return res
          }),
      ])
      if (controller.signal.aborted) return

      const usersRes = usersSettled.status === 'fulfilled' ? usersSettled.value : { data: null }
      const eventsRes = eventsSettled.status === 'fulfilled' ? eventsSettled.value : { data: [] }
      let userResultsData = (usersRes.data ?? []) as any[]
      if (blockedIds.size > 0) {
        userResultsData = userResultsData.filter((u: any) => !blockedIds.has(u.id))
      }
      setUserResults(userResultsData)
      setEventResults((eventsRes.data ?? []) as any[])
    } catch (err: any) {
      // Only set error if not aborted and still mounted
      if (!controller.signal.aborted && mountedRef.current) {
        setSearchError(err?.message ?? 'Search failed')
      }
    } finally {
      if (!controller.signal.aborted && mountedRef.current) {
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
      setSimilarPosts([])
      setDbResultCount(0)
      setUserResults([])
      return
    }
    debounceRef.current = setTimeout(() => {
      executeSearch(text)
    }, 300)
  }, [executeSearch])

  // Cleanup debounce + abort on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const q = query.trim()
      const escapedQ = q.replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/[(),]/g, '')
      let postQuery = supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('is_active', true)
        .or(`title.ilike.%${escapedQ}%,description.ilike.%${escapedQ}%`)

      // Hide disabled category types from search results (same as feed)
      const hiddenTypes: string[] = []
      if (!FEATURES.LENDING) hiddenTypes.push('lainaa')
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
            .eq('blocker_id', loadMoreUserId)
          const blockedIds = new Set((blockedData ?? []).map((b: any) => b.blocked_id))
          if (blockedIds.size > 0) {
            newPosts = newPosts.filter(p => !blockedIds.has(p.user_id))
          }
        } catch {
          // blocked_users table may not exist yet — continue without filtering
        }
      }

      const rawCount = (data ?? []).length
      newPosts = sortByDistance(newPosts, filters)
      setDbResultCount(prev => prev + rawCount)
      setResults(prev => [...prev, ...newPosts])
      setHasMore(rawCount >= 20)
    } catch (err) {
      if (__DEV__) console.warn('[search] loadMore error:', err)
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

  // Remove a specific active filter chip
  const removeActiveChip = useCallback((chipKey: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    if (chipKey === 'category') {
      setActiveFilter(null)
      if (searched && query.trim()) {
        setResults([])
        setLoading(true)
        setTimeout(() => executeSearch(undefined, undefined, null), 0)
      }
    } else if (chipKey === 'time') {
      setTimeFilter('all')
      if (searched && query.trim()) {
        setResults([])
        setLoading(true)
        setTimeout(() => executeSearch(undefined, undefined, undefined, 'all'), 0)
      }
    } else if (chipKey === 'price') {
      const newFilters = { ...filters, minPrice: '', maxPrice: '' }
      setFilters(newFilters)
      if (searched && query.trim()) {
        setResults([])
        setLoading(true)
        setTimeout(() => executeSearch(undefined, newFilters), 0)
      }
    } else if (chipKey === 'neighborhoods') {
      const newFilters = { ...filters, neighborhoods: [] }
      setFilters(newFilters)
      if (searched && query.trim()) {
        setResults([])
        setLoading(true)
        setTimeout(() => executeSearch(undefined, newFilters), 0)
      }
    } else if (chipKey === 'sort') {
      const newFilters = { ...filters, sortBy: 'newest' as SortOption }
      setFilters(newFilters)
      if (searched && query.trim()) {
        setResults([])
        setLoading(true)
        setTimeout(() => executeSearch(undefined, newFilters), 0)
      }
    } else if (chipKey === 'distance') {
      const newFilters = { ...filters, distanceKm: 50 }
      setFilters(newFilters)
      if (searched && query.trim()) {
        setResults([])
        setLoading(true)
        setTimeout(() => executeSearch(undefined, newFilters), 0)
      }
    }
  }, [searched, query, executeSearch, filters])

  // Get the post price display
  const getPostPrice = useCallback((post: Post): string | null => {
    if (post.daily_fee != null && post.daily_fee > 0) return formatPrice(post.daily_fee, locale)
    if (post.service_price != null && post.service_price > 0) return formatPrice(post.service_price, locale)
    if (post.type === 'ilmaista') return 'Ilmainen'
    return null
  }, [locale])

  // Get poster name
  const getPostPoster = useCallback((post: Post): string => {
    return post.user?.name ?? ''
  }, [])

  // Get distance string
  const getPostDistance = useCallback((post: Post): string | null => {
    if (filters.userLat == null || filters.userLng == null) return null
    if (post.latitude == null || post.longitude == null) return null
    const km = haversineKm(filters.userLat, filters.userLng, post.latitude, post.longitude)
    if (km < 1) return `${Math.round(km * 1000)} m`
    return `${km.toFixed(1)} km`
  }, [filters.userLat, filters.userLng])

  // ── Render result row for the compact results list ──
  const renderResultRow = useCallback((post: Post, isLast: boolean) => {
    const imageUrl = getPostImageUrl(post)
    const poster = getPostPoster(post)
    const distance = getPostDistance(post)
    const price = getPostPrice(post)
    const metaParts = [poster, distance].filter(Boolean).join(' \u00B7 ')

    return (
      <PressableOpacity
        key={post.id}
        onPress={() => router.push(`/post/${post.id}` as any)}
        style={[
          s.resultRow,
          !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
        ]}
        accessibilityRole="button"
        accessibilityLabel={post.title}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={s.resultImage}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[s.resultImage, s.resultImagePlaceholder, { backgroundColor: colors.muted }]}>
            <SearchIcon size={20} color={colors.mutedForeground} />
          </View>
        )}
        <View style={s.resultInfo}>
          <Text style={[s.resultTitle, { color: colors.foreground, fontFamily: fonts.bodySemi }]} numberOfLines={1}>
            {post.title}
          </Text>
          {metaParts.length > 0 && (
            <Text style={[s.resultMeta, { color: colors.mutedForeground, fontFamily: fonts.body }]} numberOfLines={1}>
              {metaParts}
            </Text>
          )}
          {price && (
            <Text style={[s.resultPrice, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
              {price}
            </Text>
          )}
        </View>
      </PressableOpacity>
    )
  }, [colors, router, getPostPoster, getPostDistance, getPostPrice])

  // ── Render "Samankaltaista" similar card ──
  const renderSimilarCard = useCallback((post: Post) => {
    const imageUrl = getPostImageUrl(post)
    return (
      <PressableOpacity
        key={post.id}
        onPress={() => router.push(`/post/${post.id}` as any)}
        style={[s.similarCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={post.title}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={s.similarImage}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[s.similarImage, { backgroundColor: colors.muted }]}>
            <SearchIcon size={18} color={colors.mutedForeground} />
          </View>
        )}
        <View style={s.similarTitleWrap}>
          <Text style={[s.similarTitle, { color: colors.foreground, fontFamily: fonts.bodyMedium }]} numberOfLines={2}>
            {post.title}
          </Text>
        </View>
      </PressableOpacity>
    )
  }, [colors, router])

  // ── Results content renderer for FlatList ──
  const renderPostResults = useCallback(() => {
    if (results.length === 0) {
      return (
        <SearchEmptyState
          query={query}
          colors={colors}
          isDark={isDark}
          t={t}
          onSelectCategory={(type, label) => {
            setActiveFilter(type)
            setQuery(label)
            executeSearch(label, undefined, type)
          }}
        />
      )
    }

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
      >
        {/* Results section header */}
        <View style={s.resultsHeader}>
          <Text style={[s.resultsCount, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
            {t('search.resultCount', { count: results.length })}
          </Text>
          <PressableOpacity
            onPress={() => setFiltersVisible(true)}
            style={s.sortButton}
            accessibilityRole="button"
            accessibilityLabel={t('search.sortLabel')}
          >
            <Text style={[s.sortLabel, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
              {getSortLabel(filters, t)}
            </Text>
            <ChevronDown size={14} color={colors.foreground} />
          </PressableOpacity>
        </View>

        {/* Results container */}
        <View style={[s.resultsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {results.map((post, idx) => renderResultRow(post, idx === results.length - 1))}
        </View>

        {/* Load more */}
        {loadingMore && (
          <ActivityIndicator size="small" color={colors.mutedForeground} style={{ marginVertical: 16 }} />
        )}
        {hasMore && !loadingMore && (
          <PressableOpacity onPress={loadMore} style={s.loadMoreBtn}>
            <Text style={[s.loadMoreText, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
              {t('search.loadMore')}
            </Text>
          </PressableOpacity>
        )}

        {/* "Samankaltaista" section */}
        {similarPosts.length > 0 && (
          <View style={s.similarSection}>
            <Text style={[s.similarSectionLabel, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
              {t('search.semanticMatch').toUpperCase()}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.similarScroll}>
              {similarPosts.map(renderSimilarCard)}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    )
  }, [results, similarPosts, query, colors, isDark, t, filters, renderResultRow, renderSimilarCard, loadMore, loadingMore, hasMore, executeSearch])

  const renderEventItem = useCallback(({ item }: { item: typeof eventResults[number] }) => (
    <PressableOpacity
      onPress={() => isValidUUID(item.id) && router.push(`/event/${item.id}` as any)}
      style={[s.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={[s.searchEventIcon, { backgroundColor: `${colors.foreground}15` }]}>
        <CalendarDays size={20} color={colors.foreground} />
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
  ), [colors, router, locale])

  const renderUserItem = useCallback(({ item }: { item: typeof userResults[number] }) => (
    <PressableOpacity onPress={() => isValidUUID(item.id) && router.push('/profile/' + item.id as any)} style={[s.userCard, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel={`${item.name}${item.naapurusto ? `, ${item.naapurusto}` : ''}`}>
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
  ), [colors, router])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Top search area — no bar header, direct search */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
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
            maxLength={500}
            accessibilityLabel={t('feed.searchPlaceholder')}
            autoFocus
            accessibilityRole="search"
          />
          {query.length > 0 && (
            <PressableOpacity
              onPress={() => {
                setQuery('')
                setResults([])
                setSimilarPosts([])
                setDbResultCount(0)
                setUserResults([])
                setEventResults([])
                setSearched(false)
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.clear')}
            >
              <X size={18} color={colors.mutedForeground} />
            </PressableOpacity>
          )}
        </View>
        {/* Filter button — 44x44, INK bg, white icon */}
        <PressableOpacity
          onPress={() => setFiltersVisible(true)}
          hitSlop={8}
          style={[s.filterButton, { backgroundColor: colors.foreground }]}
          accessibilityRole="button"
          accessibilityLabel={t('search.filters')}
        >
          <SlidersHorizontal size={20} color={colors.card} />
        </PressableOpacity>
      </View>

      {/* Active filter chips */}
      {searched && activeChips.length > 0 && (
        <View style={s.activeChipsRow}>
          {activeChips.map(chip => (
            <View key={chip.key} style={[s.activeChip, { backgroundColor: colors.foreground }]}>
              <Text style={[s.activeChipText, { color: colors.card, fontFamily: fonts.bodySemi }]}>
                {chip.label}
              </Text>
              <PressableOpacity
                onPress={() => removeActiveChip(chip.key)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`${t('common.remove')} ${chip.label}`}
              >
                <X size={9} color={colors.card} />
              </PressableOpacity>
            </View>
          ))}
          {/* "+ Lisaa" chip */}
          <PressableOpacity
            onPress={() => setFiltersVisible(true)}
            style={[s.addFilterChip, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.more')}
          >
            <Plus size={12} color={colors.foreground} />
            <Text style={[s.addFilterText, { color: colors.foreground, fontFamily: fonts.bodyMedium }]}>
              {t('common.more')}
            </Text>
          </PressableOpacity>
        </View>
      )}

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
                <TrendingUp size={14} color={colors.foreground} />
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

      {/* Results tabs — kept for multi-type search */}
      {searched && !loading && (
        <View style={[s.tabRow, { borderBottomColor: colors.border }]}>
          <PressableOpacity onPress={() => setActiveTab('posts')} style={[s.tab, activeTab === 'posts' && [s.tabActive, { borderBottomColor: colors.foreground }]]} accessibilityRole="tab" accessibilityLabel={t('places.posts')} accessibilityState={{ selected: activeTab === 'posts' }}>
            <Text style={[s.tabText, { color: activeTab === 'posts' ? colors.foreground : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('places.posts')} ({results.length})
            </Text>
          </PressableOpacity>
          <PressableOpacity onPress={() => setActiveTab('users')} style={[s.tab, activeTab === 'users' && [s.tabActive, { borderBottomColor: colors.foreground }]]} accessibilityRole="tab" accessibilityLabel={t('common.user')} accessibilityState={{ selected: activeTab === 'users' }}>
            <Text style={[s.tabText, { color: activeTab === 'users' ? colors.foreground : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('common.user')} ({userResults.length})
            </Text>
          </PressableOpacity>
          <PressableOpacity onPress={() => setActiveTab('events')} style={[s.tab, activeTab === 'events' && [s.tabActive, { borderBottomColor: colors.foreground }]]} accessibilityRole="tab" accessibilityLabel={t('search.tabEvents')} accessibilityState={{ selected: activeTab === 'events' }}>
            <Text style={[s.tabText, { color: activeTab === 'events' ? colors.foreground : colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
              {t('search.tabEvents')} ({eventResults.length})
            </Text>
          </PressableOpacity>
        </View>
      )}

      {/* Error banner */}
      {searchError && searched && !loading && (
        <View style={[s.errorBanner, { backgroundColor: colors.destructive + '18' }]}>
          <Text style={[s.errorText, { color: colors.destructive, fontFamily: fonts.body }]}>
            {searchError}
          </Text>
          <PressableOpacity onPress={() => executeSearch()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.retry') ?? 'Retry'}>
            <Text style={[s.errorRetry, { color: colors.destructive, fontFamily: fonts.bodySemi }]}>
              {t('common.retry') ?? 'Retry'}
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
          clearHistory={clearHistory}
          savedSearches={savedSearches}
          loadSavedSearch={loadSavedSearch}
          removeSavedSearch={removeSavedSearch}
          toggleSearchPush={toggleSearchPush}
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
        renderPostResults()
      ) : activeTab === 'events' ? (
        <FlatList
          data={eventResults}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={renderEventItem}
          ItemSeparatorComponent={ListSeparator8}
          ListEmptyComponent={
            <View style={s.empty}>
              <BoardIllustration size={80} />
              <Text style={[s.emptyTitle, { color: colors.foreground, fontFamily: fonts.display }]}>{query.trim() ? t('search.noResultsQuery', { query: query.trim() }) : t('search.noResults')}</Text>
              <Text style={[s.emptyHint, { color: colors.mutedForeground, fontFamily: fonts.body }]}>{t('search.noResultsHint')}</Text>
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
          renderItem={renderUserItem}
          ItemSeparatorComponent={ListSeparator8}
          ListEmptyComponent={
            <View style={s.empty}>
              <BoardIllustration size={80} />
              <Text style={[s.emptyTitle, { color: colors.foreground, fontFamily: fonts.display }]}>{query.trim() ? t('search.noResultsQuery', { query: query.trim() }) : t('search.noResults')}</Text>
              <Text style={[s.emptyHint, { color: colors.mutedForeground, fontFamily: fonts.body }]}>{t('search.noResultsHint')}</Text>
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

  // ── Error banner ──
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  errorText: { fontSize: 13, flex: 1 },
  errorRetry: { fontSize: 13, marginLeft: 12 },

  // ── Top search area ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    padding: 0,
    margin: 0,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Active filter chips ──
  activeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  activeChipText: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  addFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  addFilterText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },

  // ── Results section header ──
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  resultsCount: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortLabel: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },

  // ── Results container ──
  resultsContainer: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  resultRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  resultImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  resultImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  resultMeta: {
    fontSize: 12,
    lineHeight: 16,
  },
  resultPrice: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 2,
  },

  // ── Load more ──
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  loadMoreText: {
    fontSize: 13,
    lineHeight: 18,
  },

  // ── "Samankaltaista" section ──
  similarSection: {
    marginTop: 24,
    gap: 10,
  },
  similarSectionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  similarScroll: {
    gap: 10,
    paddingRight: 16,
  },
  similarCard: {
    width: 130,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  similarImage: {
    width: '100%',
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  similarTitleWrap: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  similarTitle: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },

  // ── Tabs ──
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 18 },

  // ── Lists ──
  list: { padding: 16, paddingBottom: 100 },
  discovery: { padding: 16, gap: 24, paddingBottom: 100 },

  // ── Discovery sections ──
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 11, fontFamily: fonts.bodySemi, lineHeight: 16, textTransform: 'uppercase', letterSpacing: 1.4, flex: 1 },
  clearHistoryLink: { fontSize: 12, lineHeight: 16 },
  recentChipsRow: { flexDirection: 'row', gap: 8 },
  recentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1,
  },
  recentChipText: { fontSize: 13, fontFamily: fonts.body, lineHeight: 18 },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  historyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyText: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20 },
  savedFilterHint: { fontSize: 12, marginTop: 1, fontFamily: fonts.body, lineHeight: 16 },
  hintText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  categoryGrid: { gap: 0 },
  categoryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 0, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  categoryIconBox: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  categoryCardText: { fontSize: 14, flex: 1, fontFamily: fonts.bodySemi, lineHeight: 20 },

  // ── Empty state ──
  empty: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyIconCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.display, lineHeight: 22 },
  emptyHint: { fontSize: 14, textAlign: 'center', fontFamily: fonts.body, lineHeight: 20 },
  emptyCategoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 },
  emptyCategoryChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  emptyCategoryChipText: { fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 18 },

  // ── User / event / group cards ──
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  searchEventIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  userName: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  userNh: { fontSize: 13, fontFamily: fonts.body, lineHeight: 18 },

  // ── Trending ──
  trendingList: { gap: 0 },
  trendingCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 0, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  trendingTitle: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  trendingCat: { fontSize: 12, marginTop: 1, fontFamily: fonts.body, lineHeight: 16 },
  trendingLikes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trendingLikeCount: { fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 16 },

  // ── Suggestions ──
  suggestionsContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16, paddingVertical: 4,
  },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
  },
  suggestionText: { flex: 1, fontSize: 14, lineHeight: 20 },
  suggestionBadge: { fontSize: 12, lineHeight: 16 },

  // ── Demand chips ──
  demandChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1,
  },
  demandChipCount: { fontSize: 12, lineHeight: 16 },
})
