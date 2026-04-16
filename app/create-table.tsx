declare const __DEV__: boolean

import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, TextInput, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, MapPin, Check } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { getCachedUserId } from '@/lib/authCache'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { createEventChat } from '@/lib/eventChatHelpers'
import { TABLE_CATEGORIES } from '@/lib/constants'
import type { TableCategory } from '@/lib/types'

const CATEGORY_OPTIONS: { key: TableCategory; labelKey: string; emoji: string; color: string }[] = [
  { key: 'coffee', labelKey: 'tables.catCoffee', emoji: '☕', color: '#8B5E3C' },
  { key: 'lunch', labelKey: 'tables.catLunch', emoji: '🍽️', color: '#E8A050' },
  { key: 'walk', labelKey: 'tables.catWalk', emoji: '🚶', color: '#4CAF6A' },
  { key: 'sports', labelKey: 'tables.catSports', emoji: '⚽', color: '#3B7DD8' },
  { key: 'hangout', labelKey: 'tables.catHangout', emoji: '🤝', color: '#7C5CBF' },
]

const DURATION_OPTIONS = [
  { minutes: 30, labelKey: 'tables.duration30m' },
  { minutes: 60, labelKey: 'tables.duration1h' },
  { minutes: 120, labelKey: 'tables.duration2h' },
]

const MAX_PEOPLE_OPTIONS = [2, 4, 6, 8]

