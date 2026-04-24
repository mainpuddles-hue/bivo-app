import { memo } from 'react'
import {
  View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator,
} from 'react-native'
import { Send, X } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { KEYBOARD_DONE_ID } from '@/components/ui'
import { Avatar } from '@/components/Avatar'
import { formatTimeAgo } from '@/lib/format'
import type { GroupComment } from './GroupPostCard'

interface GroupCommentListProps {
  postId: string
  comments: GroupComment[]
  currentUserId: string | null
  loading: boolean
  commentText: string
  onCommentTextChange: (text: string) => void
  onAddComment: (postId: string) => void
  onDeleteComment: (comment: GroupComment) => void
  sendingComment: boolean
}

function GroupCommentListInner({
  postId,
  comments,
  currentUserId,
  loading,
  commentText,
  onCommentTextChange,
  onAddComment,
  onDeleteComment,
  sendingComment,
}: GroupCommentListProps) {
  const { colors } = useTheme()
  const { t, locale } = useI18n()

  return (
    <View style={[styles.commentsSection, { borderTopColor: colors.border }]}>
      {loading ? (
        <ActivityIndicator size="small" color={colors.foreground} style={{ marginVertical: 8 }} />
      ) : (
        comments.map((c) => (
          <View key={c.id} style={styles.commentRow}>
            <Avatar url={c.user?.avatar_url} name={c.user?.name} size={24} />
            <View style={styles.commentBody}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.commentUser, { color: colors.foreground }]}>
                  {c.user?.name || t('common.user')}
                </Text>
                {c.user_id === currentUserId && (
                  <Pressable
                    onPress={() => onDeleteComment(c)}
                    hitSlop={8}
                    style={{ padding: 2 }}
                  >
                    <X size={12} color={colors.destructive} strokeWidth={1.8} />
                  </Pressable>
                )}
              </View>
              <Text style={[styles.commentContent, { color: colors.foreground }]}>
                {c.content}
              </Text>
              <Text style={[styles.commentTime, { color: colors.mutedForeground }]}>
                {formatTimeAgo(c.created_at, t, locale)}
              </Text>
            </View>
          </View>
        ))
      )}

      {/* Comment input */}
      <View style={[styles.commentInputRow, { borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.commentInput, { color: colors.foreground, backgroundColor: colors.muted }]}
          placeholder={t('groups.writePost')}
          placeholderTextColor={colors.mutedForeground}
          value={commentText}
          onChangeText={onCommentTextChange}
          multiline
          inputAccessoryViewID={KEYBOARD_DONE_ID}
        />
        <Pressable
          style={[styles.commentSendBtn, { opacity: commentText.trim() ? 1 : 0.4 }]}
          onPress={() => onAddComment(postId)}
          disabled={sendingComment || !commentText.trim()}
        >
          {sendingComment ? (
            <ActivityIndicator size="small" color={colors.foreground} />
          ) : (
            <Send size={18} color={colors.foreground} strokeWidth={1.8} />
          )}
        </Pressable>
      </View>
    </View>
  )
}

export const GroupCommentList = memo(GroupCommentListInner)

const styles = StyleSheet.create({
  commentsSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  commentBody: {
    flex: 1,
  },
  commentUser: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 17,
  },
  commentContent: {
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 18,
    marginTop: 2,
  },
  commentTime: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 14,
    marginTop: 2,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.body,
    lineHeight: 17,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 80,
  },
  commentSendBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
