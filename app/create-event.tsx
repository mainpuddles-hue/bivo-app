declare const __DEV__: boolean

import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { X, Camera, Calendar, Clock, Users, Check } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import { getCachedUserId } from '@/lib/authCache'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { LocationAutocomplete } from '@/components/LocationAutocomplete'
import { PressableOpacity, KeyboardDoneAccessory, KEYBOARD_DONE_ID } from '@/components/ui'
import { createEventChat } from '@/lib/eventChatHelpers'
import { useToast } from '@/components/Toast'
import { uriToArrayBuffer } from '@/lib/uploadHelpers'
import type { CommunityEvent } from '@/lib/types'

type EventCategory = CommunityEvent['category']

const EVENT_CATEGORIES: { key: EventCategory; labelKey: string }[] = [
  { key: 'social', labelKey: 'events.catSocial' },
  { key: 'sports', labelKey: 'events.catSports' },
  { key: 'culture', labelKey: 'events.catCulture' },
  { key: 'nature', labelKey: 'events.catNature' },
  { key: 'kids', labelKey: 'events.catKids' },
  { key: 'other', labelKey: 'events.catOther' },
]

// Event templates — pre-fill form for common building-level events
interface EventTemplate {
  titleKey: string
  descriptionKey: string
  category: EventCategory
  maxParticipants?: string
}

