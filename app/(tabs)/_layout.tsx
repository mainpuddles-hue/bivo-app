import { useState, useEffect, useRef } from 'react'
import { enableFreeze } from 'react-native-screens'
import { Tabs, useRouter, usePathname } from 'expo-router'
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Haptics from 'expo-haptics'

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

// --- Tab configuration ---

const TAB_ICONS = [Newspaper, Compass, Plus, MessageCircle, User] as const
const TAB_LABEL_KEYS = ['nav.feed', 'explore.title', 'nav.create', 'nav.messages', 'nav.profile'] as const

// --- Monochrome Bottom Tab Bar ---

function MonochromeTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors } = useTheme()
  const { t } = useI18n()

  return (
    <View
      style={[
        s.tabBarContainer,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]
        const focused = state.index === index
        const Icon = TAB_ICONS[index]
        const label = t(TAB_LABEL_KEYS[index])
        const badge = options.tabBarBadge as number | undefined
        const iconColor = focused ? colors.foreground : colors.mutedForeground

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
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            style={s.tabItem}
          >
            <View style={s.iconContainer}>
              <Icon
                size={22}
                color={iconColor}
                strokeWidth={focused ? 2.2 : 1.6}
              />
              {badge != null && badge > 0 && (
                <View
                  style={[s.badge, { backgroundColor: colors.destructive }]}
                  accessibilityLabel={`${badge}`}
                  accessibilityRole="text"
                >
                  <Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                s.tabLabel,
                {
                  color: iconColor,
                  fontWeight: focused ? '600' : '400',
                },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// --- Main Layout ---

export default function TabLayout() {
  const { colors } = useTheme()
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
      tabBar={(props) => <MonochromeTabBar {...props} />}
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
  tabBarContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconContainer: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
})
