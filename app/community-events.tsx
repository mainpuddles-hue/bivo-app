declare const __DEV__: boolean

import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, FlatList, RefreshControl, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { getBlockedUserIds } from '@/lib/blockedUsers'
import {
  ArrowLeft, CalendarDays, Plus, TrendingUp, Coffee,
} from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { EventCardSkeleton, TableCardSkeleton } from '@/components/SkeletonLoaders'
import { PressableOpacity } from '@/components/ui'
import { EventCard } from '@/components/EventCard'
import { TableCard } from '@/components/TableCard'
import { isTableEvent, isExpiredEvent } from '@/lib/eventHelpers'
import type { CommunityEvent, EventCategory } from '@/lib/types'

type CategoryFilter = 'all' | EventCategory

const CATEGORY_FILTERS: { key: CategoryFilter; labelKey: string; color: string }[] = [
  { key: 'all', labelKey: 'events.categoryAll', color: '#6B7280' },
  { key: 'social', labelKey: 'events.catSocial', color: '#7C5CBF' },
  { key: 'sports', labelKey: 'events.catSports', color: '#2B8A62' },
  { key: 'culture', labelKey: 'events.catCulture', color: '#3B7DD8' },
  { key: 'nature', labelKey: 'events.catNature', color: '#4CAF6A' },
  { key: 'kids', labelKey: 'events.catKids', color: '#E8A050' },
  { key: 'other', labelKey: 'events.catOther', color: '#6B7280' },
]

function CommunityEventsScreenInner() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')

  const fetchEvents = useCallback(async () => {
    try {
      const { data, error } = await (supabase
        .from('community_events')
        .select('*, creator:profiles!community_events_creator_id_fkey(id, name, avatar_url)') as any)
        .eq('is_active', true)
        .order('event_date', { ascending: true })
        .limit(150)

      if (error) {
        if (__DEV__) console.log('[community-events] fetch error:', error.message)
      }
      let events = (data ?? []) as CommunityEvent[]
      // Filter out events from blocked users
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const blocked = await getBlockedUserIds(user.id)
        if (blocked.size > 0) events = events.filter(e => !blocked.has((e as any).creator_id))
      }
      setEvents(events)
    } catch (err) {
      if (__DEV__) console.log('[community-events] error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase])

  useFocusEffect(
    useCallback(() => {
      fetchEvents()
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
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/(auth)/login')
        return
      }
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
      await (supabase.from('community_event_participants') as any)
        .upsert(
          { event_id: eventId, user_id: user.id, status: 'joined' },
          { onConflict: 'event_id,user_id', ignoreDuplicates: true },
        )
      // Refresh to update counts
      fetchEvents()
    } catch (err) {
      if (__DEV__) console.log('[community-events] quick join error:', err)
      Alert.alert(t('common.error'), t('events.joinFailed'))
    }
  }, [supabase, fetchEvents, router, t])

  const renderEventCard = useCallback(({ item }: { item: CommunityEvent }) => (
    <EventCard event={item} />
  ), [])

  const keyExtractor = useCallback((item: CommunityEvent) => item.id, [])

  // ── Section header component ──
  const SectionHeader = useCallback(({ icon: Icon, iconColor, title, actionLabel, onAction }: {
    icon: any; iconColor: string; title: string; actionLabel?: string; onAction?: () => void
  }) => (
    <View style={s.sectionHeader}>
      <View style={s.sectionTitleRow}>
        <Icon size={18} color={iconColor} strokeWidth={2} />
        <Text style={[s.sectionTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>
          {title}
        </Text>
      </View>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={[s.sectionAction, { color: colors.primary, fontFamily: fonts.bodySemi }]}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  ), [colors, fonts])

  // ── Tables horizontal list ──
  const renderTableSection = () => {
    if (tableEvents.length === 0 && !loading) return null

    return (
      <View style={s.section}>
        <SectionHeader
          icon={Coffee}
          iconColor="#8B5E3C"
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
              try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
              router.push('/create-table' as any)
            }}
            style={({ pressed }) => [
              s.createTableCard,
              { backgroundColor: isDark ? colors.card : '#F9FAFB', borderColor: colors.border },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('tables.create')}
          >
            <View style={[s.createTableIcon, { backgroundColor: `${colors.primary}15` }]}>
              <Plus size={24} color={colors.primary} strokeWidth={2} />
            </View>
            <Text style={[s.createTableText, { color: colors.primary, fontFamily: fonts.bodySemi }]}>
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
          icon={TrendingUp}
          iconColor={colors.primary}
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
  const ListHeader = useMemo(() => (
    <View>
      {/* Tables section */}
      {renderTableSection()}

      {/* Trending section */}
      {renderTrendingSection()}

      {/* "All Events" label */}
      {filteredEvents.length > 0 && (
        <Text style={[s.allEventsLabel, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>
          {t('events.communityEventsTitle')}
        </Text>
      )}
    </View>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [tableEvents, trendingEvents, filteredEvents.length, colors, t, isDark, handleQuickJoin, loading, router])

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <PressableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={24} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('events.communityEventsTitle')}</Text>
        <Pressable
          onPress={() => router.push('/create-event' as any)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('events.create')}
          style={s.backBtn}
        >
          <Plus size={22} color={colors.primary} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipRow}
        style={s.chipScroll}
      >
        {CATEGORY_FILTERS.map(({ key, labelKey, color }) => {
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
                { backgroundColor: isActive ? colors.primary : colors.muted },
              ]}
            >
              {key !== 'all' && (
                <View style={[s.chipDot, { backgroundColor: isActive ? colors.primaryForeground : color }]} />
              )}
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
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: 16, padding: 16 }}>
              <EventCardSkeleton />
              <EventCardSkeleton />
              <EventCardSkeleton />
            </View>
          ) : (
            <View style={s.emptyState}>
              <CalendarDays size={48} color={colors.mutedForeground} strokeWidth={1.3} />
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('events.noUpcomingEvents')}</Text>
              <PressableOpacity
                onPress={() => router.push('/create-event' as any)}
                accessibilityRole="button"
                accessibilityLabel={t('events.createFirstEvent')}
                style={[s.emptyCta, { backgroundColor: colors.primary }]}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
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

  // Create table card
  createTableCard: {
    width: 180,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
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
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },

  // All events label
  allEventsLabel: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },

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
    borderRadius: 12,
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
