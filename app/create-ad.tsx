declare const __DEV__: boolean

import { useState, useCallback, useEffect } from 'react'
import { View, Text, TextInput, ScrollView, StyleSheet, ActivityIndicator, Linking, Platform, KeyboardAvoidingView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { X, Camera, Megaphone } from 'lucide-react-native'
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
import { PressableOpacity, KeyboardDoneAccessory, KEYBOARD_DONE_ID } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { mapErrorToFinnish } from '@/lib/errorMessages'
import type { Profile } from '@/lib/types'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

const DURATION_OPTIONS = [
  { days: 7, label: '7' },
  { days: 14, label: '14' },
  { days: 30, label: '30' },
]

const CTA_OPTIONS = [
  { key: 'learn_more', fi: 'Katso lisää', en: 'Learn more', sv: 'Läs mer' },
  { key: 'buy_now', fi: 'Osta nyt', en: 'Buy now', sv: 'Köp nu' },
  { key: 'book_now', fi: 'Varaa aika', en: 'Book now', sv: 'Boka nu' },
  { key: 'contact', fi: 'Ota yhteyttä', en: 'Contact us', sv: 'Kontakta oss' },
]

function getCtaLabel(opt: (typeof CTA_OPTIONS)[number], locale: string) {
  return locale === 'fi' ? opt.fi : locale === 'sv' ? opt.sv : opt.en
}

const PRICE_PER_DAY = 299 // cents
const PRO_PRICE_PER_DAY = 239 // cents

export default function CreateAdScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [ctaKey, setCtaKey] = useState(CTA_OPTIONS[0].key)
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
    checkAuth().catch(() => {})
  }, [supabase, router])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (data) {
        const p = data as unknown as Profile
        if (!p.is_business && !p.is_pro) {
          toast.show({ message: t('ads.businessRequired') ?? 'Business or Pro account required', type: 'error' })
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
      const ext = ((uri.split('.').pop() ?? 'jpg').split('?')[0]).toLowerCase()
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
      toast.show({ message: t('create.titleRequired'), type: 'error' })
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
        advertiser_id: profile.id,
        title: title.trim(),
        description: description.trim() || null,
        image_url: uploadedImageUrl,
        link_url: linkUrl.trim() || null,
        cta_text: getCtaLabel(CTA_OPTIONS.find(o => o.key === ctaKey) ?? CTA_OPTIONS[0], locale),
        target_naapurusto: targetNeighborhood,
        duration_days: duration,
        daily_rate: pricePerDay,
        total_cost: totalPrice,
        start_date: now.toISOString(),
        end_date: endDate.toISOString(),
        status: 'pending_payment',
      }).select('id').single()

      if (adError) throw adError

      // Rollback helper — deletes the orphaned ad row if Stripe session
      // creation fails. Without this, the ads table fills with zombie
      // pending_payment rows that never get reconciled.
      const rollbackAd = async () => {
        if (ad?.id) {
          await (supabase.from('advertisements') as any).delete().eq('id', ad.id).catch(() => {})
        }
      }

      // Create Stripe payment for the ad
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        await rollbackAd()
        throw new Error('Not authenticated')
      }

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
        await rollbackAd()
        throw new Error(body.error ?? 'Payment failed')
      }

      const { url } = await res.json()
      if (url) {
        await Linking.openURL(url).catch(() => {})
        // Don't navigate away — user will return via deep link after payment
        return
      }
      // No URL in response — treat as failure and roll back
      await rollbackAd()
    } catch (err: any) {
      toast.show({ message: mapErrorToFinnish(err, t), type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }, [title, description, imageUri, linkUrl, ctaKey, targetNeighborhood, duration, profile, pricePerDay, totalPrice, supabase, router, t, uploadImage])

  const formatPrice = (cents: number) => formatPriceUtil(cents / 100, locale)

  return (
    <ScreenErrorBoundary screenName="CreateAd">
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header — circle close + centered title */}
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <PressableOpacity
          onPress={() => router.back()}
          style={[styles.closeButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
        >
          <X size={18} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>{t('ads.create')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* Title */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{(t('create.title') + ' *').toUpperCase()}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, fontFamily: fonts.body }]}
          value={title}
          onChangeText={setTitle}
          placeholder={t('ads.titlePlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          maxLength={100}
        />

        {/* Description */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('create.description').toUpperCase()}</Text>
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, fontFamily: fonts.body }]}
          value={description}
          onChangeText={setDescription}
          placeholder={t('ads.descriptionPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={500}
          inputAccessoryViewID={KEYBOARD_DONE_ID}
        />

        {/* Photo uploader */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('create.addPhotos').toUpperCase()}</Text>
        {imageUri ? (
          <View style={styles.imagePreview}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} contentFit="cover" cachePolicy="memory-disk" />
            <PressableOpacity onPress={() => setImageUri(null)} style={[styles.removeImage, { backgroundColor: colors.foreground }]} accessibilityRole="button" accessibilityLabel={t('common.delete')}>
              <X size={14} color={colors.primaryForeground} />
            </PressableOpacity>
          </View>
        ) : (
          <PressableOpacity onPress={handlePickImage} style={[styles.imagePicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Camera size={28} color={colors.mutedForeground} />
            <Text style={[styles.imagePickerText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>{t('create.addPhotos')}</Text>
          </PressableOpacity>
        )}

        {/* Link URL */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('ads.linkUrl').toUpperCase()}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, fontFamily: fonts.body }]}
          value={linkUrl}
          onChangeText={setLinkUrl}
          placeholder="https://..."
          placeholderTextColor={colors.mutedForeground}
          keyboardType="url"
          autoCapitalize="none"
        />

        {/* CTA text */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('ads.ctaText').toUpperCase()}</Text>
        <View style={styles.ctaRow}>
          {CTA_OPTIONS.map(opt => (
            <PressableOpacity
              key={opt.key}
              onPress={() => setCtaKey(opt.key)}
              style={[
                styles.ctaChip,
                {
                  backgroundColor: ctaKey === opt.key ? colors.foreground : colors.card,
                  borderColor: ctaKey === opt.key ? colors.foreground : colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: ctaKey === opt.key }}
            >
              <Text
                style={[
                  styles.ctaChipText,
                  {
                    color: ctaKey === opt.key ? colors.primaryForeground : colors.foreground,
                    fontFamily: ctaKey === opt.key ? fonts.bodySemi : fonts.body,
                  },
                ]}
              >
                {getCtaLabel(opt, locale)}
              </Text>
            </PressableOpacity>
          ))}
        </View>

        {/* Target neighborhood */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('ads.targetNeighborhood').toUpperCase()}</Text>
        <PressableOpacity
          onPress={() => setShowNeighborhoods(!showNeighborhoods)}
          style={[styles.input, styles.pickerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Text style={{ color: targetNeighborhood ? colors.foreground : colors.mutedForeground, fontSize: 14, fontFamily: fonts.body }}>
            {targetNeighborhood ?? t('ads.allAreas')}
          </Text>
        </PressableOpacity>
        {showNeighborhoods && (
          <View style={[styles.neighborhoodList, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <PressableOpacity
              onPress={() => { setTargetNeighborhood(null); setShowNeighborhoods(false) }}
              style={[styles.neighborhoodItem, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.neighborhoodText, { color: !targetNeighborhood ? colors.foreground : colors.mutedForeground, fontFamily: !targetNeighborhood ? fonts.bodySemi : fonts.body }]}>
                {t('ads.allAreas')}
              </Text>
            </PressableOpacity>
            {(cityNeighborhoods.length > 0 ? cityNeighborhoods : NEIGHBORHOODS).map(n => (
              <PressableOpacity
                key={n}
                onPress={() => { setTargetNeighborhood(n); setShowNeighborhoods(false) }}
                style={[styles.neighborhoodItem, { borderBottomColor: colors.border }]}
              >
                <Text style={[styles.neighborhoodText, { color: targetNeighborhood === n ? colors.foreground : colors.mutedForeground, fontFamily: targetNeighborhood === n ? fonts.bodySemi : fonts.body }]}>
                  {n}
                </Text>
              </PressableOpacity>
            ))}
          </View>
        )}

        {/* Duration */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{t('ads.duration').toUpperCase()}</Text>
        <View style={styles.durationRow}>
          {DURATION_OPTIONS.map(opt => (
            <PressableOpacity
              key={opt.days}
              onPress={() => setDuration(opt.days)}
              style={[
                styles.durationCard,
                {
                  backgroundColor: colors.card,
                  borderColor: duration === opt.days ? colors.foreground : colors.border,
                  borderWidth: duration === opt.days ? 1.5 : 1,
                },
              ]}
            >
              <Text style={[styles.durationDays, { color: colors.foreground, fontFamily: fonts.heading }]}>
                {opt.label}
              </Text>
              <Text style={[styles.durationLabel, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                {t('common.daysShort')}
              </Text>
              <Text style={[styles.durationPrice, { color: colors.mutedForeground, fontFamily: fonts.bodySemi }]}>
                {formatPrice(opt.days * pricePerDay)}
              </Text>
            </PressableOpacity>
          ))}
        </View>

        {/* Price summary */}
        <View style={[styles.priceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.priceRow}>
            <Text style={[styles.priceLabel, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
              {duration} {t('common.daysShort')} x {formatPrice(pricePerDay)}/{t('common.daysShort')}
            </Text>
            <Text style={[styles.priceValue, { color: colors.foreground, fontFamily: fonts.heading }]}>
              {formatPrice(totalPrice)}
            </Text>
          </View>
          {profile?.is_pro && (
            <Text style={[styles.proDiscount, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
              Pro -20%
            </Text>
          )}
        </View>

        {/* iOS disclaimer — ad campaigns are B2B transactions via Stripe */}
        {Platform.OS === 'ios' && (
          <Text style={[styles.iosDisclaimer, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
            {t('ads.iosPaymentNote')}
          </Text>
        )}
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <PressableOpacity
          onPress={handleSubmit}
          disabled={submitting || !title.trim()}
          style={[styles.submitBtn, { backgroundColor: colors.foreground, opacity: submitting || !title.trim() ? 0.4 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('ads.publishAd')}
          accessibilityState={{ disabled: submitting || !title.trim() }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <>
              <Megaphone size={18} color={colors.primaryForeground} />
              <Text style={[styles.submitText, { color: colors.primaryForeground, fontFamily: fonts.bodySemi }]}>
                {t('ads.publishAd')} — {formatPrice(totalPrice)}
              </Text>
            </>
          )}
        </PressableOpacity>
      </View>
      <KeyboardDoneAccessory />
    </KeyboardAvoidingView>
    </ScreenErrorBoundary>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  headerTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  headerSpacer: {
    width: 36,
  },
  content: { padding: 16, gap: 4 },
  sectionLabel: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    justifyContent: 'center',
  },
  textArea: {
    minHeight: 100,
    height: undefined,
    paddingTop: 14,
    paddingBottom: 14,
    textAlignVertical: 'top',
  },
  imagePicker: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    aspectRatio: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imagePickerText: { fontSize: 13 },
  imagePreview: { borderRadius: 20, overflow: 'hidden', position: 'relative' },
  previewImage: { width: '100%', height: 200, borderRadius: 20 },
  removeImage: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ctaChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  ctaChipText: { fontSize: 13 },
  pickerBtn: { justifyContent: 'center' },
  neighborhoodList: {
    borderRadius: 20,
    borderWidth: 1,
    maxHeight: 200,
    overflow: 'hidden',
  },
  neighborhoodItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  neighborhoodText: { fontSize: 14 },
  durationRow: { flexDirection: 'row', gap: 12 },
  durationCard: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  durationDays: { fontSize: 24 },
  durationLabel: { fontSize: 12 },
  durationPrice: { fontSize: 13, marginTop: 4 },
  priceCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 4,
    marginTop: 8,
  },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { fontSize: 14 },
  priceValue: { fontSize: 18 },
  proDiscount: { fontSize: 12 },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 999,
  },
  submitText: { fontSize: 16, fontWeight: '600' },
  iosDisclaimer: { fontSize: 11, textAlign: 'center', lineHeight: 16, paddingHorizontal: 8, marginTop: 8 },
})
