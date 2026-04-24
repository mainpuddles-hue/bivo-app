import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { View, Text, StyleSheet, Animated, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, AlertCircle, Info, X } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { fonts } from '@/lib/fonts'
import { PressableOpacity } from '@/components/ui'
import { shadowLg, shadowLgDark } from '@/lib/shadows'

/**
 * Toast system — non-blocking success/info/error feedback.
 *
 * Replaces Alert.alert for non-critical confirmations. Modal Alert
 * blocks the UI and interrupts the user's flow; toasts slide up,
 * auto-dismiss in 3s, and can be manually dismissed.
 *
 * Usage:
 *   const toast = useToast()
 *   toast.show({ message: 'Tallennettu', type: 'success' })
 *   toast.show({ message: 'Virhe', type: 'error' })
 */

type ToastType = 'success' | 'error' | 'info'

interface ToastOptions {
  message: string
  type?: ToastType
  duration?: number // ms, default 3000
}

interface ToastContextValue {
  show: (opts: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null)
  const idRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((opts: ToastOptions) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    const id = ++idRef.current
    setToast({ ...opts, id })
    const duration = opts.duration ?? 3000
    timeoutRef.current = setTimeout(() => {
      setToast(prev => (prev?.id === id ? null : prev))
    }, duration)
  }, [])

  const dismiss = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setToast(null)
  }, [])

  // Defensive cleanup if provider unmounts with a pending timer
  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <ToastDisplay toast={toast} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastDisplay({ toast, onDismiss }: { toast: (ToastOptions & { id: number }) | null; onDismiss: () => void }) {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const reduceMotion = useReduceMotion()
  const insets = useSafeAreaInsets()
  const translateY = useRef(new Animated.Value(100)).current
  const opacity = useRef(new Animated.Value(0)).current

  // Keep the last-rendered toast in state so exit animation has content to render
  // after `toast` becomes null. Replaced when a new toast arrives.
  const [rendered, setRendered] = useState<(ToastOptions & { id: number }) | null>(null)
  useEffect(() => {
    if (toast) setRendered(toast)
  }, [toast])

  useEffect(() => {
    if (!toast) {
      if (reduceMotion) {
        translateY.setValue(100)
        opacity.setValue(0)
        setRendered(null)
        return
      }
      Animated.parallel([
        Animated.spring(translateY, { toValue: 100, friction: 8, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start(({ finished }) => {
        // Only clear after exit animation completes so the UI has time to animate out
        if (finished) setRendered(null)
      })
      return
    }
    if (reduceMotion) {
      translateY.setValue(0)
      opacity.setValue(1)
      return
    }
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, friction: 7, tension: 100, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start()
  }, [toast, reduceMotion, translateY, opacity])

  if (!rendered) return null

  const type = rendered.type ?? 'success'
  const accent =
    type === 'success' ? colors.success :
    type === 'error' ? colors.destructive :
    colors.info
  const Icon =
    type === 'success' ? Check :
    type === 'error' ? AlertCircle :
    Info

  return (
    <Animated.View
      style={[
        styles.container,
        { bottom: insets.bottom + 88, transform: [{ translateY }], opacity, pointerEvents: 'box-none' },
      ]}
    >
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          { backgroundColor: isDark ? colors.cardElevated : colors.card, borderColor: colors.border },
          isDark ? shadowLgDark : shadowLg,
        ]}
      >
        <View style={[styles.iconCircle, { backgroundColor: `${accent}20` }]}>
          <Icon size={16} color={accent} strokeWidth={2.5} />
        </View>
        <Text style={[styles.message, { color: colors.foreground }]} numberOfLines={2}>
          {rendered.message}
        </Text>
        <PressableOpacity
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={styles.closeBtn}
        >
          <X size={14} color={colors.mutedForeground} />
        </PressableOpacity>
      </View>
    </Animated.View>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback: no-op. This lets consumers call useToast() even if the
    // provider isn't mounted (e.g. in tests or isolated screens).
    return { show: () => {} }
  }
  return ctx
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 260,
    maxWidth: 420,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { flex: 1, fontSize: 14, fontFamily: fonts.bodyMedium, lineHeight: 19 },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
})
