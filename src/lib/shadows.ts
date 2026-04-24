import { Platform } from 'react-native'

/**
 * Helsinki Monochrome — ink-tinted shadow system.
 * sm: subtle raise (cards, buttons)
 * md: clear separation (dropdowns, popovers)
 * lg: prominent elevation (modals, FAB, floating elements)
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
