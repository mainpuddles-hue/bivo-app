declare const __DEV__: boolean

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, FlatList, RefreshControl, Pressable, ScrollView, StyleSheet, Modal, Alert, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import {
  CalendarDays, MapPin, Users, Plus, Bookmark, BookmarkCheck,
  ChevronRight, ChevronLeft, Globe, RefreshCw, List, Calendar, Share2, X,
  Dumbbell, Palette, Baby, Home, Sparkles, HeartPulse, Grid2x2, ExternalLink,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { Avatar } from '@/components/Avatar'
import { shareContent } from '@/lib/share'
import { formatEventDateShort, formatEventDate } from '@/lib/format'
import { fetchHelsinkiEvents } from '@/lib/linkedevents'
import { fonts } from '@/lib/fonts'
import type { Event, CityEvent } from '@/lib/types'
import { getCityEventName } from '@/lib/eventHelpers'

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

// ── Simple Calendar Component ──
function SimpleCalendar({
  events,
  selectedDate,
  onSelectDate,
  onMonthChange,
  currentMonth,
  colors,
  t,
}: {
  events: Event[]
  selectedDate: string | null
  onSelectDate: (date: string) => void
  onMonthChange: (month: Date) => void
  currentMonth: Date
  colors: ReturnType<typeof import('@/hooks/useTheme').useTheme>['colors']
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Build event date set (YYYY-MM-DD)
  const eventDates = useMemo(() => {
    const s = new Set<string>()
    events.forEach(e => {
      const d = new Date(e.event_date)
      s.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    })
    return s
  }, [events])

  const weekDays = [
    t('time.sunday').slice(0, 2),
    t('time.monday').slice(0, 2),
    t('time.tuesday').slice(0, 2),
    t('time.wednesday').slice(0, 2),
    t('time.thursday').slice(0, 2),
    t('time.friday').slice(0, 2),
    t('time.saturday').slice(0, 2),
  ]

  const monthLabel = new Date(year, month).toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' })

  const goBack = () => onMonthChange(new Date(year, month - 1, 1))
  const goForward = () => onMonthChange(new Date(year, month + 1, 1))

  // Adjust: start week on Monday (shift firstDay)
  const startOffset = firstDay === 0 ? 6 : firstDay - 1
  const totalCells = startOffset + daysInMonth
  const rows = Math.ceil(totalCells / 7)
  const weekDaysMon = [weekDays[1], weekDays[2], weekDays[3], weekDays[4], weekDays[5], weekDays[6], weekDays[0]]

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <View style={calStyles.container}>
      {/* Month nav */}
      <View style={calStyles.monthNav}>
        <Pressable onPress={goBack} hitSlop={12} style={calStyles.navBtn}>
          <ChevronLeft size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[calStyles.monthLabel, { color: colors.foreground }]}>{monthLabel}</Text>
        <Pressable onPress={goForward} hitSlop={12} style={calStyles.navBtn}>
          <ChevronRight size={18} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Weekday headers */}
      <View style={calStyles.weekRow}>
        {weekDaysMon.map((d, i) => (
          <View key={i} style={calStyles.weekCell}>
            <Text style={[calStyles.weekDayText, { color: colors.mutedForeground }]}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      {Array.from({ length: rows }).map((_, row) => (
        <View key={row} style={calStyles.weekRow}>
          {Array.from({ length: 7 }).map((_, col) => {
            const cellIndex = row * 7 + col
            const day = cellIndex - startOffset + 1
            if (day < 1 || day > daysInMonth) {
              return <View key={col} style={calStyles.dayCell} />
            }
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const hasEvent = eventDates.has(dateStr)
            const isSelected = selectedDate === dateStr
            const isToday = dateStr === todayStr

            return (
              <Pressable
                key={col}
                onPress={() => onSelectDate(dateStr)}
                style={[
                  calStyles.dayCell,
                  isSelected && { backgroundColor: colors.primary, borderRadius: 20 },
                  isToday && !isSelected && { borderWidth: 1, borderColor: colors.primary, borderRadius: 20 },
                ]}
              >
                <Text style={[
                  calStyles.dayText,
                  { color: isSelected ? colors.primaryForeground : colors.foreground },
                ]}>{day}</Text>
                {hasEvent && (
                  <View style={[calStyles.eventDot, { backgroundColor: isSelected ? colors.primaryForeground : colors.primary }]} />
                )}
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const calStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 8 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  navBtn: { padding: 4 },
  monthLabel: { fontSize: 16, fontWeight: '600', textTransform: 'capitalize', fontFamily: fonts.headingSemi },
  weekRow: { flexDirection: 'row' },
  weekCell: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  weekDayText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', fontFamily: fonts.bodyMedium },
  dayCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, minHeight: 40 },
  dayText: { fontSize: 14, fontWeight: '500', fontFamily: fonts.body },
  eventDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
})

export default function EventsScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

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

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUserId(user.id)

    const today = new Date().toISOString().split('T')[0]
    const [evtsRes, helsinkiEvents, actRes] = await Promise.all([
      supabase
        .from('events')
        .select('*, creator:profiles!events_creator_id_fkey(id, name, avatar_url)')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .limit(500),
      fetchHelsinkiEvents(),
      supabase
        .from('activities')
        .select('*, creator:profiles!activities_creator_id_fkey(id, name, avatar_url)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(500),
    ])
    if (__DEV__ && evtsRes.error) console.log('[events] events error:', evtsRes.error.message)
    if (__DEV__ && actRes.error) console.log('[events] activities error:', actRes.error.message)
    if (__DEV__) console.log(`[events] LinkedEvents: ${helsinkiEvents.length} events loaded`)
    setEvents((evtsRes.data ?? []) as unknown as Event[])
    setCityEvents(helsinkiEvents)
    setActivities((actRes.data ?? []) as unknown as Activity[])

    if (user) {
      const [savedRes, attendRes] = await Promise.all([
        supabase.from('saved_events').select('event_id').eq('user_id', user.id),
        supabase.from('event_attendees').select('event_id').eq('user_id', user.id),
      ])
      setSavedEventIds(new Set((savedRes.data ?? []).map((s: any) => s.event_id)))
      setAttendingIds(new Set((attendRes.data ?? []).map((a: any) => a.event_id)))
    }

    } catch (err) {
      if (__DEV__) console.log('[events] fetchData error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  const attendingRef = useRef(false)
  const toggleAttend = useCallback(async (eventId: string) => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (attendingRef.current) return
    attendingRef.current = true
    const wasAttending = attendingIds.has(eventId)
    if (wasAttending) {
      setAttendingIds(prev => { const n = new Set(prev); n.delete(eventId); return n })
    } else {
      setAttendingIds(prev => new Set(prev).add(eventId))
    }
    try {
      if (wasAttending) {
        const { error } = await supabase.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', userId)
        if (error) throw error
      } else {
        const { error } = await (supabase.from('event_attendees') as any).insert({ event_id: eventId, user_id: userId })
        if (error) throw error
      }
    } catch {
      // Revert optimistic update
      if (wasAttending) {
        setAttendingIds(prev => new Set(prev).add(eventId))
      } else {
        setAttendingIds(prev => { const n = new Set(prev); n.delete(eventId); return n })
      }
      Alert.alert(t('common.error'), t('events.attendFailed'))
    } finally { attendingRef.current = false }
  }, [userId, attendingIds, supabase, router, t])

  const eventSavingRef = useRef(false)
  const toggleSave = useCallback(async (eventId: string) => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (eventSavingRef.current) return
    eventSavingRef.current = true
    try {
      if (savedEventIds.has(eventId)) {
        setSavedEventIds(prev => { const n = new Set(prev); n.delete(eventId); return n })
        await supabase.from('saved_events').delete().eq('event_id', eventId).eq('user_id', userId)
      } else {
        setSavedEventIds(prev => new Set(prev).add(eventId))
        await (supabase.from('saved_events') as any).insert({ event_id: eventId, user_id: userId })
      }
    } finally { eventSavingRef.current = false }
  }, [userId, savedEventIds, supabase, router])

  const activityMemberRef = useRef(false)
  const toggleActivityMember = useCallback(async (activityId: string) => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (activityMemberRef.current) return
    activityMemberRef.current = true
    const act = activities.find(a => a.id === activityId)
    if (!act) { activityMemberRef.current = false; return }
    try {
      if (act.is_member) {
        const { error } = await supabase.from('activity_members').delete().eq('activity_id', activityId).eq('user_id', userId)
        if (error) { Alert.alert(t('common.error'), t('activity.leaveFailed')); return }
        setActivities(prev => prev.map(a => a.id === activityId ? { ...a, is_member: false, member_count: (a.member_count ?? 1) - 1 } : a))
      } else {
        if (act.max_members && (act.member_count ?? 0) >= act.max_members) {
          Alert.alert(t('activity.activityFull'))
          return
        }
        const { error } = await (supabase.from('activity_members') as any).insert({ activity_id: activityId, user_id: userId })
        if (error) { Alert.alert(t('common.error'), t('activity.joinFailed')); return }
        setActivities(prev => prev.map(a => a.id === activityId ? { ...a, is_member: true, member_count: (a.member_count ?? 0) + 1 } : a))
      }
    } catch (err) {
      Alert.alert(t('common.error'), t('activity.toggleFailed'))
      if (__DEV__) console.log('[activities] toggleMember error:', err)
    } finally { activityMemberRef.current = false }
  }, [userId, activities, supabase, router, t])

  const shareEvent = useCallback(async (event: Event) => {
    const shared = await shareContent({
      title: t('events.shareEventTitle', { title: event.title }),
      text: event.title,
      url: `https://tackbird-v2.vercel.app/events`,
    })
    if (shared) Alert.alert(t('events.linkCopied'))
  }, [t])

  const getCityEventDesc = (e: CityEvent) => {
    if (locale === 'en' && e.description_en) return e.description_en
    if (locale === 'sv' && e.description_sv) return e.description_sv
    return e.description_fi
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

  // Events for selected calendar day
  const calendarDayEvents = useMemo(() => {
    if (!calendarSelectedDate) return []
    return events.filter(e => {
      const d = new Date(e.event_date)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return dateStr === calendarSelectedDate
    })
  }, [events, calendarSelectedDate])

  const scheduleLabel = (act: Activity) => {
    const days = [t('time.sunday'), t('time.monday'), t('time.tuesday'), t('time.wednesday'), t('time.thursday'), t('time.friday'), t('time.saturday')]
    const day = days[act.schedule_day] ?? ''
    return `${act.schedule_type === 'weekly' ? t('activity.scheduleWeekly') : act.schedule_type === 'biweekly' ? t('activity.scheduleBiweekly') : ''} ${day} ${t('events.timeSeparator')}${act.schedule_time}`
  }

  const openLocationInMaps = useCallback((locationName: string | null, lat?: number | null, lng?: number | null) => {
    if (lat && lng) {
      Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`)
    } else if (locationName) {
      Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(locationName)}`)
    }
  }, [])

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
              <Avatar url={item.creator.avatar_url} name={item.creator.name} size={20} />
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
          <Text style={[ev.cardTitle, { color: colors.foreground }]} numberOfLines={2}>{getCityEventName(item, locale)}</Text>
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

  // Calendar view for community tab
  const showCalendar = tab === 'community' && viewMode === 'calendar'

  return (
    <View style={[ev.container, { backgroundColor: colors.background }]}>
      {/* Sub-header */}
      <View style={[ev.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[ev.headerTitle, { color: colors.foreground }]}>{t('events.title')}</Text>
          <Text style={[ev.headerSub, { color: colors.mutedForeground }]}>
            {tab === 'community' ? `${filteredEvents.length} ${t('events.communityEvents')}` : tab === 'city' ? t('events.cityEventsCount', { count: cityEvents.length }) : t('activity.activityCount', { count: activities.length })}
          </Text>
        </View>
        <View style={ev.headerActions}>
          {tab === 'community' && (
            <Pressable onPress={() => setViewMode(v => v === 'list' ? 'calendar' : 'list')} style={[ev.viewBtn, { backgroundColor: viewMode === 'calendar' ? colors.primary : colors.muted }]}>
              {viewMode === 'list' ? <Calendar size={16} color={colors.mutedForeground} /> : <List size={16} color={colors.primaryForeground} />}
            </Pressable>
          )}
          <Pressable onPress={() => router.push('/create?type=tapahtuma')} style={[ev.fabBtn, { backgroundColor: colors.accent }]}>
            <Plus size={16} color={colors.accentForeground} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>

      {/* Hero banner */}
      <Pressable onPress={() => router.push('/create?type=tapahtuma')} style={ev.heroBanner}>
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

      {/* Date filter (community tab, list mode) */}
      {tab === 'community' && viewMode === 'list' && (
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

      {/* Calendar view */}
      {showCalendar ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={colors.primary} />}
        >
          <SimpleCalendar
            events={events}
            selectedDate={calendarSelectedDate}
            onSelectDate={setCalendarSelectedDate}
            onMonthChange={setCalendarMonth}
            currentMonth={calendarMonth}
            colors={colors}
            t={t}
          />
          {/* Events for selected day */}
          {calendarSelectedDate && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 20, gap: 12 }}>
              <Text style={[ev.calDayTitle, { color: colors.foreground }]}>
                {new Date(calendarSelectedDate + 'T00:00:00').toLocaleDateString(locale === 'en' ? 'en-GB' : locale === 'sv' ? 'sv-SE' : 'fi-FI', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
              {calendarDayEvents.length === 0 ? (
                <Text style={[ev.calNoEvents, { color: colors.mutedForeground }]}>{t('events.calendarNoEvents')}</Text>
              ) : (
                calendarDayEvents.map((item) => (
                  <View key={item.id}>{renderEvent({ item })}</View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        /* List */
        <FlatList
          data={currentData as any[]}
          keyExtractor={item => item.id}
          contentContainerStyle={ev.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData() }} tintColor={colors.primary} />}
          renderItem={(tab === 'community' ? renderEvent : tab === 'city' ? renderCityEvent : renderActivity) as any}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListHeaderComponent={tab === 'activities' ? (
            <Pressable
              onPress={() => router.push('/activities' as any)}
              style={ev.showAllRow}
            >
              <Text style={[ev.showAllText, { color: colors.primary }]}>{t('feed.showAll')} {t('activities.title').toLowerCase()}</Text>
              <ChevronRight size={16} color={colors.primary} strokeWidth={2} />
            </Pressable>
          ) : null}
          ListEmptyComponent={!loading ? (
            <View style={ev.empty}>
              <CalendarDays size={48} color={colors.mutedForeground} />
              <Text style={[ev.emptyTitle, { color: colors.foreground }]}>{tab === 'activities' ? t('activity.noActivities') : t('events.noEvents')}</Text>
              <Text style={[ev.emptyHint, { color: colors.mutedForeground }]}>{tab === 'activities' ? t('activity.noActivitiesHint') : t('events.createFirst')}</Text>
            </View>
          ) : null}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating Action Button */}
      <Pressable
        onPress={() => router.push('/create?type=tapahtuma')}
        style={[ev.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 16 }]}
      >
        <Plus size={24} color={colors.primaryForeground} strokeWidth={2.5} />
      </Pressable>

      {/* Event Detail Modal — enhanced */}
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

              {/* Full description */}
              {selectedEvent.description && (
                <View style={ev.detailSection}>
                  <Text style={[ev.detailSectionLabel, { color: colors.mutedForeground }]}>{t('events.description')}</Text>
                  <Text style={[ev.detailDesc, { color: colors.foreground }]}>{selectedEvent.description}</Text>
                </View>
              )}

              {/* Location with map link */}
              {selectedEvent.location_name && (
                <Pressable
                  onPress={() => openLocationInMaps(selectedEvent.location_name, selectedEvent.location_lat, selectedEvent.location_lng)}
                  style={ev.detailLocationRow}
                >
                  <MapPin size={16} color={colors.mutedForeground} />
                  <Text style={[ev.detailMeta, { color: colors.mutedForeground, flex: 1 }]}>{selectedEvent.location_name}</Text>
                  <ExternalLink size={14} color={colors.primary} />
                </Pressable>
              )}

              {/* Attendee count with avatars */}
              {selectedEvent.attendee_count != null && (
                <View style={ev.detailAttendeeRow}>
                  <Users size={16} color={colors.mutedForeground} />
                  <Text style={[ev.detailMeta, { color: colors.mutedForeground }]}>
                    {selectedEvent.max_attendees
                      ? t('events.attendeeCountMax', { count: selectedEvent.attendee_count, max: selectedEvent.max_attendees })
                      : t('events.attendeeCount', { count: selectedEvent.attendee_count })}
                  </Text>
                </View>
              )}

              {/* Creator info */}
              {selectedEvent.creator && (
                <View style={ev.detailCreatorRow}>
                  <Avatar url={selectedEvent.creator.avatar_url} name={selectedEvent.creator.name} size={32} />
                  <Text style={[ev.detailCreatorName, { color: colors.foreground }]}>{selectedEvent.creator.name}</Text>
                </View>
              )}

              {/* Action buttons */}
              <View style={ev.detailActions}>
                <Pressable
                  onPress={() => { toggleAttend(selectedEvent.id); setSelectedEvent(null) }}
                  style={[ev.detailBtn, { backgroundColor: attendingIds.has(selectedEvent.id) ? colors.muted : colors.primary, flex: 1 }]}
                >
                  <Text style={[ev.detailBtnText, { color: attendingIds.has(selectedEvent.id) ? colors.foreground : colors.primaryForeground }]}>
                    {attendingIds.has(selectedEvent.id) ? t('events.cancelAttendance') : t('events.attendEvent')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => shareEvent(selectedEvent)}
                  style={[ev.detailShareBtn, { borderColor: colors.border }]}
                >
                  <Share2 size={18} color={colors.foreground} />
                </Pressable>
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>

      {/* City Event Detail Modal — enhanced */}
      <Modal visible={selectedCityEvent !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedCityEvent(null)}>
        {selectedCityEvent && (
          <View style={[ev.modalContainer, { backgroundColor: colors.background }]}>
            <View style={[ev.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[ev.modalTitle, { color: colors.foreground }]}>Helsinki</Text>
              <Pressable onPress={() => setSelectedCityEvent(null)} hitSlop={12}><X size={24} color={colors.foreground} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={ev.modalBody}>
              {selectedCityEvent.image_url && <Image source={{ uri: selectedCityEvent.image_url }} style={ev.detailImg} contentFit="cover" />}
              <Text style={[ev.detailTitle, { color: colors.foreground }]}>{getCityEventName(selectedCityEvent, locale)}</Text>
              <Text style={[ev.detailDate, { color: colors.primary }]}>{formatEventDate(selectedCityEvent.start_time, locale)}</Text>

              {/* Full description */}
              {getCityEventDesc(selectedCityEvent) && (
                <View style={ev.detailSection}>
                  <Text style={[ev.detailSectionLabel, { color: colors.mutedForeground }]}>{t('events.description')}</Text>
                  <Text style={[ev.detailDesc, { color: colors.foreground }]}>{getCityEventDesc(selectedCityEvent)}</Text>
                </View>
              )}

              {/* Location with map link */}
              {selectedCityEvent.location_name && (
                <Pressable
                  onPress={() => openLocationInMaps(selectedCityEvent.location_name, selectedCityEvent.latitude, selectedCityEvent.longitude)}
                  style={ev.detailLocationRow}
                >
                  <MapPin size={16} color={colors.mutedForeground} />
                  <View style={{ flex: 1 }}>
                    <Text style={[ev.detailMeta, { color: colors.mutedForeground }]}>{selectedCityEvent.location_name}</Text>
                    {selectedCityEvent.location_address && (
                      <Text style={[ev.detailMetaSub, { color: `${colors.mutedForeground}99` }]}>{selectedCityEvent.location_address}</Text>
                    )}
                  </View>
                  <ExternalLink size={14} color={colors.primary} />
                </Pressable>
              )}

              {selectedCityEvent.is_free && <View style={[ev.freeBadge, { backgroundColor: `${colors.success}20` }]}><Text style={[ev.freeText, { color: colors.success }]}>{t('events.free')}</Text></View>}
              {selectedCityEvent.price_info && <Text style={[ev.detailMeta, { color: colors.mutedForeground }]}>{selectedCityEvent.price_info}</Text>}
              {selectedCityEvent.organizer && <Text style={[ev.detailMeta, { color: colors.mutedForeground }]}>{selectedCityEvent.organizer}</Text>}

              {/* Share + open URL */}
              <View style={ev.detailActions}>
                {selectedCityEvent.info_url && (
                  <Pressable
                    onPress={() => Linking.openURL(selectedCityEvent.info_url!)}
                    style={[ev.detailBtn, { backgroundColor: colors.primary, flex: 1 }]}
                  >
                    <Text style={[ev.detailBtnText, { color: colors.primaryForeground }]}>{t('events.moreInfoAndTickets')}</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={async () => {
                    const shared = await shareContent({
                      title: getCityEventName(selectedCityEvent, locale),
                      text: getCityEventName(selectedCityEvent, locale),
                      url: selectedCityEvent.info_url ?? 'https://tackbird-v2.vercel.app/events',
                    })
                    if (shared) Alert.alert(t('events.linkCopied'))
                  }}
                  style={[ev.detailShareBtn, { borderColor: colors.border }]}
                >
                  <Share2 size={18} color={colors.foreground} />
                </Pressable>
              </View>
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
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi },
  headerSub: { fontSize: 13, marginTop: 2, fontFamily: fonts.body },
  heroBanner: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#2D6B5E', padding: 20,
  },
  heroContent: { gap: 6 },
  heroLabel: { fontSize: 10, fontWeight: '500', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', fontFamily: fonts.bodyMedium },
  heroTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', lineHeight: 22, fontFamily: fonts.heading },
  heroDesc: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18, fontFamily: fonts.body },
  heroCta: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'flex-start',
  },
  heroCtaText: { fontSize: 14, fontWeight: '600', color: '#2D6B5E', fontFamily: fonts.bodySemi },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  viewBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  fabBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodyMedium },
  dateFilters: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  dateChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  dateChipText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 },
  card: { borderRadius: 12, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', padding: 12, gap: 12, alignItems: 'flex-start' },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cityImg: { width: 60, height: 60, borderRadius: 10 },
  cardContent: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', lineHeight: 20, fontFamily: fonts.headingSemi },
  cardDate: { fontSize: 13, fontWeight: '500', fontFamily: fonts.bodyMedium },
  scheduleText: { fontSize: 12, fontFamily: fonts.body },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, flex: 1, fontFamily: fonts.body },
  freeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-start', marginTop: 2 },
  freeText: { fontSize: 11, fontWeight: '600', fontFamily: fonts.bodySemi },
  cardActions: { gap: 12, alignItems: 'center' },
  cardBottom: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 12, gap: 8, alignItems: 'center' },
  attendBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, minWidth: 90, alignItems: 'center' },
  attendText: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  creatorAvatar: { width: 20, height: 20, borderRadius: 10 },
  creatorName: { fontSize: 12, fontFamily: fonts.body },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center', fontFamily: fonts.headingSemi },
  emptyHint: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: fonts.body },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 18, fontWeight: '700', fontFamily: fonts.headingSemi },
  modalBody: { padding: 16, gap: 12, paddingBottom: 40 },
  detailImg: { width: '100%', height: 200, borderRadius: 12 },
  detailTitle: { fontSize: 22, fontWeight: '700', lineHeight: 28, fontFamily: fonts.heading },
  detailDate: { fontSize: 16, fontWeight: '500', fontFamily: fonts.bodyMedium },
  detailSection: { gap: 4 },
  detailSectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: fonts.bodyMedium },
  detailDesc: { fontSize: 15, lineHeight: 22, fontFamily: fonts.body },
  detailMeta: { fontSize: 14, fontFamily: fonts.body },
  detailMetaSub: { fontSize: 12, marginTop: 1, fontFamily: fonts.body },
  detailLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  detailAttendeeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailCreatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  detailCreatorAvatar: { width: 32, height: 32, borderRadius: 16 },
  detailCreatorName: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodyMedium },
  detailActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  detailBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  detailBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi },
  detailShareBtn: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  calDayTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4, textTransform: 'capitalize', fontFamily: fonts.headingSemi },
  calNoEvents: { fontSize: 14, textAlign: 'center', paddingTop: 20, fontFamily: fonts.body },
  showAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, marginBottom: 4 },
  showAllText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },
})
