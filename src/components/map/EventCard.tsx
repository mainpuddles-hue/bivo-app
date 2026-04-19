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
  const dateStr = item.sortDate
    ? new Date(item.sortDate).toLocaleDateString(
        locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB',
        { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
      )
    : null

  return (
    <PressableOpacity
      style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={[item.title, dateStr].filter(Boolean).join(', ')}
    >
      {/* Image left (borderRadius 10) */}
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.eventImage} contentFit="cover" />
      ) : (
        <View style={[styles.eventImagePlaceholder, { backgroundColor: colors.muted }]}>
          <Calendar size={20} color={colors.mutedForeground} />
        </View>
      )}

      {/* Details right */}
      <View style={styles.eventContent}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>

        {/* Date */}
        {dateStr && (
          <Text style={[styles.dateText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {dateStr}
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
    </PressableOpacity>
  )
}

const styles = StyleSheet.create({
  eventCard: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    padding: 10,
    gap: 12,
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  eventImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  eventImagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    lineHeight: 14,
  },
  meta: {
    fontSize: 11,
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
    fontSize: 10,
    fontFamily: fonts.bodyMedium,
    lineHeight: 14,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  distance: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 14,
  },
})
