import { useEffect, useState, useRef } from 'react'
import { initSentry, setSentryUser, addSentryBreadcrumb } from '@/lib/sentry'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Alert, Platform, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts, BricolageGrotesque_500Medium, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque'
import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans'
import { I18nProvider, useI18n, type Locale } from '@/lib/i18n'
import { useTheme, ThemeProvider } from '@/hooks/useTheme'
import { ToastProvider } from '@/components/Toast'
import { useSupabase } from '@/hooks/useSupabase'
import { useLocationDetection } from '@/hooks/useLocationDetection'
import { isValidUUID } from '@/lib/validation'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { UnsupportedAreaScreen } from '@/components/UnsupportedAreaScreen'
import { OfflineBanner } from '@/components/OfflineBanner'
import { setAnalyticsUser, trackEvent, trackRetention, flushAnalyticsQueue } from '@/lib/analytics'
import { clearAuthCache } from '@/lib/authCache'
import { fetchRemoteFlags } from '@/lib/featureFlags'
import { useAppStateManager } from '@/hooks/useAppState'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'
import { useGlobalErrorRecovery } from '@/hooks/useGlobalErrorRecovery'
import { useOTAUpdate } from '@/hooks/useOTAUpdate'
import { useMemoryWarning } from '@/hooks/useMemoryWarning'

import { LogBox } from 'react-native'

// Suppress auth network errors from showing red LogBox screen
// These occur when session refresh fails due to connectivity and are
// retried automatically by GoTrueClient — not actionable by users
LogBox.ignoreLogs([
  'AuthRetryableFetchError',
  'TypeError: Network request failed',
  'AbortError: Aborted',
  'AbortError',
])

// Initialize Sentry error reporting (no-op in __DEV__)
initSentry()

// Keep splash screen visible until fonts are loaded
SplashScreen.preventAutoHideAsync()

const LANG_AUTO_SET_KEY = 'tackbird_lang_auto_set'
const UNSUPPORTED_DISMISSED_KEY = 'tackbird_unsupported_dismissed'

