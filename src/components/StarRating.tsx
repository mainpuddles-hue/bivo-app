import { View, Pressable } from 'react-native'
import { Star } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'

interface StarRatingProps {
  rating: number
  onRatingChange?: (rating: number) => void
  size?: number
  gap?: number
}

export function StarRating({ rating, onRatingChange, size = 16, gap = 2 }: StarRatingProps) {
  const { colors } = useTheme()
  const interactiveGap = onRatingChange ? Math.max(gap, 8) : gap
  return (
    <View style={{ flexDirection: 'row', gap: interactiveGap }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Pressable
          key={i}
          onPress={() => onRatingChange?.(i)}
          disabled={!onRatingChange}
          hitSlop={onRatingChange ? 8 : 0}
          style={onRatingChange ? { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' } : undefined}
          accessibilityRole={onRatingChange ? 'button' : undefined}
          accessibilityLabel={onRatingChange ? `${i}/5` : undefined}
        >
          <Star size={size} color={i <= rating ? colors.pro : colors.border} fill={i <= rating ? colors.pro : 'transparent'} />
        </Pressable>
      ))}
    </View>
  )
}
