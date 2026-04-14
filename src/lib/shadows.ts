import { Platform } from 'react-native'

/**
 * Medium shadow — cards, modals.
 *
 * Previously this module also exported small/large variants (smallShadow,
 * smallShadowDark, largeShadow, largeShadowDark) but none of them were
 * imported anywhere in the app per a knip audit. Add them back when a
 * component actually needs something other than the card shadow.
 */
export const cardShadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
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
