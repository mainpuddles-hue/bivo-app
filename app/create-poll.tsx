import React, { useState, useCallback } from 'react'
import { View, Text, TextInput, ScrollView, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, Plus, X, BarChart3 } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import { PressableOpacity, KeyboardDoneAccessory, KEYBOARD_DONE_ID } from '@/components/ui'
import { getCachedUserId } from '@/lib/authCache'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'

const MAX_OPTIONS = 6
const MIN_OPTIONS = 2

function CreatePollInner() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const supabase = useSupabase()

  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [expiresIn, setExpiresIn] = useState<'1d' | '3d' | '7d'>('3d')
  const [submitting, setSubmitting] = useState(false)

  const canSubmit = question.trim().length >= 5 && options.filter(o => o.trim()).length >= MIN_OPTIONS

  const addOption = useCallback(() => {
    if (options.length >= MAX_OPTIONS) return
    setOptions(prev => [...prev, ''])
  }, [options.length])

  const removeOption = useCallback((idx: number) => {
    if (options.length <= MIN_OPTIONS) return
    setOptions(prev => prev.filter((_, i) => i !== idx))
  }, [options.length])

  const updateOption = useCallback((idx: number, text: string) => {
    setOptions(prev => {
      const next = [...prev]
      next[idx] = text
      return next
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } catch {}

    const userId = getCachedUserId()
    if (!userId) {
      Alert.alert(t('common.error'), t('common.loginRequired'))
      setSubmitting(false)
      return
    }

    // Calculate expiration
    const hours = expiresIn === '1d' ? 24 : expiresIn === '3d' ? 72 : 168
    const expiresAt = new Date(Date.now() + hours * 3600000).toISOString()

    // Get user's building + neighborhood
    const { data: profile } = await supabase
      .from('profiles')
      .select('naapurusto, building_id')
      .eq('id', userId)
      .maybeSingle()

    const cleanOptions = options.map(o => o.trim()).filter(Boolean)
    if (cleanOptions.length < MIN_OPTIONS) {
      Alert.alert(t('common.error'), t('polls.questionPlaceholder'))
      setSubmitting(false)
      return
    }

    const { error } = await (supabase.from('polls') as any).insert({
      creator_id: userId,
      question: question.trim(),
      options: cleanOptions,
      building_id: (profile as any)?.building_id ?? null,
      naapurusto: (profile as any)?.naapurusto ?? null,
      expires_at: expiresAt,
    })

    if (error) {
      Alert.alert(t('common.error'), error.message)
      setSubmitting(false)
      return
    }

    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
    router.back()
  }, [canSubmit, submitting, question, options, expiresIn, supabase, t, router])

  const DURATION_OPTIONS: { key: typeof expiresIn; label: string }[] = [
    { key: '1d', label: t('polls.duration1d') },
    { key: '3d', label: t('polls.duration3d') },
    { key: '7d', label: t('polls.duration7d') },
  ]

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <PressableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel={t('common.back')} accessibilityRole="button">
          <ArrowLeft size={22} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {t('polls.createTitle')}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: insets.bottom + 40, gap: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Question */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {t('polls.questionLabel')}
          </Text>
          <TextInput
            style={[styles.questionInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
            placeholder={t('polls.questionPlaceholder')}
            placeholderTextColor={`${colors.mutedForeground}80`}
            value={question}
            onChangeText={setQuestion}
            multiline
            maxLength={200}
            inputAccessoryViewID={KEYBOARD_DONE_ID}
          />
          <Text style={[styles.charCount, { color: colors.mutedForeground }]}>
            {question.length}/200
          </Text>
        </View>

        {/* Options */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {t('polls.optionsLabel')}
          </Text>
          {options.map((opt, idx) => (
            <View key={idx} style={styles.optionRow}>
              <TextInput
                style={[styles.optionInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                placeholder={`${t('polls.option')} ${idx + 1}`}
                placeholderTextColor={`${colors.mutedForeground}80`}
                value={opt}
                onChangeText={(text) => updateOption(idx, text)}
                maxLength={80}
                inputAccessoryViewID={KEYBOARD_DONE_ID}
              />
              {options.length > MIN_OPTIONS && (
                <PressableOpacity
                  onPress={() => removeOption(idx)}
                  style={[styles.removeBtn, { backgroundColor: `${colors.destructive}12` }]}
                  hitSlop={8}
                  accessibilityLabel={t('common.remove')}
                  accessibilityRole="button"
                >
                  <X size={14} color={colors.destructive} />
                </PressableOpacity>
              )}
            </View>
          ))}
          {options.length < MAX_OPTIONS && (
            <PressableOpacity
              onPress={addOption}
              style={[styles.addOptionBtn, { borderColor: colors.border }]}
              accessibilityLabel={t('polls.addOption')}
              accessibilityRole="button"
            >
              <Plus size={16} color={colors.mutedForeground} />
              <Text style={[styles.addOptionText, { color: colors.mutedForeground }]}>
                {t('polls.addOption')}
              </Text>
            </PressableOpacity>
          )}
        </View>

        {/* Duration */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {t('polls.durationLabel')}
          </Text>
          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map(d => (
              <PressableOpacity
                key={d.key}
                onPress={() => { try { Haptics.selectionAsync() } catch {}; setExpiresIn(d.key) }}
                style={[
                  styles.durationChip,
                  {
                    backgroundColor: expiresIn === d.key ? colors.foreground : 'transparent',
                    borderColor: expiresIn === d.key ? colors.foreground : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: expiresIn === d.key }}
              >
                <Text
                  style={[
                    styles.durationChipText,
                    { color: expiresIn === d.key ? colors.primaryForeground : colors.foreground },
                  ]}
                >
                  {d.label}
                </Text>
              </PressableOpacity>
            ))}
          </View>
        </View>

        {/* Submit */}
        <PressableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          style={[
            styles.submitBtn,
            {
              backgroundColor: canSubmit ? colors.foreground : colors.muted,
              opacity: submitting ? 0.6 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('polls.publish')}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <>
              <BarChart3 size={18} color={canSubmit ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.submitText, { color: canSubmit ? colors.primaryForeground : colors.mutedForeground }]}>
                {t('polls.publish')}
              </Text>
            </>
          )}
        </PressableOpacity>
      </ScrollView>
      <KeyboardDoneAccessory />
    </KeyboardAvoidingView>
  )
}

export default function CreatePollScreen() {
  return (
    <ScreenErrorBoundary screenName="CreatePoll">
      <CreatePollInner />
    </ScreenErrorBoundary>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.heading,
    lineHeight: 22,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
  questionInput: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: fonts.body,
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    fontFamily: fonts.body,
    textAlign: 'right',
    lineHeight: 14,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionInput: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: fonts.body,
    lineHeight: 20,
    minHeight: 48,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 12,
    minHeight: 48,
  },
  addOptionText: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 10,
    minHeight: 44,
  },
  durationChipText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 999,
    paddingVertical: 16,
    minHeight: 56,
    marginTop: 8,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 22,
  },
})
