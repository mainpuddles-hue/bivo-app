declare const __DEV__: boolean

import { useState, useCallback, useEffect } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator, Linking, Platform, KeyboardAvoidingView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, Camera, X, Megaphone, ExternalLink } from 'lucide-react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { NEIGHBORHOODS } from '@/lib/constants'
import { fonts } from '@/lib/fonts'
import { formatPrice as formatPriceUtil } from '@/lib/format'
import { FEATURES } from '@/lib/featureFlags'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import type { Profile } from '@/lib/types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

const DURATION_OPTIONS = [
  { days: 7, label: '7' },
  { days: 14, label: '14' },
  { days: 30, label: '30' },
]

const CTA_OPTIONS = [
  { value: 'Katso lisää', fi: 'Katso lisää', en: 'Learn more', sv: 'Läs mer' },
  { value: 'Osta nyt', fi: 'Osta nyt', en: 'Buy now', sv: 'Köp nu' },
  { value: 'Varaa aika', fi: 'Varaa aika', en: 'Book now', sv: 'Boka nu' },
  { value: 'Ota yhteyttä', fi: 'Ota yhteyttä', en: 'Contact us', sv: 'Kontakta oss' },
]

const PRICE_PER_DAY = 299 // cents
const PRO_PRICE_PER_DAY = 239 // cents

