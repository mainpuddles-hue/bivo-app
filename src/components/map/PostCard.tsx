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
      {/* Image left (borderRadius 10) */}
      {imageUrl ? (
        <Image source={{ uri: getImageUrl(imageUrl, 'thumbnail')! }} style={styles.cardImage} contentFit="cover" />
      ) : (
        <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.muted }]}>
          <MapPin size={18} color={colors.mutedForeground} />
        </View>
      )}

      {/* Details right */}
      <View style={styles.cardContent}>
        {/* Title */}
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>

        {/* Category badge */}
        {cat && (
          <View style={[styles.badge, { backgroundColor: `${catColor}12`, borderColor: `${catColor}20`, borderWidth: 1 }]}>
            <Text style={[styles.badgeText, { color: catColor }]}>{t(cat.label)}</Text>
          </View>
        )}

        {/* Meta row: user + distance + time */}
        <View style={styles.metaRow}>
          {avatarUrl ? (
            <Image source={{ uri: getImageUrl(avatarUrl, 'thumbnail')! }} style={styles.metaAvatar} contentFit="cover" />
          ) : userName ? (
            <View style={[styles.metaAvatarPlaceholder, { backgroundColor: colors.muted }]}>
              <Text style={[styles.metaAvatarInitial, { color: colors.mutedForeground }]}>
                {userName[0].toUpperCase()}
              </Text>
            </View>
          ) : null}
          {userName && (
            <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
              {userName}
            </Text>
          )}
          <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
            {formatDistance(item.distance)}
          </Text>
          {item.sortDate && (
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {formatTimeAgo(item.sortDate, t, locale)}
            </Text>
          )}
        </View>
      </View>
    </PressableOpacity>
  )
}

const styles = StyleSheet.create({
  postCard: {
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    padding: 10,
    gap: 12,
  },
  cardImage: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  cardImagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.14,
    lineHeight: 18,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: fonts.bodyMedium,
    lineHeight: 14,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  metaAvatar: {
    width: 16,
    height: 16,
    borderRadius: 999,
  },
  metaAvatarPlaceholder: {
    width: 16,
    height: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaAvatarInitial: {
    fontSize: 8,
    fontFamily: fonts.bodySemi,
    lineHeight: 12,
  },
  metaText: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 14,
  },
})
