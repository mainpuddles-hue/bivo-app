declare const __DEV__: boolean

import { useState, useCallback, useRef } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet, Alert,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import { Image } from 'expo-image'
import {
  ArrowLeft, Share2, Flag, CalendarDays, MapPin, Users, Clock, MessageCircle, XCircle,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/components/Toast'
import { fonts } from '@/lib/fonts'
import { EventDetailSkeleton, FadeIn } from '@/components/SkeletonLoaders'
import { useSupabase } from '@/hooks/useSupabase'
import { shareContent } from '@/lib/share'
import { Avatar } from '@/components/Avatar'
import { ReportModal } from '@/components/ReportModal'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { formatEventDate } from '@/lib/format'
import { isValidUUID } from '@/lib/validation'
import { getCachedUserId } from '@/lib/authCache'
import { addMemberToChat, removeMemberFromChat } from '@/lib/eventChatHelpers'
import type { CommunityEvent, EventParticipant } from '@/lib/types'
import { EVENT_CATEGORY_COLORS as CATEGORY_COLORS } from '@/lib/constants'

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
  const toast = useToast()
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
  const isPast = event != null && !isNaN(new Date(event.event_date).getTime()) && new Date(event.event_date) < new Date()

  const fetchEvent = useCallback(async () => {
    if (!id || !isValidUUID(id)) {
      setLoading(false)
      return
    }
    try {
      const cachedId = await getCachedUserId()
      if (cachedId) setUserId(cachedId)

      // Fetch event + participants in parallel to avoid waterfall
      const [eventResult, partsResult] = await Promise.all([
        (supabase
          .from('community_events')
          .select('*, creator:profiles!community_events_creator_id_fkey(id, name, avatar_url)') as any)
          .eq('id', id)
          .maybeSingle(),
        (supabase
          .from('community_event_participants')
          .select('*, user:profiles(id, name, avatar_url)') as any)
          .eq('event_id', id),
      ])

      if (eventResult.error || !eventResult.data) {
        if (__DEV__) console.log('[event-detail] fetch error:', eventResult.error?.message)
        return
      }
      setEvent(eventResult.data as CommunityEvent)
      setParticipants((partsResult.data ?? []) as EventParticipant[])
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
    // Prevent joining past events
    if (!isNaN(new Date(event.event_date).getTime()) && new Date(event.event_date) < new Date()) {
      toast.show({ message: t('events.eventPassed') ?? 'Event has already ended', type: 'error' })
      return
    }
    // Prevent overbooking — re-check capacity from DB
    if (event.max_participants) {
      const { count } = await supabase.from('community_event_participants').select('*', { count: 'exact', head: true }).eq('event_id', event.id).in('status', ['joined', 'approved'])
      if ((count ?? 0) >= event.max_participants) {
        toast.show({ message: t('events.eventFull') ?? 'Event is full', type: 'error' })
        await fetchEvent()
        return
      }
    }
    joiningRef.current = true
    try {
      const status = event.approval_required ? 'pending' : 'joined'
      const { error } = await (supabase.from('community_event_participants') as any)
        .insert({ event_id: event.id, user_id: userId, status })
      if (error) {
        if (error.code !== '23505') toast.show({ message: t('events.joinFailed'), type: 'error' })
        // 23505 = already joined — just refresh
        await fetchEvent()
      } else {
        // Success feedback — toast is less intrusive than Alert for expected success
        toast.show({
          message: status === 'pending' ? t('events.joinPending') : t('events.joinedSuccess'),
          type: status === 'pending' ? 'info' : 'success',
        })
        // Add user to event group chat (soft fail — warn user if chat join fails)
        addMemberToChat(supabase, event.id, userId).catch((err) => {
          if (__DEV__) console.warn('[event] addMemberToChat failed:', err)
          toast.show({ message: t('events.chatJoinFailed') ?? 'Could not join event chat', type: 'info' })
        })
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
      toast.show({ message: t('events.joinFailed'), type: 'error' })
    } finally {
      joiningRef.current = false
    }
  }, [userId, event, supabase, fetchEvent, t, router, toast])

  const handleLeave = useCallback(() => {
    if (!userId || joiningRef.current || !event) return
    Alert.alert(
      t('events.leaveEvent'),
      t('events.leaveConfirm') ?? t('events.leaveEvent'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('events.leaveEvent'),
          style: 'destructive',
          onPress: async () => {
            if (!event) return
            joiningRef.current = true
            try {
              const { error } = await (supabase.from('community_event_participants') as any)
                .delete()
                .eq('event_id', event.id)
                .eq('user_id', userId)
              if (error) {
                toast.show({ message: t('events.leaveFailed'), type: 'error' })
              } else {
                // Remove user from event group chat (soft fail)
                removeMemberFromChat(supabase, event.id, userId).catch((err) => {
                  if (__DEV__) console.warn('[event] removeMemberFromChat failed:', err)
                })
                await fetchEvent()
              }
            } catch {
              toast.show({ message: t('events.leaveFailed'), type: 'error' })
            } finally {
              joiningRef.current = false
            }
          },
        },
      ],
    )
  }, [userId, event, supabase, fetchEvent, t, toast])

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
                toast.show({ message: t('events.cancelFailed'), type: 'error' })
              } else {
                toast.show({ message: t('events.eventCancelled'), type: 'success' })
                router.back()
              }
            } catch {
              toast.show({ message: t('events.cancelFailed'), type: 'error' })
            }
          },
        },
      ],
    )
  }, [event, isCreator, supabase, t, router, toast])

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
      if (findError) { toast.show({ message: t('messages.conversationCreateFailed'), type: 'error' }); return }
      if (existing) {
        router.push(`/messages/${(existing as any).id}`)
      } else {
        const { data: newConv, error } = await (supabase.from('conversations') as any)
          .insert({ user1_id: userId, user2_id: event.creator.id }).select('id').maybeSingle()
        if (error || !newConv) { toast.show({ message: t('messages.conversationCreateFailed'), type: 'error' }); return }
        router.push(`/messages/${newConv.id}`)
      }
    } catch {
      toast.show({ message: t('messages.conversationCreateFailed'), type: 'error' })
    } finally {
      messagingRef.current = false
    }
  }, [userId, event, supabase, router, t, toast])

  // ── Render ──

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.skeletonHeader, { paddingTop: insets.top + 8 }]}>
          <PressableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={[s.heroCircle, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)' }]}
          >
            <ArrowLeft size={18} color={colors.foreground} />
          </PressableOpacity>
        </View>
        <EventDetailSkeleton />
      </View>
    )
  }

  if (!event) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.skeletonHeader, { paddingTop: insets.top + 8 }]}>
          <PressableOpacity
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={[s.heroCircle, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)' }]}
          >
            <ArrowLeft size={18} color={colors.foreground} />
          </PressableOpacity>
        </View>
        <View style={s.emptyContainer}>
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
  let actionOnPress: (() => void) | null = null
  let actionDisabled = false

  if (isPast || isCreator) {
    // Past events and creators see no action button
  } else if (myStatus === 'joined' || myStatus === 'approved') {
    actionLabel = t('events.leaveEvent')
    actionOnPress = handleLeave
  } else if (myStatus === 'pending') {
    actionLabel = t('events.pendingApproval')
    actionDisabled = true
  } else if (isFull) {
    actionLabel = t('events.isFull')
    actionDisabled = true
  } else if (event.approval_required) {
    actionLabel = t('events.requestSpot')
    actionOnPress = handleJoin
  } else {
    actionLabel = t('events.joinEvent')
    actionOnPress = handleJoin
  }
  const isLeaveBtn = myStatus === 'joined' || myStatus === 'approved'

  return (
    <FadeIn style={{ flex: 1 }}>
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Hero nav overlay — circle buttons on top of photo */}
      <View style={[s.heroNav, { top: insets.top + 12 }]} pointerEvents="box-none">
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[s.heroCircle, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)', borderColor: colors.border }]}
        >
          <ArrowLeft size={18} color={colors.foreground} />
        </PressableOpacity>
        <View style={s.heroRightGroup}>
          <PressableOpacity
            onPress={handleShare}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.share')}
            style={[s.heroCircle, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)', borderColor: colors.border }]}
          >
            <Share2 size={16} color={colors.foreground} />
          </PressableOpacity>
          <PressableOpacity
            onPress={() => setReportModalVisible(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Report"
            style={[s.heroCircle, { backgroundColor: isDark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)', borderColor: colors.border }]}
          >
            <Flag size={16} color={colors.foreground} />
          </PressableOpacity>
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Full-bleed hero image */}
        {event.image_url ? (
          <Image
            source={{ uri: event.image_url }}
            style={s.heroImage}
            contentFit="cover"
            accessibilityLabel={event.title}
          />
        ) : (
          <View style={[s.heroImage, { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
            <CalendarDays size={56} color={colors.tertiaryForeground} strokeWidth={1.2} />
          </View>
        )}

        {/* Body card — overlaps bottom of hero per mockup 02 */}
        <View style={[s.bodyCard, { backgroundColor: colors.background }]}>

          {/* Category badge */}
          <View style={s.categoryRow}>
            <View style={[s.categoryDot, { backgroundColor: catColor }]} />
            <Text style={[s.categoryLabel, { color: colors.mutedForeground }]}>{catLabel}</Text>
          </View>

          {/* Title */}
          <Text style={[s.title, { color: colors.foreground }]} numberOfLines={3} accessibilityRole="header">{event.title}</Text>

          {/* Past event banner */}
          {isPast && (
            <View style={[s.endedBanner, { backgroundColor: `${colors.destructive}15` }]}>
              <XCircle size={16} color={colors.destructive} />
              <Text style={[s.endedBannerText, { color: colors.destructive }]}>{t('events.eventEnded')}</Text>
            </View>
          )}

          {/* Date + time row */}
          <View style={s.infoRow}>
            <CalendarDays size={16} color={colors.mutedForeground} strokeWidth={1.8} />
            <Text style={[s.infoText, { color: colors.mutedForeground }]}>
              {formatEventDate(event.event_date, locale)}
            </Text>
          </View>
          <View style={s.infoRow}>
            <Clock size={16} color={colors.mutedForeground} strokeWidth={1.8} />
            <Text style={[s.infoText, { color: colors.mutedForeground }]}>{timeStr}</Text>
          </View>

          {/* Location */}
          {event.location_name && (
            <View style={s.infoRow}>
              <MapPin size={16} color={colors.mutedForeground} strokeWidth={1.8} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]} numberOfLines={2}>{event.location_name}</Text>
            </View>
          )}

          {/* Description */}
          {event.description && (
            <View style={s.descriptionSection}>
              <Text style={[s.descriptionText, { color: colors.foreground }]}>{event.description}</Text>
            </View>
          )}

          {/* Organizer card */}
          {event.creator && (
            <PressableOpacity
              onPress={() => router.push(`/profile/${event.creator!.id}` as any)}
              accessibilityRole="button"
              accessibilityLabel={`${event.creator.name}, ${t('events.organizer')}`}
              style={[s.organizerCard, { borderColor: colors.border }]}
            >
              <Avatar url={event.creator.avatar_url} name={event.creator.name} size={40} />
              <View style={s.organizerInfo}>
                <Text style={[s.organizerName, { color: colors.foreground }]} numberOfLines={1}>{event.creator.name}</Text>
                <Text style={[s.organizerRole, { color: colors.mutedForeground }]}>{t('events.organizer')}</Text>
              </View>
            </PressableOpacity>
          )}

          {/* Attendees section — horizontal avatar stack */}
          <View style={[s.attendeesSection, { borderTopColor: colors.border }]}>
            <View style={s.attendeesHeader}>
              <Users size={16} color={colors.mutedForeground} strokeWidth={1.8} />
              <Text style={[s.attendeesText, { color: colors.foreground }]}>{participantsText}</Text>
            </View>

            {displayParticipants.length > 0 && (
              <View style={s.avatarStack}>
                {displayParticipants.map((p, i) => (
                  <View key={p.id} style={[s.avatarItem, i > 0 && { marginLeft: -10 }]}>
                    <Avatar
                      url={p.user?.avatar_url}
                      name={p.user?.name}
                      size={34}
                      borderColor={colors.background}
                      borderWidth={2}
                    />
                  </View>
                ))}
                {participantCount > 5 && (
                  <View style={[s.moreAvatars, { backgroundColor: colors.muted, marginLeft: -10 }]}>
                    <Text style={[s.moreAvatarsText, { color: colors.mutedForeground }]}>
                      +{participantCount - 5}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Group Chat button — show for participants and creator */}
          {event.conversation_id && (myStatus === 'joined' || myStatus === 'approved' || isCreator) && (
            <PressableOpacity
              onPress={() => router.push(`/event-chat/${event.conversation_id}` as any)}
              accessibilityRole="button"
              accessibilityLabel={t('events.groupChat')}
              style={[s.outlineBtn, { borderColor: colors.border }]}
            >
              <MessageCircle size={16} color={colors.foreground} strokeWidth={1.8} />
              <Text style={[s.outlineBtnText, { color: colors.foreground }]}>
                {t('events.openChat')}
              </Text>
            </PressableOpacity>
          )}

          {/* Message organizer */}
          {event.creator && !isCreator && (
            <PressableOpacity
              onPress={handleMessageCreator}
              accessibilityRole="button"
              accessibilityLabel={t('events.messageOrganizer')}
              style={[s.outlineBtn, { borderColor: colors.border }]}
            >
              <MessageCircle size={16} color={colors.foreground} strokeWidth={1.8} />
              <Text style={[s.outlineBtnText, { color: colors.foreground }]}>
                {t('events.messageOrganizer')}
              </Text>
            </PressableOpacity>
          )}

          {/* Creator actions — hide for past events */}
          {isCreator && !isPast && (
            <View style={s.creatorActions}>
              <PressableOpacity
                onPress={() => router.push(`/create-event?edit=${event.id}` as any)}
                accessibilityRole="button"
                accessibilityLabel={t('events.editEventAction')}
                style={[s.creatorActionBtn, { borderColor: colors.border }]}
              >
                <Text style={[s.creatorActionText, { color: colors.foreground }]}>{t('events.editEventAction')}</Text>
              </PressableOpacity>
              <PressableOpacity
                onPress={handleCancelEvent}
                accessibilityRole="button"
                accessibilityLabel={t('events.cancelEvent')}
                style={s.creatorActionCancel}
              >
                <Text style={[s.creatorActionText, { color: colors.destructive }]}>{t('events.cancelEvent')}</Text>
              </PressableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky bottom CTA */}
      {!isCreator && actionLabel !== '' && (
        <View style={[s.stickyBar, { paddingBottom: insets.bottom + 12, backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <Pressable
            onPress={actionOnPress ?? undefined}
            disabled={actionDisabled}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={({ pressed }) => [
              s.ctaButton,
              isLeaveBtn
                ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }
                : { backgroundColor: actionDisabled ? colors.muted : colors.foreground },
              { opacity: actionDisabled ? 0.6 : pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[s.ctaButtonText, {
              color: isLeaveBtn ? colors.mutedForeground : actionDisabled ? colors.mutedForeground : colors.primaryForeground,
            }]}>
              {actionLabel}
            </Text>
          </Pressable>
          {event.max_participants != null && !isFull && !isLeaveBtn && myStatus !== 'pending' && (
            <Text style={[s.spotsHint, { color: (event.max_participants - participantCount) <= 3 ? colors.destructive : colors.mutedForeground }]}>
              {t('events.spotsRemaining', { remaining: event.max_participants - participantCount, max: event.max_participants })}
            </Text>
          )}
        </View>
      )}

      {/* Report Modal */}
      <ReportModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        targetId={event.id}
        type="event"
      />
    </View>
    </FadeIn>
  )
}

// ── Styles ──
const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 0 },

  // Loading / empty states
  skeletonHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
  },

  // Hero nav overlay — absolute circles on top of photo
  heroNav: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  heroRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Full-bleed hero image — 260px height
  heroImage: {
    width: '100%',
    height: 260,
  },

  // Body card — overlaps bottom of photo per mockup 02
  bodyCard: {
    marginTop: -22,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 32,
    position: 'relative',
    zIndex: 2,
    gap: 14,
  },

  // Category — dot + uppercase label
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  categoryLabel: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    lineHeight: 14,
  },

  // Title
  title: {
    fontSize: 24,
    fontFamily: fonts.heading,
    letterSpacing: -0.4,
    lineHeight: 30,
  },

  // Ended banner
  endedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  endedBannerText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },

  // Info rows — date, time, location
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -4,
  },
  infoText: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
  },

  // Description
  descriptionSection: {
    marginTop: 2,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: fonts.body,
    maxWidth: 560,
  },

  // Organizer card — avatar + name + role
  organizerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  organizerInfo: {
    flex: 1,
    gap: 2,
  },
  organizerName: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    lineHeight: 20,
  },
  organizerRole: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },

  // Attendees section — horizontal avatar stack
  attendeesSection: {
    gap: 12,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attendeesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  attendeesText: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarItem: {
    zIndex: 1,
  },
  moreAvatars: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreAvatarsText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // Outline button — group chat, message organizer
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 48,
  },
  outlineBtnText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },

  // Creator actions
  creatorActions: {
    flexDirection: 'row',
    gap: 12,
  },
  creatorActionBtn: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  creatorActionCancel: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  creatorActionText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },

  // Sticky bottom CTA bar
  stickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  ctaButton: {
    borderRadius: 999,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonText: {
    fontSize: 16,
    fontFamily: fonts.bodySemi,
    lineHeight: 24,
  },
  spotsHint: {
    fontSize: 12,
    fontFamily: fonts.body,
    textAlign: 'center',
    marginTop: 6,
  },
})

export default function EventDetailScreen() {
  return (
    <ScreenErrorBoundary screenName="EventDetail">
      <EventDetailScreenInner />
    </ScreenErrorBoundary>
  )
}
