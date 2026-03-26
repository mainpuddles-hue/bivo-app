import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// On iOS and Android, use expo-secure-store for sensitive auth tokens
// On web, AsyncStorage uses localStorage (no secure alternative)
let SecureStore: any = null
if (Platform.OS !== 'web') {
  try { SecureStore = require('expo-secure-store') } catch {}
}

const SECURE_KEYS = ['supabase.auth.token', 'sb-wfsghkseyyxkkalcqtzq-auth-token']

function isSecureKey(key: string): boolean {
  return SECURE_KEYS.some(sk => key.includes(sk) || key.includes('auth'))
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (SecureStore && isSecureKey(key)) {
      try {
        return await SecureStore.getItemAsync(key.replace(/[^a-zA-Z0-9._-]/g, '_'))
      } catch {
        // Fallback to AsyncStorage if SecureStore fails
        return AsyncStorage.getItem(key)
      }
    }
    return AsyncStorage.getItem(key)
  },
  async setItem(key: string, value: string): Promise<void> {
    if (SecureStore && isSecureKey(key)) {
      try {
        await SecureStore.setItemAsync(key.replace(/[^a-zA-Z0-9._-]/g, '_'), value)
        return
      } catch {}
    }
    await AsyncStorage.setItem(key, value)
  },
  async removeItem(key: string): Promise<void> {
    if (SecureStore && isSecureKey(key)) {
      try {
        await SecureStore.deleteItemAsync(key.replace(/[^a-zA-Z0-9._-]/g, '_'))
      } catch {}
    }
    await AsyncStorage.removeItem(key)
  },
}
