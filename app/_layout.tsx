import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { View } from 'react-native'
import { I18nProvider } from '@/lib/i18n'
import { useTheme } from '@/hooks/useTheme'

function RootLayoutInner() {
  const { colors, isDark } = useTheme()

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="search" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="post/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="messages/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="auth/callback" options={{ animation: 'fade' }} />
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
