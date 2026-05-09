// Helsinki Monochrome — a quiet, confident frame where content brings color.
// No brand emerald, no accent hue. Ink + warm neutrals only.

export const colors = {
  light: {
    // Helsinki Monochrome: ink-on-warm-neutral canvas
    primary: '#1A1D1F',            // ink — primary text, active states, CTA fill
    accent: '#2A2D30',             // ink-soft — hover/press on ink surfaces
    secondary: '#FF9500',
    background: '#F5F6F7',         // warm-neutral canvas
    foreground: '#1A1D1F',         // near-black text
    card: '#FFFFFF',               // white cards stand out against gray bg
    cardElevated: '#FAFAFB',       // slightly recessed blocks
    border: '#E8EAEC',             // hairline separator
    muted: '#EEF0F2',              // wash/tint fill
    mutedForeground: '#535A60',    // meta, captions — WCAG AA 4.6:1 on #F5F6F7
    tertiaryForeground: '#848B93', // placeholder, disabled
    destructive: '#C44536',        // muted red
    pro: '#F59E0B',
    success: '#2D7A4F',            // muted green
    info: '#3B82F6',
    purple: '#7C5CBF',
    purpleMuted: '#F4F0FF',
    primaryForeground: '#FFFFFF',  // on-ink text (white on ink buttons)
    surfaceTinted: 'rgba(26,29,31,0.04)', // ink tint
    warmTint: '#F0EEE9',               // warm neutral for text-only cards, suggestion banners
    onInkMuted: '#B8BCC0',             // muted text on ink surfaces (subtitles on selected items)
    borderStrong: '#C8CBCE',            // stronger border for emphasis (inputs, active states)
    danger: '#C44536',                  // semantic danger — logout, destructive rows
    // Trust tier indicator colors. Tier 1 = bronze/neutral, Tier 2 = info-blue,
    // Tier 3 = success-green. Bound separately from `success` so trust remains
    // its own semantic axis; consumed by TrustBadge / TrustGate via `colors.trustTier{N}`.
    trustTier1: '#9CA3AF',              // neutral grey — Tier 1 (basic verified)
    trustTier2: '#3B82F6',              // info blue — Tier 2 (phone + address)
    trustTier3: '#2D7A4F',              // success green — Tier 3 (ID verified)
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
  trustTier1: string
  trustTier2: string
  trustTier3: string
}
