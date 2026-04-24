import { useState, useEffect } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import {
  ArrowLeft, CreditCard, Smartphone, CheckCircle, XCircle,
  Landmark, ChevronRight, ShieldCheck, Info, History,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { usePaymentMethods } from '@/hooks/usePaymentMethods'
import { FEATURES } from '@/lib/featureFlags'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'

function PaymentSettingsScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [userId, setUserId] = useState<string | null>(null)
  const [hasProviderPosts, setHasProviderPosts] = useState(false)
  const [connecting, setConnecting] = useState(false)

  // Feature flag gate — redirect if Payments are disabled
  useEffect(() => {
    if (!FEATURES.PAYMENTS) {
      router.replace('/(tabs)')
    }
  }, [router])

  // Auth gate — redirect to login if not authenticated
  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/(auth)/login')
      }
    }
    checkAuth()
  }, [supabase, router])

  const {
    isConnectOnboarded,
    availableMethods,
    loading,
    startConnectOnboarding,
    refreshStatus,
  } = usePaymentMethods(userId)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      // Check if user has provider posts (tarjoan type only — lainaa disabled for now)
      const providerTypes = FEATURES.LENDING ? ['tarjoan', 'lainaa'] : ['tarjoan']
      const { data: posts, error } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', user.id)
        .in('type', providerTypes)
        .limit(1)

      if (!error && posts && posts.length > 0) {
        setHasProviderPosts(true)
      }
    }
    load()
  }, [supabase])

  // Refresh connect status when screen comes into focus (user may return from Stripe)
  useEffect(() => {
    if (userId) refreshStatus()
  }, [userId, refreshStatus])

  const handleStartConnect = async () => {
    setConnecting(true)
    try {
      await startConnectOnboarding()
    } finally {
      setConnecting(false)
    }
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Bar header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[s.backCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={18} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('payment.settings')}</Text>
        <View style={s.headerSpacer} />
      </View>

      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.foreground} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          {/* Payment Methods */}
          <Text style={[s.section, { color: colors.mutedForeground }]}>{t('payment.methods')}</Text>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Card */}
            <PressableOpacity style={[s.row, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]} accessibilityLabel={t('payment.card')} accessibilityRole="button">
              <View style={[s.iconCircle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <CreditCard size={16} color={colors.foreground} />
              </View>
              <Text style={[s.rowText, { color: colors.foreground }]}>{t('payment.card')}</Text>
              <Text style={[s.statusText, { color: colors.foreground }]}>{t('payment.available')}</Text>
              <ChevronRight size={16} color={colors.mutedForeground} />
            </PressableOpacity>

            {/* Apple Pay */}
            <View style={[s.row, { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <View style={[s.iconCircle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Smartphone size={16} color={availableMethods.applePay ? colors.foreground : colors.mutedForeground} />
              </View>
              <Text style={[s.rowText, { color: colors.foreground }]}>{t('payment.applePay')}</Text>
              {availableMethods.applePay ? (
                <View style={s.statusBadge}>
                  <CheckCircle size={14} color={colors.success} />
                  <Text style={[s.statusBadgeText, { color: colors.success }]}>{t('payment.available')}</Text>
                </View>
              ) : (
                <View style={s.statusBadge}>
                  <XCircle size={14} color={colors.mutedForeground} />
                  <Text style={[s.statusBadgeText, { color: colors.mutedForeground }]}>{t('payment.notAvailable')}</Text>
                </View>
              )}
            </View>

            {/* Google Pay */}
            <View style={s.row}>
              <View style={[s.iconCircle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Smartphone size={16} color={availableMethods.googlePay ? colors.foreground : colors.mutedForeground} />
              </View>
              <Text style={[s.rowText, { color: colors.foreground }]}>{t('payment.googlePay')}</Text>
              {availableMethods.googlePay ? (
                <View style={s.statusBadge}>
                  <CheckCircle size={14} color={colors.success} />
                  <Text style={[s.statusBadgeText, { color: colors.success }]}>{t('payment.available')}</Text>
                </View>
              ) : (
                <View style={s.statusBadge}>
                  <XCircle size={14} color={colors.mutedForeground} />
                  <Text style={[s.statusBadgeText, { color: colors.mutedForeground }]}>{t('payment.notAvailable')}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Provider Settings — only for users with tarjoan/lainaa posts */}
          {hasProviderPosts && (
            <>
              <Text style={[s.section, { color: colors.mutedForeground }]}>{t('payment.providerSettings')}</Text>
              <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={s.providerRow}>
                  <View style={s.providerHeader}>
                    <View style={[s.iconCircle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                      <Landmark size={16} color={isConnectOnboarded ? colors.success : colors.foreground} />
                    </View>
                    <Text style={[s.providerTitle, { color: colors.foreground }]}>{t('payment.connectBank')}</Text>
                    {isConnectOnboarded ? (
                      <View style={s.statusDotRow}>
                        <View style={[s.statusDot, { backgroundColor: colors.success }]} />
                        <Text style={[s.connectedBadgeText, { color: colors.mutedForeground }]}>{t('payment.connected')}</Text>
                      </View>
                    ) : (
                      <View style={s.statusDotRow}>
                        <View style={[s.statusDot, { backgroundColor: colors.destructive }]} />
                        <Text style={[s.connectedBadgeText, { color: colors.mutedForeground }]}>{t('payment.notConnected')}</Text>
                      </View>
                    )}
                  </View>

                  <Text style={[s.providerDesc, { color: colors.mutedForeground }]}>
                    {t('payment.connectDesc')}
                  </Text>

                  {!isConnectOnboarded && (
                    <PressableOpacity
                      onPress={handleStartConnect}
                      disabled={connecting}
                      style={[s.connectBtn, { backgroundColor: colors.foreground, opacity: connecting ? 0.6 : 1 }]}
                      accessibilityLabel={t('payment.startConnect')}
                      accessibilityRole="button"
                    >
                      {connecting ? (
                        <ActivityIndicator size="small" color={colors.primaryForeground} />
                      ) : (
                        <>
                          <Text style={[s.connectBtnText, { color: colors.primaryForeground }]}>{t('payment.startConnect')}</Text>
                          <ChevronRight size={16} color={colors.primaryForeground} />
                        </>
                      )}
                    </PressableOpacity>
                  )}
                </View>
              </View>
            </>
          )}

          {/* Commission Info */}
          <Text style={[s.section, { color: colors.mutedForeground }]}>{t('payment.commissionTitle')}</Text>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.infoRow}>
              <Info size={18} color={colors.mutedForeground} />
              <Text style={[s.infoText, { color: colors.foreground }]}>
                {t('payment.commissionInfo')}
              </Text>
            </View>
          </View>

          {/* Transaction History */}
          <Text style={[s.section, { color: colors.mutedForeground }]}>{t('payment.history')}</Text>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <PressableOpacity onPress={() => router.push('/payment-history' as any)} style={s.row} accessibilityLabel={t('payment.history')} accessibilityRole="button">
              <View style={[s.iconCircle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <History size={16} color={colors.mutedForeground} />
              </View>
              <Text style={[s.rowText, { color: colors.foreground }]}>{t('payment.history')}</Text>
              <ChevronRight size={16} color={colors.mutedForeground} />
            </PressableOpacity>
          </View>

          {/* Security Note */}
          <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.security')}</Text>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.infoRow}>
              <ShieldCheck size={18} color={colors.mutedForeground} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>
                {t('payment.securityNote')}
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  headerSpacer: { width: 36 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  section: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
    paddingHorizontal: 4,
    lineHeight: 16,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  rowText: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20, flex: 1 },
  statusText: { fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 17 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusBadgeText: { fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 17 },
  providerRow: { padding: 16, gap: 12 },
  providerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerTitle: { fontSize: 16, fontFamily: fonts.bodySemi, lineHeight: 24, flex: 1 },
  providerDesc: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20 },
  statusDotRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  connectedBadgeText: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 17 },
  connectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999,
    marginTop: 8,
  },
  connectBtnText: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  infoRow: { flexDirection: 'row', gap: 12, padding: 16, alignItems: 'flex-start' },
  infoText: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20, flex: 1 },
})

export default function PaymentSettingsScreen() {
  return (
    <ScreenErrorBoundary screenName="PaymentSettings">
      <PaymentSettingsScreenInner />
    </ScreenErrorBoundary>
  )
}
