import { useEffect, useState, useRef } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Platform, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { useFonts, BricolageGrotesque_500Medium, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque'
import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans'
import { I18nProvider, useI18n, type Locale } from '@/lib/i18n'
import { useTheme, ThemeProvider } from '@/hooks/useTheme'
import { useSupabase } from '@/hooks/useSupabase'
import { useLocationDetection } from '@/hooks/useLocationDetection'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { UnsupportedAreaScreen } from '@/components/UnsupportedAreaScreen'
import { setAnalyticsUser, trackEvent, trackRetention } from '@/lib/analytics'

const LANG_AUTO_SET_KEY = 'tackbird_lang_auto_set'
const UNSUPPORTED_DISMISSED_KEY = 'tackbird_unsupported_dismissed'

/** Map detected ISO country code to a default locale */
function countryToLocale(country: string | null): Locale | null {
  switch (country) {
    case 'FI': return 'fi'
    case 'SE': return 'sv'
    case 'EE': return 'et'
    default: return country ? 'en' : null
  }
}

// Configure how notifications are handled when the app is in the foreground
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}

function useOnboardingGuard() {
  const router = useRouter()
  const segments = useSegments()
  const supabase = useSupabase()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let mounted = true

    async function checkOnboarding() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setChecked(true); return }

        // Check AsyncStorage flag first (fast path)
        const flag = await AsyncStorage.getItem('onboarding_complete')
        if (flag === 'true') { setChecked(true); return }

        // Check if profile has neighborhood set (already onboarded via web)
        const { data: profile } = await supabase
          .from('profiles')
          .select('naapurusto')
          .eq('id', user.id)
          .single()

        if ((profile as any)?.naapurusto) {
          // Already onboarded — set flag and skip
          await AsyncStorage.setItem('onboarding_complete', 'true')
          if (mounted) setChecked(true)
          return
        }

        // Not onboarded — redirect (unless already on onboarding or auth screens)
        const currentSegment = segments[0]
        if (currentSegment !== 'onboarding' && currentSegment !== '(auth)' && currentSegment !== 'auth') {
          router.replace('/onboarding')
        }
        if (mounted) setChecked(true)
      } catch {
        if (mounted) setChecked(true)
      }
    }

    checkOnboarding()
    return () => { mounted = false }
  }, [supabase, segments, router])

  return checked
}

function useNotificationNavigation() {
  const router = useRouter()
  const responseListener = useRef<Notifications.EventSubscription | null>(null)

  useEffect(() => {
    if (Platform.OS === 'web') return

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as
          | Record<string, string>
          | undefined

        if (!data?.type) return

        switch (data.type) {
          case 'message':
            if (data.conversationId) {
              router.push(`/messages/${data.conversationId}`)
            }
            break

          case 'review':
          case 'follow':
            if (data.userId) {
              router.push(`/profile/${data.userId}`)
            }
            break

          case 'booking':
            if (data.postId) {
              router.push(`/post/${data.postId}`)
            }
            break

          case 'like':
          case 'comment':
            if (data.postId) {
              router.push(`/post/${data.postId}`)
            }
            break

          default:
            router.push('/notifications')
            break
        }
      })

    return () => {
      responseListener.current?.remove()
    }
  }, [router])
}

function useAnalyticsSetup() {
  const supabase = useSupabase()

  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!mounted) return
        if (user) {
          setAnalyticsUser(user.id)
          trackEvent('app_opened')
          trackRetention(user.id)
        } else {
          setAnalyticsUser(null)
        }
      } catch {
        // Ignore — analytics is non-critical
      }
    }
    init()
    return () => { mounted = false }
  }, [supabase])
}

function useAutoLanguage(detectedCountry: string | null) {
  const { setLocale } = useI18n()

  useEffect(() => {
    if (!detectedCountry) return

    let mounted = true

    async function maybeAutoSet() {
      try {
        const alreadyAutoSet = await AsyncStorage.getItem(LANG_AUTO_SET_KEY)
        if (alreadyAutoSet === 'true') return

        const locale = countryToLocale(detectedCountry)
        if (!locale || !mounted) return

        setLocale(locale)
        await AsyncStorage.setItem(LANG_AUTO_SET_KEY, 'true')
      } catch {
        // Non-critical — ignore
      }
    }

    maybeAutoSet()
    return () => { mounted = false }
  }, [detectedCountry, setLocale])
}

