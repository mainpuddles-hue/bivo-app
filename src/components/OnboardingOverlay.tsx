/**
 * OnboardingOverlay — 3-step first-time user tutorial
 * Shown once on first launch after login. Stored in AsyncStorage.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { MapPin, PlusSquare, MessageCircle } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'

const STORAGE_KEY = 'tackbird_onboarding_completed'
const TOTAL_STEPS = 3

interface Step {
  iconKey: 'browse' | 'share' | 'message'
  titleKey: string
  descKey: string
}

const STEPS: Step[] = [
  { iconKey: 'browse', titleKey: 'onboarding.step1Title', descKey: 'onboarding.step1Desc' },
  { iconKey: 'share',  titleKey: 'onboarding.step2Title', descKey: 'onboarding.step2Desc' },
  { iconKey: 'message', titleKey: 'onboarding.step3Title', descKey: 'onboarding.step3Desc' },
]

interface Props {
  visible: boolean
  onDone: () => void
}

export function OnboardingOverlay({ visible, onDone }: Props) {
  const { colors } = useTheme()
  const { t } = useI18n()

  const [step, setStep] = useState(0)
  const fadeAnim = useRef(new Animated.Value(1)).current

  // Reset to step 0 each time the overlay becomes visible
  useEffect(() => {
    if (visible) {
      setStep(0)
      fadeAnim.setValue(1)
    }
  }, [visible, fadeAnim])

  const goToStep = useCallback(
    (next: number) => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(() => {
        setStep(next)
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }).start()
      })
    },
    [fadeAnim],
  )

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) {
      goToStep(step + 1)
    } else {
      handleDone()
    }
  }, [step, goToStep])

  const handleDone = useCallback(() => {
    AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => {})
    onDone()
  }, [onDone])

  const currentStep = STEPS[step]
  const isLastStep = step === TOTAL_STEPS - 1

  function StepIcon({ iconKey }: { iconKey: Step['iconKey'] }) {
    const iconColor = colors.foreground
    if (iconKey === 'browse') return <MapPin size={48} color={iconColor} strokeWidth={1.5} />
    if (iconKey === 'share')  return <PlusSquare size={48} color={iconColor} strokeWidth={1.5} />
    return <MessageCircle size={48} color={iconColor} strokeWidth={1.5} />
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDone}
    >
      <View style={styles.backdrop}>
        {/* Skip link */}
        <Pressable
          onPress={handleDone}
          style={styles.skipBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.skip')}
        >
          <Text style={[styles.skipText, { color: colors.primaryForeground }]}>
            {t('onboarding.skip')}
          </Text>
        </Pressable>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Animated.View style={[styles.cardContent, { opacity: fadeAnim }]}>
            {/* Icon */}
            <View style={[styles.iconWrap, { backgroundColor: `${colors.foreground}0F` }]}>
              <StepIcon iconKey={currentStep.iconKey} />
            </View>

            {/* Title */}
            <Text style={[styles.title, { color: colors.foreground }]}>
              {t(currentStep.titleKey)}
            </Text>

            {/* Description */}
            <Text style={[styles.desc, { color: colors.mutedForeground }]}>
              {t(currentStep.descKey)}
            </Text>
          </Animated.View>

          {/* Step dots */}
          <View style={styles.dots}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      i === step ? colors.foreground : `${colors.foreground}30`,
                    width: i === step ? 20 : 8,
                  },
                ]}
              />
            ))}
          </View>

          {/* CTA button */}
          <Pressable
            onPress={handleNext}
            style={[styles.btn, { backgroundColor: colors.foreground }]}
            accessibilityRole="button"
            accessibilityLabel={
              isLastStep ? t('onboarding.letsGo') : t('onboarding.next')
            }
          >
            <Text style={[styles.btnText, { color: colors.primaryForeground }]}>
              {isLastStep ? t('onboarding.letsGo') : t('onboarding.next')}
            </Text>
          </Pressable>
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
    fontFamily: 'InstrumentSans_500Medium',
    opacity: 0.85,
  },
  card: {
    width: '100%',
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 0,
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
    marginBottom: 12,
  },
  desc: {
    fontSize: 15,
    fontFamily: fonts.body,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
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
})
