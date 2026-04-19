import { memo, useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, Pressable, Modal, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, Trash2 } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { KeyboardDoneAccessory, KEYBOARD_DONE_ID } from '@/components/ui'

interface GroupEditModalProps {
  visible: boolean
  onClose: () => void
  group: { name: string; description: string | null; neighborhood: string | null; is_public: boolean }
  onSave: (data: { name: string; description: string; neighborhood: string | null; is_public: boolean }) => void
  onDelete: () => void
  saving: boolean
}

function GroupEditModalInner({
  visible,
  onClose,
  group,
  onSave,
  onDelete,
  saving,
}: GroupEditModalProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()

  const [editName, setEditName] = useState(group.name)
  const [editDescription, setEditDescription] = useState(group.description ?? '')
  const [editNeighborhood, setEditNeighborhood] = useState(group.neighborhood ?? '')
  const [editIsPublic, setEditIsPublic] = useState(group.is_public)

  // Sync local state when group prop changes or modal opens
  useEffect(() => {
    if (visible) {
      setEditName(group.name)
      setEditDescription(group.description ?? '')
      setEditNeighborhood(group.neighborhood ?? '')
      setEditIsPublic(group.is_public)
    }
  }, [visible, group])

  const handleSave = () => {
    if (!editName.trim()) return
    onSave({
      name: editName.trim(),
      description: editDescription.trim(),
      neighborhood: editNeighborhood.trim() || null,
      is_public: editIsPublic,
    })
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalContent, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {t('groups.editGroup')}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={22} color={colors.mutedForeground} strokeWidth={1.8} />
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            <TextInput
              style={[styles.editInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
              placeholder={t('groups.name')}
              placeholderTextColor={colors.mutedForeground}
              value={editName}
              onChangeText={setEditName}
              maxLength={100}
            />
            <TextInput
              style={[styles.editInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border, minHeight: 80 }]}
              placeholder={t('groups.description')}
              placeholderTextColor={colors.mutedForeground}
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
              textAlignVertical="top"
              maxLength={500}
              inputAccessoryViewID={KEYBOARD_DONE_ID}
            />
            <TextInput
              style={[styles.editInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
              placeholder={t('groups.neighborhood')}
              placeholderTextColor={colors.mutedForeground}
              value={editNeighborhood}
              onChangeText={setEditNeighborhood}
              maxLength={100}
            />

            {/* Public/Private toggle */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => setEditIsPublic(true)}
                style={[styles.toggleChip, { backgroundColor: editIsPublic ? colors.foreground : colors.muted }]}
              >
                <Text style={{ color: editIsPublic ? colors.primaryForeground : colors.mutedForeground, fontSize: 13, fontFamily: fonts.bodySemi }}>
                  {t('groups.public')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setEditIsPublic(false)}
                style={[styles.toggleChip, { backgroundColor: !editIsPublic ? colors.foreground : colors.muted }]}
              >
                <Text style={{ color: !editIsPublic ? colors.primaryForeground : colors.mutedForeground, fontSize: 13, fontFamily: fonts.bodySemi }}>
                  {t('groups.private')}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleSave}
              disabled={saving || !editName.trim()}
              style={[styles.saveBtn, { backgroundColor: colors.foreground, opacity: (saving || !editName.trim()) ? 0.6 : 1 }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={{ color: colors.primaryForeground, fontSize: 14, fontFamily: fonts.bodySemi }}>
                  {t('groups.saveChanges')}
                </Text>
              )}
            </Pressable>

            {/* Delete group button */}
            <Pressable
              onPress={onDelete}
              style={[styles.deleteGroupBtn, { borderColor: colors.destructive }]}
            >
              <Trash2 size={16} color={colors.destructive} strokeWidth={1.8} />
              <Text style={{ color: colors.destructive, fontSize: 14, fontFamily: fonts.bodySemi }}>
                {t('groups.deleteGroup')}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
      <KeyboardDoneAccessory />
    </Modal>
  )
}

export const GroupEditModal = memo(GroupEditModalInner)

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 16,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: fonts.heading,
    lineHeight: 23,
  },
  editInput: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toggleChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  saveBtn: {
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    marginTop: 4,
  },
  deleteGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
  },
})
