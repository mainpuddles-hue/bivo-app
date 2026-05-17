import { StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { MessageCircle } from 'lucide-react-native'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface ItemSnapshotCardProps {
  /** URL or local URI for the listing thumbnail. */
  thumbnail?: string | null
  /** Listing title ("Bosch porakone"). */
  title: string
  /** Subtitle line ("Marialta", "Marialle · 2 päivää"). */
  subtitle: string
  /** Eyebrow above title (optional, e.g. "PALAUTETAAN NYT"). */
  eyebrow?: string
  /** Tap-to-chat button. Omit to hide the button. */
  onChatPress?: () => void
  /** Larger thumbnail size (used on the Return screen). */
  size?: 'compact' | 'comfortable'
}

/**
 * Item strip card. Hairline border, radius 14 or 18 depending on size.
 * Compact: 54px thumbnail (LoanActive). Comfortable: 58px (Return).
 */
export function ItemSnapshotCard({
  thumbnail,
  title,
  subtitle,
  eyebrow,
  onChatPress,
  size = 'compact',
}: ItemSnapshotCardProps) {
  const { colors } = useTheme()
  const thumb = size === 'compact' ? 54 : 58
  const radius = size === 'compact' ? 18 : 14

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: radius }]}>
      <View style={[styles.thumbWrap, { width: thumb, height: thumb, borderRadius: 12, backgroundColor: colors.muted }]}>
        {thumbnail ? (
          <Image
            source={{ uri: thumbnail }}
            style={styles.thumb}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityLabel={title}
          />
        ) : null}
      </View>
      <View style={styles.body}>
        {eyebrow && (
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]} numberOfLines={1}>
            {eyebrow}
          </Text>
        )}
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {onChatPress && (
        <PressableOpacity
          onPress={onChatPress}
          accessibilityRole="button"
          accessibilityLabel="Avaa keskustelu"
          hitSlop={8}
          style={[styles.chatBtn, { backgroundColor: colors.muted }]}
        >
          <MessageCircle size={14} color={colors.foreground} strokeWidth={2} />
        </PressableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    padding: 12,
  },
  thumbWrap: {
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  title: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    lineHeight: 18,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 15,
  },
  chatBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
