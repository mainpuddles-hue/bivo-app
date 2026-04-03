import React from 'react'
import { View, Text, Pressable, StyleSheet, Appearance } from 'react-native'
import { AlertTriangle, RotateCcw } from 'lucide-react-native'
import * as Sentry from '@sentry/react-native'

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
 * Root-level Error Boundary for TackBird.
 *
 * Uses hardcoded Finnish + English strings because this component wraps
 * ABOVE ThemeProvider and I18nProvider — if those crash, we still need
 * to show a recovery screen.
 *
 * Uses Appearance.getColorScheme() for dark mode support without ThemeProvider.
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

      const isDark = Appearance.getColorScheme() === 'dark'

      return (
        <View style={[styles.container, isDark && styles.containerDark]}>
          <View style={[styles.iconCircle, isDark && styles.iconCircleDark]}>
            <AlertTriangle size={40} color={isDark ? '#EF4444' : '#D94F4F'} />
          </View>
          <Text style={[styles.title, isDark && styles.titleDark]}>Jokin meni pieleen</Text>
          <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
            Sovelluksessa tapahtui odottamaton virhe. Yritä uudelleen.
          </Text>
          <Text style={[styles.subtitleEn, isDark && styles.subtitleEnDark]}>
            Something went wrong. Please try again.
          </Text>
          {__DEV__ && this.state.error && (
            <View style={[styles.errorBox, isDark && styles.errorBoxDark]}>
              <Text style={[styles.errorDetail, isDark && styles.errorDetailDark]} numberOfLines={6}>
                {this.state.error.message}
              </Text>
            </View>
          )}
          <Pressable
            onPress={this.handleRetry}
            style={({ pressed }) => [
              styles.retryBtn,
              isDark && styles.retryBtnDark,
              pressed && styles.retryBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Yritä uudelleen / Try again"
          >
            <RotateCcw size={18} color="#FFFFFF" />
            <Text style={styles.retryText}>Yritä uudelleen / Try again</Text>
          </Pressable>
        </View>
      )
    }

    return this.props.children
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  containerDark: {
    backgroundColor: '#121212',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#D94F4F14',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconCircleDark: {
    backgroundColor: '#EF444420',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  titleDark: {
    color: '#E8E6E0',
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitleDark: {
    color: '#9CA3AF',
  },
  subtitleEn: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  subtitleEnDark: {
    color: '#6B7280',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    maxWidth: '100%',
  },
  errorBoxDark: {
    backgroundColor: '#450A0A',
  },
  errorDetail: {
    fontSize: 12,
    color: '#991B1B',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  errorDetailDark: {
    color: '#FCA5A5',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2D6B5E',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    minHeight: 50,
    shadowColor: '#2D6B5E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  retryBtnDark: {
    backgroundColor: '#6FCF97',
    shadowColor: '#6FCF97',
  },
  retryBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
