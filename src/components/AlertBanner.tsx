import { useState, useEffect, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native'
import { AlertTriangle, Bus, X, ChevronDown, ChevronUp } from 'lucide-react-native'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { fetchAllAlerts, type AppAlert } from '@/lib/alerts'

// Module-level — survives component remounts
const dismissedAlertIds = new Set<string>()

export function AlertBanner() {
  const { colors } = useTheme()
  const { t } = useI18n()
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
    <View style={styles.container} accessibilityLiveRegion="polite">
      {shownAlerts.map(alert => {
        const isWeather = alert.type === 'weather'
        const isSevere = alert.severity === 'severe' || alert.severity === 'warning'
        const bgColor = colors.muted
        const borderColor = colors.border
        const iconColor = isSevere ? colors.destructive : colors.mutedForeground
        const isExpanded = expandedId === alert.id

        return (
          <PressableOpacity
            key={alert.id}
            onPress={() => {
              if (alert.type === 'transit' && alert.url) {
                try {
                  const u = new URL(alert.url)
                  if (u.protocol === 'http:' || u.protocol === 'https:') Linking.openURL(alert.url).catch(() => {})
                } catch {}
              } else {
                setExpandedId(prev => prev === alert.id ? null : alert.id)
              }
            }}
            style={[styles.alertCard, { backgroundColor: bgColor, borderColor }]}
          >
            <View style={styles.alertHeader}>
              <View importantForAccessibility="no-hide-descendants">
                {isWeather ? (
                  <AlertTriangle size={16} color={iconColor} />
                ) : (
                  <Bus size={16} color={iconColor} />
                )}
              </View>
              <Text style={[styles.alertTitle, { color: iconColor }]} numberOfLines={isExpanded ? undefined : 1}>
                {alert.title}
              </Text>
              <View style={styles.alertActions}>
                {alert.description && (
                  <Pressable onPress={(e) => { e.stopPropagation?.(); setExpandedId(prev => prev === alert.id ? null : alert.id) }} hitSlop={12} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('common.details')}>
                    {isExpanded ? (
                      <ChevronUp size={14} color={iconColor} />
                    ) : (
                      <ChevronDown size={14} color={iconColor} />
                    )}
                  </Pressable>
                )}
                <Pressable onPress={(e) => { e.stopPropagation?.(); handleDismiss(alert.id) }} hitSlop={12} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                  <X size={14} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>
            {isExpanded && alert.description && (
              <Text style={[styles.alertDesc, { color: colors.foreground }]}>
                {alert.description}
              </Text>
            )}
          </PressableOpacity>
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
    borderRadius: 20, borderWidth: 1,
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
