import { Platform } from 'react-native'

/**
 * 3-tier shadow system with tinted colors (2026 trend).
 * sm: subtle lift (lists, chips)
 * md: standard card elevation
 * lg: prominent elevation (modals, FAB, floating elements)
 */

export const shadowSm = Platform.select({
  ios: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  android: { elevation: 1 },
  default: {},
}) as any

export const shadowMd = Platform.select({
  ios: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
  },
  android: { elevation: 3 },
  default: {},
}) as any

export const shadowLg = Platform.select({
  ios: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
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
    shadowRadius: 4,
  },
  android: { elevation: 2 },
  default: {},
}) as any

export const shadowMdDark = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.30,
    shadowRadius: 10,
  },
  android: { elevation: 4 },
  default: {},
}) as any

export const shadowLgDark = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.40,
    shadowRadius: 20,
  },
  android: { elevation: 8 },
  default: {},
}) as any

// Category-tinted shadows for PostCards
export function categoryCardShadow(categoryColor: string, isDark: boolean) {
  if (isDark) return shadowMdDark
  return Platform.select({
    ios: {
      shadowColor: categoryColor,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
    },
    android: { elevation: 3 },
    default: {},
  })
}

// Legacy aliases
export const cardShadow = shadowMd
export const cardShadowDark = shadowMdDark
