declare const __DEV__: boolean

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Switch, Share } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { ChevronRight, ChevronUp, ChevronDown, Camera, X, Check, Clock, MapPin, Users, EyeOff, Lock, Zap, Crown, CheckCircle, ImagePlus } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { CATEGORIES } from '@/lib/constants'
import { FEATURES } from '@/lib/featureFlags'
import { fonts } from '@/lib/fonts'
import { triggerPush } from '@/lib/pushTrigger'
import { useTrustLevel } from '@/hooks/useTrustLevel'
import { useIdentityVerification } from '@/hooks/useIdentityVerification'
import { TrustGateModal } from '@/components/TrustGate'
import { VerificationModal } from '@/components/VerificationModal'
import { CATEGORY_ICON_MAP } from '@/lib/categoryIcons'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { LocationAutocomplete } from '@/components/LocationAutocomplete'
import { PressableOpacity, KeyboardDoneAccessory, KEYBOARD_DONE_ID } from '@/components/ui'
import { trackEvent } from '@/lib/analytics'
import { maybeRequestReview } from '@/lib/reviewPrompt'
import { getCachedUserId } from '@/lib/authCache'
import { checkRateLimit, getRateLimitMessage } from '@/lib/rateLimiter'
import { suggestTags } from '@/lib/autoCategory'
import type { PostType, TrustLevel } from '@/lib/types'
import { suggestExpirationDays } from '@/lib/expirePrediction'

const TARJOAN_SERVICE_TAGS: { id: string; label: string }[] = [
  { id: 'kodinhoito', label: 'tags.kodinhoito' },
  { id: 'muutto', label: 'tags.muutto' },
  { id: 'lastenhoito', label: 'tags.lastenhoito' },
  { id: 'lemmikit', label: 'tags.lemmikit' },
  { id: 'tekniikka', label: 'tags.tekniikka' },
  { id: 'opetus', label: 'tags.opetus' },
  { id: 'remontti', label: 'tags.remontti' },
  { id: 'puutarha', label: 'tags.puutarha' },
  { id: 'ruoanlaitto', label: 'tags.ruoanlaitto' },
  { id: 'kaannos', label: 'tags.kaannos' },
  { id: 'valokuvaus', label: 'tags.valokuvaus' },
  { id: 'hieronta', label: 'tags.hieronta' },
  { id: 'kuljetus', label: 'tags.kuljetus' },
  { id: 'muu', label: 'tags.muu' },
]

const TARJOAN_ITEM_TAGS: { id: string; label: string }[] = [
  { id: 'huonekalut', label: 'tags.huonekalut' },
  { id: 'elektroniikka', label: 'tags.elektroniikka' },
  { id: 'vaatteet', label: 'tags.vaatteet' },
  { id: 'urheilu', label: 'tags.urheilu' },
  { id: 'keittio', label: 'tags.keittio' },
  { id: 'kodinkoneet', label: 'tags.kodinkoneet' },
  { id: 'sisustus', label: 'tags.sisustus' },
  { id: 'lastentarvikkeet', label: 'tags.lastentarvikkeet' },
  { id: 'rakennustarvikkeet', label: 'tags.rakennustarvikkeet' },
  { id: 'puutarha', label: 'tags.puutarha' },
  { id: 'muu', label: 'tags.muu' },
]

const CONDITION_OPTIONS = [
  { id: 'condition_new', label: 'create.conditionNew' },
  { id: 'condition_good', label: 'create.conditionGood' },
  { id: 'condition_fair', label: 'create.conditionFair' },
  { id: 'condition_poor', label: 'create.conditionPoor' },
] as const

const POST_TAGS: Record<string, { id: string; label: string }[]> = {
  tarvitsen: [
    { id: 'kodinhoito', label: 'tags.kodinhoito' },
    { id: 'muutto', label: 'tags.muutto' },
    { id: 'lastenhoito', label: 'tags.lastenhoito' },
    { id: 'lemmikit', label: 'tags.lemmikit' },
    { id: 'tekniikka', label: 'tags.tekniikka' },
    { id: 'opetus', label: 'tags.opetus' },
    { id: 'kuljetus', label: 'tags.kuljetus' },
    { id: 'kasityo', label: 'tags.kasityo' },
    { id: 'remontti', label: 'tags.remontti' },
    { id: 'puutarha', label: 'tags.puutarha' },
    { id: 'ruoanlaitto', label: 'tags.ruoanlaitto' },
    { id: 'kaannos', label: 'tags.kaannos' },
    { id: 'valokuvaus', label: 'tags.valokuvaus' },
    { id: 'terveys', label: 'tags.terveys' },
    { id: 'urheilu', label: 'tags.urheilu' },
    { id: 'musiikki', label: 'tags.musiikki' },
    { id: 'muu', label: 'tags.muu' },
  ],
  tarjoan: [
    // Default — will be overridden by tarjoanType-specific tags
    ...TARJOAN_SERVICE_TAGS,
    ...TARJOAN_ITEM_TAGS,
  ],
  ilmaista: [
    { id: 'huonekalut', label: 'tags.huonekalut' },
    { id: 'vaatteet', label: 'tags.vaatteet' },
    { id: 'elektroniikka', label: 'tags.elektroniikka' },
    { id: 'kirjat', label: 'tags.kirjat' },
    { id: 'keittio', label: 'tags.keittio' },
    { id: 'lelut', label: 'tags.lelut' },
    { id: 'urheilu', label: 'tags.urheilu' },
    { id: 'puutarha', label: 'tags.puutarha' },
    { id: 'kodinkoneet', label: 'tags.kodinkoneet' },
    { id: 'sisustus', label: 'tags.sisustus' },
    { id: 'rakennustarvikkeet', label: 'tags.rakennustarvikkeet' },
    { id: 'lastentarvikkeet', label: 'tags.lastentarvikkeet' },
    { id: 'muu', label: 'tags.muu' },
  ],
  lainaa: [
    { id: 'tyokalut', label: 'tags.tyokalut' },
    { id: 'elektroniikka', label: 'tags.elektroniikka' },
    { id: 'urheilu', label: 'tags.urheilu' },
    { id: 'musiikki', label: 'tags.musiikki' },
  ],
  tapahtuma: [
    { id: 'talkoot', label: 'tags.talkoot' },
    { id: 'urheilu', label: 'tags.urheilu' },
    { id: 'musiikki', label: 'tags.musiikki' },
    { id: 'kulttuuri', label: 'tags.kulttuuri' },
    { id: 'lapsiperhe', label: 'tags.lapsiperhe' },
    { id: 'ruoka', label: 'tags.ruoka' },
    { id: 'kirpputori', label: 'tags.kirpputori' },
    { id: 'koulutus', label: 'tags.koulutus' },
    { id: 'naapurusto', label: 'tags.naapurusto' },
    { id: 'muu', label: 'tags.muu' },
  ],
}

const EXPIRATION_OPTIONS = [
  { days: 0, label: 'create.noExpiration' },
  { days: 3, label: 'create.expires3' },
  { days: 7, label: 'create.expires7' },
  { days: 14, label: 'create.expires14' },
  { days: 30, label: 'create.expires30' },
]

