import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, HandHelping, Gift, Heart, Zap, BookOpen, CalendarDays, ChevronRight, Camera, X, Check, Clock, MapPin, Users } from 'lucide-react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { CATEGORIES } from '@/lib/constants'
import type { PostType } from '@/lib/types'

const ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  HandHelping, Gift, Heart, Zap, BookOpen, CalendarDays,
}

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
  ],
  tarjoan: [
    { id: 'kodinhoito', label: 'tags.kodinhoito' },
    { id: 'muutto', label: 'tags.muutto' },
    { id: 'lastenhoito', label: 'tags.lastenhoito' },
    { id: 'lemmikit', label: 'tags.lemmikit' },
    { id: 'tekniikka', label: 'tags.tekniikka' },
    { id: 'opetus', label: 'tags.opetus' },
  ],
  ilmaista: [
    { id: 'huonekalut', label: 'tags.huonekalut' },
    { id: 'vaatteet', label: 'tags.vaatteet' },
    { id: 'elektroniikka', label: 'tags.elektroniikka' },
    { id: 'kirjat', label: 'tags.kirjat' },
    { id: 'keittio', label: 'tags.keittio' },
    { id: 'lelut', label: 'tags.lelut' },
  ],
  nappaa: [
    { id: 'ruoka', label: 'tags.ruoka' },
    { id: 'huonekalut', label: 'tags.huonekalut' },
    { id: 'vaatteet', label: 'tags.vaatteet' },
    { id: 'kirjat', label: 'tags.kirjat' },
  ],
  lainaa: [
    { id: 'tyokalut', label: 'tags.tyokalut' },
    { id: 'elektroniikka', label: 'tags.elektroniikka' },
    { id: 'urheilu', label: 'tags.urheilu' },
    { id: 'musiikki', label: 'tags.musiikki' },
  ],
  tapahtuma: [
    { id: 'musiikki', label: 'tags.musiikki' },
    { id: 'liikunta', label: 'tags.liikunta' },
    { id: 'kulttuuri', label: 'tags.kulttuuri' },
    { id: 'lapsille', label: 'tags.lapsille' },
    { id: 'ruoka', label: 'tags.ruoka' },
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
  const supabase = useMemo(() => createClient(), [])

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [step, setStep] = useState<'category' | 'form'>('category')
  const [selectedType, setSelectedType] = useState<PostType | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [dailyFee, setDailyFee] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventStartTime, setEventStartTime] = useState('')
  const [eventEndTime, setEventEndTime] = useState('')
  const [eventMaxCapacity, setEventMaxCapacity] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [expirationDays, setExpirationDays] = useState(0)
  const [images, setImages] = useState<string[]>([])
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [mapModalVisible, setMapModalVisible] = useState(false)
  const [tempMapCoords, setTempMapCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')

  // Handle pre-selected type from query params (e.g., from events screen)
  useEffect(() => {
    if (params.type && Object.keys(CATEGORIES).includes(params.type)) {
      setSelectedType(params.type as PostType)
      setStep('form')
    }
  }, [params.type])

  // Check auth on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user)
      if (!user) router.replace('/(auth)/login')
    })
  }, [supabase, router])

  const handleCategorySelect = (type: PostType) => {
    setSelectedType(type)
    setSelectedTags([])
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
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8, allowsMultipleSelection: false })
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
      if (prev.includes(tagId)) return prev.filter(t => t !== tagId)
      if (prev.length >= 3) return prev
      return [...prev, tagId]
    })
  }

  const uploadImages = async (userId: string, postId: string): Promise<string | null> => {
    if (images.length === 0) return null
    setUploadStatus(t('create.uploadingImages'))

    const uploadedUrls: string[] = []
    for (let i = 0; i < images.length; i++) {
      const uri = images[i]
      const ext = uri.split('.').pop() ?? 'jpg'
      const path = `${userId}/${postId}/${i}.${ext}`

      const response = await fetch(uri)
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()

      const { error } = await supabase.storage
        .from('post-images')
        .upload(path, arrayBuffer, { contentType: `image/${ext}`, upsert: true })

      if (!error) {
        const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path)
        uploadedUrls.push(urlData.publicUrl)
      }
    }

    // Insert extra images
    if (uploadedUrls.length > 1) {
      const extras = uploadedUrls.slice(1).map((url, idx) => ({
        post_id: postId,
        image_url: url,
        sort_order: idx + 1,
      }))
      await (supabase.from('post_images') as any).insert(extras)
    }

    return uploadedUrls[0] ?? null
  }

  const handleSubmit = useCallback(async () => {
    if (!selectedType || !title.trim() || !description.trim()) {
      Alert.alert(t('common.error'), t('create.titleAndDescRequired'))
      return
    }
    if (selectedType === 'lainaa' && (!dailyFee || parseFloat(dailyFee) <= 0)) {
      Alert.alert(t('common.error'), t('create.dailyFeeRequired'))
      return
    }
    if (selectedType === 'tapahtuma' && !eventDate) {
      Alert.alert(t('common.error'), t('events.titleDateRequired'))
      return
    }

    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { Alert.alert(t('common.error'), t('auth.loginRequired')); return }

      const expiresAt = expirationDays > 0
        ? new Date(Date.now() + expirationDays * 86400000).toISOString()
        : null

      // Create post first to get ID
      setUploadStatus(t('create.publishing'))
      const { data: post, error } = await (supabase.from('posts') as any).insert({
        user_id: user.id,
        type: selectedType,
        title: title.trim(),
        description: description.trim(),
        location: location.trim() || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        daily_fee: selectedType === 'lainaa' && dailyFee ? parseFloat(dailyFee) : null,
        event_date: selectedType === 'tapahtuma' && eventDate ? new Date(eventDate).toISOString() : null,
        expires_at: expiresAt,
        is_active: true,
        tags: selectedTags,
      }).select('id').single()

      if (error) throw error

      // Upload images if any
      if (images.length > 0 && post?.id) {
        const mainImageUrl = await uploadImages(user.id, post.id)
        if (mainImageUrl) {
          await (supabase.from('posts') as any).update({ image_url: mainImageUrl }).eq('id', post.id)
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

        const maxAtt = eventMaxCapacity ? parseInt(eventMaxCapacity, 10) : null

        await (supabase.from('events') as any).insert({
          post_id: post.id,
          creator_id: user.id,
          title: title.trim(),
          description: description.trim(),
          event_date: eventDateISO,
          location_name: location.trim() || null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          max_attendees: (maxAtt && maxAtt > 0) ? maxAtt : null,
          icon: 'CalendarDays',
          is_active: true,
        })
      }

      router.replace('/')
    } catch (err) {
      Alert.alert(t('common.error'), t('create.createFailed'))
    } finally {
      setSubmitting(false)
      setUploadStatus('')
    }
  }, [selectedType, title, description, location, latitude, longitude, dailyFee, eventDate, eventStartTime, eventEndTime, eventMaxCapacity, selectedTags, expirationDays, images, supabase, router, t])

  // ── Category selection step ──
  if (step === 'category') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('create.selectCategory')}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.categoryGrid}>
          {(Object.entries(CATEGORIES) as [PostType, (typeof CATEGORIES)[PostType]][]).map(([type, cat]) => {
            const Icon = ICON_MAP[cat.icon]
            return (
              <Pressable
                key={type}
                onPress={() => handleCategorySelect(type)}
                style={({ pressed }) => [styles.categoryCard, { backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}
              >
                <View style={[styles.categoryIcon, { backgroundColor: isDark ? cat.bgDark : cat.bgLight }]}>
                  {Icon && <Icon size={24} color={cat.color} />}
                </View>
                <View style={styles.categoryTextWrap}>
                  <Text style={[styles.categoryName, { color: colors.foreground }]}>{t(cat.label)}</Text>
                  <Text style={[styles.categorySub, { color: colors.mutedForeground }]}>{t(cat.subtitle)}</Text>
                </View>
                <ChevronRight size={16} color={colors.mutedForeground} />
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    )
  }

  // ── Form step ──
  const cat = selectedType ? CATEGORIES[selectedType] : null
  const availableTags = selectedType ? (POST_TAGS[selectedType] ?? []) : []

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setStep('category')} hitSlop={12}>
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
          {cat && (
            <View style={[styles.headerBadge, { backgroundColor: isDark ? cat.bgDark : cat.bgLight }]}>
              {ICON_MAP[cat.icon] && React.createElement(ICON_MAP[cat.icon], { size: 14, color: cat.color })}
              <Text style={[styles.headerBadgeText, { color: cat.color }]}>{t(cat.label)}</Text>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Images */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>{t('create.images')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
              {images.map((uri, idx) => (
                <View key={idx} style={styles.imageThumb}>
                  <Image source={{ uri }} style={styles.imageThumbImg} contentFit="cover" />
                  <Pressable onPress={() => removeImage(idx)} style={styles.imageRemoveBtn}>
                    <X size={12} color="#FFFFFF" />
                  </Pressable>
                  {idx === 0 && (
                    <View style={[styles.mainImageBadge, { backgroundColor: colors.primary }]}>
                      <Text style={styles.mainImageBadgeText}>{t('create.mainImage')}</Text>
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
            />
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{title.length}/100</Text>
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
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{description.length}/2000</Text>
          </View>

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
                placeholder="2026-03-20"
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
                      {isSelected && <Check size={12} color="#FFFFFF" />}
                      <Text style={[styles.tagText, { color: isSelected ? '#FFFFFF' : colors.foreground }]}>
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
                    <Text style={[styles.tagText, { color: isSelected ? '#FFFFFF' : colors.foreground }]}>
                      {opt.days === 0 ? t('create.noExpiration') : `${opt.days} ${t('common.daysShort')}`}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
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

// Need React for createElement
import React from 'react'

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  headerBadgeText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  categoryGrid: { padding: 16, gap: 12 },
  categoryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 12,
  },
  categoryIcon: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  categoryTextWrap: { flex: 1, gap: 2 },
  categoryName: { fontSize: 15, fontWeight: '600' },
  categorySub: { fontSize: 12 },
  form: { padding: 16, gap: 20, paddingBottom: 40 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, minHeight: 48,
  },
  textArea: { minHeight: 120 },
  charCount: { fontSize: 11, textAlign: 'right' },
  imageRow: { flexDirection: 'row', gap: 8 },
  imageThumb: { width: 80, height: 80, borderRadius: 10, overflow: 'hidden', position: 'relative' },
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
  mainImageBadgeText: { fontSize: 8, fontWeight: '600', color: '#FFFFFF' },
  addImageBtn: {
    width: 80, height: 80, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addImageText: { fontSize: 10 },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
  },
  tagText: { fontSize: 13 },
  submitBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    justifyContent: 'center', minHeight: 48, marginTop: 8,
  },
  submitText: { fontSize: 16, fontWeight: '600' },
  submitLoading: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Location picker
  locationRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  locationInput: { flex: 1 },
  mapPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, borderRadius: 12, minHeight: 48,
  },
  mapPickerBtnText: { fontSize: 12, fontWeight: '600' },
  coordsText: { fontSize: 11, marginTop: 2 },

  // Map modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalFooter: { paddingHorizontal: 16, paddingVertical: 12 },
  confirmBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    justifyContent: 'center', minHeight: 48,
  },
  confirmBtnText: { fontSize: 16, fontWeight: '600' },
  coordsDisplay: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10,
  },
  coordsDisplayText: { fontSize: 13, fontWeight: '500' },
  mapFallback: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32,
  },
  mapFallbackText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  mapFallbackHint: { fontSize: 13, textAlign: 'center' },
  coordInputRow: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 16 },
  coordInput: {
    flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, textAlign: 'center',
  },
})
