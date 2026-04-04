import { Platform } from 'react-native'

/** Small shadow — map cards, chips, banners */
export const smallShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  android: {
    elevation: 2,
  },
  default: {},
}) as any

export const smallShadowDark = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  android: {
    elevation: 2,
  },
  default: {},
}) as any

/** Medium shadow — cards, modals */
export const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  android: {
    elevation: 4,
  },
  default: {},
}) as any

/** Large shadow — FABs, elevated buttons, prominent UI */
export const largeShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  android: {
    elevation: 6,
  },
  default: {},
}) as any

export const largeShadowDark = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  android: {
    elevation: 8,
  },
  default: {},
}) as any
