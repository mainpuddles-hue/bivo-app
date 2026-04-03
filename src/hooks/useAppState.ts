import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { useSupabase } from './useSupabase'

/**
 * Manages Supabase realtime connection based on app state.
 * - Foreground: ensure realtime is connected
 * - Background: disconnect realtime to save battery & bandwidth
 * - Returning to foreground: reconnect + trigger data refresh
 */
export function useAppStateManager(onForeground?: () => void) {
  const supabase = useSupabase()
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current

      if (prevState.match(/inactive|background/) && nextState === 'active') {
        // Returning to foreground — reconnect realtime
        supabase.realtime.connect()
        onForeground?.()
      } else if (nextState.match(/inactive|background/) && prevState === 'active') {
        // Going to background — disconnect realtime to save resources
        supabase.realtime.disconnect()
      }

      appStateRef.current = nextState
    })

    return () => {
      subscription.remove()
    }
  }, [supabase, onForeground])
}
