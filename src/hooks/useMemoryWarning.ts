import { useEffect } from 'react'
import { Platform, AppState } from 'react-native'
import { Image } from 'expo-image'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { captureError } from '@/lib/sentry'

/**
 * Handle memory pressure events.
 *
 * When the system reports low memory:
 * 1. Clear expo-image memory cache (keeps disk cache)
 * 2. Log to Sentry for monitoring
 *
 * iOS sends memory warnings via AppState 'memoryWarning' event.
 * Android memory management is handled by the system.
 */
export function useMemoryWarning() {
  useEffect(() => {
    if (Platform.OS !== 'ios') return

    const subscription = AppState.addEventListener('memoryWarning', () => {
      // Clear image memory cache (keeps disk cache intact)
      Image.clearMemoryCache()

      // Track for monitoring
      captureError(new Error('Memory warning received'), {
        type: 'memory_warning',
        platform: Platform.OS,
      })
    })

    return () => {
      subscription.remove()
    }
  }, [])
}
