declare const __DEV__: boolean

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Switch, Share, Animated as RNAnimated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, ChevronRight, ChevronUp, ChevronDown, Camera, X, Check, Clock, MapPin, Users, EyeOff, Lock, Zap, Crown, CheckCircle, ImageIcon, BarChart3 } from 'lucide-react-native'
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
import { mapErrorToFinnish } from '@/lib/errorMessages'
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

const CATEGORY_PILLS: { type: PostType; label: string }[] = [
  { type: 'ilmaista', label: 'categories.ilmaista' },
  { type: 'tarvitsen', label: 'categories.tarvitsen' },
  { type: 'tarjoan', label: 'categories.tarjoan' },
  { type: 'tapahtuma', label: 'categories.tapahtuma' },
  { type: 'lainaa', label: 'categories.lainaa' },
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
  const [touchedTitle, setTouchedTitle] = useState(false)
  const [touchedDescription, setTouchedDescription] = useState(false)
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
  const lastSubmitRef = useRef<number>(0)
  const [autoTags, setAutoTags] = useState<string[]>([])
  const [hasDraft, setHasDraft] = useState(false)
  const [draftToastVisible, setDraftToastVisible] = useState(false)
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const shakeAnim = useRef(new RNAnimated.Value(0)).current

  const shakeButton = useCallback(() => {
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error) } catch {}
    RNAnimated.sequence([
      RNAnimated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      RNAnimated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start()
  }, [shakeAnim])

  const DRAFT_KEY = 'tackbird_post_draft'

  // Restore draft on mount
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return
      try {
        const draft = JSON.parse(raw)
        if (!draft || typeof draft !== 'object') return
        const hasContent = draft.title || draft.description || draft.type
        if (!hasContent) return
        if (draft.title) setTitle(draft.title)
        if (draft.description) setDescription(draft.description)
        if (draft.type) { setSelectedType(draft.type as PostType); setStep('form') }
        if (draft.location) setLocation(draft.location)
        if (draft.tags) setSelectedTags(draft.tags)
        if (draft.daily_fee) setDailyFee(draft.daily_fee)
        if (draft.service_price) setServicePrice(draft.service_price)
        if (draft.event_date) setEventDate(draft.event_date)
        setHasDraft(true)
        setDraftToastVisible(true)
        setTimeout(() => setDraftToastVisible(false), 3000)
      } catch {}
    }).catch(() => {})
  }, [])

  // Debounce-save draft on any field change
  useEffect(() => {
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    draftSaveTimerRef.current = setTimeout(() => {
      const draft = { title, description, type: selectedType, location, tags: selectedTags, daily_fee: dailyFee, service_price: servicePrice, event_date: eventDate }
      const hasContent = title || description || selectedType
      if (hasContent) {
        AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {})
        setHasDraft(true)
      }
    }, 1000)
    return () => { if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current) }
  }, [title, description, selectedType, location, selectedTags, dailyFee, servicePrice, eventDate])

  const clearDraft = useCallback(() => {
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {})
    setHasDraft(false)
    setTitle(''); setDescription(''); setLocation('')
    setDailyFee(''); setServicePrice(''); setEventDate('')
    setSelectedTags([]); setSelectedType(null); setStep('category')
  }, [])

  useEffect(() => {
    if (title.length < 5) { setAutoTags([]); return }
    const { suggestedTags: suggested } = suggestTags(title, description)
    setAutoTags(suggested)
  }, [title, description])

  useEffect(() => {
    if (params.type && Object.keys(CATEGORIES).includes(params.type)) {
      if (params.type === 'lainaa' && !FEATURES.LENDING) return
      setSelectedType(params.type as PostType)
      setStep('form')
    }
  }, [params.type])

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current)
        successTimeoutRef.current = null
      }
    }
  }, [])

  const [userNeighborhood, setUserNeighborhood] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    getCachedUserId().then(id => {
      if (!mounted) return
      setIsAuthenticated(!!id)
      setCurrentUserId(id)
      if (!id) { router.replace('/(auth)/login'); return }
      supabase.from('profiles').select('naapurusto, is_pro').eq('id', id).maybeSingle()
        .then(({ data }: any) => { if (!mounted) return; if (data?.naapurusto) setUserNeighborhood(data.naapurusto as string); if (data?.is_pro) setUserIsPro(true) }, () => {})
    }).catch(() => {})
    return () => { mounted = false }
  }, [supabase, router])

  const trust = useTrustLevel(currentUserId)
  const identity = useIdentityVerification(currentUserId)

  useEffect(() => {
    if (userNeighborhood && !location && step === 'form') {
      setLocation(userNeighborhood)
    }
  }, [userNeighborhood, step])

  useEffect(() => {
    if (selectedType === 'lainaa' || selectedType === 'tapahtuma' || selectedType === 'tarjoan') {
      setShowDetails(true)
    }
  }, [selectedType])

  useEffect(() => {
    if (selectedType && !expirationDays) {
      const suggested = suggestExpirationDays(selectedType, selectedTags)
      setExpirationDays(suggested)
    }
  }, [selectedType, selectedTags])

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
              setTitle(''); setDescription(''); setImages([]); setLocation('')
              setDailyFee(''); setServicePrice(''); setEventDate('')
              setEventStartTime(''); setEventEndTime(''); setEventMaxCapacity('')
              setSelectedTags([]); setTarjoanType('service'); setItemCondition(null)
              setExpirationDays(0); setIsAnonymous(false); setIsUrgent(false)
              setLatitude(null); setLongitude(null); setStep('category')
            },
          },
        ],
      )
    } else {
      setStep('category')
    }
  }, [hasUnsavedContent, t])

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
              setTitle(''); setDescription(''); setImages([]); setLocation('')
              setDailyFee(''); setServicePrice(''); setEventDate('')
              setEventStartTime(''); setEventEndTime(''); setEventMaxCapacity('')
              setSelectedTags([]); setTarjoanType('service'); setItemCondition(null)
              setExpirationDays(0); setIsAnonymous(false); setIsUrgent(false)
              setLatitude(null); setLongitude(null); setSelectedType(null)
              setStep('category'); router.back()
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
    if (type === 'lainaa' && !trust.permissions.canLainaa) {
      setShowTrustGate(true)
      return
    }
    // Loan listings use the dedicated 7-step wizard for richer flow
    if (type === 'lainaa' && FEATURES.LENDING) {
      router.push('/new-listing')
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
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${tempMapCoords.lat}&lon=${tempMapCoords.lng}&zoom=18&addressdetails=1`,
        { headers: { 'Accept-Language': 'fi', 'User-Agent': 'TackBirdMobile/1.0' } }
      )
      const data = await res.json()
      if (data?.display_name) {
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

  const MAX_FILE_SIZE = 10 * 1024 * 1024

  const uploadImages = async (userId: string, postId: string): Promise<string | null> => {
    if (images.length === 0) return null
    const uploadedUrls: string[] = []
    let failedCount = 0
    for (let i = 0; i < images.length; i++) {
      setUploadStatus(images.length > 1
        ? `${t('create.uploadingImages')} (${i + 1}/${images.length})`
        : t('create.uploadingImages'))
      const uri = images[i]
      const response = await fetch(uri)
      const blob = await response.blob()
      if (blob.size > MAX_FILE_SIZE) { failedCount++; continue }
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
    if (uploadedUrls.length > 1) {
      const extras = uploadedUrls.slice(1).map((url, idx) => ({
        post_id: postId, image_url: url, sort_order: idx + 1,
      }))
      const { error: imgError } = await (supabase.from('post_images') as any).insert(extras)
      if (imgError && __DEV__) console.error('[create] post_images insert failed:', imgError.message)
    }
    if (failedCount > 0 && uploadedUrls.length > 0) {
      Alert.alert(t('common.error'), t('create.imageUploadPartialFail', { count: failedCount }))
    }
    return uploadedUrls[0] ?? null
  }

  const quickContentCheck = useCallback((checkTitle: string, checkDescription: string): string | null => {
    const text = `${checkTitle} ${checkDescription}`.toLowerCase()
    if (/https?:\/\//.test(text)) return t('create.noExternalLinks')
    if (/whatsapp|telegram/.test(text)) return t('create.noExternalApps')
    if (text.length < 10) return t('create.tooShort')
    return null
  }, [t])

  const handleSubmit = useCallback(async () => {
    if (submitting) return
    const now = Date.now()
    if (now - lastSubmitRef.current < 1000) return
    lastSubmitRef.current = now
    if (!selectedType || !title.trim() || !description.trim()) {
      setTouchedTitle(true)
      setTouchedDescription(true)
      if (!title.trim()) { titleInputRef.current?.focus() }
      else if (!description.trim()) { descriptionInputRef.current?.focus() }
      setFormError(t('create.titleAndDescRequired'))
      shakeButton()
      return
    }
    setFormError(null)
    if (!await checkRateLimit('post_create')) {
      Alert.alert(t('common.error'), getRateLimitMessage('post_create', t))
      return
    }
    const contentWarning = quickContentCheck(title, description)
    if (contentWarning) { Alert.alert(t('common.error'), contentWarning); return }
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
      setFormError(t('create.dailyFeeRequired'))
      shakeButton()
      return
    }
    if (selectedType === 'lainaa' && trust.permissions.maxDailyFee !== null && !isNaN(parseFloat(dailyFee)) && parseFloat(dailyFee) > trust.permissions.maxDailyFee) {
      Alert.alert(t('common.error'), t('trust.maxDailyFeeExceeded', { max: trust.permissions.maxDailyFee }))
      return
    }
    if (selectedType === 'tarjoan' && servicePrice && !isNaN(parseFloat(servicePrice)) && parseFloat(servicePrice) < 0) {
      Alert.alert(t('common.error'), t('create.priceCannotBeNegative'))
      return
    }
    if (selectedType === 'tarjoan' && tarjoanType === 'service' && servicePrice && parseFloat(servicePrice) === 0) {
      Alert.alert(t('common.error'), t('create.priceCannotBeZero') ?? 'Hinta ei voi olla 0 €')
      return
    }
    if (selectedType === 'tarjoan' && tarjoanType === 'service' && servicePrice && !trust.permissions.canOfferPaidServices) {
      Alert.alert(t('common.error'), t('service.requiresVerification'))
      return
    }
    if (selectedType === 'tarjoan' && tarjoanType === 'service' && servicePrice && !isNaN(parseFloat(servicePrice)) && trust.permissions.maxServicePrice !== null && parseFloat(servicePrice) > trust.permissions.maxServicePrice) {
      Alert.alert(t('common.error'), t('service.maxPriceExceeded', { max: trust.permissions.maxServicePrice }))
      return
    }
    if (selectedType === 'tapahtuma' && !eventDate) {
      setFormError(t('events.titleDateRequired'))
      shakeButton()
      return
    }
    if (selectedType === 'tapahtuma' && eventDate) {
      const eventDateObj = new Date(eventDate)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (!isNaN(eventDateObj.getTime()) && eventDateObj < today) {
        Alert.alert(t('common.error'), t('create.eventDateInPast'))
        return
      }
    }
    if (selectedType === 'tapahtuma' && eventMaxCapacity) {
      const maxAtt = parseInt(eventMaxCapacity, 10)
      if (isNaN(maxAtt) || maxAtt < 1) {
        Alert.alert(t('common.error'), t('create.invalidMaxCapacity') ?? 'Invalid max capacity')
        return
      }
    }

    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    setSubmitting(true)
    let createdPostIdForCleanup: string | null = null
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { Alert.alert(t('common.error'), t('auth.loginRequired')); return }
      const expiresAt = isUrgent
        ? new Date(Date.now() + urgencyHours * 3600000).toISOString()
        : expirationDays > 0
          ? new Date(Date.now() + expirationDays * 86400000).toISOString()
          : null
      try {
        const { data: { session: modSession } } = await supabase.auth.getSession()
        const modHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
        if (modSession?.access_token) { modHeaders['Authorization'] = `Bearer ${modSession.access_token}` }
        const modRes = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/moderate-content`, {
          method: 'POST', headers: modHeaders,
          body: JSON.stringify({ title: title.trim(), description: description.trim(), user_id: user.id }),
        })
        if (modRes.ok) {
          const modResult = await modRes.json()
          if (modResult.action === 'block') {
            Alert.alert(t('common.error'), t('create.contentBlocked') || 'Content blocked by moderation')
            setSubmitting(false); setUploadStatus(''); return
          }
        }
      } catch {}
      setUploadStatus(t('create.publishing'))
      const { data: creatorProfile } = await supabase.from('profiles').select('is_pro').eq('id', user.id).maybeSingle()
      const finalTags = [...selectedTags]
      if (selectedType === 'tarjoan') {
        finalTags.push(tarjoanType === 'item' ? 'tarjoan_item' : 'tarjoan_service')
        if (tarjoanType === 'item' && itemCondition) { finalTags.push(itemCondition) }
      }
      const { data: post, error } = await (supabase.from('posts') as any).insert({
        user_id: user.id, type: selectedType, title: title.trim(), description: description.trim(),
        location: location.trim() || null, latitude: latitude ?? null, longitude: longitude ?? null,
        daily_fee: selectedType === 'lainaa' && dailyFee && !isNaN(parseFloat(dailyFee)) ? parseFloat(dailyFee) : null,
        service_price: selectedType === 'tarjoan' && servicePrice && !isNaN(parseFloat(servicePrice)) ? parseFloat(servicePrice) : null,
        event_date: selectedType === 'tapahtuma' && eventDate ? new Date(eventDate).toISOString() : null,
        expires_at: expiresAt, is_urgent: isUrgent || false, urgency_hours: isUrgent ? urgencyHours : null,
        is_anonymous: isAnonymous || false, is_active: images.length > 0 ? false : true,
        tags: finalTags, is_pro_listing: !!(creatorProfile as any)?.is_pro,
      }).select('id').single()
      if (error) throw error
      createdPostIdForCleanup = post?.id ?? null
      if (images.length > 0 && post?.id) {
        const mainImageUrl = await uploadImages(user.id, post.id)
        if (mainImageUrl) {
          const { error: imgUrlError } = await (supabase.from('posts') as any).update({ image_url: mainImageUrl }).eq('id', post.id)
          if (imgUrlError && __DEV__) console.error('[create] image_url update failed:', imgUrlError.message)
        } else {
          const userChoice = await new Promise<'publish' | 'retry'>(resolve => {
            Alert.alert(t('common.error'), t('create.allImagesFailed'), [
              { text: t('create.retryUpload'), style: 'cancel', onPress: () => resolve('retry') },
              { text: t('create.publishWithoutImages'), onPress: () => resolve('publish') },
            ], { cancelable: false })
          })
          if (userChoice === 'retry') {
            if (post?.id) {
              const { error: deleteError } = await (supabase.from('posts') as any).delete().eq('id', post.id)
              if (deleteError) {
                if (__DEV__) console.error('[create] rollback delete failed:', deleteError.message)
                Alert.alert(t('common.error'), t('create.rollbackFailed') ?? 'Failed to clean up — please delete the draft from your profile')
              }
            }
            setSubmitting(false); setUploadStatus(''); return
          }
        }
        if (post?.id) {
        const { error: activateError } = await (supabase.from('posts') as any).update({ is_active: true }).eq('id', post.id)
        if (activateError) throw new Error(`Post activation failed: ${activateError.message}`)
      }
      }
      if (selectedType === 'tapahtuma' && post?.id) {
        let eventDateISO = new Date(eventDate).toISOString()
        if (eventStartTime && /^\d{1,2}:\d{2}$/.test(eventStartTime)) {
          const [h, m] = eventStartTime.split(':').map(Number)
          if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            const d = new Date(eventDate); d.setHours(h, m, 0, 0); eventDateISO = d.toISOString()
          }
        }
        let eventEndISO: string | null = null
        if (eventEndTime && /^\d{1,2}:\d{2}$/.test(eventEndTime)) {
          const [h, m] = eventEndTime.split(':').map(Number)
          if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            const d = new Date(eventDate); d.setHours(h, m, 0, 0); eventEndISO = d.toISOString()
          }
        }
        const maxAtt = eventMaxCapacity ? parseInt(eventMaxCapacity, 10) : null
        const { error: eventError } = await (supabase.from('events') as any).insert({
          post_id: post.id, creator_id: user.id, title: title.trim(), description: description.trim(),
          event_date: eventDateISO, event_end_date: eventEndISO,
          location_name: location.trim() || null, location_lat: latitude ?? null, location_lng: longitude ?? null,
          max_attendees: (maxAtt && maxAtt > 0) ? maxAtt : null, icon: 'CalendarDays',
        })
        if (eventError) {
          if (__DEV__) console.error('[create] event insert failed:', eventError.message)
          try { await (supabase.from('posts') as any).delete().eq('id', post.id) } catch {}
          Alert.alert(t('common.error'), t('create.eventCreateFailed') ?? 'Event creation failed')
          setSubmitting(false); return
        }
      }
      if (post?.id) {
        const { data: { session: authSession } } = await supabase.auth.getSession()
        const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
        if (authSession?.access_token) { authHeaders['Authorization'] = `Bearer ${authSession.access_token}` }
        fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/embed-post`, {
          method: 'POST', headers: authHeaders, body: JSON.stringify({ post_id: post.id }),
        }).catch((err) => { if (__DEV__) console.warn('[create] embed-post failed:', err) })
      }
      if (isUrgent && post?.id) {
        const URGENT_COOLDOWN_KEY = 'tackbird_last_urgent'
        const URGENT_COOLDOWN_MS = 30 * 60 * 1000
        const lastUrgent = await AsyncStorage.getItem(URGENT_COOLDOWN_KEY)
        if (lastUrgent && Date.now() - parseInt(lastUrgent, 10) < URGENT_COOLDOWN_MS) {
          // Skip push broadcast
        } else {
          triggerPush({ user_id: user.id, title: title.trim(), body: description.trim().slice(0, 100), type: 'urgent_help', post_id: post.id })
          await AsyncStorage.setItem(URGENT_COOLDOWN_KEY, String(Date.now()))
        }
      }
      trackEvent('post_created', { type: selectedType, has_price: !!servicePrice })
      const createdPostId = post.id
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {})
      setHasDraft(false)
      setTitle(''); setDescription(''); setImages([]); setLocation('')
      setDailyFee(''); setServicePrice(''); setEventDate('')
      setEventStartTime(''); setEventEndTime(''); setEventMaxCapacity('')
      setSelectedTags([]); setTarjoanType('service'); setItemCondition(null)
      setExpirationDays(0); setIsAnonymous(false); setIsUrgent(false)
      setLatitude(null); setLongitude(null); setStep('category')
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
      setSuccessPostId(createdPostId); setSuccessNeighborhood(userNeighborhood); setShowSuccess(true)
      maybeRequestReview('post_created').catch(() => {})
      successTimeoutRef.current = setTimeout(() => {
        successTimeoutRef.current = null; setShowSuccess(false); router.replace(`/post/${createdPostId}`)
      }, 2000)
    } catch (err: any) {
      if (__DEV__) console.log('[create] error:', JSON.stringify(err))
      if (createdPostIdForCleanup) {
        try { await (supabase.from('posts') as any).delete().eq('id', createdPostIdForCleanup) } catch {}
      }
      Alert.alert(t('common.error'), mapErrorToFinnish(err, t))
    } finally {
      setSubmitting(false); setUploadStatus('')
    }
  }, [submitting, selectedType, title, description, location, latitude, longitude, dailyFee, servicePrice, eventDate, eventStartTime, eventEndTime, eventMaxCapacity, selectedTags, tarjoanType, itemCondition, expirationDays, isUrgent, urgencyHours, isAnonymous, images, supabase, router, t, quickContentCheck, trust, userNeighborhood, uploadImages])

  const cat = selectedType ? CATEGORIES[selectedType] : null
  const availableTags = selectedType === 'tarjoan'
    ? (tarjoanType === 'item' ? TARJOAN_ITEM_TAGS : TARJOAN_SERVICE_TAGS)
    : selectedType ? (POST_TAGS[selectedType] ?? []) : []

  // ════════════════════════════════════════════════════════════════════════
  // RENDER — Helsinki Monochrome mockup 07
  // ════════════════════════════════════════════════════════════════════════
  return (
    <ScreenErrorBoundary screenName="Create">
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[mk.container, { backgroundColor: colors.background }]}>

        {/* ── Header: close circle + centered title + draft text ── */}
        <View style={[mk.header, { paddingTop: insets.top + 12 }]}>
          <Pressable
            onPress={step === 'form' ? handleBackToCategory : handleClose}
            hitSlop={12}
            style={({ pressed }) => [mk.headerCloseBtn, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <X size={14} color={colors.foreground} strokeWidth={2.5} />
          </Pressable>
          <Text style={[mk.headerTitle, { color: colors.foreground }]}>
            {step === 'category' ? t('create.selectCategory') : (t('create.newPost') ?? 'New post')}
          </Text>
          <Text style={[mk.headerDraft, { color: colors.mutedForeground }]}>
            {step === 'form' && hasUnsavedContent ? (t('create.draft') ?? 'Luonnos') : ' '}
          </Text>
        </View>

        {/* ── Step indicator dots ── */}
        <View style={mk.stepRow}>
          <View style={[mk.stepDot, { backgroundColor: colors.foreground }]} />
          <View style={[mk.stepDot, { backgroundColor: step === 'form' ? colors.foreground : colors.border }]} />
          <Text style={[mk.stepLabel, { color: colors.mutedForeground }]}>
            {step === 'category' ? t('create.stepType') : t('create.stepDetails')}
          </Text>
        </View>

        {/* ── Draft restored toast ── */}
        {draftToastVisible && (
          <View style={[mk.draftToast, { backgroundColor: colors.foreground }]} pointerEvents="none">
            <Text style={[mk.draftToastText, { color: colors.background }]}>{t('create.draftRestored') ?? 'Luonnos palautettu'}</Text>
          </View>
        )}

        {/* ── CATEGORY STEP ── */}
        {step === 'category' && (
          <ScrollView contentContainerStyle={mk.scrollPad} showsVerticalScrollIndicator={false}>
            <View style={mk.pillSection}>
              <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>
                {(t('create.iWant') ?? 'MINA...').toUpperCase()}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={mk.pillsRow}>
                {CATEGORY_PILLS.filter(({ type }) => !(type === 'lainaa' && !FEATURES.LENDING)).map(({ type, label }) => {
                  const active = selectedType === type
                  const locked = type === 'lainaa' && !trust.permissions.canLainaa
                  return (
                    <Pressable
                      key={type}
                      onPress={() => handleCategorySelect(type)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t(label)}${locked ? `, ${t('trust.requiresTier2Short')}` : ''}`}
                      accessibilityState={{ disabled: locked }}
                      style={({ pressed }) => [
                        mk.pill,
                        active ? { backgroundColor: colors.foreground } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                        locked && { opacity: 0.5 },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      {locked && <Lock size={12} color={active ? colors.background : colors.foreground} />}
                      <Text style={[mk.pillText, { color: active ? colors.background : colors.foreground, fontWeight: active ? '600' : '500' }]}>{t(label)}</Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </View>

            <View style={mk.categoryGrid}>
              {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][])
                .filter(([type]) => !(type === 'lainaa' && !FEATURES.LENDING))
                .map(([type, c]) => {
                  const Icon = CATEGORY_ICON_MAP[c.icon]
                  const locked = type === 'lainaa' && !trust.permissions.canLainaa
                  const full = type === 'tapahtuma'
                  return (
                    <Pressable
                      key={type}
                      onPress={() => handleCategorySelect(type)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t(c.label)}${locked ? `, ${t('trust.requiresTier2Short')}` : ''}`}
                      accessibilityState={{ disabled: locked }}
                      style={({ pressed }) => [
                        mk.catCard, full && mk.catCardFull,
                        { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
                        pressed && { backgroundColor: colors.muted }, locked && { opacity: 0.5 },
                      ]}
                    >
                      <View style={mk.catCardInner} importantForAccessibility="no-hide-descendants">
                        <View style={mk.catIcon}>
                          {Icon && <Icon size={32} color={c.color} strokeWidth={1.8} />}
                          {locked && <View style={mk.lockBadge}><Lock size={14} color={colors.foreground} /></View>}
                        </View>
                        <Text style={[mk.catName, { color: colors.foreground }]}>{t(c.label)}</Text>
                        <Text style={[mk.catSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {locked ? t('trust.requiresTier2Short') : t(c.subtitle)}
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}

              {/* Poll card */}
              {FEATURES.POLLS && (
                <Pressable
                  onPress={() => router.push('/create-poll')}
                  accessibilityRole="button"
                  accessibilityLabel={t('polls.newPoll')}
                  style={({ pressed }) => [
                    mk.catCard,
                    { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
                    pressed && { backgroundColor: colors.muted },
                  ]}
                >
                  <View style={mk.catCardInner} importantForAccessibility="no-hide-descendants">
                    <View style={mk.catIcon}>
                      <BarChart3 size={32} color={colors.foreground} strokeWidth={1.8} />
                    </View>
                    <Text style={[mk.catName, { color: colors.foreground }]}>{t('polls.newPoll')}</Text>
                    <Text style={[mk.catSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {t('polls.communityPoll')}
                    </Text>
                  </View>
                </Pressable>
              )}
            </View>
          </ScrollView>
        )}

        {/* ── FORM STEP ── */}
        {step === 'form' && (
          <>
            <ScrollView contentContainerStyle={mk.scrollPad} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

              {/* Category pills at top of form */}
              <View style={mk.pillSection}>
                <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>
                  {(t('create.iWant') ?? 'MINA...').toUpperCase()}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={mk.pillsRow}>
                  {CATEGORY_PILLS.filter(({ type }) => !(type === 'lainaa' && !FEATURES.LENDING)).map(({ type, label }) => {
                    const active = selectedType === type
                    const locked = type === 'lainaa' && !trust.permissions.canLainaa
                    return (
                      <Pressable
                        key={type}
                        onPress={() => {
                          if (locked) { setShowTrustGate(true); return }
                          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
                          setSelectedType(type); setSelectedTags([]); setTarjoanType('service'); setItemCondition(null)
                        }}
                        style={({ pressed }) => [
                          mk.pill,
                          active ? { backgroundColor: colors.foreground } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                          locked && { opacity: 0.5 }, pressed && { opacity: 0.7 },
                        ]}
                      >
                        {locked && <Lock size={12} color={active ? colors.background : colors.foreground} />}
                        <Text style={[mk.pillText, { color: active ? colors.background : colors.foreground, fontWeight: active ? '600' : '500' }]}>{t(label)}</Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>

              {/* Pro upsell */}
              {FEATURES.PRO_SUBSCRIPTION && !userIsPro && (
                <Pressable onPress={() => router.push('/pro')} style={({ pressed }) => [mk.proBanner, { backgroundColor: `${colors.foreground}12` }, pressed && { opacity: 0.7 }]}>
                  <Crown size={16} color={colors.foreground} />
                  <Text style={[mk.proBannerText, { color: colors.foreground }]}>{t('pro.createBanner')}</Text>
                  <ChevronRight size={14} color={colors.foreground} />
                </Pressable>
              )}

              {/* Photo uploader — dashed area or thumbnails */}
              <View style={mk.photoWrap}>
                {images.length === 0 ? (
                  <Pressable
                    onPress={pickImage}
                    style={({ pressed }) => [mk.photoDashed, { borderColor: colors.border, backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}
                  >
                    <View style={[mk.photoCircle, { backgroundColor: colors.background }]}>
                      <ImageIcon size={18} color={colors.foreground} strokeWidth={2} />
                    </View>
                    <Text style={[mk.photoMainText, { color: colors.foreground }]}>{t('create.addImage')}</Text>
                    <Text style={[mk.photoSubText, { color: colors.mutedForeground }]}>{t('create.mainImageHint') ?? 'Ensimmäinen kuva näkyy feedissä'}</Text>
                  </Pressable>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={mk.imgRow}>
                    {images.map((uri, idx) => (
                      <View key={uri} style={[mk.imgThumb, { borderColor: colors.border }]}>
                        <Image source={{ uri }} style={mk.imgThumbImg} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={`${t('create.image')} ${idx + 1}`} />
                        <PressableOpacity onPress={() => removeImage(idx)} style={mk.imgRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.remove') ?? 'Remove'}>
                          <X size={12} color="#fff" />
                        </PressableOpacity>
                        {idx === 0 && (
                          <View style={[mk.imgMainBadge, { backgroundColor: colors.foreground }]}>
                            <Text style={[mk.imgMainBadgeText, { color: colors.background }]}>{t('create.mainImage')}</Text>
                          </View>
                        )}
                      </View>
                    ))}
                    {images.length < 5 && (
                      <Pressable onPress={pickImage} style={({ pressed }) => [mk.imgAddMore, { borderColor: colors.border, backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}>
                        <Camera size={20} color={colors.mutedForeground} />
                        <Text style={[mk.imgAddMoreText, { color: colors.mutedForeground }]}>{images.length}/5</Text>
                      </Pressable>
                    )}
                  </ScrollView>
                )}
              </View>

              {/* Tarjoan sub-type */}
              {selectedType === 'tarjoan' && (
                <View style={mk.fieldWrap}>
                  <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>{t('create.tarjoanTypeHint')}</Text>
                  <View style={mk.tagGrid}>
                    <PressableOpacity
                      onPress={() => { setTarjoanType('service'); setSelectedTags([]); setItemCondition(null); setServicePrice('') }}
                      style={[mk.tarjoanChip, tarjoanType === 'service' ? { backgroundColor: colors.foreground } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                    >
                      {tarjoanType === 'service' && <Check size={14} color={colors.background} />}
                      <Text style={[mk.tarjoanChipText, { color: tarjoanType === 'service' ? colors.background : colors.foreground }]}>{t('create.tarjoanService')}</Text>
                    </PressableOpacity>
                    <PressableOpacity
                      onPress={() => { setTarjoanType('item'); setSelectedTags([]); setServicePrice('') }}
                      style={[mk.tarjoanChip, tarjoanType === 'item' ? { backgroundColor: colors.foreground } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                    >
                      {tarjoanType === 'item' && <Check size={14} color={colors.background} />}
                      <Text style={[mk.tarjoanChipText, { color: tarjoanType === 'item' ? colors.background : colors.foreground }]}>{t('create.tarjoanItem')}</Text>
                    </PressableOpacity>
                  </View>
                </View>
              )}

              {/* Title */}
              <View style={mk.fieldWrap}>
                <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>{t('post.titleLabel')} *</Text>
                <TextInput
                  ref={titleInputRef}
                  style={[mk.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }, touchedTitle && !title.trim() && { borderColor: colors.destructive, borderWidth: 1.5 }]}
                  value={title} onChangeText={setTitle} onBlur={() => setTouchedTitle(true)}
                  placeholder={t('create.titlePlaceholder')} placeholderTextColor={colors.mutedForeground}
                  maxLength={100} returnKeyType="next" autoCapitalize="sentences" accessibilityLabel={t('post.titleLabel')}
                />
                {touchedTitle && !title.trim() && (
                  <Text style={{ fontSize: 12, color: colors.destructive, fontFamily: fonts.body, paddingTop: 4 }} accessibilityRole="alert">{t('create.titleRequired')}</Text>
                )}
                <Text style={[mk.charCount, { color: title.length >= 90 ? colors.destructive : title.length >= 70 ? colors.foreground : colors.mutedForeground }]}>{title.length}/100</Text>
              </View>

              {/* Description */}
              <View style={mk.fieldWrap}>
                <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>{t('post.descriptionLabel')} *</Text>
                <TextInput
                  ref={descriptionInputRef}
                  style={[mk.textarea, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }, touchedDescription && !description.trim() && { borderColor: colors.destructive, borderWidth: 1.5 }]}
                  value={description} onChangeText={setDescription} onBlur={() => setTouchedDescription(true)}
                  placeholder={t('create.descriptionPlaceholder')} placeholderTextColor={colors.mutedForeground}
                  multiline numberOfLines={4} textAlignVertical="top" accessibilityLabel={t('post.descriptionLabel')}
                  maxLength={2000} inputAccessoryViewID={KEYBOARD_DONE_ID}
                />
                {touchedDescription && !description.trim() && (
                  <Text style={{ fontSize: 12, color: colors.destructive, fontFamily: fonts.body, paddingTop: 4 }} accessibilityRole="alert">{t('create.description')} *</Text>
                )}
                <Text style={[mk.charCount, { color: description.length >= 1900 ? colors.destructive : description.length >= 1500 ? colors.foreground : colors.mutedForeground }]}>{description.length}/2000</Text>
              </View>

              {/* 2-column: Sijainti + Ajankohta */}
              <View style={mk.twoCol}>
                <View style={mk.twoColItem}>
                  <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>{t('post.locationLabel')}</Text>
                  <LocationAutocomplete
                    value={location}
                    onChangeText={(text) => { setLocation(text); if (!text.trim()) { setLatitude(null); setLongitude(null) } }}
                    onSelect={({ name, lat, lng }) => { setLocation(name); setLatitude(lat); setLongitude(lng) }}
                    placeholder={t('post.locationLabel')}
                    style={mk.twoColInputWrap}
                  />
                </View>
                <View style={mk.twoColItem}>
                  <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>
                    {selectedType === 'tapahtuma' ? `${t('post.eventDate')} *` : (t('create.timing') ?? 'AJANKOHTA')}
                  </Text>
                  <TextInput
                    style={[mk.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
                    value={selectedType === 'tapahtuma' ? eventDate : ''}
                    onChangeText={selectedType === 'tapahtuma' ? setEventDate : undefined}
                    placeholder={selectedType === 'tapahtuma'
                      ? (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()
                      : (t('create.timingPlaceholder') ?? 'Esim. pe 24.10')}
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
              </View>

              {latitude !== null && longitude !== null && (
                <Text style={[mk.coordsSmall, { color: colors.mutedForeground }]}>{latitude.toFixed(5)}, {longitude.toFixed(5)}</Text>
              )}

              <PressableOpacity onPress={handleOpenMapPicker} style={[mk.mapRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <MapPin size={16} color={colors.foreground} />
                <Text style={[mk.mapRowText, { color: colors.foreground }]}>{t('locationPicker.pickFromMap')}</Text>
              </PressableOpacity>

              {/* Details toggle */}
              <PressableOpacity onPress={() => setShowDetails(p => !p)} style={[mk.detailsToggle, { borderColor: colors.border }]}>
                <Text style={[mk.detailsToggleText, { color: colors.foreground }]}>
                  {showDetails ? t('create.hideDetails') : t('create.showDetails')}
                </Text>
                {showDetails ? <ChevronUp size={16} color={colors.foreground} /> : <ChevronDown size={16} color={colors.foreground} />}
              </PressableOpacity>

              {showDetails && (
                <>
                  {selectedType === 'lainaa' && (
                    <View style={mk.fieldWrap}>
                      <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>{t('rental.dailyFee')} *</Text>
                      <TextInput style={[mk.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]} value={dailyFee} onChangeText={setDailyFee} placeholder="0.00 €" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                    </View>
                  )}

                  {selectedType === 'tarjoan' && tarjoanType === 'service' && (
                    <View style={mk.fieldWrap}>
                      <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>{t('service.price')}</Text>
                      <TextInput style={[mk.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]} value={servicePrice} onChangeText={setServicePrice} placeholder={t('service.pricePlaceholder')} placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                      <Text style={[mk.charCount, { color: colors.mutedForeground }]}>{t('service.priceHint')}</Text>
                      {!trust.permissions.canOfferPaidServices && servicePrice ? (
                        <Text style={[mk.charCount, { color: colors.destructive }]}>{t('service.requiresVerification')}</Text>
                      ) : trust.permissions.maxServicePrice !== null && servicePrice && parseFloat(servicePrice) > trust.permissions.maxServicePrice ? (
                        <Text style={[mk.charCount, { color: colors.destructive }]}>{t('service.maxPriceExceeded', { max: trust.permissions.maxServicePrice })}</Text>
                      ) : null}
                    </View>
                  )}

                  {selectedType === 'tarjoan' && tarjoanType === 'item' && (
                    <View style={mk.fieldWrap}>
                      <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>{t('create.itemPrice')}</Text>
                      <TextInput style={[mk.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]} value={servicePrice} onChangeText={setServicePrice} placeholder="0.00 €" placeholderTextColor={colors.mutedForeground} keyboardType="decimal-pad" />
                      <Text style={[mk.charCount, { color: colors.mutedForeground }]}>{t('create.itemPriceHint')}</Text>
                    </View>
                  )}

                  {selectedType === 'tarjoan' && tarjoanType === 'item' && (
                    <View style={mk.fieldWrap}>
                      <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>{t('create.condition')}</Text>
                      <View style={mk.tagGrid}>
                        {CONDITION_OPTIONS.map((opt) => {
                          const sel = itemCondition === opt.id
                          return (
                            <PressableOpacity key={opt.id} onPress={() => setItemCondition(sel ? null : opt.id)}
                              style={[mk.tagChip, sel ? { backgroundColor: colors.foreground } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
                              {sel && <Check size={12} color={colors.background} />}
                              <Text style={[mk.tagText, { color: sel ? colors.background : colors.foreground }]}>{t(opt.label)}</Text>
                            </PressableOpacity>
                          )
                        })}
                      </View>
                    </View>
                  )}

                  {selectedType === 'tapahtuma' && (
                    <>
                      <View style={mk.fieldWrap}>
                        <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>{t('create.eventStartTime')}</Text>
                        <TextInput style={[mk.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]} value={eventStartTime} onChangeText={setEventStartTime} placeholder={t('create.eventStartTimePlaceholder')} placeholderTextColor={colors.mutedForeground} keyboardType="numbers-and-punctuation" maxLength={5} />
                      </View>
                      <View style={mk.fieldWrap}>
                        <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>{t('create.eventEndTime')}</Text>
                        <TextInput style={[mk.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]} value={eventEndTime} onChangeText={setEventEndTime} placeholder={t('create.eventEndTimePlaceholder')} placeholderTextColor={colors.mutedForeground} keyboardType="numbers-and-punctuation" maxLength={5} />
                      </View>
                      <View style={mk.fieldWrap}>
                        <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>{t('create.eventMaxCapacity')}</Text>
                        <TextInput style={[mk.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]} value={eventMaxCapacity} onChangeText={setEventMaxCapacity} placeholder={t('create.eventMaxCapacityPlaceholder')} placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" />
                      </View>
                    </>
                  )}

                  {availableTags.length > 0 && (
                    <View style={mk.fieldWrap}>
                      <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>{t('create.tags')} ({selectedTags.length}/3)</Text>
                      <View style={mk.tagGrid}>
                        {availableTags.map((tag) => {
                          const sel = selectedTags.includes(tag.id)
                          return (
                            <PressableOpacity key={tag.id} onPress={() => toggleTag(tag.id)}
                              accessibilityRole="checkbox" accessibilityLabel={t(tag.label)} accessibilityState={{ checked: sel }}
                              style={[mk.tagChip, sel ? { backgroundColor: colors.foreground } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
                              {sel && <Check size={12} color={colors.background} />}
                              <Text style={[mk.tagText, { color: sel ? colors.background : colors.foreground }]}>{t(tag.label)}</Text>
                            </PressableOpacity>
                          )
                        })}
                      </View>
                      {autoTags.length > 0 && selectedTags.length === 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 }}>
                          <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: fonts.body, width: '100%' }}>{t('create.suggestedTags') ?? 'Ehdotetut:'}</Text>
                          {autoTags.map(tag => (
                            <PressableOpacity key={tag} onPress={() => setSelectedTags(prev => prev.includes(tag) ? prev : [...prev, tag])}
                              accessibilityRole="button" accessibilityLabel={`${t('create.addTag') ?? 'Lisää'} ${t(`tags.${tag}`) ?? tag}`}
                              style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: `${colors.foreground}15` }}>
                              <Text style={{ fontSize: 12, color: colors.foreground, fontFamily: fonts.body }}>+ {t(`tags.${tag}`) ?? tag}</Text>
                            </PressableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}

                  <View style={mk.fieldWrap}>
                    <Text style={[mk.sectionLabel, { color: colors.mutedForeground }]}>{t('create.expiration')}</Text>
                    <View style={mk.tagGrid}>
                      {EXPIRATION_OPTIONS.map((opt) => {
                        const sel = expirationDays === opt.days
                        return (
                          <PressableOpacity key={opt.days} onPress={() => setExpirationDays(opt.days)}
                            style={[mk.tagChip, sel ? { backgroundColor: colors.foreground } : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
                            <Text style={[mk.tagText, { color: sel ? colors.background : colors.foreground }]}>
                              {opt.days === 0 ? t('create.noExpiration') : `${opt.days} ${t('common.daysShort')}`}
                            </Text>
                          </PressableOpacity>
                        )
                      })}
                    </View>
                  </View>

                  <View style={[mk.toggleRow, { borderColor: colors.border }]}>
                    <View style={mk.toggleInfo}>
                      <EyeOff size={16} color={colors.mutedForeground} />
                      <View style={{ flex: 1 }}>
                        <Text style={[mk.toggleLabel, { color: colors.foreground }]}>{t('create.anonymous')}</Text>
                        <Text style={[mk.toggleHint, { color: colors.mutedForeground }]}>{t('create.anonymousHint')}</Text>
                      </View>
                    </View>
                    <Switch value={isAnonymous} onValueChange={setIsAnonymous} trackColor={{ false: colors.muted, true: colors.foreground }} thumbColor={colors.background} accessibilityLabel={t('create.anonymous')} />
                  </View>

                  {selectedType !== 'tapahtuma' && (
                    <View style={mk.urgencyWrap}>
                      <View style={[mk.toggleRow, { borderColor: isUrgent ? colors.destructive : colors.border }]}>
                        <View style={mk.toggleInfo}>
                          <Zap size={16} color={isUrgent ? colors.destructive : colors.mutedForeground} fill={isUrgent ? colors.destructive : 'transparent'} />
                          <View style={{ flex: 1 }}>
                            <Text style={[mk.toggleLabel, { color: colors.foreground }]}>{t('urgency.toggle')}</Text>
                            <Text style={[mk.toggleHint, { color: colors.mutedForeground }]}>{t('urgency.toggleHint')}</Text>
                          </View>
                        </View>
                        <Switch value={isUrgent} onValueChange={setIsUrgent} trackColor={{ false: colors.muted, true: colors.destructive }} thumbColor={colors.background} accessibilityLabel={t('urgency.toggle')} />
                      </View>
                      {isUrgent && (
                        <View style={mk.urgencyOpts}>
                          {[2, 4, 8].map((h) => (
                            <PressableOpacity key={h} onPress={() => setUrgencyHours(h)}
                              style={[mk.urgencyOpt, { borderColor: urgencyHours === h ? colors.destructive : colors.border }, urgencyHours === h && { backgroundColor: `${colors.destructive}15` }]}>
                              <Text style={[mk.urgencyOptText, { color: urgencyHours === h ? colors.destructive : colors.foreground }]}>{h}h</Text>
                            </PressableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}

              {/* Clear draft button */}
              {hasDraft && (
                <PressableOpacity
                  onPress={clearDraft}
                  style={[mk.clearDraftBtn, { borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('create.clearDraft') ?? 'Tyhjennä luonnos'}
                >
                  <Text style={[mk.clearDraftText, { color: colors.mutedForeground }]}>{t('create.clearDraft') ?? 'Tyhjennä luonnos'}</Text>
                </PressableOpacity>
              )}

              <View style={{ height: 90 }} />
            </ScrollView>

            {/* Sticky publish */}
            <View style={[mk.stickyWrap, { bottom: Math.max(insets.bottom, 22) }]}>
              {formError && (
                <Text style={[mk.formError, { color: colors.destructive, backgroundColor: `${colors.destructive}10` }]} accessibilityRole="alert">{formError}</Text>
              )}
              <RNAnimated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                <PressableOpacity onPress={handleSubmit} disabled={submitting}
                  style={[mk.publishBtn, { backgroundColor: colors.foreground, opacity: submitting ? 0.6 : 1 }]}
                  accessibilityRole="button" accessibilityLabel={t('create.publish')} accessibilityState={{ disabled: submitting }}>
                  {submitting ? (
                    <View style={mk.publishLoading}>
                      <ActivityIndicator size="small" color={colors.background} />
                      <Text style={[mk.publishText, { color: colors.background }]}>{uploadStatus || t('create.publishing')}</Text>
                    </View>
                  ) : (
                    <Text style={[mk.publishText, { color: colors.background }]}>{t('create.publish')}</Text>
                  )}
                </PressableOpacity>
              </RNAnimated.View>
            </View>
          </>
        )}

        {/* ── Modals ── */}
        <Modal visible={showSuccess} transparent animationType="fade"
          onRequestClose={() => { if (successTimeoutRef.current) { clearTimeout(successTimeoutRef.current); successTimeoutRef.current = null }; setShowSuccess(false); setSuccessPostId(null); setSuccessNeighborhood(null) }}>
          <Pressable style={mk.successOverlay} onPress={() => { if (successTimeoutRef.current) { clearTimeout(successTimeoutRef.current); successTimeoutRef.current = null }; setShowSuccess(false); setSuccessPostId(null); setSuccessNeighborhood(null) }}>
            <Pressable style={[mk.successCard, { backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
              <View style={[mk.successIcon, { backgroundColor: colors.foreground }]}><CheckCircle size={32} color={colors.background} /></View>
              <Text style={[mk.successTitle, { color: colors.foreground }]}>{t('create.published')}</Text>
              {successNeighborhood && <Text style={[mk.successSub, { color: colors.mutedForeground }]}>{t('create.visibleTo', { neighborhood: successNeighborhood })}</Text>}
              <PressableOpacity onPress={async () => {
                if (successTimeoutRef.current) { clearTimeout(successTimeoutRef.current); successTimeoutRef.current = null }
                if (successPostId) {
                  try { await Share.share({ message: `${t('create.published')} https://tackbird.com/post/${successPostId}` }) } catch (_) {}
                  setShowSuccess(false); router.replace(`/post/${successPostId}`)
                }
              }} style={[mk.shareBtn, { backgroundColor: colors.foreground }]}>
                <Text style={[mk.shareBtnText, { color: colors.background }]}>{t('create.share')}</Text>
              </PressableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={mapModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMapModalVisible(false)}>
          <View style={[mk.modalContainer, { backgroundColor: colors.background }]}>
            <View style={[mk.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[mk.modalTitle, { color: colors.foreground }]}>{t('locationPicker.title')}</Text>
              <PressableOpacity onPress={() => setMapModalVisible(false)} hitSlop={12}><X size={24} color={colors.foreground} /></PressableOpacity>
            </View>
            {Platform.OS === 'web' ? (
              <LeafletMapPicker coords={tempMapCoords} onCoordsChange={setTempMapCoords} colors={colors} />
            ) : (
              <View style={mk.mapFallback}>
                <MapPin size={40} color={colors.mutedForeground} />
                <Text style={[mk.mapFallbackText, { color: colors.mutedForeground }]}>{t('locationPicker.tapToSelect')}</Text>
                <Text style={[mk.mapFallbackHint, { color: colors.mutedForeground }]}>{t('locationPicker.nativeHint')}</Text>
                <View style={mk.coordInputRow}>
                  <TextInput style={[mk.coordInput, { backgroundColor: colors.muted, color: colors.foreground }]} placeholder="Lat (60.17)" placeholderTextColor={colors.mutedForeground} accessibilityLabel={t('locationPicker.latitude') ?? 'Latitude'} keyboardType="decimal-pad" value={tempMapCoords?.lat?.toString() ?? ''} onChangeText={(text) => { const lat = parseFloat(text); if (!isNaN(lat)) setTempMapCoords(prev => ({ lat, lng: prev?.lng ?? 24.94 })) }} />
                  <TextInput style={[mk.coordInput, { backgroundColor: colors.muted, color: colors.foreground }]} placeholder="Lng (24.94)" placeholderTextColor={colors.mutedForeground} accessibilityLabel={t('locationPicker.longitude') ?? 'Longitude'} keyboardType="decimal-pad" value={tempMapCoords?.lng?.toString() ?? ''} onChangeText={(text) => { const lng = parseFloat(text); if (!isNaN(lng)) setTempMapCoords(prev => ({ lat: prev?.lat ?? 60.17, lng })) }} />
                </View>
              </View>
            )}
            {tempMapCoords && (
              <View style={[mk.coordsDisplay, { backgroundColor: colors.card }]}>
                <MapPin size={16} color={colors.foreground} />
                <Text style={[mk.coordsDisplayText, { color: colors.foreground }]}>{tempMapCoords.lat.toFixed(5)}, {tempMapCoords.lng.toFixed(5)}</Text>
              </View>
            )}
            <View style={mk.modalFooter}>
              <PressableOpacity onPress={handleConfirmMapLocation} disabled={!tempMapCoords} style={[mk.confirmBtn, { backgroundColor: tempMapCoords ? colors.foreground : colors.muted }]}>
                <Text style={[mk.confirmBtnText, { color: tempMapCoords ? colors.background : colors.mutedForeground }]}>{t('locationPicker.confirm')}</Text>
              </PressableOpacity>
            </View>
          </View>
        </Modal>

        <TrustGateModal visible={showTrustGate} onClose={() => setShowTrustGate(false)} requiredLevel={2} currentLevel={trust.level} featureName={t('categories.lainaa')} onVerifyPress={identity.startVerification} />
        {FEATURES.IDENTITY_VERIFICATION && (
          <VerificationModal visible={identity.showModal} onClose={() => identity.setShowModal(false)} onConfirm={identity.confirmVerification} loading={identity.loading} error={identity.error} isSuccess={identity.status === 'success'} />
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
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'; link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    const loadLeaflet = () => new Promise<void>((resolve) => {
      if ((window as any).L) { resolve(); return }
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      script.onload = () => resolve()
      document.head.appendChild(script)
    })
    loadLeaflet().then(() => {
      const L = (window as any).L
      if (!L || !mapRef.current || leafletMapRef.current) return
      const center = coords ?? { lat: 60.1699, lng: 24.9384 }
      const map = L.map(mapRef.current).setView([center.lat, center.lng], 14)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(map)
      if (coords) { markerRef.current = L.marker([coords.lat, coords.lng]).addTo(map) }
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng
        if (markerRef.current) { markerRef.current.setLatLng([lat, lng]) } else { markerRef.current = L.marker([lat, lng]).addTo(map) }
        onCoordsChange({ lat, lng })
      })
      leafletMapRef.current = map
      setTimeout(() => map.invalidateSize(), 100)
    })
    return () => { if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; markerRef.current = null } }
  }, [])

  if (Platform.OS !== 'web') return null
  return <View style={{ flex: 1 }}><div ref={mapRef as any} style={{ width: '100%', height: '100%', minHeight: 300 }} /></View>
}

