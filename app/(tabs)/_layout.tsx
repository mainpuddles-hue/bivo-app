import { useState, useEffect } from 'react'
import { enableFreeze } from 'react-native-screens'
import { Tabs, useRouter, usePathname } from 'expo-router'
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native'

// Freeze inactive screens to save memory and CPU
enableFreeze(true)
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Newspaper, Plus, MessageCircle, User, Compass, FileText, CalendarDays, ChevronRight } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
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
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const tabBarBg = isDark ? 'rgba(30,30,30,0.97)' : 'rgba(255,255,255,0.97)'
  const supabase = useSupabase()
  const [userId, setUserId] = useState<string | null>(null)
  const unreadCount = useUnreadCount(userId)
  const [showCreateMenu, setShowCreateMenu] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (mounted && user) setUserId(user.id)
    }).catch(() => {})
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
      }} listeners={{
        tabPress: (e) => {
          e.preventDefault()
          setShowCreateMenu(true)
        },
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
    <Modal
      visible={showCreateMenu}
      transparent
      animationType="slide"
      onRequestClose={() => setShowCreateMenu(false)}
    >
      <Pressable style={s.backdrop} onPress={() => setShowCreateMenu(false)}>
        <View style={[s.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <View style={[s.handle, { backgroundColor: colors.border }]} />

          <Pressable
            style={({ pressed }) => [s.sheetRow, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('create.listing')}
            accessibilityRole="button"
            onPress={() => { setShowCreateMenu(false); router.push('/(tabs)/create') }}
          >
            <View style={[s.sheetIcon, { backgroundColor: `${colors.primary}15` }]}>
              <FileText size={20} color={colors.primary} />
            </View>
            <View style={s.sheetText}>
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>{t('create.listing')}</Text>
              <Text style={[s.sheetHint, { color: colors.mutedForeground }]}>{t('create.listingHint')}</Text>
            </View>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.sheetRow, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('create.event')}
            accessibilityRole="button"
            onPress={() => { setShowCreateMenu(false); router.push('/create-event') }}
          >
            <View style={[s.sheetIcon, { backgroundColor: `${colors.success}15` }]}>
              <CalendarDays size={20} color={colors.success} />
            </View>
            <View style={s.sheetText}>
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>{t('create.event')}</Text>
              <Text style={[s.sheetHint, { color: colors.mutedForeground }]}>{t('create.eventHint')}</Text>
            </View>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.sheetRow, pressed && { opacity: 0.7 }]}
            accessibilityLabel={t('create.discussion')}
            accessibilityRole="button"
            onPress={() => { setShowCreateMenu(false); router.push('/forum') }}
          >
            <View style={[s.sheetIcon, { backgroundColor: `${colors.info}15` }]}>
              <MessageCircle size={20} color={colors.info} />
            </View>
            <View style={s.sheetText}>
              <Text style={[s.sheetTitle, { color: colors.foreground }]}>{t('create.discussion')}</Text>
              <Text style={[s.sheetHint, { color: colors.mutedForeground }]}>{t('create.discussionHint')}</Text>
            </View>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </Pressable>
    </Modal>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, minHeight: 56 },
  sheetIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetText: { flex: 1 },
  sheetTitle: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi },
  sheetHint: { fontSize: 13, fontFamily: fonts.body, marginTop: 2 },
})
