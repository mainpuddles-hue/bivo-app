import { Platform } from 'react-native'

/**
 * Card shadow — tinted with primary color for modern depth.
 * 2026 trend: colored shadows instead of pure black.
 */
export const cardShadow = Platform.select({
  ios: {
    shadowColor: '#2D6B5E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
  },
  android: {
    elevation: 3,
  },
  default: {},
}) as any

export const cardShadowDark = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.30,
    shadowRadius: 10,
  },
  android: {
    elevation: 4,
  },
  default: {},
}) as any
