import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { Bell, Search, Map } from 'lucide-react-native'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useState, useCallback } from 'react'
import { useSupabase } from '@/hooks/useSupabase'

export function Header() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const [unreadCount, setUnreadCount] = useState(0)

  useFocusEffect(useCallback(() => {
    let mounted = true
    async function fetchUnread() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !mounted) return
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false)
        if (mounted) setUnreadCount(count ?? 0)
      } catch {
        // Network error or expired session — non-critical
      }
    }
    fetchUnread()
    return () => { mounted = false }
  }, [supabase]))

  return (
    <View style={[
      styles.header,
      {
        paddingTop: insets.top,
        backgroundColor: colors.background,
        borderBottomColor: colors.border,
      }
    ]}>
      <View style={styles.headerContent}>
        {/* Left: Search */}
        <PressableOpacity accessibilityLabel={t('common.search')} accessibilityRole="button" onPress={() => router.push('/search')} style={styles.iconButton} hitSlop={8}>
          <Search size={22} color={colors.foreground} strokeWidth={1.8} />
        </PressableOpacity>

        {/* Right: Map + Notifications */}
        <View style={styles.actions}>
          <PressableOpacity accessibilityLabel={t('nav.map')} accessibilityRole="button" onPress={() => router.push('/map')} style={styles.iconButton} hitSlop={8}>
            <Map size={22} color={colors.foreground} strokeWidth={1.8} />
          </PressableOpacity>
          <PressableOpacity accessibilityLabel={unreadCount > 0 ? `${t('nav.notifications')} (${unreadCount} uutta)` : t('nav.notifications')} accessibilityRole="button" onPress={() => router.push('/notifications')} style={styles.iconButton} hitSlop={8}>
            <Bell
              size={22}
              color={unreadCount > 0 ? colors.primary : colors.foreground}
              strokeWidth={unreadCount > 0 ? 2.2 : 1.8}
            />
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]} importantForAccessibility="no-hide-descendants">
                <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </PressableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    zIndex: 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerContent: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 44, paddingHorizontal: 8,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  iconButton: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', right: 4, top: 4,
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '600', lineHeight: 12 },
})
