import { StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface SectionEyebrowProps {
  /** Uppercase label text — caller supplies in the locale's translation. */
  label: string
  /**
   * Color for the leading 8x8 dot. Defaults to the foreground (ink).
   * Use semantic colors for state-aware sections: success for "live now",
   * destructive for "expiring", muted for evergreen.
   */
  dotColor?: string
  /** Container style override (margin, alignment). */
  style?: ViewStyle
  /** Hide the dot — for places where the eyebrow stands alone without status. */
  hideDot?: boolean
}

/**
 * The eyebrow-dot pattern from the design handoff (slice 1's StatusBanner
 * eyebrowRow): 8x8 colored dot + uppercase label, used above section titles
 * across the app. The single rhythmic motif that makes Helsinki Monochrome
 * v3 read as a system instead of a palette.
 *
 * Applies the Aesthetic-Usability Effect — consistent eyebrows across feed
 * sections, profile blocks, message group headers, etc., signal that the
 * app is one well-considered surface rather than 8 contractors' work.
 */
export function SectionEyebrow({ label, dotColor, style, hideDot }: SectionEyebrowProps) {
  const { colors } = useTheme()
  return (
    <View style={[styles.row, style]}>
      {!hideDot && (
        <View
          style={[styles.dot, { backgroundColor: dotColor ?? colors.foreground }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <Text style={[styles.label, { color: colors.mutedForeground }]} accessibilityRole="header">
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
})
