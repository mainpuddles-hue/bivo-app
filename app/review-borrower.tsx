declare const __DEV__: boolean

import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TextInput,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowLeft, Star, Check } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { Avatar } from '@/components/Avatar'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { getCachedUserId } from '@/lib/authCache'
import { useToast } from '@/components/Toast'

const TAGS_FI = [
  'Palautti ajoissa',
  'Hyvässä kunnossa',
  'Ystävällinen',
  'Kommunikoi selvästi',
  'Kokenut käyttäjä',
  'Lainaisin uudestaan',
]
const TAGS_EN = [
  'Returned on time',
  'Good condition',
  'Friendly',
  'Clear communication',
  'Experienced user',
  'Would lend again',
]

function ReviewBorrowerScreenInner() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const params = useLocalSearchParams<{
    bookingId: string
    userId: string
    userName: string
    userAvatar: string
    itemTitle: string
    dates: string
  }>()

  const toast = useToast()
  const tags = locale === 'fi' ? TAGS_FI : TAGS_EN
  const [rating, setRating] = useState(5)
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    if (submitting || rating === 0) return
    setSubmitting(true)
    try {
      const reviewerId = await getCachedUserId()
      if (!reviewerId) { router.replace('/(auth)/login'); return }

      const { error: reviewError } = await (supabase.from('reviews') as any).insert({
        reviewer_id: reviewerId,
        reviewed_id: params.userId,
        booking_id: params.bookingId || null,
        rating,
        comment: comment.trim() || null,
        tags: Array.from(selectedTags),
      })
      if (reviewError) throw reviewError

      toast.show({ message: t('reviewBorrower.reviewPublished'), type: 'success' })
      router.back()
    } catch (err) {
      if (__DEV__) console.warn('[review-borrower] submit failed:', err)
      toast.show({ message: t('common.error'), type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }, [submitting, rating, comment, selectedTags, params, router, supabase, t, toast])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={[s.backCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={13} color={colors.foreground} />
        </PressableOpacity>
        <View style={s.headerTitleWrap}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>
            {t('reviewBorrower.title')}
          </Text>
        </View>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
      >
        {/* Avatar + question */}
        <View style={s.heroSection}>
          <View style={[s.avatarShadow, { shadowColor: '#000' }]}>
            <Avatar
              url={params.userAvatar}
              name={params.userName}
              size={72}
            />
          </View>
          <Text style={[s.heroTitle, { color: colors.foreground }]} accessibilityRole="header">
            {t('reviewBorrower.heroQuestion', { name: params.userName || t('rental.borrower') })}
          </Text>
          <Text style={[s.heroMeta, { color: colors.mutedForeground }]}>
            {params.itemTitle}{params.dates ? ` · ${params.dates}` : ''}
          </Text>
        </View>

        {/* Star rating */}
        <View style={[s.starsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[s.starsLabel, { color: colors.mutedForeground }]}>
            {t('reviewBorrower.overallRating')}
          </Text>
          <View style={s.starsRow}>
            {[1, 2, 3, 4, 5].map(n => (
              <PressableOpacity
                key={n}
                onPress={() => setRating(n)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${n} ${t('reviewBorrower.stars')}`}
                style={s.starBtn}
              >
                <Star
                  size={30}
                  color={colors.foreground}
                  fill={n <= rating ? colors.foreground : 'none'}
                  strokeWidth={1.5}
                />
              </PressableOpacity>
            ))}
          </View>
          <Text style={[s.starsHint, { color: colors.mutedForeground }]}>
            {rating === 5 ? t('reviewBorrower.ratingExcellent')
              : rating === 4 ? t('reviewBorrower.ratingGood')
              : rating === 3 ? t('reviewBorrower.ratingOk')
              : rating === 2 ? t('reviewBorrower.ratingPoor')
              : t('reviewBorrower.ratingBad')}
          </Text>
        </View>

        {/* Tags */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
          {t('reviewBorrower.whatWentWell')}
        </Text>
        <View style={s.tagsWrap}>
          {tags.map(tag => {
            const sel = selectedTags.has(tag)
            return (
              <PressableOpacity
                key={tag}
                onPress={() => toggleTag(tag)}
                style={[
                  s.tag,
                  sel
                    ? { backgroundColor: colors.foreground }
                    : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: sel }}
              >
                {sel && <Check size={10} color={colors.primaryForeground} strokeWidth={3} />}
                <Text style={[s.tagText, { color: sel ? colors.primaryForeground : colors.foreground }]}>{tag}</Text>
              </PressableOpacity>
            )
          })}
        </View>

        {/* Comment */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
          {t('reviewBorrower.publicComment')}{' '}
          <Text style={[s.optionalTag, { color: colors.tertiaryForeground }]}>
            ({t('returnItem.optional')})
          </Text>
        </Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder={t('reviewBorrower.commentPlaceholder')}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={t('reviewBorrower.commentPlaceholder')}
          multiline
          style={[s.commentInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
        />

        <Text style={[s.footerNote, { color: colors.mutedForeground }]}>
          {t('reviewBorrower.footerNote', { name: params.userName || t('rental.borrower') })}
        </Text>
      </ScrollView>

      {/* CTA */}
      <View style={[s.ctaWrap, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <PressableOpacity
          onPress={handleSubmit}
          disabled={submitting || rating === 0}
          style={[s.ctaBtn, { backgroundColor: colors.foreground, opacity: (submitting || rating === 0) ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={t('reviewBorrower.publishReview')}
          accessibilityState={{ disabled: submitting || rating === 0 }}
        >
          <Text style={[s.ctaBtnText, { color: colors.primaryForeground }]}>
            {submitting
              ? t('reviewBorrower.publishing')
              : t('reviewBorrower.publishReview')}
          </Text>
        </PressableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12, gap: 12,
  },
  backCircle: {
    width: 36, height: 36, borderRadius: 999, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, letterSpacing: -0.15 },
  headerSpacer: { width: 36, height: 36 },

  content: { paddingHorizontal: 16 },

  /* Hero */
  heroSection: { alignItems: 'center', gap: 10, paddingVertical: 8, marginBottom: 20 },
  avatarShadow: {
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 4,
  },
  heroTitle: {
    fontSize: 22, fontWeight: '600', fontFamily: fonts.heading,
    letterSpacing: -0.4, lineHeight: 26, textAlign: 'center',
  },
  heroMeta: { fontSize: 12, fontFamily: fonts.body, textAlign: 'center' },

  /* Stars */
  starsCard: {
    borderRadius: 14, borderWidth: 1, padding: 18,
    alignItems: 'center', marginBottom: 16,
  },
  starsLabel: {
    fontSize: 10.5, fontWeight: '600', fontFamily: fonts.bodySemi,
    letterSpacing: 1, marginBottom: 12,
  },
  starsRow: { flexDirection: 'row', gap: 6 },
  starBtn: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
  starsHint: { fontSize: 12, fontFamily: fonts.body, marginTop: 10 },

  /* Section */
  sectionLabel: {
    fontSize: 10.5, fontWeight: '600', fontFamily: fonts.bodySemi,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
  },
  optionalTag: { textTransform: 'none', fontWeight: '400', letterSpacing: 0 },

  /* Tags */
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 22 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 999, minHeight: 44,
  },
  tagText: { fontSize: 11.5, fontWeight: '500', fontFamily: fonts.bodyMedium },

  /* Comment */
  commentInput: {
    borderRadius: 14, borderWidth: 1, padding: 14,
    fontSize: 13, fontFamily: fonts.body, lineHeight: 19,
    minHeight: 76, textAlignVertical: 'top', marginBottom: 10,
  },
  footerNote: { fontSize: 11, fontFamily: fonts.body, lineHeight: 16 },

  /* CTA */
  ctaWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 14, borderTopWidth: 1,
  },
  ctaBtn: {
    borderRadius: 999, height: 56,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },
})

export default function ReviewBorrowerScreen() {
  return (
    <ScreenErrorBoundary screenName="ReviewBorrower">
      <ReviewBorrowerScreenInner />
    </ScreenErrorBoundary>
  )
}
