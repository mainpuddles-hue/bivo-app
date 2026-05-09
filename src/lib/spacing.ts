/**
 * TackBird spacing tokens — Helsinki Monochrome v3.
 *
 * 4-point grid. The named scale matches what slice 1 / slice 2 / slice 3
 * components were built against, formalized so the rest of the app stops
 * inventing one-off gaps. Aesthetic-Usability principle: consistency
 * reads as polish; ad-hoc spacing reads as carelessness.
 *
 * Usage:
 *   gap: spacing.md          // 12px (between related elements)
 *   paddingHorizontal: spacing.xl   // 16px (card / screen edge)
 *   marginBottom: spacing['2xl']    // 24px (between sibling sections)
 */
export const spacing = {
  /** 2px — hairline / icon-to-icon adjustments. Avoid for layout. */
  xxs: 2,
  /** 4px — within-element padding (chip icon-to-text). */
  xs: 4,
  /** 8px — tight grouping (siblings inside a row). */
  sm: 8,
  /** 12px — default related-elements gap (gap inside a card). */
  md: 12,
  /** 14px — comfortable card padding (compact cards). */
  cardCompact: 14,
  /** 16px — screen-edge padding, card padding (default). */
  xl: 16,
  /** 18px — comfortable card padding (review / status banner). */
  cardComfortable: 18,
  /** 20px — between chunks within a section. */
  '2xl': 20,
  /** 24px — between sibling sections. */
  '3xl': 24,
  /** 32px — between major sections within a screen. */
  '4xl': 32,
  /** 40px — between major sections (alternative, denser layouts). */
  '5xl': 40,
  /** 48px — page-level section break. */
  '6xl': 48,
  /** 64px — hero spacing (rare). */
  '7xl': 64,
} as const

/**
 * Border radii — matched to the design handoff. Cards use 18 (default),
 * compact strips use 14, modals/PIN cards use 24, chips/pills/CTA use 999.
 */
export const radius = {
  /** 0 — sharp edges (flat sections, no card chrome). */
  none: 0,
  /** 8 — small inputs / status chips. */
  sm: 8,
  /** 12 — image thumbnails. */
  md: 12,
  /** 14 — compact strip cards (item summary, payment methods). */
  cardCompact: 14,
  /** 18 — default card radius. */
  card: 18,
  /** 20 — input fields. */
  input: 20,
  /** 24 — PIN card / hero cards / modals. */
  hero: 24,
  /** 28 — modal sheets. */
  modal: 28,
  /** 999 — chips, pills, CTA buttons, circle buttons. */
  pill: 999,
} as const

/**
 * Stroke widths for icons + borders. Slice 1 components settled on these
 * three after the design handoff; everything else should align.
 */
export const strokeWidth = {
  /** 1.5 — default Lucide icons (chevron, etc). */
  icon: 1.5,
  /** 1.7 — section icons (Building2, Package, Lock). */
  iconBold: 1.7,
  /** 2 — semantic icons (status dots, inline meta). */
  meta: 2,
  /** 2.5 — emphatic icons (check marks, completion). */
  emphatic: 2.5,
} as const

export type SpacingToken = keyof typeof spacing
export type RadiusToken = keyof typeof radius
