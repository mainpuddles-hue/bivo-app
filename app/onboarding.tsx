import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  ArrowRight,
  ChevronRight,
  MapPin,
  Check,
  CheckCircle,
  AlertTriangle,
  Shield,
  Handshake,
  Gift,
  Heart,
} from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { TackBirdLogo } from '@/components/TackBirdLogo'
import { NEIGHBORHOODS, CATEGORIES } from '@/lib/constants'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { useLocationVerification } from '@/hooks/useLocationVerification'
import { useReferral } from '@/hooks/useReferral'
import { trackEvent } from '@/lib/analytics'
import { FEATURES } from '@/lib/featureFlags'

const TOTAL_PAGES = 4

// City display names
const CITY_NAMES: Record<string, string> = {
  helsinki: 'Helsinki',
}

function OnboardingScreenInner() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const scrollRef = useRef<ScrollView>(null)
  const { width: SCREEN_WIDTH } = useWindowDimensions()

  const [currentPage, setCurrentPage] = useState(0)
  const [selectedCity, setSelectedCity] = useState('helsinki')
  const [cities, setCities] = useState<{ id: string; name: string }[]>([])
  const [dynamicNeighborhoods, setDynamicNeighborhoods] = useState<string[]>([])
  const [neighborhoodCoordsMap, setNeighborhoodCoordsMap] = useState<Record<string, { lat: number; lng: number }>>({})
  const [neighborhoodsLoading, setNeighborhoodsLoading] = useState(false)
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [referralInput, setReferralInput] = useState('')
  const [referralStatus, setReferralStatus] = useState<'idle' | 'applied' | 'invalid'>('idle')
  const [neighborhoodSearch, setNeighborhoodSearch] = useState('')
  const [customNeighborhood, setCustomNeighborhood] = useState('')
  const [onboardingUserId, setOnboardingUserId] = useState<string | null>(null)
  const { status: verificationStatus, distanceKm, verify } = useLocationVerification()
  const { applyInviteCode } = useReferral(onboardingUserId)

  // Fetch user ID for referral system
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setOnboardingUserId(user.id)
    }).catch(() => {})
  }, [supabase])

  // Filter neighborhoods by search query to reduce cognitive load on large lists
  const filteredNeighborhoods = useMemo(() => {
    if (!neighborhoodSearch.trim()) return dynamicNeighborhoods
    const q = neighborhoodSearch.trim().toLowerCase()
    return dynamicNeighborhoods.filter(nh => nh.toLowerCase().includes(q))
  }, [dynamicNeighborhoods, neighborhoodSearch])

  // Use static city list (only Helsinki for MVP launch)
  useEffect(() => {
    setCities(Object.entries(CITY_NAMES).map(([id, name]) => ({ id, name })))
  }, [])

  // Fetch neighborhoods when city changes
  useEffect(() => {
    let cancelled = false
    async function fetchNeighborhoods() {
      setNeighborhoodsLoading(true)
      setSelectedNeighborhood(null) // Reset selection when city changes
      setNeighborhoodSearch('') // Reset search when city changes
      setCustomNeighborhood('') // Reset custom input when city changes
      try {
        const { data } = await supabase
          .from('city_neighborhoods')
          .select('name, center_lat, center_lng')
          .eq('city_id', selectedCity)
          .order('name')
        if (!cancelled && data && data.length > 0) {
          setDynamicNeighborhoods(data.map((n: any) => n.name))
          const coordsMap: Record<string, { lat: number; lng: number }> = {}
          for (const n of data as any[]) {
            coordsMap[n.name] = { lat: n.center_lat, lng: n.center_lng }
          }
          setNeighborhoodCoordsMap(coordsMap)
        } else if (!cancelled) {
          // Fallback to static Helsinki neighborhoods
          setDynamicNeighborhoods(selectedCity === 'helsinki' ? [...NEIGHBORHOODS] : [])
          setNeighborhoodCoordsMap({})
        }
      } catch {
        if (!cancelled) {
          setDynamicNeighborhoods(selectedCity === 'helsinki' ? [...NEIGHBORHOODS] : [])
          setNeighborhoodCoordsMap({})
        }
      } finally {
        if (!cancelled) setNeighborhoodsLoading(false)
      }
    }
    fetchNeighborhoods()
    return () => { cancelled = true }
  }, [selectedCity, supabase])

  // Auto-verify when neighborhood is selected on page 4 (index 3)
  useEffect(() => {
    if (selectedNeighborhood && currentPage === 3) {
      const coords = neighborhoodCoordsMap[selectedNeighborhood]
      verify(selectedNeighborhood, coords)
    }
  }, [selectedNeighborhood, currentPage, verify, neighborhoodCoordsMap])

  const goToPage = useCallback((page: number) => {
    scrollRef.current?.scrollTo({ x: page * SCREEN_WIDTH, animated: true })
    setCurrentPage(page)
    trackEvent('onboarding_slide' as any, { slide: page })
  }, [SCREEN_WIDTH])

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
    if (page >= 0 && page < TOTAL_PAGES) {
      setCurrentPage(page)
    }
  }, [SCREEN_WIDTH])

  const handleComplete = useCallback(async () => {
    if (!selectedNeighborhood) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert(t('common.error'), t('auth.loginRequired'))
        router.replace('/(auth)/login')
        return
      }

      // Apply referral code FIRST (before profile update) — if invalid, user can retry
      if (referralInput.trim()) {
        trackEvent('onboarding_invite_code' as any, { hasCode: true })
        const result = await applyInviteCode(referralInput.trim())
        setReferralStatus(result === 'success' ? 'applied' : 'invalid')
        if (result !== 'success') {
          setSaving(false)
          return
        }
      }

      // Save selected city + neighborhood + mark onboarding completed in profile
      const updateData: Record<string, any> = {
        naapurusto: selectedNeighborhood,
        city_id: selectedCity,
        onboarding_completed: true,
      }
      await (supabase.from('profiles') as any)
        .update(updateData)
        .eq('id', user.id)

      // Mark onboarding complete locally
      await AsyncStorage.setItem('onboarding_complete', 'true')
      trackEvent('onboarding_completed' as any, { city: selectedCity, neighborhood: selectedNeighborhood })
      router.replace('/')
    } catch (err) {
      Alert.alert(t('common.error'), t('onboarding.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [supabase, selectedNeighborhood, selectedCity, referralInput, router, t, applyInviteCode])

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

  // ── Slide 1: Welcome ──
  const renderWelcome = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <View style={s.welcomeContent}>
        <View style={[s.logoBigCircle, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
          <TackBirdLogo size={56} color={colors.primaryForeground} />
        </View>

        <Text style={[s.appName, { color: colors.primary, fontFamily: fonts.heading }]}>
          TackBird
        </Text>

        <Text style={[s.tagline, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>
          {t('onboarding.welcome')}
        </Text>

        <Text style={[s.slogan, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
          {t('onboarding.welcomeSubtitle')}
        </Text>
      </View>

      <View style={[s.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <PressableOpacity
          onPress={() => goToPage(1)}
          style={[s.primaryBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.next')}
        >
          <Text style={[s.primaryBtnText, { color: colors.primaryForeground, fontFamily: fonts.bodySemi }]}>
            {t('onboarding.next')}
          </Text>
          <ArrowRight size={18} color={colors.primaryForeground} />
        </PressableOpacity>
        {renderDots()}
      </View>
    </View>
  )

  // ── Slide 2: How it works ──
  const renderHowItWorks = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <View style={s.howItWorksContent}>
        <Text style={[s.pageTitle, { color: colors.foreground, fontFamily: fonts.heading, textAlign: 'center' }]}>
          {t('onboarding.howItWorks')}
        </Text>

        <View style={s.featureList}>
          <View style={s.featureRow}>
            <View style={[s.featureIconCircle, { backgroundColor: `${colors.primary}20` }]}>
              <Handshake size={28} color={colors.primary} />
            </View>
            <Text style={[s.featureText, { color: colors.foreground, fontFamily: fonts.body }]}>
              {t('onboarding.askHelp')}
            </Text>
          </View>

          <View style={s.featureRow}>
            <View style={[s.featureIconCircle, { backgroundColor: `${CATEGORIES.tarjoan.color}20` }]}>
              <Gift size={28} color={CATEGORIES.tarjoan.color} />
            </View>
            <Text style={[s.featureText, { color: colors.foreground, fontFamily: fonts.body }]}>
              {t('onboarding.offerServices')}
            </Text>
          </View>

          <View style={s.featureRow}>
            <View style={[s.featureIconCircle, { backgroundColor: `${CATEGORIES.ilmaista.color}20` }]}>
              <Heart size={28} color={CATEGORIES.ilmaista.color} />
            </View>
            <Text style={[s.featureText, { color: colors.foreground, fontFamily: fonts.body }]}>
              {t('onboarding.shareFree')}
            </Text>
          </View>
        </View>
      </View>

      <View style={[s.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <PressableOpacity
          onPress={() => goToPage(2)}
          style={[s.primaryBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.next')}
        >
          <Text style={[s.primaryBtnText, { color: colors.primaryForeground, fontFamily: fonts.bodySemi }]}>
            {t('onboarding.next')}
          </Text>
          <ChevronRight size={18} color={colors.primaryForeground} />
        </PressableOpacity>
        <PressableOpacity
          onPress={() => goToPage(3)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.skip')}
        >
          <Text style={[s.skipText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
            {t('onboarding.skip')}
          </Text>
        </PressableOpacity>
        {renderDots()}
      </View>
    </View>
  )

  // ── Slide 3: Trust & Safety ──
  const renderTrustSafety = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <View style={s.trustContent}>
        <View style={[s.trustIconCircle, { backgroundColor: `${colors.primary}15` }]}>
          <Shield size={48} color={colors.primary} />
        </View>

        <Text style={[s.pageTitle, { color: colors.foreground, fontFamily: fonts.heading, textAlign: 'center' }]}>
          {t('onboarding.trustSafety')}
        </Text>

        <View style={s.trustList}>
          <View style={s.trustItem}>
            <CheckCircle size={18} color={colors.primary} />
            <Text style={[s.trustItemText, { color: colors.foreground, fontFamily: fonts.body }]}>
              {t('onboarding.verifiedProfiles')}
            </Text>
          </View>
          <View style={s.trustItem}>
            <CheckCircle size={18} color={colors.primary} />
            <Text style={[s.trustItemText, { color: colors.foreground, fontFamily: fonts.body }]}>
              {t('onboarding.trustTiers')}
            </Text>
          </View>
          <View style={s.trustItem}>
            <CheckCircle size={18} color={colors.primary} />
            <Text style={[s.trustItemText, { color: colors.foreground, fontFamily: fonts.body }]}>
              {t('onboarding.safeMessaging')}
            </Text>
          </View>
        </View>
      </View>

      <View style={[s.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <PressableOpacity
          onPress={() => goToPage(3)}
          style={[s.primaryBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.next')}
        >
          <Text style={[s.primaryBtnText, { color: colors.primaryForeground, fontFamily: fonts.bodySemi }]}>
            {t('onboarding.next')}
          </Text>
          <ChevronRight size={18} color={colors.primaryForeground} />
        </PressableOpacity>
        <PressableOpacity
          onPress={() => goToPage(3)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.skip')}
        >
          <Text style={[s.skipText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
            {t('onboarding.skip')}
          </Text>
        </PressableOpacity>
        {renderDots()}
      </View>
    </View>
  )

  // ── Slide 4: Choose Neighborhood ──
  const renderNeighborhood = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      {/* Back button so user can return to previous slides and change choices */}
      <PressableOpacity onPress={() => goToPage(2)} style={s.backBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
        <ArrowRight size={18} color={colors.mutedForeground} style={{ transform: [{ rotate: '180deg' }] }} />
        <Text style={[s.skipText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
          {t('common.back')}
        </Text>
      </PressableOpacity>

      <Text style={[s.pageTitle, { color: colors.foreground, fontFamily: fonts.heading, paddingHorizontal: 24 }]}>
        Helsinki
      </Text>

      {/* City picker row — hidden until multi-city launch (only Helsinki supported) */}
      {cities.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cityRow}>
          {(cities.length > 0 ? cities : Object.entries(CITY_NAMES).map(([id, name]) => ({ id, name }))).map((city) => {
            const isSelected = selectedCity === city.id
            return (
              <PressableOpacity
                key={city.id}
                onPress={() => { setSelectedCity(city.id); trackEvent('onboarding_city_selected' as any, { city: city.id }) }}
                style={[
                  s.cityChip,
                  isSelected
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={city.name}
              >
                <Text
                  style={[
                    s.cityChipText,
                    {
                      color: isSelected ? colors.primaryForeground : colors.foreground,
                      fontFamily: isSelected ? fonts.bodySemi : fonts.body,
                    },
                  ]}
                >
                  {city.name}
                </Text>
              </PressableOpacity>
            )
          })}
        </ScrollView>
      )}

      <Text style={[s.pageSubtitle, { color: colors.mutedForeground, fontFamily: fonts.body, paddingHorizontal: 24, marginTop: 8 }]}>
        {t('onboarding.neighborhoodSubtitle')}
      </Text>

      {/* Search input for neighborhoods — reduces cognitive load when many neighborhoods */}
      {dynamicNeighborhoods.length > 12 && (
        <View style={s.neighborhoodSearchRow}>
          <TextInput
            value={neighborhoodSearch}
            onChangeText={setNeighborhoodSearch}
            placeholder={t('search.placeholder')}
            placeholderTextColor={colors.mutedForeground}
            style={[s.neighborhoodSearchInput, {
              backgroundColor: colors.card,
              borderColor: colors.border,
              color: colors.foreground,
              fontFamily: fonts.body,
            }]}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
      )}

      <ScrollView
        contentContainerStyle={s.neighborhoodGrid}
        showsVerticalScrollIndicator={false}
        style={s.neighborhoodScroll}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {neighborhoodsLoading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
        ) : dynamicNeighborhoods.length === 0 ? (
          <View style={s.customNeighborhoodContainer}>
            <Text style={[s.neighborhoodText, { color: colors.mutedForeground, fontFamily: fonts.body, marginBottom: 12 }]}>
              {t('onboarding.noNeighborhoods')}
            </Text>
            <TextInput
              value={customNeighborhood}
              onChangeText={(text) => {
                setCustomNeighborhood(text)
                setSelectedNeighborhood(text.trim() || null)
              }}
              placeholder={t('onboarding.typeNeighborhood')}
              placeholderTextColor={colors.mutedForeground}
              style={[s.neighborhoodSearchInput, {
                backgroundColor: colors.card,
                borderColor: customNeighborhood.trim() ? colors.primary : colors.border,
                color: colors.foreground,
                fontFamily: fonts.body,
              }]}
              autoCorrect={false}
              autoCapitalize="words"
              accessibilityLabel={t('onboarding.typeNeighborhood')}
            />
            {customNeighborhood.trim() !== '' && (
              <View style={s.customNeighborhoodConfirm}>
                <MapPin size={14} color={colors.primary} />
                <Text style={[s.neighborhoodText, { color: colors.primary, fontFamily: fonts.bodyMedium }]}>
                  {customNeighborhood.trim()}
                </Text>
              </View>
            )}
          </View>
        ) : filteredNeighborhoods.length === 0 ? (
          <Text style={[s.neighborhoodText, { color: colors.mutedForeground, fontFamily: fonts.body, paddingHorizontal: 24, paddingTop: 16 }]}>
            {t('search.noResults')}
          </Text>
        ) : (
          filteredNeighborhoods.map((nh) => {
            const isSelected = selectedNeighborhood === nh
            return (
              <PressableOpacity
                key={nh}
                onPress={() => { setSelectedNeighborhood(nh); trackEvent('onboarding_neighborhood_selected' as any, { neighborhood: nh }) }}
                style={[
                  s.neighborhoodChip,
                  isSelected
                    ? { backgroundColor: colors.primary }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={nh}
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
              </PressableOpacity>
            )
          })
        )}
      </ScrollView>

      {/* Location verification status */}
      {selectedNeighborhood && verificationStatus !== 'idle' && (
        <View style={[s.verificationRow, {
          backgroundColor: verificationStatus === 'verified' ? `${colors.success}15` :
            verificationStatus === 'unverified' ? `${CATEGORIES.nappaa.color}15` : colors.muted,
        }]}>
          {verificationStatus === 'checking' && (
            <>
              <ActivityIndicator size="small" color={colors.mutedForeground} />
              <Text style={[s.verificationText, { color: colors.mutedForeground }]}>
                {t('onboarding.verifyingLocation')}
              </Text>
            </>
          )}
          {verificationStatus === 'verified' && (
            <>
              <CheckCircle size={16} color={colors.success} />
              <Text style={[s.verificationText, { color: colors.success }]}>
                {t('onboarding.locationVerified')}
              </Text>
            </>
          )}
          {verificationStatus === 'unverified' && (
            <>
              <AlertTriangle size={16} color={CATEGORIES.nappaa.color} />
              <Text style={[s.verificationText, { color: CATEGORIES.nappaa.color }]}>
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

      {/* Referral code input */}
      <View style={s.referralInputRow}>
        <TextInput
          value={referralInput}
          onChangeText={(text) => { setReferralInput(text); setReferralStatus('idle') }}
          placeholder={t('referral.codeInput')}
          placeholderTextColor={colors.mutedForeground}
          style={[s.referralInput, {
            backgroundColor: colors.card,
            borderColor: referralStatus === 'invalid' ? colors.destructive : referralStatus === 'applied' ? colors.success : colors.border,
            color: colors.foreground,
            fontFamily: fonts.body,
          }]}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
        />
        {referralStatus === 'applied' && (
          <Text style={[s.referralFeedback, { color: colors.success, fontFamily: fonts.body }]}>
            {t('referral.codeApplied')}
          </Text>
        )}
        {referralStatus === 'invalid' && (
          <Text style={[s.referralFeedback, { color: colors.destructive, fontFamily: fonts.body }]}>
            {t('referral.invalidCode')}
          </Text>
        )}
      </View>

      <View style={[s.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <PressableOpacity
          onPress={handleComplete}
          disabled={saving || !selectedNeighborhood}
          style={[
            s.primaryBtn,
            {
              backgroundColor: selectedNeighborhood ? colors.primary : colors.muted,
              opacity: saving ? 0.6 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.start')}
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
                {t('onboarding.start')}
              </Text>
              <Check
                size={18}
                color={selectedNeighborhood ? colors.primaryForeground : colors.mutedForeground}
              />
            </>
          )}
        </PressableOpacity>
        {renderDots()}
      </View>
    </View>
  )

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScroll}
        bounces={false}
        nestedScrollEnabled
      >
        {renderWelcome()}
        {renderHowItWorks()}
        {renderTrustSafety()}
        {renderNeighborhood()}
      </ScrollView>
    </KeyboardAvoidingView>
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
    shadowColor: '#2D6B5E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 4,
  },
  appName: {
    fontSize: 32,
    letterSpacing: 1.7,
    lineHeight: 42,
  },
  tagline: {
    fontSize: 20,
    textAlign: 'center',
    lineHeight: 28,
  },
  slogan: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 4,
  },

  // Page titles
  pageTitle: {
    fontSize: 24,
    letterSpacing: -0.3,
    lineHeight: 32,
    paddingTop: 24,
  },
  pageSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 16,
  },

  // How it works
  howItWorksContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    paddingHorizontal: 32,
  },
  featureList: {
    gap: 24,
    width: '100%',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  featureIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 16,
    flex: 1,
    lineHeight: 22,
  },

  // Trust & Safety
  trustContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 32,
  },
  trustIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustList: {
    gap: 16,
    width: '100%',
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  trustItemText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 22,
  },

  // Skip text
  skipText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: 4,
  },

  // Back button
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 8,
    alignSelf: 'flex-start',
  },

  // City picker
  cityRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  cityChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  cityChipText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
  },

  // Neighborhood search
  neighborhoodSearchRow: {
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  neighborhoodSearchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    lineHeight: 20,
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
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  neighborhoodText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.bodyMedium,
  },
  customNeighborhoodContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    width: '100%',
  },
  customNeighborhoodConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },

  // Location verification
  verificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  verificationText: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
    flex: 1,
  },

  // Referral code input
  referralInputRow: {
    paddingHorizontal: 24,
    marginBottom: 8,
    gap: 4,
  },
  referralInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    lineHeight: 20,
  },
  referralFeedback: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
    paddingHorizontal: 4,
  },

  // Bottom area
  bottomArea: {
    paddingHorizontal: 24,
    gap: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 16,
    minHeight: 48,
  },
  primaryBtnText: {
    fontSize: 16,
    lineHeight: 22,
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

export default function OnboardingScreen() {
  return (
    <ScreenErrorBoundary screenName="Onboarding">
      <OnboardingScreenInner />
    </ScreenErrorBoundary>
  )
}
