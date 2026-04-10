import * as Haptics from 'expo-haptics'

/**
 * Haptic helpers — safe wrappers that swallow failures on platforms
 * without haptic support (web, older Android, Expo Go quirks).
 *
 * Only the actively-used helpers are exported. Previously this module
 * exposed Light/Heavy/Selection/Success/Warning/Error variants but a
 * gitnexus call-graph audit confirmed none of them were ever imported
 * — the codebase uses inline `try { Haptics.impactAsync(...) } catch {}`
 * blocks for all non-medium haptics. Keep this file minimal to avoid
 * accumulating unused surface area.
 */

export function hapticMedium() {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
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
