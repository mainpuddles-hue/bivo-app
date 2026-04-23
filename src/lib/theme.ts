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
    accentForeground: '#FFFFFF',
    surfaceOverlay: 'rgba(255,255,255,0.82)',
    surfaceTinted: 'rgba(26,29,31,0.04)', // ink tint
    warmTint: '#F0EEE9',               // warm neutral for text-only cards, suggestion banners
    onInkMuted: '#B8BCC0',             // muted text on ink surfaces (subtitles on selected items)
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
    border: '#26292D',             // dark hairline
    muted: '#202326',              // dark wash
    mutedForeground: '#8B8F94',    // dark meta
    tertiaryForeground: '#656A6F', // dark placeholder — WCAG 3.09:1+ on card
    destructive: '#FF453A',        // iOS system red dark
    pro: '#FBBF24',
    success: '#34D399',
    info: '#0A84FF',
    purple: '#BF5AF2',
    purpleMuted: '#1E1628',
    primaryForeground: '#1A1D1F',  // dark on-ink (dark text on light buttons)
    accentForeground: '#1A1D1F',
    surfaceOverlay: 'rgba(14,16,18,0.82)',
    surfaceTinted: 'rgba(245,246,247,0.06)',
    warmTint: '#2A2722',               // dark warm neutral
    onInkMuted: '#4A4D51',             // muted text on ink surfaces (dark mode)
  },
}

// --- Gradient pairs for LinearGradient (ink-based, no emerald) ---
export const gradients = {
  primary:      ['#1A1D1F', '#2A2D30'] as [string, string],
  primarySoft:  ['#E8EAEC', '#D4D7DA'] as [string, string],
  hero:         ['#1A1D1F', '#3B82F6'] as [string, string],
  warm:         ['#F59E0B', '#EF4444'] as [string, string],
  loginLight:   ['#F5F6F7', '#EEF0F2'] as [string, string],
  loginDark:    ['#0E1012', '#17191C'] as [string, string],
}

// Category-specific gradient pairs (vibrant for Create screen bento grid)
export const categoryGradients: Record<string, [string, string]> = {
  tarvitsen:  ['#FF7B5C', '#C75B3A'],
  tarjoan:    ['#9B6DD7', '#7C5CBF'],
  ilmaista:   ['#5B9BF0', '#3B7DD8'],
  lainaa:     ['#D9A040', '#A97A1E'],
  tapahtuma:  ['#34D399', '#2B8A62'],
}

// Category tint colors for PostCard backgrounds (6-8% opacity)
export const categoryTints: Record<string, { light: string; dark: string }> = {
  tarvitsen:  { light: 'rgba(199,91,58,0.06)',  dark: 'rgba(255,123,92,0.10)' },
  tarjoan:    { light: 'rgba(124,92,191,0.06)', dark: 'rgba(155,109,215,0.10)' },
  ilmaista:   { light: 'rgba(59,125,216,0.06)', dark: 'rgba(91,155,240,0.10)' },
  lainaa:     { light: 'rgba(201,139,46,0.06)', dark: 'rgba(232,176,80,0.10)' },
  tapahtuma:  { light: 'rgba(43,138,98,0.06)',  dark: 'rgba(52,211,153,0.10)' },
}

// Category accent colors (for left border, badge prominent styling)
export const categoryAccents: Record<string, string> = {
  tarvitsen: '#C75B3A',
  tarjoan:   '#7C5CBF',
  ilmaista:  '#3B7DD8',
  lainaa:    '#A97A1E',
  tapahtuma: '#2B8A62',
}

// --- Shadows: ink-tinted light, black dark ---
export const shadows = {
  light: {
    sm: { shadowColor: '#1A1D1F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2 },
    md: { shadowColor: '#1A1D1F', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.06, shadowRadius: 16 },
    lg: { shadowColor: '#1A1D1F', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.10, shadowRadius: 40 },
  },
  dark: {
    sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.40, shadowRadius: 2 },
    md: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.50, shadowRadius: 12 },
    lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.60, shadowRadius: 32 },
  },
}

// --- Typography scale ---
export const typography = {
  display:   { fontSize: 32, fontWeight: '600' as const, letterSpacing: -0.9, lineHeight: 36 },
  h1:        { fontSize: 24, fontWeight: '600' as const, letterSpacing: -0.5, lineHeight: 30 },
  h2:        { fontSize: 19, fontWeight: '600' as const, letterSpacing: -0.3, lineHeight: 25 },
  h3:        { fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.15, lineHeight: 22 },
  body:      { fontSize: 15, fontWeight: '400' as const, letterSpacing: 0,    lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, letterSpacing: 0,    lineHeight: 18 },
  caption:   { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0,    lineHeight: 16 },
}

// --- Radii ---
export const radii = {
  chip: 999,
  pill: 999,
  input: 20,
  card: 20,
  post: 24,
  modal: 28,
  hero: 32,
} as const

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
  accentForeground: string
  surfaceOverlay: string
  surfaceTinted: string
  warmTint: string
  onInkMuted: string
}
