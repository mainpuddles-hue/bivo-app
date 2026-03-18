import { useEffect, useState, useMemo } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { I18nProvider } from '@/lib/i18n'
import { useTheme } from '@/hooks/useTheme'
import { createClient } from '@/lib/supabase/client'

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

        if (profile?.naapurusto) {
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

function RootLayoutInner() {
  const { colors, isDark } = useTheme()
  useOnboardingGuard()

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
      </Stack>
    </View>
  )
}

export default function RootLayout() {
  return (
    <I18nProvider>
      <SafeAreaProvider>
        <RootLayoutInner />
      </SafeAreaProvider>
    </I18nProvider>
  )
}
