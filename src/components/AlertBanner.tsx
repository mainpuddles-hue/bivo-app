import { useState, useEffect, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native'
import { AlertTriangle, Bus, X, ChevronDown, ChevronUp } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'
import { CATEGORIES } from '@/lib/constants'
import { fetchAllAlerts, type AppAlert } from '@/lib/alerts'

// Module-level — survives component remounts
const dismissedAlertIds = new Set<string>()

export function AlertBanner() {
  const { colors } = useTheme()
  const [alerts, setAlerts] = useState<AppAlert[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set(dismissedAlertIds))
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    fetchAllAlerts().then(setAlerts).catch(() => {})
  }, [])

  const handleDismiss = useCallback((id: string) => {
    dismissedAlertIds.add(id)
    setDismissed(prev => new Set(prev).add(id))
  }, [])

  const visibleAlerts = alerts.filter(a => !dismissed.has(a.id))
  const shownAlerts = visibleAlerts.slice(0, 2)
  const moreCount = visibleAlerts.length - shownAlerts.length
  if (visibleAlerts.length === 0) return null

  return (
    <View style={styles.container}>
      {shownAlerts.map(alert => {
        const isWeather = alert.type === 'weather'
        const isSevere = alert.severity === 'severe' || alert.severity === 'warning'
        const bgColor = isSevere ? `${colors.destructive}18` : `${CATEGORIES.nappaa.color}18`
        const borderColor = isSevere ? `${colors.destructive}44` : `${CATEGORIES.nappaa.color}44`
        const iconColor = isSevere ? colors.destructive : CATEGORIES.nappaa.color
        const isExpanded = expandedId === alert.id

        return (
          <Pressable
            key={alert.id}
            onPress={() => {
              if (alert.type === 'transit' && alert.url) {
                Linking.openURL(alert.url).catch(() => {})
              } else {
                setExpandedId(prev => prev === alert.id ? null : alert.id)
              }
            }}
            style={({ pressed }) => [styles.alertCard, { backgroundColor: bgColor, borderColor }, pressed && { opacity: 0.7 }]}
          >
            <View style={styles.alertHeader}>
              {isWeather ? (
                <AlertTriangle size={16} color={iconColor} />
              ) : (
                <Bus size={16} color={iconColor} />
              )}
              <Text style={[styles.alertTitle, { color: iconColor }]} numberOfLines={isExpanded ? undefined : 1}>
                {alert.title}
              </Text>
              <View style={styles.alertActions}>
                {alert.description && (
                  <Pressable onPress={(e) => { e.stopPropagation?.(); setExpandedId(prev => prev === alert.id ? null : alert.id) }} hitSlop={16} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="Toggle details">
                    {isExpanded ? (
                      <ChevronUp size={14} color={iconColor} />
                    ) : (
                      <ChevronDown size={14} color={iconColor} />
                    )}
                  </Pressable>
                )}
                <Pressable onPress={(e) => { e.stopPropagation?.(); handleDismiss(alert.id) }} hitSlop={16} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel="Dismiss">
                  <X size={14} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>
            {isExpanded && alert.description && (
              <Text style={[styles.alertDesc, { color: colors.foreground }]}>
                {alert.description}
              </Text>
            )}
          </Pressable>
        )
      })}
      {moreCount > 0 && (
        <Text style={[styles.moreText, { color: colors.mutedForeground }]}>
          +{moreCount} ...
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  alertCard: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  alertHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  alertTitle: {
    flex: 1, fontSize: 13, fontFamily: fonts.bodySemi, lineHeight: 17,
  },
  alertActions: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  alertDesc: {
    fontSize: 12, fontFamily: fonts.body, lineHeight: 17, marginTop: 6,
    paddingLeft: 24,
  },
  moreText: {
    fontSize: 12, fontFamily: fonts.bodySemi, textAlign: 'center',
    paddingVertical: 4,
  },
})
