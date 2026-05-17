declare const __DEV__: boolean

import { useCallback, useEffect, useState } from 'react'
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { Avatar } from '@/components/Avatar'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { getCachedUserId } from '@/lib/authCache'
import { safeBack } from '@/lib/navigation'
import { useToast } from '@/components/Toast'
import { StarRating, TagChipRow, StickyCTA } from '@/components/lending'

// Lender-side virtues, per design handoff §4.
const TAG_KEYS = ['fast_response', 'friendly', 'good_condition', 'clear_instr', 'flexible'] as const

interface BookingTarget {
  id: string
  borrower_id: string
  lender_id: string
  start_date: string | null
  end_date: string | null
  borrower_review_at: string | null
  post: { id: string; title: string } | null
  lender: { id: string; name: string; avatar_url: string | null } | null
}

function ReviewLenderScreenInner() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()
  const params = useLocalSearchParams<{ bookingId: string }>()

  const [target, setTarget] = useState<BookingTarget | null>(null)
  const [rating, setRating] = useState(5)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const tags = TAG_KEYS.map(key => ({
    key,
    label: t(`reviewLender.tag${key.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')}`),
  }))

  useEffect(() => {
    if (!params.bookingId) return
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('rental_bookings')
          .select(`
            id, borrower_id, lender_id, start_date, end_date, borrower_review_at,
            post:posts!rental_bookings_post_id_fkey(id, title),
            lender:profiles!rental_bookings_lender_id_fkey(id, name, avatar_url)
          `)
          .eq('id', params.bookingId)
          .maybeSingle()
        if (!mounted) return
        if (error || !data) {
          if (__DEV__) console.warn('[review-lender] load failed:', error?.message)
          toast.show({ message: t('common.error') ?? 'Error', type: 'error' })
          return
        }
        setTarget(data as unknown as BookingTarget)
      } catch (e) {
        if (__DEV__) console.warn('[review-lender] load threw:', (e as Error)?.message)
      }
    })()
    return () => { mounted = false }
  }, [params.bookingId, supabase, t, toast])

  const handleSubmit = useCallback(async () => {
    if (submitting || rating === 0 || !target?.lender) return
    setSubmitting(true)
    try {
      const reviewerId = await getCachedUserId()
      if (!reviewerId) { router.replace('/(auth)/login'); return }

      const { error: reviewError } = await (supabase.from('reviews') as any).insert({
        reviewer_id: reviewerId,
        reviewed_id: target.lender.id,
        booking_id: target.id,
        rating,
        comment: comment.trim() || null,
        tags: selectedTags,
      })
      if (reviewError) throw reviewError

      // Mark the booking so the lifecycle UI knows this side has reviewed.
      ;(supabase.from('rental_bookings') as any)
        .update({ borrower_review_at: new Date().toISOString() })
        .eq('id', target.id)
        .then(({ error }: { error: any }) => {
          if (error && __DEV__) console.warn('[review-lender] mark borrower_review_at failed:', error.message)
        })

      toast.show({ message: t('reviewLender.published') ?? 'Arvio lähetetty', type: 'success' })
      safeBack(router, '/bookings')
    } catch (e) {
      if (__DEV__) console.warn('[review-lender] submit failed:', (e as Error)?.message)
      toast.show({ message: t('common.error') ?? 'Tallennus epäonnistui', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }, [submitting, rating, target, comment, selectedTags, supabase, router, toast, t])

  const lenderName = target?.lender?.name ?? t('rental.lender') ?? 'Lainanantaja'
  const dateRange = target?.start_date && target?.end_date
    ? `${target.post?.title ?? ''}${target.post?.title ? ' · ' : ''}${formatRange(target.start_date, target.end_date, locale)}`
    : (target?.post?.title ?? '')

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <PressableOpacity
          onPress={() => safeBack(router, '/bookings')}
          hitSlop={12}
          style={[s.backCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel={t('common.back') ?? 'Takaisin'}
        >
          <ChevronLeft size={20} color={colors.foreground} strokeWidth={1.8} />
        </PressableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>
          {t('reviewLender.title') ?? 'Arvioi lainanantaja'}
        </Text>
        <View style={s.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 140 }]}
          keyboardDismissMode="interactive"
        >
          {/* Hero — plain sans (no serif) per handoff §4 */}
          <View style={s.hero}>
            <View style={[s.avatarShadow, { shadowColor: '#000' }]}>
              <Avatar url={target?.lender?.avatar_url} name={lenderName} size={72} />
            </View>
            <Text style={[s.heroTitle, { color: colors.foreground }]} accessibilityRole="header">
              {t('reviewLender.heroQuestion', { name: lenderName }) ?? `Miten ${lenderName} onnistui?`}
            </Text>
            <Text style={[s.heroMeta, { color: colors.mutedForeground }]}>
              {t('reviewLender.heroMeta') ?? 'Arvio auttaa muita naapureita ja pitää yhteisön reiluna.'}
            </Text>
          </View>

          {/* Stars row — standalone, not in a card, per handoff §4 */}
          <View style={s.starsRow}>
            <StarRating value={rating} onChange={setRating} size={34} gap={14} />
          </View>
          <Text style={[s.starsHint, { color: colors.mutedForeground }]}>
            {ratingWord(rating, t)}
          </Text>

          {/* Tags */}
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
            {t('reviewLender.whatWentWell') ?? 'MIKÄ TOIMI HYVIN'}
          </Text>
          <TagChipRow tags={tags} selected={selectedTags} onChange={setSelectedTags} />

          {/* Comment — single card per handoff §4 */}
          <Text style={[s.sectionLabel, { color: colors.mutedForeground, marginTop: 22 }]}>
            {t('reviewLender.publicComment') ?? 'JULKINEN KOMMENTTI'}{'  '}
            <Text style={[s.optionalTag, { color: colors.tertiaryForeground }]}>
              ({t('returnItem.optional') ?? 'valinnainen'})
            </Text>
          </Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder={t('reviewLender.commentPlaceholder') ?? 'Kerro lyhyesti, miten kokemus meni…'}
            placeholderTextColor={colors.mutedForeground}
            multiline
            editable={!submitting}
            style={[
              s.commentInput,
              { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
            ]}
          />

          <Text style={[s.footerNote, { color: colors.mutedForeground }]}>
            {t('reviewLender.footerNote', { name: lenderName }) ?? `Arvio näytetään ${lenderName}n profiilissa.`}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <StickyCTA
        label={t('reviewLender.send') ?? 'Lähetä arvio'}
        onPress={handleSubmit}
        disabled={rating === 0}
        loading={submitting}
        bottomInset={insets.bottom + 16}
      />
    </View>
  )
}

function ratingWord(rating: number, t: (k: string) => string): string {
  switch (rating) {
    case 5: return t('reviewBorrower.ratingExcellent') ?? 'Erinomainen'
    case 4: return t('reviewBorrower.ratingGood')      ?? 'Hyvä'
    case 3: return t('reviewBorrower.ratingOk')        ?? 'Ok'
    case 2: return t('reviewBorrower.ratingPoor')      ?? 'Heikko'
    default: return t('reviewBorrower.ratingBad')      ?? 'Erittäin heikko'
  }
}

function formatRange(start: string, end: string, locale: string): string {
  try {
    const sd = new Date(start)
    const ed = new Date(end)
    const fmt = new Intl.DateTimeFormat(
      locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB',
      { day: 'numeric', month: 'short' },
    )
    return `${fmt.format(sd)} – ${fmt.format(ed)}`
  } catch {
    return ''
  }
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingBottom: 12,
    gap: 12,
  },
  backCircle: {
    width: 38, height: 38, borderRadius: 999, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.15,
    textAlign: 'center',
  },
  headerSpacer: { width: 36, height: 36 },

  content: { paddingHorizontal: 22, gap: 4 },

  hero: { alignItems: 'center', gap: 10, paddingVertical: 14 },
  avatarShadow: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '600',
    fontFamily: fonts.heading,
    letterSpacing: -0.4,
    lineHeight: 26,
    textAlign: 'center',
  },
  heroMeta: {
    fontSize: 12.5,
    fontFamily: fonts.body,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: 8,
  },

  starsRow: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  starsHint: {
    fontSize: 12,
    fontFamily: fonts.body,
    textAlign: 'center',
    marginBottom: 18,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.88,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  optionalTag: {
    textTransform: 'none',
    fontWeight: '400',
    fontFamily: fonts.body,
    letterSpacing: 0,
  },

  commentInput: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 20,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  footerNote: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 15,
    marginTop: 10,
  },
})

export default function ReviewLenderScreen() {
  return (
    <ScreenErrorBoundary screenName="ReviewLender">
      <ReviewLenderScreenInner />
    </ScreenErrorBoundary>
  )
}
