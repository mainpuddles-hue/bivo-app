/**
 * Shown on first feed visit. Explains what TackBird is.
 * Dismissable — stores in AsyncStorage.
 * Shows live community stats (member count, posts today).
 */

import { useEffect, useState, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { X } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'

const STORAGE_KEY = 'first_visit_banner_dismissed'

interface FirstVisitBannerProps {
  neighborhood?: string | null
}

export function FirstVisitBanner({ neighborhood }: FirstVisitBannerProps) {
  const { colors } = useTheme()
  const supabase = useSupabase()

  const [visible, setVisible] = useState(false)
  const [userCount, setUserCount] = useState<number | null>(null)
  const [todayCount, setTodayCount] = useState<number | null>(null)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(val => {
        if (!val) setVisible(true)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!visible) return

    async function fetchStats() {
      try {
        const { count: members } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })

        const { count: today } = await supabase
          .from('posts')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 86400000).toISOString())

        if (members != null) setUserCount(members)
        if (today != null) setTodayCount(today)
      } catch {
        // stats are non-critical — silently ignore errors
      }
    }

    fetchStats()
  }, [visible, supabase])

  const handleDismiss = useCallback(() => {
    setVisible(false)
    AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => {})
  }, [])

  if (!visible) return null

  const title = neighborhood
    ? `${neighborhood}n ilmoitustaulu`
    : 'Naapuruston ilmoitustaulu'

  const statsText =
    userCount != null && todayCount != null
      ? `${userCount} naapuria · ${todayCount} uutta tänään`
      : userCount != null
      ? `${userCount} naapuria`
      : null

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: colors.border,
          backgroundColor: 'transparent',
        },
      ]}
    >
      <Pressable
        onPress={handleDismiss}
        style={styles.dismissBtn}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Sulje"
      >
        <X size={16} color={colors.mutedForeground} />
      </Pressable>

      <Text style={[styles.title, { color: colors.foreground }]}>
        {title}
      </Text>

      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        {'Pyydä apua, tarjoa palveluita, jaa ilmaista — kaikki lähellä sinua.'}
      </Text>

      {statsText != null && (
        <Text style={[styles.stats, { color: colors.foreground }]}>
          {statsText}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: 12,
    gap: 4,
  },
  dismissBtn: {
    position: 'absolute',
    top: 10,
    right: 12,
    zIndex: 1,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: fonts.heading,
    lineHeight: 23,
    paddingRight: 28,
  },
  body: {
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
  },
  stats: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    lineHeight: 18,
    marginTop: 2,
  },
})
