import { StyleSheet, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

export interface ChecklistItem {
  key: string
  label: string
  optional?: boolean
}

interface PreReturnChecklistProps {
  items: ChecklistItem[]
  /** Map of itemKey → checked. Items missing from the map are unchecked. */
  value: Record<string, boolean>
  onChange: (next: Record<string, boolean>) => void
  /** Larger checkboxes for the Return-screen step 2 (default 20px → 22px). */
  size?: 'compact' | 'comfortable'
  /** Disable interaction (e.g. while submitting). */
  disabled?: boolean
}

/**
 * Renders a card of checklist rows separated by 1px hairlines. Done items
 * keep their label colored mutedForeground; no strikethrough per the
 * design handoff. Tapping a row toggles its boolean optimistically and
 * fires onChange with the new full map — caller is responsible for any
 * debounced PATCH.
 */
export function PreReturnChecklist({
  items,
  value,
  onChange,
  size = 'compact',
  disabled,
}: PreReturnChecklistProps) {
  const { colors } = useTheme()
  if (!items || items.length === 0) return null

  const box = size === 'compact' ? 20 : 22
  const radius = size === 'compact' ? 6 : 7

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {items.map((item, idx) => {
        const checked = !!value[item.key]
        const last = idx === items.length - 1
        const toggle = () => {
          if (disabled) return
          try { Haptics.selectionAsync() } catch {}
          onChange({ ...value, [item.key]: !checked })
        }
        return (
          <PressableOpacity
            key={item.key}
            onPress={toggle}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled: !!disabled }}
            accessibilityLabel={item.label}
            style={[
              styles.row,
              { borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.box,
                {
                  width: box,
                  height: box,
                  borderRadius: radius,
                  backgroundColor: checked ? colors.foreground : 'transparent',
                  borderWidth: checked ? 0 : 1.5,
                  borderColor: colors.border,
                },
              ]}
            >
              {checked && (
                <Check size={box - 8} color={colors.primaryForeground} strokeWidth={2.5} />
              )}
            </View>
            <Text
              style={[
                styles.label,
                { color: checked ? colors.mutedForeground : colors.foreground },
              ]}
              numberOfLines={2}
            >
              {item.label}
              {item.optional && (
                <Text style={[styles.optional, { color: colors.tertiaryForeground }]}>
                  {'  '}(valinnainen)
                </Text>
              )}
            </Text>
          </PressableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
    lineHeight: 19,
  },
  optional: {
    fontSize: 12,
    fontFamily: fonts.body,
    fontWeight: '400',
  },
})
