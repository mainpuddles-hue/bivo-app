/**
 * OnboardingOverlay — 3-step first-time user onboarding
 * Step 1: Pick your neighborhood (mandatory)
 * Step 2: Pick your interests (optional)
 * Step 3: Push notification permission request
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { MapPin, Bell, Heart, Package, Calendar, Handshake, Gift } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { NEIGHBORHOODS } from '@/lib/constants'
import { useSupabase } from '@/hooks/useSupabase'
import { getCachedUserId } from '@/lib/authCache'

const STORAGE_KEY = 'bivo_onboarding_completed'

const INTEREST_OPTIONS = [
  { key: 'tarvitsen', icon: Heart, labelKey: 'onboarding.purposeTarvitsen' },
  { key: 'tarjoan', icon: Handshake, labelKey: 'onboarding.purposeTarjoan' },
  { key: 'ilmaista', icon: Gift, labelKey: 'onboarding.purposeIlmaista' },
  { key: 'lainaa', icon: Package, labelKey: 'onboarding.purposeLainaa' },
  { key: 'tapahtuma', icon: Calendar, labelKey: 'onboarding.purposeTapahtuma' },
] as const

interface Props {
  visible: boolean
  onDone: () => void
}

export function OnboardingOverlay({ visible, onDone }: Props) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const supabase = useSupabase()

  const [step, setStep] = useState(0)
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null)
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set())
  const fadeAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (visible) {
      setStep(0)
      setSelectedNeighborhood(null)
      setSelectedInterests(new Set())
      fadeAnim.setValue(1)
    }
  }, [visible, fadeAnim])

  const animateTransition = useCallback((next: number) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(next)
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    })
  }, [fadeAnim])

  const saveNeighborhood = useCallback(async (nh: string) => {
    try {
      const userId = await getCachedUserId()
      if (userId) {
        await (supabase.from('profiles') as any).update({ naapurusto: nh }).eq('id', userId)
      }
      await AsyncStorage.setItem('bivo_user_neighborhood', nh)
    } catch (err) {
      if (__DEV__) console.warn('[onboarding] saveNeighborhood failed:', err)
    }
  }, [supabase])

  const finishOnboarding = useCallback(() => {
    AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => {})
    // Also set the layout-level key so _layout.tsx won't redirect to old onboarding
    AsyncStorage.setItem('onboarding_complete', 'true').catch(() => {})
    onDone()
  }, [onDone])

  const handleNeighborhoodNext = useCallback(() => {
    if (!selectedNeighborhood) return
    saveNeighborhood(selectedNeighborhood)
    animateTransition(1)
  }, [selectedNeighborhood, saveNeighborhood, animateTransition])

  const handleInterestsNext = useCallback(() => {
    // Save interests to AsyncStorage for feed personalization
    if (selectedInterests.size > 0) {
      AsyncStorage.setItem('onboarding_purposes', JSON.stringify([...selectedInterests])).catch(() => {})
    }
    animateTransition(2)
  }, [selectedInterests, animateTransition])

  const toggleInterest = useCallback((key: string) => {
    setSelectedInterests(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Step dots
  const Dots = () => (
    <View style={styles.dots}>
      {[0, 1, 2].map(i => (
        <View
          key={i}
          style={[styles.dot, {
            backgroundColor: i === step ? colors.foreground : `${colors.foreground}30`,
            width: i === step ? 20 : 8,
          }]}
        />
      ))}
    </View>
  )

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={finishOnboarding}>
      <View style={styles.backdrop}>
        {/* Skip */}
        <Pressable onPress={finishOnboarding} style={styles.skipBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('onboarding.skip')}>
          <Text style={[styles.skipText, { color: colors.primaryForeground }]}>{t('onboarding.skip')}</Text>
        </Pressable>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Animated.View style={[styles.cardContent, { opacity: fadeAnim }]}>
            {/* ── Step 1: Neighborhood ── */}
            {step === 0 && (
              <>
                <View style={[styles.iconWrap, { backgroundColor: `${colors.foreground}0F` }]}>
                  <MapPin size={48} color={colors.foreground} strokeWidth={1.5} />
                </View>
                <Text style={[styles.title, { color: colors.foreground }]}>
                  {t('onboarding.pickNeighborhood')}
                </Text>
                <Text style={[styles.desc, { color: colors.mutedForeground }]}>
                  {t('onboarding.pickNeighborhoodHint')}
                </Text>
                <ScrollView style={styles.neighborhoodList} contentContainerStyle={styles.neighborhoodListContent} showsVerticalScrollIndicator={false}>
                  {NEIGHBORHOODS.map(nh => (
                    <Pressable
                      key={nh}
                      onPress={() => setSelectedNeighborhood(nh)}
                      style={[
                        styles.neighborhoodItem,
                        {
                          backgroundColor: selectedNeighborhood === nh ? colors.foreground : `${colors.foreground}08`,
                          borderColor: selectedNeighborhood === nh ? colors.foreground : colors.border,
                        },
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selectedNeighborhood === nh }}
                    >
                      <Text style={[
                        styles.neighborhoodText,
                        { color: selectedNeighborhood === nh ? colors.primaryForeground : colors.foreground },
                      ]}>
                        {nh}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Dots />
                <Pressable
                  onPress={handleNeighborhoodNext}
                  disabled={!selectedNeighborhood}
                  style={[styles.btn, { backgroundColor: selectedNeighborhood ? colors.foreground : `${colors.foreground}30` }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
                    {t('onboarding.continue') ?? 'Jatka'}
                  </Text>
                </Pressable>
              </>
            )}

            {/* ── Step 2: Interests ── */}
            {step === 1 && (
              <>
                <View style={[styles.iconWrap, { backgroundColor: `${colors.foreground}0F` }]}>
                  <Heart size={48} color={colors.foreground} strokeWidth={1.5} />
                </View>
                <Text style={[styles.title, { color: colors.foreground }]}>
                  {t('onboarding.interests')}
                </Text>
                <Text style={[styles.desc, { color: colors.mutedForeground }]}>
                  {t('onboarding.purposeSubtitle')}
                </Text>
                <View style={styles.interestsGrid}>
                  {INTEREST_OPTIONS.map(opt => {
                    const isSelected = selectedInterests.has(opt.key)
                    const Icon = opt.icon
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => toggleInterest(opt.key)}
                        style={[
                          styles.interestChip,
                          {
                            backgroundColor: isSelected ? colors.foreground : `${colors.foreground}08`,
                            borderColor: isSelected ? colors.foreground : colors.border,
                          },
                        ]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSelected }}
                      >
                        <Icon size={16} color={isSelected ? colors.primaryForeground : colors.foreground} strokeWidth={2} />
                        <Text style={[styles.interestText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>
                          {t(opt.labelKey)}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
                <Dots />
                <Pressable
                  onPress={handleInterestsNext}
                  style={[styles.btn, { backgroundColor: colors.foreground }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
                    {selectedInterests.size > 0 ? (t('onboarding.continue') ?? 'Jatka') : (t('onboarding.skip') ?? 'Ohita')}
                  </Text>
                </Pressable>
              </>
            )}

            {/* ── Step 3: Push notifications ── */}
            {step === 2 && (
              <>
                <View style={[styles.iconWrap, { backgroundColor: `${colors.foreground}0F` }]}>
                  <Bell size={48} color={colors.foreground} strokeWidth={1.5} />
                </View>
                <Text style={[styles.title, { color: colors.foreground }]}>
                  {t('onboarding.pushPromptTitle')}
                </Text>
                <Text style={[styles.desc, { color: colors.mutedForeground }]}>
                  {t('onboarding.pushPromptDesc')}
                </Text>
                <Dots />
                <Pressable
                  onPress={finishOnboarding}
                  style={[styles.btn, { backgroundColor: colors.foreground }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
                    {t('onboarding.enableNotifications')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={finishOnboarding}
                  style={styles.secondaryBtn}
                  accessibilityRole="button"
                >
                  <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>
                    {t('onboarding.maybeLater')}
                  </Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  skipBtn: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  skipText: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    opacity: 0.85,
  },
  card: {
    width: '100%',
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 28,
    alignItems: 'center',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  cardContent: {
    alignItems: 'center',
    width: '100%',
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.heading,
    fontWeight: '600',
    letterSpacing: -0.4,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 8,
  },
  desc: {
    fontSize: 15,
    fontFamily: fonts.body,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  btn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  btnText: {
    fontSize: 16,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    lineHeight: 22,
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
  },

  // ── Neighborhood list ──
  neighborhoodList: {
    maxHeight: 200,
    width: '100%',
    marginBottom: 16,
  },
  neighborhoodListContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  neighborhoodItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  neighborhoodText: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    lineHeight: 18,
  },

  // ── Interest chips ──
  interestsGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  interestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  interestText: {
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    lineHeight: 18,
  },
})
