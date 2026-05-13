import { useState, useEffect, useRef, useCallback } from 'react'
import { enableFreeze } from 'react-native-screens'
import { Tabs, useRouter } from 'expo-router'
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Haptics from 'expo-haptics'
import { BlurView } from 'expo-blur'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

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

// Spring tuning for press feedback. 280/22 lands on the iOS-native "snappy
// but not bouncy" feel — close enough to UIKit's UIView.spring(.snappy)
// without bringing in a native bridge. Scale 0.92 gives clear tactile
// feedback without making the icon look broken at rest.
const PRESS_SCALE = 0.92
const PRESS_SPRING = { damping: 18, stiffness: 300, mass: 0.6 }
const RELEASE_SPRING = { damping: 14, stiffness: 220, mass: 0.6 }
const FOCUS_TIMING = { duration: 220 }

// --- Floating Glass Nav ---
// Apple-style "liquid glass" pill: blurred backdrop + subtle tint + bright rim.
// Horizontal pan gesture switches tabs without requiring a tap on the icon.

interface TabItemProps {
  focused: boolean
  Icon: typeof Newspaper
  activeBg: string
  activeIconColor: string
  idleIconColor: string
  destructiveColor: string
  primaryForegroundColor: string
  badge: number | undefined
  accessibilityLabel: string | undefined
  onPress: () => void
  onLongPress: () => void
}

// One tab button. Owns its own press-spring (UI-thread worklet) and a
// smooth fade for the active background pill — without the worklet the
// whole tab cluster re-renders on every focus change, which is fine but
// loses the "soft slide" between tabs.
function TabItem({
  focused, Icon, activeBg, activeIconColor, idleIconColor,
  destructiveColor, primaryForegroundColor,
  badge, accessibilityLabel, onPress, onLongPress,
}: TabItemProps) {
  const pressScale = useSharedValue(1)
  const focusProgress = useSharedValue(focused ? 1 : 0)

  useEffect(() => {
    focusProgress.value = withTiming(focused ? 1 : 0, FOCUS_TIMING)
  }, [focused, focusProgress])

  const itemStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }))
  const focusBgStyle = useAnimatedStyle(() => ({
    opacity: focusProgress.value,
  }))

  const iconColor = focused ? activeIconColor : idleIconColor

  return (
    <AnimatedPressable
      onPressIn={() => { pressScale.value = withSpring(PRESS_SCALE, PRESS_SPRING) }}
      onPressOut={() => { pressScale.value = withSpring(1, RELEASE_SPRING) }}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel}
      style={[s.pillItem, itemStyle]}
    >
      {/* Animated active-state pill background — fades in/out as the focused
          tab changes, instead of an instant color switch. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: activeBg, borderRadius: 999 },
          focusBgStyle,
        ]}
      />
      <Icon
        size={20}
        color={iconColor}
        strokeWidth={focused ? 2 : 1.6}
      />
      {badge != null && badge > 0 && (
        <View
          style={[s.badge, { backgroundColor: destructiveColor }]}
          accessibilityLabel={`${badge}`}
          accessibilityRole="text"
        >
          <Text style={[s.badgeText, { color: primaryForegroundColor }]}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </AnimatedPressable>
  )
}

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

  // Glass aesthetic tokens — tuned to read like iOS 17/26 system glass:
  // moderate blur, soft tint that lets content bleed through, hairline rim.
  const tintColor = isDark ? 'rgba(18, 18, 20, 0.30)' : 'rgba(255, 255, 255, 0.32)'
  const rimColor = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.70)'
  const activeBg = isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.65)'
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
              intensity={isDark ? 80 : 60}
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
                <TabItem
                  key={route.key}
                  focused={focused}
                  Icon={Icon}
                  activeBg={activeBg}
                  activeIconColor={activeIconColor}
                  idleIconColor={idleIconColor}
                  destructiveColor={colors.destructive}
                  primaryForegroundColor={colors.primaryForeground}
                  badge={badge}
                  accessibilityLabel={options.tabBarAccessibilityLabel}
                  onPress={onPress}
                  onLongPress={onLongPress}
                />
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
    borderWidth: StyleSheet.hairlineWidth, // crisp iOS-native edge
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
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
})
