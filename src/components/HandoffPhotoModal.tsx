import { useState } from 'react'
import { View, Text, StyleSheet, Modal, Alert, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { Camera, Check, X, Upload } from 'lucide-react-native'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'

interface HandoffPhotoModalProps {
  visible: boolean
  onClose: () => void
  onComplete: (photoUrls: string[]) => void
  bookingId: string
  phase: 'pickup' | 'return'
  role: 'lender' | 'borrower'
  itemTitle: string
}

const MAX_PHOTOS = 3
const MIN_PHOTOS = 1

export function HandoffPhotoModal({
  visible, onClose, onComplete, bookingId, phase, role, itemTitle,
}: HandoffPhotoModalProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const supabase = useSupabase()
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)

  const title = phase === 'pickup' ? t('rental.takeHandoffPhotos') : t('rental.takeReturnPhotos')

  async function pickPhoto() {
    if (photos.length >= MAX_PHOTOS) return
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
    })
    if (result.canceled || !result.assets?.[0]) return
    setPhotos(prev => [...prev, result.assets[0].uri])
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    if (photos.length < MIN_PHOTOS) {
      Alert.alert(t('rental.photoRequired'))
      return
    }

    setUploading(true)
    try {
      const uploadedUrls: string[] = []

      for (let i = 0; i < photos.length; i++) {
        const uri = photos[i]
        const ext = uri.split('.').pop() ?? 'jpg'
        const path = `booking-photos/${bookingId}/${phase}/${role}_${Date.now()}_${i}.${ext}`

        const formData = new FormData()
        formData.append('file', { uri, name: `photo.${ext}`, type: `image/${ext}` } as any)

        const { error } = await supabase.storage
          .from('booking-photos')
          .upload(path, formData, { contentType: `image/${ext}`, upsert: false })

        if (error) throw error

        const { data: urlData } = supabase.storage
          .from('booking-photos')
          .getPublicUrl(path)

        uploadedUrls.push(urlData.publicUrl)
      }

      // Save to booking_photos table
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      for (const url of uploadedUrls) {
        await (supabase.from('booking_photos') as any).insert({
          booking_id: bookingId,
          phase,
          uploaded_by: user.id,
          role,
          image_url: url,
        })
      }

      onComplete(uploadedUrls)
      setPhotos([])
    } catch (err) {
      Alert.alert(t('common.error'), String(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <PressableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <X size={24} color={colors.foreground} />
          </PressableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {phase === 'pickup' ? t('rental.handoffPhotos') : t('rental.returnPhotos')}
          </Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Camera size={32} color={colors.primary} />
          <Text style={[styles.instructionTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.instructionHint, { color: colors.mutedForeground }]}>
            {t('rental.photoRequired')}
          </Text>
          <Text style={[styles.itemName, { color: colors.foreground }]}>{itemTitle}</Text>
        </View>

        {/* Photo grid */}
        <View style={styles.photoGrid}>
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoWrap}>
              <Image source={{ uri }} style={styles.photo} contentFit="cover" />
              <PressableOpacity
                onPress={() => removePhoto(i)}
                style={[styles.removeBtn, { backgroundColor: colors.destructive }]}
              >
                <X size={14} color="#FFFFFF" />
              </PressableOpacity>
            </View>
          ))}
          {photos.length < MAX_PHOTOS && (
            <PressableOpacity
              onPress={pickPhoto}
              style={[styles.addPhoto, { backgroundColor: colors.muted, borderColor: colors.border }]}
            >
              <Camera size={24} color={colors.mutedForeground} />
              <Text style={[styles.addPhotoText, { color: colors.mutedForeground }]}>
                {photos.length === 0 ? t('rental.takePhotos') : `${photos.length}/${MAX_PHOTOS}`}
              </Text>
            </PressableOpacity>
          )}
        </View>

        {/* Submit */}
        <View style={styles.footer}>
          <PressableOpacity
            onPress={handleSubmit}
            disabled={uploading || photos.length < MIN_PHOTOS}
            style={[
              styles.submitBtn,
              { backgroundColor: photos.length >= MIN_PHOTOS ? colors.primary : colors.muted },
            ]}
          >
            {uploading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Upload size={18} color={photos.length >= MIN_PHOTOS ? colors.primaryForeground : colors.mutedForeground} />
                <Text style={[styles.submitText, { color: photos.length >= MIN_PHOTOS ? colors.primaryForeground : colors.mutedForeground }]}>
                  {t('rental.photoUploaded').replace('ladattu', 'lataa')} ({photos.length})
                </Text>
              </>
            )}
          </PressableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: fonts.heading, lineHeight: 22 },
  instructions: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 24, gap: 8 },
  instructionTitle: { fontSize: 16, fontFamily: fonts.headingSemi, textAlign: 'center', lineHeight: 22 },
  instructionHint: { fontSize: 14, fontFamily: fonts.body, textAlign: 'center', lineHeight: 20 },
  itemName: { fontSize: 14, fontFamily: fonts.bodySemi, textAlign: 'center', lineHeight: 20, marginTop: 4 },
  photoGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    paddingHorizontal: 16, paddingVertical: 16,
  },
  photoWrap: { width: 100, height: 100, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  photo: { width: 100, height: 100 },
  removeBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  addPhoto: {
    width: 100, height: 100, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addPhotoText: { fontSize: 11, fontFamily: fonts.bodyMedium },
  footer: { paddingHorizontal: 16, paddingVertical: 16, marginTop: 'auto' },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 52, borderRadius: 12,
  },
  submitText: { fontSize: 16, fontFamily: fonts.bodySemi, lineHeight: 22 },
})
