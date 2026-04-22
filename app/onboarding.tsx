import { useState, useCallback, useRef, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
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
  ArrowLeft,
  Check,
  CheckCircle,
  Shield,
  Handshake,
  Gift,
  Heart,
  BookOpen,
  CalendarDays,
  Users,
  MessageCircle,
} from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { TackBirdLogo } from '@/components/TackBirdLogo'
import { LocationAutocomplete } from '@/components/LocationAutocomplete'
import type { LocationResult } from '@/components/LocationAutocomplete'
import { CATEGORIES } from '@/lib/constants'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { useReferral } from '@/hooks/useReferral'
import { trackEvent } from '@/lib/analytics'
import { FEATURES } from '@/lib/featureFlags'

const TOTAL_PAGES = 5

// City display names
const CITY_NAMES: Record<string, string> = {
  helsinki: 'Helsinki',
}

function OnboardingScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const scrollRef = useRef<ScrollView>(null)
  const { width: SCREEN_WIDTH } = useWindowDimensions()

  const [currentPage, setCurrentPage] = useState(0)
  const [selectedCity, setSelectedCity] = useState('helsinki')
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [referralInput, setReferralInput] = useState('')
  const [referralStatus, setReferralStatus] = useState<'idle' | 'applied' | 'invalid'>('idle')
  const [onboardingUserId, setOnboardingUserId] = useState<string | null>(null)
  // Address-based onboarding state
  const [addressText, setAddressText] = useState('')
  const [selectedAddress, setSelectedAddress] = useState<LocationResult | null>(null)
  const { applyInviteCode } = useReferral(onboardingUserId)

  // Fetch user ID for referral system
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setOnboardingUserId(user.id)
    }).catch(() => {})
  }, [supabase])

  // Handle address selection from LocationAutocomplete
  const handleAddressSelect = useCallback((location: LocationResult) => {
    setSelectedAddress(location)
    try { Haptics.selectionAsync() } catch {}
  }, [])

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
    if (!selectedAddress) return
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

      // Build street address from Photon result
      const streetAddress = selectedAddress.street
        ? (selectedAddress.housenumber
            ? `${selectedAddress.street} ${selectedAddress.housenumber}`
            : selectedAddress.street)
        : selectedAddress.name

      // Resolve building — atomically creates or finds building + links user
      const { error: rpcError } = await (supabase as any).rpc('resolve_building', {
        p_street_address: streetAddress,
        p_postal_code: selectedAddress.postalCode ?? null,
        p_city: selectedAddress.city ?? 'Helsinki',
        p_neighborhood: selectedAddress.neighborhood ?? null,
        p_lat: selectedAddress.lat,
        p_lng: selectedAddress.lng,
      })

      if (rpcError) {
        Alert.alert(t('common.error'), t('onboarding.saveFailed'))
        setSaving(false)
        return
      }

      // Update profile: mark onboarding complete + save neighborhood for feed filtering
      const updateData: Record<string, any> = {
        naapurusto: selectedAddress.neighborhood ?? selectedAddress.city ?? 'Helsinki',
        city_id: selectedCity,
        onboarding_completed: true,
      }
      const { error: updateError } = await (supabase.from('profiles') as any)
        .update(updateData)
        .eq('id', user.id)
      if (updateError) {
        Alert.alert(t('common.error'), t('onboarding.saveFailed'))
        setSaving(false)
        return
      }

      // Mark onboarding complete locally
      await AsyncStorage.setItem('onboarding_complete', 'true')
      trackEvent('onboarding_completed' as any, {
        city: selectedAddress.city ?? selectedCity,
        neighborhood: selectedAddress.neighborhood ?? null,
        address: streetAddress,
      })
      router.replace('/')
    } catch (err) {
      Alert.alert(t('common.error'), t('onboarding.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [supabase, selectedAddress, selectedCity, referralInput, router, t, applyInviteCode])

  // ── Progress bars (mockup style: horizontal bars, active = INK, inactive = LINE) ──
  const renderProgressBar = () => (
    <View style={[s.progressRow, { paddingTop: insets.top + 12 }]}>
      <View style={s.progressBarsContainer}>
        {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
          <View
            key={i}
            style={[
              s.progressBar,
              {
                backgroundColor: i <= currentPage ? colors.foreground : colors.border,
              },
            ]}
          />
        ))}
      </View>
      {currentPage < TOTAL_PAGES - 1 && (
        <PressableOpacity
          onPress={() => goToPage(TOTAL_PAGES - 1)}
          hitSlop={12}
          style={s.skipPressable}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.skip')}
        >
          <Text style={[s.skipText, { color: colors.mutedForeground, fontFamily: fonts.bodyMedium }]}>
            {t('onboarding.skip')}
          </Text>
        </PressableOpacity>
      )}
    </View>
  )

  // ── Decorative circles pattern ──
  const renderCircles = (variant: 'welcome' | 'features' | 'trust') => {
    const circleColor = colors.border
    const circleColorSoft = colors.muted
    if (variant === 'welcome') {
      return (
        <View style={s.circlesContainer}>
          <View style={[s.decorCircle, s.decorCircleLg, { borderColor: circleColor, top: -20, right: -40 }]} />
          <View style={[s.decorCircle, s.decorCircleMd, { backgroundColor: circleColorSoft, top: 60, left: -30 }]} />
          <View style={[s.decorCircle, s.decorCircleSm, { backgroundColor: circleColor, bottom: 80, right: 30 }]} />
        </View>
      )
    }
    if (variant === 'features') {
      return (
        <View style={s.circlesContainer}>
          <View style={[s.decorCircle, s.decorCircleMd, { borderColor: circleColor, top: 10, right: -20 }]} />
          <View style={[s.decorCircle, s.decorCircleSm, { backgroundColor: circleColorSoft, bottom: 120, left: 20 }]} />
        </View>
      )
    }
    return (
      <View style={s.circlesContainer}>
        <View style={[s.decorCircle, s.decorCircleLg, { borderColor: circleColor, bottom: 60, left: -50 }]} />
        <View style={[s.decorCircle, s.decorCircleSm, { backgroundColor: circleColorSoft, top: 40, right: 10 }]} />
      </View>
    )
  }

  // ── Slide 1: Welcome ──
  const renderWelcome = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      {renderProgressBar()}

      <View style={s.slideContent}>
        {renderCircles('welcome')}

        {/* Hero illustration area */}
        <View style={[s.heroArea, { backgroundColor: colors.warmTint }]}>
          <View style={[s.logoCircle, { backgroundColor: colors.foreground }]}>
            <TackBirdLogo size={48} color={colors.primaryForeground} />
          </View>
          {/* Floating decorative avatars */}
          <View style={s.floatingAvatars}>
            <View style={[s.floatingDot, { backgroundColor: colors.foreground, top: 20, right: 24 }]} />
            <View style={[s.floatingDot, s.floatingDotMd, { backgroundColor: colors.border, top: 50, right: 48 }]} />
            <View style={[s.floatingDot, s.floatingDotSm, { backgroundColor: colors.mutedForeground, bottom: 30, left: 28 }]} />
          </View>
        </View>

        {/* Copy */}
        <View style={s.copyArea}>
          <Text style={[s.headline, { color: colors.foreground, fontFamily: fonts.heading }]}>
            {t('onboarding.welcome')}
          </Text>
          <Text style={[s.bodyText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
            {t('onboarding.welcomeSubtitle')}
          </Text>
        </View>
      </View>

      {/* CTA */}
      <View style={[s.ctaArea, { paddingBottom: insets.bottom + 24 }]}>
        <PressableOpacity
          onPress={() => goToPage(1)}
          style={[s.ctaButton, { backgroundColor: colors.foreground }]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.next')}
        >
          <Text style={[s.ctaText, { color: colors.primaryForeground, fontFamily: fonts.bodySemi }]}>
            {t('onboarding.next')}
          </Text>
        </PressableOpacity>
      </View>
    </View>
  )

  // ── Slide 2: How it works ──
  const renderHowItWorks = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      {renderProgressBar()}

      <View style={s.slideContent}>
        {renderCircles('features')}

        {/* Hero illustration area */}
        <View style={[s.heroArea, { backgroundColor: colors.warmTint }]}>
          <View style={s.featureIconsRow}>
            <View style={[s.featureIconBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Handshake size={24} color={colors.foreground} />
            </View>
            <View style={[s.featureIconBubble, s.featureIconBubbleCenter, { backgroundColor: colors.foreground }]}>
              <Users size={24} color={colors.primaryForeground} />
            </View>
            <View style={[s.featureIconBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Gift size={24} color={colors.foreground} />
            </View>
          </View>
        </View>

        {/* Copy */}
        <View style={s.copyArea}>
          <Text style={[s.headline, { color: colors.foreground, fontFamily: fonts.heading }]}>
            {t('onboarding.howItWorks')}
          </Text>

          <View style={s.featureList}>
            <View style={s.featureRow}>
              <View style={[s.featureDot, { backgroundColor: colors.foreground }]} />
              <Text style={[s.featureText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                {t('onboarding.askHelp')}
              </Text>
            </View>
            <View style={s.featureRow}>
              <View style={[s.featureDot, { backgroundColor: colors.foreground }]} />
              <Text style={[s.featureText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                {t('onboarding.offerServices')}
              </Text>
            </View>
            <View style={s.featureRow}>
              <View style={[s.featureDot, { backgroundColor: colors.foreground }]} />
              <Text style={[s.featureText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                {t('onboarding.shareFree')}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* CTA */}
      <View style={[s.ctaArea, { paddingBottom: insets.bottom + 24 }]}>
        <PressableOpacity
          onPress={() => goToPage(2)}
          style={[s.ctaButton, { backgroundColor: colors.foreground }]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.next')}
        >
          <Text style={[s.ctaText, { color: colors.primaryForeground, fontFamily: fonts.bodySemi }]}>
            {t('onboarding.next')}
          </Text>
        </PressableOpacity>
      </View>
    </View>
  )

  // ── Slide 3: Trust & Safety ──
  const renderTrustSafety = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      {renderProgressBar()}

      <View style={s.slideContent}>
        {renderCircles('trust')}

        {/* Hero illustration area */}
        <View style={[s.heroArea, { backgroundColor: colors.warmTint }]}>
          <View style={[s.shieldCircle, { backgroundColor: colors.foreground }]}>
            <Shield size={36} color={colors.primaryForeground} />
          </View>
          {/* floating check marks */}
          <View style={[s.floatingCheck, { backgroundColor: colors.card, borderColor: colors.border, top: 28, right: 36 }]}>
            <CheckCircle size={16} color={colors.foreground} />
          </View>
          <View style={[s.floatingCheck, { backgroundColor: colors.card, borderColor: colors.border, bottom: 32, left: 40 }]}>
            <MessageCircle size={16} color={colors.foreground} />
          </View>
        </View>

        {/* Copy */}
        <View style={s.copyArea}>
          <Text style={[s.headline, { color: colors.foreground, fontFamily: fonts.heading }]}>
            {t('onboarding.trustSafety')}
          </Text>

          <View style={s.trustList}>
            <View style={s.trustItem}>
              <CheckCircle size={16} color={colors.foreground} />
              <Text style={[s.trustItemText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                {t('onboarding.verifiedProfiles')}
              </Text>
            </View>
            <View style={s.trustItem}>
              <CheckCircle size={16} color={colors.foreground} />
              <Text style={[s.trustItemText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                {t('onboarding.trustTiers')}
              </Text>
            </View>
            <View style={s.trustItem}>
              <CheckCircle size={16} color={colors.foreground} />
              <Text style={[s.trustItemText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                {t('onboarding.safeMessaging')}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* CTA */}
      <View style={[s.ctaArea, { paddingBottom: insets.bottom + 24 }]}>
        <PressableOpacity
          onPress={() => goToPage(3)}
          style={[s.ctaButton, { backgroundColor: colors.foreground }]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.next')}
        >
          <Text style={[s.ctaText, { color: colors.primaryForeground, fontFamily: fonts.bodySemi }]}>
            {t('onboarding.next')}
          </Text>
        </PressableOpacity>
      </View>
    </View>
  )

  // ── Slide 4: Purpose ──
  // Hide 'lainaa' when LENDING feature is disabled so users can't select
  // a purpose that leaves them with an empty feed.
  const PURPOSE_OPTIONS = [
    { key: 'tarvitsen', labelKey: 'onboarding.purposeTarvitsen', icon: Handshake, color: CATEGORIES.tarvitsen.color },
    { key: 'tarjoan', labelKey: 'onboarding.purposeTarjoan', icon: Gift, color: CATEGORIES.tarjoan.color },
    { key: 'ilmaista', labelKey: 'onboarding.purposeIlmaista', icon: Heart, color: CATEGORIES.ilmaista.color },
    ...(FEATURES.LENDING ? [{ key: 'lainaa', labelKey: 'onboarding.purposeLainaa', icon: BookOpen, color: CATEGORIES.lainaa.color }] : []),
    { key: 'tapahtuma', labelKey: 'onboarding.purposeTapahtuma', icon: CalendarDays, color: CATEGORIES.tapahtuma.color },
  ]

  const renderPurpose = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      {renderProgressBar()}

      <View style={s.slideContentPurpose}>
        {/* Copy */}
        <View style={s.copyAreaTop}>
          <Text style={[s.headline, { color: colors.foreground, fontFamily: fonts.heading }]}>
            {t('onboarding.purposeTitle')}
          </Text>
          <Text style={[s.bodyText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
            {t('onboarding.purposeSubtitle')}
          </Text>
        </View>

        {/* Purpose pills */}
        <View style={s.purposeGrid}>
          {PURPOSE_OPTIONS.map((opt) => {
            const isSelected = selectedPurposes.includes(opt.key)
            const IconComponent = opt.icon
            const label = t(opt.labelKey)
            return (
              <PressableOpacity
                key={opt.key}
                onPress={() => {
                  try { Haptics.selectionAsync() } catch {}
                  setSelectedPurposes((prev) =>
                    prev.includes(opt.key)
                      ? prev.filter((k) => k !== opt.key)
                      : [...prev, opt.key]
                  )
                }}
                style={[
                  s.purposePill,
                  {
                    backgroundColor: isSelected ? colors.foreground : colors.card,
                    borderColor: isSelected ? colors.foreground : colors.border,
                    borderWidth: 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={label}
              >
                <IconComponent
                  size={20}
                  color={isSelected ? colors.primaryForeground : colors.foreground}
                />
                <Text
                  style={[
                    s.purposePillText,
                    {
                      color: isSelected ? colors.primaryForeground : colors.foreground,
                      fontFamily: isSelected ? fonts.bodySemi : fonts.body,
                    },
                  ]}
                >
                  {label}
                </Text>
                {isSelected && <Check size={16} color={colors.primaryForeground} />}
              </PressableOpacity>
            )
          })}
        </View>
      </View>

      {/* CTA */}
      <View style={[s.ctaArea, { paddingBottom: insets.bottom + 24 }]}>
        <PressableOpacity
          onPress={async () => {
            if (selectedPurposes.length > 0) {
              await AsyncStorage.setItem('onboarding_purposes', JSON.stringify(selectedPurposes))
            }
            goToPage(4)
          }}
          style={[s.ctaButton, { backgroundColor: colors.foreground }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.next')}
        >
          <Text style={[s.ctaText, { color: colors.primaryForeground, fontFamily: fonts.bodySemi }]}>
            {t('common.next')}
          </Text>
        </PressableOpacity>
      </View>
    </View>
  )

  // ── Slide 5: Enter Your Address ──
  const renderAddress = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      {renderProgressBar()}

      <View style={s.slideContentNeighborhood}>
        {/* Back button */}
        <PressableOpacity
          onPress={() => goToPage(3)}
          style={s.backBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={18} color={colors.mutedForeground} />
          <Text style={[s.backBtnText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
            {t('common.back')}
          </Text>
        </PressableOpacity>

        {/* Title */}
        <Text style={[s.headline, { color: colors.foreground, fontFamily: fonts.heading, paddingHorizontal: 20 }]}>
          {t('onboarding.addressTitle')}
        </Text>

        <Text style={[s.neighborhoodSubtitle, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
          {t('onboarding.addressSubtitle')}
        </Text>

        <Text style={[s.neighborhoodExplainer, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
          {t('onboarding.addressExplainer')}
        </Text>

        {/* Address autocomplete */}
        <View style={s.addressInputRow}>
          <LocationAutocomplete
            value={addressText}
            onChangeText={setAddressText}
            onSelect={handleAddressSelect}
            placeholder={t('onboarding.addressPlaceholder')}
            showIcon
            accessibilityLabel={t('onboarding.addressPlaceholder')}
          />
        </View>

        {/* Selected address confirmation */}
        {selectedAddress && (
          <View style={[s.addressConfirmRow, {
            backgroundColor: `${colors.success}15`,
            borderColor: `${colors.success}30`,
          }]}>
            <CheckCircle size={16} color={colors.success} />
            <View style={s.addressConfirmText}>
              <Text style={[s.addressConfirmLabel, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
                {selectedAddress.street
                  ? (selectedAddress.housenumber
                      ? `${selectedAddress.street} ${selectedAddress.housenumber}`
                      : selectedAddress.street)
                  : selectedAddress.name}
              </Text>
              {selectedAddress.neighborhood && (
                <Text style={[s.addressConfirmDetail, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                  {selectedAddress.neighborhood}{selectedAddress.postalCode ? `, ${selectedAddress.postalCode}` : ''} {selectedAddress.city ?? 'Helsinki'}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Spacer to push referral to bottom */}
        <View style={{ flex: 1 }} />

        {/* Referral code input */}
        <View style={s.referralInputRow}>
          <TextInput
            value={referralInput}
            onChangeText={(text) => { setReferralInput(text); setReferralStatus('idle') }}
            placeholder={t('referral.codeInput')}
            placeholderTextColor={colors.tertiaryForeground}
            style={[s.searchInput, {
              backgroundColor: colors.muted,
              borderWidth: referralStatus !== 'idle' ? 1 : 0,
              borderColor: referralStatus === 'invalid' ? colors.destructive : referralStatus === 'applied' ? colors.success : 'transparent',
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
      </View>

      {/* CTA */}
      <View style={[s.ctaArea, { paddingBottom: insets.bottom + 24 }]}>
        <PressableOpacity
          onPress={handleComplete}
          disabled={saving || !selectedAddress}
          style={[
            s.ctaButton,
            {
              backgroundColor: selectedAddress ? colors.foreground : colors.muted,
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
                  s.ctaText,
                  {
                    color: selectedAddress ? colors.primaryForeground : colors.mutedForeground,
                    fontFamily: fonts.bodySemi,
                  },
                ]}
              >
                {t('onboarding.start')}
              </Text>
              {selectedAddress && <Check size={18} color={colors.primaryForeground} />}
            </>
          )}
        </PressableOpacity>
      </View>
    </View>
  )

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
        {renderPurpose()}
        {renderAddress()}
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

  // ── Progress bar row (mockup: horizontal bars + skip link) ──
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 8,
  },
  progressBarsContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  progressBar: {
    flex: 1,
    height: 3,
    borderRadius: 999,
  },
  skipPressable: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 12,
    fontWeight: '500',
    textDecorationLine: 'underline',
    letterSpacing: 0.1,
  },

  // ── Slide content (pages 1-3: hero + copy layout) ──
  slideContent: {
    flex: 1,
    paddingTop: 24,
  },
  slideContentPurpose: {
    flex: 1,
    paddingTop: 16,
  },
  slideContentNeighborhood: {
    flex: 1,
    paddingTop: 8,
  },

  // ── Decorative circles ──
  circlesContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 999,
  },
  decorCircleLg: {
    width: 160,
    height: 160,
    borderWidth: 1,
    opacity: 0.5,
  },
  decorCircleMd: {
    width: 80,
    height: 80,
    opacity: 0.3,
  },
  decorCircleSm: {
    width: 32,
    height: 32,
    opacity: 0.25,
  },

  // ── Hero illustration area ──
  heroArea: {
    marginHorizontal: 20,
    borderRadius: 24,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Floating decorative dots
  floatingAvatars: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  floatingDotMd: {
    width: 8,
    height: 8,
  },
  floatingDotSm: {
    width: 6,
    height: 6,
  },

  // Floating check marks (trust slide)
  floatingCheck: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // Feature icons row (how it works slide)
  featureIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  featureIconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  featureIconBubbleCenter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 0,
  },

  // ── Copy area ──
  copyArea: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 8,
  },
  copyAreaTop: {
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 24,
  },
  headline: {
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  bodyText: {
    fontSize: 13.5,
    lineHeight: 21,  // ~1.55x
    letterSpacing: 0,
  },
  bodyTextSmall: {
    fontSize: 14,
    lineHeight: 20,
  },

  // ── Feature list (how it works) ──
  featureList: {
    gap: 12,
    marginTop: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  featureText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },

  // ── Trust list ──
  trustList: {
    gap: 14,
    marginTop: 8,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  trustItemText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },

  // ── CTA area ──
  ctaArea: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    height: 54,
    minHeight: 54,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.1,
  },

  // ── Back button ──
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    minHeight: 44,
  },
  backBtnText: {
    fontSize: 14,
    lineHeight: 20,
  },

  // ── City picker ──
  cityRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  cityChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
  },
  cityChipText: {
    fontSize: 14,
    lineHeight: 20,
  },

  // ── Address input ──
  neighborhoodSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  neighborhoodExplainer: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  searchInput: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 48,
  },
  addressInputRow: {
    paddingHorizontal: 20,
    marginBottom: 12,
    zIndex: 10,
  },
  addressConfirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
  },
  addressConfirmText: {
    flex: 1,
    gap: 2,
  },
  addressConfirmLabel: {
    fontSize: 14,
    lineHeight: 20,
  },
  addressConfirmDetail: {
    fontSize: 12,
    lineHeight: 16,
  },

  // ── Referral code input ──
  referralInputRow: {
    paddingHorizontal: 20,
    marginBottom: 8,
    gap: 4,
  },
  referralFeedback: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
    paddingHorizontal: 4,
  },

  // ── Purpose ──
  purposeGrid: {
    gap: 10,
    paddingHorizontal: 24,
  },
  purposePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    minHeight: 52,
  },
  purposePillText: {
    fontSize: 15,
    flex: 1,
    lineHeight: 20,
  },
})

export default function OnboardingScreen() {
  return (
    <ScreenErrorBoundary screenName="Onboarding">
      <OnboardingScreenInner />
    </ScreenErrorBoundary>
  )
}
