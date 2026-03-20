import { View, Text, Pressable, Modal, StyleSheet, Linking, Platform, Share } from 'react-native'
import { Image } from 'expo-image'
import { MapPin, Navigation, X, ExternalLink } from 'lucide-react-native'
import { fonts } from '@/lib/fonts'
import type { Router } from 'expo-router'
import type { Post, Event, CityEvent, LocalPlace } from '@/lib/types'
import type { ListItem, ThemeColors } from './types'
import { formatDistance } from './constants'

interface DetailModalProps {
  item: ListItem | null
  colors: ThemeColors
  locale: string
  t: (key: string) => string
  router: Router
  onClose: () => void
}

export function DetailModal({ item, colors, locale, t, router, onClose }: DetailModalProps) {
  if (!item) return null

  const imgUrl = item.kind === 'city_event'
    ? (item.sourceData as CityEvent).image_url
    : item.kind === 'place'
    ? (item.sourceData as LocalPlace).image_url
    : item.kind === 'post'
    ? (item.sourceData as Post).image_url
    : null

  const locName = item.kind === 'city_event'
    ? (item.sourceData as CityEvent).location_name
    : item.kind === 'community_event'
    ? (item.sourceData as Event).location_name
    : item.kind === 'place'
    ? (item.sourceData as LocalPlace).address
    : null

  let desc: string | null = null
  if (item.kind === 'city_event') {
    const ce = item.sourceData as CityEvent
    desc = locale === 'sv' ? (ce.description_sv ?? ce.description_fi)
      : locale === 'en' ? (ce.description_en ?? ce.description_fi)
      : ce.description_fi
  } else if (item.kind === 'community_event') {
    desc = (item.sourceData as Event).description
  } else if (item.kind === 'place') {
    desc = (item.sourceData as LocalPlace).description
  } else if (item.kind === 'post') {
    desc = (item.sourceData as Post).description
  }

  const openDirections = () => {
    const lat = item.latitude
    const lng = item.longitude
    const url = Platform.OS === 'ios'
      ? `maps:0,0?q=${lat},${lng}`
      : Platform.OS === 'android'
      ? `geo:${lat},${lng}?q=${lat},${lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`).catch(() => {})
    })
  }

  const handleShare = () => {
    const shareUrl = item.kind === 'city_event'
      ? (item.sourceData as CityEvent).info_url
      : item.kind === 'place' && (item.sourceData as LocalPlace).website
      ? (item.sourceData as LocalPlace).website
      : `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`
    Share.share({ message: `${item.title}\n${shareUrl ?? ''}`.trim() }).catch(() => {})
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.detailModal, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
          <View style={[styles.detailColorBar, { backgroundColor: item.color }]} />
          <Text style={[styles.detailHeaderTitle, { color: colors.foreground }]} numberOfLines={1}>
            {item.kind === 'city_event' ? t('feedContent.cityEventLabel')
              : item.kind === 'community_event' ? t('map.event')
              : item.kind === 'post' ? t('map.layerPosts')
              : t('places.title')}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <X size={22} color={colors.foreground} />
          </Pressable>
        </View>

        {/* Image */}
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={styles.detailImage} contentFit="cover" />
        ) : null}

        {/* Content */}
        <View style={styles.detailBody}>
          <Text style={[styles.detailTitle, { color: colors.foreground }]}>{item.title}</Text>

          {/* Date & time */}
          {item.sortDate && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                {new Date(item.sortDate).toLocaleDateString(
                  locale === 'sv' ? 'sv-SE' : locale === 'en' ? 'en-GB' : 'fi-FI', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
          )}

          {/* Location */}
          {locName ? (
            <View style={styles.detailRow}>
              <MapPin size={14} color={colors.primary} />
              <Text style={[styles.detailLabel, { color: colors.foreground }]}>{locName}</Text>
            </View>
          ) : null}

          {/* Distance */}
          <View style={styles.detailRow}>
            <Navigation size={14} color={colors.mutedForeground} />
            <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{formatDistance(item.distance)}</Text>
          </View>

          {/* Price (city events) */}
          {item.kind === 'city_event' && (() => {
            const ce = item.sourceData as CityEvent
            return (
              <View style={[styles.detailBadge, { backgroundColor: ce.is_free ? '#2B8A6220' : '#E8A05020' }]}>
                <Text style={{ fontSize: 13, fontFamily: fonts.bodyMedium, color: ce.is_free ? '#2B8A62' : '#E8A050' }}>
                  {ce.is_free ? t('events.free') : ce.price_info ?? t('events.paid')}
                </Text>
              </View>
            )
          })()}

          {/* Description */}
          {desc ? (
            <Text style={[styles.detailDesc, { color: colors.mutedForeground }]}>{desc}</Text>
          ) : null}

          {/* Place extra info */}
          {item.kind === 'place' && (() => {
            const pl = item.sourceData as LocalPlace
            return (
              <View style={{ gap: 6, marginTop: 8 }}>
                {pl.opening_hours && (
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{t('places.openingHours')}: {pl.opening_hours}</Text>
                )}
                {pl.phone && (
                  <Pressable onPress={() => Linking.openURL(`tel:${pl.phone}`).catch(() => {})}>
                    <Text style={[styles.detailLabel, { color: colors.primary }]}>{pl.phone}</Text>
                  </Pressable>
                )}
              </View>
            )
          })()}

          {/* Organizer (city events) */}
          {item.kind === 'city_event' && (item.sourceData as CityEvent).organizer && (
            <Text style={[styles.detailLabel, { color: colors.mutedForeground, marginTop: 8 }]}>
              {t('events.creator')}: {(item.sourceData as CityEvent).organizer}
            </Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.detailActions}>
          {item.kind === 'post' && (
            <Pressable
              onPress={() => {
                const post = item.sourceData as Post
                onClose()
                router.push(`/post/${post.id}`)
              }}
              style={[styles.detailActionBtn, { backgroundColor: item.color }]}
            >
              <ExternalLink size={16} color="#FFF" />
              <Text style={styles.detailActionText}>{t('map.viewPost')}</Text>
            </Pressable>
          )}
          {item.kind === 'city_event' && (item.sourceData as CityEvent).info_url && (
            <Pressable
              onPress={() => Linking.openURL((item.sourceData as CityEvent).info_url!).catch(() => {})}
              style={[styles.detailActionBtn, { backgroundColor: item.color }]}
            >
              <ExternalLink size={16} color="#FFF" />
              <Text style={styles.detailActionText}>{t('map.moreInfo')}</Text>
            </Pressable>
          )}
          {item.kind === 'place' && (item.sourceData as LocalPlace).website && (
            <Pressable
              onPress={() => Linking.openURL((item.sourceData as LocalPlace).website!).catch(() => {})}
              style={[styles.detailActionBtn, { backgroundColor: item.color }]}
            >
              <ExternalLink size={16} color="#FFF" />
              <Text style={styles.detailActionText}>{t('map.website')}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={openDirections}
            style={[styles.detailActionBtn, { backgroundColor: colors.muted }]}
          >
            <Navigation size={16} color={colors.foreground} />
            <Text style={[styles.detailActionText, { color: colors.foreground }]}>{t('map.directions')}</Text>
          </Pressable>
          <Pressable
            onPress={handleShare}
            style={[styles.detailActionBtn, { backgroundColor: colors.muted, flex: 0, paddingHorizontal: 14 }]}
          >
            <ExternalLink size={16} color={colors.foreground} />
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  detailModal: {
    flex: 1,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailColorBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    marginRight: 10,
  },
  detailHeaderTitle: {
    flex: 1,
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
  },
  detailImage: {
    width: '100%',
    height: 200,
  },
  detailBody: {
    padding: 16,
    gap: 10,
  },
  detailTitle: {
    fontSize: 20,
    fontFamily: fonts.heading,
    lineHeight: 26,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 20,
  },
  detailBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  detailDesc: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 21,
    marginTop: 4,
  },
  detailActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    marginTop: 'auto' as any,
  },
  detailActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  detailActionText: {
    fontSize: 15,
    fontFamily: fonts.bodySemi,
    color: '#FFF',
  },
})
