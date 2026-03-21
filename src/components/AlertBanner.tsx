import { useState, useEffect, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native'
import { AlertTriangle, Bus, X, ChevronDown, ChevronUp } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { fonts } from '@/lib/fonts'
import { fetchAllAlerts, type AppAlert } from '@/lib/alerts'

// Module-level — survives component remounts
const dismissedAlertIds = new Set<string>()

export function AlertBanner() {
  const { colors } = useTheme()
  const [alerts, setAlerts] = useState<AppAlert[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set(dismissedAlertIds))
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    fetchAllAlerts().then(setAlerts)
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
        const bgColor = isSevere ? '#D94F4F18' : '#E8A05018'
        const borderColor = isSevere ? '#D94F4F44' : '#E8A05044'
        const iconColor = isSevere ? '#D94F4F' : '#E8A050'
        const isExpanded = expandedId === alert.id

        return (
          <Pressable
            key={alert.id}
            onPress={() => {
              if (alert.type === 'transit' && alert.url) {
                Linking.openURL(alert.url)
              } else {
                setExpandedId(prev => prev === alert.id ? null : alert.id)
              }
            }}
            style={[styles.alertCard, { backgroundColor: bgColor, borderColor }]}
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
                  <Pressable onPress={(e) => { e.stopPropagation?.(); setExpandedId(prev => prev === alert.id ? null : alert.id) }} hitSlop={8}>
                    {isExpanded ? (
                      <ChevronUp size={14} color={iconColor} />
                    ) : (
                      <ChevronDown size={14} color={iconColor} />
                    )}
                  </Pressable>
                )}
                <Pressable onPress={(e) => { e.stopPropagation?.(); handleDismiss(alert.id) }} hitSlop={8}>
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
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10,
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
