import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Platform, Linking } from 'react-native'
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

function PaymentSettingsScreenInner() {
  const { colors, isDark } = useTheme()
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
      router.back()
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
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel={t('common.back')} accessibilityRole="button">
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('payment.settings')}</Text>
        <View style={{ flex: 1 }} />
      </View>

      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* Payment Methods */}
          <Text style={[s.section, { color: colors.mutedForeground }]}>{t('payment.methods')}</Text>
          <View style={[s.card, { backgroundColor: colors.card }]}>
            {/* Card */}
            <Pressable style={s.row} accessibilityLabel={t('payment.card')} accessibilityRole="button">
              <CreditCard size={20} color={colors.primary} />
              <Text style={[s.rowText, { color: colors.foreground }]}>{t('payment.card')}</Text>
              <Text style={[s.statusText, { color: colors.primary }]}>{t('payment.available')}</Text>
              <ChevronRight size={16} color={colors.mutedForeground} />
            </Pressable>

            {/* Apple Pay */}
            <View style={s.row}>
              <Smartphone size={20} color={availableMethods.applePay ? colors.primary : colors.mutedForeground} />
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
              <Smartphone size={20} color={availableMethods.googlePay ? colors.primary : colors.mutedForeground} />
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
              <View style={[s.card, { backgroundColor: colors.card }]}>
                <View style={s.providerRow}>
                  <View style={s.providerHeader}>
                    <Landmark size={20} color={isConnectOnboarded ? colors.success : colors.pro} />
                    <Text style={[s.providerTitle, { color: colors.foreground }]}>{t('payment.connectBank')}</Text>
                    {isConnectOnboarded ? (
                      <View style={[s.connectedBadge, { backgroundColor: `${colors.success}20` }]}>
                        <CheckCircle size={12} color={colors.success} />
                        <Text style={[s.connectedBadgeText, { color: colors.success }]}>{t('payment.connected')}</Text>
                      </View>
                    ) : (
                      <View style={[s.connectedBadge, { backgroundColor: `${colors.pro}20` }]}>
                        <Text style={[s.connectedBadgeText, { color: colors.pro }]}>{t('payment.notConnected')}</Text>
                      </View>
                    )}
                  </View>

                  <Text style={[s.providerDesc, { color: colors.mutedForeground }]}>
                    {t('payment.connectDesc')}
                  </Text>

                  {!isConnectOnboarded && (
                    <Pressable
                      onPress={handleStartConnect}
                      disabled={connecting}
                      style={[s.connectBtn, { backgroundColor: colors.primary, opacity: connecting ? 0.6 : 1 }]}
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
                    </Pressable>
                  )}
                </View>
              </View>
            </>
          )}

          {/* Commission Info */}
          <Text style={[s.section, { color: colors.mutedForeground }]}>{t('payment.commissionTitle')}</Text>
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <View style={s.infoRow}>
              <Info size={18} color={colors.primary} />
              <Text style={[s.infoText, { color: colors.foreground }]}>
                {t('payment.commissionInfo')}
              </Text>
            </View>
          </View>

          {/* Transaction History */}
          <Text style={[s.section, { color: colors.mutedForeground }]}>{t('payment.history')}</Text>
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Pressable onPress={() => router.push('/payment-history' as any)} style={s.row} accessibilityLabel={t('payment.history')} accessibilityRole="button">
              <History size={18} color={colors.mutedForeground} />
              <Text style={[s.rowText, { color: colors.foreground }]}>{t('payment.history')}</Text>
              <ChevronRight size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Security Note */}
          <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.security')}</Text>
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <View style={s.infoRow}>
              <ShieldCheck size={18} color={colors.primary} />
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
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, letterSpacing: -0.3, fontFamily: fonts.headingSemi, lineHeight: 28 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  section: {
    fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi, letterSpacing: 0.5,
    textTransform: 'uppercase', marginTop: 12, paddingHorizontal: 4, lineHeight: 17,
  },
  card: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  rowText: { fontSize: 15, fontFamily: fonts.body, lineHeight: 20, flex: 1 },
  statusText: { fontSize: 13, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 17 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusBadgeText: { fontSize: 13, fontWeight: '500', fontFamily: fonts.bodyMedium, lineHeight: 17 },
  providerRow: { padding: 16, gap: 12 },
  providerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  providerTitle: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 23, flex: 1 },
  providerDesc: { fontSize: 14, fontFamily: fonts.body, lineHeight: 20 },
  connectedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  connectedBadgeText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi, lineHeight: 17 },
  connectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12,
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
