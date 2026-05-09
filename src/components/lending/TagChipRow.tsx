import { StyleSheet, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

interface TagChipRowProps {
  /** All possible tag keys with their display labels. Order is preserved. */
  tags: { key: string; label: string }[]
  /** Currently selected keys. */
  selected: string[]
  onChange: (next: string[]) => void
}

export function TagChipRow({ tags, selected, onChange }: TagChipRowProps) {
  const { colors } = useTheme()

  return (
    <View style={styles.row}>
      {tags.map(({ key, label }) => {
        const isOn = selected.includes(key)
        const toggle = () => {
          try { Haptics.selectionAsync() } catch {}
          onChange(isOn ? selected.filter(k => k !== key) : [...selected, key])
        }
        return (
          <PressableOpacity
            key={key}
            onPress={toggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isOn }}
            accessibilityLabel={label}
            hitSlop={4}
            style={[
              styles.chip,
              isOn
                ? { backgroundColor: colors.foreground, borderColor: colors.foreground }
                : { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {isOn && (
              <Check size={10} strokeWidth={2.5} color={colors.primaryForeground} />
            )}
            <Text
              style={[
                styles.label,
                { color: isOn ? colors.primaryForeground : colors.foreground },
              ]}
            >
              {label}
            </Text>
          </PressableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontSize: 11.5,
    fontFamily: fonts.bodyMedium,
    fontWeight: '500',
  },
})
