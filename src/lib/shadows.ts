import { Platform } from 'react-native'

/**
 * Helsinki Monochrome — ink-tinted shadow system.
 * sm: subtle raise (cards, buttons)
 * md: clear separation (dropdowns, popovers)
 * lg: prominent elevation (modals, FAB, floating elements)
 *
 * Use getShadow(isDark, 'sm'|'md'|'lg') for theme-aware shadows.
 */

export const shadowSm = Platform.select({
  ios: {
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  android: { elevation: 1 },
  default: {},
}) as any

export const shadowMd = Platform.select({
  ios: {
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  android: { elevation: 3 },
  default: {},
}) as any

export const shadowLg = Platform.select({
  ios: {
    shadowColor: '#1A1D1F',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.10,
    shadowRadius: 40,
  },
  android: { elevation: 6 },
  default: {},
}) as any

// Dark mode variants
export const shadowSmDark = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.20,
    shadowRadius: 3,
  },
  android: { elevation: 2 },
  default: {},
}) as any

export const shadowMdDark = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  android: { elevation: 4 },
  default: {},
}) as any

export const shadowLgDark = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.60,
    shadowRadius: 32,
  },
  android: { elevation: 8 },
  default: {},
}) as any

/** Theme-aware shadow helper — returns correct shadow for current theme */
export function getShadow(isDark: boolean, level: 'sm' | 'md' | 'lg') {
  if (isDark) {
    return level === 'sm' ? shadowSmDark : level === 'md' ? shadowMdDark : shadowLgDark
  }
  return level === 'sm' ? shadowSm : level === 'md' ? shadowMd : shadowLg
}

/**
 * Theme-aware overlay color — black overlay in light mode, subtle white in dark mode.
 * For modal backdrops, image overlays, scrim effects.
 */
export function overlay(isDark: boolean, opacity = 0.5): string {
  return isDark
    ? `rgba(0,0,0,${Math.min(opacity + 0.2, 0.85)})`
    : `rgba(0,0,0,${opacity})`
}

/**
 * Theme-aware image overlay — always dark for text readability on photos.
 * Slightly more opaque in dark mode for contrast.
 */
export function imageOverlay(isDark: boolean, opacity = 0.45): string {
  return `rgba(0,0,0,${isDark ? Math.min(opacity + 0.1, 0.75) : opacity})`
}
