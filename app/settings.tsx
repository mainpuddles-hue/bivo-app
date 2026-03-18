import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, Switch, TextInput, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, Globe, Bell, Shield, Crown, Trash2, LogOut, Sun, Moon, Smartphone, Eye, Download, Info, ChevronRight, Save } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '@/hooks/useTheme'
import { useI18n, type Locale } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { downloadAsFile } from '@/lib/share'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import type { Profile, ProfileVisibility } from '@/lib/types'

const THEME_OPTIONS = [
  { key: 'light', label: 'settings.themeLight', icon: Sun },
  { key: 'dark', label: 'settings.themeDark', icon: Moon },
  { key: 'system', label: 'settings.themeAuto', icon: Smartphone },
] as const

const VISIBILITY_OPTIONS: { key: ProfileVisibility; label: string }[] = [
  { key: 'everyone', label: 'settings.visibilityEveryone' },
  { key: 'neighbors', label: 'settings.visibilityNeighbors' },
  { key: 'hidden', label: 'settings.visibilityHidden' },
]

export default function SettingsScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale, setLocale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [profile, setProfile] = useState<Profile | null>(null)
  const push = usePushNotifications(profile?.id ?? null)
  const [notifMessages, setNotifMessages] = useState(true)
  const [notifReviews, setNotifReviews] = useState(true)
  const [notifRentals, setNotifRentals] = useState(true)
  const [notifSystem, setNotifSystem] = useState(true)
  const [notifMarketing, setNotifMarketing] = useState(false)
  const [visibility, setVisibility] = useState<ProfileVisibility>('everyone')
  const [theme, setTheme] = useState('system')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Password change
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [changingPw, setChangingPw] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        const p = data as unknown as Profile
        setProfile(p)
        setVisibility(p.profile_visibility)
      }
      const storedTheme = await AsyncStorage.getItem('tackbird-theme')
      if (storedTheme) setTheme(storedTheme)
    }
    load()
  }, [supabase])

  const handleSave = useCallback(async () => {
    if (!profile) return
    setSaving(true)
    try {
      await (supabase.from('profiles') as any).update({
        profile_visibility: visibility,
        notifications_enabled: notifMessages,
      }).eq('id', profile.id)
      await AsyncStorage.setItem('tackbird-theme', theme)
      setDirty(false)
      Alert.alert(t('common.success'), t('settings.settingsSaved'))
    } catch {
      Alert.alert(t('common.error'), t('settings.settingsSaveFailed'))
    } finally { setSaving(false) }
  }, [profile, visibility, notifMessages, theme, supabase, t])

  const handleChangePassword = useCallback(async () => {
    if (!newPw || newPw.length < 8) {
      Alert.alert(t('common.error'), t('settings.passwordTooShort'))
      return
    }
    if (!/[A-Z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      Alert.alert(t('common.error'), t('settings.passwordTooWeak'))
      return
    }
    setChangingPw(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw error
      Alert.alert(t('common.success'), t('settings.passwordChanged'))
      setCurrentPw('')
      setNewPw('')
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message ?? t('settings.passwordChangeFailed'))
    } finally { setChangingPw(false) }
  }, [newPw, supabase, t])

  const handleExport = useCallback(async () => {
    if (!profile) return
    setExporting(true)
    try {
      const [postsRes, msgsRes, reviewsRes] = await Promise.all([
        supabase.from('posts').select('*').eq('user_id', profile.id),
        supabase.from('messages').select('*').eq('sender_id', profile.id),
        supabase.from('reviews').select('*').eq('reviewer_id', profile.id),
      ])
      const exportData = {
        profile,
        posts: postsRes.data ?? [],
        messages: msgsRes.data ?? [],
        reviews: reviewsRes.data ?? [],
        exported_at: new Date().toISOString(),
      }
      const jsonStr = JSON.stringify(exportData, null, 2)
      await downloadAsFile(jsonStr, `tackbird-export-${new Date().toISOString().slice(0, 10)}.json`)
    } catch {
      Alert.alert(t('common.error'))
    } finally { setExporting(false) }
  }, [profile, supabase, t])

  const handleDeleteAccount = () => {
    Alert.alert(t('settings.deleteAccount'), t('settings.deleteFirstConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deletePermanently'), style: 'destructive',
        onPress: () => Alert.alert(t('settings.deleteAccount'), t('settings.deleteSecondConfirm'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('settings.deletePermanently'), style: 'destructive',
            onPress: async () => {
              await supabase.auth.signOut()
              router.replace('/(auth)/login')
            },
          },
        ]),
      },
    ])
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  const markDirty = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true) }

  const langLabel = (l: Locale) => ({ fi: 'Suomi', en: 'English', sv: 'Svenska' }[l])

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('settings.title')}</Text>
        <View style={{ flex: 1 }} />
        {dirty && (
          <Pressable onPress={handleSave} disabled={saving} style={[s.saveBtn, { backgroundColor: colors.primary }]}>
            {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Save size={16} color={colors.primaryForeground} />}
            <Text style={[s.saveBtnText, { color: colors.primaryForeground }]}>{t('common.save')}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Language */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.language')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          {(['fi', 'en', 'sv'] as Locale[]).map((l) => (
            <Pressable key={l} onPress={() => setLocale(l)} style={s.row}>
              <Globe size={18} color={colors.mutedForeground} />
              <Text style={[s.rowText, { color: colors.foreground }]}>{langLabel(l)}</Text>
              <View style={[locale === l ? [s.radio, { backgroundColor: colors.primary }] : [s.radioEmpty, { borderColor: colors.border }]]} />
            </Pressable>
          ))}
        </View>

        {/* Theme */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.theme')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          {THEME_OPTIONS.map(({ key, label, icon: Icon }) => (
            <Pressable key={key} onPress={() => { setTheme(key); setDirty(true) }} style={s.row}>
              <Icon size={18} color={colors.mutedForeground} />
              <Text style={[s.rowText, { color: colors.foreground }]}>{t(label)}</Text>
              <View style={[theme === key ? [s.radio, { backgroundColor: colors.primary }] : [s.radioEmpty, { borderColor: colors.border }]]} />
            </Pressable>
          ))}
        </View>

        {/* Profile Visibility */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.profileVisibility')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          {VISIBILITY_OPTIONS.map(({ key, label }) => (
            <Pressable key={key} onPress={() => markDirty(setVisibility)(key)} style={s.row}>
              <Eye size={18} color={colors.mutedForeground} />
              <Text style={[s.rowText, { color: colors.foreground }]}>{t(label)}</Text>
              <View style={[visibility === key ? [s.radio, { backgroundColor: colors.primary }] : [s.radioEmpty, { borderColor: colors.border }]]} />
            </Pressable>
          ))}
        </View>

        {/* Notifications */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.notifications')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          {[
            { label: 'nav.messages', value: notifMessages, setter: markDirty(setNotifMessages) },
            { label: 'profile.reviews', value: notifReviews, setter: markDirty(setNotifReviews) },
            { label: 'settings.proSubscription', value: notifRentals, setter: markDirty(setNotifRentals) },
            { label: 'settings.notifications', value: notifSystem, setter: markDirty(setNotifSystem) },
          ].map(({ label, value, setter }) => (
            <View key={label} style={s.toggleRow}>
              <Bell size={18} color={colors.mutedForeground} />
              <Text style={[s.rowText, { color: colors.foreground }]}>{t(label)}</Text>
              <Switch
                value={value}
                onValueChange={setter}
                trackColor={{ false: colors.muted, true: `${colors.primary}66` }}
                thumbColor={value ? colors.primary : colors.mutedForeground}
              />
            </View>
          ))}
          {push.isSupported && (
            <View style={s.toggleRow}>
              <Bell size={18} color={push.isSubscribed ? colors.primary : colors.mutedForeground} />
              <Text style={[s.rowText, { color: colors.foreground }]}>Push-ilmoitukset</Text>
              <Switch
                value={push.isSubscribed}
                onValueChange={(val) => val ? push.subscribe() : push.unsubscribe()}
                disabled={push.isLoading}
                trackColor={{ false: colors.muted, true: `${colors.primary}66` }}
                thumbColor={push.isSubscribed ? colors.primary : colors.mutedForeground}
              />
            </View>
          )}
        </View>

        {/* Pro */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.proSubscription')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <View style={s.row}>
            <Crown size={18} color={colors.pro} />
            <Text style={[s.rowText, { color: colors.foreground }]}>TackBird Pro</Text>
            {profile?.is_pro ? (
              <Text style={[s.proBadge, { color: colors.pro }]}>{t('profile.proActive')}</Text>
            ) : (
              <Pressable onPress={() => Alert.alert('Pro', t('settings.proUpgrade'))} style={[s.upgradeBtn, { backgroundColor: colors.pro }]}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>{t('profile.upgradeToPro')}</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Security */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.security')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <View style={{ padding: 16, gap: 10 }}>
            <Text style={[s.rowText, { color: colors.foreground, fontWeight: '600' }]}>{t('settings.changePassword')}</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.muted, color: colors.foreground }]}
              value={newPw}
              onChangeText={setNewPw}
              placeholder={t('settings.newPasswordPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
            />
            <Pressable
              onPress={handleChangePassword}
              disabled={changingPw || !newPw}
              style={[s.changePwBtn, { backgroundColor: colors.primary, opacity: changingPw || !newPw ? 0.5 : 1 }]}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primaryForeground }}>
                {changingPw ? t('settings.changingPassword') : t('settings.changePassword')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Data export */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.export')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Pressable onPress={handleExport} disabled={exporting} style={s.row}>
            <Download size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{exporting ? t('settings.exportLoading') : t('settings.export')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* About */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.about')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <View style={s.row}>
            <Info size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>TackBird Mobile v1.0.0</Text>
          </View>
        </View>

        {/* Danger zone */}
        <Text style={[s.section, { color: colors.destructive }]}>{t('settings.deleteAccount')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Pressable onPress={handleDeleteAccount} style={s.row}>
            <Trash2 size={18} color={colors.destructive} />
            <Text style={[s.rowText, { color: colors.destructive }]}>{t('settings.deletePermanently')}</Text>
          </Pressable>
        </View>

        {/* Logout */}
        <Pressable onPress={handleLogout} style={[s.logoutBtn, { backgroundColor: colors.card }]}>
          <LogOut size={18} color={colors.destructive} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.destructive }}>{t('settings.logout')}</Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10,
  },
  saveBtnText: { fontSize: 13, fontWeight: '600' },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 12, paddingHorizontal: 4 },
  card: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  rowText: { fontSize: 15, flex: 1 },
  radio: { width: 18, height: 18, borderRadius: 9 },
  radioEmpty: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  proBadge: { fontSize: 13, fontWeight: '600' },
  upgradeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  changePwBtn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 16, borderRadius: 12, marginTop: 16,
  },
})
