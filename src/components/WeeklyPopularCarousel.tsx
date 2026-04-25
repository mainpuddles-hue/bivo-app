/**
 * WeeklyPopularCarousel — "Viikon suosituimmat" horizontal hero carousel.
 *
 * Shows the week's most popular events (city + community) with large
 * image cards, gradient overlay, and pagination dots. Replaces the
 * DiscoveryStack hero in the feed.
 *
 * Data flow:
 *   cityEvents (Linked Events API) + communityEvents (Supabase)
 *   → filter (has image, within 7 days)
 *   → merge + sort (community high-participation first, then city)
 *   → max 8 cards
 *
 * Tap: community → router.push /event/{id}, city → Linking.openURL(info_url)
 */
import { memo, useMemo, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  Linking,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { Flame, MapPin, Calendar, Users } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { getImageUrl } from '@/lib/imageUtils'
import { PressableOpacity } from '@/components/ui'
import type { CityEvent, CommunityEvent } from '@/lib/types'

// ── Types ──

interface CarouselCardCity {
  source: 'city'
  id: string
  title: string
  imageUrl: string
  startTime: Date
  locationName: string | null
  isFree: boolean
  infoUrl: string | null
  participantCount: number
}

interface CarouselCardCommunity {
  source: 'community'
  id: string
  title: string
  imageUrl: string
  startTime: Date
  locationName: string | null
  isFree: boolean
  infoUrl: null
  participantCount: number
}

type CarouselCard = CarouselCardCity | CarouselCardCommunity

const MAX_CARDS = 8
const CARD_GAP = 12
const HORIZONTAL_PADDING = 20

// ── Props ──

interface WeeklyPopularCarouselProps {
  cityEvents: CityEvent[]
  communityEvents: CommunityEvent[]
  locale: string
}

export const WeeklyPopularCarousel = memo(function WeeklyPopularCarousel({
  cityEvents,
  communityEvents,
  locale,
}: WeeklyPopularCarouselProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()
  const { width: screenWidth } = useWindowDimensions()

  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)

  const cardWidth = Math.round(screenWidth * 0.85)
  const snapInterval = cardWidth + CARD_GAP

  // ── Merge, filter, sort ──

  const cards = useMemo<CarouselCard[]>(() => {
    const now = Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const cutoff = now + sevenDaysMs

    // City events: must have image, start within next 7 days
    const cityCards: CarouselCard[] = cityEvents
      .filter((e) => {
        if (!e.image_url) return false
        const start = new Date(e.start_time).getTime()
        if (isNaN(start)) return false
        return start >= now && start <= cutoff
      })
      .map((e): CarouselCardCity => {
        const localeName = locale === 'sv' ? e.name_sv : locale === 'en' ? e.name_en : null
        const localizedName = localeName ?? e.name_fi ?? e.name_en ?? ''
        return {
          source: 'city',
          id: e.id,
          title: localizedName,
          imageUrl: e.image_url!,
          startTime: new Date(e.start_time),
          locationName: e.location_name,
          isFree: e.is_free,
          infoUrl: e.info_url,
          participantCount: 0,
        }
      })

    // Community events: must have image, start within next 7 days
    const communityCards: CarouselCard[] = communityEvents
      .filter((e) => {
        if (!e.image_url) return false
        const start = new Date(e.event_date).getTime()
        if (isNaN(start)) return false
        return start >= now && start <= cutoff
      })
      .map((e): CarouselCardCommunity => ({
        source: 'community',
        id: e.id,
        title: e.title,
        imageUrl: e.image_url!,
        startTime: new Date(e.event_date),
        locationName: e.location_name,
        isFree: false,
        infoUrl: null,
        participantCount: e.participant_count ?? 0,
      }))

    // Sort: community with high participant_count first, then city by start_time
    const merged = [...communityCards, ...cityCards]
    merged.sort((a, b) => {
      if (a.source === 'community' && b.source !== 'community') return -1
      if (a.source !== 'community' && b.source === 'community') return 1
      if (a.source === 'community' && b.source === 'community') {
        return b.participantCount - a.participantCount
      }
      return a.startTime.getTime() - b.startTime.getTime()
    })

    return merged.slice(0, MAX_CARDS)
  }, [cityEvents, communityEvents, locale])

  // ── Scroll handler ──

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x
      const index = Math.round(offsetX / snapInterval)
      setActiveIndex(Math.max(0, Math.min(index, cards.length - 1)))
    },
    [snapInterval, cards.length],
  )

  // ── Card press ──

  const handleCardPress = useCallback(
    (card: CarouselCard) => {
      if (card.source === 'community') {
        router.push(`/event/${card.id}` as any)
      } else if (card.infoUrl) {
        try {
          const u = new URL(card.infoUrl)
          if (u.protocol === 'http:' || u.protocol === 'https:') {
            Linking.openURL(card.infoUrl).catch((e) => { if (__DEV__) console.warn('[carousel] link failed:', e) })
          }
        } catch {}
      }
    },
    [router],
  )

  // ── Format date ──

  const formatCardDate = useCallback(
    (date: Date) => {
      const loc = locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-US'
      const weekday = date.toLocaleDateString(loc, { weekday: 'short' }).replace('.', '')
      const day = date.getDate()
      const month = date.toLocaleDateString(loc, { month: 'short' }).replace('.', '')
      const time = date.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
      return `${weekday} ${day}. ${month} ${time}`
    },
    [locale],
  )

  // ── Don't render if no cards ──

  if (cards.length === 0) return null

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Flame size={20} color={colors.accent} fill={colors.accent} />
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              {t('feed.weeklyPopular')}
            </Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {t('feed.weeklyPopularSub')}
            </Text>
          </View>
        </View>
      </View>

      {/* Carousel */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: HORIZONTAL_PADDING }]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {cards.map((card, index) => {
          const resolvedImageUrl =
            card.source === 'community'
              ? getImageUrl(card.imageUrl, 'medium')
              : card.imageUrl

          return (
            <PressableOpacity
              key={`${card.source}-${card.id}`}
              onPress={() => handleCardPress(card)}
              style={[
                styles.card,
                {
                  width: cardWidth,
                  marginRight: index < cards.length - 1 ? CARD_GAP : 0,
                  borderColor: colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${card.title}, ${formatCardDate(card.startTime)}${card.locationName ? `, ${card.locationName}` : ''}`}
            >
              {/* Image */}
              <Image
                source={{ uri: resolvedImageUrl ?? undefined }}
                style={styles.image}
                contentFit="cover"
                transition={300}
                recyclingKey={resolvedImageUrl ?? card.id}
                accessible={false}
              />

              {/* Gradient overlay */}
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.75)']}
                locations={[0.35, 0.6, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              {/* Badges (top-right) */}
              <View style={styles.badgeContainer}>
                {card.isFree && (
                  <View style={styles.freeBadge}>
                    <Text style={styles.freeBadgeText}>
                      {t('feed.freeEvent')}
                    </Text>
                  </View>
                )}
                {card.source === 'community' && card.participantCount > 0 && (
                  <View style={styles.participantBadge}>
                    <Users size={12} color="#FFFFFF" strokeWidth={2} />
                    <Text style={styles.participantBadgeText}>
                      {card.participantCount}
                    </Text>
                  </View>
                )}
              </View>

              {/* Content overlay (bottom) */}
              <View style={styles.overlay}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {card.title}
                </Text>

                <View style={styles.metaRow}>
                  <Calendar size={13} color="#FFFFFF" strokeWidth={1.8} />
                  <Text style={styles.metaText}>
                    {formatCardDate(card.startTime)}
                  </Text>
                </View>

                {card.locationName && (
                  <View style={styles.metaRow}>
                    <MapPin size={13} color="#FFFFFF" strokeWidth={1.8} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {card.locationName}
                    </Text>
                  </View>
                )}
              </View>
            </PressableOpacity>
          )
        })}
      </ScrollView>

      {/* Pagination dots */}
      {cards.length > 1 && (
        <View style={styles.dotsRow}>
          {cards.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === activeIndex ? colors.foreground : colors.border,
                },
                index === activeIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  )
})

// ── Styles ──

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: fonts.heading,
    lineHeight: 24,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
    marginTop: 1,
  },

  // Scroll
  scrollContent: {
    paddingRight: HORIZONTAL_PADDING,
  },

  // Card
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
  },

  // Badges (top-right)
  badgeContainer: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    flexDirection: 'row',
    gap: 8,
  },
  freeBadge: {
    backgroundColor: 'rgba(45, 122, 79, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  freeBadgeText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    color: '#FFFFFF',
    lineHeight: 16,
  },
  participantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  participantBadgeText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    color: '#FFFFFF',
    lineHeight: 16,
  },

  // Overlay content
  overlay: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 16,
    zIndex: 2,
  },
  cardTitle: {
    fontSize: 20,
    fontFamily: fonts.heading,
    lineHeight: 26,
    color: '#FFFFFF',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  metaText: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    lineHeight: 18,
    color: '#FFFFFF',
    opacity: 0.92,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
    flexShrink: 1,
  },

  // Pagination dots
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    borderRadius: 9,
  },
})
