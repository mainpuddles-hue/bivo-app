declare const __DEV__: boolean

import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, FlatList, RefreshControl, Pressable, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { getBlockedUserIds } from '@/lib/blockedUsers'
import { Image } from 'expo-image'
import {
  ArrowLeft, CalendarDays, MapPin, Users, Plus,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { formatEventDateShort } from '@/lib/format'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import type { CommunityEvent } from '@/lib/types'

type CategoryFilter = 'all' | 'social' | 'sports' | 'culture' | 'nature' | 'kids' | 'other'

const CATEGORY_FILTERS: { key: CategoryFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'events.categoryAll' },
  { key: 'social', labelKey: 'events.catSocial' },
  { key: 'sports', labelKey: 'events.catSports' },
  { key: 'culture', labelKey: 'events.catCulture' },
  { key: 'nature', labelKey: 'events.catNature' },
  { key: 'kids', labelKey: 'events.catKids' },
  { key: 'other', labelKey: 'events.catOther' },
]

const CATEGORY_COLORS: Record<string, string> = {
  social: '#8B5CF6',
  sports: '#EF4444',
  culture: '#F59E0B',
  nature: '#10B981',
  kids: '#EC4899',
  other: '#6B7280',
}

function CommunityEventsScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')

  const fetchEvents = useCallback(async () => {
    try {
      const now = new Date().toISOString()
      const { data, error } = await (supabase
        .from('community_events')
        .select('*, creator:profiles!community_events_creator_id_fkey(id, name, avatar_url)') as any)
        .eq('is_active', true)
        .gte('event_date', now)
        .order('event_date', { ascending: true })
        .limit(100)

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

  const filteredEvents = useMemo(() => {
    if (categoryFilter === 'all') return events
    return events.filter(e => e.category === categoryFilter)
  }, [events, categoryFilter])

  const renderEventCard = useCallback(({ item }: { item: CommunityEvent }) => {
    const catColor = CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other
    const catLabel = t(CATEGORY_FILTERS.find(f => f.key === item.category)?.labelKey ?? 'events.catOther')
    const participantCount = item.participant_count ?? 0
    const participantsLabel = item.max_participants
      ? t('events.participantsCountMax', { count: participantCount, max: item.max_participants })
      : t('events.participantsCount', { count: participantCount })

    return (
      <Pressable
        onPress={() => router.push(`/event/${item.id}` as any)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${formatEventDateShort(item.event_date, locale)}`}
        style={[s.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={s.cardBody}>
          {/* Image or placeholder */}
          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={s.cardImage}
              contentFit="cover"
            />
          ) : (
            <View style={[s.cardImagePlaceholder, { backgroundColor: `${catColor}18` }]}>
              <CalendarDays size={28} color={catColor} strokeWidth={1.4} />
            </View>
          )}

          {/* Content */}
          <View style={s.cardContent}>
            <View style={s.cardTitleRow}>
              <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                {item.title}
              </Text>
              <View style={[s.catBadge, { backgroundColor: `${catColor}20` }]}>
                <Text style={[s.catBadgeText, { color: catColor }]}>{catLabel}</Text>
              </View>
            </View>

            <View style={s.cardMeta}>
              <CalendarDays size={14} color={colors.primary} strokeWidth={1.6} />
              <Text style={[s.cardMetaText, { color: colors.primary }]}>
                {formatEventDateShort(item.event_date, locale)}
              </Text>
            </View>

            {item.location_name && (
              <View style={s.cardMeta}>
                <MapPin size={14} color={colors.mutedForeground} strokeWidth={1.6} />
                <Text style={[s.cardMetaText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {item.location_name}
                </Text>
              </View>
            )}

            <View style={s.cardMeta}>
              <Users size={14} color={colors.mutedForeground} strokeWidth={1.6} />
              <Text style={[s.cardMetaText, { color: colors.mutedForeground }]}>
                {participantsLabel}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    )
  }, [colors, t, locale, router])

  const keyExtractor = useCallback((item: CommunityEvent) => item.id, [])

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('events.communityEventsTitle')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipRow}
        style={s.chipScroll}
      >
        {CATEGORY_FILTERS.map(({ key, labelKey }) => {
          const isActive = categoryFilter === key
          return (
            <Pressable
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
              <Text style={[s.chipText, { color: isActive ? colors.primaryForeground : colors.mutedForeground }]}>
                {t(labelKey)}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Events list */}
      <FlatList
        data={filteredEvents}
        renderItem={renderEventCard}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          s.listContent,
          { paddingBottom: insets.bottom + 32 },
          filteredEvents.length === 0 && s.emptyContainer,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          loading ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 80 }} /> : (
            <View style={s.emptyState}>
              <CalendarDays size={48} color={colors.mutedForeground} strokeWidth={1.3} />
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>{t('events.noUpcomingEvents')}</Text>
              <Pressable
                onPress={() => router.push('/create-event' as any)}
                accessibilityRole="button"
                accessibilityLabel={t('events.createFirstEvent')}
                style={[s.emptyCta, { backgroundColor: colors.primary }]}
              >
                <Plus size={18} color={colors.primaryForeground} strokeWidth={2} />
                <Text style={[s.emptyCtaText, { color: colors.primaryForeground }]}>{t('events.createFirstEvent')}</Text>
              </Pressable>
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },

  // Event card
  eventCard: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardBody: {
    flexDirection: 'row',
  },
  cardImage: {
    width: 120,
    height: 120,
  },
  cardImagePlaceholder: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    flex: 1,
    lineHeight: 20,
  },
  catBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  catBadgeText: {
    fontSize: 11,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardMetaText: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
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
