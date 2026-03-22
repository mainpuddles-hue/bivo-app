declare const __DEV__: boolean

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  View, Text, ScrollView, RefreshControl, StyleSheet,
  Pressable, Animated,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  Users, MessageCircle, CalendarDays, ChevronRight, Plus, MapPin,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { createClient } from '@/lib/supabase/client'
import { formatTimeAgo, formatEventDateShort } from '@/lib/format'
import { fetchHelsinkiEvents } from '@/lib/linkedevents'
import type { CityEvent } from '@/lib/types'
import { getCityEventName } from '@/lib/eventHelpers'

// ── Types ──

interface GroupPreview {
  id: string
  name: string
  description: string | null
  category: string
  member_count: number
  is_public: boolean
}

interface ForumPostPreview {
  id: string
  title: string
  category: string
  created_at: string
  reply_count: number
  upvote_count: number
  user?: { name: string | null; avatar_url: string | null } | null
}

interface EventPreview {
  id: string
  title: string
  event_date: string
  location_name: string | null
  attendee_count?: number
}

type SubTab = 'groups' | 'forum' | 'events'

// ── Category colors ──
const GROUP_CATEGORY_COLORS: Record<string, string> = {
  general: '#2D6B5E', sports: '#27AE60', kids: '#FF9800', pets: '#E8A050',
  garden: '#4CAF6A', food: '#E74C3C', culture: '#8E44AD', other: '#607D8B',
}

const FORUM_CATEGORY_COLORS: Record<string, string> = {
  vinkit: '#4CAF6A', kysymykset: '#3B7DD8', tapahtumat: '#2B8A62', uutiset: '#8E44AD',
}

// ── Shimmer skeleton ──
function SectionSkeleton({ colors, count = 3 }: { colors: ReturnType<typeof useTheme>['colors']; count?: number }) {
  const shimmer = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [shimmer])
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] })

  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[s.card, { backgroundColor: colors.card }]}>
          <View style={s.cardRow}>
            <Animated.View style={[s.skelCircle, { backgroundColor: colors.muted, opacity }]} />
            <View style={s.cardContent}>
              <Animated.View style={[s.skelLine, { width: '60%', height: 14, backgroundColor: colors.muted, opacity }]} />
              <Animated.View style={[s.skelLine, { width: '40%', height: 10, backgroundColor: colors.muted, opacity, marginTop: 6 }]} />
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}

