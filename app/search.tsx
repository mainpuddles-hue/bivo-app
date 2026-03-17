import { useState, useCallback, useMemo, useEffect } from 'react'
import { View, Text, TextInput, FlatList, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { ArrowLeft, Search as SearchIcon, X, SlidersHorizontal, Clock, TrendingUp, MapPin, Bookmark, BookmarkCheck } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { POST_SELECT, CATEGORIES } from '@/lib/constants'
import { PostCard } from '@/components/PostCard'
import type { Post, PostType } from '@/lib/types'

const HISTORY_KEY = 'tackbird-search-history'
const MAX_HISTORY = 10

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

  // Load search history
  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then(stored => {
      if (stored) setHistory(JSON.parse(stored))
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

  const handleSearch = useCallback(async (searchQuery?: string) => {
    const q = (searchQuery ?? query).trim()
    if (!q) return
    setLoading(true)
    setSearched(true)
    addToHistory(q)

    // Search posts
    let postQuery = supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('is_active', true)
      .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(20)

    if (activeFilter) postQuery = postQuery.eq('type', activeFilter)

    const { data: posts } = await postQuery
    setResults((posts ?? []) as unknown as Post[])
    setHasMore((posts ?? []).length >= 20)

    // Search users
    const { data: users } = await supabase
      .from('profiles')
      .select('id, name, avatar_url, naapurusto')
      .ilike('name', `%${q}%`)
      .limit(10)
    setUserResults((users ?? []) as any[])

    setLoading(false)
  }, [query, activeFilter, supabase, addToHistory])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    const q = query.trim()
    let postQuery = supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('is_active', true)
      .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .range(results.length, results.length + 19)

    if (activeFilter) postQuery = postQuery.eq('type', activeFilter)
    const { data } = await postQuery
    const newPosts = (data ?? []) as unknown as Post[]
    setResults(prev => [...prev, ...newPosts])
    setHasMore(newPosts.length >= 20)
    setLoadingMore(false)
  }, [hasMore, loadingMore, query, activeFilter, results.length, supabase])

  const handleCategoryFilter = (type: PostType | null) => {
    setActiveFilter(type)
    if (searched) {
      setResults([])
      setLoading(true)
      // Re-search with new filter
      setTimeout(() => handleSearch(), 0)
    }
  }

  // ── Discovery View (no search yet) ──
  const DiscoveryView = () => (
    <ScrollView contentContainerStyle={s.discovery} showsVerticalScrollIndicator={false}>
      {/* Search history */}
      {history.length > 0 && (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Clock size={16} color={colors.mutedForeground} />
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('search.recentSearches')}</Text>
          </View>
          {history.map((h) => (
            <View key={h} style={s.historyRow}>
              <Pressable onPress={() => { setQuery(h); handleSearch(h) }} style={s.historyBtn}>
                <Clock size={14} color={colors.mutedForeground} />
                <Text style={[s.historyText, { color: colors.foreground }]}>{h}</Text>
              </Pressable>
              <Pressable onPress={() => removeFromHistory(h)} hitSlop={8}>
                <X size={14} color={colors.mutedForeground} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Category shortcuts */}
      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('search.browseByCategory')}</Text>
        <View style={s.categoryGrid}>
          {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).map(([type, cat]) => (
            <Pressable
              key={type}
              onPress={() => { setActiveFilter(type); setQuery(t(cat.label)); handleSearch(t(cat.label)) }}
              style={[s.categoryChip, { backgroundColor: isDark ? cat.bgDark : cat.bgLight }]}
            >
              <View style={[s.categoryDot, { backgroundColor: cat.color }]} />
              <Text style={[s.categoryChipText, { color: colors.foreground }]}>{t(cat.label)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
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
            style={[s.searchInput, { color: colors.foreground }]}
            value={query}
            onChangeText={setQuery}
            placeholder={t('feed.searchPlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            onSubmitEditing={() => handleSearch()}
            returnKeyType="search"
            autoFocus
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(''); setResults([]); setUserResults([]); setSearched(false) }} hitSlop={8}>
              <X size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Category filter chips */}
      {searched && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.filterRow}>
          <Pressable
            onPress={() => handleCategoryFilter(null)}
            style={[s.filterChip, !activeFilter ? { backgroundColor: colors.primary } : { backgroundColor: isDark ? colors.card : colors.muted }]}
          >
            <Text style={[s.filterText, { color: !activeFilter ? colors.primaryForeground : colors.mutedForeground }]}>{t('common.all')}</Text>
          </Pressable>
          {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).map(([type, cat]) => (
            <Pressable
              key={type}
              onPress={() => handleCategoryFilter(type)}
              style={[s.filterChip, activeFilter === type ? { backgroundColor: cat.color } : { backgroundColor: isDark ? colors.card : colors.muted }]}
            >
              <Text style={[s.filterText, { color: activeFilter === type ? '#FFFFFF' : colors.mutedForeground }]}>{t(cat.label)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Results tabs */}
      {searched && !loading && (
        <View style={[s.tabRow, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setActiveTab('posts')} style={[s.tab, activeTab === 'posts' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'posts' ? colors.primary : colors.mutedForeground }]}>
              {t('places.posts')} ({results.length})
            </Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab('users')} style={[s.tab, activeTab === 'users' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'users' ? colors.primary : colors.mutedForeground }]}>
              {t('common.user')} ({userResults.length})
            </Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      {!searched ? (
        <DiscoveryView />
      ) : loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
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
          ListEmptyComponent={
            <View style={s.empty}>
              <SearchIcon size={40} color={colors.mutedForeground} style={{ opacity: 0.3 }} />
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('search.noResults')}</Text>
              <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>{t('search.tryDifferent')}</Text>
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
            <Pressable style={[s.userCard, { backgroundColor: colors.card }]}>
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={s.userAvatar} />
              ) : (
                <View style={[s.userAvatar, { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.mutedForeground }}>{item.name?.charAt(0)?.toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.userName, { color: colors.foreground }]}>{item.name}</Text>
                {item.naapurusto && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} color={colors.mutedForeground} />
                    <Text style={[s.userNh, { color: colors.mutedForeground }]}>{item.naapurusto}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('search.noResults')}</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}
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
  filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  filterText: { fontSize: 12, fontWeight: '500' },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 14, fontWeight: '600' },
  list: { padding: 16, paddingBottom: 20 },
  discovery: { padding: 16, gap: 24, paddingBottom: 40 },
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  historyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyText: { fontSize: 14 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryChipText: { fontSize: 13, fontWeight: '500' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyHint: { fontSize: 14, textAlign: 'center' },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12 },
  userAvatar: { width: 44, height: 44, borderRadius: 22 },
  userName: { fontSize: 15, fontWeight: '600' },
  userNh: { fontSize: 13 },
})
