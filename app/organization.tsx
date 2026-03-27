import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, Switch, ActivityIndicator, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, Megaphone, Eye, BarChart3, Plus, MapPin, TrendingUp } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import type { Profile } from '@/lib/types'

interface AdStats {
  id: string
  title: string
  status: string
  start_date: string
  end_date: string
  impressions: number
  clicks: number
}

export default function OrganizationScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [ads, setAds] = useState<AdStats[]>([])
  const [loading, setLoading] = useState(true)
  const [mapPresence, setMapPresence] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/(auth)/login'); setLoading(false); return }

        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        if (!profileData) { setLoading(false); return }
        const p = profileData as unknown as Profile
        setProfile(p)
        setMapPresence((profileData as any).map_presence !== false)

        if (!p.is_business) {
          router.replace('/upgrade-business')
          setLoading(false)
          return
        }

      // Fetch ads with stats
      try {
        const { data: adsData } = await (supabase.from('advertisements') as any)
          .select('id, title, status, start_date, end_date')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20)

        if (adsData) {
          // Fetch impression counts for each ad
          const adsWithStats: AdStats[] = await Promise.all(
            adsData.map(async (ad: any) => {
              let impressions = 0
              let clicks = 0
              try {
                const { count: impCount } = await (supabase.from('ad_impressions') as any)
                  .select('id', { count: 'exact', head: true })
                  .eq('ad_id', ad.id)
                  .eq('type', 'impression')
                impressions = impCount ?? 0

                const { count: clickCount } = await (supabase.from('ad_impressions') as any)
                  .select('id', { count: 'exact', head: true })
                  .eq('ad_id', ad.id)
                  .eq('type', 'click')
                clicks = clickCount ?? 0
              } catch {
                // Table may not exist yet
              }
              return { ...ad, impressions, clicks }
            })
          )
          setAds(adsWithStats)
        }
      } catch {
        // advertisements table may not exist yet
      }

        setLoading(false)
      } catch {
        setLoading(false)
      }
    }
    load()
  }, [supabase, router])

  const toggleMapPresence = useCallback(async (value: boolean) => {
    setMapPresence(value)
    if (profile) {
      await (supabase.from('profiles') as any)
        .update({ map_presence: value })
        .eq('id', profile.id)
    }
  }, [profile, supabase])

  const getCtr = (impressions: number, clicks: number) => {
    if (impressions === 0) return '0%'
    return `${((clicks / impressions) * 100).toFixed(1)}%`
  }

  const localeStr = locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB'

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('business.dashboard')}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('business.dashboard')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Business info */}
        <View style={[styles.businessCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.businessName, { color: colors.foreground }]}>
            {profile?.business_name ?? profile?.name}
          </Text>
          {profile?.business_vat_id && (
            <Text style={[styles.vatId, { color: colors.mutedForeground }]}>
              Y-tunnus: {profile.business_vat_id}
            </Text>
          )}
          <View style={[styles.statusBadge, { backgroundColor: `${colors.success}18` }]}>
            <Text style={[styles.statusText, { color: colors.success }]}>{t('business.active')}</Text>
          </View>
        </View>

        {/* Map presence toggle */}
        <View style={[styles.toggleCard, { backgroundColor: colors.card }]}>
          <MapPin size={18} color={colors.primary} />
          <Text style={[styles.toggleText, { color: colors.foreground }]}>{t('business.mapPresence')}</Text>
          <Switch
            value={mapPresence}
            onValueChange={toggleMapPresence}
            trackColor={{ false: colors.muted, true: `${colors.primary}66` }}
            thumbColor={mapPresence ? colors.primary : colors.mutedForeground}
          />
        </View>

        {/* Create ad button */}
        <Pressable
          onPress={() => router.push('/create-ad')}
          style={[styles.createAdBtn, { backgroundColor: colors.primary }]}
        >
          <Plus size={18} color={colors.primaryForeground} />
          <Text style={[styles.createAdText, { color: colors.primaryForeground }]}>
            {t('ads.create')}
          </Text>
        </Pressable>

        {/* Ad stats */}
        {ads.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {t('ads.yourAds')}
            </Text>

            {ads.map(ad => {
              const isActive = ad.status === 'active' && new Date(ad.end_date) > new Date()
              return (
                <View key={ad.id} style={[styles.adCard, { backgroundColor: colors.card }]}>
                  <View style={styles.adHeader}>
                    <Text style={[styles.adTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {ad.title}
                    </Text>
                    <View style={[styles.adStatus, { backgroundColor: isActive ? `${colors.success}18` : `${colors.mutedForeground}18` }]}>
                      <Text style={[styles.adStatusText, { color: isActive ? colors.success : colors.mutedForeground }]}>
                        {isActive ? t('ads.active') : t('ads.ended')}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.adDates, { color: colors.mutedForeground }]}>
                    {new Date(ad.start_date).toLocaleDateString(localeStr)} — {new Date(ad.end_date).toLocaleDateString(localeStr)}
                  </Text>

                  {/* Stats row */}
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Eye size={14} color={colors.mutedForeground} />
                      <Text style={[styles.statValue, { color: colors.foreground }]}>{ad.impressions}</Text>
                      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t('ads.impressions')}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <TrendingUp size={14} color={colors.mutedForeground} />
                      <Text style={[styles.statValue, { color: colors.foreground }]}>{ad.clicks}</Text>
                      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t('ads.clicks')}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <BarChart3 size={14} color={colors.mutedForeground} />
                      <Text style={[styles.statValue, { color: colors.foreground }]}>{getCtr(ad.impressions, ad.clicks)}</Text>
                      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t('ads.ctr')}</Text>
                    </View>
                  </View>
                </View>
              )
            })}
          </>
        )}

        {ads.length === 0 && (
          <View style={styles.emptyState}>
            <Megaphone size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t('ads.noAdsYet')}</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>{t('ads.noAdsDesc')}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi },
  content: { padding: 16, gap: 12, paddingBottom: 60 },
  businessCard: { borderRadius: 14, padding: 18, gap: 6 },
  businessName: { fontSize: 20, fontWeight: '700', fontFamily: fonts.headingSemi },
  vatId: { fontSize: 13 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  toggleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: 16,
  },
  toggleText: { fontSize: 15, flex: 1, fontWeight: '500' },
  createAdBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
  },
  createAdText: { fontSize: 16, fontWeight: '700' },
  sectionLabel: {
    fontSize: 12, fontWeight: '600', letterSpacing: 0.5,
    textTransform: 'uppercase', marginTop: 8, paddingHorizontal: 4,
  },
  adCard: { borderRadius: 14, padding: 16, gap: 8 },
  adHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  adTitle: { fontSize: 15, fontWeight: '600', flex: 1, fontFamily: fonts.bodySemi },
  adStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  adStatusText: { fontSize: 11, fontWeight: '600' },
  adDates: { fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontSize: 14, fontWeight: '700' },
  statLabel: { fontSize: 11 },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
})
