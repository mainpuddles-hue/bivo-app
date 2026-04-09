import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Returns `true` when the user has enabled "Reduce Motion" in system accessibility settings.
 *
 * Apple HIG: respect user's reduced motion preference by disabling or
 * simplifying non-essential animations (entrance, loops, spring bounces).
 *
 * Usage:
 *   const reduceMotion = useReduceMotion()
 *   Animated.timing(x, { duration: reduceMotion ? 0 : 300, ... }).start()
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled().then(enabled => {
      if (!cancelled) setReduceMotion(enabled)
    }).catch(() => {})

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled)
    })
    return () => { cancelled = true; sub.remove() }
  }, [])

  return reduceMotion
}
