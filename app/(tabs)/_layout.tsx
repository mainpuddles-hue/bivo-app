import { Tabs } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Newspaper, CalendarDays, Plus, MessageCircle, User, UsersRound } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { Header } from '@/components/Header'

function TabIcon({ icon: Icon, label, focused, isCreate, colors }: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>
  label: string
  focused: boolean
  isCreate?: boolean
  colors: ReturnType<typeof useTheme>['colors']
}) {
  if (isCreate) {
    return (
      <View style={s.tabItem}>
        <View style={[s.createFab, { backgroundColor: colors.accent }]}>
          <Icon size={16} color={colors.accentForeground} strokeWidth={2.5} />
        </View>
        <Text numberOfLines={1} style={[s.tabLabel, { color: colors.accent, fontWeight: '600' }]}>{label}</Text>
      </View>
    )
  }

  return (
    <View style={s.tabItem}>
      <View style={[s.iconWrap, focused && { backgroundColor: `${colors.primary}18` }]}>
        <Icon
          size={20}
          color={focused ? colors.primary : colors.mutedForeground}
          strokeWidth={focused ? 2.25 : 1.6}
        />
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
          paddingTop: 6,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="index" options={{
        tabBarIcon: ({ focused }) => <TabIcon icon={Newspaper} label={t('nav.feed')} focused={focused} colors={colors} />,
      }} />
      <Tabs.Screen name="community" options={{
        tabBarIcon: ({ focused }) => <TabIcon icon={UsersRound} label={t('nav.community')} focused={focused} colors={colors} />,
      }} />
      <Tabs.Screen name="events" options={{
        href: null, // Hide from tab bar
      }} />
      <Tabs.Screen name="create" options={{
        tabBarIcon: ({ focused }) => <TabIcon icon={Plus} label={t('nav.create')} focused={focused} isCreate colors={colors} />,
      }} />
      <Tabs.Screen name="messages" options={{
        tabBarIcon: ({ focused }) => <TabIcon icon={MessageCircle} label={t('nav.messages')} focused={focused} colors={colors} />,
      }} />
      <Tabs.Screen name="profile" options={{
        tabBarIcon: ({ focused }) => <TabIcon icon={User} label={t('nav.profile')} focused={focused} colors={colors} />,
      }} />
    </Tabs>
    </View>
  )
}

const s = StyleSheet.create({
  tabItem: { alignItems: 'center', gap: 3, position: 'relative', width: 64 },
  iconWrap: {
    width: 36, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  createFab: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 4,
  },
  tabLabel: { fontSize: 10, fontWeight: '500' },
  activeBar: {
    position: 'absolute', bottom: -6,
    width: 20, height: 3, borderRadius: 1.5,
  },
})
