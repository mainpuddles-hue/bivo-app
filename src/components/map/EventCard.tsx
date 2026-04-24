import { View, Text, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { PressableOpacity } from '@/components/ui'
import { Calendar, MapPin } from 'lucide-react-native'
import { fonts } from '@/lib/fonts'
import type { CityEvent } from '@/lib/types'
import type { ListItem, ThemeColors } from './types'
import { formatDistance } from './constants'

interface EventCardProps {
  item: ListItem
  colors: ThemeColors
  locale: string
  t: (key: string) => string
  onPress: (item: ListItem) => void
}

export function EventCard({ item, colors, locale, t, onPress }: EventCardProps) {
  const isCityEvent = item.kind === 'city_event'
  const isCommunityEvent = item.kind === 'community_event'

  const imageUrl = isCityEvent
    ? (item.sourceData as CityEvent).image_url
    : null
  const isFree = isCityEvent && (item.sourceData as CityEvent).is_free
  const price = isCityEvent ? (item.sourceData as CityEvent).price_info : null
  const isTicketmaster = isCityEvent && (item.sourceData as CityEvent).source === 'ticketmaster'
  const isLinkedEvents = isCityEvent && (item.sourceData as CityEvent).source === 'linkedevents'

  // Parse date parts for the date block
  const dateParts = (() => {
    if (!item.sortDate) return null
    const d = new Date(item.sortDate)
    if (isNaN(d.getTime())) return null
    const loc = locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB'
    return {
      day: d.getDate().toString(),
      monthShort: d.toLocaleDateString(loc, { month: 'short' }).replace('.', ''),
      time: d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }),
    }
  })()

  return (
    <PressableOpacity
      style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={[item.title, dateParts ? `${dateParts.day} ${dateParts.monthShort}` : null].filter(Boolean).join(', ')}
    >
      {/* Date block — compact, left side */}
      {dateParts ? (
        <View style={[styles.dateBlock, { backgroundColor: `${colors.primary}14` }]}>
          <Text style={[styles.dateDay, { color: colors.primary }]}>{dateParts.day}</Text>
          <Text style={[styles.dateMonth, { color: colors.primary }]}>
            {dateParts.monthShort.toUpperCase()}
          </Text>
        </View>
      ) : imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.eventImage} contentFit="cover" accessible={false} />
      ) : (
        <View style={[styles.datePlaceholder, { backgroundColor: colors.muted }]}>
          <Calendar size={18} color={colors.mutedForeground} />
        </View>
      )}

      {/* Details right */}
      <View style={styles.eventContent}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>

        {/* Time */}
        {dateParts && (
          <Text style={[styles.dateText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {dateParts.time}
          </Text>
        )}

        {/* Location / subtitle */}
        {item.subtitle ? (
          <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>{item.subtitle}</Text>
        ) : null}

        {/* Badges row */}
        <View style={styles.badgeRow}>
          {isLinkedEvents && (
            <View style={[styles.badge, { backgroundColor: colors.muted }]}>
              <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>Helsinki</Text>
            </View>
          )}
          {isTicketmaster && (
            <View style={[styles.badge, { backgroundColor: colors.muted }]}>
              <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>{t('map.ticketEvent')}</Text>
            </View>
          )}
          {isCommunityEvent && (
            <View style={[styles.badge, { backgroundColor: colors.muted }]}>
              <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>{t('map.communityEvent')}</Text>
            </View>
          )}
          {isFree && (
            <View style={[styles.badge, { backgroundColor: '#2B8A6212' }]}>
              <Text style={[styles.badgeText, { color: '#2B8A62' }]}>{t('events.free')}</Text>
            </View>
          )}
          {price && !isFree && (
            <View style={[styles.badge, { backgroundColor: colors.muted }]}>
              <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>{price}</Text>
            </View>
          )}
          <Text style={[styles.distance, { color: colors.mutedForeground }]}>
            {formatDistance(item.distance)}
          </Text>
        </View>
      </View>

      {/* Image thumbnail on the right when date block is shown */}
      {dateParts && imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.thumbImage} contentFit="cover" accessible={false} />
      ) : null}
    </PressableOpacity>
  )
}

const styles = StyleSheet.create({
  eventCard: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    padding: 10,
    gap: 12,
    alignItems: 'center',
  },
  /* Date block — compact square */
  dateBlock: {
    width: 48,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  dateDay: {
    fontSize: 20,
    fontFamily: fonts.heading,
    lineHeight: 24,
  },
  dateMonth: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
    letterSpacing: 0.4,
  },
  datePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  thumbImage: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  eventContent: {
    flex: 1,
    gap: 3,
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.14,
    lineHeight: 18,
  },
  dateText: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    lineHeight: 14,
  },
  meta: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    lineHeight: 16,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  distance: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 14,
  },
})
