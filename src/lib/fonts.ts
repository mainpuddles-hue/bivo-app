/**
 * Bivo Helsinki Monochrome typography
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
 * Minimum text: 11px (iOS HIG). Scale: 11 / 12 / 13 / 15 / 16 / 18 / 20 / 24 / 28 / 32.
 */
export const typeScale = {
  /** 11/15 — absolute minimum (badges, status indicators) */
  micro: { fontSize: 11, lineHeight: 15 },
  /** 12/17 — small text (pills, captions) */
  caption: { fontSize: 12, lineHeight: 17 },
  /** 13/18 — compact body text */
  bodySmall: { fontSize: 13, lineHeight: 18 },
  /** 15/21 — card titles, secondary body */
  body: { fontSize: 15, lineHeight: 21 },
  /** 16/22 — default body (iOS HIG: 17pt recommended) */
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
  /** 44/50 — dramatic display for key screens */
  displayXL: { fontSize: 44, lineHeight: 50 },
  /** 64/70 — hero moment, viewport-commanding */
  displayHero: { fontSize: 64, lineHeight: 70 },
} as const
