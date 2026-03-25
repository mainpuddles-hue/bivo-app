import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { AlertTriangle, RotateCcw } from 'lucide-react-native'

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
    console.error('[ErrorBoundary]', error.message, errorInfo.componentStack)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <View style={styles.container}>
          <View style={styles.iconCircle}>
            <AlertTriangle size={40} color="#D94F4F" />
          </View>
          <Text style={styles.title}>Jokin meni pieleen</Text>
          <Text style={styles.subtitle}>
            Sovelluksessa tapahtui odottamaton virhe. Yrita uudelleen.
          </Text>
          <Text style={styles.subtitleEn}>
            Something went wrong. Please try again.
          </Text>
          {__DEV__ && this.state.error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorDetail} numberOfLines={6}>
                {this.state.error.message}
              </Text>
            </View>
          )}
          <Pressable
            onPress={this.handleRetry}
            style={({ pressed }) => [
              styles.retryBtn,
              pressed && styles.retryBtnPressed,
            ]}
          >
            <RotateCcw size={18} color="#FFFFFF" />
            <Text style={styles.retryText}>Yrita uudelleen / Try again</Text>
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
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#D94F4F14',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.3,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitleEn: {
    fontSize: 13,
    color: '#9CA3AF',
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
    maxWidth: '100%',
  },
  errorDetail: {
    fontSize: 12,
    color: '#991B1B',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2D6B5E',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    minHeight: 50,
    shadowColor: '#2D6B5E',
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
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
