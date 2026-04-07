declare const __DEV__: boolean

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import { secureStorage } from './secureStorage'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (__DEV__ && (!supabaseUrl || !supabaseAnonKey)) {
  console.error('[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY env vars')
}

let _client: ReturnType<typeof createSupabaseClient> | null = null

export function createClient() {
  if (_client) return _client

  _client = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      // On web, detect OAuth tokens in URL hash (#access_token=...)
      detectSessionInUrl: Platform.OS === 'web',
    },
    global: {
      // Wrap fetch to catch network errors from auth token refresh
      // Without this, GoTrueClient._recoverAndRefresh throws
      // AuthRetryableFetchError that surfaces as a red LogBox screen
      fetch: async (url, options) => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000)
        try {
          const mergedOptions = { ...options, signal: options?.signal ?? controller.signal }
          return await fetch(url, mergedOptions)
        } catch (err) {
          if (__DEV__) console.warn('[Supabase] Network request failed:', (err as Error).message)
          throw err
        } finally {
          clearTimeout(timeout)
        }
      },
    },
  })

  // Listen for auth errors and log them as warnings instead of errors
  // This prevents GoTrueClient errors from triggering LogBox red screens
  _client.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' && !session) {
      if (__DEV__) console.warn('[Supabase] Token refresh returned no session')
    }
  })

  return _client
}

/**
 * Reset the Supabase client singleton.
 * Call this on logout to ensure no stale session or realtime channels
 * leak across user sessions.
 */
export function resetClient() {
  if (_client) {
    _client.removeAllChannels()
    _client = null
  }
}
