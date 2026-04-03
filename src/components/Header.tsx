import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { Bell, Search, Map } from 'lucide-react-native'
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
            <TackBirdLogo size={16} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.wordmark, { color: colors.primary }]}>TACKBIRD</Text>
        </Pressable>

        <View style={styles.actions}>
          <Pressable accessibilityLabel={t('common.search')} onPress={() => router.push('/search')} style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]} hitSlop={8}>
            <Search size={20} color={colors.mutedForeground} strokeWidth={1.8} />
          </Pressable>
          <Pressable accessibilityLabel={t('nav.map')} onPress={() => router.push('/map')} style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]} hitSlop={8}>
            <Map size={20} color={colors.mutedForeground} strokeWidth={1.8} />
          </Pressable>
          <Pressable accessibilityLabel={t('nav.notifications')} onPress={() => router.push('/notifications')} style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]} hitSlop={8}>
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
    zIndex: 40,
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
  wordmark: { fontSize: 12, fontFamily: fonts.heading, letterSpacing: 1.7, lineHeight: 16 },
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
  badgeText: { fontSize: 9, fontFamily: fonts.bodyMedium, lineHeight: 12 },
})
