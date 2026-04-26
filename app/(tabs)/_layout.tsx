import { useState, useEffect, useRef } from 'react'
import { enableFreeze } from 'react-native-screens'
import { Tabs, useRouter } from 'expo-router'
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Haptics from 'expo-haptics'

// Freeze inactive screens to save memory and CPU
enableFreeze(true)
import { Newspaper, Plus, MessageCircle, User, Compass } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { useUnreadCount } from '@/hooks/useUnreadCount'
import { useEventChatUnread } from '@/hooks/useEventChatUnread'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'

// --- Tab configuration ---

const TAB_ICONS = [Newspaper, Compass, Plus, MessageCircle, User] as const
const TAB_LABEL_KEYS = ['nav.feed', 'explore.title', 'nav.create', 'nav.messages', 'nav.profile'] as const

// --- Floating Pill Nav ---
// Matches Helsinki Monochrome mockup: floating pill bar, icon-only, active = ink circle

function FloatingPillNav({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors } = useTheme()

  return (
    <View
      style={[
        s.pillOuter,
        {
          bottom: Math.max(insets.bottom, 22),
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          s.pillBar,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            ...Platform.select({
              ios: {
                shadowColor: colors.foreground,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.08,
                shadowRadius: 20,
              },
              android: {
                elevation: 8,
              },
            }),
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]
          const focused = state.index === index
          const Icon = TAB_ICONS[index]
          const badge = options.tabBarBadge as number | undefined
          const iconColor = focused ? colors.primaryForeground : colors.foreground

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
              style={({ pressed }) => [
                s.pillItem,
                {
                  backgroundColor: focused ? colors.foreground : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                },
              ]}
            >
              <Icon
                size={20}
                color={iconColor}
                strokeWidth={focused ? 2 : 1.6}
              />
              {badge != null && badge > 0 && (
                <View
                  style={[s.badge, { backgroundColor: colors.destructive }]}
                  accessibilityLabel={`${badge}`}
                  accessibilityRole="text"
                >
                  <Text style={[s.badgeText, { color: colors.primaryForeground }]}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              )}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

// --- Main Layout ---

export default function TabLayout() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const router = useRouter()
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
    Notifications.setBadgeCountAsync(totalUnread).catch((e) => { if (__DEV__) console.warn('Notification badge update failed:', e) })
  }, [totalUnread])

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (mounted && user) setUserId(user.id)
    }).catch((e) => { if (__DEV__) console.warn('Session sync failed:', e) })

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
      tabBar={(props) => <FloatingPillNav {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: 'transparent' },
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
  pillOuter: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 40,
  },
  pillBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    padding: 8,
    gap: 4,
  },
  pillItem: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
})
