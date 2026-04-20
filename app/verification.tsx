declare const __DEV__: boolean

import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Shield, Check, Plus, ChevronLeft } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { useSupabase } from '@/hooks/useSupabase'
import { getCachedUserId } from '@/lib/authCache'

// ── Types ──

interface VerificationProfile {
  id: string
  name: string | null
  phone_verified: boolean | null
  naapurusto: string | null
  avatar_url: string | null
  id_verified: boolean | null
}

interface VerificationStep {
  key: string
  title: string
  subtitle: string
  done: boolean
}

// ── Inner screen ──

function VerificationScreenInner() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const supabase = useSupabase()

  const [profile, setProfile] = useState<VerificationProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async () => {
    try {
      const userId = await getCachedUserId()
      if (!userId) return

      const { data } = await supabase
        .from('profiles')
        .select('id, name, phone_verified, naapurusto, avatar_url, id_verified')
        .eq('id', userId)
        .single()

      if (data) setProfile(data as VerificationProfile)
    } catch (e) {
      if (__DEV__) console.warn('[Verification] fetch error', e)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  // Build verification steps
  const steps: VerificationStep[] = [
    {
      key: 'identity',
      title: 'Henkilöllisyys',
      subtitle: 'Passi tai ajokortti',
      done: profile?.id_verified === true,
    },
    {
      key: 'phone',
      title: 'Puhelinnumero',
      subtitle: profile?.phone_verified ? '+358 40 ***1234' : '+358 40 ***1234',
      done: profile?.phone_verified === true,
    },
    {
      key: 'address',
      title: 'Osoite',
      subtitle: profile?.naapurusto || 'Naapurusto',
      done: !!profile?.naapurusto,
    },
    {
      key: 'photo',
      title: 'Kasvokuva',
      subtitle: 'Suositus — näkyy profiilissa',
      done: !!profile?.avatar_url,
    },
  ]

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <PressableOpacity
          style={[s.headerBackBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => router.back()}
          accessibilityLabel="Takaisin"
          accessibilityRole="button"
        >
          <ChevronLeft size={18} color={colors.foreground} strokeWidth={2} />
        </PressableOpacity>

        <Text style={[s.headerTitle, { color: colors.foreground }]}>Vahvistukset</Text>

        {/* Spacer to balance the back button */}
        <View style={s.headerSpacer} />
      </View>

      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero section ── */}
          <View style={s.heroSection}>
            <View style={[s.heroCircle, { backgroundColor: colors.foreground }]}>
              <Shield size={28} color={colors.primaryForeground} strokeWidth={1.8} />
            </View>

            <Text style={[s.heroTitle, { color: colors.foreground }]}>
              Vahvistettu naapuri
            </Text>

            <Text style={[s.heroDescription, { color: colors.mutedForeground }]}>
              Vahvistukset tekevät yhteisöstä turvallisen. Lainojen toiminta parantuu.
            </Text>
          </View>

          {/* ── Verification steps ── */}
          <View style={s.stepsContainer}>
            {steps.map((step) => (
              <View
                key={step.key}
                style={[s.stepCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                {/* Left circle */}
                <View
                  style={[
                    s.stepCircle,
                    {
                      backgroundColor: step.done ? colors.foreground : colors.background,
                    },
                  ]}
                >
                  {step.done ? (
                    <Check size={16} color={colors.primaryForeground} strokeWidth={2.5} />
                  ) : (
                    <Plus size={16} color={colors.foreground} strokeWidth={2} />
                  )}
                </View>

                {/* Text */}
                <View style={s.stepTextContainer}>
                  <Text style={[s.stepTitle, { color: colors.foreground }]}>
                    {step.title}
                  </Text>
                  <Text style={[s.stepSubtitle, { color: colors.mutedForeground }]}>
                    {step.subtitle}
                  </Text>
                </View>

                {/* Right action */}
                {step.done ? (
                  <Text style={[s.stepDoneLabel, { color: colors.foreground }]}>VALMIS</Text>
                ) : (
                  <PressableOpacity
                    style={[s.stepActionPill, { backgroundColor: colors.foreground }]}
                    accessibilityLabel={`Tee ${step.title}`}
                    accessibilityRole="button"
                  >
                    <Text style={[s.stepActionText, { color: colors.primaryForeground }]}>
                      Tee nyt
                    </Text>
                  </PressableOpacity>
                )}
              </View>
            ))}
          </View>

          {/* ── Footer privacy note ── */}
          <Text style={[s.footerNote, { color: colors.mutedForeground }]}>
            Tiedot säilytetään salattuna. TackBird ei jaa niitä kolmansille osapuolille.
          </Text>
        </ScrollView>
      )}
    </View>
  )
}

// ── Exported screen with error boundary ──

export default function VerificationScreen() {
  return (
    <ScreenErrorBoundary screenName="Verification">
      <VerificationScreenInner />
    </ScreenErrorBoundary>
  )
}

// ── Styles ──

const s = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: -0.15,
  },
  headerSpacer: {
    width: 36,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: 16,
  },

  // Hero
  heroSection: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 28,
  },
  heroCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 19,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    letterSpacing: -0.3,
    lineHeight: 25,
    marginBottom: 8,
  },
  heroDescription: {
    fontSize: 12.5,
    fontFamily: fonts.body,
    lineHeight: 12.5 * 1.5,
    textAlign: 'center',
    maxWidth: 240,
  },

  // Steps
  stepsContainer: {
    gap: 8,
    marginBottom: 24,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTextContainer: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 13.5,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    lineHeight: 18,
  },
  stepSubtitle: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 15,
    marginTop: 1,
  },
  stepDoneLabel: {
    fontSize: 10.5,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  stepActionPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  stepActionText: {
    fontSize: 11.5,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
  },

  // Footer
  footerNote: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 11 * 1.4,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
})
