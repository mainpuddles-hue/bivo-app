import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import fi from './fi.json'

export type Locale = 'fi' | 'en' | 'sv'
export type TFunction = (key: string, params?: Record<string, string | number>) => string

type TranslationMap = Record<string, string | Record<string, unknown>>

const STORAGE_KEY = 'tackbird-locale'

function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'string' ? current : undefined
}

function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (_, doubleKey: string, singleKey: string) => {
    const key = doubleKey ?? singleKey
    return params[key] != null ? String(params[key]) : `{${key}}`
  })
}

interface I18nContextValue {
  t: TFunction
  locale: Locale
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

const localeImports: Record<string, () => Promise<Record<string, unknown>>> = {
  en: () => import('./en.json').then((m) => m.default as unknown as Record<string, unknown>),
  sv: () => import('./sv.json').then((m) => m.default as unknown as Record<string, unknown>),
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('fi')
  const [loadedLocales, setLoadedLocales] = useState<Set<Locale>>(new Set(['fi']))
  const translationCache = useRef<Record<string, TranslationMap>>({
    fi: fi as TranslationMap,
  })

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'en' || stored === 'sv') setLocaleState(stored)
    })
  }, [])

  useEffect(() => {
    if (locale === 'fi') return
    if (translationCache.current[locale]) {
      setLoadedLocales((prev) => {
        if (prev.has(locale)) return prev
        const next = new Set(prev)
        next.add(locale)
        return next
      })
      return
    }
    const loader = localeImports[locale]
    if (!loader) return
    loader().then((mod) => {
      translationCache.current[locale] = mod as TranslationMap
      setLoadedLocales((prev) => {
        const next = new Set(prev)
        next.add(locale)
        return next
      })
    })
  }, [locale])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    AsyncStorage.setItem(STORAGE_KEY, newLocale)
  }, [])

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const currentTranslations = translationCache.current[locale]
      if (currentTranslations) {
        const value = getNestedValue(currentTranslations, key)
        if (value != null) return interpolate(value, params)
      }
      if (locale !== 'fi') {
        const fallback = getNestedValue(translationCache.current.fi, key)
        if (fallback != null) return interpolate(fallback, params)
      }
      return key
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, loadedLocales]
  )

  const value = useMemo(() => ({ t, locale, setLocale }), [t, locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within an I18nProvider')
  return context
}
