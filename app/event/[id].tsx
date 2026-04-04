declare const __DEV__: boolean

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { Image } from 'expo-image'
import {
  ArrowLeft, Share2, Flag, CalendarDays, MapPin, Users, Clock, MessageCircle, XCircle,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { shareContent } from '@/lib/share'
import { Avatar } from '@/components/Avatar'
import { ReportModal } from '@/components/ReportModal'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { formatEventDate } from '@/lib/format'
import { isValidUUID } from '@/lib/validation'
import { getCachedUserId } from '@/lib/authCache'
import type { CommunityEvent, EventParticipant } from '@/lib/types'

// TODO: These are external event category colors (not post type colors from CATEGORIES constant).
// They don't map to the theme or CATEGORIES — keep hardcoded until a shared event-category palette exists.
const CATEGORY_COLORS: Record<string, string> = {
  social: '#8B5CF6',
  sports: '#EF4444',
  culture: '#F59E0B',
  nature: '#10B981',
  kids: '#EC4899',
  other: '#6B7280',
}

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  social: 'events.catSocial',
  sports: 'events.catSports',
  culture: 'events.catCulture',
  nature: 'events.catNature',
  kids: 'events.catKids',
  other: 'events.catOther',
}

function EventDetailScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()

  const [event, setEvent] = useState<CommunityEvent | null>(null)
  const [participants, setParticipants] = useState<EventParticipant[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [reportModalVisible, setReportModalVisible] = useState(false)
  const joiningRef = useRef(false)

  // Derived
  const myParticipation = participants.find(p => p.user_id === userId)
  const myStatus = myParticipation?.status ?? null
  const participantCount = participants.filter(p => p.status === 'joined' || p.status === 'approved').length
  const isCreator = userId != null && event?.creator_id === userId
  const isFull = event?.max_participants != null && participantCount >= event.max_participants
  const isPast = event != null && new Date(event.event_date) < new Date()

  const fetchEvent = useCallback(async () => {
    if (!id || !isValidUUID(id)) {
      setLoading(false)
      return
    }
    try {
      const cachedId = await getCachedUserId()
      if (cachedId) setUserId(cachedId)

      const { data, error } = await (supabase
        .from('community_events')
        .select('*, creator:profiles!community_events_creator_id_fkey(id, name, avatar_url)') as any)
        .eq('id', id)
        .single()

      if (error || !data) {
        if (__DEV__) console.log('[event-detail] fetch error:', error?.message)
        setLoading(false)
        return
      }
      setEvent(data as CommunityEvent)

      const { data: parts } = await (supabase
        .from('community_event_participants')
        .select('*, user:profiles(id, name, avatar_url)') as any)
        .eq('event_id', id)

      setParticipants((parts ?? []) as EventParticipant[])
    } catch (err) {
      if (__DEV__) console.log('[event-detail] error:', err)
    } finally {
      setLoading(false)
    }
  }, [id, supabase])

  useFocusEffect(useCallback(() => { fetchEvent() }, [fetchEvent]))

  // ── Join / Leave logic ──
  const handleJoin = useCallback(async () => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (joiningRef.current || !event) return
    joiningRef.current = true
    try {
      const status = event.approval_required ? 'pending' : 'joined'
      const { error } = await (supabase.from('community_event_participants') as any)
        .insert({ event_id: event.id, user_id: userId, status })
      if (error) {
        if (error.code !== '23505') Alert.alert(t('common.error'), t('events.joinFailed'))
        // 23505 = already joined — just refresh
        await fetchEvent()
      } else {
        // Notify event creator about new participant
        if (event.creator_id && event.creator_id !== userId) {
          try {
            await (supabase.from('notifications') as any).insert({
              user_id: event.creator_id,
              from_user_id: userId,
              type: 'event_reminder',
              title: t('notifications.eventJoined'),
              body: event.title,
              link_type: 'event',
              link_id: event.id,
            })
          } catch {}
        }
        await fetchEvent()
      }
    } catch {
      Alert.alert(t('common.error'), t('events.joinFailed'))
    } finally {
      joiningRef.current = false
    }
  }, [userId, event, supabase, fetchEvent, t, router])

  const handleLeave = useCallback(async () => {
    if (!userId || joiningRef.current || !event) return
    joiningRef.current = true
    try {
      const { error } = await (supabase.from('community_event_participants') as any)
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', userId)
      if (error) {
        Alert.alert(t('common.error'), t('events.leaveFailed'))
      } else {
        await fetchEvent()
      }
    } catch {
      Alert.alert(t('common.error'), t('events.leaveFailed'))
    } finally {
      joiningRef.current = false
    }
  }, [userId, event, supabase, fetchEvent, t])

  const handleCancelEvent = useCallback(() => {
    if (!event || !isCreator) return
    Alert.alert(
      t('events.cancelEvent'),
      t('events.cancelEventConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await (supabase.from('community_events') as any)
                .update({ is_active: false })
                .eq('id', event.id)
              if (error) {
                Alert.alert(t('common.error'), t('events.cancelFailed'))
              } else {
                Alert.alert(t('common.success'), t('events.eventCancelled'))
                router.back()
              }
            } catch {
              Alert.alert(t('common.error'), t('events.cancelFailed'))
            }
          },
        },
      ],
    )
  }, [event, isCreator, supabase, t, router])

  const handleShare = useCallback(() => {
    if (!event) return
    shareContent({
      title: event.title,
      text: `${event.title} - ${formatEventDate(event.event_date, locale)}`,
    })
  }, [event, locale])

  const messagingRef = useRef(false)
  const handleMessageCreator = useCallback(async () => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (!event?.creator?.id) return
    if (event.creator.id === userId) return
    if (messagingRef.current) return
    messagingRef.current = true
    try {
      const { data: existing, error: findError } = await supabase
        .from('conversations').select('id')
        .or(`and(user1_id.eq.${userId},user2_id.eq.${event.creator.id}),and(user1_id.eq.${event.creator.id},user2_id.eq.${userId})`)
        .maybeSingle()
      if (findError) { Alert.alert(t('common.error'), t('messages.conversationCreateFailed')); return }
      if (existing) {
        router.push(`/messages/${(existing as any).id}`)
      } else {
        const { data: newConv, error } = await (supabase.from('conversations') as any)
          .insert({ user1_id: userId, user2_id: event.creator.id }).select('id').single()
        if (error || !newConv) { Alert.alert(t('common.error'), t('messages.conversationCreateFailed')); return }
        router.push(`/messages/${newConv.id}`)
      }
    } catch {
      Alert.alert(t('common.error'), t('messages.conversationCreateFailed'))
    } finally {
      messagingRef.current = false
    }
  }, [userId, event, supabase, router, t])

  // ── Render ──

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <View style={[s.headerBar, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    )
  }

  if (!event) {
    return (
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <View style={[s.headerBar, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={s.loadingContainer}>
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('events.eventNotFound')}</Text>
        </View>
      </View>
    )
  }

  const catColor = CATEGORY_COLORS[event.category] ?? CATEGORY_COLORS.other
  const catLabel = t(CATEGORY_LABEL_KEYS[event.category] ?? 'events.catOther')
  const displayParticipants = participants
    .filter(p => p.status === 'joined' || p.status === 'approved')
    .slice(0, 5)

  // Format event time
  const eventDate = new Date(event.event_date)
  const isValidDate = !isNaN(eventDate.getTime())
  const timeStr = isValidDate
    ? eventDate.toLocaleTimeString(locale === 'en' ? 'en-GB' : locale === 'sv' ? 'sv-SE' : 'fi-FI', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--:--'

  // Participants text
  const participantsText = event.max_participants
    ? t('events.participantsCountMax', { count: participantCount, max: event.max_participants })
    : t('events.participantsCount', { count: participantCount })

  // Action button — hide for past events
  let actionLabel = ''
  let actionColor = colors.primary
  let actionOnPress: (() => void) | null = null
  let actionDisabled = false

  if (isPast || isCreator) {
    // Past events and creators see no action button
  } else if (myStatus === 'joined' || myStatus === 'approved') {
    actionLabel = t('events.leaveEvent')
    actionColor = colors.destructive
    actionOnPress = handleLeave
  } else if (myStatus === 'pending') {
    actionLabel = t('events.pendingApproval')
    actionColor = colors.pro
    actionDisabled = true
  } else if (isFull) {
    actionLabel = t('events.isFull')
    actionColor = colors.mutedForeground
    actionDisabled = true
  } else if (event.approval_required) {
    actionLabel = t('events.requestSpot')
    actionOnPress = handleJoin
  } else {
    actionLabel = t('events.joinEvent')
    actionOnPress = handleJoin
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      {/* Header bar */}
      <View style={[s.headerBar, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.7 }} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <View style={s.headerActions}>
          <Pressable onPress={handleShare} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.7 }} accessibilityRole="button" accessibilityLabel={t('common.share')}>
            <Share2 size={20} color={colors.foreground} />
          </Pressable>
          <Pressable onPress={() => setReportModalVisible(true)} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.7 }} accessibilityRole="button" accessibilityLabel="Report">
            <Flag size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero image */}
        <View style={s.heroContainer}>
          {event.image_url ? (
            <Image
              source={{ uri: event.image_url }}
              style={s.heroImage}
              contentFit="cover"
            />
          ) : (
            <View style={[s.heroPlaceholder, { backgroundColor: `${catColor}30` }]}>
              <CalendarDays size={64} color={catColor} strokeWidth={1.4} />
            </View>
          )}
          {/* Category badge */}
          <View style={[s.categoryBadge, { backgroundColor: catColor }]}>
            <Text style={s.categoryBadgeText}>{catLabel}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={[s.title, { color: colors.foreground }]} numberOfLines={3}>{event.title}</Text>

        {/* Past event banner */}
        {isPast && (
          <View style={[s.endedBanner, { backgroundColor: `${colors.destructive}15` }]}>
            <XCircle size={16} color={colors.destructive} />
            <Text style={[s.endedBannerText, { color: colors.destructive }]}>{t('events.eventEnded')}</Text>
          </View>
        )}

        {/* Date + time */}
        <View style={s.infoRow}>
          <CalendarDays size={18} color={colors.primary} strokeWidth={1.6} />
          <Text style={[s.infoText, { color: colors.foreground }]}>
            {formatEventDate(event.event_date, locale)}
          </Text>
        </View>
        <View style={s.infoRow}>
          <Clock size={18} color={colors.primary} strokeWidth={1.6} />
          <Text style={[s.infoText, { color: colors.foreground }]}>{timeStr}</Text>
        </View>

        {/* Location */}
        {event.location_name && (
          <View style={s.infoRow}>
            <MapPin size={18} color={colors.primary} strokeWidth={1.6} />
            <Text style={[s.infoText, { color: colors.foreground }]} numberOfLines={2}>{event.location_name}</Text>
          </View>
        )}

        {/* Description */}
        {event.description && (
          <View style={s.descriptionSection}>
            <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('events.description')}</Text>
            <Text style={[s.descriptionText, { color: colors.foreground }]}>{event.description}</Text>
          </View>
        )}

        {/* Participants section */}
        <View style={s.participantsSection}>
          <View style={s.participantsHeader}>
            <Users size={18} color={colors.primary} strokeWidth={1.6} />
            <Text style={[s.participantsText, { color: colors.foreground }]}>{participantsText}</Text>
          </View>

          {/* Avatar row */}
          {displayParticipants.length > 0 && (
            <View style={s.avatarRow}>
              {displayParticipants.map((p, i) => (
                <View key={p.id} style={[s.avatarItem, i > 0 && { marginLeft: -8 }]}>
                  <Avatar
                    url={p.user?.avatar_url}
                    name={p.user?.name}
                    size={32}
                    borderColor={colors.background}
                    borderWidth={2}
                  />
                </View>
              ))}
              {participantCount > 5 && (
                <View style={[s.moreAvatars, { backgroundColor: colors.muted }]}>
                  <Text style={[s.moreAvatarsText, { color: colors.mutedForeground }]}>
                    +{participantCount - 5}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Action button */}
          {!isCreator && actionLabel !== '' && (
            <Pressable
              onPress={actionOnPress ?? undefined}
              disabled={actionDisabled}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              style={({ pressed }) => [
                s.actionButton,
                { backgroundColor: actionDisabled ? colors.muted : actionColor, opacity: actionDisabled ? 0.6 : pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[s.actionButtonText, { color: actionDisabled ? colors.mutedForeground : colors.primaryForeground }]}>
                {actionLabel}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Creator card */}
        {event.creator && (
          <Pressable
            onPress={() => router.push(`/profile/${event.creator!.id}` as any)}
            accessibilityRole="button"
            accessibilityLabel={`${event.creator.name}, ${t('events.organizer')}`}
            style={({ pressed }) => [s.creatorCard, { backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}
          >
            <Avatar url={event.creator.avatar_url} name={event.creator.name} size={44} />
            <View style={s.creatorInfo}>
              <Text style={[s.creatorName, { color: colors.foreground }]} numberOfLines={1}>{event.creator.name}</Text>
              <View style={[s.organizerBadge, { backgroundColor: `${colors.primary}15` }]}>
                <Text style={[s.organizerBadgeText, { color: colors.primary }]}>{t('events.organizer')}</Text>
              </View>
            </View>
          </Pressable>
        )}

        {/* Message organizer */}
        {event.creator && !isCreator && (
          <Pressable
            onPress={handleMessageCreator}
            accessibilityRole="button"
            accessibilityLabel={t('events.messageOrganizer')}
            style={({ pressed }) => [s.messageCreatorBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.7 }]}
          >
            <MessageCircle size={18} color={colors.primaryForeground} strokeWidth={1.8} />
            <Text style={[s.messageCreatorText, { color: colors.primaryForeground }]}>
              {t('events.messageOrganizer')}
            </Text>
          </Pressable>
        )}

        {/* Creator actions — hide for past events */}
        {isCreator && !isPast && (
          <View style={s.creatorActions}>
            <Pressable
              onPress={() => router.push(`/create-event?edit=${event.id}` as any)}
              accessibilityRole="button"
              accessibilityLabel={t('events.editEventAction')}
              style={({ pressed }) => [s.creatorActionBtn, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
            >
              <Text style={[s.creatorActionText, { color: colors.primary }]}>{t('events.editEventAction')}</Text>
            </Pressable>
            <Pressable
              onPress={handleCancelEvent}
              accessibilityRole="button"
              accessibilityLabel={t('events.cancelEvent')}
              style={({ pressed }) => [s.creatorActionBtn, { backgroundColor: `${colors.destructive}10`, borderColor: colors.destructive }, pressed && { opacity: 0.7 }]}
            >
              <Text style={[s.creatorActionText, { color: colors.destructive }]}>{t('events.cancelEvent')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Report Modal */}
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        targetId={event.id}
        type="event"
      />
    </View>
  )
}

// ── Styles ──
const s = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 0 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
  },

  // Hero
  heroContainer: {
    width: '100%',
    height: 250,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: 250,
  },
  heroPlaceholder: {
    width: '100%',
    height: 250,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // Title
  title: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    lineHeight: 30,
  },

  // Ended banner
  endedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  endedBannerText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  infoText: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },

  // Description
  descriptionSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: 16,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: fonts.body,
  },

  // Participants
  participantsSection: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 12,
  },
  participantsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participantsText: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
  },
  avatarItem: {
    zIndex: 1,
  },
  moreAvatars: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  moreAvatarsText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  actionButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
    minHeight: 48,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 22,
  },

  // Creator card
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
  },
  creatorInfo: {
    flex: 1,
    gap: 4,
  },
  creatorName: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.headingSemi,
    lineHeight: 20,
  },
  organizerBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  organizerBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // Message creator button
  messageCreatorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 16,
    borderRadius: 12,
    minHeight: 48,
  },
  messageCreatorText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },

  // Creator actions
  creatorActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  creatorActionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  creatorActionText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
})

export default function EventDetailScreen() {
  return (
    <ScreenErrorBoundary screenName="EventDetail">
      <EventDetailScreenInner />
    </ScreenErrorBoundary>
  )
}
