import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, type ViewStyle } from 'react-native'
import { useReduceMotion } from '@/hooks/useReduceMotion'

/**
 * Staggered entrance animation — slide up + fade in.
 *
 * Each child mounts with a delay based on its `index`, creating
 * a cascading reveal effect. Respects prefers-reduced-motion.
 *
 * Top-Design pillar 3: "Page load choreography follows a strict timeline"
 */
interface AnimatedEntranceProps {
  children: ReactNode
  index?: number
  /** Stagger delay between items (ms). Default 60 */
  stagger?: number
  /** Animation duration (ms). Default 350 */
  duration?: number
  /** Vertical slide distance (px). Default 20 */
  slideDistance?: number
  style?: ViewStyle
}

export function AnimatedEntrance({
  children,
  index = 0,
  stagger = 60,
  duration = 350,
  slideDistance = 20,
  style,
}: AnimatedEntranceProps) {
  const reduceMotion = useReduceMotion()
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : slideDistance)).current

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1)
      translateY.setValue(0)
      return
    }

    const delay = index * stagger

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]).start()
  }, [opacity, translateY, index, stagger, duration, reduceMotion, slideDistance])

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      {children}
    </Animated.View>
  )
}
