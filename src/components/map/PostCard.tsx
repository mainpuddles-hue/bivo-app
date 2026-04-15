import { View, Text, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { PressableOpacity } from '@/components/ui'
import { MapPin } from 'lucide-react-native'
import { fonts } from '@/lib/fonts'
import { CATEGORIES } from '@/lib/constants'
import { formatTimeAgo } from '@/lib/format'
import { getImageUrl } from '@/lib/imageUtils'
import type { Post, PostType } from '@/lib/types'
import type { ListItem, ThemeColors } from './types'
import { formatDistance } from './constants'

interface PostCardProps {
  item: ListItem
  colors: ThemeColors
  locale: string
  t: (key: string) => string
  onPress: (item: ListItem) => void
}

export function PostCard({ item, colors, locale, t, onPress }: PostCardProps) {
  const postData = item.sourceData as Post
  const imageUrl = postData.image_url
  const userName = (postData as any).user?.name ?? null
  const avatarUrl = (postData as any).user?.avatar_url ?? null
  const postType = postData.type
  const cat = postType ? CATEGORIES[postType as PostType] : null
  const catColor = cat ? cat.color : item.color

  return (
    <PressableOpacity
      style={[styles.postCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => onPress(item)}
    >
      {/* Category color bar on left edge */}
      <View style={[styles.postColorBar, { backgroundColor: catColor }]} />

      <View style={styles.postBody}>
        {/* Image or placeholder */}
        {imageUrl ? (
          <Image source={{ uri: getImageUrl(imageUrl, 'thumbnail')! }} style={styles.cardImage} contentFit="cover" />
        ) : (
          <View style={[styles.cardImagePlaceholder, { backgroundColor: `${item.color}15` }]}>
            <MapPin size={18} color={item.color} />
          </View>
        )}

        {/* Content */}
        <View style={styles.cardContent}>
          {/* Title row with avatar */}
          <View style={styles.postTitleRow}>
            {avatarUrl ? (
              <Image source={{ uri: getImageUrl(avatarUrl, 'thumbnail')! }} style={styles.postAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.postAvatarPlaceholder, { backgroundColor: `${item.color}20` }]}>
                <Text style={[styles.postAvatarInitial, { color: item.color }]}>
                  {(userName || '?')[0].toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.title, { color: colors.foreground, flex: 1 }]} numberOfLines={2}>{item.title}</Text>
          </View>

          {/* Category / type badge */}
          <View style={styles.cardBadgeRow}>
            {cat && (
              <View style={[styles.badge, { backgroundColor: `${catColor}18` }]}>
                <Text style={[styles.badgeText, { color: catColor }]}>{t(cat.label)}</Text>
              </View>
            )}
          </View>

          {/* Meta row */}
          {item.subtitle ? (
            <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>{item.subtitle}</Text>
          ) : null}

          {/* Bottom row: distance + user + time */}
          <View style={styles.bottomRow}>
            <Text style={[styles.distance, { color: colors.mutedForeground }]}>
              {formatDistance(item.distance)}
            </Text>
            {userName && (
              <Text style={[styles.userName, { color: colors.mutedForeground }]} numberOfLines={1}>
                {userName}
              </Text>
            )}
            {item.sortDate && (
              <Text style={[styles.distance, { color: colors.mutedForeground }]}>
                {formatTimeAgo(item.sortDate, t, locale)}
              </Text>
            )}
          </View>
        </View>
      </View>
    </PressableOpacity>
  )
}

const styles = StyleSheet.create({
  postCard: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  postColorBar: {
    width: 4,
  },
  postBody: {
    flex: 1,
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  cardImage: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },
  cardImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  postTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  postAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  postAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAvatarInitial: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    lineHeight: 21,
  },
  title: {
    fontSize: 16,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.16,
    lineHeight: 20,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 16,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    lineHeight: 14,
  },
  meta: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
    flex: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  distance: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  userName: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
    flex: 1,
  },
})
