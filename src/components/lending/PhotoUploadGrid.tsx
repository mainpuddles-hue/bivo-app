declare const __DEV__: boolean

import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { Camera, Check, RefreshCw } from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'

export type PhotoSlot =
  | { state: 'empty' }
  | { state: 'uploading'; localUri: string }
  | { state: 'uploaded'; remoteUrl: string; localUri?: string }
  | { state: 'failed'; localUri: string; error?: string }

interface PhotoUploadGridProps {
  /** Total number of slots (filled + empty) to render. Default 3. */
  maxCount?: number
  /** Photos collected so far. Length must be ≤ maxCount. */
  photos: PhotoSlot[]
  /** Called when the user picks a new photo. The caller is responsible for
   *  uploading and updating photos via the next render. */
  onPick: (localUri: string) => void
  /** Called when the user re-taps a failed slot. */
  onRetry?: (localUri: string) => void
  /** Disable picking (e.g. while submitting). */
  disabled?: boolean
}

/**
 * 3-up 1:1 grid for return photos. Empty slots have a dashed border + camera
 * icon; the first empty slot has a "Lisää" label, the rest are unlabeled.
 * Filled slots show the image with a 22px ink check badge top-right.
 * Failed uploads show a destructive retry icon overlay.
 */
export function PhotoUploadGrid({
  maxCount = 3,
  photos,
  onPick,
  onRetry,
  disabled,
}: PhotoUploadGridProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const [picking, setPicking] = useState(false)

  const slots: (PhotoSlot | { state: 'placeholder' })[] = [
    ...photos,
    ...Array.from({ length: Math.max(0, maxCount - photos.length) }, () => ({ state: 'placeholder' as const })),
  ].slice(0, maxCount)

  // The first empty / placeholder slot is the only "Lisää"-labeled add slot;
  // the rest are silent placeholders so the row reads as 1 active button + N decorations.
  const firstAddIdx = slots.findIndex(s => s.state === 'placeholder')

  async function pick() {
    if (disabled || picking) return
    setPicking(true)
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        if (__DEV__) console.warn('[photo-grid] media-library permission denied')
        return
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      })
      if (res.canceled || !res.assets?.[0]) return
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
      onPick(res.assets[0].uri)
    } catch (e) {
      if (__DEV__) console.warn('[photo-grid] pick failed:', (e as Error)?.message ?? e)
    } finally {
      setPicking(false)
    }
  }

  return (
    <View style={styles.row}>
      {slots.map((slot, idx) => {
        const cellStyle = [styles.cell, { borderColor: colors.border, backgroundColor: colors.card }]
        const dashedStyle = { borderStyle: 'dashed' as const, borderWidth: 1.5 }

        if (slot.state === 'uploaded') {
          return (
            <View key={idx} style={[cellStyle, { borderColor: colors.card }]}>
              <Image
                source={{ uri: slot.localUri ?? slot.remoteUrl }}
                style={styles.img}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              <View style={[styles.check, { backgroundColor: colors.foreground }]}>
                <Check size={12} color={colors.primaryForeground} strokeWidth={2.5} />
              </View>
            </View>
          )
        }

        if (slot.state === 'uploading') {
          return (
            <View key={idx} style={[cellStyle, { borderColor: colors.card }]}>
              <Image
                source={{ uri: slot.localUri }}
                style={[styles.img, { opacity: 0.6 }]}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              </View>
            </View>
          )
        }

        if (slot.state === 'failed') {
          return (
            <PressableOpacity
              key={idx}
              onPress={() => onRetry?.(slot.localUri)}
              accessibilityRole="button"
              accessibilityLabel={t('common.retry') ?? 'Yritä uudelleen'}
              style={[cellStyle, { borderColor: colors.destructive, borderWidth: 1.5 }]}
            >
              <Image
                source={{ uri: slot.localUri }}
                style={[styles.img, { opacity: 0.4 }]}
                contentFit="cover"
              />
              <View style={[styles.failedOverlay, { backgroundColor: 'rgba(196,69,54,0.18)' }]}>
                <RefreshCw size={20} color={colors.destructive} strokeWidth={2} />
              </View>
            </PressableOpacity>
          )
        }

        // placeholder — empty slot
        const isAddSlot = idx === firstAddIdx
        return (
          <PressableOpacity
            key={idx}
            onPress={isAddSlot ? pick : undefined}
            disabled={!isAddSlot || picking || disabled}
            accessibilityRole={isAddSlot ? 'button' : undefined}
            accessibilityLabel={isAddSlot ? (t('returnItem.addPhoto') ?? 'Lisää kuva') : undefined}
            style={[cellStyle, dashedStyle]}
          >
            {isAddSlot && (
              <View style={styles.addInner}>
                <Camera size={20} color={colors.mutedForeground} strokeWidth={1.6} />
                <Text style={[styles.addLabel, { color: colors.mutedForeground }]}>
                  {t('returnItem.add') ?? 'Lisää'}
                </Text>
              </View>
            )}
          </PressableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26,29,31,0.4)',
  },
  failedOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addLabel: {
    fontSize: 11,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
  },
})