const EVENT_TEMPLATES: Record<string, EventTemplate> = {
  rappukirppis: {
    titleKey: 'events.templateRappukirppisTitle',
    descriptionKey: 'events.templateRappukirppisDesc',
    category: 'social',
    maxParticipants: '',
  },
  talkoot: {
    titleKey: 'events.templateTalkootTitle',
    descriptionKey: 'events.templateTalkootDesc',
    category: 'social',
  },
  kahvit: {
    titleKey: 'events.templateKahvitTitle',
    descriptionKey: 'events.templateKahvitDesc',
    category: 'social',
    maxParticipants: '20',
  },
}

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
  const toast = useToast()
  const { edit, template } = useLocalSearchParams<{ edit?: string; template?: string }>()

  // Auth
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userNaapurusto, setUserNaapurusto] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [locationName, setLocationName] = useState('')
  const [locationLat, setLocationLat] = useState<number | null>(null)
  const [locationLng, setLocationLng] = useState<number | null>(null)
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
          .maybeSingle()
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
        toast.show({ message: t('events.loadFailed') ?? 'Failed to load event data', type: 'error' })
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
        .maybeSingle()
      if (mounted && (data as any)?.naapurusto) {
        setUserNaapurusto((data as any).naapurusto as string)
      }
    }).catch((e: any) => { if (__DEV__) console.warn('[create-event] profile fetch failed:', e?.message) })
    return () => { mounted = false }
  }, [supabase, router])

  // Apply template when navigating with ?template=rappukirppis
  useEffect(() => {
    if (!template || edit) return
    const tmpl = EVENT_TEMPLATES[template]
    if (!tmpl) return
    setTitle(t(tmpl.titleKey) ?? '')
    setDescription(t(tmpl.descriptionKey) ?? '')
    setCategory(tmpl.category)
    if (tmpl.maxParticipants) setMaxParticipants(tmpl.maxParticipants)
  }, [template, edit, t])

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      toast.show({ message: 'Camera roll permission is needed.', type: 'error' })
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
      toast.show({ message: t('events.titleDateRequired'), type: 'error' })
      return
    }
    if (!eventDate.trim()) {
      toast.show({ message: t('events.titleDateRequired'), type: 'error' })
      return
    }
    if (!currentUserId) {
      router.replace('/(auth)/login')
      return
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(eventDate.trim())) {
      toast.show({ message: t('create.invalidDateFormat') ?? 'Use YYYY-MM-DD format', type: 'error' })
      return
    }

    setSubmitting(true)

    try {
      // Build event_date ISO string. Validate HH:MM format to reject
      // malformed inputs like "9:0" or "25:70" which would create invalid
      // dates (or silently roll over into the next day).
      const rawTime = eventTime.trim() || '12:00'
      const timeMatch = rawTime.match(/^(\d{1,2}):(\d{2})$/)
      if (!timeMatch) {
        toast.show({ message: t('create.invalidTimeFormat') ?? 'Invalid time format (HH:MM)', type: 'error' })
        setSubmitting(false)
        return
      }
      const timeH = parseInt(timeMatch[1], 10)
      const timeM = parseInt(timeMatch[2], 10)
      if (timeH < 0 || timeH > 23 || timeM < 0 || timeM > 59) {
        toast.show({ message: t('create.invalidTimeFormat') ?? 'Invalid time format (HH:MM)', type: 'error' })
        setSubmitting(false)
        return
      }
      // Build the date/time in the device's local timezone, then convert
      // to UTC for storage. Previously we shipped a naive string
      // ("2026-04-10T12:00:00" with no timezone), which Postgres
      // interpreted as UTC for `timestamp with time zone` columns —
      // resulting in events shifting by the user's tz offset on display.
      // Using `new Date(y, m, d, h, min)` avoids the ambiguous string
      // parsing that Safari/Hermes treat differently.
      const dateParts = eventDate.trim().split('-').map((s) => parseInt(s, 10))
      if (dateParts.length < 3) {
        toast.show({ message: t('create.invalidDateFormat') ?? 'Use YYYY-MM-DD format', type: 'error' })
        setSubmitting(false)
        return
      }
      const [dateY, dateM, dateD] = dateParts
      if (!Number.isFinite(dateY) || !Number.isFinite(dateM) || !Number.isFinite(dateD)) {
        toast.show({ message: t('create.invalidDateFormat') ?? 'Use YYYY-MM-DD format', type: 'error' })
        setSubmitting(false)
        return
      }
      const localDate = new Date(dateY, dateM - 1, dateD, timeH, timeM, 0, 0)
      if (isNaN(localDate.getTime())) {
        toast.show({ message: t('create.invalidDateFormat') ?? 'Use YYYY-MM-DD format', type: 'error' })
        setSubmitting(false)
        return
      }
      const isoDate = localDate.toISOString()

      // Parse max participants
      const maxP = maxParticipants.trim()
      const parsedMax = maxP ? parseInt(maxP, 10) : null
      if (parsedMax !== null && (isNaN(parsedMax) || parsedMax < 1 || parsedMax > 10000)) {
        toast.show({ message: t('events.maxAttendeesRange'), type: 'error' })
        setSubmitting(false)
        return
      }

      // Upload image if selected
      const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif']
      const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

      let uploadedImageUrl: string | null = null
      if (imageUri) {
        // Strip query-string/fragment so URIs like "file://.../photo.jpg?t=123"
        // don't produce a garbled "jpg?t=123" extension
        const rawExt = (imageUri.split('.').pop() ?? 'jpg').split(/[?#]/)[0].toLowerCase()
        const fileExt = ALLOWED_EXTS.includes(rawExt) ? rawExt : 'jpg'
        if (!ALLOWED_EXTS.includes(fileExt)) {
          toast.show({ message: t('create.imageTooLarge'), type: 'error' })
          setSubmitting(false)
          return
        }
        const fileName = `community-event-${currentUserId}-${Date.now()}.${fileExt}`
        const filePath = `events/${fileName}`

        const imgController = new AbortController()
        const imgTimeoutId = setTimeout(() => imgController.abort(), 30000)
        const response = await fetch(imageUri, { signal: imgController.signal })
        clearTimeout(imgTimeoutId)
        const blob = await response.blob()
        if (blob.size > MAX_FILE_SIZE) {
          toast.show({ message: t('create.imageTooLarge'), type: 'error' })
          setSubmitting(false)
          return
        }
        // RN's blob.arrayBuffer() is undefined for fetch(file://) blobs.
        const arrayBuffer = await uriToArrayBuffer(imageUri)

        const { error: uploadError } = await supabase.storage
          .from('event-images')
          .upload(filePath, arrayBuffer, { contentType: `image/${fileExt}`, upsert: false })

        if (uploadError) {
          toast.show({ message: t('events.imageUploadFailed') ?? 'Kuvan lataus epäonnistui', type: 'error' })
          setSubmitting(false)
          return
        }
        const { data: urlData } = supabase.storage
          .from('event-images')
          .getPublicUrl(filePath)
        uploadedImageUrl = urlData?.publicUrl ?? null
      }

      // Insert or Update event
      const eventPayload = {
        title: title.trim(),
        description: description.trim() || null,
        image_url: uploadedImageUrl ?? (edit ? imageUri : null),
        event_date: isoDate,
        event_end_date: null,
        location_name: locationName.trim() || null,
        location_lat: locationLat,
        location_lng: locationLng,
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
          .maybeSingle()
        error = res.error
        resultId = res.data?.id ?? edit
      } else {
        const res = await (supabase.from('community_events') as any)
          .insert({ ...eventPayload, event_type: 'event', creator_id: currentUserId })
          .select('id')
          .single()
        error = res.error
        resultId = res.data?.id

        // Auto-join creator as participant + create group chat (soft fail with logging)
        if (!error && resultId && currentUserId) {
          ;(supabase.from('community_event_participants') as any)
            .insert({ event_id: resultId, user_id: currentUserId, status: 'joined' })
            .then(({ error: joinErr }: any) => {
              if (joinErr && __DEV__) console.warn('[create-event] auto-join failed:', joinErr.message)
            })
            .catch((err: any) => { if (__DEV__) console.warn('[create-event] auto-join error:', err) })
          createEventChat(supabase, resultId, title.trim(), currentUserId).catch((err) => {
            if (__DEV__) console.warn('[create-event] chat creation failed:', err)
          })
        }
      }

      if (error) {
        // Clean up orphaned image if we uploaded one but event creation failed
        if (uploadedImageUrl && !edit) {
          const pathMatch = uploadedImageUrl.match(/event-images\/(.+)$/)
          if (pathMatch) supabase.storage.from('event-images').remove([pathMatch[1]]).catch(() => {})
        }
        toast.show({ message: t('events.createFailed'), type: 'error' })
        setSubmitting(false)
        return
      }

      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
      toast.show({ message: edit ? (t('events.updated') ?? 'Event updated') : (t('events.created') ?? 'Event created'), type: 'success' })

      if (resultId) {
        router.replace(`/event/${resultId}` as any)
      } else if (router.canGoBack()) {
        router.back()
      } else {
        router.replace('/community-events' as any)
      }
    } catch {
      toast.show({ message: t('events.createFailed'), type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }, [
    title, description, eventDate, eventTime, locationName, locationLat, locationLng, category,
    maxParticipants, approvalRequired, imageUri, currentUserId,
    userNaapurusto, supabase, router, t, edit,
  ])

  const canSubmit = title.trim().length > 0 && eventDate.trim().length > 0 && !submitting

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header — circle close + centered title */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <PressableOpacity
          onPress={() => router.back()}
          style={[styles.closeButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
        >
          <X size={18} color={colors.foreground} />
        </PressableOpacity>
        <Text
          style={[styles.headerTitle, { color: colors.foreground, fontFamily: fonts.bodySemi }]}
          accessibilityRole="header"
        >
          {edit ? (t('events.editEvent') ?? t('events.createEvent')) : t('events.createEvent')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {editLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.foreground} />
        </View>
      ) : (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Photo uploader — dashed border */}
        <PressableOpacity
          onPress={pickImage}
          style={[
            styles.imagePicker,
            {
              backgroundColor: colors.card,
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
                style={[styles.removeImageButton, { backgroundColor: colors.foreground }]}
                hitSlop={8}
                accessibilityLabel={t('common.remove')}
                accessibilityRole="button"
              >
                <X size={14} color={colors.primaryForeground} />
              </PressableOpacity>
            </View>
          ) : (
            <View style={styles.imagePickerContent}>
              <Camera size={28} color={colors.mutedForeground} />
              <Text style={[styles.imagePickerText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
                {t('events.imageAlt')}
              </Text>
            </View>
          )}
        </PressableOpacity>

        {/* Title */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {(t('events.eventTitle') + ' *').toUpperCase()}
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
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {t('events.eventDescription').toUpperCase()}
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
          inputAccessoryViewID={KEYBOARD_DONE_ID}
        />
        <Text style={[styles.charCount, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
          {description.length}/500
        </Text>

        {/* Date + Time row */}
        <View style={styles.row}>
          <View style={styles.rowHalf}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {(t('events.eventDate') + ' *').toUpperCase()}
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
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              {t('events.eventTime').toUpperCase()}
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
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {t('events.location').toUpperCase()}
        </Text>
        <LocationAutocomplete
          value={locationName}
          onChangeText={(text) => { setLocationName(text); if (!text.trim()) { setLocationLat(null); setLocationLng(null) } }}
          onSelect={({ name, lat, lng }) => { setLocationName(name); setLocationLat(lat); setLocationLng(lng) }}
          placeholder={t('events.placeholderLocation')}
          accessibilityLabel={t('events.location')}
          showIcon
        />

        {/* Category */}
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {t('events.category').toUpperCase()}
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
                    backgroundColor: selected ? colors.foreground : colors.card,
                    borderColor: selected ? colors.foreground : colors.border,
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
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
          {t('events.maxParticipants').toUpperCase()}
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
            trackColor={{ false: colors.border, true: colors.foreground }}
            thumbColor={Platform.OS === 'android' ? (approvalRequired ? colors.primaryForeground : colors.muted) : undefined}
            accessibilityLabel={t('events.approvalRequired')}
          />
        </View>
      </ScrollView>
      )}

      {/* Sticky CTA */}
      {!editLoading && (
        <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <PressableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[
              styles.submitButton,
              {
                backgroundColor: canSubmit ? colors.foreground : colors.muted,
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
                    fontFamily: fonts.bodySemi,
                  },
                ]}
              >
                {edit ? (t('common.save') ?? t('events.publish')) : t('events.publish')}
              </Text>
            )}
          </PressableOpacity>
        </View>
      )}
      <KeyboardDoneAccessory />
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
    fontFamily: fonts.bodySemi,
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  headerSpacer: {
    width: 36,
  },
  content: {
    padding: 16,
    gap: 4,
  },
  imagePicker: {
    width: '100%',
    aspectRatio: 1.25,
    borderRadius: 20,
    borderWidth: 1.5,
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
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 999,
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
    fontSize: 13,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    lineHeight: 20,
    justifyContent: 'center',
  },
  multilineInput: {
    minHeight: 100,
    height: undefined,
    paddingTop: 14,
    paddingBottom: 14,
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
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 48,
    gap: 8,
  },
  inputInner: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    height: 48,
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
    borderRadius: 999,
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
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 56,
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
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  submitButton: {
    borderRadius: 999,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
})
