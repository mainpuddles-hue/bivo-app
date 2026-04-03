import * as Sentry from '@sentry/react-native'

export function initSentry() {
  if (__DEV__) return // Don't report in development
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    tracesSampleRate: 0.2,
    environment: __DEV__ ? 'development' : 'production',
    // Attach user context for debugging
    beforeSend(event) {
      // Strip PII from breadcrumbs (GDPR)
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(b => {
          if (b.data?.url) {
            // Remove query params that may contain tokens
            try {
              const url = new URL(b.data.url)
              url.search = ''
              b.data.url = url.toString()
            } catch {}
          }
          return b
        })
      }
      return event
    },
  })
}

/** Set user context for Sentry reports */
export function setSentryUser(userId: string | null) {
  if (__DEV__) return
  if (userId) {
    Sentry.setUser({ id: userId })
  } else {
    Sentry.setUser(null)
  }
}

/** Track navigation for Sentry breadcrumbs */
export function addSentryBreadcrumb(screen: string) {
  if (__DEV__) return
  Sentry.addBreadcrumb({
    category: 'navigation',
    message: `Navigated to ${screen}`,
    level: 'info',
  })
}

/** Capture non-fatal error with context */
export function captureError(error: unknown, context?: Record<string, string>) {
  if (__DEV__) {
    console.error('[Sentry]', error)
    return
  }
  if (context) {
    Sentry.setContext('extra', context)
  }
  Sentry.captureException(error)
}
