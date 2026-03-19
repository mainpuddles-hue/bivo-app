import { useState, useMemo, useCallback } from 'react'
import { View, Text, Modal, Pressable, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { Star, X } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'

interface ReviewModalProps {
  visible: boolean
  onClose: () => void
  reviewedUserId: string
  postId?: string
  onReviewSubmitted?: () => void
}

export function ReviewModal({ visible, onClose, reviewedUserId, postId, onReviewSubmitted }: ReviewModalProps) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const supabase = useMemo(() => createClient(), [])

  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (rating === 0) {
      Alert.alert(t('common.error'), t('profile.selectRating'))
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

      // Check for existing review
      const { data: existing } = await supabase
        .from('reviews')
        .select('id')
        .eq('reviewer_id', user.id)
        .eq('reviewed_id', reviewedUserId)
        .maybeSingle()

      if (existing) {
        Alert.alert(t('common.error'), t('profile.alreadyReviewed'))
        setLoading(false)
        return
      }

      // Insert review
      const { error } = await (supabase.from('reviews') as any).insert({
        reviewer_id: user.id,
        reviewed_id: reviewedUserId,
        post_id: postId ?? null,
        rating,
        comment: comment.trim() || null,
      })

      if (error) throw error

      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        setRating(0)
        setComment('')
        onReviewSubmitted?.()
        onClose()
      }, 1500)
    } catch {
      Alert.alert(t('common.error'), t('profile.reviewFailed'))
    } finally {
      setLoading(false)
    }
  }, [rating, comment, reviewedUserId, postId, supabase, t, onClose, onReviewSubmitted])

  const handleClose = useCallback(() => {
    if (!loading) {
      setRating(0)
      setComment('')
      setSuccess(false)
      onClose()
    }
  }, [loading, onClose])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={s.backdrop} onPress={handleClose}>
        <Pressable style={[s.card, { backgroundColor: colors.card }]} onPress={() => {}}>
          {/* Header */}
          <View style={s.header}>
            <Text style={[s.title, { color: colors.foreground }]}>{t('profile.writeReview')}</Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <X size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {success ? (
            <View style={s.successContainer}>
              <Star size={48} color={colors.pro} fill={colors.pro} />
              <Text style={[s.successText, { color: colors.foreground }]}>{t('profile.reviewSubmitted')}</Text>
            </View>
          ) : (
            <>
              {/* Star rating */}
              <Text style={[s.label, { color: colors.mutedForeground }]}>{t('profile.rating')}</Text>
              <View style={s.starRow}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Pressable key={i} onPress={() => setRating(i)} hitSlop={4}>
                    <Star
                      size={36}
                      color={i <= rating ? colors.pro : colors.border}
                      fill={i <= rating ? colors.pro : 'transparent'}
                    />
                  </Pressable>
                ))}
              </View>

              {/* Comment */}
              <Text style={[s.label, { color: colors.mutedForeground }]}>{t('profile.reviewComment')}</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                value={comment}
                onChangeText={(text) => setComment(text.slice(0, 500))}
                placeholder={t('profile.reviewPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <Text style={[s.charCount, { color: colors.mutedForeground }]}>{comment.length}/500</Text>

              {/* Submit */}
              <Pressable
                onPress={handleSubmit}
                disabled={loading || rating === 0}
                style={[s.submitBtn, { backgroundColor: colors.primary, opacity: loading || rating === 0 ? 0.5 : 1 }]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={s.submitText}>{t('profile.submitReview')}</Text>
                )}
              </Pressable>
            </>
          )}
        </Pressable>
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
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  starRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 100,
  },
  charCount: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: -8,
  },
  submitBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  submitText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  successContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 24,
  },
  successText: {
    fontSize: 16,
    fontWeight: '600',
  },
})
