import { forwardRef, useState } from 'react'
import { TextInput, StyleSheet, type TextInputProps, type StyleProp, type ViewStyle, type TextStyle } from 'react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'

/**
 * Drop-in TextInput replacement with Apple HIG-style focus state.
 *
 * When the input is focused, the border thickens slightly and picks
 * up the primary color — matching the iOS native UITextField look
 * when embedded in a bordered-style container.
 *
 * All normal TextInput props are forwarded.
 */
interface ThemedTextInputProps extends Omit<TextInputProps, 'style'> {
  style?: StyleProp<TextStyle>
  /** Override border color when not focused */
  defaultBorderColor?: string
}

export const ThemedTextInput = forwardRef<TextInput, ThemedTextInputProps>(
  function ThemedTextInput({ style, defaultBorderColor, onFocus, onBlur, placeholderTextColor, ...rest }, ref) {
    const { colors } = useTheme()
    const [focused, setFocused] = useState(false)
    const borderColor = focused ? colors.primary : (defaultBorderColor ?? colors.border)
    const borderWidth = focused ? 1.5 : StyleSheet.hairlineWidth

    return (
      <TextInput
        ref={ref}
        {...rest}
        onFocus={(e) => { setFocused(true); onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); onBlur?.(e) }}
        placeholderTextColor={placeholderTextColor ?? colors.mutedForeground}
        style={[
          defaultStyles.input,
          {
            color: colors.foreground,
            backgroundColor: colors.card,
            borderColor,
            borderWidth,
            fontFamily: fonts.body,
          },
          style,
        ]}
      />
    )
  },
)

const defaultStyles = StyleSheet.create({
  input: {
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    minHeight: 48,
  },
})
