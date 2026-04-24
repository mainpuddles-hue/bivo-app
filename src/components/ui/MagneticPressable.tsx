import { useRef, useCallback } from 'react'
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useReduceMotion } from '@/hooks/useReduceMotion'

interface MagneticPressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
  /** Scale when pressed. Default 0.92 */
  pressedScale?: number
  /** Spring friction. Default 4 */
  friction?: number
  /** Spring tension. Default 200 */
  tension?: number
  /** Haptic feedback on press. Default true */
  haptic?: boolean
}

/**
 * Pressable with spring-physics press feedback.
 *
 * Top-Design pillar 7: "Magnetic buttons with custom cursors"
 * UI/UX Pro Max: "Visual feedback on press (ripple/highlight; MD state layers)"
 *
 * Creates a satisfying spring-scale effect on press with optional haptics.
 * Falls back to instant scale change when reduce motion is enabled.
 */
export function MagneticPressable({
  style,
  pressedScale = 0.92,
  friction = 4,
  tension = 200,
  haptic = true,
  onPressIn,
  onPressOut,
  ...props
}: MagneticPressableProps) {
  const reduceMotion = useReduceMotion()
  const scale = useRef(new Animated.Value(1)).current

  const handlePressIn = useCallback(
    (e: any) => {
      if (haptic) {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
      }

      if (reduceMotion) {
        scale.setValue(pressedScale)
      } else {
        Animated.spring(scale, {
          toValue: pressedScale,
          friction,
          tension,
          useNativeDriver: true,
        }).start()
      }

      onPressIn?.(e)
    },
    [scale, pressedScale, friction, tension, reduceMotion, haptic, onPressIn],
  )

  const handlePressOut = useCallback(
    (e: any) => {
      if (reduceMotion) {
        scale.setValue(1)
      } else {
        Animated.spring(scale, {
          toValue: 1,
          friction: 3,
          tension: 300,
          useNativeDriver: true,
        }).start()
      }

      onPressOut?.(e)
    },
    [scale, reduceMotion, onPressOut],
  )

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        hitSlop={8}
        {...props}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={(state) => {
          const baseStyle = typeof style === 'function' ? style(state) : style
          return baseStyle
        }}
      />
    </Animated.View>
  )
}
