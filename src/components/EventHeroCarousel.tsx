import { memo, useMemo, useState, useCallback, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { Calendar, MapPin, ArrowRight } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { getImageUrl } from '@/lib/imageUtils'
import { formatDateHeader, formatEventTime } from '@/lib/format'
import { PressableOpacity } from '@/components/ui'
import type { Post, CommunityEvent } from '@/lib/types'

const CARD_GAP = 10
const H_PAD = 22
const MAX_CARDS = 6

const scrollContentStyle = { paddingHorizontal: H_PAD, gap: CARD_GAP } as const

interface EventHeroCarouselProps {
  eventPosts: Post[]
  communityEvents: CommunityEvent[]
  locale: string
}

interface HeroCard {
  id: string
  title: string
  imageUrl: string | null
  dateIso: string
  location: string | null
  source: 'post' | 'community'
}

export const EventHeroCarousel = memo(function EventHeroCarousel({
  eventPosts,
  communityEvents,
  locale,
}: EventHeroCarouselProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()
  const { width: screenWidth } = useWindowDimensions()

  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRef = useRef<ScrollView>(null)

  const cards = useMemo<HeroCard[]>(() => {
    const now = Date.now()

    const postCards: HeroCard[] = eventPosts
      .filter(p => p.event_date)
      .map(p => ({
        id: p.id,
        title: p.title,
        imageUrl: p.image_url,
        dateIso: p.event_date!,
        location: p.location,
        source: 'post' as const,
      }))

    const communityCards: HeroCard[] = communityEvents
      .filter(e => new Date(e.event_date).getTime() > now)
      .map(e => ({
        id: e.id,
        title: e.title,
        imageUrl: e.image_url,
        dateIso: e.event_date,
        location: e.location_name,
        source: 'community' as const,
      }))

    return [...communityCards, ...postCards]
      .sort((a, b) => new Date(a.dateIso).getTime() - new Date(b.dateIso).getTime())
      .slice(0, MAX_CARDS)
  }, [eventPosts, communityEvents])

  const cardWidth = cards.length > 1 ? screenWidth - H_PAD * 2 - 24 : screenWidth - H_PAD * 2
  const snapInterval = cardWidth + CARD_GAP

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = Math.max(0, Math.min(
        Math.round(e.nativeEvent.contentOffset.x / snapInterval),
        cards.length - 1,
      ))
      setActiveIndex(prev => prev === idx ? prev : idx)
    },
    [snapInterval, cards.length],
  )

  const handlePress = (card: HeroCard) => {
    if (card.source === 'community') {
      router.push(`/event/${card.id}` as any)
    } else {
      router.push(`/post/${card.id}` as any)
    }
  }

  if (cards.length === 0) return null

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        snapToInterval={snapInterval}
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={scrollContentStyle}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {cards.map((card) => (
          <PressableOpacity
            key={card.id}
            onPress={() => handlePress(card)}
            style={[styles.card, { width: cardWidth }]}
            activeOpacity={0.92}
            accessibilityRole="button"
            accessibilityLabel={card.title}
          >
            {card.imageUrl ? (
              <>
                <Image
                  source={{ uri: getImageUrl(card.imageUrl, 'medium')! }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.7)']}
                  locations={[0.3, 1]}
                  style={StyleSheet.absoluteFill}
                />
              </>
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.foreground }]} />
            )}

            <View style={styles.cardContent}>
              <View style={styles.datePill}>
                <Calendar size={12} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.datePillText}>
                  {formatDateHeader(card.dateIso, locale)} · {formatEventTime(card.dateIso, locale)}
                </Text>
              </View>

              <Text style={styles.cardTitle} numberOfLines={2}>
                {card.title}
              </Text>

              {card.location && (
                <View style={styles.locationRow}>
                  <MapPin size={12} color="rgba(255,255,255,0.7)" strokeWidth={2} />
                  <Text style={styles.locationText} numberOfLines={1}>{card.location}</Text>
                </View>
              )}

              <View style={styles.ctaRow}>
                <Text style={styles.ctaText}>{t('postCard.viewEvent') ?? 'Katso tapahtuma'}</Text>
                <ArrowRight size={14} color="#FFFFFF" strokeWidth={2.2} />
              </View>
            </View>
          </PressableOpacity>
        ))}
      </ScrollView>

      {cards.length > 1 && (
        <View style={styles.dots}>
          {cards.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === activeIndex ? colors.foreground : colors.border },
              ]}
            />
          ))}
        </View>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  card: {
    height: 200,
    borderRadius: 20,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  cardContent: {
    padding: 18,
    gap: 6,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 4,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: fonts.displayBold,
    color: '#FFFFFF',
    letterSpacing: -0.8,
    lineHeight: 26,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  locationText: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 16,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
})
