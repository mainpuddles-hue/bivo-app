import { useState, useCallback, useRef, useEffect } from 'react'
import { View, Text, Modal, Pressable, TextInput, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { Flag, X, Check } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'

const REPORT_REASONS = ['spam', 'inappropriate', 'harassment', 'scam', 'fake', 'other'] as const
type ReportReason = typeof REPORT_REASONS[number]

interface ReportModalProps {
  visible: boolean
  onClose: () => void
  type: 'post' | 'user' | 'event'
  targetId: string
}

export function ReportModal({ visible, onClose, type, targetId }: ReportModalProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const supabase = useSupabase()

  const [reason, setReason] = useState<ReportReason | null>(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const reasonLabels: Record<ReportReason, string> = {
    spam: t('report.spam'),
    inappropriate: t('report.inappropriate'),
    harassment: t('report.harassment'),
    scam: t('report.scam'),
    fake: t('report.fake'),
    other: t('report.other'),
  }

  const handleSubmit = useCallback(async () => {
    if (!reason) {
      Alert.alert(t('common.error'), t('report.selectReason'))
      return
    }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert(t('common.error'), t('common.loginRequired'))
        setLoading(false)
        return
      }

      const payload: Record<string, unknown> = {
        reporter_id: user.id,
        reason,
        description: description.trim() || null,
        ...(type === 'post' ? { post_id: targetId } : type === 'event' ? { event_id: targetId } : { user_id: targetId, reported_id: targetId }),
        target_type: type,
        target_id: targetId,
      }

      const { error } = await (supabase.from('reports') as any).insert(payload)
      if (error) throw error

      setSuccess(true)
      setTimeout(() => {
        if (!mountedRef.current) return
        setSuccess(false)
        setReason(null)
        setDescription('')
        onClose()
      }, 1500)
    } catch {
      Alert.alert(t('common.error'), t('report.submitFailed'))
    } finally {
      setLoading(false)
    }
  }, [reason, description, type, targetId, supabase, t, onClose])

  const handleClose = useCallback(() => {
    if (!loading) {
      setReason(null)
      setDescription('')
      setSuccess(false)
      onClose()
    }
  }, [loading, onClose])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={s.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%', maxWidth: 400, alignSelf: 'center' }}>
        <Pressable style={[s.card, { backgroundColor: colors.card }]} onPress={() => {}}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Flag size={18} color={colors.destructive} />
              <Text style={[s.title, { color: colors.foreground }]}>{t('report.title')}</Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={12}>
              <X size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {success ? (
            <View style={s.successContainer}>
              <Check size={48} color={colors.success} />
              <Text style={[s.successText, { color: colors.foreground }]}>{t('report.submitted')}</Text>
              <Text style={[{ fontSize: 13, color: colors.mutedForeground, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16, fontFamily: fonts.body }]}>
                {t('report.reviewNotice')}
              </Text>
            </View>
          ) : (
            <>
              {/* Reason selection */}
              <Text style={[s.label, { color: colors.mutedForeground }]}>{t('report.selectReason')}</Text>
              <View style={s.reasonList}>
                {REPORT_REASONS.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setReason(r)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: reason === r }}
                    style={[
                      s.reasonItem,
                      { borderColor: reason === r ? colors.destructive : colors.border },
                      reason === r && { backgroundColor: `${colors.destructive}10` },
                    ]}
                  >
                    <View style={[
                      reason === r
                        ? [s.radio, { backgroundColor: colors.destructive }]
                        : [s.radioEmpty, { borderColor: colors.border }],
                    ]} />
                    <Text style={[s.reasonText, { color: reason === r ? colors.destructive : colors.foreground }]}>
                      {reasonLabels[r]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Description */}
              <Text style={[s.label, { color: colors.mutedForeground }]}>{t('report.descriptionLabel')}</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                value={description}
                onChangeText={(text) => setDescription(text.slice(0, 500))}
                placeholder={t('report.descriptionPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              <Text style={[s.charCount, { color: colors.mutedForeground }]}>{description.length}/500</Text>

              {/* Submit */}
              <Pressable
                onPress={handleSubmit}
                disabled={loading || !reason}
                style={[s.submitBtn, { backgroundColor: colors.destructive, opacity: loading || !reason ? 0.6 : 1 }]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={[s.submitText, { color: colors.primaryForeground }]}>{t('report.submit')}</Text>
                )}
              </Pressable>
            </>
          )}
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  )
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    fontFamily: fonts.headingSemi,
    lineHeight: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },
  reasonList: {
    gap: 6,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  reasonText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  radioEmpty: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 80,
    fontFamily: fonts.body,
    lineHeight: 20,
  },
  charCount: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: -8,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 4,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 22,
  },
  successContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  successText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 22,
  },
})
