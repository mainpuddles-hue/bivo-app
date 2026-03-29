import * as Sentry from '@sentry/react-native'

export function initSentry() {
  if (__DEV__) return // Don't report in development
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    tracesSampleRate: 0.2,
    environment: __DEV__ ? 'development' : 'production',
  })
}
