import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
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
 * Use this inside individual screens that are high-risk (complex data flows,
 * native modules, realtime connections).
 *
 * This component lives INSIDE providers, so it could use hooks — but since
 * it's a class component it uses hardcoded colors that match Helsinki Dusk.
 * The inline card is small enough that the surrounding screen (tabs, header)
 * remains visible.
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
    console.error(`[ScreenErrorBoundary:${label}]`, error.message, errorInfo.componentStack)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.wrapper}>
          <View style={styles.card}>
            <View style={styles.iconRow}>
              <AlertCircle size={22} color="#D94F4F" />
              <Text style={styles.title}>Virhe / Error</Text>
            </View>
            <Text style={styles.description}>
              Jotain meni pieleen. Yrita ladata uudelleen.
            </Text>
            {__DEV__ && this.state.error && (
              <Text style={styles.errorDetail} numberOfLines={3}>
                {this.state.error.message}
              </Text>
            )}
            <Pressable
              onPress={this.handleRetry}
              style={({ pressed }) => [
                styles.retryBtn,
                pressed && styles.retryBtnPressed,
              ]}
            >
              <RotateCcw size={15} color="#FFFFFF" />
              <Text style={styles.retryText}>Yrita uudelleen</Text>
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
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
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
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#2D6B5E',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
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
