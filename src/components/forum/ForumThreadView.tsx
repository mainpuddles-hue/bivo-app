import { memo } from 'react'
import {
  View, Text, StyleSheet, Pressable, FlatList, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, ChevronUp, MessageCircle, MapPin, Send, X } from 'lucide-react-native'
import { PressableOpacity, KeyboardDoneAccessory, KEYBOARD_DONE_ID } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { Avatar } from '@/components/Avatar'
import { formatTimeAgo } from '@/lib/format'
import type { ForumPost, ForumReply } from './ForumPostCard'
import { FORUM_CATEGORY_COLORS as CATEGORY_COLORS } from '@/lib/constants'

interface ForumThreadViewProps {
  post: ForumPost
  replies: ForumReply[]
  currentUserId: string | null
  votedPosts: Set<string>
  votedReplies: Set<string>
  onUpvotePost: (post: ForumPost) => void
  onUpvoteReply: (reply: ForumReply) => void
  onDeleteReply: (reply: ForumReply) => void
  onAddReply: (content: string) => void
  onClose: () => void
  loading: boolean
  replyText: string
  onReplyTextChange: (text: string) => void
  sendingReply: boolean
  replySortNewest?: boolean
  onToggleReplySort?: () => void
}

const ForumReplySeparator = () => <View style={{ height: 8 }} />

function ForumThreadViewInner({
  post,
  replies,
  currentUserId,
  votedPosts,
  votedReplies,
  onUpvotePost,
  onUpvoteReply,
  onDeleteReply,
  onAddReply,
  onClose,
  loading,
  replyText,
  onReplyTextChange,
  sendingReply,
  replySortNewest,
  onToggleReplySort,
}: ForumThreadViewProps) {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()

  const getCategoryColor = (category: string) => CATEGORY_COLORS[category] || colors.foreground

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'vinkit': return t('forum.tips')
      case 'kysymykset': return t('forum.questions')
      case 'tapahtumat': return t('forum.events')
      case 'uutiset': return t('forum.news')
      default: return category
    }
  }

  const renderReply = ({ item }: { item: ForumReply }) => {
    const isVoted = votedReplies.has(item.id)
    const user = item.user

    return (
      <View style={[styles.replyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardUserRow}>
          <Avatar url={user?.avatar_url} name={user?.name} size={28} />
          <View style={styles.cardUserInfo}>
            <Text style={[styles.replyUserName, { color: colors.foreground }]} numberOfLines={1}>
              {user?.name ?? t('common.user')}
            </Text>
            <Text style={[styles.cardMetaText, { color: colors.mutedForeground }]}>
              {formatTimeAgo(item.created_at, t, locale)}
            </Text>
          </View>
          {item.user_id === currentUserId && (
            <Pressable
              onPress={() => onDeleteReply(item)}
              hitSlop={8}
              style={{ padding: 4 }}
            >
              <X size={14} color={colors.destructive} strokeWidth={1.8} />
            </Pressable>
          )}
        </View>
        <Text style={[styles.replyContent, { color: colors.foreground }]}>
          {item.content}
        </Text>
        <Pressable
          onPress={() => onUpvoteReply(item)}
          style={[styles.actionBtn, isVoted && { backgroundColor: `${colors.foreground}14` }]}
          hitSlop={8}
        >
          <ChevronUp
            size={14}
            color={isVoted ? colors.foreground : colors.mutedForeground}
            strokeWidth={isVoted ? 2.5 : 1.8}
          />
          <Text style={[
            styles.actionText,
            { color: isVoted ? colors.foreground : colors.mutedForeground },
            isVoted && { fontFamily: fonts.bodySemi },
          ]}>
            {item.upvote_count}
          </Text>
        </Pressable>
      </View>
    )
  }

  const catColor = getCategoryColor(post.category)
  const isPostVoted = votedPosts.has(post.id)

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      style={[styles.modalContainer, { backgroundColor: colors.background }]}
    >
      {/* Detail header */}
      <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
        <Pressable onPress={onClose} hitSlop={8}>
          <ArrowLeft size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
          {post.title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Post content */}
      <FlatList
        data={replies}
        renderItem={renderReply}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.detailList}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.detailPostSection}>
            {/* Author */}
            <View style={styles.cardUserRow}>
              <Avatar url={post.user?.avatar_url} name={post.user?.name} size={32} />
              <View style={styles.cardUserInfo}>
                <Text style={[styles.cardUserName, { color: colors.foreground }]}>
                  {post.user?.name ?? t('common.user')}
                </Text>
                <View style={styles.cardUserMeta}>
                  {post.user?.naapurusto && (
                    <>
                      <MapPin size={10} color={colors.mutedForeground} />
                      <Text style={[styles.cardMetaText, { color: colors.mutedForeground }]}>
                        {post.user.naapurusto}
                      </Text>
                    </>
                  )}
                  <Text style={[styles.cardMetaText, { color: colors.mutedForeground }]}>
                    {formatTimeAgo(post.created_at, t, locale)}
                  </Text>
                </View>
              </View>
              <View style={[styles.categoryBadge, { backgroundColor: `${catColor}18` }]}>
                <Text style={[styles.categoryBadgeText, { color: catColor }]}>
                  {getCategoryLabel(post.category)}
                </Text>
              </View>
            </View>

            {/* Title */}
            <Text style={[styles.detailTitle, { color: colors.foreground }]}>
              {post.title}
            </Text>

            {/* Content */}
            <Text style={[styles.detailContent, { color: colors.foreground }]}>
              {post.content}
            </Text>

            {/* Actions */}
            <View style={styles.detailActions}>
              <Pressable
                onPress={() => onUpvotePost(post)}
                style={[
                  styles.detailActionBtn,
                  isPostVoted && { backgroundColor: `${colors.foreground}14` },
                ]}
                hitSlop={8}
              >
                <ChevronUp
                  size={18}
                  color={isPostVoted ? colors.foreground : colors.mutedForeground}
                  strokeWidth={isPostVoted ? 2.5 : 1.8}
                />
                <Text style={[
                  styles.detailActionText,
                  { color: isPostVoted ? colors.foreground : colors.mutedForeground },
                ]}>
                  {post.upvote_count} {t('forum.upvote')}
                </Text>
              </Pressable>
              <View style={styles.detailActionBtn}>
                <MessageCircle size={16} color={colors.mutedForeground} strokeWidth={1.8} />
                <Text style={[styles.detailActionText, { color: colors.mutedForeground }]}>
                  {post.comment_count} {t('forum.replies')}
                </Text>
              </View>
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Replies header with sort toggle */}
            {onToggleReplySort && replies.length > 1 && (
              <PressableOpacity onPress={onToggleReplySort} style={styles.sortToggle} hitSlop={8}>
                <Text style={[styles.sortToggleText, { color: colors.foreground }]}>
                  {replySortNewest ? t('forum.newestFirst') : t('forum.oldestFirst')}
                </Text>
              </PressableOpacity>
            )}
            {loading && (
              <ActivityIndicator size="small" color={colors.mutedForeground} style={{ marginVertical: 16 }} />
            )}
          </View>
        }
        ItemSeparatorComponent={ForumReplySeparator}
        ListFooterComponent={<View style={{ height: 80 }} />}
      />

      {/* Reply input */}
      <View style={[styles.replyBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom || 12 }]}>
        <TextInput
          style={[styles.replyInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
          placeholder={t('forum.writeReply')}
          placeholderTextColor={colors.mutedForeground}
          value={replyText}
          onChangeText={onReplyTextChange}
          multiline
          maxLength={2000}
          inputAccessoryViewID={KEYBOARD_DONE_ID}
        />
        <Pressable
          onPress={() => onAddReply(replyText)}
          disabled={!replyText.trim() || sendingReply}
          style={[
            styles.sendBtn,
            {
              backgroundColor: replyText.trim() ? colors.foreground : colors.muted,
              opacity: sendingReply ? 0.6 : 1,
            },
          ]}
        >
          {sendingReply ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Send size={18} color={replyText.trim() ? colors.primaryForeground : colors.mutedForeground} />
          )}
        </Pressable>
      </View>
      <KeyboardDoneAccessory />
    </KeyboardAvoidingView>
  )
}