function useCurrentUserId() {
  const supabase = useSupabase()
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (mounted) setUserId(user?.id ?? null)
    }).catch(() => {})
    return () => { mounted = false }
  }, [supabase])

  return userId
}

/**
 * Listen for auth state changes (e.g. email verification deep link, password reset).
 * When a user clicks a confirmation/reset link, Supabase triggers SIGNED_IN or
 * PASSWORD_RECOVERY events. We route them to the correct screen.
 */
function useAuthStateListener() {
  const supabase = useSupabase()
  const router = useRouter()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Check if user has completed onboarding before navigating
        // This prevents a flash where the feed loads then redirects to onboarding
        setTimeout(async () => {
          try {
            const flag = await AsyncStorage.getItem('onboarding_complete')
            if (flag === 'true') {
              router.replace('/')
              return
            }
            // Check profile for naapurusto (may have onboarded via web)
            const { data: profile } = await supabase
              .from('profiles')
              .select('naapurusto')
              .eq('id', session.user.id)
              .single()
            if ((profile as any)?.naapurusto) {
              await AsyncStorage.setItem('onboarding_complete', 'true')
              router.replace('/')
            } else {
              router.replace('/onboarding')
            }
          } catch {
            // On error, go to feed and let the onboarding guard handle it
            router.replace('/')
          }
        }, 100)
      } else if (event === 'PASSWORD_RECOVERY' && session) {
        // User clicked password reset link — navigate to settings for pw change
        setTimeout(() => {
          router.replace('/settings')
        }, 100)
      }
    })

    return () => { subscription.unsubscribe() }
  }, [supabase, router])
}

function RootLayoutInner() {
  const { colors, isDark } = useTheme()
  useOnboardingGuard()
  useNotificationNavigation()
  useAnalyticsSetup()
  useAuthStateListener()

  // Location-aware international system
  const userId = useCurrentUserId()
  const detectedLocation = useLocationDetection(userId)
  const [unsupportedDismissed, setUnsupportedDismissed] = useState<boolean | null>(null)

  // Auto-set language based on detected country (once)
  useAutoLanguage(detectedLocation.country)

  // Load dismissal state from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(UNSUPPORTED_DISMISSED_KEY).then(val => {
      setUnsupportedDismissed(val === 'true')
    }).catch(() => {
      setUnsupportedDismissed(false)
    })
  }, [])

  function handleDismissUnsupported() {
    setUnsupportedDismissed(true)
    AsyncStorage.setItem(UNSUPPORTED_DISMISSED_KEY, 'true').catch(() => {})
  }

  // Show unsupported area overlay if:
  // - Location detection finished
  // - Country is NOT supported
  // - User hasn't dismissed the overlay before
  // - We have a user (logged in)
  // - Dismissal state has been loaded from storage
  if (
    !detectedLocation.loading &&
    !detectedLocation.isSupported &&
    unsupportedDismissed === false &&
    userId
  ) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <UnsupportedAreaScreen
          country={detectedLocation.country}
          countryName={detectedLocation.countryName}
          city={detectedLocation.city}
          isWaitlist={detectedLocation.isWaitlist}
          userId={userId}
          onContinue={handleDismissUnsupported}
        />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="search" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="post/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="messages/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="auth/callback" options={{ animation: 'fade' }} />
        <Stack.Screen name="map" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="bookings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="booking/[id]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="payment/success" options={{ animation: 'fade' }} />
        <Stack.Screen name="payment/cancel" options={{ animation: 'fade' }} />
        <Stack.Screen name="payment-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="payment-history" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="pro" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="create-ad" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="organization" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="upgrade-business" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="privacy" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="terms" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="blocked" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="help" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="about" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="forum" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="groups" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="groups/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="verification/success" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="verification/error" options={{ animation: 'fade' }} />
        <Stack.Screen name="saved" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="activities" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="leaderboard" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="profile/[userId]" options={{ headerShown: false, animation: 'slide_from_right' }} />
        <Stack.Screen name="admin" options={{ headerShown: false, animation: 'slide_from_right' }} />
      </Stack>
    </View>
  )
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
  })

  if (!fontsLoaded) return null

  return (
    <ErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <SafeAreaProvider>
            <RootLayoutInner />
          </SafeAreaProvider>
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  )
}
