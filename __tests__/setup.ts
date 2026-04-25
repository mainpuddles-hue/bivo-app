/**
 * Jest setup for TackBird Mobile component tests.
 *
 * Mocks external dependencies that are not relevant to component logic:
 * expo-image, expo-router, expo-haptics, expo-secure-store,
 * react-native-safe-area-context, lucide-react-native, theme, i18n, fonts, etc.
 */

// ── expo-image ──
jest.mock('expo-image', () => {
  const { View } = require('react-native')
  return {
    Image: (props: any) => {
      const { onError, onLoad, testID, accessibilityLabel, style, ...rest } = props
      return require('react').createElement(View, {
        testID: testID ?? 'expo-image',
        accessibilityLabel,
        style,
        ...rest,
      })
    },
  }
})

// ── expo-router ──
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
  Link: 'Link',
}))

// ── expo-haptics ──
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Warning: 'Warning', Error: 'Error' },
}))

// ── expo-secure-store ──
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

// ── @react-native-async-storage/async-storage ──
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}))

// ── react-native-safe-area-context ──
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaView: ({ children }: any) => children,
}))

// ── Theme hook ──
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      primary: '#1A1D1F',
      accent: '#2A2D30',
      secondary: '#FF9500',
      background: '#F5F6F7',
      foreground: '#1A1D1F',
      card: '#FFFFFF',
      cardElevated: '#FAFAFB',
      border: '#E8EAEC',
      muted: '#EEF0F2',
      mutedForeground: '#535A60',
      tertiaryForeground: '#848B93',
      destructive: '#C44536',
      pro: '#F59E0B',
      success: '#2D7A4F',
      info: '#3B82F6',
      purple: '#7C5CBF',
      purpleMuted: '#F4F0FF',
      primaryForeground: '#FFFFFF',
      accentForeground: '#FFFFFF',
      surfaceOverlay: 'rgba(255,255,255,0.82)',
      surfaceTinted: 'rgba(26,29,31,0.04)',
      warmTint: '#F0EEE9',
      onInkMuted: '#B8BCC0',
      borderStrong: '#C8CBCE',
      danger: '#C44536',
    },
    isDark: false,
    theme: 'light',
    setTheme: jest.fn(),
  }),
  ThemeProvider: ({ children }: any) => children,
}))

// ── useReduceMotion ──
jest.mock('@/hooks/useReduceMotion', () => ({
  useReduceMotion: () => true,
}))

// ── I18n hook ──
jest.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, _params?: Record<string, string | number>) => key,
    locale: 'fi',
    setLocale: jest.fn(),
  }),
  I18nProvider: ({ children }: any) => children,
}))

// ── Supabase hook ──
const mockSupabaseQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data: null }),
  insert: jest.fn().mockResolvedValue({ error: null }),
  delete: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
}
jest.mock('@/hooks/useSupabase', () => ({
  useSupabase: () => ({
    from: jest.fn(() => mockSupabaseQuery),
    channel: jest.fn(),
  }),
}))

// ── Fonts ──
jest.mock('@/lib/fonts', () => ({
  fonts: {
    display: 'System',
    displayMedium: 'System',
    displayBold: 'System',
    heading: 'System',
    headingSemi: 'System',
    headingMedium: 'System',
    body: 'System',
    bodyMedium: 'System',
    bodySemi: 'System',
    mono: 'Courier',
  },
  typeScale: {
    caption: { fontSize: 12, lineHeight: 16 },
    bodySmall: { fontSize: 13, lineHeight: 18 },
    body: { fontSize: 14, lineHeight: 20 },
    bodyLarge: { fontSize: 16, lineHeight: 22 },
    subtitle: { fontSize: 18, lineHeight: 24 },
    title: { fontSize: 20, lineHeight: 26 },
    titleLarge: { fontSize: 24, lineHeight: 30 },
    display: { fontSize: 28, lineHeight: 34 },
    displayLarge: { fontSize: 32, lineHeight: 38 },
  },
}))

// ── Image utilities ──
jest.mock('@/lib/imageUtils', () => ({
  getImageUrl: (url: string | null | undefined, _size?: string) => url ?? null,
}))

// ── Abuse detection ──
jest.mock('@/lib/abuseDetection', () => ({
  isHumanAction: () => true,
}))

// ── Geo ──
jest.mock('@/lib/geo', () => ({
  haversineKm: () => 1.5,
  isInCityBounds: () => true,
}))

// ── Format ──
jest.mock('@/lib/format', () => ({
  formatTimeAgo: (_date: string, _t: any, _locale: string) => '5 min sitten',
  formatPrice: (price: number, _locale: string) => `${price} €`,
  formatDateRange: jest.fn(),
  resolveLocale: (l: string) => l,
}))

