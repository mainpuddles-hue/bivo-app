/**
 * Shared UI primitives for TackBird Mobile.
 *
 * These components enforce UI UX Pro Max consistency rules:
 * - PressableOpacity: automatic pressed feedback (opacity 0.7)
 * - BackButton: standardized back navigation (44pt, ArrowLeft 24)
 * - ModalCloseButton: standardized modal close (44pt, X 22)
 *
 * Usage:
 *   import { PressableOpacity, BackButton, ModalCloseButton } from '@/components/ui'
 */
export { PressableOpacity } from './PressableOpacity'
export { BackButton } from './BackButton'
export { ModalCloseButton } from './ModalCloseButton'
export { KeyboardDoneAccessory, KEYBOARD_DONE_ID } from './KeyboardDoneAccessory'
export { ThemedTextInput } from './ThemedTextInput'
