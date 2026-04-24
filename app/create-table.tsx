declare const __DEV__: boolean

import { useState, useCallback, useEffect } from 'react'
import {
  View, Text, TextInput, ScrollView, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { X, MapPin, Check, Coffee, UtensilsCrossed, Footprints, Trophy, Handshake } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { getCachedUserId } from '@/lib/authCache'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { createEventChat } from '@/lib/eventChatHelpers'
import { PressableOpacity } from '@/components/ui'
import { useToast } from '@/components/Toast'
import { TABLE_CATEGORIES } from '@/lib/constants'
import type { TableCategory } from '@/lib/types'

const CATEGORY_OPTIONS: { key: TableCategory; labelKey: string; icon: LucideIcon }[] = [
  { key: 'coffee', labelKey: 'tables.catCoffee', icon: Coffee },
  { key: 'lunch', labelKey: 'tables.catLunch', icon: UtensilsCrossed },
  { key: 'walk', labelKey: 'tables.catWalk', icon: Footprints },
  { key: 'sports', labelKey: 'tables.catSports', icon: Trophy },
  { key: 'hangout', labelKey: 'tables.catHangout', icon: Handshake },
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
  const toast = useToast()

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
      toast.show({ message: t('events.titleDateRequired'), type: 'error' })
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
        toast.show({ message: t('tables.createFailed'), type: 'error' })
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
      toast.show({ message: t('tables.created'), type: 'success' })

      router.replace(`/event/${eventId}` as any)
    } catch {
      toast.show({ message: t('tables.createFailed'), type: 'error' })
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
      {/* Header — circle close + centered title */}
      <View style={[s.header, { paddingTop: insets.top + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <PressableOpacity
          onPress={() => router.back()}
          style={[s.closeButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
        >
          <X size={18} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground, fontFamily: fonts.bodySemi }]}>
          {t('tables.create')}
        </Text>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView
        style={s.flex}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Category */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
          {t('tables.category').toUpperCase()}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {CATEGORY_OPTIONS.map(cat => {
            const selected = category === cat.key
            return (
              <PressableOpacity
                key={cat.key}
                onPress={() => {
                  setCategory(cat.key)
                  try { Haptics.selectionAsync() } catch {}
                }}
                style={[
                  s.categoryChip,
                  {
                    backgroundColor: selected ? colors.foreground : colors.card,
                    borderColor: selected ? colors.foreground : colors.border,
                  },
                ]}
                accessibilityLabel={t(cat.labelKey)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <cat.icon size={18} color={selected ? colors.primaryForeground : colors.mutedForeground} />
                <Text style={[s.categoryLabel, {
                  color: selected ? colors.primaryForeground : colors.foreground,
                  fontFamily: selected ? fonts.bodySemi : fonts.body,
                }]}>
                  {t(cat.labelKey)}
                </Text>
              </PressableOpacity>
            )
          })}
        </ScrollView>

        {/* Title */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
          {(t('tables.whatToDo') + ' *').toUpperCase()}
        </Text>
        <TextInput
          style={[s.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, fontFamily: fonts.body }]}
          value={title}
          onChangeText={setTitle}
          placeholder={t('tables.whatPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          maxLength={100}
          accessibilityLabel={t('tables.whatToDo')}
        />

        {/* Location */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
          {t('tables.where').toUpperCase()}
        </Text>
        <View style={[s.inputWithIcon, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
          {t('tables.duration').toUpperCase()}
        </Text>
        <View style={s.segmentRow}>
          {DURATION_OPTIONS.map(opt => {
            const selected = durationMinutes === opt.minutes
            return (
              <PressableOpacity
                key={opt.minutes}
                onPress={() => {
                  setDurationMinutes(opt.minutes)
                  try { Haptics.selectionAsync() } catch {}
                }}
                style={[
                  s.segmentBtn,
                  {
                    backgroundColor: selected ? colors.foreground : colors.card,
                    borderColor: selected ? colors.foreground : colors.border,
                  },
                ]}
                accessibilityLabel={t(opt.labelKey)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[s.segmentText, {
                  color: selected ? colors.primaryForeground : colors.foreground,
                  fontFamily: selected ? fonts.bodySemi : fonts.body,
                }]}>
                  {t(opt.labelKey)}
                </Text>
              </PressableOpacity>
            )
          })}
        </View>

        {/* Max people */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
          {t('tables.maxParticipants').toUpperCase()}
        </Text>
        <View style={s.segmentRow}>
          {MAX_PEOPLE_OPTIONS.map(n => {
            const selected = maxParticipants === n
            return (
              <PressableOpacity
                key={n}
                onPress={() => {
                  setMaxParticipants(n)
                  try { Haptics.selectionAsync() } catch {}
                }}
                style={[
                  s.segmentBtn,
                  {
                    backgroundColor: selected ? colors.foreground : colors.card,
                    borderColor: selected ? colors.foreground : colors.border,
                  },
                ]}
                accessibilityLabel={`${n}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[s.segmentText, {
                  color: selected ? colors.primaryForeground : colors.foreground,
                  fontFamily: selected ? fonts.bodySemi : fonts.body,
                }]}>
                  {n}
                </Text>
              </PressableOpacity>
            )
          })}
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View style={[s.stickyFooter, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <PressableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[s.submitButton, { backgroundColor: canSubmit ? colors.foreground : colors.muted }]}
          accessibilityLabel={t('tables.create')}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Text style={[s.submitText, {
              color: canSubmit ? colors.primaryForeground : colors.mutedForeground,
              fontFamily: fonts.bodySemi,
            }]}>
              {t('tables.create')}
            </Text>
          )}
        </PressableOpacity>
      </View>
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
  content: {
    padding: 16,
    gap: 4,
  },
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
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    lineHeight: 20,
    justifyContent: 'center',
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
  chipRow: {
    gap: 10,
    paddingVertical: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
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
    borderRadius: 999,
    borderWidth: 1,
  },
  segmentText: {
    fontSize: 14,
    lineHeight: 20,
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
  submitText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
})

export default function CreateTableScreen() {
  return (
    <ScreenErrorBoundary screenName="CreateTable">
      <CreateTableScreenInner />
    </ScreenErrorBoundary>
  )
}
