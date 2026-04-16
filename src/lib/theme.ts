export const colors = {
  light: {
    primary: '#10B981',
    accent: '#34D399',
    secondary: '#FF9500',      // warm amber — secondary actions, highlights
    background: '#F3F4F6',
    foreground: '#111827',
    card: '#FFFFFF',
    cardElevated: '#FFFFFF',   // elevated cards (modals, overlays)
    border: '#E5E7EB',
    muted: '#F3F4F6',
    mutedForeground: '#6B7280',
    // iOS tertiary label — 3rd hierarchy level (tiny captions, placeholders, disabled states)
    tertiaryForeground: '#9CA3AF',
    destructive: '#DC2626',
    pro: '#F59E0B',
    success: '#2B8A62',
    info: '#3B82F6',
    purple: '#7C5CBF',
    purpleMuted: '#F0EDFF',
    primaryForeground: '#FFFFFF',
    accentForeground: '#FFFFFF',
    // Surface layers for glassmorphism / overlays
    surfaceOverlay: 'rgba(255,255,255,0.72)',
    surfaceTinted: 'rgba(16,185,129,0.06)',
  },
  dark: {
    // Threads-style dark theme: pure black base + hairline separations
    // Per UI/UX Pro Max: desaturated primary for dark mode vibrancy
    primary: '#34D399',        // lighter emerald (was #6FCF97)
    accent: '#6EE7B7',         // even lighter for highlights
    secondary: '#FFAD33',
    background: '#000000',     // pure black (Threads-style)
    foreground: '#FFFFFF',     // pure white for max contrast
    card: '#0C0C0E',           // near-black card (1.5% lighter than bg)
    cardElevated: '#1A1A1D',   // elevated cards, modals, toast
    border: '#262628',         // hairline separator color
    muted: '#141416',          // input/pill inactive background
    mutedForeground: '#8E8E93',// Apple HIG secondary label
    tertiaryForeground: '#636366', // Apple HIG tertiary label
    destructive: '#FF453A',    // iOS system red (dark mode)
    pro: '#FBBF24',
    success: '#34D399',
    info: '#0A84FF',           // iOS system blue (dark mode)
    purple: '#BF5AF2',         // iOS system purple (dark mode)
    purpleMuted: '#1E1628',
    primaryForeground: '#000000',
    accentForeground: '#000000',
    surfaceOverlay: 'rgba(12,12,14,0.82)',
    surfaceTinted: 'rgba(52,211,153,0.06)',
  },
}

// --- Gradient pairs for LinearGradient ---
export const gradients = {
  primary:  ['#10B981', '#059669'] as [string, string],
  primarySoft: ['#D1FAE5', '#A7F3D0'] as [string, string],
  hero:     ['#10B981', '#3B82F6'] as [string, string],
  warm:     ['#F59E0B', '#EF4444'] as [string, string],
  // Login/onboarding background
  loginLight: ['#F3F4F6', '#E0F2FE'] as [string, string],
  loginDark:  ['#0A0A0C', '#0D1B2A'] as [string, string],
}

// Category-specific gradient pairs (vibrant for Create screen bento grid)
export const categoryGradients: Record<string, [string, string]> = {
  tarvitsen:  ['#FF7B5C', '#C75B3A'],
  tarjoan:    ['#9B6DD7', '#7C5CBF'],
  ilmaista:   ['#5B9BF0', '#3B7DD8'],
  lainaa:     ['#E8B050', '#C98B2E'],
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
  lainaa:    '#C98B2E',
  tapahtuma: '#2B8A62',
}

// --- Typography scale ---
export const typography = {
  display:   { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5, lineHeight: 34 },
  h1:        { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3, lineHeight: 28 },
  h2:        { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.2, lineHeight: 24 },
  h3:        { fontSize: 16, fontWeight: '600' as const, letterSpacing: -0.1, lineHeight: 22 },
  body:      { fontSize: 15, fontWeight: '400' as const, letterSpacing: 0,    lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, letterSpacing: 0,    lineHeight: 18 },
  caption:   { fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.5,  lineHeight: 14 },
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
  accentForeground: string
  surfaceOverlay: string
  surfaceTinted: string
}
