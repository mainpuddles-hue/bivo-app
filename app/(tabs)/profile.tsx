import { useState, useEffect, useMemo } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { Settings, LogOut, MapPin, Star, Users, FileText } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

export default function ProfileScreen() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [postCount, setPostCount] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) setProfile(data as unknown as Profile)
      const { count } = await supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true)
      setPostCount(count ?? 0)
    }
    load()
  }, [supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  if (!profile) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        </View>
        <Pressable onPress={() => router.push('/(auth)/login')} style={[styles.loginBtn, { backgroundColor: colors.primary }]}>
          <Text style={[styles.loginBtnText, { color: colors.primaryForeground }]}>{t('auth.login')}</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
          <Settings size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={[styles.bigAvatar, profile.is_pro && { borderWidth: 3, borderColor: colors.pro }]} />
          ) : (
            <View style={[styles.bigAvatar, styles.bigAvatarFallback, { backgroundColor: colors.muted }]}>
              <Text style={[styles.bigAvatarInitial, { color: colors.mutedForeground }]}>
                {profile.name?.charAt(0)?.toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.profileName, { color: colors.foreground }]}>{profile.name}</Text>
          {profile.naapurusto && (
            <View style={styles.neighborhoodRow}>
              <MapPin size={14} color={colors.primary} />
              <Text style={[styles.neighborhoodText, { color: colors.primary }]}>{profile.naapurusto}</Text>
            </View>
          )}
          {profile.bio ? (
            <Text style={[styles.bio, { color: colors.mutedForeground }]}>{profile.bio}</Text>
          ) : null}
          {profile.is_pro && (
            <View style={[styles.proBadge, { backgroundColor: `${colors.pro}20` }]}>
              <Star size={14} color={colors.pro} fill={colors.pro} />
              <Text style={[styles.proText, { color: colors.pro }]}>Pro</Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.foreground }]}>{postCount}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t('profile.posts')}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: colors.foreground }]}>{profile.response_rate ?? 0}%</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{t('profile.responseRate')}</Text>
          </View>
        </View>

        {/* Actions */}
        <Pressable onPress={() => router.push('/settings')} style={[styles.menuItem, { backgroundColor: colors.card }]}>
          <Settings size={20} color={colors.mutedForeground} />
          <Text style={[styles.menuText, { color: colors.foreground }]}>{t('nav.settings')}</Text>
        </Pressable>
        <Pressable onPress={handleLogout} style={[styles.menuItem, { backgroundColor: colors.card }]}>
          <LogOut size={20} color={colors.destructive} />
          <Text style={[styles.menuText, { color: colors.destructive }]}>{t('profile.logout')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  bigAvatar: { width: 80, height: 80, borderRadius: 40 },
  bigAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  bigAvatarInitial: { fontSize: 32, fontWeight: '700' },
  profileName: { fontSize: 20, fontWeight: '700' },
  neighborhoodRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  neighborhoodText: { fontSize: 14, fontWeight: '500' },
  bio: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  proText: { fontSize: 13, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row', borderRadius: 12, padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 12 },
  statDivider: { width: 1 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 12,
  },
  menuText: { fontSize: 15, fontWeight: '500' },
  loginBtn: {
    marginHorizontal: 16, marginTop: 60,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  loginBtnText: { fontSize: 16, fontWeight: '600' },
})
