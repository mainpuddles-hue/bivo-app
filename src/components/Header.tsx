import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Bell, Search, Map } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { TackBirdLogo } from './TackBirdLogo'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

export function Header() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let mounted = true
    async function fetchUnread() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !mounted) return
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
      if (mounted) setUnreadCount(count ?? 0)
    }
    fetchUnread()
    return () => { mounted = false }
  }, [supabase])

  return (
    <View style={[
      styles.header,
      {
        paddingTop: insets.top,
        backgroundColor: isDark ? 'rgba(30,30,30,0.97)' : 'rgba(255,255,255,0.97)',
        borderBottomColor: colors.border,
      }
    ]}>
      <View style={styles.headerContent}>
        <Pressable onPress={() => router.push('/')} style={styles.logoRow}>
          <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
            <TackBirdLogo size={16} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.wordmark, { color: colors.primary }]}>TACKBIRD</Text>
        </Pressable>

        <View style={styles.actions}>
          <Pressable onPress={() => router.push('/search')} style={styles.iconButton} hitSlop={8}>
            <Search size={20} color={colors.mutedForeground} strokeWidth={1.8} />
          </Pressable>
          <Pressable style={styles.iconButton} hitSlop={8}>
            <Map size={20} color={colors.mutedForeground} strokeWidth={1.8} />
          </Pressable>
          <Pressable onPress={() => router.push('/notifications')} style={styles.iconButton} hitSlop={8}>
            <Bell
              size={20}
              color={unreadCount > 0 ? colors.primary : colors.mutedForeground}
              strokeWidth={unreadCount > 0 ? 2 : 1.8}
            />
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.badgeText, { color: colors.accentForeground }]}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerContent: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 48, paddingHorizontal: 16,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoCircle: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  wordmark: { fontSize: 12, fontWeight: '700', letterSpacing: 1.7 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', right: 4, top: 4,
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 9, fontWeight: '700' },
})
