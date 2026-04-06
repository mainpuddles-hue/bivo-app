import { Pressable } from 'react-native'
import { X } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'

interface ModalCloseButtonProps {
  onClose: () => void
  /** Icon size. Default 22 (standardized) */
  size?: number
}

/**
 * Standardized modal/sheet close button.
 *
 * UI UX Pro Max rules applied:
 * - Icon: X, size 22 (standardized across all modals)
 * - Touch target: 44×44pt minimum
 * - Pressed feedback: opacity 0.7
 * - hitSlop: 12
 * - Accessibility: role="button", label="Close"
 *
 * Usage:
 *   <ModalCloseButton onClose={() => setVisible(false)} />
 */
export function ModalCloseButton({ onClose, size = 22 }: ModalCloseButtonProps) {
  const { colors } = useTheme()
  const { t } = useI18n()

  return (
    <Pressable
      onPress={onClose}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t('common.close')}
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
      <X size={size} color={colors.mutedForeground} strokeWidth={1.8} />
    </Pressable>
  )
}
