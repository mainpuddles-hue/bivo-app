import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@/lib/supabase/client'

// Static defaults — used until remote flags are fetched
const DEFAULTS = {
  LENDING: true,
  LENDING_PAYMENTS: false,    // Lending deposit/fees — hidden for pivot
  PAYMENTS: false,
  PRO_SUBSCRIPTION: false,
  BUSINESS_ACCOUNT: false,
  AD_CAMPAIGNS: false,
  IDENTITY_VERIFICATION: false,
  EVENTS_TAPAHTUMA_TYPE: true,
  BOOSTS: false,              // Disabled for pivot — no paid visibility
  FORUM: false,               // Disabled for pivot — focus on core
  GROUPS: false,              // Disabled for pivot — focus on core
  LEADERBOARD: false,         // Disabled for pivot — no gamification
  POLLS: true,                // New: community polls
} as const

type FeatureKey = keyof typeof DEFAULTS

const CACHE_KEY = 'tackbird_feature_flags'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Mutable runtime state (starts with defaults, updated from remote)
let _flags: Record<FeatureKey, boolean> = { ...DEFAULTS }
let _rolloutPercentages: Record<string, number> = {}
let _lastFetchedAt = 0

/**
 * Current feature flags.
 * Starts with static defaults, updated by fetchRemoteFlags().
 *
 * Usage: import { FEATURES } from '@/lib/featureFlags'
 * if (FEATURES.PAYMENTS) { ... }
 *
 * Note: percentage-based rollout helpers (isFeatureEnabled / isInRollout)
 * used to live here but were never called from the app. Add them back
 * when a screen actually needs per-user gating.
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
