declare const __DEV__: boolean

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { uriToArrayBuffer } from '@/lib/uploadHelpers'
import { getCachedUserId } from '@/lib/authCache'
import { safeBack } from '@/lib/navigation'
import { useToast } from '@/components/Toast'
import {
  ItemSnapshotCard,
  PhotoUploadGrid,
  PreReturnChecklist,
  StickyCTA,
  type ChecklistItem,
  type PhotoSlot,
} from '@/components/lending'

// Shape of the booking row this screen needs to render.
interface ReturnTarget {
  id: string
  borrower_id: string
  end_date: string | null
  start_date: string | null
  post: {
    id: string
    title: string
    image_url: string | null
    pre_return_checklist?: ChecklistItem[] | null
  } | null
  lender: { id: string; name: string; avatar_url: string | null } | null
  return_record?: { checks?: Record<string, boolean> } | null
}

function ReturnItemScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()
  const params = useLocalSearchParams<{ bookingId: string }>()

  const [target, setTarget] = useState<ReturnTarget | null>(null)
  const [loading, setLoading] = useState(true)
  const [photos, setPhotos] = useState<PhotoSlot[]>([])
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Load the booking + linked post once. The post's pre_return_checklist
  // drives the checklist UI; absence (empty array / null) hides step 2 per
  // the design handoff.
  useEffect(() => {
    if (!params.bookingId) return
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('rental_bookings')
          .select(`
            id, borrower_id, start_date, end_date, return_record,
            post:posts!rental_bookings_post_id_fkey(id, title, image_url, pre_return_checklist),
            lender:profiles!rental_bookings_lender_id_fkey(id, name, avatar_url)
          `)
          .eq('id', params.bookingId)
          .maybeSingle()
        if (!mounted) return
        if (error || !data) {
          if (__DEV__) console.warn('[return-item] load failed:', error?.message)
          toast.show({ message: t('common.error') ?? 'Error', type: 'error' })
          return
        }
        const tgt = data as unknown as ReturnTarget
        setTarget(tgt)
        setChecks(tgt.return_record?.checks ?? {})
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [params.bookingId, supabase, t, toast])

  // Required checks must all be true; optional checks don't block submit.
  const requiredKeys = useMemo(() => {
    return (target?.post?.pre_return_checklist ?? [])
      .filter(item => !item.optional)
      .map(item => item.key)
  }, [target?.post?.pre_return_checklist])

  const allRequiredChecked = useMemo(
    () => requiredKeys.every(k => !!checks[k]),
    [requiredKeys, checks],
  )

  const uploadedPhotos = useMemo(
    () => photos.filter(p => p.state === 'uploaded'),
    [photos],
  )

  const canSubmit = uploadedPhotos.length > 0 && allRequiredChecked && !submitting

  // Picking + uploading is async. We optimistically push an 'uploading' slot,
  // then swap it for an 'uploaded' or 'failed' slot when the upload settles.
  const handlePick = useCallback(async (localUri: string) => {
    const userId = await getCachedUserId()
    if (!userId) { router.replace('/(auth)/login'); return }
    if (!params.bookingId) return

    setPhotos(prev => [...prev, { state: 'uploading', localUri }])

    try {
      const buf = await uriToArrayBuffer(localUri)
      const rawExt = localUri.split('.').pop()?.toLowerCase() || 'jpg'
      const ext = ['jpg', 'jpeg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg'
      const path = `${userId}/returns/${params.bookingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(path, buf, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: false })

      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path)

      setPhotos(prev => prev.map(p =>
        p.state === 'uploading' && p.localUri === localUri
          ? { state: 'uploaded' as const, localUri, remoteUrl: urlData.publicUrl }
          : p,
      ))
    } catch (e) {
      if (__DEV__) console.warn('[return-item] upload failed:', (e as Error)?.message ?? e)
      setPhotos(prev => prev.map(p =>
        p.state === 'uploading' && p.localUri === localUri
          ? { state: 'failed' as const, localUri }
          : p,
      ))
    }
  }, [params.bookingId, router, supabase])

  const handleRetry = useCallback((localUri: string) => {
    setPhotos(prev => prev.filter(p => !(p.state === 'failed' && p.localUri === localUri)))
    handlePick(localUri).catch(() => {})
  }, [handlePick])

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !target) return
    setSubmitting(true)
    try {
      const remoteUrls = uploadedPhotos
        .map(p => (p.state === 'uploaded' ? p.remoteUrl : null))
        .filter((u): u is string => !!u)

      const returnRecord = {
        photos: remoteUrls,
        checks,
        note: note.trim() || undefined,
        submitted_at: new Date().toISOString(),
      }

      const { error } = await (supabase.from('rental_bookings') as any)
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          return_record: returnRecord,
        })
        .eq('id', target.id)
      if (error) throw error

      toast.show({ message: t('returnItem.returnConfirmed') ?? 'Palautus vahvistettu', type: 'success' })
      // Borrower's review of the lender comes next.
      router.replace({ pathname: '/review-lender', params: { bookingId: target.id } } as any)
    } catch (e) {
      if (__DEV__) console.warn('[return-item] submit failed:', (e as Error)?.message ?? e)
      toast.show({ message: t('common.error') ?? 'Tallennus epäonnistui', type: 'error' })
    } finally {
      setSubmitting(false)
    }
  }, [canSubmit, target, uploadedPhotos, checks, note, supabase, router, toast, t])

  const checklist = target?.post?.pre_return_checklist ?? []
  const lenderSubtitle = target?.lender?.name
    ? `${t('returnItem.toLender', { name: target.lender.name }) ?? `${target.lender.name}lle`}`
    : ''

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
          {t('returnItem.title') ?? 'Palautus'}
        </Text>
        <View style={s.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 110 }]}
          keyboardDismissMode="interactive"
        >
          {/* Item strip */}
          <ItemSnapshotCard
            thumbnail={target?.post?.image_url}
            title={target?.post?.title ?? '—'}
            subtitle={lenderSubtitle}
            eyebrow={t('returnItem.returningNow') ?? 'PALAUTETAAN NYT'}
            size="comfortable"
          />

          {/* Step 1 — photos */}
          <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
            1 · {t('returnItem.photoSection') ?? 'KUVA PALAUTUKSESTA'}
          </Text>
          <PhotoUploadGrid
            photos={photos}
            onPick={handlePick}
            onRetry={handleRetry}
            disabled={submitting}
          />

          {/* Step 2 — checklist (hidden when listing has no checklist) */}
          {checklist.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { color: colors.mutedForeground, marginTop: 22 }]}>
                2 · {t('returnItem.checklistSection') ?? 'TARKISTUSLISTA'}
              </Text>
              <PreReturnChecklist
                items={checklist}
                value={checks}
                onChange={setChecks}
                size="comfortable"
                disabled={submitting}
              />
            </>
          )}

          {/* Step 3 — optional note */}
          <Text style={[s.sectionLabel, { color: colors.mutedForeground, marginTop: 22 }]}>
            {checklist.length > 0 ? '3' : '2'} · {t('returnItem.messageSection') ?? 'VIESTI LAINANANTAJALLE'}{'  '}
            <Text style={[s.optionalTag, { color: colors.tertiaryForeground }]}>
              ({t('returnItem.optional') ?? 'valinnainen'})
            </Text>
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('returnItem.messagePlaceholder') ?? 'Kiitos, laite toimi hyvin…'}
            placeholderTextColor={colors.mutedForeground}
            multiline
            editable={!submitting}
            style={[
              s.noteInput,
              { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
            ]}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <StickyCTA
        label={t('returnItem.confirmReturn') ?? 'Vahvista palautus'}
        onPress={handleSubmit}
        disabled={!canSubmit || loading}
        loading={submitting}
        bottomInset={insets.bottom + 16}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  content: { paddingHorizontal: 16, gap: 16 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 6,
  },
  optionalTag: {
    textTransform: 'none',
    fontWeight: '400',
    fontFamily: fonts.body,
    letterSpacing: 0,
  },

  noteInput: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 19,
    minHeight: 64,
    textAlignVertical: 'top',
  },
})

export default function ReturnItemScreen() {
  return (
    <ScreenErrorBoundary screenName="ReturnItem">
      <ReturnItemScreenInner />
    </ScreenErrorBoundary>
  )
}
