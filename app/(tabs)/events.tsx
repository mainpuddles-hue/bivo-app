import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, FlatList, RefreshControl, Pressable, ScrollView, StyleSheet, Modal, TextInput, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import {
  CalendarDays, MapPin, Users, Plus, Bookmark, BookmarkCheck,
  ChevronRight, Globe, RefreshCw, List, Calendar, Share2, Trash2, Bell, BellOff, X,
  Dumbbell, Palette, Baby, Home, Sparkles, HeartPulse, Grid2x2,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { formatEventDateShort, formatEventDate } from '@/lib/format'
import type { Event, CityEvent } from '@/lib/types'

type Tab = 'community' | 'city' | 'activities'
type DateFilter = 'all' | 'today' | 'week'

interface Activity {
  id: string
  title: string
  description: string | null
  category: string
  naapurusto: string
  location_name: string | null
  schedule_type: string
  schedule_day: number
  schedule_time: string
  max_members: number | null
  icon: string | null
  is_active: boolean
  created_at: string
  member_count?: number
  is_member?: boolean
  creator?: { id: string; name: string; avatar_url: string | null }
}

const ACTIVITY_ICONS: Record<string, React.ComponentType<any>> = {
  sport: Dumbbell, social: Users, hobby: Palette, childcare: Baby,
  neighborhood: Home, creative: Sparkles, health: HeartPulse, other: Grid2x2,
}

const ACTIVITY_COLORS: Record<string, string> = {
  sport: '#EF4444', social: '#8B5CF6', hobby: '#F59E0B', childcare: '#EC4899',
  neighborhood: '#10B981', creative: '#6366F1', health: '#14B8A6', other: '#6B7280',
}

export default function EventsScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [tab, setTab] = useState<Tab>('community')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [events, setEvents] = useState<Event[]>([])
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [savedEventIds, setSavedEventIds] = useState<Set<string>>(new Set())
  const [attendingIds, setAttendingIds] = useState<Set<string>>(new Set())
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [selectedCityEvent, setSelectedCityEvent] = useState<CityEvent | null>(null)

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)

    const [evtsRes, cityRes, actRes] = await Promise.all([
      supabase
        .from('events')
        .select('*, creator:profiles!events_creator_id_fkey(id, name, avatar_url)')
        .eq('is_active', true)
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })
        .limit(50),
      supabase
        .from('city_events')
        .select('*')
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true })
        .limit(30),
      supabase
        .from('activities')
        .select('*, creator:profiles!activities_creator_id_fkey(id, name, avatar_url)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(30),
    ])
    setEvents((evtsRes.data ?? []) as unknown as Event[])
    setCityEvents((cityRes.data ?? []) as unknown as CityEvent[])
    setActivities((actRes.data ?? []) as unknown as Activity[])

    if (user) {
      const [savedRes, attendRes] = await Promise.all([
        supabase.from('saved_events').select('event_id').eq('user_id', user.id),
        supabase.from('event_attendees').select('event_id').eq('user_id', user.id),
      ])
      setSavedEventIds(new Set((savedRes.data ?? []).map((s: any) => s.event_id)))
      setAttendingIds(new Set((attendRes.data ?? []).map((a: any) => a.event_id)))
    }

    setLoading(false)
    setRefreshing(false)
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleAttend = useCallback(async (eventId: string) => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (attendingIds.has(eventId)) {
      setAttendingIds(prev => { const n = new Set(prev); n.delete(eventId); return n })
      await supabase.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', userId)
    } else {
      setAttendingIds(prev => new Set(prev).add(eventId))
      await (supabase.from('event_attendees') as any).insert({ event_id: eventId, user_id: userId })
    }
  }, [userId, attendingIds, supabase, router])

  const toggleSave = useCallback(async (eventId: string) => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (savedEventIds.has(eventId)) {
      setSavedEventIds(prev => { const n = new Set(prev); n.delete(eventId); return n })
      await supabase.from('saved_events').delete().eq('event_id', eventId).eq('user_id', userId)
    } else {
      setSavedEventIds(prev => new Set(prev).add(eventId))
      await (supabase.from('saved_events') as any).insert({ event_id: eventId, user_id: userId })
    }
  }, [userId, savedEventIds, supabase, router])

  const toggleActivityMember = useCallback(async (activityId: string) => {
    if (!userId) { router.push('/(auth)/login'); return }
    const act = activities.find(a => a.id === activityId)
    if (!act) return
    if (act.is_member) {
      await supabase.from('activity_members').delete().eq('activity_id', activityId).eq('user_id', userId)
      setActivities(prev => prev.map(a => a.id === activityId ? { ...a, is_member: false, member_count: (a.member_count ?? 1) - 1 } : a))
    } else {
      if (act.max_members && (act.member_count ?? 0) >= act.max_members) {
        Alert.alert(t('activity.activityFull'))
        return
      }
      await (supabase.from('activity_members') as any).insert({ activity_id: activityId, user_id: userId })
      setActivities(prev => prev.map(a => a.id === activityId ? { ...a, is_member: true, member_count: (a.member_count ?? 0) + 1 } : a))
    }
  }, [userId, activities, supabase, router, t])

  const shareEvent = useCallback(async (event: Event) => {
    // React Native Share not available in web - use clipboard
    Alert.alert(t('events.linkCopied'))
  }, [t])

  const getCityEventName = (e: CityEvent) => {
    if (locale === 'en' && e.name_en) return e.name_en
    if (locale === 'sv' && e.name_sv) return e.name_sv
    return e.name_fi
  }

  // Date filtering
  const filteredEvents = useMemo(() => {
    if (dateFilter === 'all') return events
    const now = new Date()
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    const weekEnd = new Date(todayEnd.getTime() + 7 * 86400000)
    return events.filter(e => {
      const d = new Date(e.event_date)
      if (dateFilter === 'today') return d <= todayEnd
      if (dateFilter === 'week') return d <= weekEnd
      return true
    })
  }, [events, dateFilter])

  const scheduleLabel = (act: Activity) => {
    const days = [t('time.sunday'), t('time.monday'), t('time.tuesday'), t('time.wednesday'), t('time.thursday'), t('time.friday'), t('time.saturday')]
    const day = days[act.schedule_day] ?? ''
    return `${act.schedule_type === 'weekly' ? t('activity.scheduleWeekly') : act.schedule_type === 'biweekly' ? t('activity.scheduleBiweekly') : ''} ${day} ${t('events.timeSeparator')}${act.schedule_time}`
  }

  // ── Render Event Card ──
  const renderEvent = ({ item }: { item: Event }) => {
    const isAttending = attendingIds.has(item.id)
    const isSaved = savedEventIds.has(item.id)
    return (
      <Pressable onPress={() => setSelectedEvent(item)} style={[ev.card, { backgroundColor: colors.card }]}>
        <View style={ev.cardTop}>
          <View style={[ev.iconBox, { backgroundColor: isDark ? '#102D1A' : '#E8F7EF' }]}>
            <CalendarDays size={20} color="#2B8A62" />
          </View>
          <View style={ev.cardContent}>
            <Text style={[ev.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
            <Text style={[ev.cardDate, { color: colors.primary }]}>{formatEventDateShort(item.event_date, locale)}</Text>
            {item.location_name && (
              <View style={ev.meta}><MapPin size={12} color={colors.mutedForeground} /><Text style={[ev.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{item.location_name}</Text></View>
            )}
            {item.attendee_count != null && (
              <View style={ev.meta}><Users size={12} color={colors.mutedForeground} /><Text style={[ev.metaText, { color: colors.mutedForeground }]}>{item.attendee_count}</Text></View>
            )}
          </View>
          <View style={ev.cardActions}>
            <Pressable onPress={() => toggleSave(item.id)} hitSlop={8}>
              {isSaved ? <BookmarkCheck size={18} color={colors.primary} /> : <Bookmark size={18} color={colors.mutedForeground} />}
            </Pressable>
            <Pressable onPress={() => shareEvent(item)} hitSlop={8}>
              <Share2 size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
        <View style={ev.cardBottom}>
          <Pressable
            onPress={() => toggleAttend(item.id)}
            style={[ev.attendBtn, isAttending ? { backgroundColor: colors.primary } : { borderWidth: 1, borderColor: colors.primary }]}
          >
            <Text style={[ev.attendText, { color: isAttending ? colors.primaryForeground : colors.primary }]}>
              {isAttending ? t('events.attending') : t('events.attend')}
            </Text>
          </Pressable>
          {item.creator && (
            <View style={ev.creatorRow}>
              {item.creator.avatar_url ? (
                <Image source={{ uri: item.creator.avatar_url }} style={ev.creatorAvatar} />
              ) : null}
              <Text style={[ev.creatorName, { color: colors.mutedForeground }]}>{item.creator.name}</Text>
            </View>
          )}
        </View>
      </Pressable>
    )
  }

  // ── Render City Event ──
  const renderCityEvent = ({ item }: { item: CityEvent }) => (
    <Pressable onPress={() => setSelectedCityEvent(item)} style={[ev.card, { backgroundColor: colors.card }]}>
      <View style={ev.cardTop}>
        {item.image_url ? <Image source={{ uri: item.image_url }} style={ev.cityImg} contentFit="cover" /> : (
          <View style={[ev.iconBox, { backgroundColor: isDark ? '#101A2D' : '#EBF2FE' }]}>
            <Globe size={20} color="#3B7DD8" />
          </View>
        )}
        <View style={ev.cardContent}>
          <Text style={[ev.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{getCityEventName(item)}</Text>
          <Text style={[ev.cardDate, { color: colors.primary }]}>{formatEventDateShort(item.start_time, locale)}</Text>
          {item.location_name && (
            <View style={ev.meta}><MapPin size={12} color={colors.mutedForeground} /><Text style={[ev.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{item.location_name}</Text></View>
          )}
          {item.is_free && (
            <View style={[ev.freeBadge, { backgroundColor: `${colors.success}20` }]}>
              <Text style={[ev.freeText, { color: colors.success }]}>{t('events.free')}</Text>
            </View>
          )}
        </View>
        <ChevronRight size={16} color={colors.mutedForeground} />
      </View>
    </Pressable>
  )

  // ── Render Activity ──
  const renderActivity = ({ item }: { item: Activity }) => {
    const Icon = ACTIVITY_ICONS[item.category] ?? Grid2x2
    const color = ACTIVITY_COLORS[item.category] ?? '#6B7280'
    return (
      <View style={[ev.card, { backgroundColor: colors.card }]}>
        <View style={ev.cardTop}>
          <View style={[ev.iconBox, { backgroundColor: `${color}20` }]}>
            <Icon size={20} color={color} />
          </View>
          <View style={ev.cardContent}>
            <Text style={[ev.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
            <Text style={[ev.scheduleText, { color: colors.mutedForeground }]}>{scheduleLabel(item)}</Text>
            {item.location_name && (
              <View style={ev.meta}><MapPin size={12} color={colors.mutedForeground} /><Text style={[ev.metaText, { color: colors.mutedForeground }]}>{item.location_name}</Text></View>
            )}
            <View style={ev.meta}>
              <Users size={12} color={colors.mutedForeground} />
              <Text style={[ev.metaText, { color: colors.mutedForeground }]}>
                {item.max_members ? t('activity.membersOfMax', { count: item.member_count ?? 0, max: item.max_members }) : t('activity.members', { count: item.member_count ?? 0 })}
              </Text>
            </View>
          </View>
        </View>
        <View style={ev.cardBottom}>
          <Pressable
            onPress={() => toggleActivityMember(item.id)}
            style={[ev.attendBtn, item.is_member ? { backgroundColor: color } : { borderWidth: 1, borderColor: color }]}
          >
            <Text style={[ev.attendText, { color: item.is_member ? '#FFFFFF' : color }]}>
              {item.is_member ? t('activity.joined') : t('activity.joinActivity')}
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const currentData = tab === 'community' ? filteredEvents : tab === 'city' ? cityEvents : activities

  return (
    <View style={[ev.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[ev.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[ev.headerTitle, { color: colors.foreground }]}>{t('events.title')}</Text>
          <Text style={[ev.headerSub, { color: colors.mutedForeground }]}>
            {tab === 'community' ? `${filteredEvents.length} ${t('events.communityEvents')}` : tab === 'city' ? t('events.cityEventsCount', { count: cityEvents.length }) : t('activity.activityCount', { count: activities.length })}
          </Text>
        </View>
        <View style={ev.headerActions}>
          {tab === 'community' && (
            <Pressable onPress={() => setViewMode(v => v === 'list' ? 'calendar' : 'list')} style={[ev.viewBtn, { backgroundColor: colors.muted }]}>
              {viewMode === 'list' ? <Calendar size={16} color={colors.mutedForeground} /> : <List size={16} color={colors.mutedForeground} />}
            </Pressable>
          )}
          <Pressable onPress={() => router.push('/create')} style={[ev.fabBtn, { backgroundColor: colors.accent }]}>
            <Plus size={16} color={colors.accentForeground} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>

      {/* Hero banner */}
      <Pressable onPress={() => router.push('/(auth)/login')} style={ev.heroBanner}>
        <View style={ev.heroContent}>
          <Text style={ev.heroLabel}>{t('events.heroTitle')}</Text>
          <Text style={ev.heroTitle}>{t('events.heroSubtitle')}</Text>
          <Text style={ev.heroDesc}>{t('events.heroDescription')}</Text>
          <View style={ev.heroCta}>
            <Text style={ev.heroCtaText}>{t('events.heroCreateCTA')}</Text>
            <ChevronRight size={16} color={colors.primary} />
          </View>
        </View>
      </Pressable>

      {/* Tabs */}
      <View style={[ev.tabRow, { borderBottomColor: colors.border }]}>
        {(['community', 'city', 'activities'] as Tab[]).map((t_) => (
          <Pressable key={t_} onPress={() => setTab(t_)} style={[ev.tab, tab === t_ && [ev.tabActive, { borderBottomColor: colors.primary }]]}>
            {t_ === 'community' && <CalendarDays size={14} color={tab === t_ ? colors.primary : colors.mutedForeground} />}
            {t_ === 'city' && <Globe size={14} color={tab === t_ ? colors.primary : colors.mutedForeground} />}
            {t_ === 'activities' && <RefreshCw size={14} color={tab === t_ ? colors.primary : colors.mutedForeground} />}
            <Text style={[ev.tabText, { color: tab === t_ ? colors.primary : colors.mutedForeground }]}>
              {t_ === 'community' ? t('events.communityTab') : t_ === 'city' ? t('events.cityTab') : t('activity.activities')}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Date filter (community tab) */}
      {tab === 'community' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={ev.dateFilters}>
          {(['all', 'today', 'week'] as DateFilter[]).map((df) => (
            <Pressable
              key={df}
              onPress={() => setDateFilter(df)}
              style={[ev.dateChip, dateFilter === df ? { backgroundColor: colors.primary } : { backgroundColor: isDark ? colors.card : colors.muted }]}
            >
              <Text style={[ev.dateChipText, { color: dateFilter === df ? colors.primaryForeground : colors.mutedForeground }]}>
                {df === 'all' ? t('events.filterAll') : df === 'today' ? t('events.filterToday') : t('events.filterWeek')}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* List */}
      <FlatList
        data={currentData as any[]}
        keyExtractor={item => item.id}
        contentContainerStyle={ev.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={colors.primary} />}
        renderItem={(tab === 'community' ? renderEvent : tab === 'city' ? renderCityEvent : renderActivity) as any}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={!loading ? (
          <View style={ev.empty}>
            <CalendarDays size={40} color={colors.mutedForeground} style={{ opacity: 0.3 }} />
            <Text style={[ev.emptyTitle, { color: colors.foreground }]}>{tab === 'activities' ? t('activity.noActivities') : t('events.noEvents')}</Text>
            <Text style={[ev.emptyHint, { color: colors.mutedForeground }]}>{tab === 'activities' ? t('activity.noActivitiesHint') : t('events.createFirst')}</Text>
          </View>
        ) : null}
        showsVerticalScrollIndicator={false}
      />

      {/* Event Detail Modal */}
      <Modal visible={selectedEvent !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedEvent(null)}>
        {selectedEvent && (
          <View style={[ev.modalContainer, { backgroundColor: colors.background }]}>
            <View style={[ev.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[ev.modalTitle, { color: colors.foreground }]}>{t('events.event')}</Text>
              <Pressable onPress={() => setSelectedEvent(null)} hitSlop={12}><X size={24} color={colors.foreground} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={ev.modalBody}>
              <Text style={[ev.detailTitle, { color: colors.foreground }]}>{selectedEvent.title}</Text>
              <Text style={[ev.detailDate, { color: colors.primary }]}>{formatEventDate(selectedEvent.event_date, locale)}</Text>
              {selectedEvent.description && <Text style={[ev.detailDesc, { color: colors.foreground }]}>{selectedEvent.description}</Text>}
              {selectedEvent.location_name && (
                <View style={ev.meta}><MapPin size={16} color={colors.mutedForeground} /><Text style={[ev.detailMeta, { color: colors.mutedForeground }]}>{selectedEvent.location_name}</Text></View>
              )}
              {selectedEvent.attendee_count != null && (
                <View style={ev.meta}><Users size={16} color={colors.mutedForeground} /><Text style={[ev.detailMeta, { color: colors.mutedForeground }]}>{selectedEvent.max_attendees ? t('events.attendeeCountMax', { count: selectedEvent.attendee_count, max: selectedEvent.max_attendees }) : t('events.attendeeCount', { count: selectedEvent.attendee_count })}</Text></View>
              )}
              <Pressable
                onPress={() => { toggleAttend(selectedEvent.id); setSelectedEvent(null) }}
                style={[ev.detailBtn, { backgroundColor: attendingIds.has(selectedEvent.id) ? colors.muted : colors.primary }]}
              >
                <Text style={[ev.detailBtnText, { color: attendingIds.has(selectedEvent.id) ? colors.foreground : colors.primaryForeground }]}>
                  {attendingIds.has(selectedEvent.id) ? t('events.cancelAttendance') : t('events.attendEvent')}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* City Event Detail Modal */}
      <Modal visible={selectedCityEvent !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedCityEvent(null)}>
        {selectedCityEvent && (
          <View style={[ev.modalContainer, { backgroundColor: colors.background }]}>
            <View style={[ev.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[ev.modalTitle, { color: colors.foreground }]}>Helsinki</Text>
              <Pressable onPress={() => setSelectedCityEvent(null)} hitSlop={12}><X size={24} color={colors.foreground} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={ev.modalBody}>
              {selectedCityEvent.image_url && <Image source={{ uri: selectedCityEvent.image_url }} style={ev.detailImg} contentFit="cover" />}
              <Text style={[ev.detailTitle, { color: colors.foreground }]}>{getCityEventName(selectedCityEvent)}</Text>
              <Text style={[ev.detailDate, { color: colors.primary }]}>{formatEventDate(selectedCityEvent.start_time, locale)}</Text>
              {selectedCityEvent.location_name && (
                <View style={ev.meta}><MapPin size={16} color={colors.mutedForeground} /><Text style={[ev.detailMeta, { color: colors.mutedForeground }]}>{selectedCityEvent.location_name}</Text></View>
              )}
              {selectedCityEvent.is_free && <View style={[ev.freeBadge, { backgroundColor: `${colors.success}20` }]}><Text style={[ev.freeText, { color: colors.success }]}>{t('events.free')}</Text></View>}
              {selectedCityEvent.price_info && <Text style={[ev.detailMeta, { color: colors.mutedForeground }]}>{selectedCityEvent.price_info}</Text>}
              {selectedCityEvent.organizer && <Text style={[ev.detailMeta, { color: colors.mutedForeground }]}>{selectedCityEvent.organizer}</Text>}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  )
}

const ev = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  headerSub: { fontSize: 13, marginTop: 2 },
  heroBanner: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#2D6B5E', padding: 20,
  },
  heroContent: { gap: 6 },
  heroLabel: { fontSize: 10, fontWeight: '500', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' },
  heroTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', lineHeight: 22 },
  heroDesc: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18 },
  heroCta: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'flex-start',
  },
  heroCtaText: { fontSize: 14, fontWeight: '600', color: '#2D6B5E' },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  viewBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fabBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 13, fontWeight: '600' },
  dateFilters: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  dateChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  dateChipText: { fontSize: 12, fontWeight: '500' },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  card: { borderRadius: 12, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', padding: 12, gap: 12, alignItems: 'flex-start' },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cityImg: { width: 60, height: 60, borderRadius: 10 },
  cardContent: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  cardDate: { fontSize: 13, fontWeight: '500' },
  scheduleText: { fontSize: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, flex: 1 },
  freeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-start', marginTop: 2 },
  freeText: { fontSize: 11, fontWeight: '600' },
  cardActions: { gap: 12, alignItems: 'center' },
  cardBottom: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 12, gap: 8, alignItems: 'center' },
  attendBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, minWidth: 90, alignItems: 'center' },
  attendText: { fontSize: 13, fontWeight: '600' },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  creatorAvatar: { width: 20, height: 20, borderRadius: 10 },
  creatorName: { fontSize: 12 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  emptyHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalBody: { padding: 16, gap: 12, paddingBottom: 40 },
  detailImg: { width: '100%', height: 200, borderRadius: 12 },
  detailTitle: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  detailDate: { fontSize: 16, fontWeight: '500' },
  detailDesc: { fontSize: 15, lineHeight: 22 },
  detailMeta: { fontSize: 14 },
  detailBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  detailBtnText: { fontSize: 16, fontWeight: '600' },
})