// ── Category icons ──
jest.mock('@/lib/categoryIcons', () => {
  const { View } = require('react-native')
  const MockIcon = (props: any) => require('react').createElement(View, { testID: `icon-${props.testID || 'mock'}` })
  return {
    CATEGORY_ICON_MAP: {
      HandHelping: MockIcon,
      Gift: MockIcon,
      Heart: MockIcon,
      Zap: MockIcon,
      BookOpen: MockIcon,
      CalendarDays: MockIcon,
    },
  }
})

// ── Theme (categoryColorsDark) ──
jest.mock('@/lib/theme', () => ({
  colors: {
    light: {
      primary: '#1A1D1F', foreground: '#1A1D1F', background: '#F5F6F7',
      card: '#FFFFFF', border: '#E8EAEC', muted: '#EEF0F2',
      mutedForeground: '#535A60', destructive: '#C44536', pro: '#F59E0B',
      success: '#2D7A4F', info: '#3B82F6', primaryForeground: '#FFFFFF',
      tertiaryForeground: '#848B93', cardElevated: '#FAFAFB',
      accent: '#2A2D30', secondary: '#FF9500', purple: '#7C5CBF',
      purpleMuted: '#F4F0FF', accentForeground: '#FFFFFF',
      surfaceOverlay: 'rgba(255,255,255,0.82)',
      surfaceTinted: 'rgba(26,29,31,0.04)',
      warmTint: '#F0EEE9', onInkMuted: '#B8BCC0',
      borderStrong: '#C8CBCE', danger: '#C44536',
    },
    dark: {
      primary: '#F5F6F7', foreground: '#F5F6F7', background: '#0E1012',
      card: '#17191C', border: '#2E3136', muted: '#202326',
      mutedForeground: '#8B8F94', destructive: '#FF453A', pro: '#FBBF24',
      success: '#34D399', info: '#0A84FF', primaryForeground: '#1A1D1F',
      tertiaryForeground: '#7D838A', cardElevated: '#1C1E21',
      accent: '#E8EAEC', secondary: '#FFAD33', purple: '#BF5AF2',
      purpleMuted: '#1E1628', accentForeground: '#1A1D1F',
      surfaceOverlay: 'rgba(14,16,18,0.82)',
      surfaceTinted: 'rgba(245,246,247,0.06)',
      warmTint: '#2A2722', onInkMuted: '#4A4D51',
      borderStrong: '#4A4D51', danger: '#FF453A',
    },
  },
  categoryColorsDark: {
    tarvitsen: '#D4734F',
    tarjoan: '#9B7DD4',
    ilmaista: '#5B9BF0',
    lainaa: '#C99A3E',
    tapahtuma: '#3AAE7A',
  },
}))

// ── Feature flags ──
jest.mock('@/lib/featureFlags', () => ({
  FEATURES: {
    LENDING: true,
    LENDING_PAYMENTS: false,
    PAYMENTS: false,
    AD_CAMPAIGNS: false,
    BUSINESS_ACCOUNT: false,
    IDENTITY_VERIFICATION: false,
    EVENTS_TAPAHTUMA_TYPE: true,
    POLLS: true,
  },
  loadFeatureFlags: jest.fn(),
}))

// ── Shadows ──
jest.mock('@/lib/shadows', () => ({
  shadowSm: {},
  shadowMd: {},
  shadowLg: {},
  shadowSmDark: {},
  shadowMdDark: {},
  shadowLgDark: {},
  getShadow: () => ({}),
}))

// ── Lucide icons (generic mock) ──
jest.mock('lucide-react-native', () => {
  const { View } = require('react-native')
  const createIcon = (name: string) => {
    const Icon = (props: any) =>
      require('react').createElement(View, {
        testID: `lucide-${name}`,
        accessibilityLabel: name,
        ...props,
      })
    Icon.displayName = name
    return Icon
  }
  return new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (prop === '__esModule') return true
        return createIcon(prop)
      },
    },
  )
})

// ── PressableOpacity — use a simple Pressable ──
jest.mock('@/components/ui', () => {
  const { Pressable } = require('react-native')
  return {
    PressableOpacity: (props: any) => {
      const { activeOpacity, ...rest } = props
      return require('react').createElement(Pressable, rest)
    },
    BackButton: () => null,
    ModalCloseButton: () => null,
    KeyboardDoneAccessory: () => null,
    KEYBOARD_DONE_ID: 'keyboard-done',
    AnimatedEntrance: ({ children }: any) => children,
    MagneticPressable: (props: any) => require('react').createElement(Pressable, props),
  }
})
