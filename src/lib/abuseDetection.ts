let _lastActionTime = 0
let _rapidActionCount = 0

/**
 * Detects rapid-fire actions that suggest bot behavior.
 * Returns true if the action seems legitimate.
 */
export function isHumanAction(): boolean {
  const now = Date.now()
  const timeSinceLast = now - _lastActionTime

  if (timeSinceLast < 500) {
    // Less than 500ms between actions — suspicious
    _rapidActionCount++
    if (_rapidActionCount >= 5) {
      // 5 actions within 500ms each = definitely automated
      return false
    }
  } else {
    _rapidActionCount = 0
  }

  _lastActionTime = now
  return true
}
