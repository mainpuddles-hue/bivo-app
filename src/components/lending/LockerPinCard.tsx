import { StyleSheet, Text, View } from 'react-native'
import { Lock, MapPin } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface LockerPinCardProps {
  /** "AVAUSKOODI" / "NOUTOKOODI" / "PALAUTUSKOODI" — uppercase eyebrow. */
  label: string
  /** 4–6 digit numeric PIN. Render as-is (already a string). Pass dashes ("— — — —") to render the locked / not-yet-issued state. */
  pin: string
  /** Lower line — "Lokero #12 · Gardi Kamppi" */
  locker: string
  /** Validity hint — "Voimassa tänään 18.00 asti" */
  validity?: string
  /** Use the dashed locked style when PIN is dashes / placeholder. */
  locked?: boolean
}

/**
 * The signature element of the Gardi flow per the design brief: huge tabular
 * PIN digits (64 / 600 / 8px tracking), centered card, hairline border, no
 * shadow. White surface for issued PIN, dashed border + tertiary text for
 * the locked / not-yet-ready state.
 */
export function LockerPinCard({ label, pin, locker, validity, locked }: LockerPinCardProps) {
  const { colors } = useTheme()

  return (
    <View
      style={[
        styles.card,
        locked
          ? {
              backgroundColor: colors.cardElevated,
              borderColor: colors.borderStrong,
              borderStyle: 'dashed',
            }
          : { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>

      {locked ? (
        <View style={styles.lockedRow}>
          <Lock size={28} color={colors.tertiaryForeground} strokeWidth={1.6} />
          <Text style={[styles.pin, { color: colors.tertiaryForeground }]} accessibilityLabel="Koodi ei ole vielä saatavilla">
            — — — —
          </Text>
        </View>
      ) : (
        <Text
          style={[styles.pin, { color: colors.foreground }]}
          accessibilityLabel={`Koodi ${pin.split('').join(' ')}`}
        >
          {pin}
        </Text>
      )}

      <View style={styles.lockerRow}>
        <MapPin size={13} color={colors.foreground} strokeWidth={2} />
        <Text style={[styles.locker, { color: colors.foreground }]} numberOfLines={1}>
          {locker}
        </Text>
      </View>

      {validity && (
        <Text style={[styles.validity, { color: colors.mutedForeground }]} numberOfLines={1}>
          {validity}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 22,
    alignItems: 'center',
  },
  label: {
    fontSize: 10.5,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  pin: {
    fontSize: 64,
    fontFamily: fonts.headingSemi,
    fontWeight: '600',
    letterSpacing: 8,
    marginLeft: 8, // optical compensation for trailing letterSpacing
    lineHeight: 64,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lockerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
  },
  locker: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
  },
  validity: {
    fontSize: 11.5,
    fontFamily: fonts.body,
    marginTop: 6,
  },
})
