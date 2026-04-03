import { memo } from 'react'
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { MapPin, ChevronRight, Globe } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import type { CityEvent } from '@/lib/types'
import { getCityEventName } from '@/lib/eventHelpers'

const CITY_EVENT_COLORS: Record<string, string> = {
  culture: '#8E44AD', music: '#E91E63', sport: '#27AE60', family: '#FF9800',
  food: '#E74C3C', nature: '#4CAF50', education: '#2196F3', theatre: '#9C27B0',
  exhibition: '#795548', festival: '#FF5722', market: '#FF9800', other: '#607D8B',
}

export interface HeroEventCardProps {
  event: CityEvent
}

export const HeroEventCard = memo(function HeroEventCard({ event }: HeroEventCardProps) {
  const { colors } = useTheme()
  const { locale } = useI18n()
  const router = useRouter()

  const catColor = CITY_EVENT_COLORS[event.category] || '#607D8B'

  return (
    <Pressable
      onPress={() => event.info_url ? Linking.openURL(event.info_url) : router.push('/community-events' as any)}
      style={({ pressed }) => [styles.todayEventCard, { backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={getCityEventName(event, locale)}
    >
      {event.image_url ? (
        <Image source={{ uri: event.image_url }} style={styles.todayEventImage} contentFit="cover" />
      ) : (
        <View style={[styles.todayEventImageFallback, { backgroundColor: `${catColor}20` }]}>
          <Globe size={20} color={catColor} />
        </View>
      )}
      <View style={styles.todayEventInfo}>
        <Text style={[styles.todayEventName, { color: colors.foreground }]} numberOfLines={1}>
          {getCityEventName(event, locale)}
        </Text>
        {event.location_name && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <MapPin size={10} color={colors.mutedForeground} />
            <Text style={[styles.todayEventLocation, { color: colors.mutedForeground }]} numberOfLines={1}>
              {event.location_name}
            </Text>
          </View>
        )}
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  )
})

const styles = StyleSheet.create({
  todayEventCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 12,
    overflow: 'hidden', gap: 12, paddingRight: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  todayEventImage: { width: 56, height: 56 },
  todayEventImageFallback: {
    width: 56, height: 56, alignItems: 'center', justifyContent: 'center',
  },
  todayEventInfo: { flex: 1, gap: 2 },
  todayEventName: { fontSize: 14, fontFamily: fonts.headingSemi, letterSpacing: -0.16, lineHeight: 20 },
  todayEventLocation: { fontSize: 11, fontFamily: fonts.body, flex: 1, lineHeight: 16 },
})
