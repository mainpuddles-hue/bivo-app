import { useColorScheme } from 'react-native'
import { colors, type ThemeColors } from '@/lib/theme'

export function useTheme(): { colors: ThemeColors; isDark: boolean } {
  const scheme = useColorScheme()
  const isDark = scheme === 'dark'
  return {
    colors: isDark ? colors.dark : colors.light,
    isDark,
  }
}
