declare const __DEV__: boolean

import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet, ActivityIndicator, Alert, Animated, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import {
  ArrowLeft, Bookmark, BookmarkCheck, CalendarDays, MapPin,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { PostCard } from '@/components/PostCard'
import { EmptyState } from '@/components/EmptyState'
import { PostCardSkeleton } from '@/components/SkeletonLoaders'
import { getCachedUserId } from '@/lib/authCache'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import type { Post } from '@/lib/types'

type SavedTab = 'posts' | 'events' | 'places'

interface SavedEvent {
  id: string
  title: string
  event_date: string
  location: string | null
  event_type: 'city' | 'community'
  name_fi?: string
}

interface SavedPlace {
  id: string
  name: string
  category: string | null
  address: string | null
}

function SavedScreenInner() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<SavedTab>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [events, setEvents] = useState<SavedEvent[]>([])
  const [places, setPlaces] = useState<SavedPlace[]>([])
  const [unsavingId, setUnsavingId] = useState<string | null>(null)

  const loadSaved = useCallback(async () => {
    try {
      const cachedId = await getCachedUserId()
      if (!cachedId) { router.replace('/(auth)/login'); setLoading(false); setRefreshing(false); return }
      const user = { id: cachedId }

      // Fetch saved posts, events, and places in parallel
      const [savedPostsRes, savedEventsRes, savedPlacesRes] = await Promise.all([
        supabase
          .from('saved_posts')
          .select(`
            post_id,
            posts(
              id, user_id, type, title, description, location, image_url,
              daily_fee, service_price, is_pro_listing, tags, is_active, created_at, updated_at,
              like_count, comment_count, expires_at, is_urgent, urgency_hours
            )
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('saved_events')
          .select('event_id, event_type')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .then(res => {
            if (res.error) {
              if (__DEV__) console.log('[saved] saved_events error:', res.error.message)
              return { ...res, data: [] }
            }
            return res
          }),
        supabase
          .from('saved_places')
          .select('place_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .then(res => {
            if (res.error) {
              if (__DEV__) console.log('[saved] saved_places error:', res.error.message)
              return { ...res, data: [] }
            }
            return res
          }),
      ])

      // Process posts
      const savedPosts = ((savedPostsRes.data ?? []) as any[])
        .map((s: any) => s.posts)
        .filter(Boolean) as Post[]
      setPosts(savedPosts)

      // Fetch event details
      const savedEventRows = savedEventsRes.data ?? []
      const cityEventIds = (savedEventRows as any[]).filter(e => e.event_type === 'city').map(e => e.event_id)
      const communityEventIds = (savedEventRows as any[]).filter(e => e.event_type === 'community').map(e => e.event_id)

      const allEvents: SavedEvent[] = []

      if (communityEventIds.length > 0) {
        const { data: communityEvents } = await supabase
          .from('events')
          .select('id, title, event_date, location_name')
          .in('id', communityEventIds)
        ;(communityEvents ?? []).forEach((e: any) => {
          allEvents.push({
            id: e.id,
            title: e.title,
            event_date: e.event_date,
            location: e.location_name,
            event_type: 'community',
          })
        })
      }

      if (cityEventIds.length > 0) {
        const { data: cityEvents } = await supabase
          .from('city_events')
          .select('id, name_fi, name_en, name_sv, start_time, location_name')
          .in('id', cityEventIds)
        ;(cityEvents ?? []).forEach((e: any) => {
          const name = locale === 'fi' ? e.name_fi : locale === 'sv' ? (e.name_sv || e.name_fi) : (e.name_en || e.name_fi)
          allEvents.push({
            id: e.id,
            title: name || e.name_fi,
            event_date: e.start_time,
            location: e.location_name,
            event_type: 'city',
            name_fi: e.name_fi,
          })
        })
      }

      setEvents(allEvents)

      // Fetch place details
      const placeIds = (savedPlacesRes.data ?? []).map((p: any) => p.place_id)
      if (placeIds.length > 0) {
        const { data: placeData, error: placesError } = await supabase
          .from('local_places')
          .select('id, name, category, address')
          .in('id', placeIds)
        if (placesError) {
          if (__DEV__) console.log('[saved] local_places error:', placesError.message)
          // Continue — just don't show saved places
        } else {
          setPlaces((placeData ?? []) as SavedPlace[])
        }
      }

    } catch (err) {
      if (__DEV__) console.warn('[saved] loadSaved failed:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase, router, locale])

  useEffect(() => { loadSaved() }, [loadSaved])

  const handleUnsavePost = useCallback(async (postId: string) => {
    if (unsavingId) return
    setUnsavingId(postId)
    let removedPost: Post | undefined
    setPosts(current => {
      removedPost = current.find(post => post.id === postId)
      return current.filter(post => post.id !== postId)
    })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      await (supabase.from('saved_posts') as any).delete().eq('post_id', postId).eq('user_id', user.id)
    } catch {
      if (removedPost) {
        const restored = removedPost
        setPosts(current => [restored, ...current])
      }
      Alert.alert(t('common.error'))
    } finally {
      setUnsavingId(null)
    }
  }, [unsavingId, supabase, t])

  const handleUnsaveEvent = useCallback(async (eventId: string, eventType: string) => {
    const prev = events
    setEvents(e => e.filter(ev => ev.id !== eventId))
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      await (supabase.from('saved_events') as any).delete().eq('event_id', eventId).eq('user_id', user.id)
    } catch {
      setEvents(prev)
      Alert.alert(t('common.error'))
    }
  }, [events, supabase, t])

  const handleUnsavePlace = useCallback(async (placeId: string) => {
    const prev = places
    setPlaces(p => p.filter(pl => pl.id !== placeId))
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      await (supabase.from('saved_places') as any).delete().eq('place_id', placeId).eq('user_id', user.id)
    } catch {
      setPlaces(prev)
      Alert.alert(t('common.error'))
    }
  }, [places, supabase, t])

  const tabs: { key: SavedTab; label: string; count: number }[] = [
    { key: 'posts', label: t('saved.tabPosts'), count: posts.length },
    { key: 'events', label: t('saved.tabEvents'), count: events.length },
    { key: 'places', label: t('saved.tabPlaces'), count: places.length },
  ]

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('saved.title')}</Text>
      </View>

      {/* Tab switcher */}
      <View style={[s.tabBar, { backgroundColor: colors.muted }]}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[s.tabItem, activeTab === tab.key && [s.tabItemActive, { backgroundColor: colors.background }]]}
          >
            <Text style={[s.tabText, { color: activeTab === tab.key ? colors.foreground : colors.mutedForeground }]}>
              {tab.label}
            </Text>
            {tab.count > 0 && (
              <View style={[s.tabBadge, { backgroundColor: activeTab === tab.key ? `${colors.primary}20` : `${colors.mutedForeground}15` }]}>
                <Text style={[s.tabBadgeText, { color: activeTab === tab.key ? colors.primary : colors.mutedForeground }]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={s.content}>
          <PostCardSkeleton />
          <PostCardSkeleton />
          <PostCardSkeleton />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSaved() }} tintColor={colors.primary} />}>
          {/* Posts tab */}
          {activeTab === 'posts' && (
            posts.length === 0 ? (
              <EmptyState
                icon={<Bookmark size={36} color={colors.primary} />}
                title={t('saved.empty')}
                description={t('saved.emptyHint')}
                actionLabel={t('saved.browse')}
                onAction={() => router.push('/')}
              />
            ) : (
              posts.map((post) => (
                <View key={post.id} style={s.savedItem}>
                  <PostCard post={post} />
                  <Pressable
                    onPress={() => handleUnsavePost(post.id)}
                    disabled={unsavingId === post.id}
                    style={[s.unsaveBtn, { backgroundColor: colors.card }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('saved.unsave')}
                  >
                    <BookmarkCheck size={16} color={colors.primary} />
                  </Pressable>
                </View>
              ))
            )
          )}

          {/* Events tab */}
          {activeTab === 'events' && (
            events.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={36} color={colors.primary} />}
                title={t('saved.emptyEvents')}
                description={t('saved.emptyEventsHint')}
              />
            ) : (
              events.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => router.push(`/event/${event.id}` as any)}
                  style={[s.eventCard, { backgroundColor: colors.card }]}
                  accessibilityRole="button"
                  accessibilityLabel={event.title}
                >
                  <View style={[s.eventIcon, { backgroundColor: `${colors.primary}15` }]}>
                    <CalendarDays size={20} color={colors.primary} />
                  </View>
                  <View style={s.eventInfo}>
                    <Text style={[s.eventTitle, { color: colors.foreground }]} numberOfLines={2}>{event.title}</Text>
                    <Text style={[s.eventDate, { color: colors.mutedForeground }]}>
                      {new Date(event.event_date).toLocaleDateString(locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB', {
                        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                    {event.location && (
                      <View style={s.eventLocationRow}>
                        <MapPin size={12} color={colors.mutedForeground} />
                        <Text style={[s.eventLocation, { color: colors.mutedForeground }]} numberOfLines={1}>{event.location}</Text>
                      </View>
                    )}
                  </View>
                  <Pressable onPress={() => handleUnsaveEvent(event.id, event.event_type)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('saved.unsave')}>
                    <BookmarkCheck size={18} color={colors.primary} />
                  </Pressable>
                </Pressable>
              ))
            )
          )}

          {/* Places tab */}
          {activeTab === 'places' && (
            places.length === 0 ? (
              <EmptyState
                icon={<MapPin size={36} color={colors.primary} />}
                title={t('saved.emptyPlaces')}
                description={t('saved.emptyPlacesHint')}
              />
            ) : (
              places.map((place) => (
                <Pressable
                  key={place.id}
                  onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' ' + (place.address ?? ''))}`)}
                  style={[s.eventCard, { backgroundColor: colors.card }]}
                >
                  <View style={[s.eventIcon, { backgroundColor: `${colors.primary}15` }]}>
                    <MapPin size={20} color={colors.primary} />
                  </View>
                  <View style={s.eventInfo}>
                    <Text style={[s.eventTitle, { color: colors.foreground }]} numberOfLines={2}>{place.name}</Text>
                    {place.category && (
                      <Text style={[s.eventDate, { color: colors.mutedForeground, textTransform: 'capitalize' }]}>{place.category}</Text>
                    )}
                    {place.address && (
                      <View style={s.eventLocationRow}>
                        <MapPin size={12} color={colors.mutedForeground} />
                        <Text style={[s.eventLocation, { color: colors.mutedForeground }]} numberOfLines={1}>{place.address}</Text>
                      </View>
                    )}
                  </View>
                  <Pressable onPress={() => handleUnsavePlace(place.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('saved.unsave')}>
                    <BookmarkCheck size={18} color={colors.primary} />
                  </Pressable>
                </Pressable>
              ))
            )
          )}
        </ScrollView>
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
  headerTitle: { fontSize: 20, letterSpacing: -0.3, fontFamily: fonts.headingSemi, lineHeight: 28 },
  tabBar: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 12, borderRadius: 12,
    padding: 4, gap: 4,
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, borderRadius: 8,
  },
  tabItemActive: { borderRadius: 8 },
  tabText: { fontSize: 13, lineHeight: 18, fontFamily: fonts.bodySemi },
  tabBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  tabBadgeText: { fontSize: 11, lineHeight: 16, fontFamily: fonts.heading },
  content: { padding: 16, gap: 12, paddingBottom: 100 },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyTitle: { fontSize: 16, lineHeight: 22, fontFamily: fonts.bodySemi },
  emptyHint: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20, fontFamily: fonts.body },
  browseBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  browseBtnText: { fontSize: 14, lineHeight: 20, fontFamily: fonts.bodySemi },
  savedItem: { position: 'relative' },
  unsaveBtn: {
    position: 'absolute', top: 8, right: 8, zIndex: 10,
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  eventCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 12,
  },
  eventIcon: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  eventInfo: { flex: 1, gap: 2 },
  eventTitle: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  eventDate: { fontSize: 12, lineHeight: 16, fontFamily: fonts.body },
  eventLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  eventLocation: { fontSize: 12, lineHeight: 16, fontFamily: fonts.body },
})

export default function SavedScreen() {
  return (
    <ScreenErrorBoundary screenName="Saved">
      <SavedScreenInner />
    </ScreenErrorBoundary>
  )
}
