import { memo, useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator,
} from 'react-native'
import { Image } from 'expo-image'
import { Heart, MessageCircle, Pencil, Trash2, Flag } from 'lucide-react-native'
import { PressableOpacity, KEYBOARD_DONE_ID } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { Avatar } from '@/components/Avatar'
import { formatTimeAgo } from '@/lib/format'
import { getImageUrl } from '@/lib/imageUtils'

// ── Types ──
export interface GroupPostUser {
  id: string
  name: string | null
  avatar_url: string | null
}

export interface GroupPost {
  id: string
  group_id: string
  user_id: string
  content: string
  image_url: string | null
  like_count: number
  comment_count: number
  created_at: string
  user?: GroupPostUser | null
}

export interface GroupComment {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  user?: GroupPostUser | null
}

interface GroupPostCardProps {
  post: GroupPost
  currentUserId: string | null
  isAdmin: boolean
  isLiked: boolean
  isExpanded: boolean
  catColor: string
  onLike: (postId: string) => void
  onDelete: (postId: string) => void
  onEdit: (postId: string, content: string) => void
  onToggleComments: (postId: string) => void
  onReport?: (postId: string) => void
  onUserPress?: (userId: string) => void
  // Inline edit state (managed by parent)
  editingPostId: string | null
  editPostContent: string
  onEditContentChange: (text: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  savingPostEdit: boolean
  // Comments section (rendered as children or via props)
  children?: React.ReactNode
}

function GroupPostCardInner({
  post,
  currentUserId,
  isLiked,
  isExpanded,
  catColor,
  onLike,
  onDelete,
  onEdit,
  onToggleComments,
  onReport,
  onUserPress,
  editingPostId,
  editPostContent,
  onEditContentChange,
  onSaveEdit,
  onCancelEdit,
  savingPostEdit,
  children,
}: GroupPostCardProps) {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const isEditing = editingPostId === post.id

  return (
    <View style={[styles.postCard, { backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
      <View style={[styles.categoryBar, { backgroundColor: catColor }]} />
      <View style={styles.postBody}>
        {/* User row */}
        <View style={styles.postUserRow}>
          <Pressable
            onPress={() => { if (post.user?.id && onUserPress) onUserPress(post.user.id) }}
            disabled={!onUserPress || !post.user?.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
          >
            <Avatar url={post.user?.avatar_url} name={post.user?.name} size={36} />
            <View style={styles.postUserInfo}>
              <Text style={[styles.postUserName, { color: colors.foreground }]} numberOfLines={1}>
                {post.user?.name || t('common.user')}
              </Text>
              <Text style={[styles.postTime, { color: colors.mutedForeground }]}>
                {formatTimeAgo(post.created_at, t, locale)}
              </Text>
            </View>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {post.user_id === currentUserId && (
              <>
                <Pressable
                  onPress={() => onEdit(post.id, post.content)}
                  hitSlop={8}
                  style={{ padding: 4 }}
                >
                  <Pencil size={16} color={colors.foreground} strokeWidth={1.8} />
                </Pressable>
                <Pressable
                  onPress={() => onDelete(post.id)}
                  hitSlop={8}
                  style={{ padding: 4 }}
                >
                  <Trash2 size={16} color={colors.destructive} strokeWidth={1.8} />
                </Pressable>
              </>
            )}
            {post.user_id !== currentUserId && currentUserId && onReport && (
              <Pressable
                onPress={() => onReport(post.id)}
                hitSlop={8}
                style={{ padding: 4 }}
                accessibilityLabel={t('report.title')}
              >
                <Flag size={16} color={colors.mutedForeground} strokeWidth={1.8} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Content (inline edit or read-only) */}
        {isEditing ? (
          <View style={{ gap: 8 }}>
            <TextInput
              style={[styles.editInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
              value={editPostContent}
              onChangeText={onEditContentChange}
              multiline
              textAlignVertical="top"
              maxLength={2000}
              autoFocus
              inputAccessoryViewID={KEYBOARD_DONE_ID}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={onSaveEdit}
                disabled={savingPostEdit || !editPostContent.trim()}
                style={[styles.saveBtn, { backgroundColor: colors.foreground, flex: 1, opacity: (savingPostEdit || !editPostContent.trim()) ? 0.6 : 1, paddingVertical: 8 }]}
              >
                {savingPostEdit ? (
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={{ color: colors.primaryForeground, fontSize: 13, fontFamily: fonts.bodySemi, textAlign: 'center' }}>
                    {t('groups.saveEdit')}
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={onCancelEdit}
                style={[styles.saveBtn, { backgroundColor: colors.muted, flex: 1, paddingVertical: 8 }]}
              >
                <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: fonts.bodySemi, textAlign: 'center' }}>
                  {t('groups.cancelEdit')}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={[styles.postContent, { color: colors.foreground }]} numberOfLines={8}>
            {post.content}
          </Text>
        )}

        {/* Image */}
        {post.image_url && (
          <Image
            source={{ uri: getImageUrl(post.image_url, 'medium')! }}
            style={styles.postImage}
            contentFit="cover"
          />
        )}

        {/* Actions */}
        <View style={styles.postActions}>
          <PressableOpacity style={styles.actionBtn} onPress={() => onLike(post.id)}>
            <Heart
              size={18}
              color={isLiked ? colors.destructive : colors.mutedForeground}
              fill={isLiked ? colors.destructive : 'transparent'}
              strokeWidth={1.8}
            />
            <Text style={[styles.actionText, { color: isLiked ? colors.destructive : colors.mutedForeground }]}>
              {post.like_count || 0}
            </Text>
          </PressableOpacity>
          <PressableOpacity style={styles.actionBtn} onPress={() => onToggleComments(post.id)}>
            <MessageCircle
              size={18}
              color={isExpanded ? colors.foreground : colors.mutedForeground}
              strokeWidth={1.8}
            />
            <Text style={[styles.actionText, { color: isExpanded ? colors.foreground : colors.mutedForeground }]}>
              {post.comment_count || 0}
            </Text>
          </PressableOpacity>
        </View>

        {/* Comments section (passed as children) */}
        {children}
      </View>
    </View>
  )
}

export const GroupPostCard = memo(GroupPostCardInner)

const styles = StyleSheet.create({
  postCard: {
    borderRadius: 20,
    marginBottom: 12,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  categoryBar: {
    width: 4,
  },
  postBody: {
    flex: 1,
    padding: 16,
    gap: 8,
  },
  postUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  postUserInfo: {
    flex: 1,
  },
  postUserName: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    lineHeight: 17,
  },
  postTime: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 14,
    marginTop: 1,
  },
  postContent: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    marginBottom: 8,
  },
  postImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  postActions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    lineHeight: 17,
  },
  editInput: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  saveBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 4,
  },
})
