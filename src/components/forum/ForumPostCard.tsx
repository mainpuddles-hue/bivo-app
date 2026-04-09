import { memo } from 'react'
import {
  View, Text, StyleSheet, Pressable,
} from 'react-native'
import { ChevronUp, MessageCircle, MapPin, Pencil, Trash2, Flag } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { cardShadow, cardShadowDark } from '@/lib/shadows'
import { Avatar } from '@/components/Avatar'
import { formatTimeAgo } from '@/lib/format'

// ── Types ──
export type ForumCategory = 'vinkit' | 'kysymykset' | 'tapahtumat' | 'uutiset'

export interface ForumPostUser {
  id: string
  name: string | null
  avatar_url: string | null
  naapurusto: string | null
}

export interface ForumPost {
  id: string
  user_id: string
  title: string
  content: string
  category: ForumCategory
  neighborhood: string | null
  created_at: string
  upvote_count: number
  comment_count: number
  user?: ForumPostUser | null
}

export interface ForumReply {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  upvote_count: number
  user?: ForumPostUser | null
}

// Centralized — import from constants to avoid duplication
import { FORUM_CATEGORY_COLORS as CATEGORY_COLORS } from '@/lib/constants'

interface ForumPostCardProps {
  post: ForumPost
  currentUserId: string | null
  isVoted: boolean
  onUpvote: (post: ForumPost) => void
  onEdit: (post: ForumPost) => void
  onDelete: (postId: string) => void
  onSelect: (post: ForumPost) => void
  onReport?: (postId: string) => void
  onUserPress?: (userId: string) => void
}

function ForumPostCardInner({
  post,
  currentUserId,
  isVoted,
  onUpvote,
  onEdit,
  onDelete,
  onSelect,
  onReport,
  onUserPress,
}: ForumPostCardProps) {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const catColor = CATEGORY_COLORS[post.category] || colors.primary
  const user = post.user

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'vinkit': return t('forum.tips')
      case 'kysymykset': return t('forum.questions')
      case 'tapahtumat': return t('forum.events')
      case 'uutiset': return t('forum.news')
      default: return category
    }
  }

  return (
    <Pressable
      onPress={() => onSelect(post)}
      style={[styles.card, { backgroundColor: colors.card }, isDark ? cardShadowDark : cardShadow]}
      accessibilityRole="button"
      accessibilityLabel={[getCategoryLabel(post.category), post.title, post.content?.slice(0, 120), `${post.comment_count} ${t('forum.replies')}`].filter(Boolean).join(', ')}
    >
      <View style={[styles.categoryBar, { backgroundColor: catColor }]} />
      <View style={styles.cardBody}>
        {/* User row */}
        <View style={styles.cardUserRow}>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); if (user?.id && onUserPress) onUserPress(user.id) }}
            disabled={!onUserPress || !user?.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
          >
            <Avatar url={user?.avatar_url} name={user?.name} size={32} />
            <View style={styles.cardUserInfo}>
              <Text style={[styles.cardUserName, { color: colors.foreground }]} numberOfLines={1}>
                {user?.name ?? t('common.user')}
              </Text>
              <View style={styles.cardUserMeta}>
                {user?.naapurusto && (
                  <>
                    <MapPin size={10} color={colors.mutedForeground} />
                    <Text style={[styles.cardMetaText, { color: colors.mutedForeground }]}>
                      {user.naapurusto}
                    </Text>
                  </>
                )}
                <Text style={[styles.cardMetaText, { color: colors.mutedForeground }]}>
                  {formatTimeAgo(post.created_at, t, locale)}
                </Text>
              </View>
            </View>
          </Pressable>
          <View style={[styles.categoryBadge, { backgroundColor: `${catColor}18` }]}>
            <Text style={[styles.categoryBadgeText, { color: catColor }]}>
              {getCategoryLabel(post.category)}
            </Text>
          </View>
        </View>

        {/* Title */}
        <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
          {post.title}
        </Text>

        {/* Content preview */}
        <Text style={[styles.cardContent, { color: colors.mutedForeground }]} numberOfLines={2}>
          {post.content}
        </Text>

        {/* Actions row */}
        <View style={styles.cardActions}>
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); onUpvote(post) }}
            style={[styles.actionBtn, isVoted && { backgroundColor: `${colors.primary}14` }]}
            hitSlop={8}
          >
            <ChevronUp
              size={16}
              color={isVoted ? colors.primary : colors.mutedForeground}
              strokeWidth={isVoted ? 2.5 : 1.8}
            />
            {(post.upvote_count > 0 || isVoted) && (
              <Text style={[
                styles.actionText,
                { color: isVoted ? colors.primary : colors.mutedForeground },
                isVoted && { fontFamily: fonts.bodySemi },
              ]}>
                {post.upvote_count}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={() => onSelect(post)} style={styles.actionBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${post.comment_count} ${t('forum.replies')}`}>
            <MessageCircle size={14} color={colors.mutedForeground} strokeWidth={1.8} />
            <Text style={[styles.actionText, { color: colors.mutedForeground }]}>
              {post.comment_count > 0 ? `${post.comment_count} ${t('forum.replies')}` : t('forum.beFirstReply')}
            </Text>
          </Pressable>
          {post.user_id === currentUserId && (
            <>
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); onEdit(post) }}
                style={styles.actionBtn}
                hitSlop={8}
              >
                <Pencil size={14} color={colors.primary} strokeWidth={1.8} />
              </Pressable>
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); onDelete(post.id) }}
                style={styles.actionBtn}
                hitSlop={8}
              >
                <Trash2 size={14} color={colors.destructive} strokeWidth={1.8} />
              </Pressable>
            </>
          )}
          {post.user_id !== currentUserId && currentUserId && onReport && (
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); onReport(post.id) }}
              style={styles.actionBtn}
              hitSlop={8}
              accessibilityLabel={t('report.title')}
            >
              <Flag size={14} color={colors.mutedForeground} strokeWidth={1.8} />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  )
}

export const ForumPostCard = memo(ForumPostCardInner)

const styles = StyleSheet.create({
  card: {
    borderRadius: 12, overflow: 'hidden', flexDirection: 'row',
  },
  categoryBar: {
    width: 4,
  },
  cardBody: {
    flex: 1, padding: 16, gap: 8,
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
  cardTitle: {
    fontSize: 16, fontFamily: fonts.headingSemi, letterSpacing: -0.16, lineHeight: 21,
  },
  cardContent: {
    fontSize: 13, fontFamily: fonts.body, lineHeight: 18,
  },
  cardActions: {
    flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 4,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  actionText: {
    fontSize: 12, fontFamily: fonts.bodyMedium, lineHeight: 17,
  },
})
