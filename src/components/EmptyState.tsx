import { View, Text, StyleSheet } from 'react-native'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  /** Icon rendered inside the action button, before the label */
  actionIcon?: React.ReactNode
  /** Use a filled (ink-bg) button instead of the default outline style */
  actionVariant?: 'outline' | 'filled'
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  actionVariant = 'outline',
}: EmptyStateProps) {
  const { colors } = useTheme()
  const isFilled = actionVariant === 'filled'

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        {icon}
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {description && (
        <Text style={[styles.description, { color: colors.mutedForeground }]}>{description}</Text>
      )}
      {actionLabel && onAction && (
        <PressableOpacity
          onPress={onAction}
          style={[
            styles.actionBtn,
            isFilled
              ? { backgroundColor: colors.foreground, borderWidth: 0 }
              : { borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth, backgroundColor: 'transparent' },
          ]}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          {actionIcon}
          <Text style={[
            styles.actionText,
            { color: isFilled ? colors.background : colors.foreground },
          ]}>
            {actionLabel}
          </Text>
        </PressableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // Threads-light: plain icon, bold title, muted description, outline CTA
  container: {
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 48,
    paddingHorizontal: 40,
    gap: 16,
  },
  iconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.headingSemi,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 14,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    minHeight: 44,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
})
