import { useState, useEffect } from 'react'
import { Tabs } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Newspaper, Plus, MessageCircle, User, Compass } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { Header } from '@/components/Header'
import { useSupabase } from '@/hooks/useSupabase'
import { useUnreadCount } from '@/hooks/useUnreadCount'

function TabIcon({ icon: Icon, label, focused, isCreate, colors, badge }: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>
  label: string
  focused: boolean
  isCreate?: boolean
  colors: ReturnType<typeof useTheme>['colors']
  badge?: number
}) {
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
      <View style={[s.iconWrap, focused && { backgroundColor: `${colors.primary}18` }]}>
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
      </View>
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
  const insets = useSafeAreaInsets()
  const tabBarBg = isDark ? 'rgba(30,30,30,0.97)' : 'rgba(255,255,255,0.97)'
  const supabase = useSupabase()
  const [userId, setUserId] = useState<string | null>(null)
  const unreadCount = useUnreadCount(userId)

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (mounted && user) setUserId(user.id)
    })
    return () => { mounted = false }
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
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
          elevation: 8,
        },
        tabBarShowLabel: false,
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
        tabBarIcon: ({ focused }) => <TabIcon icon={MessageCircle} label={t('nav.messages')} focused={focused} colors={colors} badge={unreadCount} />,
      }} />
      <Tabs.Screen name="profile" options={{
        tabBarAccessibilityLabel: t('nav.profile'),
        tabBarIcon: ({ focused }) => <TabIcon icon={User} label={t('nav.profile')} focused={focused} colors={colors} />,
      }} />
    </Tabs>
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
  tabLabel: { fontSize: 10, fontWeight: '500' },
  badge: {
    position: 'absolute' as const,
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#D94F4F',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 4,
    borderWidth: 2,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700' as const,
    lineHeight: 12,
  },
  activeBar: {
    position: 'absolute', bottom: -6,
    width: 20, height: 3, borderRadius: 1.5,
  },
})
