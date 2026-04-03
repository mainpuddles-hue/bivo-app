import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { MapPin } from 'lucide-react-native'
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
    <Pressable
      style={({ pressed }) => [styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      {/* Full-width image with date overlay */}
      {imageUrl ? (
        <View style={styles.eventImageWrapper}>
          <Image source={{ uri: imageUrl }} style={styles.eventImage} contentFit="cover" />
          {dateStr && (
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.eventImageGradient}
            >
              <Text style={styles.eventDateOverlayText}>{dateStr}</Text>
            </LinearGradient>
          )}
        </View>
      ) : (
        <View style={[styles.eventImagePlaceholder, { backgroundColor: `${item.color}12` }]}>
          <MapPin size={24} color={item.color} />
          {dateStr && (
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.eventImageGradient}
            >
              <Text style={styles.eventDateOverlayText}>{dateStr}</Text>
            </LinearGradient>
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
    marginVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  eventImageWrapper: {
    width: '100%',
    height: 140,
    position: 'relative',
  },
  eventImage: {
    width: '100%',
    height: 140,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  eventImagePlaceholder: {
    width: '100%',
    height: 140,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  eventImageGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    paddingTop: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  eventDateOverlayText: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    lineHeight: 16,
  },
  eventContent: {
    padding: 14,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.16,
    lineHeight: 20,
  },
  meta: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
    flex: 1,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    lineHeight: 14,
  },
  distance: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
})