function CreateTableScreenInner() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userNaapurusto, setUserNaapurusto] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [locationName, setLocationName] = useState('')
  const [category, setCategory] = useState<TableCategory>('coffee')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [maxParticipants, setMaxParticipants] = useState(4)
  const [submitting, setSubmitting] = useState(false)

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
    })
    return () => { mounted = false }
  }, [supabase, router])

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert(t('common.error'), t('events.titleDateRequired'))
      return
    }
    if (!currentUserId) {
      router.replace('/(auth)/login')
      return
    }

    setSubmitting(true)
    try {
      const now = new Date()
      const endDate = new Date(now.getTime() + durationMinutes * 60000)

      const eventPayload = {
        title: title.trim(),
        description: null,
        image_url: null,
        event_date: now.toISOString(),
        event_end_date: endDate.toISOString(),
        location_name: locationName.trim() || null,
        location_lat: null,
        location_lng: null,
        category,
        max_participants: maxParticipants,
        approval_required: false,
        naapurusto: userNaapurusto,
        is_active: true,
        event_type: 'table',
        creator_id: currentUserId,
      }

      const { data, error } = await (supabase.from('community_events') as any)
        .insert(eventPayload)
        .select('id')
        .single()

      if (error || !data?.id) {
        Alert.alert(t('common.error'), t('tables.createFailed'))
        setSubmitting(false)
        return
      }

      const eventId = data.id

      // Auto-join as participant
      await (supabase.from('community_event_participants') as any)
        .insert({ event_id: eventId, user_id: currentUserId, status: 'joined' })

      // Auto-create group chat (soft fail)
      await createEventChat(supabase, eventId, title.trim(), currentUserId).catch(() => {})

      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
      Alert.alert(t('common.success'), t('tables.created'))

      router.replace(`/event/${eventId}` as any)
    } catch {
      Alert.alert(t('common.error'), t('tables.createFailed'))
    } finally {
      setSubmitting(false)
    }
  }, [title, locationName, category, durationMinutes, maxParticipants, currentUserId, userNaapurusto, supabase, router, t])

  const canSubmit = title.trim().length > 0 && !submitting

  return (
    <KeyboardAvoidingView
      style={[s.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={s.backButton} accessibilityLabel={t('common.back')} accessibilityRole="button">
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground, fontFamily: fonts.headingSemi }]}>
          {t('tables.create')}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Category */}
        <Text style={[s.label, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
          {t('tables.category')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {CATEGORY_OPTIONS.map(cat => {
            const selected = category === cat.key
            return (
              <Pressable
                key={cat.key}
                onPress={() => {
                  setCategory(cat.key)
                  try { Haptics.selectionAsync() } catch {}
                }}
                style={[
                  s.categoryChip,
                  {
                    backgroundColor: selected ? cat.color : colors.muted,
                    borderColor: selected ? cat.color : colors.border,
                  },
                ]}
                accessibilityLabel={t(cat.labelKey)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={s.categoryEmoji}>{cat.emoji}</Text>
                <Text style={[s.categoryLabel, {
                  color: selected ? '#FFF' : colors.foreground,
                  fontFamily: selected ? fonts.bodySemi : fonts.body,
                }]}>
                  {t(cat.labelKey)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {/* Title */}
        <Text style={[s.label, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
          {t('tables.whatToDo')} *
        </Text>
        <TextInput
          style={[s.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: fonts.body }]}
          value={title}
          onChangeText={setTitle}
          placeholder={t('tables.whatPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          maxLength={100}
          accessibilityLabel={t('tables.whatToDo')}
        />

        {/* Location */}
        <Text style={[s.label, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
          {t('tables.where')}
        </Text>
        <View style={[s.inputWithIcon, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <MapPin size={18} color={colors.mutedForeground} />
          <TextInput
            style={[s.inputInner, { color: colors.foreground, fontFamily: fonts.body }]}
            value={locationName}
            onChangeText={setLocationName}
            placeholder={t('tables.wherePlaceholder')}
            placeholderTextColor={colors.mutedForeground}
            maxLength={200}
            accessibilityLabel={t('tables.where')}
          />
        </View>

        {/* Duration */}
        <Text style={[s.label, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
          {t('tables.duration')}
        </Text>
        <View style={s.segmentRow}>
          {DURATION_OPTIONS.map(opt => {
            const selected = durationMinutes === opt.minutes
            return (
              <Pressable
                key={opt.minutes}
                onPress={() => {
                  setDurationMinutes(opt.minutes)
                  try { Haptics.selectionAsync() } catch {}
                }}
                style={[
                  s.segmentBtn,
                  {
                    backgroundColor: selected ? colors.primary : colors.muted,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
                accessibilityLabel={t(opt.labelKey)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[s.segmentText, { color: selected ? colors.primaryForeground : colors.foreground, fontFamily: selected ? fonts.bodySemi : fonts.body }]}>
                  {t(opt.labelKey)}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Max people */}
        <Text style={[s.label, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
          {t('tables.maxParticipants')}
        </Text>
        <View style={s.segmentRow}>
          {MAX_PEOPLE_OPTIONS.map(n => {
            const selected = maxParticipants === n
            return (
              <Pressable
                key={n}
                onPress={() => {
                  setMaxParticipants(n)
                  try { Haptics.selectionAsync() } catch {}
                }}
                style={[
                  s.segmentBtn,
                  {
                    backgroundColor: selected ? colors.primary : colors.muted,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
                accessibilityLabel={`${n}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[s.segmentText, { color: selected ? colors.primaryForeground : colors.foreground, fontFamily: selected ? fonts.bodySemi : fonts.body }]}>
                  {n}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Submit — solid foreground */}
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[s.submitButton, { backgroundColor: canSubmit ? colors.foreground : colors.muted }]}
          accessibilityLabel={t('tables.create')}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={[s.submitText, { color: canSubmit ? colors.background : colors.mutedForeground, fontFamily: fonts.headingSemi }]}>
              {t('tables.create')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1 },
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
    borderRadius: 16,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    lineHeight: 28,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  content: {
    padding: 16,
    gap: 4,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 20,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    gap: 8,
  },
  inputInner: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 20,
  },
  chipRow: {
    gap: 12,
    paddingVertical: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryEmoji: {
    fontSize: 18,
  },
  categoryLabel: {
    fontSize: 14,
    lineHeight: 20,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 12,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  segmentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    minHeight: 52,
  },
  submitText: {
    fontSize: 16,
    lineHeight: 22,
  },
})

export default function CreateTableScreen() {
  return (
    <ScreenErrorBoundary screenName="CreateTable">
      <CreateTableScreenInner />
    </ScreenErrorBoundary>
  )
}
