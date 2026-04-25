/**
 * TackBird Helsinki Monochrome typography
 *
 * Instrument Sans — single family for all text.
 * No secondary heading font.
 *
 * Usage: fontFamily: fonts.heading or fonts.body
 * Type scale: typeScale.bodySmall, typeScale.title, etc.
 */
export const fonts = {
  // Display headings (Bricolage Grotesque — hero titles, section heads)
  display: 'BricolageGrotesque_600SemiBold',
  displayMedium: 'BricolageGrotesque_500Medium',
  displayBold: 'BricolageGrotesque_700Bold',

  // Headings (Instrument Sans — card titles, labels)
  heading: 'InstrumentSans_600SemiBold',
  headingSemi: 'InstrumentSans_600SemiBold',
  headingMedium: 'InstrumentSans_500Medium',

  // Body (Instrument Sans)
  body: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemi: 'InstrumentSans_600SemiBold',
} as const

/**
 * Type scale — consistent fontSize + lineHeight pairs.
 * Minimum body text: 12px. Scale: 12 / 13 / 14 / 16 / 18 / 20 / 24 / 28 / 32.
 */
export const typeScale = {
  /** 12/16 — smallest allowed text (pills, badges, captions) */
  caption: { fontSize: 12, lineHeight: 16 },
  /** 13/18 — compact body text */
  bodySmall: { fontSize: 13, lineHeight: 18 },
  /** 14/20 — default body */
  body: { fontSize: 14, lineHeight: 20 },
  /** 16/22 — emphasized body */
  bodyLarge: { fontSize: 16, lineHeight: 22 },
  /** 18/24 — small title */
  subtitle: { fontSize: 18, lineHeight: 24 },
  /** 20/26 — section title */
  title: { fontSize: 20, lineHeight: 26 },
  /** 24/30 — page title */
  titleLarge: { fontSize: 24, lineHeight: 30 },
  /** 28/34 — display */
  display: { fontSize: 28, lineHeight: 34 },
  /** 32/38 — hero display */
  displayLarge: { fontSize: 32, lineHeight: 38 },
} as const
