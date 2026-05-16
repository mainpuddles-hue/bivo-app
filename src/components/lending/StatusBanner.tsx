import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface StatusBannerProps {
  /** Uppercase eyebrow ("KÄYNNISSÄ", "PALAUTUS NYT", …). */
  eyebrow: string
  /** Title sentence ("Palautus huomenna klo 19.00"). */
  title: string
  /** 0..1 progress for the pill bar. Omit to hide the bar. */
  progress?: number
  /** Caption shown next to the progress bar ("2 / 3 päivää"). */
  meta?: string
  /** Color for the leading dot (defaults to ink). */
  dotColor?: string
}

/**
 * The hero card on the LoanActive screen. White surface, hairline border,
 * radius 18, 14×16 padding. No shadow — the design system uses hairlines
 * over shadows except on the sticky CTA.
 */
export function StatusBanner({ eyebrow, title, progress, meta, dotColor }: StatusBannerProps) {
  const { colors } = useTheme()
  const dot = dotColor ?? colors.foreground
  const clamped = typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : null

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.eyebrowRow}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text style={[styles.eyebrow, { color: colors.foreground }]}>
          {eyebrow}
        </Text>
      </View>
      <Text style={[styles.title, { color: colors.foreground }]} accessibilityRole="header">
        {title}
      </Text>
      {clamped !== null && (
        <View style={styles.progressRow}>
          <View style={[styles.track, { backgroundColor: colors.border }]}>
            <View
              style={[styles.fill, { backgroundColor: colors.foreground, width: `${clamped * 100}%` }]}
              accessibilityLabel={`Edistyminen ${Math.round(clamped * 100)}%`}
            />
          </View>
          {meta && (
            <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
              {meta}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.heading,
    fontWeight: '600',
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  meta: {
    fontSize: 12,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
})
