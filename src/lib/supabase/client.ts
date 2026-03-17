import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

let _client: ReturnType<typeof createSupabaseClient> | null = null

export function createClient() {
  if (_client) return _client

  _client = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // On web, detect OAuth tokens in URL hash (#access_token=...)
      detectSessionInUrl: Platform.OS === 'web',
    },
  })

  return _client
}
