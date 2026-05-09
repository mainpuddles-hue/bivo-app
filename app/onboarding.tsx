import { useState, useCallback, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  Check,
  CheckCircle,
  Shield,
  Handshake,
  Gift,
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
import { fonts, typeScale } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { useReferral } from '@/hooks/useReferral'
import { useCooperativeInvite, type CoopInviteResult } from '@/hooks/useCooperativeInvite'
import { trackEvent } from '@/lib/analytics'

const TOTAL_STEPS = 3

function OnboardingScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()
  const scrollRef = useRef<ScrollView>(null)
  const { width: SCREEN_WIDTH } = useWindowDimensions()

  const [currentStep, setCurrentStep] = useState(0)
  const [selectedCity, setSelectedCity] = useState('helsinki')
  const [saving, setSaving] = useState(false)
  const [referralInput, setReferralInput] = useState('')
  const [referralStatus, setReferralStatus] = useState<'idle' | 'applied' | 'invalid'>('idle')
  const [coopInput, setCoopInput] = useState('')
  const [coopStatus, setCoopStatus] = useState<'idle' | 'applied' | 'invalid' | 'expired' | 'exhausted'>('idle')
  const [coopOrgName, setCoopOrgName] = useState<string | null>(null)
  const [onboardingUserId, setOnboardingUserId] = useState<string | null>(null)
  // Address-based onboarding state
  const [addressText, setAddressText] = useState('')
  const [selectedAddress, setSelectedAddress] = useState<LocationResult | null>(null)
  const { applyInviteCode } = useReferral(onboardingUserId)
  const { applyCode: applyCoopCode, validateCode: validateCoopCode } = useCooperativeInvite()

  // Fetch user ID for referral system
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setOnboardingUserId(user.id)
    }).catch((e) => { if (__DEV__) console.warn('Onboarding user sync failed:', e) })
  }, [supabase])

  // Handle address selection from LocationAutocomplete
  const handleAddressSelect = useCallback((location: LocationResult) => {
    setSelectedAddress(location)
    try { Haptics.selectionAsync() } catch {}
  }, [])

  const goToStep = useCallback((step: number) => {
    scrollRef.current?.scrollTo({ x: step * SCREEN_WIDTH, animated: true })
    setCurrentStep(step)
    trackEvent('onboarding_slide', { slide: step })
  }, [SCREEN_WIDTH])

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const step = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
    if (step >= 0 && step < TOTAL_STEPS) {
      setCurrentStep(step)
    }
  }, [SCREEN_WIDTH])

  const handleComplete = useCallback(async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        toast.show({ message: t('auth.loginRequired'), type: 'error' })
        router.replace('/(auth)/login')
        return
      }

      // Apply referral code FIRST (before profile update) — if invalid, user can retry
      if (referralInput.trim()) {
        trackEvent('onboarding_invite_code', { hasCode: true })
        const result = await applyInviteCode(referralInput.trim())
        setReferralStatus(result === 'success' ? 'applied' : 'invalid')
        if (result !== 'success') {
          setSaving(false)
          return
        }
      }

      // Apply cooperative (taloyhtiö) code if provided
      if (coopInput.trim()) {
        trackEvent('onboarding_coop_code', { hasCode: true })
        const coopResult: CoopInviteResult = await applyCoopCode(coopInput.trim(), user.id)
        if (coopResult === 'success' || coopResult === 'already_member') {
          setCoopStatus('applied')
        } else if (coopResult === 'expired') {
          setCoopStatus('expired')
          setSaving(false)
          return
        } else if (coopResult === 'exhausted') {
          setCoopStatus('exhausted')
          setSaving(false)
          return
        } else {
          setCoopStatus('invalid')
          setSaving(false)
          return
        }
      }

      // Build street address from Photon result. When the user skipped address
      // entry (selectedAddress is null) we mark onboarding complete with no
      // address payload — the RPC is bypassed and only the boolean flag is
      // persisted. This is the "ohita testaus" escape hatch.
      const streetAddress = selectedAddress
        ? (selectedAddress.street
            ? (selectedAddress.housenumber
                ? `${selectedAddress.street} ${selectedAddress.housenumber}`
                : selectedAddress.street)
            : (selectedAddress.name || t('onboarding.unknownAddress')))
        : null

      if (selectedAddress) {
        // Resolve building — atomically creates or finds building + links user.
        // Tolerates missing RPC: in pivoted schemas the building infra may not be
        // present, in which case onboarding still completes without the building link.
        const { error: rpcError } = await (supabase as any).rpc('resolve_building', {
          p_street_address: streetAddress,
          p_postal_code: selectedAddress.postalCode ?? null,
          p_city: selectedAddress.city ?? 'Helsinki',
          p_neighborhood: selectedAddress.neighborhood ?? null,
          p_lat: selectedAddress.lat,
          p_lng: selectedAddress.lng,
        })

        // The building link is best-effort — when the RPC is absent (live schema
        // pivoted away from buildings), onboarding still completes. We only treat
        // truly unexpected RPC failures as fatal.
        const rpcMissing =
          !!rpcError && (
            (rpcError as any).code === '42883' ||
            (rpcError as any).code === 'PGRST202' ||
            /function .* does not exist/i.test(rpcError.message ?? '') ||
            /Could not find the function .* in the schema cache/i.test(rpcError.message ?? '')
          )
        if (rpcError && !rpcMissing) {
          if (__DEV__) console.warn('[onboarding] resolve_building failed:', rpcError.message)
          toast.show({ message: t('onboarding.saveFailed'), type: 'error' })
          setSaving(false)
          return
        } else if (rpcMissing && __DEV__) {
          console.warn('[onboarding] resolve_building RPC missing — skipping building link')
        }
      } else if (__DEV__) {
        console.warn('[onboarding] address skipped — completing without building link')
      }

      // Update profile: mark onboarding complete + save neighborhood when present.
      // Try the full update first; if it fails because of a missing column, retry
      // with a smaller payload so onboarding never gets permanently stuck.
      const fullUpdate: Record<string, any> = {
        onboarding_completed: true,
      }
      if (selectedAddress) {
        fullUpdate.naapurusto = selectedAddress.neighborhood ?? selectedAddress.city ?? 'Helsinki'
        fullUpdate.city_id = selectedCity
      }
      let updateError: any = null
      const fullRes = await (supabase.from('profiles') as any).update(fullUpdate).eq('id', user.id)
      updateError = fullRes.error
      if (updateError && ((updateError as any).code === 'PGRST204' || /column .* does not exist/i.test(updateError.message ?? ''))) {
        if (__DEV__) console.warn('[onboarding] some profile columns missing, retrying minimal update:', updateError.message)
        // Drop city_id and naapurusto if the live schema doesn't have them
        const minimalUpdate: Record<string, any> = { onboarding_completed: true }
        if (selectedAddress && (selectedAddress.neighborhood || selectedAddress.city)) {
          minimalUpdate.naapurusto = selectedAddress.neighborhood ?? selectedAddress.city ?? 'Helsinki'
        }
        const retryRes = await (supabase.from('profiles') as any).update(minimalUpdate).eq('id', user.id)
        updateError = retryRes.error
        if (updateError && /column "naapurusto" does not exist/i.test(updateError.message ?? '')) {
          // Last resort: only the boolean flag
          const flagOnly = await (supabase.from('profiles') as any).update({ onboarding_completed: true }).eq('id', user.id)
          updateError = flagOnly.error
        }
      }
      if (updateError) {
        if (__DEV__) console.warn('[onboarding] profile update failed:', updateError.message)
        toast.show({ message: t('onboarding.saveFailed'), type: 'error' })
        setSaving(false)
        return
      }

      // Mark onboarding complete locally
      await AsyncStorage.setItem('onboarding_complete', 'true')
      trackEvent('onboarding_completed', {
        city: selectedAddress?.city ?? selectedCity ?? null,
        neighborhood: selectedAddress?.neighborhood ?? null,
        address: streetAddress,
        skipped_address: !selectedAddress,
      })
      router.replace('/')
    } catch (err) {
      toast.show({ message: t('onboarding.saveFailed'), type: 'error' })
    } finally {
      setSaving(false)
    }
  }, [supabase, selectedAddress, selectedCity, referralInput, coopInput, router, t, toast, applyInviteCode, applyCoopCode])

  // Skip handler — jumps to last step (address/neighborhood)
  const handleSkip = useCallback(() => {
    goToStep(TOTAL_STEPS - 1)
  }, [goToStep])

  // ── Progress dots (3 dots, active = filled) ──
  const renderProgressDots = (showSkip: boolean) => (
    <View style={[s.topRow, { paddingTop: insets.top + 16 }]}>
      <View style={s.dotsContainer}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            style={[
              s.dot,
              {
                backgroundColor: i <= currentStep ? colors.foreground : colors.border,
              },
            ]}
          />
        ))}
      </View>
      {showSkip && (
        <PressableOpacity
          onPress={handleSkip}
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

  // ── Step 1: Tervetuloa (Welcome) ──
  const renderWelcome = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      {renderProgressDots(true)}

      <View style={s.slideContent}>
        {/* Illustration slot */}
        <View style={[s.illustrationSlot, { backgroundColor: colors.warmTint }]}>
          <View style={[s.logoCircle, { backgroundColor: colors.foreground }]}>
            <TackBirdLogo size={48} color={colors.primaryForeground} />
          </View>
          {/* Floating decorative dots */}
          <View style={s.floatingAvatars}>
            <View style={[s.floatingDot, { backgroundColor: colors.foreground, top: 20, right: 24 }]} />
            <View style={[s.floatingDot, s.floatingDotMd, { backgroundColor: colors.border, top: 50, right: 48 }]} />
            <View style={[s.floatingDot, s.floatingDotSm, { backgroundColor: colors.mutedForeground, bottom: 30, left: 28 }]} />
          </View>
        </View>

        {/* Title + description */}
        <View style={s.textBlock}>
          <Text
            style={[s.stepTitle, { color: colors.foreground, fontFamily: fonts.displayBold }]}
            accessibilityRole="header"
          >
            {t('onboarding.welcome')}
          </Text>
          <Text
            style={[s.stepDescription, { color: colors.mutedForeground, fontFamily: fonts.body }]}
            numberOfLines={3}
          >
            {t('onboarding.welcomeSubtitle')}
          </Text>
        </View>
      </View>

      {/* Sticky primary CTA */}
      <View style={[s.ctaArea, { paddingBottom: insets.bottom + 24 }]}>
        <PressableOpacity
          onPress={() => goToStep(1)}
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

  // ── Step 2: Naapurusto (Neighborhood / Address) ──
  const renderNeighborhood = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      {renderProgressDots(false)}

      <View style={s.slideContentAddress}>
        {/* Title + description */}
        <View style={s.textBlockTop}>
          <Text
            style={[s.stepTitle, { color: colors.foreground, fontFamily: fonts.displayBold }]}
            accessibilityRole="header"
          >
            {t('onboarding.addressTitle')}
          </Text>
          <Text
            style={[s.stepDescription, { color: colors.mutedForeground, fontFamily: fonts.body }]}
            numberOfLines={3}
          >
            {t('onboarding.addressSubtitle')}
          </Text>
        </View>

        <Text style={[s.addressExplainer, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
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

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Referral code input */}
        <View style={s.referralInputRow}>
          <TextInput
            value={referralInput}
            onChangeText={(text) => { setReferralInput(text); setReferralStatus('idle') }}
            placeholder={t('referral.codeInput')}
            placeholderTextColor={colors.tertiaryForeground}
            accessibilityLabel={t('referral.codeInput')}
            style={[s.referralInput, {
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

        {/* Cooperative (taloyhtiö) invite code */}
        <View style={s.referralInputRow}>
          <TextInput
            value={coopInput}
            onChangeText={(text) => { setCoopInput(text); setCoopStatus('idle'); setCoopOrgName(null) }}
            onBlur={async () => {
              if (coopInput.trim().length >= 4) {
                const info = await validateCoopCode(coopInput.trim())
                if (info) setCoopOrgName(info.org_name)
              }
            }}
            placeholder={t('cooperativeInvite.codeInput')}
            placeholderTextColor={colors.tertiaryForeground}
            accessibilityLabel={t('cooperativeInvite.codeInput')}
            style={[s.referralInput, {
              backgroundColor: colors.muted,
              borderWidth: coopStatus !== 'idle' ? 1 : 0,
              borderColor: coopStatus === 'applied' ? colors.success : coopStatus !== 'idle' ? colors.destructive : 'transparent',
              color: colors.foreground,
              fontFamily: fonts.body,
            }]}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
          />
          {coopOrgName && coopStatus === 'idle' && (
            <Text style={[s.referralFeedback, { color: colors.success, fontFamily: fonts.body }]}>
              {coopOrgName}
            </Text>
          )}
          {coopStatus === 'applied' && (
            <Text style={[s.referralFeedback, { color: colors.success, fontFamily: fonts.body }]}>
              {t('cooperativeInvite.codeApplied')}
            </Text>
          )}
          {coopStatus === 'invalid' && (
            <Text style={[s.referralFeedback, { color: colors.destructive, fontFamily: fonts.body }]}>
              {t('cooperativeInvite.invalidCode')}
            </Text>
          )}
          {coopStatus === 'expired' && (
            <Text style={[s.referralFeedback, { color: colors.destructive, fontFamily: fonts.body }]}>
              {t('cooperativeInvite.expiredCode')}
            </Text>
          )}
          {coopStatus === 'exhausted' && (
            <Text style={[s.referralFeedback, { color: colors.destructive, fontFamily: fonts.body }]}>
              {t('cooperativeInvite.exhaustedCode')}
            </Text>
          )}
        </View>
      </View>

      {/* Sticky primary CTA — always enabled visually, disabled only while saving */}
      <View style={[s.ctaArea, { paddingBottom: insets.bottom + 24 }]}>
        <PressableOpacity
          onPress={() => {
            if (selectedAddress) {
              goToStep(2)
            } else {
              try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning) } catch {}
              toast.show({ message: t('onboarding.addressRequired') ?? 'Please select your address', type: 'error' })
            }
          }}
          style={[s.ctaButton, { backgroundColor: colors.foreground }]}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.next')}
        >
          <Text style={[s.ctaText, { color: colors.primaryForeground, fontFamily: fonts.bodySemi }]}>
            {t('onboarding.next')}
          </Text>
        </PressableOpacity>
        {/* Temporary testing escape hatch — proceed without picking an address. */}
        <PressableOpacity
          onPress={() => goToStep(2)}
          style={{ paddingVertical: 12, alignItems: 'center', marginTop: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Ohita osoite"
        >
          <Text style={{ color: colors.mutedForeground, fontFamily: fonts.body, fontSize: 14, textDecorationLine: 'underline' }}>
            Ohita toistaiseksi
          </Text>
        </PressableOpacity>
      </View>
    </View>
  )

  // ── Step 3: Trust & Safety ──
  const renderTrust = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      {renderProgressDots(false)}

      <View style={s.slideContent}>
        {/* Illustration slot */}
        <View style={[s.illustrationSlot, { backgroundColor: colors.warmTint }]}>
          <View style={[s.shieldCircle, { backgroundColor: colors.foreground }]}>
            <Shield size={36} color={colors.primaryForeground} />
          </View>
          {/* Floating check marks */}
          <View style={[s.floatingCheck, { backgroundColor: colors.card, borderColor: colors.border, top: 28, right: 36 }]}>
            <CheckCircle size={16} color={colors.foreground} />
          </View>
          <View style={[s.floatingCheck, { backgroundColor: colors.card, borderColor: colors.border, bottom: 32, left: 40 }]}>
            <MessageCircle size={16} color={colors.foreground} />
          </View>
        </View>

        {/* Title + description */}
        <View style={s.textBlock}>
          <Text
            style={[s.stepTitle, { color: colors.foreground, fontFamily: fonts.displayBold }]}
            accessibilityRole="header"
          >
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

      {/* Sticky primary CTA — always enabled, triggers handleComplete */}
      <View style={[s.ctaArea, { paddingBottom: insets.bottom + 24 }]}>
        <PressableOpacity
          onPress={handleComplete}
          disabled={saving}
          style={[
            s.ctaButton,
            {
              backgroundColor: colors.foreground,
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
                style={[s.ctaText, { color: colors.primaryForeground, fontFamily: fonts.bodySemi }]}
              >
                {t('onboarding.start')}
              </Text>
              <Check size={18} color={colors.primaryForeground} />
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
        {renderNeighborhood()}
        {renderTrust()}
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

  // ── Top row: dots + skip ──
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  skipPressable: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
  },

  // ── Slide content (steps 1 & 3: illustration + text) ──
  slideContent: {
    flex: 1,
    paddingTop: 24,
  },
  slideContentAddress: {
    flex: 1,
    paddingTop: 16,
  },

  // ── Illustration slot ──
  illustrationSlot: {
    marginHorizontal: 24,
    borderRadius: 20,
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

  // Floating check marks (trust step)
  floatingCheck: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // ── Text block (title + description) ──
  textBlock: {
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 8,
    alignItems: 'center',
  },
  textBlockTop: {
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 8,
  },
  stepTitle: {
    ...typeScale.display,
    fontWeight: '700',
    fontFamily: fonts.displayBold,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  stepDescription: {
    ...typeScale.bodyLarge,
    textAlign: 'center',
    lineHeight: 24,
  },

  // ── Address step specifics ──
  addressExplainer: {
    ...typeScale.bodySmall,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  addressInputRow: {
    paddingHorizontal: 24,
    marginBottom: 12,
    zIndex: 10,
  },
  addressConfirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 24,
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
    ...typeScale.body,
  },
  addressConfirmDetail: {
    ...typeScale.caption,
  },

  // ── Referral code input ──
  referralInputRow: {
    paddingHorizontal: 24,
    marginBottom: 8,
    gap: 4,
  },
  referralInput: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...typeScale.body,
    minHeight: 48,
  },
  referralFeedback: {
    ...typeScale.caption,
    marginTop: 4,
    paddingHorizontal: 4,
  },

  // ── Trust list ──
  trustList: {
    gap: 14,
    marginTop: 8,
    alignSelf: 'stretch',
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  trustItemText: {
    ...typeScale.body,
    flex: 1,
  },

  // ── CTA area (sticky at bottom) ──
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
    height: 52,
    minHeight: 52,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.1,
  },
})

export default function OnboardingScreen() {
  return (
    <ScreenErrorBoundary screenName="Onboarding">
      <OnboardingScreenInner />
    </ScreenErrorBoundary>
  )
}