export default function CommunityScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [activeTab, setActiveTab] = useState<SubTab>('groups')
  const [refreshing, setRefreshing] = useState(false)

  // Auth gate
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user)
    })
  }, [supabase])

  // Groups state
  const [groups, setGroups] = useState<GroupPreview[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [groupsFetched, setGroupsFetched] = useState(false)

  // Forum state
  const [forumPosts, setForumPosts] = useState<ForumPostPreview[]>([])
  const [forumLoading, setForumLoading] = useState(false)
  const [forumFetched, setForumFetched] = useState(false)

  // Events state
  const [events, setEvents] = useState<EventPreview[]>([])
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsFetched, setEventsFetched] = useState(false)

  // ── Fetch groups ──
  const fetchGroups = useCallback(async () => {
    setGroupsLoading(true)
    try {
      const { data, error } = await (supabase
        .from('groups')
        .select('id, name, description, category, member_count, is_public') as any)
        .order('member_count', { ascending: false })
        .limit(5)
      if (error) {
        if (__DEV__) console.log('[community] groups error:', error.message)
        setGroups([])
      } else {
        setGroups((data ?? []) as GroupPreview[])
      }
    } catch (err) {
      if (__DEV__) console.log('[community] groups fetch error:', err)
      setGroups([])
    } finally {
      setGroupsLoading(false)
      setGroupsFetched(true)
    }
  }, [supabase])

  // ── Fetch forum posts ──
  const fetchForumPosts = useCallback(async () => {
    setForumLoading(true)
    try {
      const { data, error } = await (supabase
        .from('forum_posts')
        .select('id, title, category, created_at, reply_count, upvote_count, user:profiles!forum_posts_user_id_fkey(name, avatar_url)') as any)
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) {
        if (__DEV__) console.log('[community] forum error:', error.message)
        setForumPosts([])
      } else {
        setForumPosts((data ?? []) as ForumPostPreview[])
      }
    } catch (err) {
      if (__DEV__) console.log('[community] forum fetch error:', err)
      setForumPosts([])
    } finally {
      setForumLoading(false)
      setForumFetched(true)
    }
  }, [supabase])

  // ── Fetch events ──
  const fetchEvents = useCallback(async () => {
    setEventsLoading(true)
    try {
      const today = new Date().toISOString()
      const [eventsRes, helsinkiEvents] = await Promise.all([
        (supabase
          .from('events')
          .select('id, title, event_date, location_name') as any)
          .gte('event_date', today)
          .order('event_date', { ascending: true })
          .limit(5),
        fetchHelsinkiEvents(),
      ])
      if (eventsRes.error) {
        if (__DEV__) console.log('[community] events error:', eventsRes.error.message)
      }
      setEvents((eventsRes.data ?? []) as EventPreview[])
      const now = new Date().toISOString()
      const futureCity = helsinkiEvents.filter(e => e.start_time >= now)
      setCityEvents(futureCity.slice(0, 3))
    } catch (err) {
      if (__DEV__) console.log('[community] events fetch error:', err)
      setEvents([])
      setCityEvents([])
    } finally {
      setEventsLoading(false)
      setEventsFetched(true)
    }
  }, [supabase])

  // ── Lazy load on tab switch ──
  useEffect(() => {
    if (activeTab === 'groups' && !groupsFetched) fetchGroups()
    if (activeTab === 'forum' && !forumFetched) fetchForumPosts()
    if (activeTab === 'events' && !eventsFetched) fetchEvents()
  }, [activeTab, groupsFetched, forumFetched, eventsFetched, fetchGroups, fetchForumPosts, fetchEvents])

  // ── Pull to refresh ──
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    if (activeTab === 'groups') await fetchGroups()
    else if (activeTab === 'forum') await fetchForumPosts()
    else if (activeTab === 'events') await fetchEvents()
    setRefreshing(false)
  }, [activeTab, fetchGroups, fetchForumPosts, fetchEvents])

  // ── Tab chips config ──
  const tabs: { key: SubTab; labelKey: string; Icon: typeof Users }[] = [
    { key: 'groups', labelKey: 'groups.title', Icon: Users },
    { key: 'forum', labelKey: 'forum.title', Icon: MessageCircle },
    { key: 'events', labelKey: 'nav.events', Icon: CalendarDays },
  ]

  // ── Render helpers ──

  const isLoading = activeTab === 'groups' ? groupsLoading
    : activeTab === 'forum' ? forumLoading
    : eventsLoading

  // Auth gate — show login prompt for unauthenticated users
  if (isAuthenticated === false) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <Text style={[s.headerTitle, { color: colors.foreground, paddingHorizontal: 16, paddingTop: 12 }]}>{t('nav.community')}</Text>
        <View style={s.authGate}>
          <Users size={40} color={colors.mutedForeground} />
          <Text style={[s.authGateTitle, { color: colors.foreground }]}>{t('auth.loginRequiredToast')}</Text>
          <Pressable onPress={() => router.push('/(auth)/login')} style={[s.authGateBtn, { backgroundColor: colors.primary }]}>
            <Text style={[s.authGateBtnText, { color: colors.primaryForeground }]}>{t('auth.login')}</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Sub-header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('nav.community')}</Text>
      </View>

      {/* Tab chips */}
      <View style={s.chipRow}>
        {tabs.map(({ key, labelKey, Icon }) => {
          const isActive = activeTab === key
          return (
            <Pressable
              key={key}
              onPress={() => setActiveTab(key)}
              style={[
                s.chip,
                { backgroundColor: isActive ? colors.primary : colors.muted },
              ]}
            >
              <Icon size={16} color={isActive ? '#FFFFFF' : colors.mutedForeground} strokeWidth={isActive ? 2.2 : 1.6} />
              <Text style={[s.chipText, { color: isActive ? '#FFFFFF' : colors.mutedForeground }]}>
                {t(labelKey)}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* ── Groups sub-tab ── */}
        {activeTab === 'groups' && (
          <>
            {isLoading && !groupsFetched ? (
              <SectionSkeleton colors={colors} />
            ) : groups.length === 0 ? (
              <View style={[s.emptyState, { backgroundColor: colors.card }]}>
                <Users size={36} color={colors.mutedForeground} strokeWidth={1.4} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('groups.noGroups')}</Text>
                <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>{t('groups.joinFirst')}</Text>
              </View>
            ) : (
              <View style={s.cardList}>
                {groups.map((group) => {
                  const catColor = GROUP_CATEGORY_COLORS[group.category] ?? colors.primary
                  return (
                    <Pressable
                      key={group.id}
                      style={[s.card, { backgroundColor: colors.card }]}
                      onPress={() => router.push('/groups' as any)}
                    >
                      <View style={s.cardRow}>
                        <View style={[s.dotIcon, { backgroundColor: catColor }]}>
                          <Text style={s.dotIconText}>{group.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={s.cardContent}>
                          <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                            {group.name}
                          </Text>
                          <Text style={[s.cardMeta, { color: colors.mutedForeground }]}>
                            {group.member_count} {t('groups.members')}
                            {group.category ? ` \u00B7 ${t(`groups.${group.category}`)}` : ''}
                          </Text>
                        </View>
                        <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.6} />
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            )}

            {/* Bottom actions */}
            <View style={s.bottomActions}>
              <Pressable
                style={s.showAllRow}
                onPress={() => router.push('/groups' as any)}
              >
                <Text style={[s.showAllText, { color: colors.primary }]}>{t('feed.showAll')} {t('groups.title').toLowerCase()}</Text>
                <ChevronRight size={16} color={colors.primary} strokeWidth={2} />
              </Pressable>

              <Pressable
                style={[s.createBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/groups' as any)}
              >
                <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={s.createBtnText}>{t('groups.create')}</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* ── Forum sub-tab ── */}
        {activeTab === 'forum' && (
          <>
            {isLoading && !forumFetched ? (
              <SectionSkeleton colors={colors} />
            ) : forumPosts.length === 0 ? (
              <View style={[s.emptyState, { backgroundColor: colors.card }]}>
                <MessageCircle size={36} color={colors.mutedForeground} strokeWidth={1.4} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('forum.noDiscussions')}</Text>
                <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>{t('forum.startFirst')}</Text>
              </View>
            ) : (
              <View style={s.cardList}>
                {forumPosts.map((post) => {
                  const catColor = FORUM_CATEGORY_COLORS[post.category] ?? colors.primary
                  const catLabelKey = `forum.${post.category === 'vinkit' ? 'tips' : post.category === 'kysymykset' ? 'questions' : post.category === 'tapahtumat' ? 'events' : 'news'}`
                  return (
                    <Pressable
                      key={post.id}
                      style={[s.card, { backgroundColor: colors.card }]}
                      onPress={() => router.push('/forum' as any)}
                    >
                      <View style={s.cardRow}>
                        <View style={[s.categoryBadge, { backgroundColor: `${catColor}20` }]}>
                          <Text style={[s.categoryBadgeText, { color: catColor }]}>{t(catLabelKey)}</Text>
                        </View>
                        <View style={s.cardContent}>
                          <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                            {post.title}
                          </Text>
                          <Text style={[s.cardMeta, { color: colors.mutedForeground }]}>
                            {post.reply_count} {t('forum.replies')} {'\u00B7'} {formatTimeAgo(post.created_at, t, locale)}
                          </Text>
                        </View>
                        <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.6} />
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            )}

            {/* Bottom actions */}
            <View style={s.bottomActions}>
              <Pressable
                style={s.showAllRow}
                onPress={() => router.push('/forum' as any)}
              >
                <Text style={[s.showAllText, { color: colors.primary }]}>{t('feed.showAll')} {t('forum.title').toLowerCase()}</Text>
                <ChevronRight size={16} color={colors.primary} strokeWidth={2} />
              </Pressable>

              <Pressable
                style={[s.createBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/forum' as any)}
              >
                <Plus size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={s.createBtnText}>{t('forum.newPost')}</Text>
              </Pressable>
            </View>
          </>
        )}

        {/* ── Events sub-tab ── */}
        {activeTab === 'events' && (
          <>
            {isLoading && !eventsFetched ? (
              <SectionSkeleton colors={colors} count={4} />
            ) : events.length === 0 && cityEvents.length === 0 ? (
              <View style={[s.emptyState, { backgroundColor: colors.card }]}>
                <CalendarDays size={36} color={colors.mutedForeground} strokeWidth={1.4} />
                <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('events.noEvents')}</Text>
                <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>{t('events.createFirst')}</Text>
              </View>
            ) : (
              <View style={s.cardList}>
                {/* Community events */}
                {events.map((event) => (
                  <Pressable
                    key={event.id}
                    style={[s.card, { backgroundColor: colors.card }]}
                    onPress={() => router.push('/(tabs)/events' as any)}
                  >
                    <View style={s.cardRow}>
                      <View style={[s.eventIconBox, { backgroundColor: isDark ? '#102D1A' : '#E8F7EF' }]}>
                        <CalendarDays size={18} color="#2B8A62" />
                      </View>
                      <View style={s.cardContent}>
                        <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                          {event.title}
                        </Text>
                        <Text style={[s.cardDateText, { color: colors.primary }]}>
                          {formatEventDateShort(event.event_date, locale)}
                        </Text>
                        <View style={s.metaRow}>
                          {event.location_name && (
                            <>
                              <MapPin size={11} color={colors.mutedForeground} />
                              <Text style={[s.cardMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                                {event.location_name}
                              </Text>
                            </>
                          )}
                          {event.attendee_count != null && event.attendee_count > 0 && (
                            <>
                              <Users size={11} color={colors.mutedForeground} />
                              <Text style={[s.cardMeta, { color: colors.mutedForeground }]}>
                                {event.attendee_count}
                              </Text>
                            </>
                          )}
                        </View>
                      </View>
                      <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.6} />
                    </View>
                  </Pressable>
                ))}

                {/* City events */}
                {cityEvents.length > 0 && (
                  <View style={s.cityEventsSection}>
                    <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>Helsinki</Text>
                    {cityEvents.map((ce) => (
                      <Pressable
                        key={ce.id}
                        style={[s.card, { backgroundColor: colors.card }]}
                        onPress={() => router.push('/(tabs)/events' as any)}
                      >
                        <View style={s.cardRow}>
                          <View style={[s.eventIconBox, { backgroundColor: isDark ? '#101A2D' : '#EBF2FE' }]}>
                            <CalendarDays size={18} color="#3B7DD8" />
                          </View>
                          <View style={s.cardContent}>
                            <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                              {getCityEventName(ce, locale)}
                            </Text>
                            <Text style={[s.cardDateText, { color: colors.primary }]}>
                              {formatEventDateShort(ce.start_time, locale)}
                            </Text>
                            {ce.location_name && (
                              <View style={s.metaRow}>
                                <MapPin size={11} color={colors.mutedForeground} />
                                <Text style={[s.cardMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                                  {ce.location_name}
                                </Text>
                              </View>
                            )}
                          </View>
                          <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.6} />
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Bottom actions */}
            <View style={s.bottomActions}>
              <Pressable
                style={s.showAllRow}
                onPress={() => router.push('/(tabs)/events' as any)}
              >
                <Text style={[s.showAllText, { color: colors.primary }]}>{t('feed.showAll')} {t('nav.events').toLowerCase()}</Text>
                <ChevronRight size={16} color={colors.primary} strokeWidth={2} />
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

// ── Styles ──
const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontFamily: fonts.headingSemi,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodyMedium,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  cardList: {
    gap: 10,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    fontFamily: fonts.headingSemi,
  },
  cardMeta: {
    fontSize: 12,
    fontFamily: fonts.body,
  },
  cardDateText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dotIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotIconText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: fonts.heading,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  eventIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cityEventsSection: {
    marginTop: 12,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: fonts.bodyMedium,
    marginBottom: 2,
  },
  bottomActions: {
    marginTop: 16,
    gap: 12,
  },
  showAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
  },
  showAllText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: fonts.bodySemi,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: 14,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: fonts.headingSemi,
  },
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: fonts.body,
  },
  // Auth gate
  authGate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  authGateTitle: { fontSize: 18, fontWeight: '700', fontFamily: fonts.headingSemi },
  authGateBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  authGateBtnText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.bodySemi },
  // Skeleton
  skelCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  skelLine: {
    height: 10,
    borderRadius: 5,
  },
})
