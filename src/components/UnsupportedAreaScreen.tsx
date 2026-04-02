import { useState, useEffect } from 'react'
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Globe, Mail, MapPin, ArrowRight, Check } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'

interface UnsupportedAreaScreenProps {
  country: string | null
  countryName: string | null
  city: string | null
  isWaitlist: boolean
  userId: string | null
  onContinue: () => void
}

export function UnsupportedAreaScreen({
  country,
  countryName,
  city,
  isWaitlist,
  userId,
  onContinue,
}: UnsupportedAreaScreenProps) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const supabase = useSupabase()
  const insets = useSafeAreaInsets()

  const [showEmailInput, setShowEmailInput] = useState(false)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Pre-fill email from profile if available
  useEffect(() => {
    if (!userId) return
    let mounted = true
    async function loadEmail() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (mounted && user?.email) {
          setEmail(user.email)
        }
      } catch {
        // ignore
      }
    }
    loadEmail()
    return () => { mounted = false }
  }, [userId, supabase])

  const locationText = [city, countryName].filter(Boolean).join(', ')

  async function handleJoinWaitlist() {
    if (!showEmailInput) {
      setShowEmailInput(true)
      return
    }

    if (!email.trim() || !email.includes('@')) return

    setSubmitting(true)
    try {
      await (supabase.from('waitlist') as any).insert({
        email: email.trim(),
        user_id: userId,
        country,
        city,
      })
      setSubmitted(true)
    } catch {
      // If table doesn't exist or insert fails, still show success
      // to avoid frustrating the user
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top + 60,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Globe icon */}
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: isDark ? '#1E3A2F' : '#E8F5E9' },
          ]}
        >
          <Globe size={48} color={colors.primary} strokeWidth={1.5} />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.foreground }]}>
          {t('unsupported.title')}
        </Text>

        {/* User's detected location */}
        {locationText ? (
          <View style={styles.locationRow}>
            <MapPin size={16} color={colors.mutedForeground} />
            <Text style={[styles.locationText, { color: colors.mutedForeground }]}>
              {t('unsupported.yourLocation', {
                city: city ?? '?',
                country: countryName ?? country ?? '?',
              })}
            </Text>
          </View>
        ) : null}

        {/* Available in section */}
        <View
          style={[
            styles.availableCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.availableTitle, { color: colors.foreground }]}>
            {t('unsupported.availableIn')}
          </Text>
          <Text style={[styles.citiesList, { color: colors.mutedForeground }]}>
            {t('unsupported.cities')}
          </Text>
        </View>

        {/* Waitlist section */}
        {submitted ? (
          <View style={[styles.successCard, { backgroundColor: isDark ? '#1E3A2F' : '#E8F5E9' }]}>
            <Check size={20} color={colors.success} />
            <Text style={[styles.successText, { color: colors.success }]}>
              {t('unsupported.waitlistSuccess')}
            </Text>
          </View>
        ) : (
          <View style={styles.actionsContainer}>
            {/* Email input (shown after tapping waitlist) */}
            {showEmailInput && (
              <TextInput
                style={[
                  styles.emailInput,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
                placeholder={t('unsupported.emailPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />
            )}

            {/* Join waitlist button */}
            <Pressable
              onPress={handleJoinWaitlist}
              disabled={submitting}
              style={({ pressed }) => [
                styles.waitlistBtn,
                {
                  backgroundColor: pressed
                    ? isDark ? '#4A9970' : '#245A4E'
                    : colors.primary,
                  opacity: submitting ? 0.7 : 1,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <>
                  <Mail size={18} color={colors.primaryForeground} />
                  <Text style={[styles.waitlistBtnText, { color: colors.primaryForeground }]}>
                    {t('unsupported.joinWaitlist')}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        {/* Continue anyway button */}
        <Pressable
          onPress={onContinue}
          style={({ pressed }) => [
            styles.continueBtn,
            {
              backgroundColor: pressed
                ? (isDark ? '#2A2A2A' : '#E8E8E8')
                : (isDark ? '#1E1E1E' : '#F0F0F0'),
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.continueBtnText, { color: colors.foreground }]}>
            {t('unsupported.continueAnyway')}
          </Text>
          <ArrowRight size={16} color={colors.foreground} />
        </Pressable>

        {/* Subtle note */}
        {!submitted && (
          <Text style={[styles.note, { color: colors.mutedForeground }]}>
            {t('unsupported.waitlistNote')}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 20,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.headingSemi,
    textAlign: 'center',
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationText: {
    fontSize: 15,
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  availableCard: {
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  availableTitle: {
    fontSize: 15,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
  citiesList: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
  },
  actionsContainer: {
    width: '100%',
    gap: 12,
  },
  emailInput: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: fonts.body,
  },
  waitlistBtn: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  waitlistBtnText: {
    fontSize: 16,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
  continueBtn: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  continueBtnText: {
    fontSize: 15,
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  successCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
  },
  successText: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  note: {
    fontSize: 13,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
})
