import { StyleSheet, Text, View } from 'react-native'
import { Lock, LockOpen, ShieldAlert } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { formatPrice } from '@/lib/format'

type DepositStatus = 'authorized' | 'captured' | 'released' | 'partial_captured' | 'none' | null | undefined

interface DepositChipProps {
  status: DepositStatus
  amount: number | null | undefined
  capturedAmount?: number | null
}

/**
 * Tiny chip that surfaces the rental deposit's current state. Hidden when
 * status is 'released' (there's nothing useful to show — the money is back
 * in the borrower's account) or when there is no deposit.
 */
export function DepositChip({ status, amount, capturedAmount }: DepositChipProps) {
  const { colors } = useTheme()
  const { t, locale } = useI18n()

  if (!status || status === 'none' || status === 'released') return null
  if (!amount || amount <= 0) return null

  let label: string
  let Icon: typeof Lock
  let tone: 'neutral' | 'warning'

  if (status === 'authorized') {
    label = t('booking.depositHeld', { amount: formatPrice(amount, locale) }) ?? `Vakuus pidätetty ${formatPrice(amount, locale)}`
    Icon = Lock
    tone = 'neutral'
  } else if (status === 'captured') {
    label = t('booking.depositCaptured', { amount: formatPrice(capturedAmount ?? amount, locale) }) ?? `Vakuus käytetty ${formatPrice(capturedAmount ?? amount, locale)}`
    Icon = ShieldAlert
    tone = 'warning'
  } else if (status === 'partial_captured') {
    label = t('booking.depositPartial', { amount: formatPrice(capturedAmount ?? 0, locale) }) ?? `Vakuudesta pidätetty ${formatPrice(capturedAmount ?? 0, locale)}`
    Icon = ShieldAlert
    tone = 'warning'
  } else {
    return null
  }

  const fg = tone === 'warning' ? colors.destructive : colors.foreground
  const bg = tone === 'warning'
    ? 'rgba(196,69,54,0.08)'
    : (colors.surfaceTinted as string)

  return (
    <View style={[styles.chip, { backgroundColor: bg, borderColor: tone === 'warning' ? 'rgba(196,69,54,0.25)' : colors.border }]}>
      <Icon size={11} color={fg} strokeWidth={2} />
      <Text style={[styles.label, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
})
