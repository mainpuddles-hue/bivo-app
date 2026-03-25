import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import { secureStorage } from './secureStorage'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

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
  })

  return _client
}
