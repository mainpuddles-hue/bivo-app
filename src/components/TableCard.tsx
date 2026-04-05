import { memo, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { MapPin, Clock } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { getTableCategoryEmoji, getTableCategoryColor, getTableTimeRemaining, isExpiredEvent } from '@/lib/eventHelpers'
import { TABLE_CATEGORIES } from '@/lib/constants'
import type { CommunityEvent, TableCategory } from '@/lib/types'

interface TableCardProps {
  event: CommunityEvent
  onJoin?: (eventId: string) => void
}

export const TableCard = memo(function TableCard({ event, onJoin }: TableCardProps) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const router = useRouter()
  const expired = isExpiredEvent(event)
  const emoji = getTableCategoryEmoji(event.category)
  const catColor = getTableCategoryColor(event.category)
  const catConfig = TABLE_CATEGORIES[event.category as TableCategory]
  const bgColor = catConfig
    ? (isDark ? catConfig.bgDark : catConfig.bgLight)
    : (isDark ? colors.card : colors.muted)

  const timeText = getTableTimeRemaining(event, t)
  const participantCount = event.participant_count ?? 0
  const spotsLeft = event.max_participants ? event.max_participants - participantCount : null

  const handlePress = useCallback(() => {
    router.push(`/event/${event.id}` as any)
  }, [event.id, router])

  const handleJoin = useCallback(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
    onJoin?.(event.id)
  }, [event.id, onJoin])

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        s.card,
        { backgroundColor: bgColor, borderColor: `${catColor}30` },
        expired && { opacity: 0.5 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={event.title}
    >
      {/* Emoji */}
      <Text style={s.emoji}>{emoji}</Text>

      {/* Title */}
      <Text style={[s.title, { color: colors.foreground, fontFamily: fonts.bodySemi }]} numberOfLines={2}>
        {event.title}
      </Text>

      {/* Time */}
      <View style={s.infoRow}>
        <Clock size={12} color={catColor} />
        <Text style={[s.timeText, { color: catColor, fontFamily: fonts.bodySemi }]}>
          {timeText}
        </Text>
      </View>

      {/* Location */}
      {event.location_name && (
        <View style={s.infoRow}>
          <MapPin size={12} color={colors.mutedForeground} />
          <Text style={[s.locationText, { color: colors.mutedForeground, fontFamily: fonts.body }]} numberOfLines={1}>
            {event.location_name}
          </Text>
        </View>
      )}

      {/* Spots */}
      <View style={s.bottomRow}>
        {/* Participant dots */}
        <View style={s.dots}>
          {Array.from({ length: Math.min(participantCount, 6) }).map((_, i) => (
            <View key={`dot-${i}`} style={[s.dot, { backgroundColor: catColor }]} />
          ))}
        </View>

        {spotsLeft !== null && spotsLeft > 0 && !expired && (
          <Text style={[s.spotsText, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
            {t('tables.spotsOpen', { count: spotsLeft })}
          </Text>
        )}
      </View>

      {/* Join pill */}
      {!expired && !event.is_participant && onJoin && (
        <Pressable
          onPress={handleJoin}
          style={({ pressed }) => [
            s.joinPill,
            { backgroundColor: catColor },
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('tables.quickJoin')}
        >
          <Text style={[s.joinText, { fontFamily: fonts.bodySemi }]}>
            {t('tables.quickJoin')}
          </Text>
        </Pressable>
      )}

      {event.is_participant && !expired && (
        <View style={[s.joinedBadge, { backgroundColor: `${catColor}20` }]}>
          <Text style={[s.joinedText, { color: catColor, fontFamily: fonts.bodySemi }]}>✓</Text>
        </View>
      )}
    </Pressable>
  )
})

const s = StyleSheet.create({
  card: {
    width: 180,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  emoji: { fontSize: 28 },
  title: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  locationText: { fontSize: 11, lineHeight: 16, flex: 1 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  spotsText: { fontSize: 10, lineHeight: 14 },
  joinPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    marginTop: 4,
  },
  joinText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF', lineHeight: 16 },
  joinedBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 4,
  },
  joinedText: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
})
