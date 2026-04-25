declare const __DEV__: boolean

import { useState, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, ScrollView, RefreshControl, Pressable,
  StyleSheet, Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import {
  ArrowLeft, Heart, CalendarDays, MapPin, Bookmark,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { EmptyState } from '@/components/EmptyState'
import { PostCardSkeleton } from '@/components/SkeletonLoaders'
import { getCachedUserId } from '@/lib/authCache'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { getImageUrl } from '@/lib/imageUtils'
import { ImageWithFallback } from '@/components/ImageWithFallback'
import { formatPrice } from '@/lib/format'
import type { Post } from '@/lib/types'

type SavedTab = 'all' | 'posts' | 'events'

interface SavedEvent {
  id: string
  title: string
  event_date: string
  location: string | null
  event_type: 'city' | 'community'
  name_fi?: string
}

const SCREEN_WIDTH = Dimensions.get('window').width
const GRID_GAP = 10
const GRID_PADDING = 12
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2

function SavedScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<SavedTab>('all')
  const [posts, setPosts] = useState<Post[]>([])
  const [events, setEvents] = useState<SavedEvent[]>([])
  const [unsavingId, setUnsavingId] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const mountedRef = useRef(true)

  const loadSaved = useCallback(async () => {
    setFetchError(false)
    try {
      const cachedId = await getCachedUserId()
      if (!mountedRef.current) return
      if (!cachedId) { router.replace('/(auth)/login'); setLoading(false); setRefreshing(false); return }
      const user = { id: cachedId }

      // Fetch saved posts and events in parallel
      const [savedPostsRes, savedEventsRes] = await Promise.all([
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
      ])

      if (!mountedRef.current) return

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
          .from('community_events')
          .select('id, title, event_date, location_name')
          .in('id', communityEventIds)
        if (!mountedRef.current) return
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
        if (!mountedRef.current) return
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

      if (!mountedRef.current) return
      setEvents(allEvents)
    } catch (err) {
      if (__DEV__) console.warn('[saved] loadSaved failed:', err)
      if (!mountedRef.current) return
      setFetchError(true)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [supabase, router, locale])

  useFocusEffect(useCallback(() => {
    mountedRef.current = true
    loadSaved()
    return () => { mountedRef.current = false }
  }, [loadSaved]))

  const handleUnsavePost = useCallback(async (postId: string) => {
    if (unsavingId) return
    setUnsavingId(postId)
    let removedPost: Post | undefined
    setPosts(current => {
      removedPost = current.find(post => post.id === postId)
      return current.filter(post => post.id !== postId)
    })
    try {
      const cachedId = await getCachedUserId()
      if (!cachedId) throw new Error('Not authenticated')
      const { error: unsaveErr } = await (supabase.from('saved_posts') as any).delete().eq('post_id', postId).eq('user_id', cachedId)
      if (unsaveErr) throw unsaveErr
    } catch {
      if (removedPost) {
        const restored = removedPost
        setPosts(current => [restored, ...current])
      }
      toast.show({ message: t('common.error'), type: 'error' })
    } finally {
      setUnsavingId(null)
    }
  }, [unsavingId, supabase, t, toast])

  const handleUnsaveEvent = useCallback(async (eventId: string, _eventType: string) => {
    let removedEvent: typeof events[number] | undefined
    setEvents(e => {
      removedEvent = e.find(ev => ev.id === eventId)
      return e.filter(ev => ev.id !== eventId)
    })
    try {
      const cachedId = await getCachedUserId()
      if (!cachedId) throw new Error('Not authenticated')
      const { error } = await (supabase.from('saved_events') as any).delete().eq('event_id', eventId).eq('user_id', cachedId)
      if (error) throw error
    } catch {
      if (removedEvent) {
        const restored = removedEvent
        setEvents(current => [restored, ...current])
      }
      toast.show({ message: t('common.error'), type: 'error' })
    }
  }, [supabase, t, toast])

  // Derive display price for a post
  const getPostPrice = (post: Post): string => {
    if (post.type === 'ilmaista') return t('saved.freePrice')
    if (post.daily_fee != null && post.daily_fee > 0) {
      return `${formatPrice(post.daily_fee, locale)} ${t('saved.perDayShort')}`
    }
    if (post.service_price != null && post.service_price > 0) {
      return formatPrice(post.service_price, locale)
    }
    return t('saved.freePrice')
  }

  // Tab definitions
  const tabs = useMemo((): { key: SavedTab; label: string; count: number }[] => [
    { key: 'all', label: t('saved.tabAll'), count: posts.length + events.length },
    { key: 'posts', label: t('saved.tabPosts'), count: posts.length },
    { key: 'events', label: t('saved.tabEvents'), count: events.length },
  ], [locale, posts.length, events.length, t])

  // Items to display based on active tab
  const showPosts = activeTab === 'all' || activeTab === 'posts'
  const showEvents = activeTab === 'all' || activeTab === 'events'
  const isEmpty = (showPosts ? posts.length : 0) + (showEvents ? events.length : 0) === 0

  // Build pairs for 2-column grid layout of posts — memoized
  const postRows = useMemo(() => {
    if (!showPosts) return []
    const rows: Post[][] = []
    for (let i = 0; i < posts.length; i += 2) {
      rows.push(posts.slice(i, i + 2))
    }
    return rows
  }, [showPosts, posts])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* ── Bar header: circle back + centered title ── */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [
            s.backCircle,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <ArrowLeft size={13} color={colors.foreground} />
        </Pressable>
        <View style={s.headerTitleWrap}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>
            {t('saved.title')}
          </Text>
        </View>
        {/* Spacer to balance the back button */}
        <View style={s.headerSpacer} />
      </View>

      {/* ── Segment control (Helsinki Monochrome) ── */}
      <View style={s.tabBarWrap}>
        <View style={[s.segmentContainer, { backgroundColor: colors.muted }]}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[
                  s.segmentTab,
                  isActive && [s.segmentTabActive, {
                    backgroundColor: colors.card,
                    // Subtle shadow for active segment
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.08,
                    shadowRadius: 3,
                    elevation: 2,
                  }],
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    s.segmentTabText,
                    { color: isActive ? colors.foreground : colors.mutedForeground },
                  ]}
                >
                  {tab.label}
                </Text>
                {tab.count > 0 && (
                  <Text
                    style={[
                      s.segmentTabCount,
                      { color: isActive ? colors.foreground : colors.tertiaryForeground },
                    ]}
                  >
                    {tab.count}
                  </Text>
                )}
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* ── Content ── */}
      {loading ? (
        <View style={s.loadingWrap}>
          <PostCardSkeleton />
          <PostCardSkeleton />
          <PostCardSkeleton />
        </View>
      ) : fetchError ? (
        <View style={s.errorCenter}>
          <Bookmark size={40} color={colors.mutedForeground} />
          <Text style={[s.errorTitle, { color: colors.foreground }]}>
            {t('common.error')}
          </Text>
          <PressableOpacity
            onPress={() => { setLoading(true); loadSaved() }}
            style={[s.retryBtn, { backgroundColor: colors.foreground }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
          >
            <Text style={[s.retryBtnText, { color: colors.background }]}>
              {t('common.retry')}
            </Text>
          </PressableOpacity>
        </View>
      ) : isEmpty ? (
        <EmptyState
          icon={<Bookmark size={36} color={colors.foreground} />}
          title={t('saved.empty')}
          description={t('saved.emptyHint')}
          actionLabel={t('saved.browse')}
          onAction={() => router.push('/')}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadSaved() }}
              tintColor={colors.foreground}
            />
          }
        >
          {/* ── Posts grid (2-col) ── */}
          {showPosts && postRows.map((row, rowIdx) => (
            <View key={`row-${rowIdx}`} style={s.gridRow}>
              {row.map((post) => {
                const imageUri = getImageUrl(post.image_url, 'thumbnail')
                return (
                  <Pressable
                    key={post.id}
                    onPress={() => router.push(`/post/${post.id}` as any)}
                    style={({ pressed }) => [
                      s.gridCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                        width: CARD_WIDTH,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={post.title}
                  >
                    {/* Image */}
                    <View style={s.gridImageWrap}>
                      {imageUri ? (
                        <ImageWithFallback
                          uri={imageUri}
                          imageSize="thumbnail"
                          style={s.gridImage}
                          contentFit="cover"
                          fallbackIcon={<Bookmark size={24} color={colors.tertiaryForeground} />}
                        />
                      ) : (
                        <View style={[s.gridImagePlaceholder, { backgroundColor: colors.muted }]}>
                          <Bookmark size={24} color={colors.tertiaryForeground} />
                        </View>
                      )}
                      {/* Heart overlay */}
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.()
                          handleUnsavePost(post.id)
                        }}
                        disabled={unsavingId === post.id}
                        style={({ pressed }) => [s.heartOverlay, { backgroundColor: 'rgba(0,0,0,0.45)', opacity: pressed && unsavingId !== post.id ? 0.6 : 1 }]}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t('saved.unsave')}
                      >
                        <Heart size={13} color="#F5F6F7" fill="#F5F6F7" />
                      </Pressable>
                    </View>

                    {/* Info */}
                    <View style={s.gridInfo}>
                      <Text
                        style={[s.gridTitle, { color: colors.foreground }]}
                        numberOfLines={1}
                      >
                        {post.title}
                      </Text>
                      {post.location && (
                        <Text
                          style={[s.gridMeta, { color: colors.mutedForeground }]}
                          numberOfLines={1}
                        >
                          {post.location}
                        </Text>
                      )}
                      <Text style={[s.gridPrice, { color: colors.foreground }]}>
                        {getPostPrice(post)}
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
              {/* Fill empty space if odd number of items in last row */}
              {row.length === 1 && <View style={s.gridSpacer} />}
            </View>
          ))}

          {/* ── Events list ── */}
          {showEvents && events.length > 0 && (
            <View style={s.eventsSection}>
              {showPosts && posts.length > 0 && (
                <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
                  {t('saved.tabEvents').toUpperCase()}
                </Text>
              )}
              {events.map((event) => (
                <Pressable
                  key={event.id}
                  onPress={() => router.push(`/event/${event.id}` as any)}
                  style={({ pressed }) => [
                    s.eventCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={event.title}
                >
                  <View style={[s.eventIcon, { backgroundColor: colors.muted }]}>
                    <CalendarDays size={20} color={colors.mutedForeground} />
                  </View>
                  <View style={s.eventInfo}>
                    <Text
                      style={[s.eventTitle, { color: colors.foreground }]}
                      numberOfLines={2}
                    >
                      {event.title}
                    </Text>
                    <Text style={[s.eventDate, { color: colors.mutedForeground }]}>
                      {event.event_date
                        ? new Date(event.event_date).toLocaleDateString(
                            locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB',
                            { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
                          )
                        : '—'}
                    </Text>
                    {event.location && (
                      <View style={s.eventLocationRow}>
                        <MapPin size={12} color={colors.mutedForeground} />
                        <Text
                          style={[s.eventLocation, { color: colors.mutedForeground }]}
                          numberOfLines={1}
                        >
                          {event.location}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Pressable
                    onPress={() => handleUnsaveEvent(event.id, event.event_type)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('saved.unsave')}
                    style={({ pressed }) => [s.eventUnsaveBtn, pressed && { opacity: 0.6 }]}
                  >
                    <Heart size={18} color={colors.foreground} fill={colors.foreground} />
                  </Pressable>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },

  /* ── Error / Retry ── */
  errorCenter: { alignItems: 'center', paddingTop: 60, gap: 12 },
  errorTitle: { fontFamily: fonts.display, fontSize: 16, lineHeight: 22 },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 },
  retryBtnText: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20 },
  gridSpacer: { width: CARD_WIDTH },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Touch target expanded via hitSlop
    minWidth: 44,
    minHeight: 44,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.display,
    letterSpacing: -0.15,
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },

  /* ── Segment control ── */
  tabBarWrap: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    gap: 5,
    minHeight: 44,
  },
  segmentTabActive: {
    // bg + shadow set inline
  },
  segmentTabText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  segmentTabCount: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
  },

  /* ── Loading ── */
  loadingWrap: {
    padding: 16,
    gap: 12,
  },

  /* ── Scroll content ── */
  scrollContent: {
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 100,
  },

  /* ── Posts grid ── */
  gridRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  gridCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  gridImageWrap: {
    aspectRatio: 1,
    width: '100%',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    // Expanded touch target via hitSlop
    minWidth: 44,
    minHeight: 44,
  },
  gridInfo: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  gridTitle: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.1,
  },
  gridMeta: {
    fontSize: 12,
    fontFamily: fonts.body,
    marginTop: 3,
  },
  gridPrice: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    marginTop: 6,
  },

  /* ── Events ── */
  eventsSection: {
    gap: 8,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    textTransform: 'uppercase',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  eventIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventInfo: {
    flex: 1,
    gap: 2,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },
  eventDate: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  eventLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  eventLocation: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  eventUnsaveBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default function SavedScreen() {
  return (
    <ScreenErrorBoundary screenName="Saved">
      <SavedScreenInner />
    </ScreenErrorBoundary>
  )
}
