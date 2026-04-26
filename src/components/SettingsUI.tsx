import { memo, type ReactNode } from 'react'
import { View, Text, Switch, StyleSheet } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { PressableOpacity } from '@/components/ui'
import { fonts } from '@/lib/fonts'
import type { ThemeColors } from '@/lib/theme'

/** Section label above a group — uppercase, small, muted */
export function SettingsSectionLabel({ children, colors }: { children: ReactNode; colors: ThemeColors }) {
  return (
    <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{children}</Text>
  )
}

/** Grouped card container with surface bg, rounded corners, border */
export function SettingsGroup({ label, children, colors }: { label?: string; children: ReactNode; colors: ThemeColors }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : []
  return (
    <View style={styles.groupWrapper}>
      {label ? <SettingsSectionLabel colors={colors}>{label}</SettingsSectionLabel> : null}
      <View style={[styles.groupContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {items.map((child, i) => (
          <View key={i}>
            {child}
            {i < items.length - 1 && (
              <View style={[styles.groupDivider, { backgroundColor: colors.border }]} />
            )}
          </View>
        ))}
      </View>
    </View>
  )
}

/** Single row inside a SettingsGroup */
export const SettingsRow = memo(function SettingsRow({
  icon,
  iconBg,
  label,
  meta,
  value,
  danger,
  dangerColor,
  chevron = true,
  switchValue,
  onSwitchChange,
  onPress,
  colors,
  isDark,
  disabled,
  accessibilityLabel,
  accessibilityRole,
  children,
}: {
  icon?: ReactNode
  iconBg?: string
  label: string
  meta?: string
  value?: string | null
  danger?: boolean
  dangerColor?: string
  chevron?: boolean
  switchValue?: boolean
  onSwitchChange?: (val: boolean) => void
  onPress?: () => void
  colors: ThemeColors
  isDark?: boolean
  disabled?: boolean
  accessibilityLabel?: string
  accessibilityRole?: 'button' | 'radio' | 'switch'
  children?: ReactNode
}) {
  const textColor = danger ? (dangerColor ?? colors.destructive) : colors.foreground
  const bgColor = iconBg ?? colors.background

  const content = (
    <View style={styles.rowInner}>
      {icon && (
        <View style={[styles.rowIconCircle, { backgroundColor: bgColor }]}>
          {icon}
        </View>
      )}
      <View style={styles.rowTextContainer}>
        <Text style={[styles.rowLabel, { color: textColor }]}>
          {label}
        </Text>
        {meta ? <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{meta}</Text> : null}
      </View>
      {value ? <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text> : null}
      {switchValue !== undefined && onSwitchChange && (
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ false: colors.border, true: colors.foreground }}
          thumbColor={colors.background}
          disabled={disabled}
          style={styles.switchStyle}
          accessibilityLabel={accessibilityLabel ?? label}
        />
      )}
      {children}
      {chevron && switchValue === undefined && !value && !children && (
        <ChevronRight size={14} color={colors.tertiaryForeground} />
      )}
    </View>
  )

  if (onPress && switchValue === undefined) {
    return (
      <PressableOpacity
        onPress={onPress}
        disabled={disabled}
        accessibilityRole={accessibilityRole ?? 'button'}
        accessibilityLabel={accessibilityLabel ?? label}
        style={styles.rowPressable}
      >
        {content}
      </PressableOpacity>
    )
  }

  return <View style={styles.rowPressable}>{content}</View>
})

const styles = StyleSheet.create({
  // ── Group ──
  groupWrapper: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    paddingHorizontal: 4,
    paddingBottom: 8,
    lineHeight: 16,
  },
  groupContainer: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  groupDivider: {
    height: 1,
    marginLeft: 60,
  },

  // ── Row ──
  rowPressable: {},
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextContainer: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.bodyMedium,
    letterSpacing: -0.05,
  },
  rowMeta: {
    fontSize: 12,
    fontFamily: fonts.body,
    marginTop: 4,
    lineHeight: 16,
  },
  rowValue: {
    fontSize: 13,
    fontFamily: fonts.body,
  },
  switchStyle: {
    transform: [{ scaleX: 0.95 }, { scaleY: 0.95 }],
  },
})
