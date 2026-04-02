declare const __DEV__: boolean

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Switch, Share } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, ChevronRight, ChevronUp, ChevronDown, Camera, X, Check, Clock, MapPin, Users, EyeOff, Lock, Zap, TrendingUp, Crown, CheckCircle } from 'lucide-react-native'
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
import { usePoints } from '@/hooks/usePoints'
import { usePriceSuggestion } from '@/hooks/usePriceSuggestion'
import { triggerPush } from '@/lib/pushTrigger'
import { useTrustLevel } from '@/hooks/useTrustLevel'
import { useIdentityVerification } from '@/hooks/useIdentityVerification'
import { TrustGateModal } from '@/components/TrustGate'
import { VerificationModal } from '@/components/VerificationModal'
import { TrustBadge } from '@/components/TrustBadge'
import { CATEGORY_ICON_MAP } from '@/lib/categoryIcons'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { trackEvent } from '@/lib/analytics'
import { getCachedUserId } from '@/lib/authCache'
import { checkRateLimit, getRateLimitMessage } from '@/lib/rateLimiter'
import { useBoosts } from '@/hooks/useBoosts'
import type { PostType, TrustLevel } from '@/lib/types'

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
  nappaa: [
    { id: 'ruoka', label: 'tags.ruoka' },
    { id: 'huonekalut', label: 'tags.huonekalut' },
    { id: 'vaatteet', label: 'tags.vaatteet' },
    { id: 'kirjat', label: 'tags.kirjat' },
    { id: 'lelut', label: 'tags.lelut' },
    { id: 'puutarha', label: 'tags.puutarha' },
    { id: 'kodinkoneet', label: 'tags.kodinkoneet' },
    { id: 'elektroniikka', label: 'tags.elektroniikka' },
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
  const [step, setStep] = useState<'category' | 'form'>('category')
  const [selectedType, setSelectedType] = useState<PostType | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
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
  const [boostPost, setBoostPost] = useState(false)

  // Handle pre-selected type from query params (e.g., from events screen)
  useEffect(() => {
    if (params.type && Object.keys(CATEGORIES).includes(params.type)) {
      // Respect feature flags — don't allow disabled categories via deep link
      if (params.type === 'lainaa' && !FEATURES.LENDING) return
      if (params.type === 'nappaa' && !FEATURES.GRAB) return
      setSelectedType(params.type as PostType)
      setStep('form')
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
      // Fetch user neighborhood for price suggestions
      supabase.from('profiles').select('naapurusto, is_pro').eq('id', id).single()
        .then(({ data }: any) => { if (data?.naapurusto) setUserNeighborhood(data.naapurusto as string); if (data?.is_pro) setUserIsPro(true) })
        .then(() => {}, () => {})
    })
  }, [supabase, router])

  const { awardPoints } = usePoints()
  const trust = useTrustLevel(currentUserId)
  const identity = useIdentityVerification(currentUserId)
  const { suggestion: priceSuggestion } = usePriceSuggestion(selectedType, selectedTags, userNeighborhood)
  const boosts = useBoosts(currentUserId)

  // Smart default: auto-populate location from user's neighborhood
  useEffect(() => {
    if (userNeighborhood && !location && step === 'form') {
      setLocation(userNeighborhood)
    }
  }, [userNeighborhood, step]) // Only runs when entering form step

  // Auto-expand details for categories that have required detail fields
  useEffect(() => {
    if (selectedType === 'lainaa' || selectedType === 'tapahtuma' || selectedType === 'tarjoan') {
      setShowDetails(true)
    }
  }, [selectedType])

  // Discard confirmation when going back with unsaved content (error prevention)
  const hasUnsavedContent = title.trim().length > 0 || description.trim().length > 0 || images.length > 0
  const handleBackToCategory = useCallback(() => {
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
              setBoostPost(false)
              setLatitude(null)
              setLongitude(null)
              setStep('category')
            },
          },
        ],
      )
    } else {
      setStep('category')
    }
  }, [hasUnsavedContent, t])

  const handleCategorySelect = (type: PostType) => {
    // Gate lainaa behind trust level 2
    if (type === 'lainaa' && !trust.permissions.canLainaa) {
      setShowTrustGate(true)
      return
    }
    setSelectedType(type)
    setSelectedTags([])
    setTarjoanType('service')
    setItemCondition(null)
    setStep('form')
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

  const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif']
  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

  const uploadImages = async (userId: string, postId: string): Promise<string | null> => {
    if (images.length === 0) return null
    setUploadStatus(t('create.uploadingImages'))

    const uploadedUrls: string[] = []
    let failedCount = 0
    for (let i = 0; i < images.length; i++) {
      const uri = images[i]
      const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase()
      if (!ALLOWED_EXTS.includes(ext)) { failedCount++; continue } // skip invalid types
      const path = `${userId}/${postId}/${i}.${ext}`

      const response = await fetch(uri)
      const blob = await response.blob()
      if (blob.size > MAX_FILE_SIZE) { failedCount++; continue } // skip too-large files
      const arrayBuffer = await blob.arrayBuffer()

      const { error } = await supabase.storage
        .from('post-images')
        .upload(path, arrayBuffer, { contentType: `image/${ext}`, upsert: true })

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
      if (imgError) console.error('[create] post_images insert failed:', imgError.message)
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
      Alert.alert(t('common.error'), t('create.titleAndDescRequired'))
      return
    }

    // Rate limiting
    if (!await checkRateLimit('post_create')) {
      Alert.alert(t('common.error'), getRateLimitMessage('post_create'))
      return
    }

    // Pre-submit content moderation check
    const contentWarning = quickContentCheck(title, description)
    if (contentWarning) {
      Alert.alert(t('common.error'), contentWarning)
      return
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
    // Prevent negative service/item prices (error prevention)
    if (selectedType === 'tarjoan' && servicePrice && !isNaN(parseFloat(servicePrice)) && parseFloat(servicePrice) < 0) {
      Alert.alert(t('common.error'), t('create.priceCannotBeNegative'))
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

    // All validation passed — give success haptic feedback
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    setSubmitting(true)
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
        // Moderation service unavailable — allow the post through
        // and rely on async moderation as fallback
      }

      // Create post
      setUploadStatus(t('create.publishing'))
      // Fetch profile to check Pro status for priority listing
      const { data: creatorProfile } = await supabase.from('profiles').select('is_pro').eq('id', user.id).single()
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
        is_active: true,
        tags: finalTags,
        is_pro_listing: !!(creatorProfile as any)?.is_pro,
      }).select('id').single()

      if (error) throw error

      // Upload images if any
      if (images.length > 0 && post?.id) {
        const mainImageUrl = await uploadImages(user.id, post.id)
        if (mainImageUrl) {
          const { error: imgUrlError } = await (supabase.from('posts') as any).update({ image_url: mainImageUrl }).eq('id', post.id)
          if (imgUrlError) console.error('[create] image_url update failed:', imgUrlError.message)
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
            await (supabase.from('posts') as any).delete().eq('id', post.id)
            setSubmitting(false)
            setUploadStatus('')
            return
          }
          // userChoice === 'publish' — continue without images
        }
      }

      // Create event record if tapahtuma
      if (selectedType === 'tapahtuma' && post?.id) {
        // Build event date with optional start time
        let eventDateISO = new Date(eventDate).toISOString()
        if (eventStartTime && /^\d{1,2}:\d{2}$/.test(eventStartTime)) {
          const [h, m] = eventStartTime.split(':').map(Number)
          const d = new Date(eventDate)
          d.setHours(h, m, 0, 0)
          eventDateISO = d.toISOString()
        }

        // Build event end date with optional end time
        let eventEndISO: string | null = null
        if (eventEndTime && /^\d{1,2}:\d{2}$/.test(eventEndTime)) {
          const [h, m] = eventEndTime.split(':').map(Number)
          const d = new Date(eventDate)
          d.setHours(h, m, 0, 0)
          eventEndISO = d.toISOString()
        }

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
          console.error('[create] event insert failed:', eventError.message)
          Alert.alert(t('common.error'), t('create.eventCreateFailed') ?? 'Event creation failed')
        }
      }

      // Award points for creating a post
      if (post?.id && user.id) {
        awardPoints(user.id, 'post_created', post.id).catch(() => {})
        // Check if this is the user's first post — award bonus
        Promise.resolve(
          supabase.from('posts').select('id', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('is_active', true)
        ).then(({ count }) => {
          if (count === 1) {
            awardPoints(user.id, 'first_post_bonus', post.id).catch(() => {})
          }
        }).catch(() => {})
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
        }).catch(() => {}) // Non-blocking

      }

      // Push notification for urgent posts (broadcast) — rate limited to 1 per 30 min
      if (isUrgent && post?.id) {
        const URGENT_COOLDOWN_KEY = 'tackbird_last_urgent'
        const URGENT_COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes
        const lastUrgent = await AsyncStorage.getItem(URGENT_COOLDOWN_KEY)
        if (lastUrgent && Date.now() - parseInt(lastUrgent) < URGENT_COOLDOWN_MS) {
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
      setStep('category')

      // Boost the post if requested
      if (boostPost && createdPostId) {
        await boosts.useBoostOnPost(createdPostId)
        setBoostPost(false)
      }

      // Show success celebration overlay before navigating
      setSuccessPostId(createdPostId)
      setSuccessNeighborhood(userNeighborhood)
      setShowSuccess(true)
      successTimeoutRef.current = setTimeout(() => {
        successTimeoutRef.current = null
        setShowSuccess(false)
        router.replace(`/post/${createdPostId}`)
      }, 2000)
    } catch (err: any) {
      if (__DEV__) console.log('[create] error:', JSON.stringify(err))
      Alert.alert(t('common.error'), err?.message || t('create.createFailed'))
    } finally {
      setSubmitting(false)
      setUploadStatus('')
    }
  }, [submitting, selectedType, title, description, location, latitude, longitude, dailyFee, servicePrice, eventDate, eventStartTime, eventEndTime, eventMaxCapacity, selectedTags, tarjoanType, itemCondition, expirationDays, isUrgent, urgencyHours, isAnonymous, images, supabase, router, t, quickContentCheck, trust, awardPoints, boostPost, boosts, userNeighborhood, uploadImages])

  // ── Category selection step ──
  if (step === 'category') {
    return (
      <ScreenErrorBoundary screenName="Create">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: 12, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('create.selectCategory')}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.categoryGrid}>
          {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).filter(([type]) => {
            if (type === 'lainaa' && !FEATURES.LENDING) return false
            if (type === 'nappaa' && !FEATURES.GRAB) return false
            return true
          }).map(([type, cat]) => {
            const Icon = CATEGORY_ICON_MAP[cat.icon]
            const isLocked = type === 'lainaa' && !trust.permissions.canLainaa
            return (
              <Pressable
                key={type}
                onPress={() => handleCategorySelect(type)}
                style={({ pressed }) => [styles.categoryCard, { backgroundColor: colors.card }, pressed && { opacity: 0.7 }, isLocked && { opacity: 0.6 }]}
              >
                <View style={[styles.categoryIcon, { backgroundColor: isDark ? cat.bgDark : cat.bgLight }]}>
                  {Icon && <Icon size={24} color={cat.color} />}
                  {isLocked && (
                    <View style={styles.lockOverlay}>
                      <Lock size={14} color={colors.primaryForeground} />
                    </View>
                  )}
                </View>
                <View style={styles.categoryTextWrap}>
                  <Text style={[styles.categoryName, { color: colors.foreground }]}>{t(cat.label)}</Text>
                  <Text style={[styles.categorySub, { color: colors.mutedForeground }]}>
                    {isLocked ? t('trust.requiresTier2Short') : t(cat.subtitle)}
                  </Text>
                </View>
                {isLocked ? (
                  <TrustBadge level={2} size="small" showLabel />
                ) : (
                  <ChevronRight size={16} color={colors.mutedForeground} />
                )}
              </Pressable>
            )
          })}
        </ScrollView>

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
      </ScreenErrorBoundary>
    )
  }

  // ── Form step ──
  const cat = selectedType ? CATEGORIES[selectedType] : null
  const availableTags = selectedType === 'tarjoan'
    ? (tarjoanType === 'item' ? TARJOAN_ITEM_TAGS : TARJOAN_SERVICE_TAGS)
    : selectedType ? (POST_TAGS[selectedType] ?? []) : []

  return (
    <ScreenErrorBoundary screenName="Create">
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: 12, borderBottomColor: colors.border }]}>
          <Pressable onPress={handleBackToCategory} hitSlop={12} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
          {cat && (
            <View style={[styles.headerBadge, { backgroundColor: isDark ? cat.bgDark : cat.bgLight }]}>
              {CATEGORY_ICON_MAP[cat.icon] && React.createElement(CATEGORY_ICON_MAP[cat.icon], { size: 14, color: cat.color })}
              <Text style={[styles.headerBadgeText, { color: cat.color }]}>{t(cat.label)}</Text>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Pro upsell banner */}
          {FEATURES.PRO_SUBSCRIPTION && !userIsPro && (
            <Pressable onPress={() => router.push('/pro')} style={[styles.proBanner, { backgroundColor: `${colors.pro}12` }]}>
              <Crown size={16} color={colors.pro} />
              <Text style={[styles.proBannerText, { color: colors.pro }]}>{t('pro.createBanner')}</Text>
              <ChevronRight size={14} color={colors.pro} />
            </Pressable>
          )}

          {/* Images */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>{t('create.images')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
              {images.map((uri, idx) => (
                <View key={idx} style={styles.imageThumb}>
                  <Image source={{ uri }} style={styles.imageThumbImg} contentFit="cover" />
                  <Pressable onPress={() => removeImage(idx)} style={styles.imageRemoveBtn}>
                    <X size={12} color={colors.primaryForeground} />
                  </Pressable>
                  {idx === 0 && (
                    <View style={[styles.mainImageBadge, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.mainImageBadgeText, { color: colors.primaryForeground }]}>{t('create.mainImage')}</Text>
                    </View>
                  )}
                </View>
              ))}
              {images.length < 5 && (
                <Pressable onPress={pickImage} style={[styles.addImageBtn, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Camera size={24} color={colors.mutedForeground} />
                  <Text style={[styles.addImageText, { color: colors.mutedForeground }]}>{images.length === 0 ? t('create.addImage') : `${images.length}/5`}</Text>
                </Pressable>
              )}
            </ScrollView>
          </View>

          {/* Tarjoan sub-type selector: Palvelu / Tavara */}
          {selectedType === 'tarjoan' && (
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.foreground }]}>{t('create.tarjoanTypeHint')}</Text>
              <View style={styles.tagGrid}>
                <Pressable
                  onPress={() => {
                    setTarjoanType('service')
                    setSelectedTags([])
                    setItemCondition(null)
                  }}
                  style={[
                    styles.tarjoanTypeChip,
                    tarjoanType === 'service'
                      ? { backgroundColor: cat?.color ?? colors.primary }
                      : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                  ]}
                >
                  {tarjoanType === 'service' && <Check size={14} color={colors.primaryForeground} />}
                  <Text style={[styles.tarjoanTypeText, { color: tarjoanType === 'service' ? colors.primaryForeground : colors.foreground }]}>
                    {t('create.tarjoanService')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setTarjoanType('item')
                    setSelectedTags([])
                    setServicePrice('')
                  }}
                  style={[
                    styles.tarjoanTypeChip,
                    tarjoanType === 'item'
                      ? { backgroundColor: cat?.color ?? colors.primary }
                      : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                  ]}
                >
                  {tarjoanType === 'item' && <Check size={14} color={colors.primaryForeground} />}
                  <Text style={[styles.tarjoanTypeText, { color: tarjoanType === 'item' ? colors.primaryForeground : colors.foreground }]}>
                    {t('create.tarjoanItem')}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Title */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>{t('post.titleLabel')} *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
              value={title}
              onChangeText={setTitle}
              placeholder={t('post.titleLabel')}
              placeholderTextColor={colors.mutedForeground}
              maxLength={100}
              returnKeyType="next"
              autoCapitalize="sentences"
            />
            <Text style={[styles.charCount, { color: title.length >= 90 ? colors.destructive : title.length >= 70 ? colors.pro : colors.mutedForeground }]}>{title.length}/100</Text>
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>{t('post.descriptionLabel')} *</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('post.descriptionLabel')}
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={2000}
            />
            <Text style={[styles.charCount, { color: description.length >= 1900 ? colors.destructive : description.length >= 1500 ? colors.pro : colors.mutedForeground }]}>{description.length}/2000</Text>
          </View>

          {/* Details toggle */}
          <Pressable
            onPress={() => setShowDetails(p => !p)}
            style={[styles.detailsToggle, { borderColor: colors.border }]}
          >
            <Text style={[styles.detailsToggleText, { color: colors.primary }]}>
              {showDetails ? t('create.hideDetails') : t('create.showDetails')}
            </Text>
            {showDetails ? (
              <ChevronUp size={16} color={colors.primary} />
            ) : (
              <ChevronDown size={16} color={colors.primary} />
            )}
          </Pressable>

          {showDetails && (
            <>
              {/* Location */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground }]}>{t('post.locationLabel')}</Text>
                <View style={styles.locationRow}>
                  <TextInput
                    style={[styles.input, styles.locationInput, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                    value={location}
                    onChangeText={(text) => { setLocation(text); if (!text.trim()) { setLatitude(null); setLongitude(null) } }}
                    placeholder={t('post.locationLabel')}
                    placeholderTextColor={colors.mutedForeground}
                  />
                  <Pressable
                    onPress={handleOpenMapPicker}
                    style={[styles.mapPickerBtn, { backgroundColor: colors.primary }]}
                  >
                    <MapPin size={16} color={colors.primaryForeground} />
                    <Text style={[styles.mapPickerBtnText, { color: colors.primaryForeground }]}>{t('locationPicker.pickFromMap')}</Text>
                  </Pressable>
                </View>
                {latitude !== null && longitude !== null && (
                  <Text style={[styles.coordsText, { color: colors.mutedForeground }]}>
                    {latitude.toFixed(5)}, {longitude.toFixed(5)}
                  </Text>
                )}
              </View>

              {/* Daily fee for lainaa */}
              {selectedType === 'lainaa' && (
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.foreground }]}>{t('rental.dailyFee')} *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                    value={dailyFee}
                    onChangeText={setDailyFee}
                    placeholder="0.00 €"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                  />
                  {priceSuggestion && selectedType === 'lainaa' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 }}>
                      <TrendingUp size={14} color={colors.primary} />
                      <Text style={{ fontSize: 12, color: colors.primary, fontFamily: fonts.bodyMedium }}>
                        {t('create.priceSuggestionDaily', {
                          min: priceSuggestion.min,
                          max: priceSuggestion.max,
                          count: priceSuggestion.count,
                        })}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Service price for tarjoan (service sub-type) */}
              {selectedType === 'tarjoan' && tarjoanType === 'service' && (
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.foreground }]}>{t('service.price')}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                    value={servicePrice}
                    onChangeText={setServicePrice}
                    placeholder={t('service.pricePlaceholder')}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                  />
                  <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{t('service.priceHint')}</Text>
                  {!trust.permissions.canOfferPaidServices && servicePrice ? (
                    <Text style={[styles.charCount, { color: colors.destructive }]}>{t('service.requiresVerification')}</Text>
                  ) : trust.permissions.maxServicePrice !== null && servicePrice && parseFloat(servicePrice) > trust.permissions.maxServicePrice ? (
                    <Text style={[styles.charCount, { color: colors.destructive }]}>{t('service.maxPriceExceeded', { max: trust.permissions.maxServicePrice })}</Text>
                  ) : null}
                  {priceSuggestion && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 }}>
                      <TrendingUp size={14} color={colors.primary} />
                      <Text style={{ fontSize: 12, color: colors.primary, fontFamily: fonts.bodyMedium }}>
                        {t('create.priceSuggestion', {
                          min: priceSuggestion.min,
                          max: priceSuggestion.max,
                          count: priceSuggestion.count,
                        })}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Item price for tarjoan (item sub-type) */}
              {selectedType === 'tarjoan' && tarjoanType === 'item' && (
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.foreground }]}>{t('create.itemPrice')}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                    value={servicePrice}
                    onChangeText={setServicePrice}
                    placeholder="0.00 €"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                  />
                  <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{t('create.itemPriceHint')}</Text>
                </View>
              )}

              {/* Condition selector for tarjoan items */}
              {selectedType === 'tarjoan' && tarjoanType === 'item' && (
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.foreground }]}>{t('create.condition')}</Text>
                  <View style={styles.tagGrid}>
                    {CONDITION_OPTIONS.map((opt) => {
                      const isSelected = itemCondition === opt.id
                      return (
                        <Pressable
                          key={opt.id}
                          onPress={() => setItemCondition(isSelected ? null : opt.id)}
                          style={[
                            styles.tagChip,
                            isSelected
                              ? { backgroundColor: cat?.color ?? colors.primary }
                              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                          ]}
                        >
                          {isSelected && <Check size={12} color={colors.primaryForeground} />}
                          <Text style={[styles.tagText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>
                            {t(opt.label)}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              )}

              {/* Event date for tapahtuma */}
              {selectedType === 'tapahtuma' && (
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.foreground }]}>{t('post.eventDate')} *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                    value={eventDate}
                    onChangeText={setEventDate}
                    placeholder={(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()}
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              )}

              {/* Event start/end time + max capacity for tapahtuma */}
              {selectedType === 'tapahtuma' && (
                <>
                  <View style={styles.field}>
                    <Text style={[styles.label, { color: colors.foreground }]}>
                      <Clock size={14} color={colors.mutedForeground} /> {t('create.eventStartTime')}
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                      value={eventStartTime}
                      onChangeText={setEventStartTime}
                      placeholder={t('create.eventStartTimePlaceholder')}
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={[styles.label, { color: colors.foreground }]}>
                      <Clock size={14} color={colors.mutedForeground} /> {t('create.eventEndTime')}
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                      value={eventEndTime}
                      onChangeText={setEventEndTime}
                      placeholder={t('create.eventEndTimePlaceholder')}
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={[styles.label, { color: colors.foreground }]}>
                      <Users size={14} color={colors.mutedForeground} /> {t('create.eventMaxCapacity')}
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                      value={eventMaxCapacity}
                      onChangeText={setEventMaxCapacity}
                      placeholder={t('create.eventMaxCapacityPlaceholder')}
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="number-pad"
                    />
                  </View>
                </>
              )}

              {/* Tags */}
              {availableTags.length > 0 && (
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.foreground }]}>{t('create.tags')} ({selectedTags.length}/3)</Text>
                  <View style={styles.tagGrid}>
                    {availableTags.map((tag) => {
                      const isSelected = selectedTags.includes(tag.id)
                      return (
                        <Pressable
                          key={tag.id}
                          onPress={() => toggleTag(tag.id)}
                          style={[
                            styles.tagChip,
                            isSelected
                              ? { backgroundColor: cat?.color ?? colors.primary }
                              : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                          ]}
                        >
                          {isSelected && <Check size={12} color={colors.primaryForeground} />}
                          <Text style={[styles.tagText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>
                            {t(tag.label)}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              )}

              {/* Expiration */}
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  <Clock size={14} color={colors.mutedForeground} /> {t('create.expiration')}
                </Text>
                <View style={styles.tagGrid}>
                  {EXPIRATION_OPTIONS.map((opt) => {
                    const isSelected = expirationDays === opt.days
                    return (
                      <Pressable
                        key={opt.days}
                        onPress={() => setExpirationDays(opt.days)}
                        style={[
                          styles.tagChip,
                          isSelected
                            ? { backgroundColor: colors.primary }
                            : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                        ]}
                      >
                        <Text style={[styles.tagText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>
                          {opt.days === 0 ? t('create.noExpiration') : `${opt.days} ${t('common.daysShort')}`}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>

              {/* Anonymous posting */}
              <View style={styles.anonymousRow}>
                <View style={styles.anonymousInfo}>
                  <EyeOff size={16} color={colors.mutedForeground} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.foreground, marginBottom: 0 }]}>{t('create.anonymous')}</Text>
                    <Text style={[styles.anonymousHint, { color: colors.mutedForeground }]}>{t('create.anonymousHint')}</Text>
                  </View>
                </View>
                <Switch
                  value={isAnonymous}
                  onValueChange={setIsAnonymous}
                  trackColor={{ false: colors.muted, true: colors.primary }}
                  thumbColor={colors.primaryForeground}
                />
              </View>

              {/* Juuri nyt — urgency toggle */}
              {selectedType !== 'tapahtuma' && (
                <View style={styles.urgencySection}>
                  <View style={[styles.anonymousRow, { borderColor: isUrgent ? colors.destructive : colors.border }]}>
                    <View style={styles.anonymousInfo}>
                      <Zap size={16} color={isUrgent ? colors.destructive : colors.mutedForeground} fill={isUrgent ? colors.destructive : 'transparent'} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.label, { color: colors.foreground, marginBottom: 0 }]}>{t('urgency.toggle')}</Text>
                        <Text style={[styles.anonymousHint, { color: colors.mutedForeground }]}>{t('urgency.toggleHint')}</Text>
                      </View>
                    </View>
                    <Switch
                      value={isUrgent}
                      onValueChange={setIsUrgent}
                      trackColor={{ false: colors.muted, true: colors.destructive }}
                      thumbColor={colors.primaryForeground}
                    />
                  </View>
                  {isUrgent && (
                    <View style={styles.urgencyOptions}>
                      {[2, 4, 8].map((h) => (
                        <Pressable
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
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {/* Boost toggle — gate behind FEATURES.BOOSTS */}
          {FEATURES.BOOSTS && (
            <View style={styles.boostSection}>
              <View style={[styles.anonymousRow, { borderColor: boostPost ? colors.accent : colors.border }]}>
                <View style={styles.anonymousInfo}>
                  <TrendingUp size={16} color={boostPost ? colors.accent : colors.mutedForeground} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.foreground, marginBottom: 0 }]}>{t('boost.boostToggle')}</Text>
                    <Text style={[styles.anonymousHint, { color: colors.mutedForeground }]}>{t('boost.boostHint')}</Text>
                  </View>
                </View>
                <Switch
                  value={boostPost}
                  onValueChange={(val) => {
                    if (val && boosts.balance <= 0) {
                      Alert.alert(t('boost.title'), t('boost.noBalance'), [
                        { text: t('common.cancel'), style: 'cancel' },
                        { text: t('boost.buyBoosts'), onPress: () => router.push('/boosts') },
                      ])
                      return
                    }
                    setBoostPost(val)
                  }}
                  trackColor={{ false: colors.muted, true: colors.accent }}
                  thumbColor={colors.primaryForeground}
                />
              </View>
              {boostPost && (
                <View style={[styles.boostInfo, { backgroundColor: `${colors.accent}10` }]}>
                  <Text style={[styles.boostInfoText, { color: colors.accent }]}>
                    {boosts.balance === 1 ? t('boost.balanceOne') : t('boost.balance', { count: boosts.balance })}
                  </Text>
                </View>
              )}
              {!boostPost && boosts.balance <= 0 && (
                <Pressable onPress={() => router.push('/boosts')} style={[styles.boostUpsell, { backgroundColor: `${colors.accent}10` }]}>
                  <Text style={[styles.boostUpsellText, { color: colors.accent }]}>{t('boost.buyBoosts')}</Text>
                  <ChevronRight size={14} color={colors.accent} />
                </Pressable>
              )}
            </View>
          )}

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('create.publish')}
            accessibilityState={{ disabled: submitting }}
          >
            {submitting ? (
              <View style={styles.submitLoading}>
                <ActivityIndicator size="small" color={colors.primaryForeground} />
                <Text style={[styles.submitText, { color: colors.primaryForeground }]}>{uploadStatus || t('create.publishing')}</Text>
              </View>
            ) : (
              <Text style={[styles.submitText, { color: colors.primaryForeground }]}>{t('create.publish')}</Text>
            )}
          </Pressable>
        </ScrollView>

        {/* Success celebration overlay */}
        <Modal
          visible={showSuccess}
          transparent
          animationType="fade"
          onRequestClose={() => {
            // Dismiss without navigating to the post — just close and reset
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
              // Backdrop press — dismiss without navigating, reset to prevent re-submit
              if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current)
                successTimeoutRef.current = null
              }
              setShowSuccess(false)
              setSuccessPostId(null)
              setSuccessNeighborhood(null)
            }}
          >
            <Pressable style={[styles.successCard, { backgroundColor: colors.card }]} onPress={(e) => e.stopPropagation()}>
              <CheckCircle size={48} color={colors.primary} />
              <Text style={[styles.successTitle, { color: colors.foreground }]}>{t('create.published')}</Text>
              {successNeighborhood && (
                <Text style={[styles.successSubtitle, { color: colors.mutedForeground }]}>
                  {t('create.visibleTo', { neighborhood: successNeighborhood })}
                </Text>
              )}
              <Pressable
                onPress={async () => {
                  // Cancel the auto-navigation timeout so it doesn't fire during/after sharing
                  if (successTimeoutRef.current) {
                    clearTimeout(successTimeoutRef.current)
                    successTimeoutRef.current = null
                  }
                  if (successPostId) {
                    try {
                      await Share.share({ message: `${t('create.published')} https://tackbird.fi/post/${successPostId}` })
                    } catch (_) {
                      // User cancelled or share failed — navigate anyway
                    }
                    // Navigate after share sheet is dismissed
                    setShowSuccess(false)
                    router.replace(`/post/${successPostId}`)
                  }
                }}
                style={[styles.shareBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.shareBtnText, { color: colors.primaryForeground }]}>{t('create.share')}</Text>
              </Pressable>
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
              <Pressable onPress={() => setMapModalVisible(false)} hitSlop={12}>
                <X size={24} color={colors.foreground} />
              </Pressable>
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
                    placeholderTextColor={colors.mutedForeground}
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
                    placeholderTextColor={colors.mutedForeground}
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
                <MapPin size={16} color={colors.primary} />
                <Text style={[styles.coordsDisplayText, { color: colors.foreground }]}>
                  {tempMapCoords.lat.toFixed(5)}, {tempMapCoords.lng.toFixed(5)}
                </Text>
              </View>
            )}

            {/* Confirm button */}
            <View style={styles.modalFooter}>
              <Pressable
                onPress={handleConfirmMapLocation}
                disabled={!tempMapCoords}
                style={[
                  styles.confirmBtn,
                  { backgroundColor: tempMapCoords ? colors.primary : colors.muted },
                ]}
              >
                <Text style={[styles.confirmBtnText, { color: tempMapCoords ? colors.primaryForeground : colors.mutedForeground }]}>
                  {t('locationPicker.confirm')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
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
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  headerBadgeText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', fontFamily: fonts.bodyMedium },
  categoryGrid: { padding: 16, gap: 12 },
  categoryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 12,
  },
  categoryIcon: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  lockOverlay: {
    position: 'absolute', top: -4, right: -4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  urgencySection: { gap: 8 },
  boostSection: { gap: 8 },
  boostInfo: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  boostInfoText: { fontSize: 12, fontFamily: fonts.bodySemi },
  boostUpsell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8 },
  boostUpsellText: { fontSize: 12, fontFamily: fonts.bodySemi },
  urgencyOptions: { flexDirection: 'row', gap: 10 },
  urgencyOption: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5,
  },
  urgencyOptionText: { fontSize: 15, fontWeight: '700' },
  categoryTextWrap: { flex: 1, gap: 2 },
  categoryName: { fontSize: 15, fontWeight: '600', fontFamily: fonts.bodyMedium },
  categorySub: { fontSize: 12, fontFamily: fonts.body },
  form: { padding: 16, gap: 20, paddingBottom: 100 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodyMedium },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16,
    fontSize: 15, minHeight: 48, fontFamily: fonts.body,
  },
  textArea: { minHeight: 120 },
  charCount: { fontSize: 11, textAlign: 'right', fontFamily: fonts.body },
  imageRow: { flexDirection: 'row', gap: 8 },
  imageThumb: { width: 80, height: 80, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  imageThumbImg: { width: '100%', height: '100%' },
  imageRemoveBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  mainImageBadge: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingVertical: 2, alignItems: 'center',
  },
  mainImageBadgeText: { fontSize: 8, fontWeight: '600', fontFamily: fonts.bodySemi },
  addImageBtn: {
    width: 80, height: 80, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addImageText: { fontSize: 10, fontFamily: fonts.body },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, minHeight: 36,
  },
  tagText: { fontSize: 13, fontFamily: fonts.body },
  detailsToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 48,
  },
  detailsToggleText: { fontSize: 14, fontFamily: fonts.bodySemi },
  submitBtn: {
    borderRadius: 12, paddingVertical: 16, alignItems: 'center',
    justifyContent: 'center', minHeight: 48, marginTop: 8,
  },
  submitText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi },
  submitLoading: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Anonymous toggle
  anonymousRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 4, gap: 12,
  },
  anonymousInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  anonymousHint: { fontSize: 11, fontFamily: fonts.body, lineHeight: 15, marginTop: 2 },

  // Pro banner
  proBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderRadius: 12,
  },
  proBannerText: { flex: 1, fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi },

  // Success celebration overlay
  successOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  successCard: {
    borderRadius: 20, padding: 32, alignItems: 'center', gap: 12,
    width: '100%', maxWidth: 300,
  },
  successTitle: { fontSize: 18, fontWeight: '700', fontFamily: fonts.headingSemi, textAlign: 'center' },
  successSubtitle: { fontSize: 14, fontFamily: fonts.body, textAlign: 'center' },
  shareBtn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10, marginTop: 4 },
  shareBtnText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },

  // Location picker
  locationRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  locationInput: { flex: 1 },
  mapPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, borderRadius: 12, minHeight: 48,
  },
  mapPickerBtnText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi },
  coordsText: { fontSize: 11, marginTop: 2, fontFamily: fonts.body },

  // Map modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', fontFamily: fonts.headingSemi },
  modalFooter: { paddingHorizontal: 16, paddingVertical: 12 },
  confirmBtn: {
    borderRadius: 12, paddingVertical: 16, alignItems: 'center',
    justifyContent: 'center', minHeight: 48,
  },
  confirmBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi },
  coordsDisplay: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12,
  },
  coordsDisplayText: { fontSize: 13, fontWeight: '500', fontFamily: fonts.body },
  mapFallback: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32,
  },
  mapFallbackText: { fontSize: 16, fontWeight: '600', textAlign: 'center', fontFamily: fonts.headingSemi },
  mapFallbackHint: { fontSize: 13, textAlign: 'center', fontFamily: fonts.body },
  coordInputRow: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 16 },
  coordInput: {
    flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, textAlign: 'center', fontFamily: fonts.body,
  },

  // Tarjoan sub-type selector
  tarjoanTypeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, minHeight: 40,
    flex: 1, justifyContent: 'center',
  },
  tarjoanTypeText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },
})
