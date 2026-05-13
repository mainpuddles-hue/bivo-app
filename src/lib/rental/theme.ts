import { useMemo } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'
import type { ThemeColors } from '@/lib/theme'

export interface LegacyTokens {
  bg: string
  bg2: string
  ink: string
  ink2: string
  ink3: string
  ink4: string
  hair: string
  hair2: string
  surface: string
  surface2: string
  live: string
  liveBg: string
  sans: string
  sansMedium: string
  sansSemiBold: string
  sansBold: string
  r: { tile: number }
}

function mapTokens(c: ThemeColors): LegacyTokens {
  return {
    bg: c.background,
    bg2: c.muted,
    ink: c.foreground,
    ink2: c.mutedForeground,
    ink3: c.tertiaryForeground,
    ink4: c.tertiaryForeground,
    hair: c.border,
    hair2: c.border,
    surface: c.card,
    surface2: c.cardElevated,
    live: c.success,
    liveBg: c.success + '1A',
    sans: fonts.body,
    sansMedium: fonts.bodyMedium,
    sansSemiBold: fonts.bodySemi,
    sansBold: fonts.heading,
    r: { tile: 12 },
  }
}

export function useLegacyTokens(): LegacyTokens {
  const { colors } = useTheme()
  return useMemo(() => mapTokens(colors), [colors])
}
