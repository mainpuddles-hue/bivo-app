import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

// On iOS and Android, use expo-secure-store for sensitive auth tokens
// On web, AsyncStorage uses localStorage (no secure alternative)
let SecureStore: any = null
if (Platform.OS !== 'web') {
  try { SecureStore = require('expo-secure-store') } catch {} // Intentional: expo-secure-store may not be available
}

const projectRef = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').split('.')[0].split('//')[1] || 'unknown'
const SECURE_KEYS = ['supabase.auth.token', `sb-${projectRef}-auth-token`]

// SecureStore on iOS Keychain rejects items above ~2KB. Stay well below that.
const CHUNK_SIZE = 1800

function isSecureKey(key: string): boolean {
  return SECURE_KEYS.some(sk => key.includes(sk) || key.includes('auth'))
}

function sanitize(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_')
}

async function setChunked(key: string, value: string): Promise<void> {
  const base = sanitize(key)
  const chunkCount = Math.max(1, Math.ceil(value.length / CHUNK_SIZE))

  // Write chunks first so a partial write doesn't leave a "valid" meta pointing at missing chunks
  for (let i = 0; i < chunkCount; i++) {
    const slice = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
    await SecureStore.setItemAsync(`${base}__c${i}`, slice)
  }
  await SecureStore.setItemAsync(`${base}__meta`, JSON.stringify({ chunks: chunkCount }))

  // Cleanup orphan chunks if the previous value had more chunks than this one
  for (let i = chunkCount; i < chunkCount + 8; i++) {
    try { await SecureStore.deleteItemAsync(`${base}__c${i}`) } catch {} // best-effort
  }
  // Cleanup legacy unchunked entry from older versions
  try { await SecureStore.deleteItemAsync(base) } catch {} // best-effort
}

async function getChunked(key: string): Promise<string | null> {
  const base = sanitize(key)
  let meta: string | null = null
  try { meta = await SecureStore.getItemAsync(`${base}__meta`) } catch {} // SecureStore miss
  if (meta) {
    try {
      const { chunks } = JSON.parse(meta) as { chunks: number }
      let value = ''
      for (let i = 0; i < chunks; i++) {
        const slice = await SecureStore.getItemAsync(`${base}__c${i}`)
        if (slice === null) return null // corrupt: missing chunk → force re-auth
        value += slice
      }
      return value
    } catch {
      return null
    }
  }
  // Backwards compat: legacy single-entry SecureStore value
  try { return await SecureStore.getItemAsync(base) } catch { return null }
}

async function removeChunked(key: string): Promise<void> {
  const base = sanitize(key)
  let chunkCount = 0
  try {
    const meta = await SecureStore.getItemAsync(`${base}__meta`)
    if (meta) chunkCount = (JSON.parse(meta) as { chunks: number }).chunks
  } catch {} // best-effort
  // Remove a few extra slots for safety against stale orphan chunks
  const toClear = Math.max(chunkCount, 1) + 8
  for (let i = 0; i < toClear; i++) {
    try { await SecureStore.deleteItemAsync(`${base}__c${i}`) } catch {} // best-effort
  }
  try { await SecureStore.deleteItemAsync(`${base}__meta`) } catch {} // best-effort
  try { await SecureStore.deleteItemAsync(base) } catch {} // legacy entry
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (SecureStore && isSecureKey(key)) {
      const fromSecure = await getChunked(key)
      if (fromSecure !== null) return fromSecure
      // One-time migration from previous AsyncStorage-fallback path
      const legacy = await AsyncStorage.getItem(key)
      if (legacy !== null) {
        try {
          await setChunked(key, legacy)
          await AsyncStorage.removeItem(key)
        } catch {} // best-effort migration; legacy value still returned below
      }
      return legacy
    }
    return AsyncStorage.getItem(key)
  },
  async setItem(key: string, value: string): Promise<void> {
    if (SecureStore && isSecureKey(key)) {
      try {
        await setChunked(key, value)
        // Clean up any leftover AsyncStorage entry from prior fallback writes
        try { await AsyncStorage.removeItem(key) } catch {} // best-effort
        return
      } catch {} // SecureStore unavailable → fall through to AsyncStorage
    }
    await AsyncStorage.setItem(key, value)
  },
  async removeItem(key: string): Promise<void> {
    if (SecureStore && isSecureKey(key)) {
      try { await removeChunked(key) } catch {} // best-effort
    }
    await AsyncStorage.removeItem(key)
  },
}
