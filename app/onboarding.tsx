import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  Alert,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  ArrowRight,
  ChevronRight,
  MapPin,
  Check,
  HandHelping,
  Gift,
  Heart,
  Zap,
  BookOpen,
  CalendarDays,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { TackBirdLogo } from '@/components/TackBirdLogo'
import { CATEGORIES, NEIGHBORHOODS } from '@/lib/constants'
import { fonts } from '@/lib/fonts'
import { useLocationVerification } from '@/hooks/useLocationVerification'
import type { PostType } from '@/lib/types'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const TOTAL_PAGES = 3

const ICON_MAP: Record<string, typeof HandHelping> = {
  HandHelping,
  Gift,
  Heart,
  Zap,
  BookOpen,
  CalendarDays,
}

const CATEGORY_ORDER: PostType[] = [
  'tarvitsen',
  'tarjoan',
  'ilmaista',
  'nappaa',
  'lainaa',
  'tapahtuma',
]

export default function OnboardingScreen() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const scrollRef = useRef<ScrollView>(null)

  const [currentPage, setCurrentPage] = useState(0)
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { status: verificationStatus, distanceKm, verify } = useLocationVerification()

  // Auto-verify when neighborhood is selected on page 3
  useEffect(() => {
    if (selectedNeighborhood && currentPage === 2) {
      verify(selectedNeighborhood)
    }
  }, [selectedNeighborhood, currentPage, verify])

  const goToPage = useCallback((page: number) => {
    scrollRef.current?.scrollTo({ x: page * SCREEN_WIDTH, animated: true })
    setCurrentPage(page)
  }, [])

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
    if (page >= 0 && page < TOTAL_PAGES) {
      setCurrentPage(page)
    }
  }, [])

  const handleComplete = useCallback(async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert(t('common.error'), t('auth.loginRequired'))
        router.replace('/(auth)/login')
        return
      }

      // Save selected neighborhood + location verification status
      if (selectedNeighborhood) {
        const updateData: Record<string, any> = { naapurusto: selectedNeighborhood }
        if (verificationStatus === 'verified') {
          updateData.location_verified = true
        }
        await (supabase.from('profiles') as any)
          .update(updateData)
          .eq('id', user.id)
      }

      // Mark onboarding complete
      await AsyncStorage.setItem('onboarding_complete', 'true')
      router.replace('/')
    } catch (err) {
      Alert.alert(t('common.error'), t('onboarding.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [supabase, selectedNeighborhood, router, t])

  // ── Dots indicator ──
  const renderDots = () => (
    <View style={s.dots}>
      {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
        <View
          key={i}
          style={[
            s.dot,
            {
              backgroundColor: i === currentPage ? colors.primary : colors.muted,
              width: i === currentPage ? 24 : 8,
            },
          ]}
        />
      ))}
    </View>
  )

  // ── Page 1: Welcome ──
  const renderWelcome = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <View style={s.welcomeContent}>
        <View style={[s.logoBigCircle, { backgroundColor: colors.primary }]}>
          <TackBirdLogo size={56} color={colors.primaryForeground} />
        </View>

        <Text style={[s.appName, { color: colors.primary, fontFamily: fonts.heading }]}>
          TackBird
        </Text>

        <Text style={[s.tagline, { color: colors.foreground, fontFamily: fonts.body }]}>
          {t('onboarding.subtitle')}
        </Text>

        <Text style={[s.slogan, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
          {t('feed.slogan')}
        </Text>
      </View>

      <View style={[s.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          onPress={() => goToPage(1)}
          style={[s.primaryBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={[s.primaryBtnText, { color: colors.primaryForeground, fontFamily: fonts.bodySemi }]}>
            {t('onboarding.getStarted')}
          </Text>
          <ArrowRight size={18} color={colors.primaryForeground} />
        </Pressable>
        {renderDots()}
      </View>
    </View>
  )

  // ── Page 2: Categories ──
  const renderCategories = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <ScrollView
        contentContainerStyle={s.categoriesScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[s.pageTitle, { color: colors.foreground, fontFamily: fonts.heading }]}>
          {t('onboarding.categoriesTitle')}
        </Text>

        <View style={s.categoryGrid}>
          {CATEGORY_ORDER.map((key) => {
            const cat = CATEGORIES[key]
            const IconComponent = ICON_MAP[cat.icon]
            const bgColor = isDark ? cat.bgDark : cat.bgLight

            return (
              <View
                key={key}
                style={[s.categoryCard, { backgroundColor: bgColor }]}
              >
                <View style={[s.categoryIconCircle, { backgroundColor: cat.color }]}>
                  {IconComponent && (
                    <IconComponent size={22} color="#FFFFFF" />
                  )}
                </View>
                <View style={s.categoryTextArea}>
                  <Text style={[s.categoryName, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>
                    {t(cat.label)}
                  </Text>
                  <Text style={[s.categorySub, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                    {t(cat.subtitle)}
                  </Text>
                </View>
              </View>
            )
          })}
        </View>
      </ScrollView>

      <View style={[s.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          onPress={() => goToPage(2)}
          style={[s.primaryBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={[s.primaryBtnText, { color: colors.primaryForeground, fontFamily: fonts.bodySemi }]}>
            {t('onboarding.continue')}
          </Text>
          <ChevronRight size={18} color={colors.primaryForeground} />
        </Pressable>
        {renderDots()}
      </View>
    </View>
  )

  // ── Page 3: Neighborhood ──
  const renderNeighborhood = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <Text style={[s.pageTitle, { color: colors.foreground, fontFamily: fonts.heading, paddingHorizontal: 24 }]}>
        {t('onboarding.neighborhoodTitle')}
      </Text>
      <Text style={[s.pageSubtitle, { color: colors.mutedForeground, fontFamily: fonts.body, paddingHorizontal: 24 }]}>
        {t('onboarding.neighborhoodSubtitle')}
      </Text>

      <ScrollView
        contentContainerStyle={s.neighborhoodGrid}
        showsVerticalScrollIndicator={false}
        style={s.neighborhoodScroll}
      >
        {NEIGHBORHOODS.map((nh) => {
          const isSelected = selectedNeighborhood === nh
          return (
            <Pressable
              key={nh}
              onPress={() => setSelectedNeighborhood(nh)}
              style={[
                s.neighborhoodChip,
                isSelected
                  ? { backgroundColor: colors.primary }
                  : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
              ]}
            >
              {isSelected && <Check size={14} color={colors.primaryForeground} />}
              <MapPin size={14} color={isSelected ? colors.primaryForeground : colors.mutedForeground} />
              <Text
                style={[
                  s.neighborhoodText,
                  {
                    color: isSelected ? colors.primaryForeground : colors.foreground,
                    fontFamily: fonts.bodyMedium,
                  },
                ]}
              >
                {nh}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Location verification status */}
      {selectedNeighborhood && verificationStatus !== 'idle' && (
        <View style={[s.verificationRow, {
          backgroundColor: verificationStatus === 'verified' ? '#2B8A6215' :
            verificationStatus === 'unverified' ? '#E8A05015' : colors.muted,
        }]}>
          {verificationStatus === 'checking' && (
            <>
              <Loader2 size={16} color={colors.mutedForeground} />
              <Text style={[s.verificationText, { color: colors.mutedForeground }]}>
                {t('onboarding.verifyingLocation')}
              </Text>
            </>
          )}
          {verificationStatus === 'verified' && (
            <>
              <CheckCircle size={16} color="#2B8A62" />
              <Text style={[s.verificationText, { color: '#2B8A62' }]}>
                {t('onboarding.locationVerified')}
              </Text>
            </>
          )}
          {verificationStatus === 'unverified' && (
            <>
              <AlertTriangle size={16} color="#E8A050" />
              <Text style={[s.verificationText, { color: '#E8A050' }]}>
                {t('onboarding.locationNotVerified', { distance: distanceKm ? distanceKm.toFixed(1) : '?' })}
              </Text>
            </>
          )}
          {verificationStatus === 'error' && (
            <>
              <MapPin size={16} color={colors.mutedForeground} />
              <Text style={[s.verificationText, { color: colors.mutedForeground }]}>
                {t('onboarding.locationCheckFailed')}
              </Text>
            </>
          )}
        </View>
      )}

      <View style={[s.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          onPress={handleComplete}
          disabled={saving}
          style={[
            s.primaryBtn,
            {
              backgroundColor: selectedNeighborhood ? colors.primary : colors.muted,
              opacity: saving ? 0.6 : 1,
            },
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <>
              <Text
                style={[
                  s.primaryBtnText,
                  {
                    color: selectedNeighborhood ? colors.primaryForeground : colors.mutedForeground,
                    fontFamily: fonts.bodySemi,
                  },
                ]}
              >
                {t('onboarding.done')}
              </Text>
              <Check
                size={18}
                color={selectedNeighborhood ? colors.primaryForeground : colors.mutedForeground}
              />
            </>
          )}
        </Pressable>
        {renderDots()}
      </View>
    </View>
  )

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScroll}
        bounces={false}
      >
        {renderWelcome()}
        {renderCategories()}
        {renderNeighborhood()}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Page wrapper
  page: {
    flex: 1,
  },

  // Welcome
  welcomeContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  logoBigCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  appName: {
    fontSize: 32,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 26,
  },
  slogan: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
    fontStyle: 'italic',
  },

  // Page titles
  pageTitle: {
    fontSize: 24,
    letterSpacing: -0.3,
    paddingTop: 24,
  },
  pageSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
    marginBottom: 16,
  },

  // Categories
  categoriesScrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  categoryGrid: {
    gap: 12,
    marginTop: 20,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
  },
  categoryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTextArea: {
    flex: 1,
    gap: 2,
  },
  categoryName: {
    fontSize: 16,
  },
  categorySub: {
    fontSize: 13,
    lineHeight: 18,
  },

  // Neighborhood
  neighborhoodScroll: {
    flex: 1,
  },
  neighborhoodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  neighborhoodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  neighborhoodText: {
    fontSize: 14,
  },

  // Location verification
  verificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  verificationText: {
    fontSize: 13,
    fontFamily: fonts.body,
    flex: 1,
  },

  // Bottom area
  bottomArea: {
    paddingHorizontal: 24,
    gap: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    minHeight: 52,
  },
  primaryBtnText: {
    fontSize: 16,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
})
