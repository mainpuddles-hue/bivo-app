import { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, FlatList, RefreshControl, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { CalendarDays, MapPin, Users, Plus, Bookmark, BookmarkCheck, ChevronRight } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { formatEventDateShort } from '@/lib/format'
import type { Event, CityEvent } from '@/lib/types'

type Tab = 'community' | 'city'

export default function EventsScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [tab, setTab] = useState<Tab>('community')
  const [events, setEvents] = useState<Event[]>([])
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [savedEventIds, setSavedEventIds] = useState<Set<string>>(new Set())
  const [attendingIds, setAttendingIds] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)

    // Community events
    const { data: evts } = await supabase
      .from('events')
      .select('*, creator:profiles!events_creator_id_fkey(id, name, avatar_url)')
      .eq('is_active', true)
      .gte('event_date', new Date().toISOString())
      .order('event_date', { ascending: true })
      .limit(50)
    setEvents((evts ?? []) as unknown as Event[])

    // City events
    const { data: city } = await supabase
      .from('city_events')
      .select('*')
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(30)
    setCityEvents((city ?? []) as unknown as CityEvent[])

    // Saved events + attending
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

  const getCityEventName = (e: CityEvent) => {
    if (locale === 'en' && e.name_en) return e.name_en
    if (locale === 'sv' && e.name_sv) return e.name_sv
    return e.name_fi
  }

  const renderCommunityEvent = ({ item }: { item: Event }) => {
    const isAttending = attendingIds.has(item.id)
    const isSaved = savedEventIds.has(item.id)

    return (
      <View style={[s.eventCard, { backgroundColor: colors.card }]}>
        <View style={s.eventTop}>
          <View style={[s.eventIcon, { backgroundColor: isDark ? '#102D1A' : '#E8F7EF' }]}>
            <CalendarDays size={20} color="#2B8A62" />
          </View>
          <View style={s.eventContent}>
            <Text style={[s.eventTitle, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
            <Text style={[s.eventDate, { color: colors.primary }]}>
              {formatEventDateShort(item.event_date, locale)}
            </Text>
            {item.location_name && (
              <View style={s.metaRow}>
                <MapPin size={12} color={colors.mutedForeground} />
                <Text style={[s.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{item.location_name}</Text>
              </View>
            )}
            {item.attendee_count != null && (
              <View style={s.metaRow}>
                <Users size={12} color={colors.mutedForeground} />
                <Text style={[s.metaText, { color: colors.mutedForeground }]}>
                  {t('events.attendeeCount', { count: item.attendee_count })}
                </Text>
              </View>
            )}
          </View>
          <Pressable onPress={() => toggleSave(item.id)} hitSlop={8}>
            {isSaved ? <BookmarkCheck size={20} color={colors.primary} /> : <Bookmark size={20} color={colors.mutedForeground} />}
          </Pressable>
        </View>
        <View style={s.eventActions}>
          <Pressable
            onPress={() => toggleAttend(item.id)}
            style={[s.attendBtn, isAttending ? { backgroundColor: colors.primary } : { borderWidth: 1, borderColor: colors.primary }]}
          >
            <Text style={[s.attendBtnText, { color: isAttending ? colors.primaryForeground : colors.primary }]}>
              {isAttending ? t('events.attending') : t('events.attend')}
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const renderCityEvent = ({ item }: { item: CityEvent }) => (
    <View style={[s.eventCard, { backgroundColor: colors.card }]}>
      <View style={s.eventTop}>
        {item.image_url && (
          <Image source={{ uri: item.image_url }} style={s.cityEventImg} contentFit="cover" />
        )}
        <View style={s.eventContent}>
          <Text style={[s.eventTitle, { color: colors.foreground }]} numberOfLines={2}>{getCityEventName(item)}</Text>
          <Text style={[s.eventDate, { color: colors.primary }]}>
            {formatEventDateShort(item.start_time, locale)}
          </Text>
          {item.location_name && (
            <View style={s.metaRow}>
              <MapPin size={12} color={colors.mutedForeground} />
              <Text style={[s.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>{item.location_name}</Text>
            </View>
          )}
          {item.is_free && (
            <View style={[s.freeBadge, { backgroundColor: `${colors.success}20` }]}>
              <Text style={[s.freeText, { color: colors.success }]}>{t('events.free')}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  )

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('events.title')}</Text>
        <Pressable
          onPress={() => router.push('/create')}
          style={[s.createBtn, { backgroundColor: colors.accent }]}
        >
          <Plus size={16} color={colors.accentForeground} strokeWidth={2.5} />
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={[s.tabRow, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => setTab('community')} style={[s.tab, tab === 'community' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
          <Text style={[s.tabText, { color: tab === 'community' ? colors.primary : colors.mutedForeground }]}>{t('events.communityTab')}</Text>
        </Pressable>
        <Pressable onPress={() => setTab('city')} style={[s.tab, tab === 'city' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
          <Text style={[s.tabText, { color: tab === 'city' ? colors.primary : colors.mutedForeground }]}>{t('events.cityTab')}</Text>
        </Pressable>
      </View>

      {tab === 'community' ? (
        <FlatList
          data={events}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={colors.primary} />}
          renderItem={renderCommunityEvent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={!loading ? (
            <View style={s.empty}>
              <CalendarDays size={40} color={colors.mutedForeground} style={{ opacity: 0.3 }} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('events.noEvents')}</Text>
            </View>
          ) : null}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={cityEvents}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={colors.primary} />}
          renderItem={renderCityEvent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={!loading ? (
            <View style={s.empty}>
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('events.noCityEvents')}</Text>
            </View>
          ) : null}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  createBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabRow: {
    flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 14, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  eventCard: { borderRadius: 12, overflow: 'hidden' },
  eventTop: { flexDirection: 'row', padding: 12, gap: 12, alignItems: 'flex-start' },
  eventIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cityEventImg: { width: 60, height: 60, borderRadius: 10 },
  eventContent: { flex: 1, gap: 4 },
  eventTitle: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  eventDate: { fontSize: 13, fontWeight: '500' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, flex: 1 },
  freeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-start', marginTop: 2 },
  freeText: { fontSize: 11, fontWeight: '600' },
  eventActions: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  attendBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  attendBtnText: { fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
})
