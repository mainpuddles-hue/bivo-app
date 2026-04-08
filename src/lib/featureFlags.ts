import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@/lib/supabase/client'

// Static defaults — used until remote flags are fetched
const DEFAULTS = {
  LENDING: false,
  GRAB: true,
  PAYMENTS: false,
  PRO_SUBSCRIPTION: false,
  BUSINESS_ACCOUNT: false,
  AD_CAMPAIGNS: false,
  IDENTITY_VERIFICATION: false,
  EVENTS_TAPAHTUMA_TYPE: true,
  BOOSTS: true,
} as const

type FeatureKey = keyof typeof DEFAULTS

const CACHE_KEY = 'tackbird_feature_flags'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Mutable runtime state (starts with defaults, updated from remote)
let _flags: Record<FeatureKey, boolean> = { ...DEFAULTS }
let _rolloutPercentages: Record<string, number> = {}
let _lastFetchedAt = 0

/**
 * Check if user is in rollout group based on their userId.
 * Uses a simple hash to deterministically assign users to groups.
 */
export function isInRollout(userId: string, percentage: number): boolean {
  if (percentage >= 100) return true
  if (percentage <= 0) return false
  // Simple hash: sum char codes mod 100
  const hash = userId.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0) % 100
  return hash < percentage
}

/**
 * Check if a feature flag is enabled for a specific user,
 * taking into account rollout percentage.
 */
export function isFeatureEnabled(key: FeatureKey, userId?: string | null): boolean {
  const enabled = _flags[key] ?? false
  if (!enabled) return false

  const percentage = _rolloutPercentages[key] ?? 100
  if (percentage >= 100) return true
  if (!userId) return false

  return isInRollout(userId, percentage)
}

/**
 * Current feature flags.
 * Starts with static defaults, updated by fetchRemoteFlags().
 *
 * Usage: import { FEATURES } from '@/lib/featureFlags'
 * if (FEATURES.PAYMENTS) { ... }
 *
 * For percentage-based rollout, use isFeatureEnabled(key, userId) instead.
 */
export const FEATURES: Readonly<Record<FeatureKey, boolean>> = new Proxy(_flags, {
  get: (target, prop: string) => target[prop as FeatureKey] ?? false,
  set: () => { throw new Error('Use fetchRemoteFlags() to update flags') },
})

/**
 * Fetch feature flags from Supabase `feature_flags` table.
 * Falls back to cached values, then static defaults.
 * Call once on app startup (non-blocking).
 *
 * Table schema:
 *   CREATE TABLE feature_flags (
 *     key TEXT PRIMARY KEY,
 *     enabled BOOLEAN DEFAULT false,
 *     rollout_percentage INT DEFAULT 100,
 *     description TEXT,
 *     updated_at TIMESTAMPTZ DEFAULT now()
 *   );
 */
export async function fetchRemoteFlags(): Promise<void> {
  // Skip if recently fetched
  if (Date.now() - _lastFetchedAt < CACHE_TTL) return

  // Try cache first
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached) as {
        flags: Record<string, boolean>
        rolloutPercentages?: Record<string, number>
        fetchedAt: number
      }
      if (Date.now() - parsed.fetchedAt < CACHE_TTL) {
        applyFlags(parsed.flags, parsed.rolloutPercentages ?? {})
        return
      }
    }
  } catch {} // Ignore cache errors

  // Fetch from Supabase
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('feature_flags')
      .select('key, enabled, rollout_percentage')

    if (!error && data) {
      const remoteFlags: Record<string, boolean> = {}
      const remotePercentages: Record<string, number> = {}
      for (const row of data as { key: string; enabled: boolean; rollout_percentage?: number }[]) {
        remoteFlags[row.key] = row.enabled
        remotePercentages[row.key] = row.rollout_percentage ?? 100
      }
      applyFlags(remoteFlags, remotePercentages)
      _lastFetchedAt = Date.now()

      // Cache for offline use
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
        flags: remoteFlags,
        rolloutPercentages: remotePercentages,
        fetchedAt: _lastFetchedAt,
      })).catch(() => {})
    }
  } catch {
    // Remote fetch failed — continue with defaults/cache
  }
}

function applyFlags(remote: Record<string, boolean>, percentages: Record<string, number>) {
  for (const key of Object.keys(DEFAULTS) as FeatureKey[]) {
    if (key in remote) {
      _flags[key] = remote[key]
    }
  }
  _rolloutPercentages = { ..._rolloutPercentages, ...percentages }
}