/** Map detected ISO country code to a default locale */
function countryToLocale(country: string | null): Locale | null {
  switch (country) {
    case 'FI': return 'fi'
    case 'SE': return 'sv'
    default: return null
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

  const segmentsRef = useRef(segments)
  segmentsRef.current = segments

  useEffect(() => {
    let mounted = true

    async function checkOnboarding() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (mounted) setChecked(true); return }

        // Check AsyncStorage flag first (fast path)
        const flag = await AsyncStorage.getItem('onboarding_complete')
        if (flag === 'true') { if (mounted) setChecked(true); return }

        // Check if profile has neighborhood set (already onboarded via web)
        const { data: profile } = await supabase
          .from('profiles')
          .select('naapurusto')
          .eq('id', user.id)
          .maybeSingle()

        if ((profile as any)?.naapurusto) {
          // Already onboarded — set flag and skip
          await AsyncStorage.setItem('onboarding_complete', 'true')
          if (mounted) setChecked(true)
          return
        }

        // Not onboarded — redirect (unless already on onboarding or auth screens)
        const currentSegment = segmentsRef.current[0]
        if (mounted && currentSegment !== 'onboarding' && currentSegment !== '(auth)' && currentSegment !== 'auth') {
          router.replace('/onboarding')
        }
        if (mounted) setChecked(true)
      } catch {
        if (mounted) setChecked(true)
      }
    }

    checkOnboarding()
    return () => { mounted = false }
  }, [supabase, router])

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
            if (data.conversationId && isValidUUID(data.conversationId)) {
              router.push(`/messages/${data.conversationId}`)
            }
            break

          case 'review':
          case 'follow':
            if (data.userId && isValidUUID(data.userId)) {
              router.push(`/profile/${data.userId}`)
            }
            break

          case 'booking':
            if (data.bookingId && isValidUUID(data.bookingId)) {
              router.push(`/booking/${data.bookingId}` as any)
            } else if (data.postId && isValidUUID(data.postId)) {
              router.push(`/post/${data.postId}`)
            } else {
              router.push('/notifications')
            }
            break

          case 'event':
            if (data.eventId && isValidUUID(data.eventId)) {
              router.push(`/event/${data.eventId}` as any)
            } else {
              router.push('/notifications')
            }
            break

          case 'like':
          case 'comment':
            if (data.postId && isValidUUID(data.postId)) {
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
    // Fetch remote feature flags on startup (non-blocking)
    fetchRemoteFlags().catch(() => {})

    let mounted = true
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!mounted) return
        if (user) {
          setAnalyticsUser(user.id)
          setSentryUser(user.id)
          trackEvent('app_opened')
          trackRetention(user.id)
          // Flush any events queued locally while the user was offline.
          // Previously flushAnalyticsQueue was implemented but never called,
          // so queued events accumulated in AsyncStorage up to the 100-event
          // cap and were eventually dropped.
          flushAnalyticsQueue().catch(() => {})
        } else {
          setAnalyticsUser(null)
          setSentryUser(null)
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
 * Listen for auth state changes (e.g. email verification deep link, password reset,
 * session expiry). When a user clicks a confirmation/reset link, Supabase triggers
 * SIGNED_IN or PASSWORD_RECOVERY events. We route them to the correct screen.
 *
 * Session expiry detection:
 * - SIGNED_OUT after initial check → session expired, show alert and redirect
 * - TOKEN_REFRESHED with null session → token refresh failed, redirect to login
 * - Periodic session check on protected routes → redirect if session is null
 *
 * Uses `initialCheckDoneRef` to avoid redirect loops on initial app load.
 */
function useAuthStateListener() {
  const supabase = useSupabase()
  const router = useRouter()
  const segments = useSegments()
  const { t } = useI18n()
  const authSegmentsRef = useRef(segments)
  authSegmentsRef.current = segments
  // Use refs for t and router to avoid re-subscribing on locale/navigation changes
  const tRef = useRef(t)
  tRef.current = t
  const routerRef = useRef(router)
  routerRef.current = router

  // Track whether the initial auth state has been resolved so we don't
  // treat the first SIGNED_OUT as a session expiry on cold start.
  const initialCheckDoneRef = useRef(false)
  // Track whether we had a session at some point (to distinguish "expired" from "never logged in")
  const hadSessionRef = useRef(false)

  useEffect(() => {
    let mounted = true
    const timers: ReturnType<typeof setTimeout>[] = []

    // Run an initial session check to seed our refs
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      if (session) {
        hadSessionRef.current = true
      }
      initialCheckDoneRef.current = true
    }).catch(() => {
      if (mounted) initialCheckDoneRef.current = true
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Track sessions so we know if expiry happened
      if (session) {
        hadSessionRef.current = true
      }

      if (event === 'SIGNED_IN' && session) {
        // Don't navigate if auth/callback is handling the redirect
        if (authSegmentsRef.current[0] === 'auth') return

        // BUG FIX: cold-boot SIGNED_IN should NOT redirect to '/'. The session-
        // restoration event fires on every app start even when the user is
        // already on a valid authenticated route (e.g. deep-linked or URL-
        // navigated to /profile, /create, /messages). Previously this caused
        // every direct URL navigation to bounce back to the feed.
        // Only redirect if this is a genuine new login (no prior session).
        const isFreshLogin = !initialCheckDoneRef.current || !hadSessionRef.current
        if (!isFreshLogin) {
          // Session was restored on app start — user is already on a route.
          // Still verify ban / onboarding but do NOT force-navigate.
          const timer = setTimeout(async () => {
            if (!mounted) return
            try {
              const { data: banProfile } = await supabase
                .from('profiles')
                .select('is_banned, naapurusto')
                .eq('id', session.user.id)
                .maybeSingle()
              if (!mounted) return
              if ((banProfile as any)?.is_banned) {
                setTimeout(() => {
                  supabase.auth.signOut().catch(() => {})
                  Alert.alert(tRef.current('auth.accountBanned'), tRef.current('auth.accountBannedDesc'))
                }, 0)
                return
              }
              if ((banProfile as any)?.naapurusto) {
                await AsyncStorage.setItem('onboarding_complete', 'true')
              }
            } catch {}
          }, 100)
          timers.push(timer)
          return
        }

        const timer = setTimeout(async () => {
          if (!mounted) return
          try {
            // Check if user is banned
            const { data: banProfile } = await supabase
              .from('profiles')
              .select('is_banned, naapurusto')
              .eq('id', session.user.id)
              .maybeSingle()

            if (!mounted) return

            if ((banProfile as any)?.is_banned) {
              // Defer signOut to break the async chain — calling signOut()
              // inside onAuthStateChange (even via setTimeout wrapper) can
              // cause re-entrant auth state events that stack up.
              setTimeout(() => {
                supabase.auth.signOut().catch(() => {})
                Alert.alert(tRef.current('auth.accountBanned'), tRef.current('auth.accountBannedDesc'))
              }, 0)
              return
            }

            const flag = await AsyncStorage.getItem('onboarding_complete')
            if (flag === 'true') {
              if (mounted) routerRef.current.replace('/')
              return
            }
            if ((banProfile as any)?.naapurusto) {
              await AsyncStorage.setItem('onboarding_complete', 'true')
              if (mounted) routerRef.current.replace('/')
            } else {
              if (mounted) routerRef.current.replace('/onboarding')
            }
          } catch {
            if (mounted) routerRef.current.replace('/')
          }
        }, 100)
        timers.push(timer)
      } else if (event === 'SIGNED_OUT') {
        const timer = setTimeout(async () => {
          if (!mounted) return

          // Determine if this is a session expiry (had session + initial check done)
          // vs. a deliberate logout or cold start without session
          const isSessionExpiry = initialCheckDoneRef.current && hadSessionRef.current

          try {
            clearAuthCache()
            await AsyncStorage.removeItem('onboarding_complete')
            // Reset app icon badge to 0 on logout — otherwise the previous
            // user's unread count persists on the home screen icon.
            Notifications.setBadgeCountAsync(0).catch(() => {})
          } catch {
            // Non-critical — ignore
          }

          if (!mounted) return

          // Don't redirect if already on auth screens
          const currentSegment = authSegmentsRef.current[0]
          if (currentSegment === '(auth)' || currentSegment === 'auth') return

          if (isSessionExpiry) {
            // Session expired — show alert then redirect
            Alert.alert(
              tRef.current('common.error'),
              tRef.current('auth.sessionExpired'),
              [{ text: 'OK', onPress: () => { if (mounted) routerRef.current.replace('/(auth)/login') } }]
            )
          } else if (initialCheckDoneRef.current) {
            // Deliberate sign-out (not initial load)
            routerRef.current.replace('/(auth)/login')
          }
          // If initialCheckDoneRef is false, this is the initial SIGNED_OUT on cold start
          // with no session — don't redirect (the onboarding guard handles routing)
        }, 100)
        timers.push(timer)
      } else if (event === 'TOKEN_REFRESHED' && !session) {
        // Token refresh failed — session is invalid
        if (!initialCheckDoneRef.current) return

        const timer = setTimeout(async () => {
          if (!mounted) return

          const currentSegment = authSegmentsRef.current[0]
          if (currentSegment === '(auth)' || currentSegment === 'auth') return

          try {
            clearAuthCache()
            await AsyncStorage.removeItem('onboarding_complete')
          } catch {
            // Non-critical — ignore
          }

          if (!mounted) return

          Alert.alert(
            tRef.current('common.error'),
            tRef.current('auth.sessionExpired'),
            [{ text: 'OK', onPress: () => { if (mounted) routerRef.current.replace('/(auth)/login') } }]
          )
        }, 100)
        timers.push(timer)
      } else if (event === 'PASSWORD_RECOVERY' && session) {
        const timer = setTimeout(() => {
          if (mounted) routerRef.current.replace('/settings')
        }, 100)
        timers.push(timer)
      }
    })

    return () => {
      mounted = false
      timers.forEach(clearTimeout)
      subscription.unsubscribe()
    }
  }, [supabase]) // Removed router and t — use refs to avoid re-subscriptions on locale/nav changes
}

