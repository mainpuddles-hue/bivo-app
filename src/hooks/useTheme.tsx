import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors, type ThemeColors } from '@/lib/theme'

type ThemeMode = 'system' | 'light' | 'dark'

interface ThemeContextValue {
  colors: ThemeColors
  isDark: boolean
  theme: ThemeMode
  setTheme: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'tackbird-theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme()
  const [theme, setThemeState] = useState<ThemeMode>('system')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setThemeState(stored)
      }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode)
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {})
  }, [])

  const isDark = theme === 'system' ? systemScheme === 'dark' : theme === 'dark'
  const themeColors = isDark ? colors.dark : colors.light

  const value: ThemeContextValue = useMemo(() => ({
    colors: themeColors,
    isDark,
    theme,
    setTheme,
  }), [themeColors, isDark, theme, setTheme])

  if (!loaded) return null

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const scheme = useColorScheme()
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    const isDark = scheme === 'dark'
    return { colors: isDark ? colors.dark : colors.light, isDark, theme: 'system', setTheme: () => {} }
  }
  return ctx
}
