import { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Gift, Check, XCircle } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useReferral, type ApplyResult } from '@/hooks/useReferral'
import { getCachedUserId } from '@/lib/authCache'
import { fonts } from '@/lib/fonts'
import { PressableOpacity } from '@/components/ui'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'

function InviteScreenInner() {
  const { code } = useLocalSearchParams<{ code: string }>()
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [userId, setUserId] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | ApplyResult>('loading')
  const referral = useReferral(userId)

  useEffect(() => {
    getCachedUserId().then(id => setUserId(id))
  }, [])

  useEffect(() => {
    if (!userId || !code || referral.loading) return
    // Auto-apply the invite code
    referral.applyInviteCode(code).then(result => setStatus(result))
  }, [userId, code, referral.loading])

  // Not logged in -- redirect to login, then they can enter code in onboarding
  useEffect(() => {
    if (userId === null && status === 'loading') {
      const timer = setTimeout(() => {
        // If still no userId after 2s, redirect to login
        getCachedUserId().then(id => {
          if (!id) router.replace('/(auth)/login')
        })
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [userId, status, router])

  const isError = status === 'invalid' || status === 'self' || status === 'error'

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {status === 'loading' ? (
          <>
            <ActivityIndicator size="large" color={colors.foreground} />
            <Text style={[styles.title, { color: colors.foreground }]}>
              {t('referral.applyCode')}...
            </Text>
          </>
        ) : status === 'success' ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}>
              <Check size={32} color={colors.foreground} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {t('referral.applyCodeSuccess')}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {t('referral.applyCode')}
            </Text>
          </>
        ) : status === 'already_referred' ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}>
              <Gift size={32} color={colors.foreground} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {t('referral.applyCodeAlreadyReferred')}
            </Text>
          </>
        ) : (
          <>
            <View style={[styles.iconCircle, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}>
              <XCircle size={32} color={colors.foreground} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {status === 'self' ? t('referral.applyCodeSelfReferral') : status === 'invalid' ? t('referral.applyCodeNotFound') : t('referral.applyCodeError')}
            </Text>
          </>
        )}

        {/* Primary action button -- INK bg */}
        <PressableOpacity
          onPress={() => router.replace('/')}
          style={[styles.button, { backgroundColor: colors.foreground }]}
        >
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
            {t('common.continue') ?? 'Jatka'}
          </Text>
        </PressableOpacity>

        {/* Secondary outline button */}
        {isError && (
          <PressableOpacity
            onPress={() => router.back()}
            style={[styles.outlineButton, { borderColor: colors.foreground }]}
          >
            <Text style={[styles.outlineButtonText, { color: colors.foreground }]}>
              {t('common.back') ?? 'Takaisin'}
            </Text>
          </PressableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 16,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.headingSemi,
    textAlign: 'center',
    lineHeight: 24,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
  },
  outlineButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    width: '100%',
    alignItems: 'center',
  },
  outlineButtonText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
  },
})

export default function InviteScreen() {
  return (
    <ScreenErrorBoundary screenName="Invite">
      <InviteScreenInner />
    </ScreenErrorBoundary>
  )
}