/**
 * Periodically check if the session is still valid on protected routes.
 * If getSession() returns null while the user is on a protected route,
 * redirect to login. Runs every 60 seconds.
 */
function useSessionGuard() {
  const supabase = useSupabase()
  const router = useRouter()
  const segments = useSegments()
  const { t } = useI18n()
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments
  // Use refs for t and router to avoid interval re-creation on locale/nav changes
  const tRef = useRef(t)
  tRef.current = t
  const routerRef = useRef(router)
  routerRef.current = router
  // Guard against stacking multiple "session expired" alerts when the
  // interval fires repeatedly before the user has dismissed the first one.
  const alertShownRef = useRef(false)

  useEffect(() => {
    const PROTECTED_CHECK_INTERVAL = 60000 // 60 seconds
    let mounted = true

    const interval = setInterval(async () => {
      if (!mounted || alertShownRef.current) return

      const currentSegment = segmentsRef.current[0]
      // Only check on protected routes (not auth or onboarding screens)
      if (currentSegment === '(auth)' || currentSegment === 'auth' || currentSegment === 'onboarding') return

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted || alertShownRef.current) return

        if (!session) {
          clearAuthCache()
          alertShownRef.current = true
          Alert.alert(
            tRef.current('common.error'),
            tRef.current('auth.sessionExpired'),
            [{ text: 'OK', onPress: () => {
              alertShownRef.current = false
              if (mounted) routerRef.current.replace('/(auth)/login')
            } }]
          )
        }
      } catch {
        // Network error or similar — don't redirect on transient failures
      }
    }, PROTECTED_CHECK_INTERVAL)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [supabase]) // Removed router and t — use refs to avoid interval re-creation
}

function RootLayoutInner() {
  const { colors, isDark } = useTheme()
  const navSegments = useSegments()
  useOnboardingGuard()
  useNotificationNavigation()
  useAnalyticsSetup()
  useAuthStateListener()
  useSessionGuard()

  // Track navigation for Sentry crash reports
  useEffect(() => {
    const screen = navSegments.join('/')
    if (screen) addSentryBreadcrumb(screen)
  }, [navSegments])
  useAppStateManager() // Disconnect realtime when backgrounded
  useGlobalErrorRecovery() // Catch unhandled promise rejections
  useOTAUpdate() // Check for OTA updates on launch
  useMemoryWarning() // Clear image cache on iOS memory pressure
  const network = useNetworkStatus() // Offline detection

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
      <OfflineBanner visible={network.isConnected === false} />
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
        <Stack.Screen name="event/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="create-event" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="community-events" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="verify-otp" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="boosts" options={{ headerShown: false, animation: 'slide_from_right' }} />
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

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <I18nProvider>
          <ThemeProvider>
            <SafeAreaProvider>
              <ToastProvider>
                <RootLayoutInner />
              </ToastProvider>
            </SafeAreaProvider>
          </ThemeProvider>
        </I18nProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  )
}
