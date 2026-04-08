import { memo, useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { CalendarDays, MapPin, Users } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { getImageUrl } from '@/lib/imageUtils'
import { ParticipantAvatarRow } from './ParticipantAvatarRow'
import { isTableEvent, getTableCategoryEmoji } from '@/lib/eventHelpers'
import type { CommunityEvent } from '@/lib/types'

const EVENT_CATEGORY_COLORS: Record<string, string> = {
  social: '#7C5CBF',
  sports: '#2B8A62',
  culture: '#3B7DD8',
  nature: '#4CAF6A',
  kids: '#E8A050',
  other: '#6B7280',
}

interface EventCardProps {
  event: CommunityEvent
  compact?: boolean
}

export const EventCard = memo(function EventCard({ event, compact }: EventCardProps) {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()
  const categoryColor = EVENT_CATEGORY_COLORS[event.category] ?? '#6B7280'
  const isTable = isTableEvent(event)

  const formattedDate = useMemo(() => new Date(event.event_date).toLocaleDateString(
    locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-US',
    { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  ), [event.event_date, locale])

  const participantCount = event.participant_count ?? 0
  const spotsText = event.max_participants
    ? `${participantCount}/${event.max_participants}`
    : `${participantCount}`

  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}` as any)}
      style={({ pressed }) => [
        s.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={event.title}
    >
      {/* Image or Emoji Header */}
      {event.image_url && !isTable ? (
        <Image source={{ uri: getImageUrl(event.image_url, 'medium')! }} style={s.image} contentFit="cover" />
      ) : isTable ? (
        <View style={[s.emojiBox, { backgroundColor: `${categoryColor}15` }]}>
          <Text style={s.emoji}>{getTableCategoryEmoji(event.category)}</Text>
        </View>
      ) : null}

      <View style={s.content}>
        {/* Category badge */}
        <View style={s.topRow}>
          <View style={[s.categoryBadge, { backgroundColor: `${categoryColor}18` }]}>
            <View style={[s.categoryDot, { backgroundColor: categoryColor }]} />
            <Text style={[s.categoryText, { color: categoryColor, fontFamily: fonts.bodySemi }]}>
              {t(`events.cat${event.category.charAt(0).toUpperCase() + event.category.slice(1)}`)}
            </Text>
          </View>
          {isTable && (
            <View style={[s.tableBadge, { backgroundColor: `${colors.success}15` }]}>
              <Text style={[s.tableText, { color: colors.success, fontFamily: fonts.bodySemi }]}>
                {t('tables.title')}
              </Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={[s.title, { color: colors.foreground, fontFamily: fonts.headingSemi }]} numberOfLines={2}>
          {event.title}
        </Text>

        {/* Date */}
        <View style={s.infoRow}>
          <CalendarDays size={14} color={colors.mutedForeground} />
          <Text style={[s.infoText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
            {formattedDate}
          </Text>
        </View>

        {/* Location */}
        {event.location_name && (
          <View style={s.infoRow}>
            <MapPin size={14} color={colors.mutedForeground} />
            <Text style={[s.infoText, { color: colors.mutedForeground, fontFamily: fonts.body }]} numberOfLines={1}>
              {event.location_name}
            </Text>
          </View>
        )}

        {/* Bottom: Participants */}
        <View style={s.bottomRow}>
          {event.participants && event.participants.length > 0 ? (
            <ParticipantAvatarRow
              participants={event.participants.map(p => ({ avatar_url: p.user?.avatar_url, name: p.user?.name }))}
              totalCount={participantCount}
              max={4}
              size={24}
            />
          ) : (
            <View style={s.participantCount}>
              <Users size={14} color={colors.mutedForeground} />
              <Text style={[s.infoText, { color: colors.mutedForeground, fontFamily: fonts.bodyMedium }]}>
                {spotsText}
              </Text>
            </View>
          )}

          {event.creator && !compact && (
            <Text style={[s.creatorText, { color: colors.mutedForeground, fontFamily: fonts.body }]} numberOfLines={1}>
              {event.creator.name}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  )
})

const s = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 140,
  },
  emojiBox: {
    width: '100%',
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 36 },
  content: { padding: 16, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  categoryDot: { width: 6, height: 6, borderRadius: 3 },
  categoryText: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
  tableBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  tableText: { fontSize: 10, fontWeight: '600', lineHeight: 14 },
  title: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { fontSize: 13, lineHeight: 18 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  participantCount: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  creatorText: { fontSize: 12, lineHeight: 16, maxWidth: 120 },
})
