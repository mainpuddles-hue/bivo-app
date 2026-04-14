import { useState, useEffect, useRef, useMemo } from 'react'
import { enableFreeze } from 'react-native-screens'
import { Tabs, useRouter, usePathname } from 'expo-router'
import { View, Text, StyleSheet, Platform, Animated } from 'react-native'
import { BlurView } from 'expo-blur'
import * as Notifications from 'expo-notifications'
import { useReduceMotion } from '@/hooks/useReduceMotion'

// Freeze inactive screens to save memory and CPU
enableFreeze(true)
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Newspaper, Plus, MessageCircle, User, Compass } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { Header } from '@/components/Header'
import { useSupabase } from '@/hooks/useSupabase'
import { useUnreadCount } from '@/hooks/useUnreadCount'
import { useEventChatUnread } from '@/hooks/useEventChatUnread'

function TabIcon({ icon: Icon, label, focused, isCreate, colors, badge }: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>
  label: string
  focused: boolean
  isCreate?: boolean
  colors: ReturnType<typeof useTheme>['colors']
  badge?: number
}) {
  const reduceMotion = useReduceMotion()
  const scale = useRef(new Animated.Value(focused ? 1.1 : 1)).current
  const isFirstRun = useRef(true)

  // Apple HIG: spring pulse on focus change — skip initial mount (already at target)
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return }
    if (reduceMotion) {
      scale.setValue(focused ? 1.1 : 1)
      return
    }
    Animated.spring(scale, {
      toValue: focused ? 1.1 : 1,
      friction: 4,
      tension: 180,
      useNativeDriver: true,
    }).start()
  }, [focused, reduceMotion, scale])

  if (isCreate) {
    return (
      <View style={s.createTabItem}>
        <View style={[s.createFab, { backgroundColor: colors.primary }]}>
          <Icon size={24} color={colors.primaryForeground} strokeWidth={2.5} />
        </View>
      </View>
    )
  }

  return (
    <View style={s.tabItem}>
      <Animated.View style={[s.iconWrap, focused && { backgroundColor: `${colors.primary}18` }, { transform: [{ scale }] }]}>
        <Icon
          size={24}
          color={focused ? colors.primary : colors.mutedForeground}
          strokeWidth={focused ? 2.2 : 1.6}
        />
        {badge != null && badge > 0 && (
          <View style={[s.badge, { borderColor: colors.card, backgroundColor: colors.destructive }]}>
            <Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </Animated.View>
      <Text numberOfLines={1} style={[
        s.tabLabel,
        { color: focused ? colors.primary : colors.mutedForeground },
        focused && { fontWeight: '600' },
      ]}>{label}</Text>
      {focused && <View style={[s.activeBar, { backgroundColor: colors.primary }]} />}
    </View>
  )
}

export default function TabLayout() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  // Liquid Glass tab bar (iOS 26): translucent BlurView background
  // Falls back to semi-transparent solid color on Android (no native blur)
  const useGlass = Platform.OS === 'ios'
  const tabBarBg = useGlass
    ? 'transparent'
    : (isDark ? 'rgba(30,30,30,0.97)' : 'rgba(255,255,255,0.97)')
  const supabase = useSupabase()
  const [userId, setUserId] = useState<string | null>(null)
  const unreadCount = useUnreadCount(userId)
  const eventChatUnread = useEventChatUnread(userId)
  const totalUnread = unreadCount + eventChatUnread
  // Sync app icon badge with combined unread count. Centralized here so
  // useUnreadCount and useEventChatUnread can't fight each other. Change
  // detection prevents no-op bridge calls.
  const lastBadgeRef = useRef<number>(-1)
  useEffect(() => {
    if (lastBadgeRef.current === totalUnread) return
    lastBadgeRef.current = totalUnread
    Notifications.setBadgeCountAsync(totalUnread).catch(() => {})
  }, [totalUnread])

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (mounted && user) setUserId(user.id)
    }).catch(() => {})

    // Keep userId in sync with auth changes so unread hooks track the right user
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUserId(session?.user?.id ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  return (
    <View style={{ flex: 1 }}>
    <Header />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: tabBarBg,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 72 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 8,
          // Position absolute on iOS so content scrolls under the glass
          ...(useGlass ? { position: 'absolute' } : {}),
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
          elevation: 8,
        },
        tabBarShowLabel: false,
        ...(useGlass ? {
          tabBarBackground: () => (
            <BlurView
              tint={isDark ? 'dark' : 'light'}
              intensity={80}
              style={StyleSheet.absoluteFill}
            />
          ),
        } : {}),
      }}
    >
      <Tabs.Screen name="index" options={{
        tabBarAccessibilityLabel: t('nav.feed'),
        tabBarIcon: ({ focused }) => <TabIcon icon={Newspaper} label={t('nav.feed')} focused={focused} colors={colors} />,
      }} />
      <Tabs.Screen name="explore" options={{
        tabBarAccessibilityLabel: t('explore.title'),
        tabBarIcon: ({ focused }) => <TabIcon icon={Compass} label={t('explore.title')} focused={focused} colors={colors} />,
      }} />
      <Tabs.Screen name="create" options={{
        tabBarAccessibilityLabel: t('nav.create'),
        tabBarIcon: ({ focused }) => <TabIcon icon={Plus} label={t('nav.create')} focused={focused} isCreate colors={colors} />,
      }} />
      <Tabs.Screen name="messages" options={{
        tabBarAccessibilityLabel: t('nav.messages'),
        tabBarIcon: ({ focused }) => <TabIcon icon={MessageCircle} label={t('nav.messages')} focused={focused} colors={colors} badge={totalUnread} />,
      }} />
      <Tabs.Screen name="profile" options={{
        tabBarAccessibilityLabel: t('nav.profile'),
        tabBarIcon: ({ focused }) => <TabIcon icon={User} label={t('nav.profile')} focused={focused} colors={colors} />,
      }} />
    </Tabs>
    {/* Create menu modal removed — tab navigates directly to create screen */}
    </View>
  )
}

const s = StyleSheet.create({
  tabItem: { alignItems: 'center', gap: 2, position: 'relative', width: 64 },
  iconWrap: {
    width: 40, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  createTabItem: {
    alignItems: 'center', justifyContent: 'center',
    position: 'relative', width: 64, marginTop: -18,
  },
  createFab: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  tabLabel: { fontSize: 11, fontWeight: '500', fontFamily: fonts.body },
  badge: {
    position: 'absolute' as const,
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 4,
    borderWidth: 2,
  },
  badgeText: {
    color: '#FFFFFF', // always white on destructive background
    fontSize: 11,
    fontWeight: '700' as const,
    lineHeight: 12,
    fontFamily: fonts.bodySemi,
  },
  activeBar: {
    position: 'absolute', bottom: -6,
    width: 20, height: 3, borderRadius: 1.5,
  },
})
