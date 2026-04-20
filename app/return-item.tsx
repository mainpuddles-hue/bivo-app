declare const __DEV__: boolean

import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, Alert, TextInput,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import {
  ArrowLeft, Camera, Check, Plus, Info,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { FEATURES } from '@/lib/featureFlags'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity } from '@/components/ui'
import { getImageUrl } from '@/lib/imageUtils'
import { getCachedUserId } from '@/lib/authCache'

interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

function ReturnItemScreenInner() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const params = useLocalSearchParams<{
    bookingId: string
    itemTitle: string
    itemImage: string
    ownerName: string
    days: string
  }>()

  const [photos, setPhotos] = useState<string[]>([])
  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    { id: '1', label: locale === 'fi' ? 'Puhdistettu ja siisti' : 'Cleaned and tidy', done: false },
    { id: '2', label: locale === 'fi' ? 'Kaikki osat mukana' : 'All parts included', done: false },
    { id: '3', label: locale === 'fi' ? 'Toimii normaalisti' : 'Works normally', done: false },
    { id: '4', label: locale === 'fi' ? 'Laukku/pakkaus suljettu' : 'Bag/packaging closed', done: false },
  ])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const allChecked = checklist.every(c => c.done)
  const hasPhotos = photos.length > 0

  const toggleCheck = useCallback((id: string) => {
    setChecklist(prev => prev.map(c => c.id === id ? { ...c, done: !c.done } : c))
  }, [])

  const pickPhoto = useCallback(async () => {
    if (photos.length >= 3) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 3 - photos.length,
    })
    if (!result.canceled && result.assets.length > 0) {
      setPhotos(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 3))
    }
  }, [photos.length])

  const handleSubmit = useCallback(async () => {
    if (submitting) return
    if (!hasPhotos) {
      Alert.alert(
        locale === 'fi' ? 'Kuva vaaditaan' : 'Photo required',
        locale === 'fi' ? 'Ota vähintään yksi kuva palautuksesta.' : 'Take at least one return photo.',
      )
      return
    }

    setSubmitting(true)
    try {
      const userId = await getCachedUserId()
      if (!userId) { router.replace('/(auth)/login'); return }

      // Upload return photos
      const uploadedUrls: string[] = []
      for (const uri of photos) {
        const resp = await fetch(uri)
        const blob = await resp.blob()
        const buf = await new Response(blob).arrayBuffer()
        const ext = uri.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `returns/${params.bookingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('post-images')
          .upload(path, buf, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`, upsert: false })

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(path)
          uploadedUrls.push(urlData.publicUrl)
        }
      }

      // Mark booking as returned
      await (supabase.from('bookings') as any).update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        return_notes: note || null,
        return_photos: uploadedUrls,
      }).eq('id', params.bookingId)

      Alert.alert(
        locale === 'fi' ? 'Palautus vahvistettu' : 'Return confirmed',
        locale === 'fi' ? 'Kiitos! Vakuus palautetaan 3 arkipäivän sisällä.' : 'Thanks! Deposit refunded within 3 business days.',
        [{ text: 'OK', onPress: () => router.back() }],
      )
    } catch (err) {
      if (__DEV__) console.warn('[return-item] submit failed:', err)
      Alert.alert(t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }, [submitting, hasPhotos, photos, params.bookingId, note, locale, router, supabase, t])

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
            {locale === 'fi' ? 'Palautus' : 'Return'}
          </Text>
        </View>
        <View style={s.headerSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 100 }]}
      >
        {/* Item strip */}
        <View style={[s.itemStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {params.itemImage ? (
            <Image
              source={{ uri: getImageUrl(params.itemImage, 'thumbnail') || undefined }}
              style={s.itemImage}
              contentFit="cover"
            />
          ) : (
            <View style={[s.itemImagePlaceholder, { backgroundColor: colors.muted }]} />
          )}
          <View style={s.itemInfo}>
            <Text style={[s.itemSubtitle, { color: colors.mutedForeground }]}>
              {locale === 'fi' ? 'Palautetaan nyt' : 'Returning now'}
            </Text>
            <Text style={[s.itemTitle, { color: colors.foreground }]} numberOfLines={1}>
              {params.itemTitle || '—'}
            </Text>
            <Text style={[s.itemMeta, { color: colors.mutedForeground }]}>
              {params.ownerName ? `${params.ownerName}lle` : ''}{params.days ? ` · ${params.days} ${locale === 'fi' ? 'päivää' : 'days'}` : ''}
            </Text>
          </View>
        </View>

        {/* Photo step */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
          1 · {locale === 'fi' ? 'Kuva palautuksesta' : 'Return photo'}
        </Text>
        <View style={s.photoRow}>
          {photos.map((uri, i) => (
            <View key={i} style={s.photoSlot}>
              <Image source={{ uri }} style={s.photoImage} contentFit="cover" />
              <View style={[s.photoCheck, { backgroundColor: colors.foreground }]}>
                <Check size={10} color="#fff" strokeWidth={3} />
              </View>
            </View>
          ))}
          {photos.length < 3 && (
            <PressableOpacity
              onPress={pickPhoto}
              style={[s.photoAddSlot, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={locale === 'fi' ? 'Lisää kuva' : 'Add photo'}
            >
              <Camera size={20} color={colors.foreground} strokeWidth={1.6} />
              <Text style={[s.photoAddText, { color: colors.mutedForeground }]}>
                {locale === 'fi' ? 'Lisää' : 'Add'}
              </Text>
            </PressableOpacity>
          )}
          {photos.length < 2 && <View style={s.photoSlot} />}
        </View>

        {/* Checklist */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
          2 · {locale === 'fi' ? 'Tarkistuslista' : 'Checklist'}
        </Text>
        <View style={[s.checklistCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {checklist.map((item, idx) => (
            <View key={item.id}>
              <PressableOpacity
                onPress={() => toggleCheck(item.id)}
                style={s.checkRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done }}
              >
                <View style={[
                  s.checkbox,
                  item.done
                    ? { backgroundColor: colors.foreground }
                    : { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
                ]}>
                  {item.done && <Check size={12} color="#fff" strokeWidth={3} />}
                </View>
                <Text style={[s.checkLabel, { color: colors.foreground }]}>{item.label}</Text>
              </PressableOpacity>
              {idx < checklist.length - 1 && (
                <View style={[s.divider, { backgroundColor: colors.border, marginLeft: 14 }]} />
              )}
            </View>
          ))}
        </View>

        {/* Note */}
        <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>
          3 · {locale === 'fi' ? 'Viesti' : 'Message'}{' '}
          <Text style={[s.optionalTag, { color: colors.tertiaryForeground }]}>
            ({locale === 'fi' ? 'valinnainen' : 'optional'})
          </Text>
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={locale === 'fi' ? 'Kiitos, laite toimi hyvin…' : 'Thanks, device worked great…'}
          placeholderTextColor={colors.mutedForeground}
          multiline
          style={[s.noteInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
        />
      </ScrollView>

      {/* CTA */}
      <View style={[s.ctaWrap, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <PressableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={[s.ctaBtn, { backgroundColor: colors.foreground, opacity: submitting ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={locale === 'fi' ? 'Vahvista palautus' : 'Confirm return'}
        >
          <Text style={[s.ctaBtnText, { color: colors.primaryForeground }]}>
            {submitting
              ? (locale === 'fi' ? 'Lähetetään…' : 'Submitting…')
              : (locale === 'fi' ? 'Vahvista palautus' : 'Confirm return')}
          </Text>
        </PressableOpacity>
      </View>
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
    width: 36, height: 36, borderRadius: 999, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, letterSpacing: -0.15 },
  headerSpacer: { width: 36, height: 36 },

  content: { paddingHorizontal: 16 },

  /* Item strip */
  itemStrip: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    borderRadius: 14, borderWidth: 1, padding: 10, marginBottom: 16,
  },
  itemImage: { width: 58, height: 58, borderRadius: 10 },
  itemImagePlaceholder: { width: 58, height: 58, borderRadius: 10 },
  itemInfo: { flex: 1 },
  itemSubtitle: { fontSize: 10.5, fontFamily: fonts.body, letterSpacing: 0.4, marginBottom: 2 },
  itemTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi, letterSpacing: -0.15 },
  itemMeta: { fontSize: 11.5, fontFamily: fonts.body, marginTop: 2 },

  /* Sections */
  sectionLabel: {
    fontSize: 10.5, fontWeight: '600', fontFamily: fonts.bodySemi,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10,
  },
  optionalTag: { textTransform: 'none', fontWeight: '400', letterSpacing: 0 },

  /* Photos */
  photoRow: { flexDirection: 'row', gap: 8, marginBottom: 22 },
  photoSlot: { flex: 1, aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%', borderRadius: 12 },
  photoCheck: {
    position: 'absolute', top: 6, right: 6,
    width: 22, height: 22, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  photoAddSlot: {
    flex: 1, aspectRatio: 1, borderRadius: 12,
    borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  photoAddText: { fontSize: 10.5, fontWeight: '600', fontFamily: fonts.bodySemi },

  /* Checklist */
  checklistCard: { borderRadius: 14, borderWidth: 1, marginBottom: 22 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, paddingHorizontal: 14 },
  checkbox: {
    width: 22, height: 22, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  checkLabel: { fontSize: 13, fontWeight: '500', fontFamily: fonts.bodyMedium, flex: 1 },
  divider: { height: 1 },

  /* Note */
  noteInput: {
    borderRadius: 14, borderWidth: 1, padding: 14,
    fontSize: 12.5, fontFamily: fonts.body, minHeight: 64,
    textAlignVertical: 'top',
  },

  /* CTA */
  ctaWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 14,
    borderTopWidth: 1,
  },
  ctaBtn: {
    borderRadius: 999, height: 56,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },
})

export default function ReturnItemScreen() {
  return (
    <ScreenErrorBoundary screenName="ReturnItem">
      <ReturnItemScreenInner />
    </ScreenErrorBoundary>
  )
}
