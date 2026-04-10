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
      setStatus({
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      })
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return status
}
