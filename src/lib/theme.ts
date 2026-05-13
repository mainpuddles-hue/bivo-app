// BIVO warm palette — design handoff tokens mapped to Helsinki Monochrome semantics.

export const colors = {
  light: {
    // BIVO tokens: ink=#0A0A0A, ink2=#5E5E58, ink3=#8E8E88,
    // hair=#EAEAE5, hair2=#D8D8D2, surface=#FFF, surface2=#F3F1EB,
    // bg=#F8F6F0, live=#2A5F3F
    primary: '#0A0A0A',
    accent: '#1A1A1A',
    secondary: '#FF9500',
    background: '#F8F6F0',
    foreground: '#0A0A0A',
    card: '#FFFFFF',
    cardElevated: '#F3F1EB',
    border: '#EAEAE5',
    muted: '#F3F1EB',
    mutedForeground: '#5E5E58',
    tertiaryForeground: '#8E8E88',
    destructive: '#C44536',
    pro: '#F59E0B',
    success: '#2A5F3F',
    info: '#3B82F6',
    purple: '#7C5CBF',
    purpleMuted: '#F4F0FF',
    primaryForeground: '#FFFFFF',
    surfaceTinted: 'rgba(10,10,10,0.04)',
    warmTint: '#F3F1EB',
    onInkMuted: '#B8BCC0',
    borderStrong: '#D8D8D2',
    danger: '#C44536',
    successBg: '#E6EFEA',
    disabledForeground: '#D4D4D1',
    // Trust tier indicator colors. Tier 1 = bronze/neutral, Tier 2 = info-blue,
    // Tier 3 = success-green. Bound separately from `success` so trust remains
    // its own semantic axis; consumed by TrustBadge / TrustGate via `colors.trustTier{N}`.
    trustTier1: '#9CA3AF',              // neutral grey — Tier 1 (basic verified)
    trustTier2: '#3B82F6',              // info blue — Tier 2 (phone + address)
    trustTier3: '#2A5F3F',              // live green — Tier 3 (ID verified)
  },
  dark: {
    // Helsinki Monochrome dark: inverted ink palette
    primary: '#F5F6F7',            // inverted ink
    accent: '#E8EAEC',             // inverted ink-soft
    secondary: '#FFAD33',
    background: '#0E1012',         // near-black canvas
    foreground: '#F5F6F7',         // near-white text
    card: '#17191C',               // dark surface
    cardElevated: '#1C1E21',       // slightly elevated
    border: '#2E3136',             // dark hairline — 1.45:1 vs card (visible separator)
    muted: '#202326',              // dark wash
    mutedForeground: '#8B8F94',    // dark meta — WCAG AA 5.4:1 on card
    tertiaryForeground: '#7D838A', // dark placeholder — WCAG AA 4.6:1 on card
    destructive: '#FF453A',        // iOS system red dark
    pro: '#FBBF24',
    success: '#34D399',
    info: '#0A84FF',
    purple: '#BF5AF2',
    purpleMuted: '#1E1628',
    primaryForeground: '#1A1D1F',  // dark on-ink (dark text on light buttons)
    surfaceTinted: 'rgba(245,246,247,0.06)',
    warmTint: '#2A2722',               // dark warm neutral
    onInkMuted: '#4A4D51',             // muted text on ink surfaces (dark mode)
    borderStrong: '#4A4D51',            // stronger border for emphasis (inputs, active states)
    danger: '#FF453A',                  // semantic danger — logout, destructive rows
    successBg: '#1A3329',                   // dark success tint
    disabledForeground: '#4A4D51',          // dark disabled text
    // Trust tier — dark-mode shifts for legibility on dark surfaces.
    trustTier1: '#B5BAC2',              // brighter neutral
    trustTier2: '#60A5FA',              // brighter info blue
    trustTier3: '#34D399',              // brighter success green
  },
}

// Brighter category colors for dark mode — WCAG AA 4.5:1+ on dark card (#17191C)
export const categoryColorsDark: Record<string, string> = {
  tarvitsen: '#D4734F',  // 5.23:1 on #17191C
  tarjoan:   '#9B7DD4',  // 5.27:1 on #17191C
  ilmaista:  '#5B9BF0',  // 5.93:1 on #17191C
  lainaa:    '#C99A3E',  // 6.45:1 on #17191C
  tapahtuma: '#3AAE7A',  // 6.30:1 on #17191C
}

export type ThemeColors = {
  primary: string
  accent: string
  secondary: string
  background: string
  foreground: string
  card: string
  cardElevated: string
  border: string
  muted: string
  mutedForeground: string
  tertiaryForeground: string
  destructive: string
  pro: string
  success: string
  info: string
  purple: string
  purpleMuted: string
  primaryForeground: string
  surfaceTinted: string
  warmTint: string
  onInkMuted: string
  borderStrong: string
  danger: string
  successBg: string
  disabledForeground: string
  trustTier1: string
  trustTier2: string
  trustTier3: string
}
