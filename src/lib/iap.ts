import { Platform } from 'react-native'
import type { BoostTier } from '@/lib/types'

// Product definitions
export const BOOST_PRODUCTS = [
  { id: 'com.tackbird.boost_1', credits: 1, priceCents: 199, label: 'boost.boost1' },
  { id: 'com.tackbird.boost_3', credits: 3, priceCents: 499, label: 'boost.boost3' },
  { id: 'com.tackbird.boost_5', credits: 5, priceCents: 799, label: 'boost.boost5' },
] as const

export type BoostProductId = (typeof BOOST_PRODUCTS)[number]['id']

// Tier discount
export function getDiscountedPrice(baseCents: number, tier: BoostTier): number {
  if (tier === 'pro') return Math.round(baseCents * 0.80)
  if (tier === 'business') return Math.round(baseCents * 0.70)
  return baseCents
}

// Boost duration by tier (hours)
export function getBoostDurationHours(tier: BoostTier): number {
  if (tier === 'business') return 168  // 7 days
  if (tier === 'pro') return 72        // 3 days
  return 24
}

// Check if IAP is available (not in Expo Go)
export function isIAPAvailable(): boolean {
  // react-native-iap requires native modules
  // In Expo Go (__DEV__ + no native modules), use sandbox mode
  try {
    require('react-native-iap')
    return true
  } catch {
    return false
  }
}

// Sandbox mode detection
export function isSandboxMode(): boolean {
  return __DEV__ || !isIAPAvailable()
}

// Format price for display
export function formatBoostPrice(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} \u20AC`
}