export default function CreateScreen() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const params = useLocalSearchParams<{ type?: string }>()
  const supabase = useSupabase()

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [showTrustGate, setShowTrustGate] = useState(false)
  const [selectedType, setSelectedType] = useState<PostType | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  // Track which fields have been touched (blurred at least once) for inline validation
  const [touchedTitle, setTouchedTitle] = useState(false)
  const [touchedDescription, setTouchedDescription] = useState(false)
  // Refs to auto-focus first invalid field on submit error
  const titleInputRef = useRef<TextInput>(null)
  const descriptionInputRef = useRef<TextInput>(null)
  const [location, setLocation] = useState('')
  const [dailyFee, setDailyFee] = useState('')
  const [servicePrice, setServicePrice] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventStartTime, setEventStartTime] = useState('')
  const [eventEndTime, setEventEndTime] = useState('')
  const [eventMaxCapacity, setEventMaxCapacity] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tarjoanType, setTarjoanType] = useState<'service' | 'item'>('service')
  const [itemCondition, setItemCondition] = useState<string | null>(null)
  const [expirationDays, setExpirationDays] = useState(0)
  const [images, setImages] = useState<string[]>([])
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [mapModalVisible, setMapModalVisible] = useState(false)
  const [tempMapCoords, setTempMapCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [isUrgent, setIsUrgent] = useState(false)
  const [urgencyHours, setUrgencyHours] = useState<number>(2)
  const [showDetails, setShowDetails] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [userIsPro, setUserIsPro] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successNeighborhood, setSuccessNeighborhood] = useState<string | null>(null)
  const [successPostId, setSuccessPostId] = useState<string | null>(null)
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [autoTags, setAutoTags] = useState<string[]>([])

  // Auto-suggest tags based on title + description
  useEffect(() => {
    if (title.length < 5) { setAutoTags([]); return }
    const { suggestedTags: suggested } = suggestTags(title, description)
    setAutoTags(suggested)
  }, [title, description])

  // Handle pre-selected type from query params (e.g., from events screen)
  useEffect(() => {
    if (params.type && Object.keys(CATEGORIES).includes(params.type)) {
      // Respect feature flags — don't allow disabled categories via deep link
      if (params.type === 'lainaa' && !FEATURES.LENDING) return
      setSelectedType(params.type as PostType)
    }
  }, [params.type])

  // Clean up success timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
        successTimeoutRef.current = null
      }
    }
  }, [])

  const [userNeighborhood, setUserNeighborhood] = useState<string | null>(null)

  // Check auth on mount + fetch neighborhood
  useEffect(() => {
    getCachedUserId().then(id => {
      setIsAuthenticated(!!id)
      setCurrentUserId(id)
      if (!id) { router.replace('/(auth)/login'); return }
      // Fetch user neighborhood + Pro status
      supabase.from('profiles').select('naapurusto, is_pro').eq('id', id).maybeSingle()
        .then(({ data }: any) => { if (data?.naapurusto) setUserNeighborhood(data.naapurusto as string); if (data?.is_pro) setUserIsPro(true) }, () => {})
    }).catch(() => {})
  }, [supabase, router])

  const trust = useTrustLevel(currentUserId)
  const identity = useIdentityVerification(currentUserId)

  // Smart default: auto-populate location from user's neighborhood
  useEffect(() => {
    if (userNeighborhood && !location && selectedType) {
      setLocation(userNeighborhood)
    }
  }, [userNeighborhood, selectedType]) // Only runs when a category is selected

  // Auto-expand details for categories that have required detail fields
  useEffect(() => {
    if (selectedType === 'lainaa' || selectedType === 'tapahtuma' || selectedType === 'tarjoan') {
      setShowDetails(true)
    }
  }, [selectedType])

  // Auto-expire prediction: suggest expiration based on type + tags
  useEffect(() => {
    if (selectedType && !expirationDays) {
      const suggested = suggestExpirationDays(selectedType, selectedTags)
      setExpirationDays(suggested)
    }
  }, [selectedType, selectedTags])

  // Discard confirmation when closing with unsaved content
  const hasUnsavedContent = title.trim().length > 0 || description.trim().length > 0 || images.length > 0
  const handleClose = useCallback(() => {
    if (hasUnsavedContent) {
      Alert.alert(
        t('create.discardTitle'),
        t('create.discardMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('create.discard'),
            style: 'destructive',
            onPress: () => {
              setTitle('')
              setDescription('')
              setImages([])
              setLocation('')
              setDailyFee('')
              setServicePrice('')
              setEventDate('')
              setEventStartTime('')
              setEventEndTime('')
              setEventMaxCapacity('')
              setSelectedTags([])
              setTarjoanType('service')
              setItemCondition(null)
              setExpirationDays(0)
              setIsAnonymous(false)
              setIsUrgent(false)
              setLatitude(null)
              setLongitude(null)
              setSelectedType(null)
              router.back()
            },
          },
        ],
      )
    } else {
      router.back()
    }
  }, [hasUnsavedContent, t, router])

  const handleCategorySelect = (type: PostType) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
    // Gate lainaa behind trust level 2
    if (type === 'lainaa' && !trust.permissions.canLainaa) {
      setShowTrustGate(true)
      return
    }
    setSelectedType(type)
    setSelectedTags([])
    setTarjoanType('service')
    setItemCondition(null)
  }

  const launchPicker = useCallback(async (useCamera: boolean) => {
    if (images.length >= 5) {
      Alert.alert(t('common.error'), t('create.maxImages'))
      return
    }
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(t('common.error'), t('create.cameraPermissionRequired'))
        return
      }
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.6, allowsMultipleSelection: false })
    if (!result.canceled && result.assets[0]) {
      setImages(prev => [...prev, result.assets[0].uri])
    }
  }, [images.length, t])

  const pickImage = useCallback(() => {
    Alert.alert(t('create.addImage'), '', [
      { text: t('create.camera'), onPress: () => launchPicker(true) },
      { text: t('create.gallery'), onPress: () => launchPicker(false) },
      { text: t('common.cancel'), style: 'cancel' },
    ])
  }, [launchPicker, t])

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleOpenMapPicker = useCallback(() => {
    setTempMapCoords(latitude && longitude ? { lat: latitude, lng: longitude } : null)
    setMapModalVisible(true)
  }, [latitude, longitude])

  const handleConfirmMapLocation = useCallback(async () => {
    if (!tempMapCoords) return
    setLatitude(tempMapCoords.lat)
    setLongitude(tempMapCoords.lng)

    // Try reverse geocoding via Nominatim
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${tempMapCoords.lat}&lon=${tempMapCoords.lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'fi', 'User-Agent': 'TackBirdMobile/1.0' } }
      )
      const data = await res.json()
      if (data?.display_name) {
        // Extract short address: road + house_number, city
        const addr = data.address
        const parts: string[] = []
        if (addr?.road) {
          parts.push(addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road)
        }
        if (addr?.suburb || addr?.neighbourhood) {
          parts.push(addr.suburb || addr.neighbourhood)
        }
        setLocation(parts.length > 0 ? parts.join(', ') : data.display_name.split(',').slice(0, 2).join(','))
      } else {
        setLocation(`${tempMapCoords.lat.toFixed(5)}, ${tempMapCoords.lng.toFixed(5)}`)
      }
    } catch {
      setLocation(`${tempMapCoords.lat.toFixed(5)}, ${tempMapCoords.lng.toFixed(5)}`)
    }

    setMapModalVisible(false)
  }, [tempMapCoords])

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tagId)) return prev.filter(tag => tag !== tagId)
      if (prev.length >= 3) return prev
      return [...prev, tagId]
    })
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

  const uploadImages = async (userId: string, postId: string): Promise<string | null> => {
    if (images.length === 0) return null
    setUploadStatus(t('create.uploadingImages'))

    const uploadedUrls: string[] = []
    let failedCount = 0
    for (let i = 0; i < images.length; i++) {
      const uri = images[i]
      const response = await fetch(uri)
      const blob = await response.blob()
      if (blob.size > MAX_FILE_SIZE) { failedCount++; continue } // skip too-large files

      // Use blob MIME type (reliable) instead of URI extension
      const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      const mimeType = ALLOWED_MIMES.includes(blob.type) ? blob.type : 'image/jpeg'
      const mimeSubtype = mimeType.split('/')[1] ?? 'jpeg'
      const ext = mimeSubtype === 'jpeg' ? 'jpg' : mimeSubtype
      const path = `${userId}/${postId}/${i}.${ext}`
      const arrayBuffer = await blob.arrayBuffer()

      const { error } = await supabase.storage
        .from('post-images')
        .upload(path, arrayBuffer, { contentType: mimeType, upsert: true })

      if (!error) {
        const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path)
        uploadedUrls.push(urlData.publicUrl)
      } else {
        failedCount++
      }
    }

    // Insert extra images
    if (uploadedUrls.length > 1) {
      const extras = uploadedUrls.slice(1).map((url, idx) => ({
        post_id: postId,
        image_url: url,
        sort_order: idx + 1,
      }))
      const { error: imgError } = await (supabase.from('post_images') as any).insert(extras)
      if (imgError && __DEV__) console.error('[create] post_images insert failed:', imgError.message)
    }

    if (failedCount > 0 && uploadedUrls.length > 0) {
      // Some images failed but at least one succeeded — show partial failure notice
      Alert.alert(
        t('common.error'),
        t('create.imageUploadPartialFail', { count: failedCount }),
      )
    }
    // When ALL images failed (uploadedUrls empty), the caller handles it

    return uploadedUrls[0] ?? null
  }

  const quickContentCheck = useCallback((checkTitle: string, checkDescription: string): string | null => {
    const text = `${checkTitle} ${checkDescription}`.toLowerCase()
    if (/https?:\/\//.test(text)) return t('create.noExternalLinks')
    if (/whatsapp|telegram/.test(text)) return t('create.noExternalApps')
    if (text.length < 10) return t('create.tooShort')
    return null // passed
  }, [t])

  const handleSubmit = useCallback(async () => {
    // Prevent double submission
    if (submitting) return
    if (!selectedType || !title.trim() || !description.trim()) {
      // Mark both as touched so inline errors show, and focus first invalid
      setTouchedTitle(true)
      setTouchedDescription(true)
      if (!title.trim()) {
        titleInputRef.current?.focus()
      } else if (!description.trim()) {
        descriptionInputRef.current?.focus()
      }
      Alert.alert(t('common.error'), t('create.titleAndDescRequired'))
      return
    }

    // Rate limiting
    if (!await checkRateLimit('post_create')) {
      Alert.alert(t('common.error'), getRateLimitMessage('post_create', t))
      return
    }

    // Pre-submit content moderation check
    const contentWarning = quickContentCheck(title, description)
    if (contentWarning) {
      Alert.alert(t('common.error'), contentWarning)
      return
    }

    // Event validation — before post insert to prevent orphans
    if (selectedType === 'tapahtuma') {
      if (eventMaxCapacity) {
        const maxAtt = parseInt(eventMaxCapacity, 10)
        if (isNaN(maxAtt) || maxAtt < 1) {
          Alert.alert(t('common.error'), t('create.invalidMaxCapacity') ?? 'Osallistujamäärän pitää olla vähintään 1')
          return
        }
      }
      if (eventEndTime && eventStartTime && eventEndTime < eventStartTime) {
        Alert.alert(t('common.error'), t('create.endTimeBeforeStart') ?? 'Päättymisaika ei voi olla ennen alkamisaikaa')
        return
      }
    }
    if (selectedType === 'lainaa' && (!dailyFee || isNaN(parseFloat(dailyFee)) || parseFloat(dailyFee) <= 0)) {
      Alert.alert(t('common.error'), t('create.dailyFeeRequired'))
      return
    }
    // Trust tier: max daily fee check for tier 2
    if (selectedType === 'lainaa' && trust.permissions.maxDailyFee !== null && !isNaN(parseFloat(dailyFee)) && parseFloat(dailyFee) > trust.permissions.maxDailyFee) {
      Alert.alert(t('common.error'), t('trust.maxDailyFeeExceeded', { max: trust.permissions.maxDailyFee }))
      return
    }
    // Prevent negative or zero service/item prices
    if (selectedType === 'tarjoan' && servicePrice && !isNaN(parseFloat(servicePrice)) && parseFloat(servicePrice) < 0) {
      Alert.alert(t('common.error'), t('create.priceCannotBeNegative'))
      return
    }
    if (selectedType === 'tarjoan' && tarjoanType === 'service' && servicePrice && parseFloat(servicePrice) === 0) {
      Alert.alert(t('common.error'), t('create.priceCannotBeZero') ?? 'Hinta ei voi olla 0 €')
      return
    }
    // Trust tier: block Tier 1 from submitting paid services
    if (selectedType === 'tarjoan' && tarjoanType === 'service' && servicePrice && !trust.permissions.canOfferPaidServices) {
      Alert.alert(t('common.error'), t('service.requiresVerification'))
      return
    }
    // Trust tier: max service price check (only for services, not items)
    if (selectedType === 'tarjoan' && tarjoanType === 'service' && servicePrice && !isNaN(parseFloat(servicePrice)) && trust.permissions.maxServicePrice !== null && parseFloat(servicePrice) > trust.permissions.maxServicePrice) {
      Alert.alert(t('common.error'), t('service.maxPriceExceeded', { max: trust.permissions.maxServicePrice }))
      return
    }
    if (selectedType === 'tapahtuma' && !eventDate) {
      Alert.alert(t('common.error'), t('events.titleDateRequired'))
      return
    }
    // Prevent past event dates (error prevention)
    if (selectedType === 'tapahtuma' && eventDate) {
      const eventDateObj = new Date(eventDate)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (!isNaN(eventDateObj.getTime()) && eventDateObj < today) {
        Alert.alert(t('common.error'), t('create.eventDateInPast'))
        return
      }
    }
    // Validate event max capacity BEFORE post insert to prevent orphaned posts
    if (selectedType === 'tapahtuma' && eventMaxCapacity) {
      const maxAtt = parseInt(eventMaxCapacity, 10)
      if (isNaN(maxAtt) || maxAtt < 1) {
        Alert.alert(t('common.error'), t('create.invalidMaxCapacity') ?? 'Invalid max capacity')
        return
      }
    }

    // All validation passed — give success haptic feedback
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {} // Intentional: haptics unavailable on some platforms
    setSubmitting(true)
    let createdPostIdForCleanup: string | null = null
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { Alert.alert(t('common.error'), t('auth.loginRequired')); return }

      // Urgency overrides manual expiration
      const expiresAt = isUrgent
        ? new Date(Date.now() + urgencyHours * 3600000).toISOString()
        : expirationDays > 0
          ? new Date(Date.now() + expirationDays * 86400000).toISOString()
          : null

      // Pre-insert content moderation — blocks spam/scam BEFORE the post appears in feed.
      // This prevents the window where a flagged post is visible to other users.
      try {
        const { data: { session: modSession } } = await supabase.auth.getSession()
        const modHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
        if (modSession?.access_token) {
          modHeaders['Authorization'] = `Bearer ${modSession.access_token}`
        }
        const modRes = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/moderate-content`, {
          method: 'POST',
          headers: modHeaders,
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            user_id: user.id,
          }),
        })
        if (modRes.ok) {
          const modResult = await modRes.json()
          if (modResult.action === 'block') {
            Alert.alert(t('common.error'), t('create.contentBlocked') || 'Content blocked by moderation')
            setSubmitting(false)
            setUploadStatus('')
            return
          }
        }
      } catch {
        // Intentional: moderation service unavailable — allow post through
        // and rely on async moderation as fallback
      }

      // Create post
      setUploadStatus(t('create.publishing'))
      // Fetch profile to check Pro status for priority listing
      const { data: creatorProfile } = await supabase.from('profiles').select('is_pro').eq('id', user.id).maybeSingle()
      // Build tags array — include tarjoan sub-type and condition metadata
      const finalTags = [...selectedTags]
      if (selectedType === 'tarjoan') {
        finalTags.push(tarjoanType === 'item' ? 'tarjoan_item' : 'tarjoan_service')
        if (tarjoanType === 'item' && itemCondition) {
          finalTags.push(itemCondition)
        }
      }

      const { data: post, error } = await (supabase.from('posts') as any).insert({
        user_id: user.id,
        type: selectedType,
        title: title.trim(),
        description: description.trim(),
        location: location.trim() || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        daily_fee: selectedType === 'lainaa' && dailyFee && !isNaN(parseFloat(dailyFee)) ? parseFloat(dailyFee) : null,
        service_price: selectedType === 'tarjoan' && servicePrice && !isNaN(parseFloat(servicePrice)) ? parseFloat(servicePrice) : null,
        event_date: selectedType === 'tapahtuma' && eventDate ? new Date(eventDate).toISOString() : null,
        expires_at: expiresAt,
        is_urgent: isUrgent || false,
        urgency_hours: isUrgent ? urgencyHours : null,
        is_anonymous: isAnonymous || false,
        is_active: images.length > 0 ? false : true, // Activate after images uploaded
        tags: finalTags,
        is_pro_listing: !!(creatorProfile as any)?.is_pro,
      }).select('id').single()

      if (error) throw error
      createdPostIdForCleanup = post?.id ?? null

      // Upload images if any
      if (images.length > 0 && post?.id) {
        const mainImageUrl = await uploadImages(user.id, post.id)
        if (mainImageUrl) {
          const { error: imgUrlError } = await (supabase.from('posts') as any).update({ image_url: mainImageUrl }).eq('id', post.id)
          if (imgUrlError && __DEV__) console.error('[create] image_url update failed:', imgUrlError.message)
        } else {
          // ALL image uploads failed — ask user whether to keep post without images or retry
          const userChoice = await new Promise<'publish' | 'retry'>(resolve => {
            Alert.alert(
              t('common.error'),
              t('create.allImagesFailed'),
              [
                { text: t('create.retryUpload'), style: 'cancel', onPress: () => resolve('retry') },
                { text: t('create.publishWithoutImages'), onPress: () => resolve('publish') },
              ],
              { cancelable: false },
            )
          })
          if (userChoice === 'retry') {
            // Delete the already-inserted post and bail out so user can retry
            if (post?.id) {
              const { error: deleteError } = await (supabase.from('posts') as any).delete().eq('id', post.id)
              if (deleteError) {
                if (__DEV__) console.error('[create] rollback delete failed:', deleteError.message)
                Alert.alert(t('common.error'), t('create.rollbackFailed') ?? 'Failed to clean up — please delete the draft from your profile')
              }
            }
            setSubmitting(false)
            setUploadStatus('')
            return
          }
          // userChoice === 'publish' — continue without images
        }
        // Activate the post now that images are handled
        if (post?.id) {
          await (supabase.from('posts') as any).update({ is_active: true }).eq('id', post.id)
        }
      }

      // Create event record if tapahtuma
      if (selectedType === 'tapahtuma' && post?.id) {
        // Build event date with optional start time.
        // Regex allows "25:70" etc. — clamp to 0–23 / 0–59 to prevent setHours
        // from overflowing into the next day silently.
        let eventDateISO = new Date(eventDate).toISOString()
        if (eventStartTime && /^\d{1,2}:\d{2}$/.test(eventStartTime)) {
          const [h, m] = eventStartTime.split(':').map(Number)
          if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            const d = new Date(eventDate)
            d.setHours(h, m, 0, 0)
            eventDateISO = d.toISOString()
          }
        }

        // Build event end date with optional end time
        let eventEndISO: string | null = null
        if (eventEndTime && /^\d{1,2}:\d{2}$/.test(eventEndTime)) {
          const [h, m] = eventEndTime.split(':').map(Number)
          if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            const d = new Date(eventDate)
            d.setHours(h, m, 0, 0)
            eventEndISO = d.toISOString()
          }
        }

        // maxCapacity already validated in pre-submit checks — safe to parse
        const maxAtt = eventMaxCapacity ? parseInt(eventMaxCapacity, 10) : null

        const { error: eventError } = await (supabase.from('events') as any).insert({
          post_id: post.id,
          creator_id: user.id,
          title: title.trim(),
          description: description.trim(),
          event_date: eventDateISO,
          event_end_date: eventEndISO,
          location_name: location.trim() || null,
          location_lat: latitude ?? null,
          location_lng: longitude ?? null,
          max_attendees: (maxAtt && maxAtt > 0) ? maxAtt : null,
          icon: 'CalendarDays',
        })
        if (eventError) {
          if (__DEV__) console.error('[create] event insert failed:', eventError.message)
          // Clean up orphaned post since event creation failed
          try { await (supabase.from('posts') as any).delete().eq('id', post.id) } catch {}
          Alert.alert(t('common.error'), t('create.eventCreateFailed') ?? 'Event creation failed')
          setSubmitting(false)
          return
        }
      }

      // Trigger semantic embedding for the new post (fire-and-forget)
      if (post?.id) {
        const { data: { session: authSession } } = await supabase.auth.getSession()
        const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
        if (authSession?.access_token) {
          authHeaders['Authorization'] = `Bearer ${authSession.access_token}`
        }
        fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/embed-post`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ post_id: post.id }),
        }).catch((err) => { if (__DEV__) console.warn('[create] embed-post failed:', err) }) // Non-blocking

      }

      // Push notification for urgent posts (broadcast) — rate limited to 1 per 30 min
      if (isUrgent && post?.id) {
        const URGENT_COOLDOWN_KEY = 'tackbird_last_urgent'
        const URGENT_COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes
        const lastUrgent = await AsyncStorage.getItem(URGENT_COOLDOWN_KEY)
        if (lastUrgent && Date.now() - parseInt(lastUrgent, 10) < URGENT_COOLDOWN_MS) {
          // Skip push broadcast — too soon after last urgent post
        } else {
          triggerPush({
            user_id: user.id,
            title: title.trim(),
            body: description.trim().slice(0, 100),
            type: 'urgent_help',
            post_id: post.id,
          })
          await AsyncStorage.setItem(URGENT_COOLDOWN_KEY, String(Date.now()))
        }
      }

      // Analytics: track post creation
      trackEvent('post_created', { type: selectedType, has_price: !!servicePrice })

      // Reset form state before showing alert — prevents duplicate submissions
      // if the user dismisses the alert without tapping a button
      const createdPostId = post.id
      setTitle('')
      setDescription('')
      setImages([])
      setLocation('')
      setDailyFee('')
      setServicePrice('')
      setEventDate('')
      setEventStartTime('')
      setEventEndTime('')
      setEventMaxCapacity('')
      setSelectedTags([])
      setTarjoanType('service')
      setItemCondition(null)
      setExpirationDays(0)
      setIsAnonymous(false)
      setIsUrgent(false)
      setLatitude(null)
      setLongitude(null)
      setSelectedType(null)

      // Haptic celebration on successful post creation
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {} // Intentional: haptics unavailable on some platforms

      // Show success celebration overlay before navigating
      setSuccessPostId(createdPostId)
      setSuccessNeighborhood(userNeighborhood)
      setShowSuccess(true)
      // Prompt for app store review after successful post (non-blocking)
      maybeRequestReview('post_created').catch(() => {})

      successTimeoutRef.current = setTimeout(() => {
        successTimeoutRef.current = null
        setShowSuccess(false)
        router.replace(`/post/${createdPostId}`)
      }, 2000)
    } catch (err: any) {
      if (__DEV__) console.log('[create] error:', JSON.stringify(err))
      // Clean up orphaned post if it was created with is_active: false
      if (createdPostIdForCleanup) {
        try { await (supabase.from('posts') as any).delete().eq('id', createdPostIdForCleanup) } catch {}
      }
      Alert.alert(t('common.error'), err?.message || t('create.createFailed'))
    } finally {
      setSubmitting(false)
      setUploadStatus('')
    }
  }, [submitting, selectedType, title, description, location, latitude, longitude, dailyFee, servicePrice, eventDate, eventStartTime, eventEndTime, eventMaxCapacity, selectedTags, tarjoanType, itemCondition, expirationDays, isUrgent, urgencyHours, isAnonymous, images, supabase, router, t, quickContentCheck, trust, userNeighborhood, uploadImages])

  // ── Derive available tags ──
  const cat = selectedType ? CATEGORIES[selectedType] : null
  const availableTags = selectedType === 'tarjoan'
    ? (tarjoanType === 'item' ? TARJOAN_ITEM_TAGS : TARJOAN_SERVICE_TAGS)
    : selectedType ? (POST_TAGS[selectedType] ?? []) : []

  // ── Category entries for pills ──
  const categoryEntries = (Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).filter(([type]) => {
    if (type === 'lainaa' && !FEATURES.LENDING) return false
    return true
  })

  return (
    <ScreenErrorBoundary screenName="Create">
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* ── Header: close circle | centered title | Luonnos link ── */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            style={({ pressed }) => [
              styles.headerCloseBtn,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('common.close') ?? 'Sulje'}
          >
            <X size={16} color={colors.foreground} strokeWidth={2.2} />
          </Pressable>

          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {t('create.newPost') ?? 'Uusi ilmoitus'}
          </Text>

          <PressableOpacity
            onPress={() => {
              // Draft save placeholder — save to AsyncStorage
              if (hasUnsavedContent && selectedType) {
                const draft = { type: selectedType, title, description, images, location }
                AsyncStorage.setItem('tackbird_draft_post', JSON.stringify(draft)).catch(() => {})
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
                Alert.alert(t('create.draftSaved') ?? 'Luonnos tallennettu')
              }
            }}
            style={styles.headerDraftLink}
          >
            <Text style={[styles.headerDraftText, { color: colors.mutedForeground }]}>
              {t('create.draft') ?? 'Luonnos'}
            </Text>
          </PressableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Category pills ── */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {t('create.iAm') ?? 'MINA...'}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
            >
              {categoryEntries.map(([type, catDef]) => {
                const isActive = selectedType === type
                const isLocked = type === 'lainaa' && !trust.permissions.canLainaa
                return (
                  <Pressable
                    key={type}
                    onPress={() => handleCategorySelect(type)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t(catDef.label)}${isLocked ? `, ${t('trust.requiresTier2Short')}` : ''}`}
                    accessibilityState={{ selected: isActive, disabled: isLocked }}
                    style={({ pressed }) => [
                      styles.pill,
                      isActive
                        ? { backgroundColor: colors.foreground }
                        : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                      isLocked && { opacity: 0.45 },
                      pressed && !isActive && { backgroundColor: colors.muted },
                    ]}
                  >
                    {isLocked && <Lock size={12} color={isActive ? colors.background : colors.foreground} />}
                    <Text
                      style={[
                        styles.pillText,
                        isActive
                          ? { color: colors.background, fontFamily: fonts.bodySemi }
                          : { color: colors.foreground, fontFamily: fonts.bodyMedium },
                      ]}
                    >
                      {t(catDef.label)}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>

          {/* ── Photo uploader ── */}
          <View style={styles.section}>
            {images.length === 0 ? (
              <Pressable
                onPress={pickImage}
                style={({ pressed }) => [
                  styles.photoUploader,
                  { borderColor: colors.border, backgroundColor: colors.card },
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('create.addImage')}
              >
                <View style={[styles.photoIconCircle, { backgroundColor: colors.background }]}>
                  <ImagePlus size={22} color={colors.foreground} strokeWidth={1.6} />
                </View>
                <Text style={[styles.photoMainText, { color: colors.foreground }]}>
                  {t('create.addImage')}
                </Text>
                <Text style={[styles.photoSubText, { color: colors.mutedForeground }]}>
                  {t('create.imageHint') ?? 'JPG, PNG tai WEBP, max 10 MB'}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.imageGrid}>
                {images.map((uri, idx) => (
                  <View key={uri} style={styles.imageThumb}>
                    <Image source={{ uri }} style={styles.imageThumbImg} contentFit="cover" cachePolicy="memory-disk" />
                    <PressableOpacity onPress={() => removeImage(idx)} style={styles.imageRemoveBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.remove') ?? 'Remove'}>
                      <X size={12} color="#FFFFFF" />
                    </PressableOpacity>
                    {idx === 0 && (
                      <View style={[styles.mainImageBadge, { backgroundColor: colors.foreground }]}>
                        <Text style={[styles.mainImageBadgeText, { color: colors.background }]}>{t('create.mainImage')}</Text>
                      </View>
                    )}
                  </View>
                ))}
                {images.length < 5 && (
                  <Pressable
                    onPress={pickImage}
                    style={({ pressed }) => [
                      styles.addMoreImgBtn,
                      { borderColor: colors.border, backgroundColor: colors.card },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Camera size={20} color={colors.mutedForeground} />
                    <Text style={[styles.addMoreImgText, { color: colors.mutedForeground }]}>
                      {`${images.length}/5`}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>

          {/* ── Pro upsell banner ── */}
          {FEATURES.PRO_SUBSCRIPTION && !userIsPro && (
            <Pressable onPress={() => router.push('/pro')} style={({ pressed }) => [styles.proBanner, { backgroundColor: `${colors.pro}12` }, pressed && { opacity: 0.7 }]}>
              <Crown size={16} color={colors.pro} />
              <Text style={[styles.proBannerText, { color: colors.pro }]}>{t('pro.createBanner')}</Text>
              <ChevronRight size={14} color={colors.pro} />
            </Pressable>
          )}

          {/* ── Tarjoan sub-type selector ── */}
          {selectedType === 'tarjoan' && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                {(t('create.tarjoanTypeHint') ?? 'TYYPPI').toUpperCase()}
              </Text>
              <View style={styles.twoColRow}>
                <PressableOpacity
                  onPress={() => {
                    setTarjoanType('service')
                    setSelectedTags([])
                    setItemCondition(null)
                    setServicePrice('')
                  }}
                  style={[
                    styles.tarjoanTypeChip,
                    tarjoanType === 'service'
                      ? { backgroundColor: colors.foreground }
                      : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                  ]}
                >
                  {tarjoanType === 'service' && <Check size={14} color={colors.background} />}
                  <Text style={[styles.tarjoanTypeText, { color: tarjoanType === 'service' ? colors.background : colors.foreground }]}>
                    {t('create.tarjoanService')}
                  </Text>
                </PressableOpacity>
                <PressableOpacity
                  onPress={() => {
                    setTarjoanType('item')
                    setSelectedTags([])
                    setServicePrice('')
                  }}
                  style={[
                    styles.tarjoanTypeChip,
                    tarjoanType === 'item'
                      ? { backgroundColor: colors.foreground }
                      : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                  ]}
                >
                  {tarjoanType === 'item' && <Check size={14} color={colors.background} />}
                  <Text style={[styles.tarjoanTypeText, { color: tarjoanType === 'item' ? colors.background : colors.foreground }]}>
                    {t('create.tarjoanItem')}
                  </Text>
                </PressableOpacity>
              </View>
            </View>
          )}

          {/* ── Title field ── */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {(t('post.titleLabel') ?? 'OTSIKKO').toUpperCase()} *
            </Text>
            <TextInput
              ref={titleInputRef}
              style={[
                styles.input,
                { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border },
                touchedTitle && !title.trim() && { borderColor: colors.destructive },
              ]}
              value={title}
              onChangeText={setTitle}
              onBlur={() => setTouchedTitle(true)}
              placeholder={t('post.titleLabel')}
              placeholderTextColor={colors.tertiaryForeground}
              maxLength={100}
              returnKeyType="next"
              autoCapitalize="sentences"
              accessibilityLabel={t('post.titleLabel')}
            />
            {touchedTitle && !title.trim() && (
              <Text style={[styles.fieldError, { color: colors.destructive }]} accessibilityRole="alert">
                {t('create.titleRequired')}
              </Text>
            )}
            <Text style={[styles.charCount, { color: title.length >= 90 ? colors.destructive : title.length >= 70 ? colors.pro : colors.mutedForeground }]}>
              {title.length}/100
            </Text>
          </View>

          {/* ── Description field ── */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {(t('post.descriptionLabel') ?? 'KUVAUS').toUpperCase()} *
            </Text>
            <TextInput
              ref={descriptionInputRef}
              style={[
                styles.input,
                styles.textArea,
                { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border },
                touchedDescription && !description.trim() && { borderColor: colors.destructive },
              ]}
              value={description}
              onChangeText={setDescription}
              onBlur={() => setTouchedDescription(true)}
              placeholder={t('post.descriptionLabel')}
              placeholderTextColor={colors.tertiaryForeground}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              accessibilityLabel={t('post.descriptionLabel')}
              maxLength={2000}
              inputAccessoryViewID={KEYBOARD_DONE_ID}
            />
            {touchedDescription && !description.trim() && (
              <Text style={[styles.fieldError, { color: colors.destructive }]} accessibilityRole="alert">
                {t('create.description')} *
              </Text>
            )}
            <Text style={[styles.charCount, { color: description.length >= 1900 ? colors.destructive : description.length >= 1500 ? colors.pro : colors.mutedForeground }]}>
              {description.length}/2000
            </Text>
          </View>

          {/* ── Two-column: Location + Event Date ── */}
          <View style={styles.twoColRow}>
            {/* Location */}
            <View style={styles.twoColField}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                {(t('post.locationLabel') ?? 'SIJAINTI').toUpperCase()}
              </Text>
              <LocationAutocomplete
                value={location}
                onChangeText={(text) => { setLocation(text); if (!text.trim()) { setLatitude(null); setLongitude(null) } }}
                onSelect={({ name, lat, lng }) => { setLocation(name); setLatitude(lat); setLongitude(lng) }}
                placeholder={t('post.locationLabel')}
                style={styles.twoColInput}
              />
            </View>

            {/* Date — show event date for tapahtuma, or expiration selector */}
            <View style={styles.twoColField}>
              {selectedType === 'tapahtuma' ? (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                    {(t('post.eventDate') ?? 'PAIVAMAARA').toUpperCase()} *
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border },
                    ]}
                    value={eventDate}
                    onChangeText={setEventDate}
                    placeholder={(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()}
                    placeholderTextColor={colors.tertiaryForeground}
                  />
                </>
              ) : (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                    {(t('create.expiration') ?? 'VOIMASSAOLO').toUpperCase()}
                  </Text>
                  <View style={[
                    styles.input,
                    styles.expirationPicker,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}>
                    <Text style={[styles.inputText, { color: colors.foreground }]}>
                      {expirationDays === 0
                        ? t('create.noExpiration')
                        : `${expirationDays} ${t('common.daysShort')}`}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* ── Map picker button (if location is entered) ── */}
          {location.trim().length > 0 && (
            <View style={styles.section}>
              <PressableOpacity
                onPress={handleOpenMapPicker}
                style={[styles.mapPickerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <MapPin size={16} color={colors.foreground} />
                <Text style={[styles.mapPickerBtnText, { color: colors.foreground }]}>{t('locationPicker.pickFromMap')}</Text>
              </PressableOpacity>
              {latitude !== null && longitude !== null && (
                <Text style={[styles.coordsText, { color: colors.mutedForeground }]}>
                  {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </Text>
              )}
            </View>
          )}

          {/* ── Details toggle ── */}
          <PressableOpacity
            onPress={() => setShowDetails(p => !p)}
            style={[styles.detailsToggle, { borderColor: colors.border }]}
          >
            <Text style={[styles.detailsToggleText, { color: colors.foreground }]}>
              {showDetails ? t('create.hideDetails') : t('create.showDetails')}
            </Text>
            {showDetails ? (
              <ChevronUp size={16} color={colors.foreground} />
            ) : (
              <ChevronDown size={16} color={colors.foreground} />
            )}
          </PressableOpacity>

          {showDetails && (
            <>
              {/* Daily fee for lainaa */}
              {selectedType === 'lainaa' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                    {(t('rental.dailyFee') ?? 'PAIVAVUOKRA').toUpperCase()} *
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                    value={dailyFee}
                    onChangeText={setDailyFee}
                    placeholder="0.00 \u20AC"
                    placeholderTextColor={colors.tertiaryForeground}
                    keyboardType="decimal-pad"
                  />
                </View>
              )}

              {/* Service price for tarjoan (service sub-type) */}
              {selectedType === 'tarjoan' && tarjoanType === 'service' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                    {(t('service.price') ?? 'HINTA').toUpperCase()}
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                    value={servicePrice}
                    onChangeText={setServicePrice}
                    placeholder={t('service.pricePlaceholder')}
                    placeholderTextColor={colors.tertiaryForeground}
                    keyboardType="decimal-pad"
                  />
                  <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>{t('service.priceHint')}</Text>
                  {!trust.permissions.canOfferPaidServices && servicePrice ? (
                    <Text style={[styles.fieldHint, { color: colors.destructive }]}>{t('service.requiresVerification')}</Text>
                  ) : trust.permissions.maxServicePrice !== null && servicePrice && parseFloat(servicePrice) > trust.permissions.maxServicePrice ? (
                    <Text style={[styles.fieldHint, { color: colors.destructive }]}>{t('service.maxPriceExceeded', { max: trust.permissions.maxServicePrice })}</Text>
                  ) : null}
                </View>
              )}

              {/* Item price for tarjoan (item sub-type) */}
              {selectedType === 'tarjoan' && tarjoanType === 'item' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                    {(t('create.itemPrice') ?? 'HINTA').toUpperCase()}
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                    value={servicePrice}
                    onChangeText={setServicePrice}
                    placeholder="0.00 \u20AC"
                    placeholderTextColor={colors.tertiaryForeground}
                    keyboardType="decimal-pad"
                  />
                  <Text style={[styles.fieldHint, { color: colors.mutedForeground }]}>{t('create.itemPriceHint')}</Text>
                </View>
              )}

              {/* Condition selector for tarjoan items */}
              {selectedType === 'tarjoan' && tarjoanType === 'item' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                    {(t('create.condition') ?? 'KUNTO').toUpperCase()}
                  </Text>
                  <View style={styles.tagGrid}>
                    {CONDITION_OPTIONS.map((opt) => {
                      const isSelected = itemCondition === opt.id
                      return (
                        <PressableOpacity
                          key={opt.id}
                          onPress={() => setItemCondition(isSelected ? null : opt.id)}
                          style={[
                            styles.tagChip,
                            isSelected
                              ? { backgroundColor: colors.foreground }
                              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                          ]}
                        >
                          {isSelected && <Check size={12} color={colors.background} />}
                          <Text style={[styles.tagText, { color: isSelected ? colors.background : colors.foreground }]}>
                            {t(opt.label)}
                          </Text>
                        </PressableOpacity>
                      )
                    })}
                  </View>
                </View>
              )}

              {/* Event start/end time + max capacity for tapahtuma */}
              {selectedType === 'tapahtuma' && (
                <>
                  <View style={styles.twoColRow}>
                    <View style={styles.twoColField}>
                      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                        {(t('create.eventStartTime') ?? 'ALKAA').toUpperCase()}
                      </Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                        value={eventStartTime}
                        onChangeText={setEventStartTime}
                        placeholder={t('create.eventStartTimePlaceholder')}
                        placeholderTextColor={colors.tertiaryForeground}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                    </View>
                    <View style={styles.twoColField}>
                      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                        {(t('create.eventEndTime') ?? 'PAATTYY').toUpperCase()}
                      </Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                        value={eventEndTime}
                        onChangeText={setEventEndTime}
                        placeholder={t('create.eventEndTimePlaceholder')}
                        placeholderTextColor={colors.tertiaryForeground}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                    </View>
                  </View>
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                      {(t('create.eventMaxCapacity') ?? 'MAX OSALLISTUJAT').toUpperCase()}
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                      value={eventMaxCapacity}
                      onChangeText={setEventMaxCapacity}
                      placeholder={t('create.eventMaxCapacityPlaceholder')}
                      placeholderTextColor={colors.tertiaryForeground}
                      keyboardType="number-pad"
                    />
                  </View>
                </>
              )}

              {/* Tags */}
              {availableTags.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                    {(t('create.tags') ?? 'TAGIT').toUpperCase()} ({selectedTags.length}/3)
                  </Text>
                  <View style={styles.tagGrid}>
                    {availableTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag.id)
                      return (
                        <PressableOpacity
                          key={tag.id}
                          onPress={() => toggleTag(tag.id)}
                          accessibilityRole="checkbox"
                          accessibilityLabel={t(tag.label)}
                          accessibilityState={{ checked: isSelected }}
                          style={[
                            styles.tagChip,
                            isSelected
                              ? { backgroundColor: colors.foreground }
                              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                          ]}
                        >
                          {isSelected && <Check size={12} color={colors.background} />}
                          <Text style={[styles.tagText, { color: isSelected ? colors.background : colors.foreground }]}>
                            {t(tag.label)}
                          </Text>
                        </PressableOpacity>
                      )
                    })}
                  </View>
                  {autoTags.length > 0 && selectedTags.length === 0 && (
                    <View style={styles.autoTagRow}>
                      <Text style={[styles.autoTagLabel, { color: colors.mutedForeground }]}>
                        {t('create.suggestedTags') ?? 'Ehdotetut:'}
                      </Text>
                      {autoTags.map(tag => (
                        <PressableOpacity
                          key={tag}
                          onPress={() => setSelectedTags(prev => prev.includes(tag) ? prev : [...prev, tag])}
                          accessibilityRole="button"
                          accessibilityLabel={`${t('create.addTag') ?? 'Lisaa'} ${t(`tags.${tag}`) ?? tag}`}
                          style={[styles.autoTagChip, { backgroundColor: `${colors.foreground}10` }]}
                        >
                          <Text style={[styles.autoTagText, { color: colors.foreground }]}>+ {t(`tags.${tag}`) ?? tag}</Text>
                        </PressableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Expiration (full selector — only when not tapahtuma) */}
              {selectedType !== 'tapahtuma' && (
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                    {(t('create.expiration') ?? 'VOIMASSAOLO').toUpperCase()}
                  </Text>
                  <View style={styles.tagGrid}>
                    {EXPIRATION_OPTIONS.map((opt) => {
                      const isSelected = expirationDays === opt.days
                      return (
                        <PressableOpacity
                          key={opt.days}
                          onPress={() => setExpirationDays(opt.days)}
                          style={[
                            styles.tagChip,
                            isSelected
                              ? { backgroundColor: colors.foreground }
                              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                          ]}
                        >
                          <Text style={[styles.tagText, { color: isSelected ? colors.background : colors.foreground }]}>
                            {opt.days === 0 ? t('create.noExpiration') : `${opt.days} ${t('common.daysShort')}`}
                          </Text>
                        </PressableOpacity>
                      )
                    })}
                  </View>
                </View>
              )}

              {/* Anonymous posting */}
              <View style={[styles.toggleRow, { borderColor: colors.border }]}>
                <View style={styles.toggleInfo}>
                  <EyeOff size={16} color={colors.mutedForeground} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{t('create.anonymous')}</Text>
                    <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>{t('create.anonymousHint')}</Text>
                  </View>
                </View>
                <Switch
                  value={isAnonymous}
                  onValueChange={setIsAnonymous}
                  trackColor={{ false: colors.muted, true: colors.foreground }}
                  thumbColor={colors.background}
                />
              </View>

              {/* Juuri nyt — urgency toggle */}
              {selectedType !== 'tapahtuma' && (
                <View style={styles.urgencySection}>
                  <View style={[styles.toggleRow, { borderColor: isUrgent ? colors.destructive : colors.border }]}>
                    <View style={styles.toggleInfo}>
                      <Zap size={16} color={isUrgent ? colors.destructive : colors.mutedForeground} fill={isUrgent ? colors.destructive : 'transparent'} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.toggleLabel, { color: colors.foreground }]}>{t('urgency.toggle')}</Text>
                        <Text style={[styles.toggleHint, { color: colors.mutedForeground }]}>{t('urgency.toggleHint')}</Text>
                      </View>
                    </View>
                    <Switch
                      value={isUrgent}
                      onValueChange={setIsUrgent}
                      trackColor={{ false: colors.muted, true: colors.destructive }}
                      thumbColor={colors.background}
                    />
                  </View>
                  {isUrgent && (
                    <View style={styles.urgencyOptions}>
                      {[2, 4, 8].map((h) => (
                        <PressableOpacity
                          key={h}
                          onPress={() => setUrgencyHours(h)}
                          style={[
                            styles.urgencyOption,
                            { borderColor: urgencyHours === h ? colors.destructive : colors.border },
                            urgencyHours === h && { backgroundColor: `${colors.destructive}15` },
                          ]}
                        >
                          <Text style={[styles.urgencyOptionText, { color: urgencyHours === h ? colors.destructive : colors.foreground }]}>
                            {h}h
                          </Text>
                        </PressableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {/* Bottom spacer for sticky button */}
          <View style={{ height: 90 }} />
        </ScrollView>

        {/* ── Sticky publish button ── */}
        <View style={[styles.stickyBottom, { paddingBottom: insets.bottom + 12 }]}>
          <PressableOpacity
            onPress={handleSubmit}
            disabled={submitting || !selectedType}
            style={[
              styles.publishBtn,
              {
                backgroundColor: colors.foreground,
                opacity: submitting || !selectedType ? 0.45 : 1,
                shadowColor: colors.foreground,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('create.publish')}
            accessibilityState={{ disabled: submitting || !selectedType }}
          >
            {submitting ? (
              <View style={styles.submitLoading}>
                <ActivityIndicator size="small" color={colors.background} />
                <Text style={[styles.publishText, { color: colors.background }]}>{uploadStatus || t('create.publishing')}</Text>
              </View>
            ) : (
              <Text style={[styles.publishText, { color: colors.background }]}>{t('create.publish')}</Text>
            )}
          </PressableOpacity>
        </View>

        {/* Success celebration overlay */}
        <Modal
          visible={showSuccess}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (successTimeoutRef.current) {
              clearTimeout(successTimeoutRef.current)
              successTimeoutRef.current = null
            }
            setShowSuccess(false)
            setSuccessPostId(null)
            setSuccessNeighborhood(null)
          }}
        >
          <Pressable
            style={styles.successOverlay}
            onPress={() => {
              if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current)
                successTimeoutRef.current = null
              }
              setShowSuccess(false)
              setSuccessPostId(null)
              setSuccessNeighborhood(null)
            }}
          >
            <Pressable style={[styles.successCard, { backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
              <View style={[styles.successIconCircle, { backgroundColor: colors.foreground }]}>
                <CheckCircle size={32} color={colors.background} />
              </View>
              <Text style={[styles.successTitle, { color: colors.foreground }]}>{t('create.published')}</Text>
              {successNeighborhood && (
                <Text style={[styles.successSubtitle, { color: colors.mutedForeground }]}>
                  {t('create.visibleTo', { neighborhood: successNeighborhood })}
                </Text>
              )}
              <PressableOpacity
                onPress={async () => {
                  if (successTimeoutRef.current) {
                    clearTimeout(successTimeoutRef.current)
                    successTimeoutRef.current = null
                  }
                  if (successPostId) {
                    try {
                      await Share.share({ message: `${t('create.published')} https://tackbird.com/post/${successPostId}` })
                    } catch (_) {
                      // User cancelled or share failed — navigate anyway
                    }
                    setShowSuccess(false)
                    router.replace(`/post/${successPostId}`)
                  }
                }}
                style={[styles.shareBtn, { backgroundColor: colors.foreground }]}
              >
                <Text style={[styles.shareBtnText, { color: colors.background }]}>{t('create.share')}</Text>
              </PressableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Map Location Picker Modal */}
        <Modal
          visible={mapModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setMapModalVisible(false)}
        >
          <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t('locationPicker.title')}</Text>
              <PressableOpacity onPress={() => setMapModalVisible(false)} hitSlop={12}>
                <X size={24} color={colors.foreground} />
              </PressableOpacity>
            </View>

            {/* Map — web uses embedded Leaflet */}
            {Platform.OS === 'web' ? (
              <LeafletMapPicker
                coords={tempMapCoords}
                onCoordsChange={setTempMapCoords}
                colors={colors}
              />
            ) : (
              <View style={styles.mapFallback}>
                <MapPin size={40} color={colors.mutedForeground} />
                <Text style={[styles.mapFallbackText, { color: colors.mutedForeground }]}>
                  {t('locationPicker.tapToSelect')}
                </Text>
                <Text style={[styles.mapFallbackHint, { color: colors.mutedForeground }]}>
                  {t('locationPicker.nativeHint')}
                </Text>
                {/* Simple coordinate input as native fallback */}
                <View style={styles.coordInputRow}>
                  <TextInput
                    style={[styles.coordInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                    placeholder="Lat (60.17)"
                    placeholderTextColor={colors.tertiaryForeground}
                    keyboardType="decimal-pad"
                    value={tempMapCoords?.lat?.toString() ?? ''}
                    onChangeText={(text) => {
                      const lat = parseFloat(text)
                      if (!isNaN(lat)) setTempMapCoords(prev => ({ lat, lng: prev?.lng ?? 24.94 }))
                    }}
                  />
                  <TextInput
                    style={[styles.coordInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                    placeholder="Lng (24.94)"
                    placeholderTextColor={colors.tertiaryForeground}
                    keyboardType="decimal-pad"
                    value={tempMapCoords?.lng?.toString() ?? ''}
                    onChangeText={(text) => {
                      const lng = parseFloat(text)
                      if (!isNaN(lng)) setTempMapCoords(prev => ({ lat: prev?.lat ?? 60.17, lng }))
                    }}
                  />
                </View>
              </View>
            )}

            {/* Selected coordinates display */}
            {tempMapCoords && (
              <View style={[styles.coordsDisplay, { backgroundColor: colors.card }]}>
                <MapPin size={16} color={colors.foreground} />
                <Text style={[styles.coordsDisplayText, { color: colors.foreground }]}>
                  {tempMapCoords.lat.toFixed(5)}, {tempMapCoords.lng.toFixed(5)}
                </Text>
              </View>
            )}

            {/* Confirm button */}
            <View style={styles.modalFooter}>
              <PressableOpacity
                onPress={handleConfirmMapLocation}
                disabled={!tempMapCoords}
                style={[
                  styles.confirmBtn,
                  { backgroundColor: tempMapCoords ? colors.foreground : colors.muted },
                ]}
              >
                <Text style={[styles.confirmBtnText, { color: tempMapCoords ? colors.background : colors.mutedForeground }]}>
                  {t('locationPicker.confirm')}
                </Text>
              </PressableOpacity>
            </View>
          </View>
        </Modal>

        <TrustGateModal
          visible={showTrustGate}
          onClose={() => setShowTrustGate(false)}
          requiredLevel={2}
          currentLevel={trust.level}
          featureName={t('categories.lainaa')}
          onVerifyPress={identity.startVerification}
        />

        {FEATURES.IDENTITY_VERIFICATION && (
          <VerificationModal
            visible={identity.showModal}
            onClose={() => identity.setShowModal(false)}
            onConfirm={identity.confirmVerification}
            loading={identity.loading}
            error={identity.error}
            isSuccess={identity.status === 'success'}
          />
        )}
      </View>
      <KeyboardDoneAccessory />
    </KeyboardAvoidingView>
    </ScreenErrorBoundary>
  )
}

// ── Leaflet Map Picker for Web ──
function LeafletMapPicker({ coords, onCoordsChange, colors }: {
  coords: { lat: number; lng: number } | null
  onCoordsChange: (c: { lat: number; lng: number }) => void
  colors: ReturnType<typeof useTheme>['colors']
}) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)

  useEffect(() => {
    if (Platform.OS !== 'web' || !mapRef.current) return

    // Load Leaflet CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    // Load Leaflet JS
    const loadLeaflet = () => {
      return new Promise<void>((resolve) => {
        if ((window as any).L) { resolve(); return }
        const script = document.createElement('script')
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        script.onload = () => resolve()
        document.head.appendChild(script)
      })
    }

    loadLeaflet().then(() => {
      const L = (window as any).L
      if (!L || !mapRef.current || leafletMapRef.current) return

      const center = coords ?? { lat: 60.1699, lng: 24.9384 } // Helsinki center
      const map = L.map(mapRef.current).setView([center.lat, center.lng], 14)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      // Add existing marker if coords exist
      if (coords) {
        markerRef.current = L.marker([coords.lat, coords.lng]).addTo(map)
      }

      // Click handler to place/move pin
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng])
        } else {
          markerRef.current = L.marker([lat, lng]).addTo(map)
        }
        onCoordsChange({ lat, lng })
      })

      leafletMapRef.current = map

      // Fix map size after render
      setTimeout(() => map.invalidateSize(), 100)
    })

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove()
        leafletMapRef.current = null
        markerRef.current = null
      }
    }
  }, []) // Only init once

  if (Platform.OS !== 'web') return null

  return (
    <View style={{ flex: 1 }}>
      <div
        ref={mapRef as any}
        style={{ width: '100%', height: '100%', minHeight: 300 }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    textAlign: 'center',
  },
  headerDraftLink: {
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  headerDraftText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    textDecorationLine: 'underline',
  },

  // ── Scroll content ──
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },

  // ── Section spacing + labels ──
  section: {
    marginBottom: 20,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // ── Category pills ──
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingRight: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    minHeight: 40,
  },
  pillText: {
    fontSize: 13,
  },

  // ── Photo uploader ──
  photoUploader: {
    aspectRatio: 1.25,
    borderRadius: 22,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  photoMainText: {
    fontSize: 13.5,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
  },
  photoSubText: {
    fontSize: 11,
    fontFamily: fonts.body,
  },

  // ── Image grid (when images exist) ──
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  imageThumb: {
    width: 80,
    height: 80,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  imageThumbImg: {
    width: '100%',
    height: '100%',
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainImageBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 2,
    alignItems: 'center',
  },
  mainImageBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  addMoreImgBtn: {
    width: 80,
    height: 80,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addMoreImgText: {
    fontSize: 11,
    fontFamily: fonts.body,
  },

  // ── Form inputs ──
  input: {
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 14.5,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  inputText: {
    fontSize: 14.5,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  textArea: {
    height: undefined,
    minHeight: 90,
    paddingVertical: 14,
    fontSize: 13.5,
    fontWeight: '400',
    fontFamily: fonts.body,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  fieldError: {
    fontSize: 12,
    fontFamily: fonts.body,
    paddingTop: 2,
  },
  fieldHint: {
    fontSize: 11,
    fontFamily: fonts.body,
    marginTop: 2,
  },
  charCount: {
    fontSize: 11,
    textAlign: 'right',
    fontFamily: fonts.body,
  },

  // ── Two-column layout ──
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  twoColField: {
    flex: 1,
    gap: 8,
  },
  twoColInput: {
    flex: 1,
  },
  expirationPicker: {
    justifyContent: 'center',
  },

  // ── Tags ──
  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    minHeight: 40,
  },
  tagText: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
  },
  autoTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 4,
  },
  autoTagLabel: {
    fontSize: 11,
    fontFamily: fonts.body,
    width: '100%',
  },
  autoTagChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  autoTagText: {
    fontSize: 12,
    fontFamily: fonts.body,
  },

  // ── Details toggle ──
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 48,
    marginBottom: 20,
  },
  detailsToggleText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
  },

  // ── Toggle rows (anonymous / urgency) ──
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
    marginBottom: 12,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodyMedium,
  },
  toggleHint: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 15,
    marginTop: 2,
  },

  // ── Urgency ──
  urgencySection: { gap: 8, marginBottom: 12 },
  urgencyOptions: { flexDirection: 'row', gap: 12 },
  urgencyOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    minHeight: 44,
  },
  urgencyOptionText: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bodySemi },

  // ── Sticky publish button ──
  stickyBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  publishBtn: {
    borderRadius: 999,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  publishText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  submitLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // ── Pro banner ──
  proBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 20,
    marginBottom: 20,
  },
  proBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },

  // ── Map picker ──
  mapPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  mapPickerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  coordsText: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: fonts.body,
  },

  // ── Tarjoan sub-type ──
  tarjoanTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    minHeight: 44,
    flex: 1,
    justifyContent: 'center',
  },
  tarjoanTypeText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },

  // ── Success overlay ──
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  successCard: {
    borderRadius: 28,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 300,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: fonts.headingSemi,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    fontFamily: fonts.body,
    textAlign: 'center',
  },
  shareBtn: {
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 4,
  },
  shareBtnText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
  },

  // ── Map modal ──
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: fonts.headingSemi,
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  confirmBtn: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  coordsDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  coordsDisplayText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: fonts.body,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  mapFallbackText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: fonts.headingSemi,
  },
  mapFallbackHint: {
    fontSize: 13,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
  coordInputRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 16,
  },
  coordInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
})
