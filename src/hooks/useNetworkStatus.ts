import { useState, useEffect } from 'react'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'

interface NetworkStatus {
  isConnected: boolean | null
  isInternetReachable: boolean | null
  type: string | null
}

/**
 * Monitors network connectivity.
 * Returns current connection status for UI display
 * (e.g., offline banner, retry prompts).
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    type: null,
  })

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      // NetInfo often reports false negatives in iOS Simulator.
      // Only mark as disconnected when isConnected is explicitly false
      // AND isInternetReachable confirms it (not just null/unknown).
      const connected =
        state.isConnected === false && state.isInternetReachable === false
          ? false
          : true

      setStatus({
        isConnected: connected,
        isInternetReachable: connected ? state.isInternetReachable : false,
        type: state.type,
      })
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return status
}
