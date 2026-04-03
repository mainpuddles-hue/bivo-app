import { useEffect } from 'react'
import { captureError } from '@/lib/sentry'

/**
 * Global unhandled promise rejection handler.
 * Catches async errors that escape try/catch blocks
 * and reports them to Sentry without crashing the app.
 */
export function useGlobalErrorRecovery() {
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      event.preventDefault()
      captureError(event.reason, {
        type: 'unhandled_promise_rejection',
      })
    }

    // @ts-ignore — RN global
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('unhandledrejection', handler)
      return () => {
        globalThis.removeEventListener('unhandledrejection', handler)
      }
    }
  }, [])
}
