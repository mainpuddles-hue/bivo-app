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
import { isTableEvent, getTableCategoryIcon } from '@/lib/eventHelpers'
import { EVENT_CATEGORY_COLORS } from '@/lib/constants'
import type { CommunityEvent } from '@/lib/types'

interface EventCardProps {
  event: CommunityEvent
  compact?: boolean
}

export const EventCard = memo(function EventCard({ event, compact }: EventCardProps) {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()
  const categoryColor = EVENT_CATEGORY_COLORS[event.category] ?? colors.mutedForeground
  const isTable = isTableEvent(event)
  const TableCategoryIcon = isTable ? getTableCategoryIcon(event.category) : null

  const formattedDate = useMemo(() => {
    if (!event.event_date) return ''
    const d = new Date(event.event_date)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString(
      locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-US',
      { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
    )
  }, [event.event_date, locale])

  const participantCount = event.participant_count ?? 0
  const spotsText = event.max_participants
    ? `${participantCount}/${event.max_participants}`
    : `${participantCount}`

  // Composite accessibility label — reads full card as one VoiceOver unit
  const categoryLabel = t(`events.cat${event.category.charAt(0).toUpperCase() + event.category.slice(1)}`)
  const a11yLabel = useMemo(() => {
    const parts: string[] = []
    if (categoryLabel) parts.push(categoryLabel)
    parts.push(event.title)
    parts.push(formattedDate)
    if (event.location_name) parts.push(event.location_name)
    parts.push(`${spotsText} ${t('events.participants') ?? 'participants'}`)
    return parts.filter(Boolean).join(', ')
  }, [categoryLabel, event.title, event.location_name, formattedDate, spotsText, t])

  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}` as any)}
      style={({ pressed }) => [
        s.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      {/* Image or Emoji Header */}
      {event.image_url && !isTable ? (
        <Image source={{ uri: getImageUrl(event.image_url, 'medium')! }} style={s.image} contentFit="cover" accessible={false} cachePolicy="memory-disk" recyclingKey={event.id} />
      ) : isTable && TableCategoryIcon ? (
        <View style={[s.iconBox, { backgroundColor: `${categoryColor}15` }]}>
          <TableCategoryIcon size={36} color={categoryColor} />
        </View>
      ) : null}

      <View style={s.content}>
        {/* Category badge */}
        <View style={s.topRow}>
          <View style={[s.categoryBadge, { backgroundColor: `${categoryColor}18` }]}>
            <View style={[s.categoryDot, { backgroundColor: categoryColor }]} />
            <Text style={[s.categoryText, { color: categoryColor }]}>
              {t(`events.cat${event.category.charAt(0).toUpperCase() + event.category.slice(1)}`)}
            </Text>
          </View>
          {isTable && (
            <View style={[s.tableBadge, { backgroundColor: `${colors.success}15` }]}>
              <Text style={[s.tableText, { color: colors.success }]}>
                {t('tables.title')}
              </Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={[s.title, { color: colors.foreground }]} numberOfLines={2}>
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
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  image: {
    width: '100%',
    height: 140,
  },
  iconBox: {
    width: '100%',
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 16, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  categoryDot: { width: 6, height: 6, borderRadius: 3 },
  categoryText: { fontSize: 11, fontFamily: fonts.bodySemi, lineHeight: 14 },
  tableBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tableText: { fontSize: 11, fontFamily: fonts.bodySemi, lineHeight: 14 },
  title: { fontSize: 16, fontFamily: fonts.headingSemi, lineHeight: 22 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 13, lineHeight: 18 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  participantCount: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  creatorText: { fontSize: 12, lineHeight: 16, maxWidth: 120 },
})
