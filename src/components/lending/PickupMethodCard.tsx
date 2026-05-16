import { StyleSheet, Text, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

export type PickupMethodKey = 'address' | 'hub' | 'gardi'

interface PickupMethodCardProps {
  method: PickupMethodKey
  /** Display title ("Sovittu osoite", "TackBird Hub", "Gardi älylokero"). */
  title: string
  /** Sub-copy below the title. */
  subtitle: string
  /** Lucide icon component, rendered at 22px in the leading circle. */
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
  /** Currently selected? */
  selected?: boolean
  /** Disable the card (e.g. Gardi until slice 3 lands). */
  disabled?: boolean
  /** Right-side meta line (distance, ETA, "tulossa pian", etc.). */
  meta?: string
  onPress: () => void
}

/**
 * Single pickup-method choice card. Renders the leading icon circle, title +
 * subtitle, optional meta on the right, chevron when interactive. Selected
 * state inverts to ink fill / white text. Disabled gets washed out and hides
 * the chevron — meta still shows so the user understands why ("Tulossa pian").
 */
export function PickupMethodCard({
  method,
  title,
  subtitle,
  Icon,
  selected,
  disabled,
  meta,
  onPress,
}: PickupMethodCardProps) {
  const { colors } = useTheme()

  const handlePress = () => {
    if (disabled) return
    try { Haptics.selectionAsync() } catch {}
    onPress()
  }

  const fg = selected ? colors.primaryForeground : colors.foreground
  const muted = selected ? (colors.onInkMuted ?? '#B8BCC0') : colors.mutedForeground

  return (
    <PressableOpacity
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      accessibilityLabel={`${title}. ${subtitle}`}
      style={[
        styles.card,
        selected
          ? { backgroundColor: colors.foreground, borderColor: colors.foreground }
          : { backgroundColor: colors.card, borderColor: colors.border },
        disabled && { opacity: 0.55 },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: selected ? colors.primaryForeground : colors.muted }]}>
        <Icon size={22} color={selected ? colors.foreground : colors.foreground} strokeWidth={1.7} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: fg }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: muted }]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      {meta && (
        <Text style={[styles.meta, { color: muted }]} numberOfLines={1}>
          {meta}
        </Text>
      )}
      {!disabled && (
        <ChevronRight size={16} color={muted} strokeWidth={2} />
      )}
    </PressableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  meta: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
  },
})
