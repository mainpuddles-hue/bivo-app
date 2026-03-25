import { useEffect, useState, useMemo, useRef } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Platform, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { useFonts, BricolageGrotesque_500Medium, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque'
import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans'
import { I18nProvider } from '@/lib/i18n'
import { useTheme, ThemeProvider } from '@/hooks/useTheme'
import { createClient } from '@/lib/supabase/client'
import { ErrorBoundary } from '@/components/ErrorBoundary'

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
  const supabase = useMemo(() => createClient(), [])
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

function RootLayoutInner() {
  const { colors, isDark } = useTheme()
  useOnboardingGuard()
  useNotificationNavigation()

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
        <Stack.Screen name="payment/success" options={{ animation: 'fade' }} />
        <Stack.Screen name="payment/cancel" options={{ animation: 'fade' }} />
        <Stack.Screen name="payment-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="payment-history" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="pro" options={{ animation: 'slide_from_right' }} />
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
        <Stack.Screen name="activities" options={{ headerShown: false }} />
        <Stack.Screen name="leaderboard" options={{ headerShown: false }} />
        <Stack.Screen name="profile/[userId]" options={{ headerShown: false }} />
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