export default function CreateAdScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [ctaText, setCtaText] = useState(CTA_OPTIONS[0].value)
  const [targetNeighborhood, setTargetNeighborhood] = useState<string | null>(null)
  const [duration, setDuration] = useState(7)
  const [submitting, setSubmitting] = useState(false)
  const [showNeighborhoods, setShowNeighborhoods] = useState(false)
  const [cityNeighborhoods, setCityNeighborhoods] = useState<string[]>([])

  // Feature flag gate — redirect if Ad campaigns are disabled
  useEffect(() => {
    if (!FEATURES.AD_CAMPAIGNS) {
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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        const p = data as unknown as Profile
        if (!p.is_business && !p.is_pro) {
          Alert.alert(t('common.error'), t('ads.businessRequired') ?? 'Business or Pro account required')
          router.back()
          return
        }
        setProfile(p)
        setTargetNeighborhood(p.naapurusto ?? null)
        // Load neighborhoods for user's city
        const cityId = (data as any).city_id ?? 'helsinki'
        try {
          const { data: nhData } = await supabase
            .from('city_neighborhoods')
            .select('name')
            .eq('city_id', cityId)
            .order('name')
          if (nhData && nhData.length > 0) {
            setCityNeighborhoods((nhData as any[]).map((n: any) => n.name))
          }
        } catch {} // Intentional: city_neighborhoods table may not exist
      }
    }
    load()
  }, [supabase, t, router])

  const pricePerDay = profile?.is_pro ? PRO_PRICE_PER_DAY : PRICE_PER_DAY
  const totalPrice = duration * pricePerDay

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.6,
    })
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri)
    }
  }, [])

  const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif']
  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

  const uploadImage = useCallback(async (uri: string, userId: string): Promise<string | null> => {
    try {
      const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase()
      if (!ALLOWED_EXTS.includes(ext)) return null
      const fileName = `${userId}/${Date.now()}.${ext}`
      const response = await fetch(uri)
      const blob = await response.blob()
      if (blob.size > MAX_FILE_SIZE) return null
      const arrayBuffer = await blob.arrayBuffer()

      const { data, error } = await supabase.storage
        .from('ads')
        .upload(fileName, arrayBuffer, { contentType: `image/${ext}`, upsert: false })

      if (error) {
        // Fallback: try 'post-images' bucket
        const { data: fallbackData, error: fallbackError } = await supabase.storage
          .from('post-images')
          .upload(`ads/${fileName}`, arrayBuffer, { contentType: `image/${ext}`, upsert: false })
        if (fallbackError) return null
        const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(`ads/${fileName}`)
        return urlData?.publicUrl ?? null
      }

      const { data: urlData } = supabase.storage.from('ads').getPublicUrl(fileName)
      return urlData?.publicUrl ?? null
    } catch (err) {
      if (__DEV__) console.warn('[create-ad] image upload failed:', err)
      return null
    }
  }, [supabase])

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert(t('common.error'), t('create.titleRequired'))
      return
    }
    if (!profile) return

    setSubmitting(true)
    try {
      let uploadedImageUrl: string | null = null
      if (imageUri) {
        uploadedImageUrl = await uploadImage(imageUri, profile.id)
      }

      // Create ad record
      const now = new Date()
      const endDate = new Date(now.getTime() + duration * 86400000)

      const { data: ad, error: adError } = await (supabase.from('advertisements') as any).insert({
        user_id: profile.id,
        title: title.trim(),
        description: description.trim() || null,
        image_url: uploadedImageUrl,
        link_url: linkUrl.trim() || null,
        cta_text: ctaText,
        target_naapurusto: targetNeighborhood,
        duration_days: duration,
        price_per_day: pricePerDay,
        total_price: totalPrice,
        start_date: now.toISOString(),
        end_date: endDate.toISOString(),
        status: 'pending_payment',
      }).select('id').single()

      if (adError) throw adError

      // Create Stripe payment for the ad
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const res = await fetch(`${FUNCTIONS_URL}/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: totalPrice, // in cents — stripe-checkout Edge Function expects cents
          description: `TackBird Ad: ${title.trim()} (${duration} days)`,
          type: 'ad_campaign',
          seller_id: profile.id, // ad campaigns: advertiser is both buyer and seller
          metadata: {
            ad_id: ad?.id,
            duration: String(duration),
          },
          success_url: 'tackbird://payment/success?session_id={CHECKOUT_SESSION_ID}',
          cancel_url: 'tackbird://payment/cancel',
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Payment failed')
      }

      const { url } = await res.json()
      if (url) {
        await Linking.openURL(url).catch(() => {})
        // Don't navigate away — user will return via deep link after payment
        return
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message ?? t('ads.createError'))
    } finally {
      setSubmitting(false)
    }
  }, [title, description, imageUri, linkUrl, ctaText, targetNeighborhood, duration, profile, pricePerDay, totalPrice, supabase, router, t, uploadImage])

  const formatPrice = (cents: number) => formatPriceUtil(cents / 100, locale)

  return (
    <ScreenErrorBoundary screenName="CreateAd">
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('ads.create')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* Title */}
        <Text style={[styles.label, { color: colors.foreground }]}>{t('create.title')} *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={title}
          onChangeText={setTitle}
          placeholder={t('ads.titlePlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          maxLength={100}
        />

        {/* Description */}
        <Text style={[styles.label, { color: colors.foreground }]}>{t('create.description')}</Text>
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={description}
          onChangeText={setDescription}
          placeholder={t('ads.descriptionPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={500}
        />

        {/* Image */}
        <Text style={[styles.label, { color: colors.foreground }]}>{t('create.addPhotos')}</Text>
        {imageUri ? (
          <View style={styles.imagePreview}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} contentFit="cover" />
            <Pressable onPress={() => setImageUri(null)} style={[styles.removeImage, { backgroundColor: colors.destructive }]} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
              <X size={14} color={colors.primaryForeground} />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={handlePickImage} style={({ pressed }) => [styles.imagePicker, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.7 }]}>
            <Camera size={24} color={colors.mutedForeground} />
            <Text style={[styles.imagePickerText, { color: colors.mutedForeground }]}>{t('create.addPhotos')}</Text>
          </Pressable>
        )}

        {/* Link URL */}
        <Text style={[styles.label, { color: colors.foreground }]}>{t('ads.linkUrl')}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
          value={linkUrl}
          onChangeText={setLinkUrl}
          placeholder="https://..."
          placeholderTextColor={colors.mutedForeground}
          keyboardType="url"
          autoCapitalize="none"
        />

        {/* CTA text */}
        <Text style={[styles.label, { color: colors.foreground }]}>{t('ads.ctaText')}</Text>
        <View style={styles.ctaRow}>
          {CTA_OPTIONS.map(opt => (
            <Pressable
              key={opt.value}
              onPress={() => setCtaText(opt.value)}
              style={[
                styles.ctaChip,
                {
                  backgroundColor: ctaText === opt.value ? colors.primary : colors.card,
                  borderColor: ctaText === opt.value ? colors.primary : colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: ctaText === opt.value }}
            >
              <Text
                style={[
                  styles.ctaChipText,
                  { color: ctaText === opt.value ? colors.primaryForeground : colors.foreground },
                ]}
              >
                {locale === 'fi' ? opt.fi : locale === 'sv' ? opt.sv : opt.en}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Target neighborhood */}
        <Text style={[styles.label, { color: colors.foreground }]}>{t('ads.targetNeighborhood')}</Text>
        <Pressable
          onPress={() => setShowNeighborhoods(!showNeighborhoods)}
          style={[styles.input, styles.pickerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={{ color: targetNeighborhood ? colors.foreground : colors.mutedForeground, fontSize: 14, fontFamily: fonts.body }}>
            {targetNeighborhood ?? t('ads.allAreas')}
          </Text>
        </Pressable>
        {showNeighborhoods && (
          <View style={[styles.neighborhoodList, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Pressable
              onPress={() => { setTargetNeighborhood(null); setShowNeighborhoods(false) }}
              style={[styles.neighborhoodItem, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.neighborhoodText, { color: !targetNeighborhood ? colors.primary : colors.foreground }]}>
                {t('ads.allAreas')}
              </Text>
            </Pressable>
            {(cityNeighborhoods.length > 0 ? cityNeighborhoods : NEIGHBORHOODS).map(n => (
              <Pressable
                key={n}
                onPress={() => { setTargetNeighborhood(n); setShowNeighborhoods(false) }}
                style={[styles.neighborhoodItem, { borderBottomColor: colors.border }]}
              >
                <Text style={[styles.neighborhoodText, { color: targetNeighborhood === n ? colors.primary : colors.foreground }]}>
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Duration */}
        <Text style={[styles.label, { color: colors.foreground }]}>{t('ads.duration')}</Text>
        <View style={styles.durationRow}>
          {DURATION_OPTIONS.map(opt => (
            <Pressable
              key={opt.days}
              onPress={() => setDuration(opt.days)}
              style={[
                styles.durationCard,
                {
                  backgroundColor: duration === opt.days ? `${colors.primary}14` : colors.card,
                  borderColor: duration === opt.days ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[styles.durationDays, { color: duration === opt.days ? colors.primary : colors.foreground }]}>
                {opt.label}
              </Text>
              <Text style={[styles.durationLabel, { color: colors.mutedForeground }]}>
                {t('common.daysShort')}
              </Text>
              <Text style={[styles.durationPrice, { color: duration === opt.days ? colors.primary : colors.mutedForeground }]}>
                {formatPrice(opt.days * pricePerDay)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Price summary */}
        <View style={[styles.priceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.priceRow}>
            <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>
              {duration} {t('common.daysShort')} x {formatPrice(pricePerDay)}/{t('common.daysShort')}
            </Text>
            <Text style={[styles.priceValue, { color: colors.foreground }]}>
              {formatPrice(totalPrice)}
            </Text>
          </View>
          {profile?.is_pro && (
            <Text style={[styles.proDiscount, { color: colors.pro }]}>
              Pro -20%
            </Text>
          )}
        </View>

        {/* iOS disclaimer — ad campaigns are B2B transactions via Stripe */}
        {Platform.OS === 'ios' && (
          <Text style={[styles.iosDisclaimer, { color: colors.mutedForeground }]}>
            {t('ads.iosPaymentNote')}
          </Text>
        )}

        {/* Submit */}
        <Pressable
          onPress={handleSubmit}
          disabled={submitting || !title.trim()}
          style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting || !title.trim() ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('ads.publishAd')}
          accessibilityState={{ disabled: submitting || !title.trim() }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <>
              <Megaphone size={18} color={colors.primaryForeground} />
              <Text style={[styles.submitText, { color: colors.primaryForeground }]}>
                {t('ads.publishAd')} — {formatPrice(totalPrice)}
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
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
  headerTitle: { fontSize: 20, letterSpacing: -0.3, fontFamily: fonts.headingSemi },
  content: { padding: 16, gap: 8, paddingBottom: 64 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 8, fontFamily: fonts.bodySemi },
  input: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16, paddingVertical: 16, fontSize: 14, fontFamily: fonts.body,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  imagePicker: {
    borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
    height: 120, alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  imagePickerText: { fontSize: 13, fontFamily: fonts.body },
  imagePreview: { borderRadius: 12, overflow: 'hidden', position: 'relative' },
  previewImage: { width: '100%', height: 160, borderRadius: 12 },
  removeImage: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ctaChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  ctaChipText: { fontSize: 13, fontWeight: '500', fontFamily: fonts.bodyMedium },
  pickerBtn: { justifyContent: 'center' },
  neighborhoodList: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    maxHeight: 200, overflow: 'hidden',
  },
  neighborhoodItem: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  neighborhoodText: { fontSize: 14, fontFamily: fonts.body },
  durationRow: { flexDirection: 'row', gap: 10 },
  durationCard: {
    flex: 1, borderRadius: 12, borderWidth: 1.5,
    padding: 14, alignItems: 'center', gap: 2,
  },
  durationDays: { fontSize: 24, fontWeight: '800', fontFamily: fonts.heading },
  durationLabel: { fontSize: 12, fontFamily: fonts.body },
  durationPrice: { fontSize: 13, fontWeight: '600', marginTop: 4, fontFamily: fonts.bodySemi },
  priceCard: {
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 16, gap: 4,
  },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { fontSize: 14, fontFamily: fonts.body },
  priceValue: { fontSize: 18, fontWeight: '700', fontFamily: fonts.heading },
  proDiscount: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 12, marginTop: 8, minHeight: 48,
  },
  submitText: { fontSize: 16, fontWeight: '700', fontFamily: fonts.bodySemi },
  iosDisclaimer: { fontSize: 11, textAlign: 'center', lineHeight: 16, paddingHorizontal: 8, marginTop: 8, fontFamily: fonts.body },
})
