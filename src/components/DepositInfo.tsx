import { View, Text, StyleSheet } from 'react-native'
import { Shield, Info } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { formatPrice } from '@/lib/format'

interface DepositInfoProps {
  depositAmount: number
  locale?: string
}

/**
 * Shows deposit hold info in the booking modal.
 * Explains that the amount is held (not charged) and released on safe return.
 */
export function DepositInfo({ depositAmount, locale = 'fi' }: DepositInfoProps) {
  const { colors } = useTheme()
  const { t } = useI18n()

  return (
    <View style={[styles.container, { backgroundColor: `${colors.pro}12` }]}>
      <View style={styles.headerRow}>
        <Shield size={16} color={colors.pro} />
        <Text style={[styles.label, { color: colors.pro }]}>{t('rental.depositHold')}</Text>
        <Text style={[styles.amount, { color: colors.pro }]}>{formatPrice(depositAmount, locale)}</Text>
      </View>
      <View style={styles.noteRow}>
        <Info size={12} color={colors.mutedForeground} />
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          {t('rental.depositHoldNote')}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, padding: 12, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, fontFamily: fonts.bodySemi, flex: 1, lineHeight: 18 },
  amount: { fontSize: 16, fontFamily: fonts.heading, lineHeight: 22 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  note: { fontSize: 12, fontFamily: fonts.body, flex: 1, lineHeight: 16 },
})
