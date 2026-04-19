import { useState, useEffect, useRef } from 'react'
import { enableFreeze } from 'react-native-screens'
import { Tabs, useRouter, usePathname } from 'expo-router'
import { View, Text, StyleSheet, Platform, Pressable, Animated } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Haptics from 'expo-haptics'
import { useReduceMotion } from '@/hooks/useReduceMotion'

// Freeze inactive screens to save memory and CPU
enableFreeze(true)
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Newspaper, Plus, MessageCircle, User, Compass } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { useUnreadCount } from '@/hooks/useUnreadCount'
import { useEventChatUnread } from '@/hooks/useEventChatUnread'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'

// --- Floating Pill Tab Bar ---

const TAB_ICONS = [Newspaper, Compass, Plus, MessageCircle, User] as const

function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors, isDark } = useTheme()
  const reduceMotion = useReduceMotion()

  return (
    <View
      style={[
        s.floatingContainer,
        { bottom: insets.bottom + 22 },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          s.pill,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            // ink-tinted shadow
            shadowColor: '#1A1D1F',
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]
          const focused = state.index === index
          const Icon = TAB_ICONS[index]

          const onPress = () => {
            try { Haptics.selectionAsync() } catch {}
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params)
            }
          }

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            })
          }

          return (
            <FloatingTabItem
              key={route.key}
              icon={Icon}
              focused={focused}
              colors={colors}
              reduceMotion={reduceMotion}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              badge={(options.tabBarBadge as number | undefined)}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          )
        })}
      </View>
    </View>
  )
}

function FloatingTabItem({
  icon: Icon,
  focused,
  colors,
  reduceMotion,
  accessibilityLabel,
  badge,
  onPress,
  onLongPress,
}: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>
  focused: boolean
  colors: ReturnType<typeof useTheme>['colors']
  reduceMotion: boolean
  accessibilityLabel?: string
  badge?: number
  onPress: () => void
  onLongPress: () => void
}) {
  const scale = useRef(new Animated.Value(1)).current
  const bgOpacity = useRef(new Animated.Value(focused ? 1 : 0)).current
  const isFirstRun = useRef(true)

  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return }
    if (reduceMotion) {
      bgOpacity.setValue(focused ? 1 : 0)
      return
    }

    // Subtle pop on focus
    Animated.parallel([
      Animated.spring(scale, {
        toValue: focused ? 1 : 1,
        friction: 5,
        tension: 200,
        useNativeDriver: true,
      }),
      Animated.timing(bgOpacity, {
        toValue: focused ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start()
  }, [focused, reduceMotion, scale, bgOpacity])

  const iconColor = focused ? colors.primaryForeground : colors.primary

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel}
      style={s.tabPressable}
    >
      <Animated.View
        style={[
          s.tabItemPill,
          { transform: [{ scale }] },
        ]}
      >
        {/* Active background pill */}
        <Animated.View
          style={[
            s.activeBg,
            {
              backgroundColor: colors.primary,
              opacity: bgOpacity,
            },
          ]}
        />
        <Icon
          size={20}
          color={iconColor}
          strokeWidth={focused ? 2.2 : 1.8}
        />
        {badge != null && badge > 0 && (
          <View
            style={[s.badge, { backgroundColor: colors.destructive, borderColor: colors.card }]}
            accessibilityLabel={`${badge}`}
            accessibilityRole="text"
          >
            <Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  )
}

// --- Main Layout ---

export default function TabLayout() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const supabase = useSupabase()
  const [userId, setUserId] = useState<string | null>(null)
  const unreadCount = useUnreadCount(userId)
  const eventChatUnread = useEventChatUnread(userId)
  const totalUnread = unreadCount + eventChatUnread
  // Auto-register push token on app start (EAS builds only)
  usePushNotifications(userId)
  // Sync app icon badge with combined unread count
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
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="index" options={{
        tabBarAccessibilityLabel: t('nav.feed'),
      }} />
      <Tabs.Screen name="explore" options={{
        tabBarAccessibilityLabel: t('explore.title'),
      }} />
      <Tabs.Screen name="create" options={{
        tabBarAccessibilityLabel: t('nav.create'),
      }} />
      <Tabs.Screen name="messages" options={{
        tabBarAccessibilityLabel: t('nav.messages'),
        tabBarBadge: totalUnread > 0 ? totalUnread : undefined,
      }} />
      <Tabs.Screen name="profile" options={{
        tabBarAccessibilityLabel: t('nav.profile'),
      }} />
    </Tabs>
    </View>
  )
}

// --- Styles ---

const s = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    width: '100%',
    padding: 8,
    borderRadius: 999,
    borderWidth: 1,
    // Shadow: ink-tinted subtle
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  tabPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemPill: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  activeBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
})
