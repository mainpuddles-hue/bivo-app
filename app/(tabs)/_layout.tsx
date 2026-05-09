import { useState, useEffect, useRef, useCallback } from 'react'
import { enableFreeze } from 'react-native-screens'
import { Tabs, useRouter } from 'expo-router'
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Haptics from 'expo-haptics'
import { BlurView } from 'expo-blur'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS } from 'react-native-reanimated'

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

// --- Floating Glass Nav ---
// Apple-style "liquid glass" pill: blurred backdrop + subtle tint + bright rim.
// Horizontal pan gesture switches tabs without requiring a tap on the icon.

const SWIPE_THRESHOLD = 40

function FloatingPillNav({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors, isDark } = useTheme()

  // Wrap navigation in a stable callback so the gesture worklet can call it
  // without re-creating the gesture on every render.
  const switchTab = useCallback((delta: number) => {
    const nextIndex = Math.max(0, Math.min(state.routes.length - 1, state.index + delta))
    if (nextIndex === state.index) return
    try { Haptics.selectionAsync() } catch {} // best-effort
    const route = state.routes[nextIndex]
    navigation.navigate(route.name, route.params)
  }, [state.index, state.routes, navigation])

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12]) // require clear horizontal intent before activating
    .failOffsetY([-10, 10])    // let vertical scrolls pass through
    .onEnd((e) => {
      'worklet'
      if (e.translationX < -SWIPE_THRESHOLD) runOnJS(switchTab)(1)
      else if (e.translationX > SWIPE_THRESHOLD) runOnJS(switchTab)(-1)
    })

  // Glass aesthetic tokens — kept inline because they are tightly coupled to
  // the BlurView output (semi-transparent tint + bright rim sit on top of blur).
  const tintColor = isDark ? 'rgba(20, 20, 20, 0.35)' : 'rgba(255, 255, 255, 0.45)'
  const rimColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.55)'
  const activeBg = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.85)'
  const activeIconColor = isDark ? colors.foreground : colors.primaryForeground
  const idleIconColor = colors.foreground

  return (
    <View
      style={[s.pillOuter, { bottom: Math.max(insets.bottom, 22) }]}
      pointerEvents="box-none"
    >
      {/* Outer wrapper carries the drop shadow; the rounded blur clip lives inside. */}
      <View
        style={[
          s.shadowWrap,
          Platform.select({
            ios: {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: isDark ? 0.45 : 0.18,
              shadowRadius: 24,
            },
            android: { elevation: 12 },
          }),
        ]}
      >
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              s.pillBar,
              { borderColor: rimColor },
            ]}
          >
            <BlurView
              tint={isDark ? 'dark' : 'light'}
              intensity={isDark ? 90 : 75}
              style={StyleSheet.absoluteFillObject}
            />
            {/* Soft tint overlay — gives the milky glass cast that blur alone misses */}
            <View
              style={[StyleSheet.absoluteFillObject, { backgroundColor: tintColor }]}
              pointerEvents="none"
            />
            {state.routes.map((route, index) => {
              const { options } = descriptors[route.key]
              const focused = state.index === index
              const Icon = TAB_ICONS[index]
              const badge = options.tabBarBadge as number | undefined
              const iconColor = focused ? activeIconColor : idleIconColor

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
                      backgroundColor: focused ? activeBg : 'transparent',
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
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  )
}

// --- Main Layout ---

export default function TabLayout() {
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
  shadowWrap: {
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  pillBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    padding: 8,
    gap: 4,
    overflow: 'hidden', // clips the BlurView and tint to the pill shape
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
