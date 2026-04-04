import React from 'react'
import { View, Text, Pressable, StyleSheet, Appearance } from 'react-native'
import { AlertCircle, RotateCcw } from 'lucide-react-native'

interface Props {
  children: React.ReactNode
  /** Optional screen name for logging */
  screenName?: string
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Lightweight screen-level Error Boundary.
 *
 * Shows an inline error card instead of a full-screen crash.
 * Uses Appearance.getColorScheme() for dark mode support without ThemeProvider.
 */
export class ScreenErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const label = this.props.screenName ?? 'Screen'
    if (__DEV__) console.error(`[ScreenErrorBoundary:${label}]`, error.message, errorInfo.componentStack)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      const isDark = Appearance.getColorScheme() === 'dark'

      return (
        <View style={styles.wrapper}>
          <View style={[styles.card, isDark && styles.cardDark]}>
            <View style={styles.iconRow}>
              <AlertCircle size={22} color={isDark ? '#EF4444' : '#D94F4F'} />
              <Text style={[styles.title, isDark && styles.titleDark]}>Virhe / Error</Text>
            </View>
            <Text style={[styles.description, isDark && styles.descriptionDark]}>
              Jotain meni pieleen. Yritä ladata uudelleen.
            </Text>
            {__DEV__ && this.state.error && (
              <Text style={[styles.errorDetail, isDark && styles.errorDetailDark]} numberOfLines={3}>
                {this.state.error.message}
              </Text>
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
              <RotateCcw size={16} color={isDark ? '#121212' : '#FFFFFF'} />
              <Text style={[styles.retryText, isDark && { color: '#121212' }]}>Yritä uudelleen</Text>
            </Pressable>
          </View>
        </View>
      )
    }

    return this.props.children
  }
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    gap: 12,
  },
  cardDark: {
    backgroundColor: '#1E1E1E',
    shadowOpacity: 0.3,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.2,
  },
  titleDark: {
    color: '#E8E6E0',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  descriptionDark: {
    color: '#9CA3AF',
  },
  errorDetail: {
    fontSize: 11,
    color: '#991B1B',
    fontFamily: 'monospace',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 8,
    lineHeight: 16,
    overflow: 'hidden',
  },
  errorDetailDark: {
    color: '#FCA5A5',
    backgroundColor: '#450A0A',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2D6B5E',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  retryBtnDark: {
    backgroundColor: '#6FCF97',
  },
  retryBtnPressed: {
    opacity: 0.85,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
