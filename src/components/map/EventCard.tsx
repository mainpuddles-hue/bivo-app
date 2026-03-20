import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { MapPin } from 'lucide-react-native'
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
    <Pressable
      style={({ pressed }) => [styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
      onPress={() => onPress(item)}
    >
      {/* Full-width image with date overlay */}
      {imageUrl ? (
        <View style={styles.eventImageWrapper}>
          <Image source={{ uri: imageUrl }} style={styles.eventImage} contentFit="cover" />
          {dateStr && (
            <View style={styles.eventDateOverlay}>
              <Text style={styles.eventDateOverlayText}>{dateStr}</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.eventImagePlaceholder, { backgroundColor: `${item.color}12` }]}>
          <MapPin size={24} color={item.color} />
          {dateStr && (
            <View style={styles.eventDateOverlay}>
              <Text style={styles.eventDateOverlayText}>{dateStr}</Text>
            </View>
          )}
        </View>
      )}

      {/* Title + subtitle + badges */}
      <View style={styles.eventContent}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
        {item.subtitle ? (
          <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>{item.subtitle}</Text>
        ) : null}
        <View style={styles.cardBadgeRow}>
          {isLinkedEvents && (
            <View style={[styles.badge, { backgroundColor: '#8E44AD18' }]}>
              <Text style={[styles.badgeText, { color: '#8E44AD' }]}>Helsinki</Text>
            </View>
          )}
          {isTicketmaster && (
            <View style={[styles.badge, { backgroundColor: '#E91E6318' }]}>
              <Text style={[styles.badgeText, { color: '#E91E63' }]}>{t('map.ticketEvent')}</Text>
            </View>
          )}
          {isCommunityEvent && (
            <View style={[styles.badge, { backgroundColor: '#2B8A6218' }]}>
              <Text style={[styles.badgeText, { color: '#2B8A62' }]}>{t('map.communityEvent')}</Text>
            </View>
          )}
          {isFree && (
            <View style={[styles.badge, { backgroundColor: '#2B8A6218' }]}>
              <Text style={[styles.badgeText, { color: '#2B8A62' }]}>{t('events.free')}</Text>
            </View>
          )}
          {price && !isFree && (
            <View style={[styles.badge, { backgroundColor: '#E8A05018' }]}>
              <Text style={[styles.badgeText, { color: '#E8A050' }]}>{price}</Text>
            </View>
          )}
          <Text style={[styles.distance, { color: colors.mutedForeground }]}>
            {formatDistance(item.distance)}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  eventCard: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  eventImageWrapper: {
    width: '100%',
    height: 140,
    position: 'relative',
  },
  eventImage: {
    width: '100%',
    height: 140,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  eventImagePlaceholder: {
    width: '100%',
    height: 140,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  eventDateOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  eventDateOverlayText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  eventContent: {
    padding: 10,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  meta: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  distance: {
    fontSize: 11,
  },
})