export const ForumThreadView = memo(ForumThreadViewInner)

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 56, paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 16, fontFamily: fonts.headingSemi, letterSpacing: -0.16, lineHeight: 23, flex: 1,
    textAlign: 'center', paddingHorizontal: 8,
  },
  detailList: {
    paddingHorizontal: 16,
  },
  detailPostSection: {
    paddingTop: 16, gap: 12,
  },
  cardUserRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  cardUserInfo: {
    flex: 1, gap: 1,
  },
  cardUserName: {
    fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 17,
  },
  cardUserMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  cardMetaText: {
    fontSize: 11, fontFamily: fonts.body, lineHeight: 14,
  },
  categoryBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 11, fontFamily: fonts.bodySemi, lineHeight: 14,
  },
  detailTitle: {
    fontSize: 20, fontFamily: fonts.heading, letterSpacing: -0.2, lineHeight: 26,
  },
  detailContent: {
    fontSize: 14, fontFamily: fonts.body, lineHeight: 22,
  },
  detailActions: {
    flexDirection: 'row', alignItems: 'center', gap: 20, paddingTop: 4,
  },
  detailActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
  },
  detailActionText: {
    fontSize: 13, fontFamily: fonts.bodyMedium, lineHeight: 17,
  },
  divider: {
    height: StyleSheet.hairlineWidth, marginVertical: 8,
  },
  replyCard: {
    borderRadius: 16, padding: 12, gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  replyUserName: {
    fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 17,
  },
  replyContent: {
    fontSize: 14, fontFamily: fonts.body, lineHeight: 20,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  actionText: {
    fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 17,
  },
  replyBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 12,
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  replyInput: {
    flex: 1, borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, fontFamily: fonts.body, maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 1,
  },
  sortToggle: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  sortToggleText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 17,
  },
})
