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
  /** Secondary CTA label (renders outline button below primary) */
  secondaryLabel?: string
  onSecondary?: () => void
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  actionVariant = 'outline',
  secondaryLabel,
  onSecondary,
}: EmptyStateProps) {
  const { colors } = useTheme()
  const isFilled = actionVariant === 'filled'

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
        {icon}
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {description && (
        <Text style={[styles.description, { color: colors.mutedForeground }]}>{description}</Text>
      )}
      {(actionLabel || secondaryLabel) && (
        <View style={styles.ctaGroup}>
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
          {secondaryLabel && onSecondary && (
            <PressableOpacity
              onPress={onSecondary}
              style={[styles.actionBtn, { borderColor: colors.borderStrong, borderWidth: 1, backgroundColor: colors.card }]}
              accessibilityRole="button"
              accessibilityLabel={secondaryLabel}
            >
              <Text style={[styles.actionText, { color: colors.foreground }]}>
                {secondaryLabel}
              </Text>
            </PressableOpacity>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 48,
    paddingHorizontal: 22,
    gap: 0,
  },
  iconWrap: {
    width: 110,
    height: 110,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  title: {
    fontSize: 26,
    fontFamily: fonts.heading,
    fontWeight: '700',
    lineHeight: 28,
    textAlign: 'center',
    letterSpacing: -0.5,
    maxWidth: 300,
  },
  description: {
    fontSize: 14,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
    marginTop: 12,
  },
  ctaGroup: {
    width: '100%',
    marginTop: 28,
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    paddingHorizontal: 24,
    borderRadius: 999,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
})
