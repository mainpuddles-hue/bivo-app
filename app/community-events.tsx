declare const __DEV__: boolean

import { useState, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, FlatList, RefreshControl, Pressable, ScrollView, StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { getBlockedUserIds } from '@/lib/blockedUsers'
import {
  ArrowLeft, CalendarDays, Plus, Home, Coffee, Leaf,
} from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { EventCardSkeleton, TableCardSkeleton } from '@/components/SkeletonLoaders'
import { PressableOpacity } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { EventCard } from '@/components/EventCard'
import { TableCard } from '@/components/TableCard'
import { isTableEvent, isExpiredEvent } from '@/lib/eventHelpers'
import type { CommunityEvent, EventCategory } from '@/lib/types'

type CategoryFilter = 'all' | EventCategory

const CATEGORY_FILTERS: { key: CategoryFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'events.categoryAll' },
  { key: 'social', labelKey: 'events.catSocial' },
  { key: 'sports', labelKey: 'events.catSports' },
  { key: 'culture', labelKey: 'events.catCulture' },
  { key: 'nature', labelKey: 'events.catNature' },
  { key: 'kids', labelKey: 'events.catKids' },
  { key: 'other', labelKey: 'events.catOther' },
]

function CommunityEventsScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()

  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [fetchError, setFetchError] = useState(false)
  const mountedRef = useRef(true)
  const joiningRef = useRef<Set<string>>(new Set())

  const fetchEvents = useCallback(async () => {
    setFetchError(false)
    try {
      const { data, error } = await (supabase
        .from('community_events')
        .select('*, creator:profiles!community_events_creator_id_fkey(id, name, avatar_url)') as any)
        .eq('is_active', true)
        .order('event_date', { ascending: true })
        .limit(150)

      if (!mountedRef.current) return

      if (error) {
        if (__DEV__) console.log('[community-events] fetch error:', error.message)
        setFetchError(true)
        return
      }
      let events = (data ?? []) as CommunityEvent[]
      // Filter out events from blocked users
      const { getCachedUserId } = await import('@/lib/authCache')
      const cachedId = await getCachedUserId()
      if (!mountedRef.current) return
      if (cachedId) {
        const blocked = await getBlockedUserIds(cachedId)
        if (!mountedRef.current) return
        if (blocked.size > 0) events = events.filter(e => !blocked.has((e as any).creator_id))
      }
      setEvents(events)
    } catch (err) {
      if (__DEV__) console.log('[community-events] error:', err)
      if (!mountedRef.current) return
      setFetchError(true)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [supabase])

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true
      fetchEvents()
      return () => { mountedRef.current = false }
    }, [fetchEvents])
  )

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    fetchEvents()
  }, [fetchEvents])

  // Split events into regular events and tables
  const { regularEvents, tableEvents, trendingEvents } = useMemo(() => {
    const now = new Date()
    const upcoming = events.filter(e => !isExpiredEvent(e))
    const regular = upcoming.filter(e => !isTableEvent(e))
    const tables = upcoming.filter(e => isTableEvent(e))

    // Trending = top 5 events by participant count
    const trending = [...regular]
      .sort((a, b) => (b.participant_count ?? 0) - (a.participant_count ?? 0))
      .slice(0, 5)
      .filter(e => (e.participant_count ?? 0) > 0)

    return { regularEvents: regular, tableEvents: tables, trendingEvents: trending }
  }, [events])

  const filteredEvents = useMemo(() => {
    if (categoryFilter === 'all') return regularEvents
    return regularEvents.filter(e => e.category === categoryFilter)
  }, [regularEvents, categoryFilter])

  const handleQuickJoin = useCallback(async (eventId: string) => {
    if (joiningRef.current.has(eventId)) return
    joiningRef.current.add(eventId)
    try {
      const { getCachedUserId } = await import('@/lib/authCache')
      const cachedId = await getCachedUserId()
      if (!cachedId) {
        router.replace('/(auth)/login')
        return
      }
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch (e) { if (__DEV__) console.warn('[community-events] haptics failed:', e) }

      // Optimistic update — mark event as joined before the network call
      setEvents(prev => prev.map(e =>
        e.id === eventId
          ? { ...e, participant_count: (e.participant_count ?? 0) + 1, _optimisticJoined: true } as any
          : e
      ))

      const { error: joinError } = await (supabase.from('community_event_participants') as any)
        .upsert(
          { event_id: eventId, user_id: cachedId, status: 'joined' },
          { onConflict: 'event_id,user_id', ignoreDuplicates: true },
        )
      if (joinError) {
        // Revert optimistic update on failure — only revert the specific event
        setEvents(prev => prev.map(e =>
          e.id === eventId
            ? { ...e, participant_count: Math.max(0, (e.participant_count ?? 1) - 1), _optimisticJoined: undefined } as any
            : e
        ))
        throw joinError
      }
      // Refresh to sync with real server state
      fetchEvents()
    } catch (err) {
      if (__DEV__) console.log('[community-events] quick join error:', err)
      toast.show({ message: t('events.joinFailed'), type: 'error' })
    } finally {
      joiningRef.current.delete(eventId)
    }
  }, [supabase, fetchEvents, router, t, toast])

  const renderEventCard = useCallback(({ item }: { item: CommunityEvent }) => (
    <EventCard event={item} />
  ), [])

  const keyExtractor = useCallback((item: CommunityEvent) => item.id, [])

  // ── Section header component ──
  const SectionHeader = useCallback(({ title, actionLabel, onAction }: {
    title: string; actionLabel?: string; onAction?: () => void
  }) => (
    <View style={s.sectionHeader}>
      <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>
        {title}
      </Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={[s.sectionAction, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  ), [colors])

  // ── Tables horizontal list ──
  const renderTableSection = () => {
    if (tableEvents.length === 0 && !loading) return null

    return (
      <View style={s.section}>
        <SectionHeader
          title={t('tables.title')}
          actionLabel={t('events.showAllEvents')}
          onAction={() => {}}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.horizontalList}
        >
          {loading && tableEvents.length === 0 ? (
            <>
              <TableCardSkeleton />
              <TableCardSkeleton />
            </>
          ) : tableEvents.map(event => (
            <TableCard key={event.id} event={event} onJoin={handleQuickJoin} />
          ))}

          {/* Create table card */}
          <Pressable
            onPress={() => {
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch (e) { if (__DEV__) console.warn('[community-events] haptics failed:', e) }
              router.push('/create-event' as any)
            }}
            style={({ pressed }) => [
              s.createTableCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('tables.create')}
          >
            <View style={[s.createTableIcon, { backgroundColor: colors.muted }]}>
              <Plus size={24} color={colors.foreground} strokeWidth={2} />
            </View>
            <Text style={[s.createTableText, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
              {t('tables.create')}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    )
  }

  // ── Trending horizontal list ──
  const renderTrendingSection = () => {
    if (trendingEvents.length === 0) return null

    return (
      <View style={s.section}>
        <SectionHeader
          title={t('events.trending')}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.horizontalList}
        >
          {trendingEvents.map(event => (
            <View key={event.id} style={s.trendingCardWrap}>
              <EventCard event={event} compact />
            </View>
          ))}
        </ScrollView>
      </View>
    )
  }

  // ── FlatList header ──
  // Template shortcuts for building-level events
  const TEMPLATE_SHORTCUTS = useMemo(() => [
    { key: 'rappukirppis', labelKey: 'events.templateRappukirppis', Icon: Home },
    { key: 'talkoot', labelKey: 'events.templateTalkoot', Icon: Leaf },
    { key: 'kahvit', labelKey: 'events.templateKahvit', Icon: Coffee },
  ], [])

  const ListHeader = useMemo(() => (
    <View>
      {/* Tables section */}
      {renderTableSection()}

      {/* Trending section */}
      {renderTrendingSection()}

      {/* Template shortcuts */}
      <View style={s.templateSection}>
        <Text style={[s.templateSectionTitle, { color: colors.mutedForeground, fontFamily: fonts.bodyMedium }]}>
          {t('events.quickCreate')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.templateRow}>
          {TEMPLATE_SHORTCUTS.map(({ key, labelKey, Icon }) => (
            <PressableOpacity
              key={key}
              onPress={() => {
                try { Haptics.selectionAsync() } catch (e) { if (__DEV__) console.warn('[community-events] haptics failed:', e) }
                router.push(`/create-event?template=${key}` as any)
              }}
              style={[s.templateChip, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={t(labelKey)}
            >
              <Icon size={16} color={colors.mutedForeground} />
              <Text style={[s.templateChipText, { color: colors.foreground, fontFamily: fonts.body }]}>
                {t(labelKey)}
              </Text>
            </PressableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* "All Events" label */}
      {filteredEvents.length > 0 && (
        <Text style={[s.allEventsLabel, { color: colors.mutedForeground }]}>
          {t('events.communityEventsTitle')}
        </Text>
      )}
    </View>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [tableEvents, trendingEvents, filteredEvents.length, colors, t, handleQuickJoin, loading, router])

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      {/* Header — circle back button + centered title + create button */}
      <View style={s.header}>
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[s.circleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={20} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('events.communityEventsTitle')}</Text>
        <PressableOpacity
          onPress={() => router.push('/create-event' as any)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('events.create')}
          style={[s.circleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Plus size={20} color={colors.foreground} strokeWidth={2} />
        </PressableOpacity>
      </View>

      {/* Category filter chips — monochrome pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipRow}
        style={s.chipScroll}
      >
        {CATEGORY_FILTERS.map(({ key, labelKey }) => {
          const isActive = categoryFilter === key
          return (
            <PressableOpacity
              key={key}
              onPress={() => setCategoryFilter(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={t(labelKey)}
              style={[
                s.chip,
                isActive
                  ? { backgroundColor: colors.foreground }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
            >
              <Text style={[s.chipText, { color: isActive ? colors.primaryForeground : colors.mutedForeground }]}>
                {t(labelKey)}
              </Text>
            </PressableOpacity>
          )
        })}
      </ScrollView>

      {/* Events list */}
      <FlatList
        data={filteredEvents}
        renderItem={renderEventCard}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={[
          s.listContent,
          { paddingBottom: insets.bottom + 32 },
          filteredEvents.length === 0 && !loading && s.emptyContainer,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.foreground} />
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: 16, padding: 16 }}>
              <EventCardSkeleton />
              <EventCardSkeleton />
              <EventCardSkeleton />
            </View>
          ) : fetchError ? (
            <View style={s.emptyState}>
              <CalendarDays size={48} color={colors.mutedForeground} strokeWidth={1.3} />
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('common.error')}</Text>
              <PressableOpacity
                onPress={() => { setLoading(true); fetchEvents() }}
                accessibilityRole="button"
                accessibilityLabel={t('common.retry')}
                style={[s.emptyCta, { backgroundColor: colors.foreground }]}
              >
                <Text style={[s.emptyCtaText, { color: colors.primaryForeground }]}>{t('common.retry')}</Text>
              </PressableOpacity>
            </View>
          ) : (
            <View style={s.emptyState}>
              <CalendarDays size={48} color={colors.mutedForeground} strokeWidth={1.3} />
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('events.noUpcomingEvents')}</Text>
              <PressableOpacity
                onPress={() => router.push('/create-event' as any)}
                accessibilityRole="button"
                accessibilityLabel={t('events.createFirstEvent')}
                style={[s.emptyCta, { backgroundColor: colors.foreground }]}
              >
                <Plus size={18} color={colors.primaryForeground} strokeWidth={2} />
                <Text style={[s.emptyCtaText, { color: colors.primaryForeground }]}>{t('events.createFirstEvent')}</Text>
              </PressableOpacity>
            </View>
          )
        }
      />
    </View>
  )
}

// ── Styles ──
const s = StyleSheet.create({
  container: { flex: 1 },

  // Header — circle back + centered title + circle create
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.2,
    lineHeight: 24,
    textAlign: 'center',
  },

  // Filter chips — monochrome pills
  chipScroll: {
    flexGrow: 0,
    flexShrink: 0,
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
    borderRadius: 999,
    minHeight: 44,
  },
  chipText: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    lineHeight: 18,
  },
  listContent: {
    paddingTop: 4,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },

  // Sections
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  sectionAction: {
    fontSize: 13,
    lineHeight: 18,
  },
  horizontalList: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  trendingCardWrap: {
    width: 260,
  },

  // Create table card — monochrome
  createTableCard: {
    width: 180,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  createTableIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createTableText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
    textAlign: 'center',
  },

  // All events label — monochrome section label
  allEventsLabel: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },

  // Template shortcuts
  templateSection: { paddingTop: 12, gap: 8 },
  templateSectionTitle: {
    fontSize: 12, lineHeight: 16, textTransform: 'uppercase',
    letterSpacing: 1, paddingHorizontal: 16,
  },
  templateRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  templateChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
    borderWidth: 1, minHeight: 44,
  },
  templateChipText: { fontSize: 13, lineHeight: 18 },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    textAlign: 'center',
    fontFamily: fonts.headingSemi,
    lineHeight: 22,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  emptyCtaText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
})

export default function CommunityEventsScreen() {
  return (
    <ScreenErrorBoundary screenName="CommunityEvents">
      <CommunityEventsScreenInner />
    </ScreenErrorBoundary>
  )
}
