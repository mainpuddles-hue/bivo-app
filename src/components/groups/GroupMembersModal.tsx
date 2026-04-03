import { memo } from 'react'
import {
  View, Text, StyleSheet, Pressable, Modal, FlatList, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, Shield } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { Avatar } from '@/components/Avatar'

// ── Types ──
export interface GroupMember {
  id: string
  user_id: string
  role: 'admin' | 'member'
  user?: {
    id: string
    name: string | null
    avatar_url: string | null
  } | null
}

interface GroupMembersModalProps {
  visible: boolean
  onClose: () => void
  members: GroupMember[]
  memberCount: number
  isAdmin: boolean
  currentUserId: string | null
  onRemoveMember: (member: GroupMember) => void
  loading: boolean
}

function GroupMembersModalInner({
  visible,
  onClose,
  members,
  memberCount,
  isAdmin,
  currentUserId,
  onRemoveMember,
  loading,
}: GroupMembersModalProps) {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={[styles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={onClose}>
        <View style={[styles.modalContent, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {memberCount || 0} {t('groups.members')}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={22} color={colors.mutedForeground} strokeWidth={1.8} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={members}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.memberRow}>
                  <Avatar url={item.user?.avatar_url} name={item.user?.name} size={36} />
                  <Text style={[styles.memberName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.user?.name || t('common.user')}
                  </Text>
                  <View style={[styles.roleBadge, {
                    backgroundColor: item.role === 'admin' ? colors.primary + '20' : colors.muted,
                  }]}>
                    {item.role === 'admin' && <Shield size={12} color={colors.primary} strokeWidth={1.8} />}
                    <Text style={[styles.roleText, {
                      color: item.role === 'admin' ? colors.primary : colors.mutedForeground,
                    }]}>
                      {item.role === 'admin' ? t('groups.admin') : t('groups.member')}
                    </Text>
                  </View>
                  {isAdmin && item.role !== 'admin' && item.user_id !== currentUserId && (
                    <Pressable onPress={() => onRemoveMember(item)} hitSlop={8} style={{ marginLeft: 8 }}>
                      <X size={16} color={colors.destructive} strokeWidth={1.8} />
                    </Pressable>
                  )}
                </View>
              )}
            />
          )}
        </View>
      </Pressable>
    </Modal>
  )
}

export const GroupMembersModal = memo(GroupMembersModalInner)

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 12,
  },
  memberName: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    lineHeight: 20,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    lineHeight: 14,
  },
})
