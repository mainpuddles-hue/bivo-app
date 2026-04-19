import { Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'

interface BackButtonProps {
  /** Override default router.back() behavior */
  onPress?: () => void
  /** Icon color override */
  color?: string
}

/**
 * Helsinki Monochrome back button — 36px circle, surface bg, 1px border.
 * Touch target 44pt via hitSlop.
 */
export function BackButton({ onPress, color }: BackButtonProps) {
  const router = useRouter()
  const { colors } = useTheme()
  const { t } = useI18n()

  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      style={({ pressed }) => [
        bk.circle,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <ChevronLeft size={20} color={color ?? colors.foreground} />
    </Pressable>
  )
}

const bk = StyleSheet.create({
  circle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
