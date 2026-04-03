import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const { colors } = useTheme()
  return (
    <View style={styles.container}>
      <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}12` }]}>
        {icon}
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {description && (
        <Text style={[styles.description, { color: colors.mutedForeground }]}>{description}</Text>
      )}
      {actionLabel && onAction && (
        <Pressable onPress={onAction} style={({ pressed }) => [styles.actionBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.7 }]}>
          <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 32,
    gap: 12,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.headingSemi,
    lineHeight: 23,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 14,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
})
