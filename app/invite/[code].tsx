import { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
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

  // Not logged in — redirect to login, then they can enter code in onboarding
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {status === 'loading' ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.title, { color: colors.foreground }]}>
              {t('referral.applyCode')}...
            </Text>
          </>
        ) : status === 'success' ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.success}20` }]}>
              <Check size={32} color={colors.success} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {t('referral.applyCodeSuccess')}
            </Text>
          </>
        ) : status === 'already_referred' ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}20` }]}>
              <Gift size={32} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {t('referral.applyCodeAlreadyReferred')}
            </Text>
          </>
        ) : (
          <>
            <View style={[styles.iconCircle, { backgroundColor: `${colors.destructive}20` }]}>
              <XCircle size={32} color={colors.destructive} />
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {status === 'self' ? t('referral.applyCodeSelfReferral') : status === 'invalid' ? t('referral.applyCodeNotFound') : t('referral.applyCodeError')}
            </Text>
          </>
        )}

        <PressableOpacity
          onPress={() => router.replace('/')}
          style={[styles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
            {t('common.continue') ?? 'Jatka'}
          </Text>
        </PressableOpacity>
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
    borderRadius: 12,
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
  button: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
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
