declare const __DEV__: boolean

import { useState, useEffect, useCallback } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Switch, ActivityIndicator, Alert, Platform, KeyboardAvoidingView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { ArrowLeft, Megaphone, Eye, BarChart3, Plus, MapPin, TrendingUp, Camera, X, Phone, Globe, Save, Navigation } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity, KeyboardDoneAccessory, KEYBOARD_DONE_ID } from '@/components/ui'
import { FEATURES } from '@/lib/featureFlags'
import type { Profile } from '@/lib/types'

const MAX_IMAGES = 10
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp']

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
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  // Feature flag gate -- redirect if Business accounts are disabled
  useEffect(() => {
    if (!FEATURES.BUSINESS_ACCOUNT) {
      router.replace('/(tabs)')
    }
  }, [router])

  const [profile, setProfile] = useState<Profile | null>(null)
  const [ads, setAds] = useState<AdStats[]>([])
  const [loading, setLoading] = useState(true)
  const [mapPresence, setMapPresence] = useState(true)

  // Profile editor state
  const [businessImages, setBusinessImages] = useState<string[]>([])
  const [businessDescription, setBusinessDescription] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [businessLat, setBusinessLat] = useState<number | null>(null)
  const [businessLng, setBusinessLng] = useState<number | null>(null)
  const [businessPhone, setBusinessPhone] = useState('')
  const [businessWebsite, setBusinessWebsite] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [geocoding, setGeocoding] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.replace('/(auth)/login'); setLoading(false); return }

        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
        if (!profileData) { setLoading(false); return }
        const p = profileData as unknown as Profile
        setProfile(p)
        setMapPresence((profileData as any).map_presence !== false)

        // Populate editor fields
        setBusinessImages(p.business_images ?? [])
        setBusinessDescription(p.business_description ?? '')
        setBusinessAddress(p.business_address ?? '')
        setBusinessLat(p.business_lat ?? null)
        setBusinessLng(p.business_lng ?? null)
        setBusinessPhone(p.business_phone ?? '')
        setBusinessWebsite(p.business_website ?? '')

        if (!p.is_business) {
          setLoading(false)
          router.replace('/upgrade-business')
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
              } catch {} // Intentional: ad_impressions table may not exist yet
              return { ...ad, impressions, clicks }
            })
          )
          setAds(adsWithStats)
        }
      } catch {} // Intentional: advertisements table may not exist yet

        setLoading(false)
      } catch (err) {
        if (__DEV__) console.warn('[organization] load failed:', err)
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

  // --- Image handling ---
  const pickImage = useCallback(async () => {
    if (businessImages.length >= MAX_IMAGES) {
      Alert.alert(t('common.error'), t('business.maxImages'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: MAX_IMAGES - businessImages.length,
    })
    if (result.canceled || !result.assets?.length || !profile) return

    setUploading(true)
    const newUrls: string[] = []
    for (const asset of result.assets) {
      const uri = asset.uri
      const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase()
      if (!ALLOWED_EXTS.includes(ext)) continue
      const fileName = `business/${profile.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

      try {
        const response = await fetch(uri)
        const blob = await response.blob()
        if (blob.size > MAX_FILE_SIZE) continue
        const arrayBuffer = await blob.arrayBuffer()

        // Try business-images bucket first, fallback to post-images/business/
        let publicUrl: string | null = null
        const { error } = await supabase.storage
          .from('business-images')
          .upload(fileName, arrayBuffer, { contentType: `image/${ext}`, upsert: true })

        if (!error) {
          const { data: urlData } = supabase.storage.from('business-images').getPublicUrl(fileName)
          publicUrl = urlData.publicUrl
        } else {
          // Fallback bucket
          const fallbackPath = `business/${profile.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
          const { error: fallbackError } = await supabase.storage
            .from('post-images')
            .upload(fallbackPath, arrayBuffer, { contentType: `image/${ext}`, upsert: true })
          if (!fallbackError) {
            const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(fallbackPath)
            publicUrl = urlData.publicUrl
          }
        }

        if (publicUrl) {
          newUrls.push(publicUrl)
        }
      } catch (err) {
        if (__DEV__) console.warn('[organization] image upload failed:', err)
      }
    }

    if (newUrls.length > 0) {
      const updated = [...businessImages, ...newUrls].slice(0, MAX_IMAGES)
      setBusinessImages(updated)
      // Save immediately
      await (supabase.from('profiles') as any)
        .update({ business_images: updated })
        .eq('id', profile.id)
    } else if (result.assets.length > 0) {
      Alert.alert(t('common.error'), t('business.imageUploadFail'))
    }
    setUploading(false)
  }, [businessImages, profile, supabase, t])

  const removeImage = useCallback(async (index: number) => {
    if (!profile) return
    const updated = businessImages.filter((_, i) => i !== index)
    setBusinessImages(updated)
    await (supabase.from('profiles') as any)
      .update({ business_images: updated })
      .eq('id', profile.id)
  }, [businessImages, profile, supabase])

  // --- Geocoding ---
  const geocodeAddress = useCallback(async () => {
    if (!businessAddress.trim()) return
    setGeocoding(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(businessAddress)}&countrycodes=fi&limit=1`,
        { headers: { 'User-Agent': 'TackBird/1.0' } },
      )
      const data = await res.json()
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat)
        const lng = parseFloat(data[0].lon)
        if (isNaN(lat) || isNaN(lng)) {
          Alert.alert(t('common.error'), t('business.geocodeFail'))
          return
        }
        setBusinessLat(lat)
        setBusinessLng(lng)
        Alert.alert(t('business.geocodeSuccess'), `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
      } else {
        Alert.alert(t('common.error'), t('business.geocodeFail'))
      }
    } catch {
      Alert.alert(t('common.error'), t('business.geocodeFail'))
    } finally {
      setGeocoding(false)
    }
  }, [businessAddress, t])

  // --- Save all ---
  const saveAll = useCallback(async () => {
    if (!profile) return
    setSaving(true)
    try {
      const { error } = await (supabase.from('profiles') as any)
        .update({
          business_description: businessDescription.trim() || null,
          business_address: businessAddress.trim() || null,
          business_lat: businessLat,
          business_lng: businessLng,
          business_phone: businessPhone.trim() || null,
          business_website: businessWebsite.trim() || null,
          business_images: businessImages,
        })
        .eq('id', profile.id)

      if (error) throw error
      Alert.alert(t('business.saved'))
    } catch {
      Alert.alert(t('common.error'), t('business.saveFailed'))
    } finally {
      setSaving(false)
    }
  }, [profile, supabase, businessDescription, businessAddress, businessLat, businessLng, businessPhone, businessWebsite, businessImages, t])

  const localeStr = locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB'

  if (loading) {
    return (
      <ScreenErrorBoundary screenName="Organization">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={[styles.circleBack, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('business.dashboard')}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.foreground} />
        </View>
      </View>
      </ScreenErrorBoundary>
    )
  }

  return (
    <ScreenErrorBoundary screenName="Organization">
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.circleBack, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('business.dashboard')}</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* Business info card */}
        <View style={[styles.businessCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.businessName, { color: colors.foreground }]}>
            {profile?.business_name ?? profile?.name}
          </Text>
          {profile?.business_vat_id && (
            <Text style={[styles.vatId, { color: colors.mutedForeground }]}>
              Y-tunnus: {profile.business_vat_id}
            </Text>
          )}
          {/* Dot + label status */}
          <View style={[styles.statusDotRow, { marginTop: 8 }]}>
            <View style={[styles.statusDot, { backgroundColor: colors.foreground }]} />
            <Text style={[styles.statusText, { color: colors.mutedForeground }]}>{t('business.active')}</Text>
          </View>
        </View>

        {/* ===== Business Images ===== */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {t('business.profileImages')}
        </Text>
        <View style={[styles.editorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageScroll}>
            {businessImages.map((uri, i) => (
              <View key={`${uri}-${i}`} style={styles.imageThumbWrap}>
                <Image source={{ uri }} style={styles.imageThumb} contentFit="cover" cachePolicy="memory-disk" />
                <PressableOpacity
                  style={[styles.imageDeleteBtn, { backgroundColor: colors.foreground }]}
                  onPress={() => removeImage(i)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.delete')}
                >
                  <X size={12} color={colors.primaryForeground} />
                </PressableOpacity>
              </View>
            ))}
            {businessImages.length < MAX_IMAGES && (
              <PressableOpacity
                style={[styles.addImageBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                onPress={pickImage}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel={t('business.addPhoto')}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.foreground} />
                ) : (
                  <>
                    <Camera size={22} color={colors.mutedForeground} />
                    <Text style={[styles.addImageText, { color: colors.mutedForeground }]}>{t('business.addPhoto')}</Text>
                  </>
                )}
              </PressableOpacity>
            )}
          </ScrollView>
          <Text style={[styles.imageHint, { color: colors.mutedForeground }]}>
            {t('business.maxImages')} ({businessImages.length}/{MAX_IMAGES})
          </Text>
        </View>

        {/* ===== Description ===== */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {t('business.description')}
        </Text>
        <View style={[styles.editorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            value={businessDescription}
            onChangeText={setBusinessDescription}
            placeholder={t('business.descriptionPlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={500}
            textAlignVertical="top"
            inputAccessoryViewID={KEYBOARD_DONE_ID}
          />
          <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
            {businessDescription.length}/500
          </Text>
        </View>

        {/* ===== Address + Geocoding ===== */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {t('business.address')}
        </Text>
        <View style={[styles.editorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            value={businessAddress}
            onChangeText={setBusinessAddress}
            placeholder={t('business.addressPlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            maxLength={200}
          />
          <PressableOpacity
            style={[styles.geocodeBtn, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
            onPress={geocodeAddress}
            disabled={geocoding || !businessAddress.trim()}
          >
            {geocoding ? (
              <ActivityIndicator size="small" color={colors.foreground} />
            ) : (
              <>
                <Navigation size={16} color={colors.foreground} />
                <Text style={[styles.geocodeBtnText, { color: colors.foreground }]}>{t('business.geocode')}</Text>
              </>
            )}
          </PressableOpacity>
          {businessLat != null && businessLng != null && (
            <Text style={[styles.coordsText, { color: colors.mutedForeground }]}>
              {businessLat.toFixed(5)}, {businessLng.toFixed(5)}
            </Text>
          )}
        </View>

        {/* ===== Contact Fields ===== */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {t('business.contactInfo')}
        </Text>
        <View style={[styles.editorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.contactRow}>
            <Phone size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.contactInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={businessPhone}
              onChangeText={setBusinessPhone}
              placeholder={t('business.phonePlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              maxLength={30}
            />
          </View>
          <View style={styles.contactRow}>
            <Globe size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.contactInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={businessWebsite}
              onChangeText={setBusinessWebsite}
              placeholder={t('business.websitePlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              keyboardType="url"
              autoCapitalize="none"
              textContentType="URL"
              autoComplete="url"
              maxLength={200}
            />
          </View>
        </View>

        {/* ===== Save All Button ===== */}
        <PressableOpacity
          onPress={saveAll}
          disabled={saving}
          style={[styles.saveBtn, { backgroundColor: colors.foreground, opacity: saving ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('business.saveAll')}
          accessibilityState={{ disabled: saving }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <>
              <Save size={18} color={colors.primaryForeground} />
              <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
                {t('business.saveAll')}
              </Text>
            </>
          )}
        </PressableOpacity>

        {/* Map presence toggle */}
        <View style={[styles.toggleCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MapPin size={18} color={colors.foreground} />
          <Text style={[styles.toggleText, { color: colors.foreground }]}>{t('business.mapPresence')}</Text>
          <Switch
            value={mapPresence}
            onValueChange={toggleMapPresence}
            trackColor={{ false: colors.muted, true: `${colors.foreground}66` }}
            thumbColor={mapPresence ? colors.foreground : colors.mutedForeground}
          />
        </View>

        {/* Create ad button -- INK bg primary */}
        <PressableOpacity
          onPress={() => router.push('/create-ad')}
          style={[styles.createAdBtn, { backgroundColor: colors.foreground }]}
          accessibilityRole="button"
          accessibilityLabel={t('ads.create')}
        >
          <Plus size={18} color={colors.primaryForeground} />
          <Text style={[styles.createAdText, { color: colors.primaryForeground }]}>
            {t('ads.create')}
          </Text>
        </PressableOpacity>

        {/* Ad stats */}
        {ads.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {t('ads.yourAds')}
            </Text>

            {ads.map(ad => {
              const isActive = ad.status === 'active' && new Date(ad.end_date) > new Date()
              return (
                <View key={ad.id} style={[styles.adCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.adHeader}>
                    <Text style={[styles.adTitle, { color: colors.foreground }]} numberOfLines={1}>
                      {ad.title}
                    </Text>
                    <View style={styles.statusDotRow}>
                      <View style={[styles.statusDot, { backgroundColor: isActive ? colors.foreground : colors.mutedForeground }]} />
                      <Text style={[styles.adStatusText, { color: colors.mutedForeground }]}>
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
                      <Text style={[styles.statValue, { color: colors.foreground }]}>{ad.impressions > 0 ? getCtr(ad.impressions, ad.clicks) : '0%'}</Text>
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
      <KeyboardDoneAccessory />
    </KeyboardAvoidingView>
    </ScreenErrorBoundary>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  circleBack: {
    width: 36, height: 36, borderRadius: 999,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, letterSpacing: -0.3, fontFamily: fonts.headingSemi, lineHeight: 28, textAlign: 'center', flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 60 },
  businessCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 6 },
  businessName: { fontSize: 20, fontFamily: fonts.headingSemi },
  vatId: { fontSize: 13, fontFamily: fonts.body },
  statusDotRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontFamily: fonts.body },
  toggleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, borderWidth: 1, padding: 16,
  },
  toggleText: { fontSize: 14, flex: 1, fontFamily: fonts.bodyMedium },
  createAdBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16, minHeight: 48,
  },
  createAdText: { fontSize: 16, fontFamily: fonts.bodySemi },
  sectionLabel: {
    fontSize: 11, letterSpacing: 0.5, fontWeight: '600',
    textTransform: 'uppercase', marginTop: 8, paddingHorizontal: 4,
    fontFamily: fonts.bodySemi, lineHeight: 16,
  },
  adCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  adHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  adTitle: { fontSize: 14, flex: 1, fontFamily: fonts.bodySemi },
  adStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  adStatusText: { fontSize: 11, fontFamily: fonts.bodySemi },
  adDates: { fontSize: 12, fontFamily: fonts.body },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontSize: 14, fontFamily: fonts.bodySemi },
  statLabel: { fontSize: 11, fontFamily: fonts.body },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontFamily: fonts.headingSemi },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: fonts.body },

  // Profile editor styles
  editorCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  imageScroll: { gap: 12, paddingVertical: 4 },
  imageThumbWrap: { position: 'relative' },
  imageThumb: { width: 90, height: 90, borderRadius: 14 },
  imageDeleteBtn: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  addImageBtn: {
    width: 90, height: 90, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addImageText: { fontSize: 11, fontWeight: '600', fontFamily: fonts.bodySemi },
  imageHint: { fontSize: 11, marginTop: 2, fontFamily: fonts.body },
  textArea: {
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 14,
    minHeight: 100, lineHeight: 22, fontFamily: fonts.body,
  },
  charCount: { fontSize: 11, textAlign: 'right', fontFamily: fonts.body },
  input: {
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontFamily: fonts.body,
  },
  geocodeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 14,
  },
  geocodeBtnText: { fontSize: 14, fontFamily: fonts.bodySemi },
  coordsText: { fontSize: 12, fontFamily: fonts.body },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  contactInput: {
    flex: 1, borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontFamily: fonts.body,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 16, marginTop: 4, minHeight: 48,
  },
  saveBtnText: { fontSize: 16, fontFamily: fonts.bodySemi },
})
