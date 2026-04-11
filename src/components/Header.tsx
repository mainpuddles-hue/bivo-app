import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { Bell, Search, Map } from 'lucide-react-native'
import { PressableOpacity } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { TackBirdLogo } from './TackBirdLogo'
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
        backgroundColor: isDark ? 'rgba(30,30,30,0.97)' : 'rgba(255,255,255,0.97)',
        borderBottomColor: colors.border,
      }
    ]}>
      <View style={styles.headerContent}>
        <Pressable onPress={() => router.push('/')} style={styles.logoRow} accessibilityLabel={t('nav.feed')} accessibilityRole="button">
          <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
            <TackBirdLogo size={20} color={colors.primaryForeground} />
          </View>
        </Pressable>

        <View style={styles.actions}>
          <PressableOpacity accessibilityLabel={t('common.search')} onPress={() => router.push('/search')} style={styles.iconButton} hitSlop={8}>
            <Search size={20} color={colors.foreground} strokeWidth={2} />
          </PressableOpacity>
          <PressableOpacity accessibilityLabel={t('nav.map')} onPress={() => router.push('/map')} style={styles.iconButton} hitSlop={8}>
            <Map size={20} color={colors.foreground} strokeWidth={2} />
          </PressableOpacity>
          <PressableOpacity accessibilityLabel={t('nav.notifications')} onPress={() => router.push('/notifications')} style={styles.iconButton} hitSlop={8}>
            <Bell
              size={20}
              color={unreadCount > 0 ? colors.primary : colors.foreground}
              strokeWidth={unreadCount > 0 ? 2 : 1.8}
            />
            {unreadCount > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.badgeText, { color: colors.accentForeground }]}>
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
    height: 48, paddingHorizontal: 16,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logoCircle: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#000000',
    backgroundColor: '#FFFFFF',
  },
  badge: {
    position: 'absolute', right: 4, top: 4,
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { fontSize: 11, fontFamily: fonts.bodyMedium, lineHeight: 12 },
})
