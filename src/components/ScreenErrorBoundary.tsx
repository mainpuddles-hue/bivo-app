import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { AlertCircle, RotateCcw } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'

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
 * Inner function component that renders the inline error card.
 * Uses useTheme() for theme-aware colors.
 */
function ScreenErrorFallbackUI({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const { colors } = useTheme()
  const { t } = useI18n()

  return (
    <View style={styles.wrapper}>
      <View style={[styles.card, { backgroundColor: colors.card, shadowColor: '#000' }]}>
        <View style={styles.iconRow}>
          <AlertCircle size={22} color={colors.destructive} />
          <Text style={[styles.title, { color: colors.foreground }]}>{t('screenError.title')}</Text>
        </View>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          {t('screenError.description')}
        </Text>
        {__DEV__ && error && (
          <Text
            style={[styles.errorDetail, { color: colors.destructive, backgroundColor: colors.destructive + '14' }]}
            numberOfLines={3}
          >
            {error.message}
          </Text>
        )}
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retryBtn,
            { backgroundColor: colors.primary },
            pressed && styles.retryBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('screenError.retry')}
        >
          <RotateCcw size={16} color={colors.primaryForeground} />
          <Text style={[styles.retryText, { color: colors.primaryForeground }]}>{t('screenError.retry')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

/**
 * Lightweight screen-level Error Boundary.
 *
 * Shows an inline error card instead of a full-screen crash.
 * Theme colors come from the inner ScreenErrorFallbackUI function component
 * which calls useTheme().
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
      return <ScreenErrorFallbackUI error={this.state.error} onRetry={this.handleRetry} />
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
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    gap: 12,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  errorDetail: {
    fontSize: 11,
    fontFamily: 'monospace',
    borderRadius: 8,
    padding: 8,
    lineHeight: 16,
    overflow: 'hidden',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    marginTop: 4,
  },
  retryBtnPressed: {
    opacity: 0.85,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
})