// ════════════════════════════════════════════════════════════════════════════
// Helsinki Monochrome — Mockup 07 StyleSheet
// ════════════════════════════════════════════════════════════════════════════
const mk = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  headerCloseBtn: { width: 36, height: 36, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 14.5, fontWeight: '600', letterSpacing: -0.2, fontFamily: fonts.heading },
  headerDraft: { width: 56, fontSize: 12, fontWeight: '500', textAlign: 'right', textDecorationLine: 'underline', fontFamily: fonts.bodyMedium },

  // Step indicator
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingBottom: 10 },
  stepDot: { width: 6, height: 6, borderRadius: 3 },
  stepLabel: { fontSize: 12, fontWeight: '500' as const, marginLeft: 4, fontFamily: fonts.bodyMedium },

  // Section label
  sectionLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '500', fontFamily: fonts.bodyMedium, marginBottom: 8 },

  // Scroll
  scrollPad: { paddingBottom: 32 },

  // Pills
  pillSection: { paddingHorizontal: 20, paddingTop: 14 },
  pillsRow: { flexDirection: 'row', gap: 8, paddingBottom: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999 },
  pillText: { fontSize: 13, fontFamily: fonts.bodyMedium },

  // Category grid
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  catCard: { width: '47%' as any, borderRadius: 20 },
  catCardFull: { width: '100%' as any },
  catCardInner: { padding: 16, gap: 8, alignItems: 'center', minHeight: 130, justifyContent: 'center', borderRadius: 20 },
  catIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  lockBadge: { position: 'absolute', top: -4, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  catName: { fontSize: 16, fontWeight: '700', fontFamily: fonts.headingSemi, lineHeight: 20, textAlign: 'center' },
  catSub: { fontSize: 13, fontFamily: fonts.body, lineHeight: 16, textAlign: 'center' },

  // Photo uploader
  photoWrap: { paddingHorizontal: 20, paddingTop: 18 },
  photoDashed: { aspectRatio: 1.25, borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoCircle: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  photoMainText: { fontSize: 13.5, fontWeight: '500', fontFamily: fonts.bodyMedium },
  photoSubText: { fontSize: 11, fontFamily: fonts.body },
  imgRow: { flexDirection: 'row', gap: 8 },
  imgThumb: { width: 100, height: 100, borderRadius: 20, overflow: 'hidden', position: 'relative', borderWidth: 1 },
  imgThumbImg: { width: '100%', height: '100%' },
  imgRemove: { position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  imgMainBadge: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 2, alignItems: 'center' },
  imgMainBadgeText: { fontSize: 10, fontWeight: '600', fontFamily: fonts.bodySemi },
  imgAddMore: { width: 100, height: 100, borderRadius: 20, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  imgAddMoreText: { fontSize: 11, fontFamily: fonts.body },

  // Form fields
  fieldWrap: { gap: 4, paddingHorizontal: 20, paddingTop: 14 },
  input: { height: 50, borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, fontSize: 14.5, fontWeight: '600', fontFamily: fonts.heading },
  textarea: { minHeight: 90, borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 13.5, lineHeight: 20, fontFamily: fonts.body, textAlignVertical: 'top' },
  charCount: { fontSize: 11, textAlign: 'right', fontFamily: fonts.body },

  // 2-column
  twoCol: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14 },
  twoColItem: { flex: 1, gap: 4 },
  twoColInputWrap: { flex: 1 },

  // Map picker row
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginTop: 10, paddingHorizontal: 16, height: 50, borderRadius: 20, borderWidth: 1 },
  mapRowText: { fontSize: 13.5, fontWeight: '500', fontFamily: fonts.bodyMedium },
  coordsSmall: { fontSize: 11, marginTop: 4, marginHorizontal: 20, fontFamily: fonts.body },

  // Tags
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, minHeight: 44 },
  tagText: { fontSize: 13, fontFamily: fonts.body },

  // Tarjoan sub-type
  tarjoanChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, minHeight: 44, flex: 1, justifyContent: 'center' },
  tarjoanChipText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },

  // Details toggle
  detailsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, marginHorizontal: 20, marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 48 },
  detailsToggleText: { fontSize: 14, fontFamily: fonts.bodySemi },

  // Toggle rows
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 20, gap: 12 },
  toggleInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  toggleLabel: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi },
  toggleHint: { fontSize: 11, fontFamily: fonts.body, lineHeight: 15, marginTop: 2 },

  // Urgency
  urgencyWrap: { gap: 8 },
  urgencyOpts: { flexDirection: 'row', gap: 12, paddingHorizontal: 20 },
  urgencyOpt: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 999, borderWidth: 1.5, minHeight: 44 },
  urgencyOptText: { fontSize: 14, fontWeight: '700' },

  // Sticky publish
  stickyWrap: { position: 'absolute', left: 16, right: 16 },
  formError: { fontSize: 13, fontFamily: fonts.bodyMedium, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  publishBtn: { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  publishText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.heading },
  publishLoading: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Pro banner
  proBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, marginHorizontal: 20, marginTop: 8, borderRadius: 20 },
  proBannerText: { flex: 1, fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi },

  // Success overlay
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  successCard: { borderRadius: 28, padding: 32, alignItems: 'center', gap: 12, width: '100%', maxWidth: 300 },
  successIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  successTitle: { fontSize: 18, fontWeight: '700', fontFamily: fonts.headingSemi, textAlign: 'center' },
  successSub: { fontSize: 14, fontFamily: fonts.body, textAlign: 'center' },
  shareBtn: { borderRadius: 999, paddingHorizontal: 24, paddingVertical: 12, marginTop: 4 },
  shareBtnText: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bodySemi },

  // Map modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 18, fontWeight: '700', fontFamily: fonts.headingSemi },
  modalFooter: { paddingHorizontal: 16, paddingVertical: 12 },
  confirmBtn: { borderRadius: 999, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  confirmBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi },
  coordsDisplay: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  coordsDisplayText: { fontSize: 13, fontWeight: '500', fontFamily: fonts.body },
  mapFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  mapFallbackText: { fontSize: 16, fontWeight: '600', textAlign: 'center', fontFamily: fonts.headingSemi },
  mapFallbackHint: { fontSize: 13, textAlign: 'center', fontFamily: fonts.body },
  coordInputRow: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 16 },
  coordInput: { flex: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, textAlign: 'center', fontFamily: fonts.body },

  // Draft toast
  draftToast: { position: 'absolute', alignSelf: 'center', top: 80, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, zIndex: 999 },
  draftToastText: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi },

  // Clear draft button
  clearDraftBtn: { alignSelf: 'center', marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
  clearDraftText: { fontSize: 13, fontFamily: fonts.body },
})
