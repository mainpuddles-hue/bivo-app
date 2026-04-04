import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'

interface PressableOpacityProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>)
  /** Opacity when pressed. Default 0.7 */
  activeOpacity?: number
}

/**
 * Pressable with automatic pressed state feedback.
 *
 * UI UX Pro Max rule: All tappable elements must provide clear
 * pressed feedback within 80-150ms. Default: opacity 0.7.
 *
 * Drop-in replacement for <Pressable> — just change the import.
 *
 * Usage:
 *   <PressableOpacity onPress={handlePress} style={styles.button}>
 *     <Text>Tap me</Text>
 *   </PressableOpacity>
 */
export function PressableOpacity({ style, activeOpacity = 0.7, ...props }: PressableOpacityProps) {
  return (
    <Pressable
      {...props}
      style={(state) => {
        const baseStyle = typeof style === 'function' ? style(state) : style
        return [baseStyle, state.pressed && { opacity: activeOpacity }]
      }}
    />
  )
}
