import { memo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MapPin } from 'lucide-react-native'

interface MapErrorStateProps {
  error: string
  hint: string
  onRetry: () => void
  retryLabel: string
  colors: {
    card: string
    border: string
    foreground: string
    mutedForeground: string
    primary: string
  }
}

export const MapErrorState = memo(function MapErrorState({
  error,
  hint,
  onRetry,
  retryLabel,
  colors,
}: MapErrorStateProps) {
  return (
    <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{error}</Text>
      <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{hint}</Text>
      <Pressable onPress={onRetry} style={[styles.emptyBtn, { backgroundColor: colors.primary }]}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>{retryLabel}</Text>
      </Pressable>
    </View>
  )
})

interface MapEmptyStateProps {
  title: string
  hint: string
  onReset: () => void
  resetLabel: string
  colors: {
    card: string
    border: string
    foreground: string
    mutedForeground: string
    primary: string
  }
}

export const MapEmptyState = memo(function MapEmptyState({
  title,
  hint,
  onReset,
  resetLabel,
  colors,
}: MapEmptyStateProps) {
  return (
    <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <MapPin size={32} color={colors.mutedForeground} style={{ opacity: 0.3 }} />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{hint}</Text>
      <Pressable onPress={onReset} style={[styles.emptyBtn, { backgroundColor: colors.primary }]}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>{resetLabel}</Text>
      </Pressable>
    </View>
  )
})

const styles = StyleSheet.create({
  empty: {
    position: 'absolute',
    left: 40,
    right: 40,
    top: '40%',
    zIndex: 10,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  emptyBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, marginTop: 4 },
})
