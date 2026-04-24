import NetInfo from '@react-native-community/netinfo'
import { mapErrorToFinnish } from '@/lib/errorMessages'

/**
 * Returns a network-aware, translated error message.
 *
 * 1. Checks device connectivity via NetInfo.
 *    - If offline → returns `errors.noInternet` (short) or `errors.network` (detailed).
 * 2. If online → delegates to `mapErrorToFinnish` which classifies the error
 *    (timeout, server error, Stripe code, auth, etc.) and returns the right i18n string.
 *
 * Usage:
 *   const msg = await getNetworkAwareError(err, t)
 *   toast.show({ message: msg, type: 'error' })
 */
export async function getNetworkAwareError(
  error: unknown,
  t: (key: string) => string,
): Promise<string> {
  try {
    const state = await NetInfo.fetch()
    if (state.isConnected === false || state.isInternetReachable === false) {
      return t('errors.network')
    }
  } catch {
    // NetInfo unavailable — fall through to error classification
  }

  return mapErrorToFinnish(error, t)
}

/**
 * Synchronous variant that accepts a pre-fetched `isConnected` boolean
 * (e.g., from the `useNetworkStatus` hook).
 *
 * Prefer this in render paths where you already have the hook value
 * to avoid an extra async NetInfo.fetch().
 */
export function getNetworkAwareErrorSync(
  error: unknown,
  t: (key: string) => string,
  isConnected: boolean | null,
): string {
  if (isConnected === false) {
    return t('errors.network')
  }
  return mapErrorToFinnish(error, t)
}
