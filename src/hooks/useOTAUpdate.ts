import { useEffect, useState } from 'react'
import { Alert, Platform } from 'react-native'
import * as Updates from 'expo-updates'

/**
 * Checks for OTA updates on app launch.
 * If an update is available, downloads it and prompts
 * the user to restart. Non-blocking — runs in background.
 *
 * Only runs in production builds (not Expo Go or __DEV__).
 */
export function useOTAUpdate() {
  const [isChecking, setIsChecking] = useState(false)

  useEffect(() => {
    if (__DEV__ || Platform.OS === 'web') return

    let mounted = true

    async function checkForUpdate() {
      try {
        setIsChecking(true)
        const update = await Updates.checkForUpdateAsync()

        if (!update.isAvailable || !mounted) return

        const result = await Updates.fetchUpdateAsync()
        if (!result.isNew || !mounted) return

        Alert.alert(
          'Päivitys saatavilla',
          'Bivo on päivittynyt. Käynnistä uudelleen ottaaksesi päivityksen käyttöön.',
          [
            { text: 'Myöhemmin', style: 'cancel' },
            { text: 'Käynnistä', onPress: () => Updates.reloadAsync() },
          ],
        )
      } catch {
        // Non-critical — update will be applied on next launch
      } finally {
        if (mounted) setIsChecking(false)
      }
    }

    // Delay check to not block app startup
    const timer = setTimeout(checkForUpdate, 5000)
    return () => {
      mounted = false
      clearTimeout(timer)
    }
  }, [])

  return isChecking
}
