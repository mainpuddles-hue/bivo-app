import { memo, useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { MapPin, Users, Clock } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { ImageWithFallback } from './ImageWithFallback'
import { ParticipantAvatarRow } from './ParticipantAvatarRow'
import { isTableEvent, getTableCategoryIcon } from '@/lib/eventHelpers'
import { EVENT_CATEGORY_COLORS } from '@/lib/constants'
import type { CommunityEvent } from '@/lib/types'

interface EventCardProps {
  event: CommunityEvent
  compact?: boolean
}

export const EventCard = memo(function EventCard({ event, compact }: EventCardProps) {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const router = useRouter()
  const categoryColor = EVENT_CATEGORY_COLORS[event.category] ?? colors.mutedForeground
  const isTable = isTableEvent(event)
  const TableCategoryIcon = isTable ? getTableCategoryIcon(event.category) : null

  const dateParts = useMemo(() => {
    if (!event.event_date) return null
    const d = new Date(event.event_date)
    if (isNaN(d.getTime())) return null
    const loc = locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-US'
    return {
      day: d.getDate().toString(),
      monthShort: d.toLocaleDateString(loc, { month: 'short' }).replace('.', ''),
      weekday: d.toLocaleDateString(loc, { weekday: 'short' }).replace('.', ''),
      time: d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }),
    }
  }, [event.event_date, locale])

  const formattedDate = useMemo(() => {
    if (!dateParts) return ''
    return `${dateParts.weekday} ${dateParts.day}. ${dateParts.monthShort} ${dateParts.time}`
  }, [dateParts])

  const participantCount = event.participant_count ?? 0
  const spotsText = event.max_participants
    ? `${participantCount}/${event.max_participants}`
    : `${participantCount}`

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
      <View style={s.body}>
        {/* Date block — primary visual anchor */}
        {dateParts && (
          <View style={[s.dateBlock, { backgroundColor: `${categoryColor}${isDark ? '28' : '14'}` }]}>
            <Text style={[s.dateDay, { color: categoryColor }]}>{dateParts.day}</Text>
            <Text style={[s.dateMonth, { color: categoryColor }]}>
              {dateParts.monthShort.toUpperCase()}
            </Text>
            <Text style={[s.dateWeekday, { color: `${categoryColor}B0` }]}>
              {dateParts.weekday}
            </Text>
          </View>
        )}

        {/* Right: details column */}
        <View style={s.details}>
          {/* Category + table badges */}
          <View style={s.badgeRow}>
            <View style={[s.categoryBadge, { backgroundColor: `${categoryColor}18` }]}>
              <View style={[s.categoryDot, { backgroundColor: categoryColor }]} />
              <Text style={[s.categoryText, { color: categoryColor }]}>
                {categoryLabel}
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

          {/* Time row */}
          {dateParts && (
            <View style={s.metaRow}>
              <Clock size={16} color={colors.mutedForeground} />
              <Text style={[s.metaText, { color: colors.mutedForeground }]}>
                {dateParts.weekday} {dateParts.time}
              </Text>
            </View>
          )}

          {/* Location row */}
          {event.location_name && (
            <View style={s.metaRow}>
              <MapPin size={16} color={colors.mutedForeground} />
              <Text style={[s.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {event.location_name}
              </Text>
            </View>
          )}

          {/* Bottom: participants + image thumb */}
          <View style={s.bottomRow}>
            {event.participants && event.participants.length > 0 ? (
              <ParticipantAvatarRow
                participants={event.participants.map(p => ({ avatar_url: p.user?.avatar_url, name: p.user?.name }))}
                totalCount={participantCount}
                max={4}
                size={22}
              />
            ) : (
              <View style={s.participantCount}>
                <Users size={16} color={colors.mutedForeground} />
                <Text style={[s.participantText, { color: colors.mutedForeground }]}>
                  {spotsText}
                </Text>
              </View>
            )}

            {/* Image thumbnail (small, on the right) */}
            {event.image_url && !isTable ? (
              <ImageWithFallback
                uri={event.image_url}
                imageSize="thumbnail"
                style={s.thumb}
                contentFit="cover"
                accessible={false}
              />
            ) : isTable && TableCategoryIcon ? (
              <View style={[s.thumbIcon, { backgroundColor: `${categoryColor}15` }]}>
                <TableCategoryIcon size={18} color={categoryColor} />
              </View>
            ) : null}
          </View>

          {/* Creator name */}
          {event.creator && !compact && (
            <Text style={[s.creatorText, { color: colors.mutedForeground }]} numberOfLines={1}>
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
  body: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    alignItems: 'flex-start',
  },
  /* ---- Date block (left) ---- */
  dateBlock: {
    width: 60,
    minHeight: 68,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  dateDay: {
    fontSize: 26,
    fontFamily: fonts.heading,
    lineHeight: 30,
  },
  dateMonth: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
    letterSpacing: 0.6,
    marginTop: 2,
  },
  dateWeekday: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    lineHeight: 16,
    marginTop: 2,
  },
  /* ---- Details (right) ---- */
  details: {
    flex: 1,
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  categoryDot: { width: 6, height: 6, borderRadius: 3 },
  categoryText: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 16, flexShrink: 1 },
  tableBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tableText: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 16 },
  title: {
    fontSize: 15,
    fontFamily: fonts.headingSemi,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    lineHeight: 16,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  participantCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  participantText: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    lineHeight: 16,
  },
  /* ---- Image thumbnail ---- */
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  thumbIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorText: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
})
