import { useState } from 'react'
import { View, Text, StyleSheet, Modal, Alert, TextInput, ScrollView, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { AlertTriangle, X, ChevronRight } from 'lucide-react-native'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'

type DisputeReason = 'damage' | 'non_return' | 'other'

interface DisputeModalProps {
  visible: boolean
  onClose: () => void
  onSubmitted: () => void
  bookingId: string
  pickupPhotos: string[]
  returnPhotos: string[]
}

export function DisputeModal({
  visible, onClose, onSubmitted, bookingId, pickupPhotos, returnPhotos,
}: DisputeModalProps) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const supabase = useSupabase()
  const [reason, setReason] = useState<DisputeReason | null>(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reasons: { key: DisputeReason; label: string }[] = [
    { key: 'damage', label: t('rental.disputeDamage') },
    { key: 'non_return', label: t('rental.disputeNonReturn') },
    { key: 'other', label: t('rental.disputeOther') },
  ]

  async function handleSubmit() {
    if (!reason) return
    setSubmitting(true)
    try {
      await (supabase.from('rental_bookings') as any)
        .update({
          status: 'disputed',
          disputed_at: new Date().toISOString(),
          dispute_reason: reason === 'damage' ? 'damage_claim' : reason === 'non_return' ? 'non_return' : 'other',
          dispute_resolution: 'pending',
        })
        .eq('id', bookingId)

      // Notify admin via notifications table
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await (supabase.from('notifications') as any).insert({
          user_id: user.id,
          type: 'rental_dispute',
          title: t('rental.disputeSubmitted'),
          body: `${reason}: ${description.slice(0, 200)}`,
          link_type: 'booking',
          link_id: bookingId,
        })
      }

      Alert.alert(t('rental.disputeSubmitted'))
      onSubmitted()
    } catch (err) {
      Alert.alert(t('common.error'), String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <PressableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <X size={24} color={colors.foreground} />
          </PressableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('rental.disputeItem')}</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Photo comparison */}
          {(pickupPhotos.length > 0 || returnPhotos.length > 0) && (
            <View style={styles.photoSection}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('rental.comparePhotos')}</Text>
              <View style={styles.photoCompare}>
                <View style={styles.photoColumn}>
                  <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>{t('rental.handoffPhotos')}</Text>
                  {pickupPhotos.map((url, i) => (
                    <Image key={`pickup-${i}`} source={{ uri: url }} style={styles.comparePhoto} contentFit="cover" />
                  ))}
                  {pickupPhotos.length === 0 && (
                    <View style={[styles.noPhoto, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.noPhotoText, { color: colors.mutedForeground }]}>—</Text>
                    </View>
                  )}
                </View>
                <ChevronRight size={20} color={colors.mutedForeground} style={{ alignSelf: 'center' }} />
                <View style={styles.photoColumn}>
                  <Text style={[styles.photoLabel, { color: colors.mutedForeground }]}>{t('rental.returnPhotos')}</Text>
                  {returnPhotos.map((url, i) => (
                    <Image key={`return-${i}`} source={{ uri: url }} style={styles.comparePhoto} contentFit="cover" />
                  ))}
                  {returnPhotos.length === 0 && (
                    <View style={[styles.noPhoto, { backgroundColor: colors.muted }]}>
                      <Text style={[styles.noPhotoText, { color: colors.mutedForeground }]}>—</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Reason selection */}
          <View style={styles.reasonSection}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{t('rental.disputeReason')}</Text>
            {reasons.map(r => (
              <PressableOpacity
                key={r.key}
                onPress={() => setReason(r.key)}
                style={[
                  styles.reasonBtn,
                  { backgroundColor: reason === r.key ? `${colors.destructive}14` : colors.card },
                ]}
              >
                <AlertTriangle size={16} color={reason === r.key ? colors.destructive : colors.mutedForeground} />
                <Text style={[styles.reasonText, { color: reason === r.key ? colors.destructive : colors.foreground }]}>
                  {r.label}
                </Text>
              </PressableOpacity>
            ))}
          </View>

          {/* Description */}
          {reason && (
            <TextInput
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
              placeholder={t('rental.disputeDescriptionPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              multiline
              value={description}
              onChangeText={setDescription}
              maxLength={500}
            />
          )}
        </ScrollView>

        {/* Submit */}
        <View style={styles.footer}>
          <PressableOpacity
            onPress={handleSubmit}
            disabled={!reason || submitting}
            style={[styles.submitBtn, { backgroundColor: reason ? colors.destructive : colors.muted }]}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={[styles.submitText, { color: reason ? '#FFFFFF' : colors.mutedForeground }]}>
                {t('rental.disputeItem')}
              </Text>
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
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 24 },
  photoSection: { gap: 12 },
  sectionTitle: { fontSize: 16, fontFamily: fonts.headingSemi, lineHeight: 22 },
  photoCompare: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  photoColumn: { flex: 1, gap: 8 },
  photoLabel: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 16, textAlign: 'center' },
  comparePhoto: { width: '100%', height: 120, borderRadius: 8 },
  noPhoto: { height: 120, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  noPhotoText: { fontSize: 14 },
  reasonSection: { gap: 8 },
  reasonBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 16,
  },
  reasonText: { fontSize: 14, fontFamily: fonts.bodyMedium, lineHeight: 20 },
  input: {
    borderWidth: 1, borderRadius: 12, padding: 16,
    fontSize: 14, fontFamily: fonts.body, minHeight: 100,
    textAlignVertical: 'top',
  },
  footer: { paddingHorizontal: 16, paddingVertical: 16 },
  submitBtn: {
    height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  submitText: { fontSize: 16, fontFamily: fonts.bodySemi, lineHeight: 22 },
})
