declare const __DEV__: boolean

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import {
  ChevronLeft,
  Plus,
  Minus,
  X,
  Check,
  ImagePlus,
  GripVertical,
  AlertTriangle,
  ChevronRight,
  MapPin,
  Clock,
  Lightbulb,
  Zap,
  Wrench,
  Bike,
  Sofa,
} from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { getCachedUserId } from '@/lib/authCache'
import { trackEvent } from '@/lib/analytics'
import { useToast } from '@/components/Toast'
import { uriToArrayBuffer } from '@/lib/uploadHelpers'
import { safeBack } from '@/lib/navigation'

const TOTAL_STEPS = 7

// ── Templates (Step 1) ──
const TEMPLATE_ICONS: Record<string, (props: { size: number; color: string; strokeWidth: number }) => React.JSX.Element> = {
  drill: (p) => <Wrench {...p} />,
  bike: (p) => <Bike {...p} />,
  furniture: (p) => <Sofa {...p} />,
  blank: (p) => <Plus {...p} />,
}


// ── Checklist tabs (Step 6) ──
type ChecklistTab = 'instructions' | 'before' | 'return'

interface ChecklistItem {
  id: string
  text: string
}

function NewListingScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()

  // ── Localized data arrays ──
  const TEMPLATES = useMemo(() => [
    { key: 'drill', name: t('newListing.templateDrill'), cat: t('newListing.templateDrillCat') },
    { key: 'bike', name: t('newListing.templateBike'), cat: t('newListing.templateBikeCat') },
    { key: 'furniture', name: t('newListing.templateFurniture'), cat: t('newListing.templateFurnitureCat') },
    { key: 'blank', name: t('newListing.templateBlank'), cat: t('newListing.templateBlankCat') },
  ], [t])

  const PRICING_MODELS = useMemo(() => [
    { key: 'free', label: t('newListing.pricingFree'), sub: t('newListing.pricingFreeSub') },
    { key: 'daily', label: t('newListing.pricingDaily'), sub: t('newListing.pricingDailySub') },
    { key: 'weekly', label: t('newListing.pricingWeekly'), sub: t('newListing.pricingWeeklySub') },
    { key: 'flat', label: t('newListing.pricingFlat'), sub: t('newListing.pricingFlatSub') },
  ], [t])

  const PICKUP_METHODS = useMemo(() => [
    { key: 'meeting', label: t('newListing.pickupMeeting'), sub: t('newListing.pickupMeetingSub') },
    { key: 'lockbox', label: t('newListing.pickupLockbox'), sub: t('newListing.pickupLockboxSub') },
    { key: 'shipping', label: t('newListing.pickupShipping'), sub: t('newListing.pickupShippingSub') },
  ], [t])

  const WEEKDAYS = useMemo(() => [
    t('newListing.weekdayMon'), t('newListing.weekdayTue'), t('newListing.weekdayWed'),
    t('newListing.weekdayThu'), t('newListing.weekdayFri'), t('newListing.weekdaySat'),
    t('newListing.weekdaySun'),
  ], [t])
  const scrollRef = useRef<ScrollView>(null)
  const { width: SCREEN_WIDTH } = useWindowDimensions()

  const [currentStep, setCurrentStep] = useState(0)
  const [publishing, setPublishing] = useState(false)

  // ── Step 1: Template & basics ──
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [condition, setCondition] = useState('')

  // ── Step 2: Photos & description ──
  const [photos, setPhotos] = useState<string[]>([])
  const [photoErrors, setPhotoErrors] = useState<Set<number>>(new Set())
  const [previewImgError, setPreviewImgError] = useState(false)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')

  // ── Step 3: Pricing & deposit ──
  const [pricingModel, setPricingModel] = useState('free')
  const [price, setPrice] = useState('')
  const [deposit, setDeposit] = useState(30)

  // ── Step 4: Availability ──
  const [weekdays, setWeekdays] = useState<boolean[]>([true, true, true, true, true, false, false])
  const [blockedDays, setBlockedDays] = useState<Set<number>>(new Set())
  const [pickupTimeStart, setPickupTimeStart] = useState('16:00')
  const [pickupTimeEnd, setPickupTimeEnd] = useState('21:00')
  const [returnTimeStart, setReturnTimeStart] = useState('16:00')
  const [returnTimeEnd, setReturnTimeEnd] = useState('21:00')

  // ── Step 5: Pickup ──
  const [address, setAddress] = useState('')
  const [pickupMethod, setPickupMethod] = useState('meeting')

  // ── Step 6: Checklists ──
  const [checklistTab, setChecklistTab] = useState<ChecklistTab>('before')
  const [checklists, setChecklists] = useState<Record<ChecklistTab, ChecklistItem[]>>({
    instructions: [],
    before: [],
    return: [],
  })

  // ── Step 7: Rules ──
  const [rules, setRules] = useState<string[]>([])
  const [ruleInput, setRuleInput] = useState('')

  // ── Navigation ──
  const goToStep = useCallback((step: number) => {
    if (step < 0 || step >= TOTAL_STEPS) return
    scrollRef.current?.scrollTo({ x: step * SCREEN_WIDTH, animated: true })
    setCurrentStep(step)
    try { Haptics.selectionAsync() } catch {}
  }, [SCREEN_WIDTH])

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const step = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
    if (step >= 0 && step < TOTAL_STEPS) {
      setCurrentStep(step)
    }
  }, [SCREEN_WIDTH])

  // ── Photo picker ──
  const pickPhoto = useCallback(async () => {
    if (photos.length >= 6) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 6 - photos.length,
      quality: 0.8,
    })
    if (!result.canceled) {
      setPhotos(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 6))
      setPhotoErrors(new Set())
      setPreviewImgError(false)
    }
  }, [photos.length])

  const removePhoto = useCallback((index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
    setPhotoErrors(prev => {
      const next = new Set<number>()
      prev.forEach(errIdx => { if (errIdx < index) next.add(errIdx); else if (errIdx > index) next.add(errIdx - 1) })
      return next
    })
    if (index === 0) setPreviewImgError(false)
  }, [])

  // ── Add tag ──
  const addTag = useCallback(() => {
    const trimmed = tagInput.trim()
    if (trimmed && !tags.includes(trimmed)) {
      setTags(prev => [...prev, trimmed.startsWith('#') ? trimmed : `#${trimmed}`])
      setTagInput('')
    }
  }, [tagInput, tags])

  // ── Add checklist item ──
  const addChecklistItem = useCallback((tab: ChecklistTab, text: string) => {
    if (!text.trim()) return
    setChecklists(prev => ({
      ...prev,
      [tab]: [...prev[tab], { id: Date.now().toString(), text: text.trim() }],
    }))
  }, [])

  const removeChecklistItem = useCallback((tab: ChecklistTab, id: string) => {
    setChecklists(prev => ({
      ...prev,
      [tab]: prev[tab].filter(item => item.id !== id),
    }))
  }, [])

  // ── Add rule ──
  const addRule = useCallback(() => {
    if (ruleInput.trim() && !rules.includes(ruleInput.trim())) {
      setRules(prev => [...prev, ruleInput.trim()])
      setRuleInput('')
    }
  }, [ruleInput, rules])

  const removeRule = useCallback((index: number) => {
    setRules(prev => prev.filter((_, i) => i !== index))
  }, [])

  // ── Toggle blocked day ──
  const toggleBlockedDay = useCallback((day: number) => {
    setBlockedDays(prev => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }, [])

  // ── Publish ──
  const handlePublish = useCallback(async (isDraft: boolean) => {
    if (!title.trim()) {
      toast.show({ message: t('newListing.errorNoTitle'), type: 'error' })
      return
    }
    setPublishing(true)
    try {
      const userId = await getCachedUserId()
      if (!userId) { router.replace('/(auth)/login'); return }

      // Upload images inline (same pattern as create.tsx)
      const imageUrls: string[] = []
      let failedUploads = 0
      for (let i = 0; i < photos.length; i++) {
        const uri = photos[i]
        if (uri.startsWith('http')) { imageUrls.push(uri); continue }
        try {
          const response = await fetch(uri)
          if (!response.ok) { if (__DEV__) console.warn(`[new-listing] image fetch failed: ${response.status}`); failedUploads++; continue }
          const blob = await response.blob()
          const mimeType = blob.type || 'image/jpeg'
          const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : (mimeType.split('/')[1] || 'jpg')
          const tempId = Date.now().toString()
          const path = `${userId}/${tempId}/${i}.${ext}`
          const arrayBuffer = await uriToArrayBuffer(uri)
          const { error: uploadError } = await supabase.storage
            .from('post-images')
            .upload(path, arrayBuffer, { contentType: mimeType, upsert: true })
          if (uploadError) {
            if (__DEV__) console.warn('[new-listing] image upload failed:', uploadError.message)
            failedUploads++
          } else {
            const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path)
            imageUrls.push(urlData.publicUrl)
          }
        } catch (e) {
          if (__DEV__) console.warn('[new-listing] image upload error:', e)
          failedUploads++
        }
      }
      if (failedUploads > 0) {
        toast.show({ message: `${failedUploads} ${t('newListing.imageUploadsFailed') ?? 'image(s) failed to upload'}`, type: 'info' })
      }

      const postData: Record<string, any> = {
        user_id: userId,
        type: 'lainaa' as const,
        title: title.trim(),
        description: description.trim() || null,
        image_url: imageUrls[0] || null,
        location: address.trim() || null,
        daily_fee: pricingModel === 'free' ? 0 : parseFloat(price) || 0,
        tags: tags.length > 0 ? tags : null,
        is_active: !isDraft,
        is_pro_listing: false,
      }

      // Pre-return checklist drives the LoanActive + Return screens for
      // borrowers of this item. Only set when the lender authored items
      // in the step-6 'return' tab — empty array is fine but writing
      // nothing avoids hitting a missing column on unmigrated DBs.
      if (checklists.return.length > 0) {
        postData.pre_return_checklist = checklists.return.map((item, idx) => ({
          key: item.id || `step_${idx}`,
          label: item.text,
        }))
      }

      let post: { id: string } | null = null
      let firstError: any = null
      {
        const res = await (supabase.from('posts') as any)
          .insert(postData)
          .select('id')
          .single()
        post = res.data
        firstError = res.error
      }

      // Retry without pre_return_checklist if the column doesn't exist yet
      // on this project. The slice 1 SQL migration adds the column; until
      // it's applied, pre-existing publishes should still work for listings
      // that author a return checklist.
      if (firstError && /pre_return_checklist/i.test(firstError.message ?? '')) {
        if (__DEV__) console.warn('[new-listing] retrying without pre_return_checklist (column missing on DB)')
        const { pre_return_checklist: _drop, ...withoutChecklist } = postData
        const res = await (supabase.from('posts') as any)
          .insert(withoutChecklist)
          .select('id')
          .single()
        post = res.data
        firstError = res.error
      }

      if (firstError) throw firstError

      // Insert additional images
      if (imageUrls.length > 1 && post?.id) {
        const imageRows = imageUrls.map((url, i) => ({
          post_id: post.id,
          image_url: url,
          sort_order: i,
        }))
        const { error: imgError } = await (supabase.from('post_images') as any).insert(imageRows)
        if (imgError && __DEV__) console.warn('[new-listing] post_images insert failed:', imgError.message)
      }

      trackEvent('listing_published', { draft: isDraft, template: selectedTemplate })

      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
      router.replace(isDraft ? '/(tabs)/profile' : `/post/${post?.id}`)
    } catch (err: any) {
      if (__DEV__) {
        console.warn('[new-listing] publish failed:', err?.message ?? err, err?.code, err?.details, err?.hint)
      }
      toast.show({ message: t('newListing.errorPublishFailed'), type: 'error' })
    } finally {
      setPublishing(false)
    }
  }, [title, description, photos, address, pricingModel, price, tags, selectedTemplate, supabase, router, toast])

  // ════════════════════════════════════════════════════════════════════════════
  // SHARED CHROME — Wizard Header
  // ════════════════════════════════════════════════════════════════════════════
  const renderWizardHeader = (step: number, stepTitle: string) => (
    <View style={[s.wizHeader, { paddingTop: insets.top + 16 }]}>
      <View style={s.wizHeaderRow}>
        {step > 0 ? (
          <PressableOpacity
            onPress={() => goToStep(step - 1)}
            style={[s.circleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            hitSlop={8}
            accessibilityLabel={t('common.back')}
            accessibilityRole="button"
          >
            <ChevronLeft size={13} color={colors.foreground} strokeWidth={2.2} />
          </PressableOpacity>
        ) : (
          <PressableOpacity
            onPress={() => safeBack(router, '/(tabs)/create')}
            style={[s.circleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            hitSlop={8}
            accessibilityLabel={t('common.close')}
            accessibilityRole="button"
          >
            <X size={13} color={colors.foreground} strokeWidth={2.2} />
          </PressableOpacity>
        )}
        <Text style={[s.wizStepLabel, { color: colors.mutedForeground }]}>
          {t('newListing.stepLabel', { step: step + 1, total: TOTAL_STEPS })}
        </Text>
        <PressableOpacity
          onPress={() => handlePublish(true)}
          hitSlop={8}
          accessibilityLabel={t('newListing.saveDraftAccessibility')}
          accessibilityRole="button"
        >
          <Text style={[s.wizSaveLabel, { color: colors.mutedForeground }]}>{t('newListing.saveDraft')}</Text>
        </PressableOpacity>
      </View>
      {/* Progress bars */}
      <View style={s.wizProgressRow}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View
            key={i}
            style={[
              s.wizProgressBar,
              { backgroundColor: i <= step ? colors.foreground : colors.border },
            ]}
          />
        ))}
      </View>
      <Text style={[s.wizTitle, { color: colors.foreground }]} accessibilityRole="header">{stepTitle}</Text>
    </View>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // SHARED CHROME — CTA Button
  // ════════════════════════════════════════════════════════════════════════════
  const renderCTA = (label: string, onPress: () => void, secondary?: { label: string; onPress: () => void }) => (
    <View style={[s.ctaArea, { paddingBottom: insets.bottom + 22 }]}>
      <View style={s.ctaRow}>
        {secondary && (
          <PressableOpacity
            onPress={secondary.onPress}
            style={[s.ctaSecondary, { backgroundColor: colors.card, borderColor: colors.border }]}
            accessibilityRole="button"
          >
            <Text style={[s.ctaSecondaryText, { color: colors.foreground }]}>{secondary.label}</Text>
          </PressableOpacity>
        )}
        <PressableOpacity
          onPress={onPress}
          style={[s.ctaPrimary, { backgroundColor: colors.foreground, flex: secondary ? 1 : undefined }]}
          accessibilityRole="button"
        >
          {publishing ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={[s.ctaPrimaryText, { color: colors.background }]}>{label}</Text>
          )}
        </PressableOpacity>
      </View>
    </View>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 1 — Template & Basic Info
  // ════════════════════════════════════════════════════════════════════════════
  const renderStep1 = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {renderWizardHeader(0, t('newListing.step1Title'))}

        {/* Templates grid */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('newListing.popularTemplates')}</Text>
          <View style={s.templateGrid}>
            {TEMPLATES.map((tmpl, i) => {
              const isSelected = selectedTemplate === tmpl.key
              const isLast = i === TEMPLATES.length - 1
              return (
                <PressableOpacity
                  key={tmpl.key}
                  onPress={() => {
                    setSelectedTemplate(tmpl.key)
                    try { Haptics.selectionAsync() } catch {}
                  }}
                  style={[
                    s.templateCard,
                    {
                      backgroundColor: isSelected ? colors.foreground : colors.card,
                      borderColor: isSelected ? colors.foreground : colors.border,
                      borderWidth: 1,
                      borderStyle: isLast ? 'dashed' : 'solid',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={[s.templateIconWrap, { opacity: isLast ? 0.4 : 1 }]}>
                    {TEMPLATE_ICONS[tmpl.key]?.({
                      size: 24,
                      color: isSelected ? colors.background : colors.foreground,
                      strokeWidth: 1.5,
                    })}
                  </View>
                  <View>
                    <Text style={[s.templateName, { color: isSelected ? colors.background : colors.foreground }]}>
                      {tmpl.name}
                    </Text>
                    <Text style={[s.templateCat, { color: isSelected ? colors.onInkMuted : colors.mutedForeground }]}>
                      {tmpl.cat}
                    </Text>
                  </View>
                </PressableOpacity>
              )
            })}
          </View>
        </View>

        {/* Basic fields */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('newListing.basicInfo')}</Text>
          <View style={[s.fieldsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.fieldRow}>
              <Text style={[s.fieldLabel, { color: colors.tertiaryForeground }]}>{t('newListing.titleLabel')}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t('newListing.titlePlaceholder')}
                placeholderTextColor={colors.tertiaryForeground}
                style={[s.fieldValue, { color: colors.foreground, fontFamily: fonts.bodySemi }]}
              />
            </View>
            <View style={[s.fieldDivider, { backgroundColor: colors.border }]} />
            <View style={s.fieldRow}>
              <Text style={[s.fieldLabel, { color: colors.tertiaryForeground }]}>{t('newListing.categoryLabel')}</Text>
              <TextInput
                value={category}
                onChangeText={setCategory}
                placeholder={t('newListing.categoryPlaceholder')}
                placeholderTextColor={colors.tertiaryForeground}
                style={[s.fieldValue, { color: colors.foreground, fontFamily: fonts.bodySemi }]}
              />
            </View>
            <View style={[s.fieldDivider, { backgroundColor: colors.border }]} />
            <View style={s.fieldRow}>
              <Text style={[s.fieldLabel, { color: colors.tertiaryForeground }]}>{t('newListing.conditionLabel')}</Text>
              <TextInput
                value={condition}
                onChangeText={setCondition}
                placeholder={t('newListing.conditionPlaceholder')}
                placeholderTextColor={colors.tertiaryForeground}
                style={[s.fieldValue, { color: colors.foreground, fontFamily: fonts.bodySemi }]}
              />
            </View>
          </View>
        </View>
      </ScrollView>
      {renderCTA(t('newListing.continueToPhotos'), () => goToStep(1))}
    </View>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 2 — Photos & Description
  // ════════════════════════════════════════════════════════════════════════════
  const renderStep2 = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {renderWizardHeader(1, t('newListing.step2Title'))}

        {/* Photo grid */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
            {t('newListing.photosLabel')} · {photos.length} / 6
          </Text>
          <View style={s.photoGrid}>
            {photos.map((uri, i) => (
              <View key={i} style={s.photoCell}>
                {photoErrors.has(i) ? (
                  <View style={[s.photoImage, { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                    <AlertTriangle size={20} color={colors.mutedForeground} strokeWidth={1.5} />
                  </View>
                ) : (
                  <Image source={{ uri }} style={s.photoImage} contentFit="cover" onError={() => setPhotoErrors(prev => { const next = new Set(prev); next.add(i); return next })} />
                )}
                {i === 0 && (
                  <View style={[s.photoBadge, { backgroundColor: colors.foreground }]}>
                    <Text style={[s.photoBadgeText, { color: colors.background }]}>{t('newListing.photoBadgeMain')}</Text>
                  </View>
                )}
                <PressableOpacity
                  onPress={() => removePhoto(i)}
                  style={[s.photoRemove, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
                  hitSlop={12}
                >
                  <X size={10} color="#fff" strokeWidth={2.5} />
                </PressableOpacity>
              </View>
            ))}
            {photos.length < 6 && (
              <PressableOpacity
                onPress={pickPhoto}
                style={[s.photoAdd, { backgroundColor: colors.card, borderColor: colors.border }]}
                accessibilityLabel={t('newListing.addPhotoAccessibility')}
                accessibilityRole="button"
              >
                <Plus size={20} color={colors.mutedForeground} strokeWidth={2} />
                <Text style={[s.photoAddText, { color: colors.mutedForeground }]}>{t('newListing.addPhoto')}</Text>
              </PressableOpacity>
            )}
          </View>
          <Text style={[s.photoHint, { color: colors.mutedForeground }]}>
            {t('newListing.photoHint')}
          </Text>
        </View>

        {/* Description */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('newListing.descriptionLabel')}</Text>
          <View style={[s.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('newListing.descriptionPlaceholder')}
              placeholderTextColor={colors.tertiaryForeground}
              style={[s.descInput, { color: colors.foreground, fontFamily: fonts.body }]}
              multiline
              textAlignVertical="top"
            />
          </View>
          {/* Tags */}
          <View style={s.tagRow}>
            {tags.map((tag) => (
              <PressableOpacity
                key={tag}
                onPress={() => setTags(prev => prev.filter(t2 => t2 !== tag))}
                style={[s.tagPill, { backgroundColor: colors.warmTint }]}
              >
                <Text style={[s.tagText, { color: colors.foreground }]}>{tag}</Text>
              </PressableOpacity>
            ))}
            <View style={[s.tagAddPill, { borderColor: colors.border }]}>
              <TextInput
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={addTag}
                placeholder={t('newListing.tagPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                style={[s.tagAddInput, { color: colors.foreground, fontFamily: fonts.bodyMedium }]}
                returnKeyType="done"
              />
            </View>
          </View>
        </View>
      </ScrollView>
      {renderCTA(t('newListing.continueToPrice'), () => goToStep(2))}
    </View>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 3 — Pricing & Deposit
  // ════════════════════════════════════════════════════════════════════════════
  const renderStep3 = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {renderWizardHeader(2, t('newListing.step3Title'))}

        {/* Pricing model grid */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('newListing.pricingModelLabel')}</Text>
          <View style={s.pricingGrid}>
            {PRICING_MODELS.map((model) => {
              const isSelected = pricingModel === model.key
              return (
                <PressableOpacity
                  key={model.key}
                  onPress={() => { setPricingModel(model.key); try { Haptics.selectionAsync() } catch {} }}
                  style={[
                    s.pricingCard,
                    {
                      backgroundColor: isSelected ? colors.foreground : colors.card,
                      borderColor: isSelected ? colors.foreground : colors.border,
                      borderWidth: 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[s.pricingLabel, { color: isSelected ? colors.background : colors.foreground }]}>
                    {model.label}
                  </Text>
                  <Text style={[s.pricingSub, { color: isSelected ? colors.onInkMuted : colors.mutedForeground }]}>
                    {model.sub}
                  </Text>
                </PressableOpacity>
              )
            })}
          </View>
          {pricingModel !== 'free' && (
            <View style={[s.priceInputCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.fieldLabel, { color: colors.tertiaryForeground }]}>{t('newListing.priceLabel')}</Text>
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="0"
                placeholderTextColor={colors.tertiaryForeground}
                style={[s.fieldValue, { color: colors.foreground, fontFamily: fonts.heading, fontSize: 24 }]}
                keyboardType="numeric"
              />
            </View>
          )}
        </View>

        {/* Deposit */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('newListing.depositLabel')}</Text>
          <View style={[s.depositCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.depositRow}>
              <Text style={[s.depositAmount, { color: colors.foreground }]}>{deposit}</Text>
              <Text style={[s.depositCurrency, { color: colors.mutedForeground }]}>€</Text>
              <View style={{ flex: 1 }} />
              <View style={s.depositControls}>
                <PressableOpacity
                  onPress={() => setDeposit(prev => Math.max(0, prev - 5))}
                  style={[s.depositBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                  accessibilityLabel={t('newListing.depositDecrease')}
                >
                  <Minus size={18} color={colors.foreground} strokeWidth={1.5} />
                </PressableOpacity>
                <PressableOpacity
                  onPress={() => setDeposit(prev => prev + 5)}
                  style={[s.depositBtnDark, { backgroundColor: colors.foreground }]}
                  accessibilityLabel={t('newListing.depositIncrease')}
                >
                  <Plus size={18} color={colors.background} strokeWidth={1.5} />
                </PressableOpacity>
              </View>
            </View>
            <Text style={[s.depositHint, { color: colors.mutedForeground }]}>
              {t('newListing.depositHint')}
            </Text>
          </View>
        </View>

        {/* Suggestion */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('newListing.suggestionLabel')}</Text>
          <View style={[s.suggestionCard, { backgroundColor: colors.warmTint }]}>
            <View style={[s.suggestionIcon, { backgroundColor: colors.foreground }]}>
              <Lightbulb size={14} color={colors.background} />
            </View>
            <Text style={[s.suggestionText, { color: colors.foreground }]}>
              {t('newListing.suggestionText', { range: '25–40 €' })}
            </Text>
          </View>
        </View>
      </ScrollView>
      {renderCTA(t('newListing.continueToAvailability'), () => goToStep(3))}
    </View>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 4 — Availability & Calendar
  // ════════════════════════════════════════════════════════════════════════════
  const daysInMonth = 31 // Simplified
  const startDayOffset = 2 // Month starts on Wednesday (0-indexed from Monday)

  const renderStep4 = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {renderWizardHeader(3, t('newListing.step4Title'))}

        {/* Weekday picker */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
            {t('newListing.weekdaysLabel')}
          </Text>
          <View style={s.weekdayRow}>
            {WEEKDAYS.map((day, i) => {
              const on = weekdays[i]
              return (
                <PressableOpacity
                  key={day}
                  onPress={() => {
                    setWeekdays(prev => prev.map((v, j) => j === i ? !v : v))
                    try { Haptics.selectionAsync() } catch {}
                  }}
                  style={[
                    s.weekdayBtn,
                    {
                      backgroundColor: on ? colors.foreground : colors.card,
                      borderColor: on ? colors.foreground : colors.border,
                      borderWidth: 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.weekdayText, { color: on ? colors.background : colors.foreground }]}>
                    {day}
                  </Text>
                </PressableOpacity>
              )
            })}
          </View>
        </View>

        {/* Calendar */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
            {t('newListing.calendarLabel')}
          </Text>
          <View style={[s.calendarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Day headers */}
            <View style={s.calendarRow}>
              {WEEKDAYS.map(d => (
                <View key={d} style={s.calendarCell}>
                  <Text style={[s.calendarDayHeader, { color: colors.tertiaryForeground }]}>{d}</Text>
                </View>
              ))}
            </View>
            {/* Day cells */}
            {Array.from({ length: 5 }).map((_, weekIdx) => (
              <View key={weekIdx} style={s.calendarRow}>
                {Array.from({ length: 7 }).map((_, dayIdx) => {
                  const dayNum = weekIdx * 7 + dayIdx - startDayOffset + 1
                  if (dayNum < 1 || dayNum > daysInMonth) {
                    return <View key={dayIdx} style={s.calendarCell} />
                  }
                  const isBlocked = blockedDays.has(dayNum)
                  return (
                    <PressableOpacity
                      key={dayIdx}
                      onPress={() => toggleBlockedDay(dayNum)}
                      style={[
                        s.calendarCell,
                        s.calendarDayBtn,
                        {
                          backgroundColor: isBlocked ? colors.warmTint : 'transparent',
                          borderRadius: 8,
                        },
                      ]}
                    >
                      <Text style={[
                        s.calendarDayNum,
                        {
                          color: isBlocked ? colors.tertiaryForeground : colors.foreground,
                          textDecorationLine: isBlocked ? 'line-through' : 'none',
                          fontFamily: fonts.bodyMedium,
                        },
                      ]}>
                        {dayNum}
                      </Text>
                    </PressableOpacity>
                  )
                })}
              </View>
            ))}
            {/* Legend */}
            <View style={[s.calendarLegend, { borderTopColor: colors.border }]}>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: colors.warmTint }]} />
                <Text style={[s.legendText, { color: colors.mutedForeground }]}>{t('newListing.blockedLegend')}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Time windows */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('newListing.timeWindowsLabel')}</Text>
          <View style={[s.timeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.timeRow}>
              <Text style={[s.timeLabel, { color: colors.foreground }]}>{t('newListing.timePickup')}</Text>
              <Text style={[s.timeValue, { color: colors.mutedForeground }]}>
                {pickupTimeStart} – {pickupTimeEnd}
              </Text>
            </View>
            <View style={[s.fieldDivider, { backgroundColor: colors.border, marginVertical: 8 }]} />
            <View style={s.timeRow}>
              <Text style={[s.timeLabel, { color: colors.foreground }]}>{t('newListing.timeReturn')}</Text>
              <Text style={[s.timeValue, { color: colors.mutedForeground }]}>
                {returnTimeStart} – {returnTimeEnd}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
      {renderCTA(t('newListing.continueToPickup'), () => goToStep(4))}
    </View>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 5 — Pickup Instructions
  // ════════════════════════════════════════════════════════════════════════════
  const renderStep5 = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {renderWizardHeader(4, t('newListing.step5Title'))}

        {/* Location */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('newListing.locationLabel')}</Text>
          <View style={[s.locationCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Mini map placeholder */}
            <View style={[s.miniMap, { backgroundColor: colors.muted }]}>
              <MapPin size={24} color={colors.foreground} />
            </View>
            <View style={s.locationInfo}>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder={t('newListing.addressPlaceholder')}
                placeholderTextColor={colors.tertiaryForeground}
                style={[s.locationAddress, { color: colors.foreground, fontFamily: fonts.bodySemi }]}
              />
              <Text style={[s.locationHint, { color: colors.mutedForeground }]}>
                {t('newListing.addressHint')}
              </Text>
            </View>
          </View>
        </View>

        {/* Pickup method */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('newListing.pickupMethodLabel')}</Text>
          <View style={s.pickupMethods}>
            {PICKUP_METHODS.map((method) => {
              const isSelected = pickupMethod === method.key
              return (
                <PressableOpacity
                  key={method.key}
                  onPress={() => { setPickupMethod(method.key); try { Haptics.selectionAsync() } catch {} }}
                  style={[
                    s.pickupCard,
                    {
                      backgroundColor: isSelected ? colors.foreground : colors.card,
                      borderColor: isSelected ? colors.foreground : colors.border,
                      borderWidth: 1,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={[s.radioOuter, { borderColor: isSelected ? colors.background : colors.border }]}>
                    {isSelected && <View style={[s.radioInner, { backgroundColor: colors.background }]} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.pickupLabel, { color: isSelected ? colors.background : colors.foreground }]}>
                      {method.label}
                    </Text>
                    <Text style={[s.pickupSub, { color: isSelected ? colors.onInkMuted : colors.mutedForeground }]}>
                      {method.sub}
                    </Text>
                  </View>
                </PressableOpacity>
              )
            })}
          </View>
        </View>
      </ScrollView>
      {renderCTA(t('newListing.continueToInstructions'), () => goToStep(5))}
    </View>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 6 — Checklists
  // ════════════════════════════════════════════════════════════════════════════
  const [newCheckItem, setNewCheckItem] = useState('')

  const renderStep6 = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {renderWizardHeader(5, t('newListing.step6Title'))}

        {/* Tab segment */}
        <View style={s.section}>
          <View style={[s.segmentRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {(['instructions', 'before', 'return'] as ChecklistTab[]).map((tab) => {
              const on = checklistTab === tab
              const labels: Record<ChecklistTab, string> = {
                instructions: t('newListing.checklistInstructions'),
                before: t('newListing.checklistBefore'),
                return: t('newListing.checklistReturn'),
              }
              return (
                <PressableOpacity
                  key={tab}
                  onPress={() => setChecklistTab(tab)}
                  style={[
                    s.segmentTab,
                    {
                      backgroundColor: on ? colors.card : 'transparent',
                      ...(on ? { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : {}),
                    },
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.segmentTabText, { color: on ? colors.foreground : colors.mutedForeground }]}>
                    {labels[tab]}{' '}
                    <Text style={{ color: on ? colors.mutedForeground : colors.tertiaryForeground, fontWeight: '500', fontFamily: fonts.bodyMedium }}>
                      · {checklists[tab].length}
                    </Text>
                  </Text>
                </PressableOpacity>
              )
            })}
          </View>
        </View>

        {/* Checklist items */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
            {checklistTab === 'before' ? t('newListing.checklistBeforeDesc') :
              checklistTab === 'instructions' ? t('newListing.checklistInstructionsDesc') : t('newListing.checklistReturnDesc')}
          </Text>
          {checklists[checklistTab].map((item, i) => (
            <View key={item.id} style={[s.checkItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.checkNum, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[s.checkNumText, { color: colors.mutedForeground }]}>{i + 1}</Text>
              </View>
              <Text style={[s.checkText, { color: colors.foreground }]}>{item.text}</Text>
              <PressableOpacity
                onPress={() => removeChecklistItem(checklistTab, item.id)}
                hitSlop={8}
              >
                <X size={12} color={colors.tertiaryForeground} strokeWidth={2} />
              </PressableOpacity>
            </View>
          ))}
          {/* Add new item */}
          <View style={[s.checkItem, s.checkItemDashed, { borderColor: colors.border }]}>
            <View style={[s.checkNum, s.checkNumDashed, { borderColor: colors.border }]}>
              <Plus size={10} color={colors.mutedForeground} strokeWidth={2.5} />
            </View>
            <TextInput
              value={newCheckItem}
              onChangeText={setNewCheckItem}
              onSubmitEditing={() => {
                addChecklistItem(checklistTab, newCheckItem)
                setNewCheckItem('')
              }}
              placeholder={t('newListing.addStep')}
              placeholderTextColor={colors.mutedForeground}
              style={[s.checkAddInput, { color: colors.foreground, fontFamily: fonts.body }]}
              returnKeyType="done"
            />
          </View>
        </View>

        {/* Suggestion pills */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('newListing.suggestionsLabel')}</Text>
          <View style={s.suggestPills}>
            {[t('newListing.suggestCheckBattery'), t('newListing.suggestReadManual'), t('newListing.suggestTestWorks')].map(sug => (
              <PressableOpacity
                key={sug}
                onPress={() => addChecklistItem(checklistTab, sug)}
                style={[s.suggestPill, { backgroundColor: colors.warmTint }]}
              >
                <Text style={[s.suggestPillText, { color: colors.foreground }]}>+ "{sug}"</Text>
              </PressableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
      {renderCTA(t('newListing.continueToRules'), () => goToStep(6))}
    </View>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // STEP 7 — Rules + Preview + Publish
  // ════════════════════════════════════════════════════════════════════════════
  const renderStep7 = () => (
    <View style={[s.page, { width: SCREEN_WIDTH }]}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {renderWizardHeader(6, t('newListing.step7Title'))}

        {/* Rules */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('newListing.rulesLabel')}</Text>
          <View style={[s.rulesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {rules.map((rule, i) => (
              <View key={i}>
                <View style={s.ruleRow}>
                  <View style={[s.ruleDot, { backgroundColor: colors.foreground }]} />
                  <Text style={[s.ruleText, { color: colors.foreground, flex: 1 }]}>{rule}</Text>
                  <PressableOpacity onPress={() => removeRule(i)} hitSlop={8}>
                    <X size={12} color={colors.tertiaryForeground} strokeWidth={2} />
                  </PressableOpacity>
                </View>
                {i < rules.length - 1 && (
                  <View style={[s.fieldDivider, { backgroundColor: colors.border }]} />
                )}
              </View>
            ))}
            {rules.length === 0 && (
              <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>
                {t('newListing.noRulesYet')}
              </Text>
            )}
          </View>
          {/* Add rule */}
          <View style={[s.addRulePill, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <TextInput
              value={ruleInput}
              onChangeText={setRuleInput}
              onSubmitEditing={addRule}
              placeholder={t('newListing.addRulePlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              style={[s.addRuleInput, { color: colors.foreground, fontFamily: fonts.bodyMedium }]}
              returnKeyType="done"
            />
          </View>
        </View>

        {/* Damage info */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('newListing.damageLabel')}</Text>
          <View style={[s.damageCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.damageIcon, { backgroundColor: colors.warmTint }]}>
              <AlertTriangle size={14} color={colors.foreground} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.damageTitle, { color: colors.foreground }]}>
                {t('newListing.damageTitle', { deposit })}
              </Text>
              <Text style={[s.damageSub, { color: colors.mutedForeground }]}>
                {t('newListing.damageSub')}
              </Text>
            </View>
            <ChevronRight size={14} color={colors.tertiaryForeground} strokeWidth={2.2} />
          </View>
        </View>

        {/* Feed preview */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>{t('newListing.previewLabel')}</Text>
          <View style={[s.previewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {photos[0] && !previewImgError ? (
              <Image source={{ uri: photos[0] }} style={s.previewImage} contentFit="cover" onError={() => setPreviewImgError(true)} />
            ) : (
              <View style={[s.previewImagePlaceholder, { backgroundColor: colors.muted }]}>
                <ImagePlus size={24} color={colors.tertiaryForeground} />
              </View>
            )}
            <View style={s.previewInfo}>
              <Text style={[s.previewTitle, { color: colors.foreground }]} numberOfLines={1}>
                {title || t('newListing.previewPlaceholder')}
              </Text>
              <Text style={[s.previewMeta, { color: colors.mutedForeground }]}>
                {t('newListing.previewMeta')}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
      {renderCTA(t('newListing.publish'), () => handlePublish(false), {
        label: t('newListing.saveDraftButton'),
        onPress: () => handlePublish(true),
      })}
    </View>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScroll}
        bounces={false}
        scrollEnabled={false}
      >
        {renderStep1()}
        {renderStep2()}
        {renderStep3()}
        {renderStep4()}
        {renderStep5()}
        {renderStep6()}
        {renderStep7()}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1 },
  page: { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  // ── Wizard header ──
  wizHeader: { paddingHorizontal: 16 },
  wizHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  circleBtn: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  wizStepLabel: { flex: 1, fontSize: 12, letterSpacing: 0.6, fontWeight: '500', fontFamily: fonts.bodyMedium },
  wizSaveLabel: { fontSize: 13, fontWeight: '500', fontFamily: fonts.bodyMedium },
  wizProgressRow: { flexDirection: 'row', gap: 4, marginBottom: 24 },
  wizProgressBar: { flex: 1, height: 3, borderRadius: 999 },
  wizTitle: { fontSize: 24, fontWeight: '600', letterSpacing: -0.6, lineHeight: 29, fontFamily: fonts.bodySemi, marginBottom: 16 },

  // ── CTA ──
  ctaArea: { position: 'absolute', left: 16, right: 16, bottom: 0 },
  ctaRow: { flexDirection: 'row', gap: 8 },
  ctaPrimary: { flex: 1, height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  ctaPrimaryText: { fontSize: 15, fontWeight: '600', letterSpacing: -0.1, fontFamily: fonts.bodySemi },
  ctaSecondary: { paddingHorizontal: 20, height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  ctaSecondaryText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },

  // ── Section ──
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionLabel: { fontSize: 12, letterSpacing: 0.9, textTransform: 'uppercase', fontWeight: '600', fontFamily: fonts.bodySemi, paddingHorizontal: 4, paddingBottom: 8 },

  // ── Step 1: Templates ──
  templateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateCard: { width: '48%', borderRadius: 16, padding: 16, minHeight: 110, justifyContent: 'space-between' },
  templateIcon: { fontSize: 24, lineHeight: 28 },
  templateIconWrap: { marginBottom: 8 },
  templateName: { fontSize: 14, fontWeight: '600', letterSpacing: -0.1, fontFamily: fonts.bodySemi },
  templateCat: { fontSize: 12, marginTop: 4, fontFamily: fonts.body },

  // ── Fields card ──
  fieldsCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  fieldRow: { paddingHorizontal: 16, paddingVertical: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '500', marginBottom: 4, fontFamily: fonts.bodyMedium },
  fieldValue: { fontSize: 15, fontWeight: '500', fontFamily: fonts.bodyMedium, padding: 0, minHeight: 24 },
  fieldDivider: { height: 1 },

  // ── Step 2: Photos ──
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoCell: { width: '31%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  photoImage: { width: '100%', height: '100%' },
  photoBadge: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  photoBadgeText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi, letterSpacing: 0.4, textTransform: 'uppercase' },
  photoRemove: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  photoAdd: { width: '31%', aspectRatio: 1, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoAddText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium },
  photoHint: { fontSize: 12, marginTop: 8, paddingHorizontal: 4, fontFamily: fonts.body },

  // ── Description ──
  descCard: { borderRadius: 16, borderWidth: 1, minHeight: 140, padding: 16 },
  descInput: { fontSize: 14, lineHeight: 20, letterSpacing: -0.05 },

  // ── Tags ──
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tagPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  tagText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium },
  tagAddPill: { borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 12 },
  tagAddInput: { fontSize: 12, minWidth: 80, paddingVertical: 4 },

  // ── Step 3: Pricing ──
  pricingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pricingCard: { width: '48%', borderRadius: 12, padding: 12 },
  pricingLabel: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, fontFamily: fonts.bodySemi },
  pricingSub: { fontSize: 12, marginTop: 4, fontFamily: fonts.body },
  priceInputCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginTop: 8 },

  // ── Deposit ──
  depositCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  depositRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  depositAmount: { fontSize: 32, fontWeight: '600', letterSpacing: -1.2, lineHeight: 40, fontFamily: fonts.bodySemi },
  depositCurrency: { fontSize: 18, fontWeight: '600', fontFamily: fonts.bodySemi },
  depositControls: { flexDirection: 'row', gap: 8 },
  depositBtn: { width: 44, height: 44, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  depositBtnDark: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  depositHint: { fontSize: 12, lineHeight: 16, marginTop: 8, fontFamily: fonts.body },

  // ── Suggestion card ──
  suggestionCard: { borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  suggestionIcon: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  suggestionText: { flex: 1, fontSize: 12, lineHeight: 16, fontFamily: fonts.body },

  // ── Step 4: Weekdays ──
  weekdayRow: { flexDirection: 'row', gap: 8 },
  weekdayBtn: { flex: 1, aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  weekdayText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi },

  // ── Calendar ──
  calendarCard: { borderRadius: 16, borderWidth: 1, padding: 12 },
  calendarRow: { flexDirection: 'row' },
  calendarCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calendarDayBtn: { margin: 4 },
  calendarDayHeader: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi },
  calendarDayNum: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium },
  calendarLegend: { flexDirection: 'row', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12, fontFamily: fonts.body },

  // ── Time windows ──
  timeCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  timeLabel: { fontSize: 14, fontWeight: '500', fontFamily: fonts.bodyMedium },
  timeValue: { fontSize: 14, fontFamily: fonts.body },

  // ── Step 5: Location ──
  locationCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  miniMap: { height: 120, alignItems: 'center', justifyContent: 'center' },
  locationInfo: { padding: 12 },
  locationAddress: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, padding: 0, minHeight: 20 },
  locationHint: { fontSize: 12, marginTop: 4, fontFamily: fonts.body },

  // ── Pickup methods ──
  pickupMethods: { gap: 8 },
  pickupCard: { borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  radioOuter: { width: 20, height: 20, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 9, height: 9, borderRadius: 999 },
  pickupLabel: { fontSize: 14, fontWeight: '600', letterSpacing: -0.1, fontFamily: fonts.bodySemi },
  pickupSub: { fontSize: 12, marginTop: 4, fontFamily: fonts.body },

  // ── Step 6: Segment tabs ──
  segmentRow: { borderRadius: 12, padding: 4, flexDirection: 'row', gap: 4, borderWidth: 1 },
  segmentTab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segmentTabText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi },

  // ── Checklist items ──
  checkItem: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  checkItemDashed: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  checkNum: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  checkNumDashed: { borderWidth: 1.5, borderStyle: 'dashed', backgroundColor: 'transparent' },
  checkNumText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi },
  checkText: { flex: 1, fontSize: 13, lineHeight: 17, fontFamily: fonts.body },
  checkAddInput: { flex: 1, fontSize: 13, padding: 0, minHeight: 20 },

  // ── Suggestion pills ──
  suggestPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  suggestPillText: { fontSize: 12, fontWeight: '500', fontFamily: fonts.bodyMedium },

  // ── Step 7: Rules ──
  rulesCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  ruleDot: { width: 6, height: 6, borderRadius: 999 },
  ruleText: { fontSize: 14, fontFamily: fonts.body },
  emptyHint: { padding: 12, fontSize: 13, textAlign: 'center', fontFamily: fonts.body },
  addRulePill: { borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', marginTop: 8, paddingHorizontal: 12 },
  addRuleInput: { fontSize: 12, paddingVertical: 8, minHeight: 32 },

  // ── Damage card ──
  damageCard: { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  damageIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  damageTitle: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi },
  damageSub: { fontSize: 12, marginTop: 4, lineHeight: 16, fontFamily: fonts.body },

  // ── Preview card ──
  previewCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', maxWidth: '62%' },
  previewImage: { height: 140 },
  previewImagePlaceholder: { height: 140, alignItems: 'center', justifyContent: 'center' },
  previewInfo: { padding: 8 },
  previewTitle: { fontSize: 13, fontWeight: '600', letterSpacing: -0.1, lineHeight: 16, fontFamily: fonts.bodySemi },
  previewMeta: { fontSize: 12, marginTop: 4, fontFamily: fonts.body },
})

export default function NewListingScreen() {
  return (
    <ScreenErrorBoundary screenName="NewListing">
      <NewListingScreenInner />
    </ScreenErrorBoundary>
  )
}
