import { InputAccessoryView, Keyboard, Platform, StyleSheet, Text, View } from 'react-native'
import { PressableOpacity } from './PressableOpacity'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'

/**
 * Shared "Done" toolbar that sits above the iOS keyboard so users can dismiss
 * multiline TextInputs with one tap. Apple HIG recommends a keyboard accessory
 * view for any text field where the return key is not a submit action.
 *
 * Usage:
 *   1. Render once near the root (e.g. inside the screen that owns the input).
 *   2. Give the TextInput matching `inputAccessoryViewID` — e.g.
 *      `<TextInput inputAccessoryViewID={KEYBOARD_DONE_ID} multiline ... />`
 *
 * iOS only — InputAccessoryView renders nothing on Android. On Android the
 * system keyboard already provides a dismiss affordance.
 */
export const KEYBOARD_DONE_ID = 'tackbird-keyboard-done'

export function KeyboardDoneAccessory() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()

  if (Platform.OS !== 'ios') return null

  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View style={[
        styles.bar,
        {
          backgroundColor: isDark ? colors.card : colors.muted,
          borderTopColor: colors.border,
        },
      ]}>
        <PressableOpacity
          onPress={() => Keyboard.dismiss()}
          hitSlop={8}
          style={styles.btn}
          accessibilityRole="button"
          accessibilityLabel={t('common.done') ?? 'Done'}
        >
          <Text style={[styles.btnText, { color: colors.foreground }]}>
            {t('common.done') ?? 'Done'}
          </Text>
        </PressableOpacity>
      </View>
    </InputAccessoryView>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btn: {
    minWidth: 60,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  btnText: {
    fontSize: 17,
    fontFamily: fonts.bodySemi,
    fontWeight: '600',
    lineHeight: 22,
  },
})
