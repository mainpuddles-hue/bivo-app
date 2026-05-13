import { Linking, StyleSheet, Text, View } from 'react-native'
import { Building2, ExternalLink, MapPin } from 'lucide-react-native'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface HubHandoffCardProps {
  /** Hub name ("Kallio Konepaja"). */
  name: string
  /** Hub street address. */
  address?: string | null
  /** Optional copy line ("Avaa ma-pe 9-17"). */
  hours?: string | null
  /** Eyebrow above the title ("DROP-OFF" / "PICKUP" / "RETURN" / "COLLECT"). */
  eyebrow?: string
  /** Optional caption shown under hours (e.g. "Sovittu maanantaiksi"). */
  caption?: string
  /** Lat/lng for the maps button. Omit to hide the button. */
  lat?: number | null
  lng?: number | null
}

/**
 * The "hub handoff" card on the booking detail screen, used when
 * pickup_method='hub'. Shows where the item lives now and how to get there.
 * No PIN — that's the Gardi-only thing.
 */
export function HubHandoffCard({
  name,
  address,
  hours,
  eyebrow,
  caption,
  lat,
  lng,
}: HubHandoffCardProps) {
  const { colors } = useTheme()

  const openMaps = () => {
    if (lat == null || lng == null) return
    const url = `https://maps.apple.com/?q=${encodeURIComponent(name)}&ll=${lat},${lng}`
    Linking.openURL(url).catch(() => {})
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.iconCircle, { backgroundColor: colors.muted }]}>
        <Building2 size={18} color={colors.foreground} strokeWidth={1.7} />
      </View>
      <View style={styles.body}>
        {eyebrow && (
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]} numberOfLines={1}>
            {eyebrow}
          </Text>
        )}
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {name}
        </Text>
        {address && (
          <View style={styles.row}>
            <MapPin size={11} color={colors.mutedForeground} strokeWidth={2} />
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
              {address}
            </Text>
          </View>
        )}
        {hours && (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
            {hours}
          </Text>
        )}
        {caption && (
          <Text style={[styles.caption, { color: colors.foreground }]} numberOfLines={2}>
            {caption}
          </Text>
        )}
      </View>
      {lat != null && lng != null && (
        <PressableOpacity
          onPress={openMaps}
          accessibilityRole="button"
          accessibilityLabel="Avaa kartta"
          hitSlop={8}
          style={[styles.mapBtn, { backgroundColor: colors.muted }]}
        >
          <ExternalLink size={14} color={colors.foreground} strokeWidth={2} />
        </PressableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  body: { flex: 1, gap: 4 },
  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 15,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subtitle: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  caption: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 4,
  },
  mapBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
