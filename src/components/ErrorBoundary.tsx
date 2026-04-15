import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { AlertTriangle, RotateCcw } from 'lucide-react-native'
import * as Sentry from '@sentry/react-native'
import { useTheme } from '@/hooks/useTheme'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Inner function component that renders the error fallback UI.
 * Uses useTheme() for theme-aware colors — works even outside ThemeProvider
 * because useTheme() falls back to useColorScheme().
 */
function ErrorFallbackUI({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const { colors } = useTheme()

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.iconCircle, { backgroundColor: colors.destructive + '14' }]}>
        <AlertTriangle size={40} color={colors.destructive} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>Jokin meni pieleen</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Sovelluksessa tapahtui odottamaton virhe. Yritä uudelleen.
      </Text>
      <Text style={[styles.subtitleEn, { color: colors.mutedForeground }]}>
        Something went wrong. Please try again.
      </Text>
      {__DEV__ && error && (
        <View style={[styles.errorBox, { backgroundColor: colors.destructive + '14' }]}>
          <Text style={[styles.errorDetail, { color: colors.destructive }]} numberOfLines={6}>
            {error.message}
          </Text>
        </View>
      )}
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retryBtn,
          { backgroundColor: colors.primary, shadowColor: colors.primary },
          pressed && styles.retryBtnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Yritä uudelleen / Try again"
      >
        <RotateCcw size={18} color={colors.primaryForeground} />
        <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Yritä uudelleen / Try again</Text>
      </Pressable>
    </View>
  )
}

/**
 * Root-level Error Boundary for TackBird.
 *
 * Uses hardcoded Finnish + English strings because this component wraps
 * ABOVE I18nProvider — if it crashes, we still need to show a recovery screen.
 *
 * Theme colors come from the inner ErrorFallbackUI function component
 * which calls useTheme() (safe outside ThemeProvider due to fallback).
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (__DEV__) console.error('[ErrorBoundary]', error.message, errorInfo.componentStack)
    Sentry.captureException(error)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return <ErrorFallbackUI error={this.state.error} onRetry={this.handleRetry} />
    }

    return this.props.children
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitleEn: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorBox: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 24,
    maxWidth: '100%',
  },
  errorDetail: {
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    minHeight: 50,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  retryBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
})
