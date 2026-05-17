// BIVO warm palette — design handoff tokens mapped to Helsinki Monochrome semantics.

export const colors = {
  light: {
    // BIVO tokens (synced with bivo-shared.jsx):
    // bg=#F4F4F2, bg2=#EBEBE8, surface=#FFF, surface2=#F0F0EE,
    // ink=#0A0A0A, ink4=#D4D4D1, live=#1F5D3F, liveBg=#E6EFEA,
    // hair=rgba(10,10,10,0.06), hair2=rgba(10,10,10,0.10)
    primary: '#0A0A0A',
    accent: '#ABD9DB',
    accentBg: '#E8F4F5',
    secondary: '#FF9500',
    background: '#F4F4F2',
    foreground: '#0A0A0A',
    card: '#FFFFFF',
    cardElevated: '#F0F0EE',
    border: 'rgba(10,10,10,0.06)',
    muted: '#F0F0EE',
    mutedForeground: '#5E5E58',
    tertiaryForeground: '#8E8E88',
    destructive: '#C44536',
    pro: '#F59E0B',
    success: '#1F5D3F',
    info: '#3B82F6',
    purple: '#7C5CBF',
    purpleMuted: '#F4F0FF',
    primaryForeground: '#FFFFFF',
    surfaceTinted: 'rgba(10,10,10,0.04)',
    warmTint: '#F0F0EE',
    onInkMuted: '#B8BCC0',
    borderStrong: 'rgba(10,10,10,0.10)',
    danger: '#C44536',
    successBg: '#E6EFEA',
    disabledForeground: '#D4D4D1',
    // Trust tier indicator colors. Tier 1 = bronze/neutral, Tier 2 = info-blue,
    // Tier 3 = success-green. Bound separately from `success` so trust remains
    // its own semantic axis; consumed by TrustBadge / TrustGate via `colors.trustTier{N}`.
    trustTier1: '#9CA3AF',              // neutral grey — Tier 1 (basic verified)
    trustTier2: '#3B82F6',              // info blue — Tier 2 (phone + address)
    trustTier3: '#1F5D3F',              // live green — Tier 3 (ID verified)
  },
  dark: {
    // BIVO dark (synced with bivo-shared.jsx):
    // bgD=#0A0A0A, surfaceD=#161616, surface2D=#1F1F1F,
    // inkD=#FFFFFF, hairD=rgba(255,255,255,0.10)
    primary: '#FFFFFF',
    accent: '#7CBFC2',             // teal accent — darker for dark mode legibility
    accentBg: '#1A2E2F',          // dark teal tint
    secondary: '#FFAD33',
    background: '#0A0A0A',
    foreground: '#FFFFFF',
    card: '#161616',
    cardElevated: '#1F1F1F',
    border: 'rgba(255,255,255,0.10)',
    muted: '#1F1F1F',
    mutedForeground: '#8B8F94',    // dark meta — WCAG AA on card
    tertiaryForeground: '#7D838A', // dark placeholder — WCAG AA on card
    destructive: '#FF453A',        // iOS system red dark
    pro: '#FBBF24',
    success: '#34D399',
    info: '#0A84FF',
    purple: '#BF5AF2',
    purpleMuted: '#1E1628',
    primaryForeground: '#0A0A0A',
    surfaceTinted: 'rgba(255,255,255,0.06)',
    warmTint: '#1F1F1F',
    onInkMuted: '#4A4D51',             // muted text on ink surfaces
    borderStrong: 'rgba(255,255,255,0.16)',
    danger: '#FF453A',
    successBg: '#1A3329',
    disabledForeground: '#4A4D51',
    // Trust tier — dark-mode shifts for legibility on dark surfaces.
    trustTier1: '#B5BAC2',              // brighter neutral
    trustTier2: '#60A5FA',              // brighter info blue
    trustTier3: '#34D399',              // brighter success green
  },
}

// Brighter category colors for dark mode — WCAG AA 4.5:1+ on dark card (#161616)
export const categoryColorsDark: Record<string, string> = {
  tarvitsen: '#D4734F',  // ~5.5:1 on #161616
  tarjoan:   '#9B7DD4',  // ~5.5:1 on #161616
  ilmaista:  '#5B9BF0',  // ~6.2:1 on #161616
  lainaa:    '#C99A3E',  // ~6.7:1 on #161616
  tapahtuma: '#3AAE7A',  // ~6.6:1 on #161616
}

export type ThemeColors = {
  primary: string
  accent: string
  accentBg: string
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
