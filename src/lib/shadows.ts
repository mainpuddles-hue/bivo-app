import { Platform } from 'react-native'

/**
 * Helsinki Monochrome — ink-tinted shadow system.
 * lg: prominent elevation (modals, FAB, floating elements)
 */

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

// Dark mode variant
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
