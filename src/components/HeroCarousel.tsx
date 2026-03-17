import { useState, useEffect, useRef, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet, Dimensions, type GestureResponderEvent } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronRight, Sparkles, Users, Heart } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n, type TFunction } from '@/lib/i18n'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SLIDE_HEIGHT = 168
const AUTO_PLAY_MS = 5500
const SLIDE_COUNT = 3

interface Slide {
  colors: [string, string]
  label: string
  title: string
  subtitle: string
  cta: string
  ctaHref: string
  icon: React.ReactNode
}

function getSlides(t: TFunction, primary: string, accent: string, pro: string): Slide[] {
  return [
    {
      colors: [primary, accent],
      label: t('hero.slide1Label'),
      title: t('hero.slide1Title'),
      subtitle: t('hero.slide1Subtitle'),
      cta: t('hero.createListing'),
      ctaHref: '/create',
      icon: <Sparkles size={16} color={primary} />,
    },
    {
      colors: [primary, primary],
      label: t('hero.slide2Label'),
      title: t('hero.slide2Title'),
      subtitle: t('hero.slide2Subtitle'),
      cta: t('hero.explore'),
      ctaHref: '/search',
      icon: <Users size={16} color={primary} />,
    },
    {
      colors: [pro, pro],
      label: t('hero.slide3Label'),
      title: t('hero.slide3Title'),
      subtitle: t('hero.slide3Subtitle'),
      cta: t('hero.createListing'),
      ctaHref: '/create',
      icon: <Heart size={16} color={pro} />,
    },
  ]
}

export function HeroCarousel() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()
  const [current, setCurrent] = useState(0)
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const touchStartX = useRef(0)

  const slides = getSlides(t, colors.primary, colors.accent, colors.pro)

  const startAutoPlay = useCallback(() => {
    if (autoPlayRef.current) clearInterval(autoPlayRef.current)
    autoPlayRef.current = setInterval(() => {
      setCurrent(prev => (prev + 1) % SLIDE_COUNT)
    }, AUTO_PLAY_MS)
  }, [])

  useEffect(() => {
    startAutoPlay()
    return () => { if (autoPlayRef.current) clearInterval(autoPlayRef.current) }
  }, [startAutoPlay])

  const handleTouchStart = (e: GestureResponderEvent) => {
    touchStartX.current = e.nativeEvent.pageX
    if (autoPlayRef.current) clearInterval(autoPlayRef.current)
  }

  const handleTouchEnd = (e: GestureResponderEvent) => {
    const delta = e.nativeEvent.pageX - touchStartX.current
    if (delta < -50) setCurrent(prev => (prev + 1) % SLIDE_COUNT)
    else if (delta > 50) setCurrent(prev => (prev - 1 + SLIDE_COUNT) % SLIDE_COUNT)
    startAutoPlay()
  }

  const slide = slides[current]

  return (
    <View>
      <Pressable
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={[styles.slideContainer, { backgroundColor: slide.colors[0] }]}
      >
        <View style={styles.slideContent}>
          <View>
            <Text style={styles.slideLabel}>{slide.label}</Text>
            <Text style={styles.slideTitle}>{slide.title}</Text>
            <Text style={styles.slideSubtitle}>{slide.subtitle}</Text>
          </View>
          <Pressable
            onPress={() => router.push(slide.ctaHref as any)}
            style={styles.ctaButton}
          >
            {slide.icon}
            <Text style={[styles.ctaText, { color: slide.colors[0] }]}>{slide.cta}</Text>
            <ChevronRight size={16} color={slide.colors[0]} />
          </Pressable>
        </View>
      </Pressable>

      {/* Dot indicators */}
      <View style={styles.dots}>
        {slides.map((_, idx) => (
          <Pressable key={idx} onPress={() => { setCurrent(idx); startAutoPlay() }}>
            <View style={[
              styles.dot,
              {
                width: idx === current ? 20 : 6,
                backgroundColor: idx === current ? colors.primary : `${colors.primary}33`,
              }
            ]} />
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  slideContainer: {
    height: SLIDE_HEIGHT, borderRadius: 16, overflow: 'hidden',
  },
  slideContent: {
    flex: 1, justifyContent: 'space-between', padding: 16,
  },
  slideLabel: {
    fontSize: 10, fontWeight: '500', letterSpacing: 1, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)', marginBottom: 4,
  },
  slideTitle: {
    fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 4,
  },
  slideSubtitle: {
    fontSize: 14, color: 'rgba(255,255,255,0.85)',
  },
  ctaButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'flex-start',
    minHeight: 36,
  },
  ctaText: { fontSize: 14, fontWeight: '600' },
  dots: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 12,
  },
  dot: { height: 6, borderRadius: 3 },
})
