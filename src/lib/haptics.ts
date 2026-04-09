import * as Haptics from 'expo-haptics'

/**
 * Haptic helpers — safe wrappers that swallow failures on platforms
 * without haptic support (web, older Android, Expo Go quirks).
 *
 * Use instead of inline `try { Haptics.impactAsync(...) } catch {}` which
 * was copy-pasted 100+ times across the codebase.
 */

export function hapticLight() {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {}
}

export function hapticMedium() {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
}

export function hapticHeavy() {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy) } catch {}
}

export function hapticSelection() {
  try { Haptics.selectionAsync() } catch {}
}

export function hapticSuccess() {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {}
}

export function hapticWarning() {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning) } catch {}
}

export function hapticError() {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error) } catch {}
}

/**
 * Wraps a refresh callback with a medium haptic tap. Use in RefreshControl:
 *
 *   refreshControl={<RefreshControl onRefresh={withHapticRefresh(fn)} ... />}
 */
export function withHapticRefresh(fn: () => void | Promise<void>) {
  return () => {
    hapticMedium()
    return fn()
  }
}
