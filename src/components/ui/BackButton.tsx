import { Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'

interface BackButtonProps {
  /** Override default router.back() behavior */
  onPress?: () => void
  /** Icon color override */
  color?: string
}

/**
 * Standardized back button.
 *
 * UI UX Pro Max rules applied:
 * - Icon: ArrowLeft, size 24 (consistent)
 * - Touch target: 44×44pt minimum
 * - Pressed feedback: opacity 0.7
 * - Accessibility: role="button", label="Back"
 * - hitSlop: 12
 *
 * Usage:
 *   <BackButton />
 *   <BackButton onPress={() => router.replace('/')} />
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
        {
          minWidth: 44,
          minHeight: 44,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <ArrowLeft size={24} color={color ?? colors.foreground} />
    </Pressable>
  )
}
