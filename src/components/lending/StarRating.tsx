import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Polygon } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { useTheme } from '@/hooks/useTheme'

interface StarRatingProps {
  value: number
  onChange?: (rating: number) => void
  size?: number
  gap?: number
  max?: number
  /** If true, taps don't fire onChange. */
  readOnly?: boolean
}

const STAR_POINTS = '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2'

export function StarRating({
  value,
  onChange,
  size = 30,
  gap = 10,
  max = 5,
  readOnly = false,
}: StarRatingProps) {
  const { colors } = useTheme()
  const interactive = !readOnly && !!onChange

  return (
    <View style={[styles.row, { gap }]} accessibilityRole="adjustable" accessibilityValue={{ min: 0, max, now: value }}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < value
        const handlePress = () => {
          if (!interactive) return
          try { Haptics.selectionAsync() } catch {}
          onChange?.(i + 1)
        }
        return (
          <Pressable
            key={i}
            onPress={handlePress}
            disabled={!interactive}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${i + 1} ${i + 1 === 1 ? 'tähti' : 'tähteä'}`}
          >
            <Svg width={size} height={size} viewBox="0 0 24 24">
              <Polygon
                points={STAR_POINTS}
                fill={filled ? colors.foreground : 'none'}
                stroke={colors.foreground}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
})
