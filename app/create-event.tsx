declare const __DEV__: boolean

import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, Camera, X, Calendar, Clock, MapPin, Users, Check } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import { getCachedUserId } from '@/lib/authCache'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import type { CommunityEvent } from '@/lib/types'

type EventCategory = CommunityEvent['category']

const EVENT_CATEGORIES: { key: EventCategory; labelKey: string; color: string }[] = [
  { key: 'social', labelKey: 'events.catSocial', color: '#7C5CBF' },
  { key: 'sports', labelKey: 'events.catSports', color: '#2B8A62' },
  { key: 'culture', labelKey: 'events.catCulture', color: '#3B7DD8' },
  { key: 'nature', labelKey: 'events.catNature', color: '#4CAF6A' },
  { key: 'kids', labelKey: 'events.catKids', color: '#E8A050' },
  { key: 'other', labelKey: 'events.catOther', color: '#6B7280' },
]

export default function CreateEventScreen() {
  return (
    <ScreenErrorBoundary screenName="CreateEvent">
      <CreateEventScreenInner />
    </ScreenErrorBoundary>
  )
}

function CreateEventScreenInner() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const { edit } = useLocalSearchParams<{ edit?: string }>()

  // Auth
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userNaapurusto, setUserNaapurusto] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [locationName, setLocationName] = useState('')
  const [category, setCategory] = useState<EventCategory>('social')
  const [maxParticipants, setMaxParticipants] = useState('')
  const [approvalRequired, setApprovalRequired] = useState(false)
  const [imageUri, setImageUri] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editLoading, setEditLoading] = useState(!!edit)

  // Load existing event data when editing
  useEffect(() => {
    if (!edit) return
    const editId = edit
    let mounted = true
    async function loadEvent() {
      try {
        const { data } = await supabase
          .from('community_events')
          .select('*')
          .eq('id', editId)
          .single()
        if (!mounted || !data) return
        const e = data as any
        setTitle(e.title ?? '')
        setDescription(e.description ?? '')
        setEventDate(e.event_date ? (e.event_date as string).split('T')[0] : '')
        setEventTime(e.event_date ? (e.event_date as string).split('T')[1]?.substring(0, 5) ?? '' : '')
        setLocationName(e.location_name ?? '')
        setCategory(e.category ?? 'social')
        setMaxParticipants(e.max_participants != null ? String(e.max_participants) : '')
        setApprovalRequired(e.approval_required ?? false)
        setImageUri(e.image_url ?? null)
      } catch (err) {
        if (__DEV__) console.warn('[create-event] edit load failed:', err)
      } finally {
        if (mounted) setEditLoading(false)
      }
    }
    loadEvent()
    return () => { mounted = false }
  }, [edit, supabase])

  // Auth check + fetch profile
  useEffect(() => {
    let mounted = true
    getCachedUserId().then(async (id) => {
      if (!mounted) return
      if (!id) {
        router.replace('/(auth)/login')
        return
      }
      setCurrentUserId(id)
      const { data } = await supabase
        .from('profiles')
        .select('naapurusto')
        .eq('id', id)
        .single()
      if (mounted && (data as any)?.naapurusto) {
        setUserNaapurusto((data as any).naapurusto as string)
      }
    })
    return () => { mounted = false }
  }, [supabase, router])

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(t('common.error'), 'Camera roll permission is needed.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [16, 9],
    })
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri)
    }
  }, [t])

  const removeImage = useCallback(() => {
    setImageUri(null)
  }, [])

  const handleSubmit = useCallback(async () => {
    // Validate required fields
    if (!title.trim()) {
      Alert.alert(t('common.error'), t('events.titleDateRequired'))
      return
    }
    if (!eventDate.trim()) {
      Alert.alert(t('common.error'), t('events.titleDateRequired'))
      return
    }
    if (!currentUserId) {
      router.replace('/(auth)/login')
      return
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(eventDate.trim())) {
      Alert.alert(t('common.error'), t('create.invalidDateFormat') ?? 'Use YYYY-MM-DD format')
      setSubmitting(false)
      return
    }

    setSubmitting(true)

    try {
      // Build event_date ISO string
      const timePart = eventTime.trim() || '12:00'
      const isoDate = `${eventDate.trim()}T${timePart}:00`

      // Parse max participants
      const maxP = maxParticipants.trim()
      const parsedMax = maxP ? parseInt(maxP, 10) : null
      if (parsedMax !== null && (isNaN(parsedMax) || parsedMax < 1 || parsedMax > 10000)) {
        Alert.alert(t('common.error'), t('events.maxAttendeesRange'))
        setSubmitting(false)
        return
      }

      // Upload image if selected
      const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif']
      const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

      let uploadedImageUrl: string | null = null
      if (imageUri) {
        const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg'
        if (!ALLOWED_EXTS.includes(fileExt)) {
          Alert.alert(t('common.error'), t('create.imageTooLarge'))
          setSubmitting(false)
          return
        }
        const fileName = `community-event-${currentUserId}-${Date.now()}.${fileExt}`
        const filePath = `events/${fileName}`

        const response = await fetch(imageUri)
        const blob = await response.blob()
        if (blob.size > MAX_FILE_SIZE) {
          Alert.alert(t('common.error'), t('create.imageTooLarge'))
          setSubmitting(false)
          return
        }
        const arrayBuffer = await blob.arrayBuffer()

        const { error: uploadError } = await supabase.storage
          .from('event-images')
          .upload(filePath, arrayBuffer, { contentType: `image/${fileExt}`, upsert: false })

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('event-images')
            .getPublicUrl(filePath)
          uploadedImageUrl = urlData?.publicUrl ?? null
        }
      }

      // Insert or Update event
      const eventPayload = {
        title: title.trim(),
        description: description.trim() || null,
        image_url: uploadedImageUrl ?? (edit ? imageUri : null),
        event_date: isoDate,
        event_end_date: null,
        location_name: locationName.trim() || null,
        location_lat: null,
        location_lng: null,
        category,
        max_participants: parsedMax,
        approval_required: approvalRequired,
        naapurusto: userNaapurusto,
        is_active: true,
      }

      let resultId: string | undefined
      let error: any

      if (edit) {
        const res = await (supabase.from('community_events') as any)
          .update(eventPayload)
          .eq('id', edit)
          .select('id')
          .single()
        error = res.error
        resultId = res.data?.id ?? edit
      } else {
        const res = await (supabase.from('community_events') as any)
          .insert({ ...eventPayload, creator_id: currentUserId })
          .select('id')
          .single()
        error = res.error
        resultId = res.data?.id
      }

      if (error) {
        Alert.alert(t('common.error'), t('events.createFailed'))
        setSubmitting(false)
        return
      }

      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
      Alert.alert(t('common.success'), edit ? t('events.updated') ?? t('events.created') : t('events.created'))

      if (resultId) {
        router.replace(`/event/${resultId}` as any)
      } else if (router.canGoBack()) {
        router.back()
      } else {
        router.replace('/community-events' as any)
      }
    } catch {
      Alert.alert(t('common.error'), t('events.createFailed'))
    } finally {
      setSubmitting(false)
    }
  }, [
    title, description, eventDate, eventTime, locationName, category,
    maxParticipants, approvalRequired, imageUri, currentUserId,
    userNaapurusto, supabase, router, t, edit,
  ])

  const canSubmit = title.trim().length > 0 && eventDate.trim().length > 0 && !submitting

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <PressableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
        >
          <ArrowLeft size={24} color={colors.foreground} />
        </PressableOpacity>
        <Text
          style={[styles.headerTitle, { color: colors.foreground, fontFamily: fonts.heading }]}
          accessibilityRole="header"
        >
          {edit ? (t('events.editEvent') ?? t('events.createEvent')) : t('events.createEvent')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {editLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Image Picker */}
        <PressableOpacity
          onPress={pickImage}
          style={[
            styles.imagePicker,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
            },
          ]}
          accessibilityLabel={t('events.imageAlt')}
          accessibilityRole="button"
        >
          {imageUri ? (
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: imageUri }}
                style={styles.previewImage}
                contentFit="cover"
              />
              <PressableOpacity
                onPress={removeImage}
                style={[styles.removeImageButton, { backgroundColor: colors.destructive }]}
                hitSlop={8}
                accessibilityLabel={t('common.remove')}
                accessibilityRole="button"
              >
                <X size={16} color="#FFFFFF" />
              </PressableOpacity>
            </View>
          ) : (
            <View style={styles.imagePickerContent}>
              <Camera size={32} color={colors.mutedForeground} />
              <Text style={[styles.imagePickerText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                {t('events.imageAlt')}
              </Text>
            </View>
          )}
        </PressableOpacity>

        {/* Title */}
        <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
          {t('events.eventTitle')} *
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.card,
              color: colors.foreground,
              borderColor: colors.border,
              fontFamily: fonts.body,
            },
          ]}
          value={title}
          onChangeText={setTitle}
          placeholder={t('events.placeholderName')}
          placeholderTextColor={colors.mutedForeground}
          maxLength={100}
          accessibilityLabel={t('events.eventTitle')}
        />

        {/* Description */}
        <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
          {t('events.eventDescription')}
        </Text>
        <TextInput
          style={[
            styles.input,
            styles.multilineInput,
            {
              backgroundColor: colors.card,
              color: colors.foreground,
              borderColor: colors.border,
              fontFamily: fonts.body,
            },
          ]}
          value={description}
          onChangeText={setDescription}
          placeholder={t('events.placeholderDescription')}
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={4}
          maxLength={500}
          textAlignVertical="top"
          accessibilityLabel={t('events.eventDescription')}
        />
        <Text style={[styles.charCount, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
          {description.length}/500
        </Text>

        {/* Date + Time row */}
        <View style={styles.row}>
          <View style={styles.rowHalf}>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
              {t('events.eventDate')} *
            </Text>
            <View style={[styles.inputWithIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Calendar size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.inputInner, { color: colors.foreground, fontFamily: fonts.body }]}
                value={eventDate}
                onChangeText={setEventDate}
                placeholder="2026-04-15"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="numeric"
                maxLength={10}
                accessibilityLabel={t('events.eventDate')}
              />
            </View>
          </View>
          <View style={styles.rowHalf}>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
              {t('events.eventTime')}
            </Text>
            <View style={[styles.inputWithIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Clock size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.inputInner, { color: colors.foreground, fontFamily: fonts.body }]}
                value={eventTime}
                onChangeText={setEventTime}
                placeholder="18:00"
                keyboardType="numbers-and-punctuation"
                placeholderTextColor={colors.mutedForeground}
                maxLength={5}
                accessibilityLabel={t('events.eventTime')}
              />
            </View>
          </View>
        </View>

        {/* Location */}
        <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
          {t('events.location')}
        </Text>
        <View style={[styles.inputWithIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <MapPin size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.inputInner, { color: colors.foreground, fontFamily: fonts.body }]}
            value={locationName}
            onChangeText={setLocationName}
            placeholder={t('events.placeholderLocation')}
            placeholderTextColor={colors.mutedForeground}
            maxLength={200}
            accessibilityLabel={t('events.location')}
          />
        </View>

        {/* Category */}
        <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
          {t('events.category')}
        </Text>
        <View style={styles.chipContainer}>
          {EVENT_CATEGORIES.map((cat) => {
            const selected = category === cat.key
            return (
              <PressableOpacity
                key={cat.key}
                onPress={() => {
                  setCategory(cat.key)
                  try { Haptics.selectionAsync() } catch {}
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? cat.color : colors.muted,
                    borderColor: selected ? cat.color : colors.border,
                  },
                ]}
                accessibilityLabel={t(cat.labelKey)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                {selected && <Check size={14} color={colors.primaryForeground} style={styles.chipIcon} />}
                <Text
                  style={[
                    styles.chipText,
                    {
                      color: selected ? colors.primaryForeground : colors.foreground,
                      fontFamily: selected ? fonts.bodySemi : fonts.body,
                    },
                  ]}
                >
                  {t(cat.labelKey)}
                </Text>
              </PressableOpacity>
            )
          })}
        </View>

        {/* Max participants */}
        <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
          {t('events.maxParticipants')}
        </Text>
        <View style={[styles.inputWithIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Users size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.inputInner, { color: colors.foreground, fontFamily: fonts.body }]}
            value={maxParticipants}
            onChangeText={setMaxParticipants}
            placeholder={t('events.unlimited')}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            maxLength={5}
            accessibilityLabel={t('events.maxParticipants')}
          />
        </View>

        {/* Approval toggle */}
        <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.toggleTextContainer}>
            <Text style={[styles.toggleLabel, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
              {t('events.approvalRequired')}
            </Text>
            <Text style={[styles.toggleDescription, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
              {approvalRequired ? t('events.approvalNeeded') : t('events.openToAll')}
            </Text>
          </View>
          <Switch
            value={approvalRequired}
            onValueChange={setApprovalRequired}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={Platform.OS === 'android' ? (approvalRequired ? colors.primary : colors.muted) : undefined}
            accessibilityLabel={t('events.approvalRequired')}
          />
        </View>

        {/* Submit button */}
        <PressableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[
            styles.submitButton,
            {
              backgroundColor: canSubmit ? colors.primary : colors.muted,
            },
          ]}
          accessibilityLabel={t('events.publish')}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text
              style={[
                styles.submitButtonText,
                {
                  color: canSubmit ? colors.primaryForeground : colors.mutedForeground,
                  fontFamily: fonts.headingSemi,
                },
              ]}
            >
              {edit ? (t('common.save') ?? t('events.publish')) : t('events.publish')}
            </Text>
          )}
        </PressableOpacity>
      </ScrollView>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    lineHeight: 28,
    textAlign: 'center',
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    padding: 16,
    gap: 4,
  },
  imagePicker: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
    marginBottom: 16,
  },
  imageContainer: {
    width: '100%',
    height: '100%',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imagePickerText: {
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    lineHeight: 20,
  },
  multilineInput: {
    minHeight: 100,
    paddingTop: 12,
  },
  charCount: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'right',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowHalf: {
    flex: 1,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  inputInner: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 14,
    lineHeight: 20,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipIcon: {
    marginRight: 4,
  },
  chipText: {
    fontSize: 14,
    lineHeight: 20,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 12,
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 14,
    lineHeight: 20,
  },
  toggleDescription: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  submitButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    minHeight: 48,
  },
  submitButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.bodySemi,
  },
})
