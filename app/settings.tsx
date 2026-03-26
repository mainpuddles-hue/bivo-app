import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, Switch, TextInput, StyleSheet, Alert, ActivityIndicator, Platform, Modal, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowLeft, Globe, Bell, Crown, Trash2, LogOut, Sun, Moon, Smartphone, Eye, Download, Info, ChevronRight, Save, Bookmark, ShieldBan, Shield, FileText, Lock, CreditCard, HelpCircle, Mail, CheckCircle, AlertCircle, MapPin, CalendarDays, MessageCircle, Heart, MessageSquare, UserPlus, Zap, User, Pencil, Bug } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useTheme } from '@/hooks/useTheme'
import { useI18n, type Locale } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { downloadAsFile } from '@/lib/share'
import { usePushNotifications } from '@/hooks/usePushNotifications'
// useInAppPurchase replaced by Stripe-based pro subscription
import { useNotificationPreferences, type NotificationType } from '@/hooks/useNotificationPreferences'
import { isValidUUID } from '@/lib/validation'
import { fonts } from '@/lib/fonts'
import type { Profile, ProfileVisibility, LocationAccuracy } from '@/lib/types'

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

const LOCATION_ACCURACY_OPTIONS: { key: LocationAccuracy; label: string; desc: string }[] = [
  { key: 'exact', label: 'settings.locationExact', desc: 'settings.locationExactDesc' },
  { key: 'area', label: 'settings.locationArea', desc: 'settings.locationAreaDesc' },
  { key: 'city', label: 'settings.locationCity', desc: 'settings.locationCityDesc' },
]

export default function SettingsScreen() {
  const { colors, isDark, theme, setTheme: setAppTheme } = useTheme()
  const { t, locale, setLocale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  const [profile, setProfile] = useState<Profile | null>(null)
  const push = usePushNotifications(profile?.id ?? null)
  const notifPrefs = useNotificationPreferences()
  const [visibility, setVisibility] = useState<ProfileVisibility>('everyone')
  const [locationAccuracy, setLocationAccuracy] = useState<LocationAccuracy>('exact')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState('')

  // Password change
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [changingPw, setChangingPw] = useState(false)

  // Delete account
  const [deleteModalVisible, setDeleteModalVisible] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  // Email state
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [emailVerified, setEmailVerified] = useState(false)

  // Name editing
  const [editingName, setEditingName] = useState(false)
  const [nameText, setNameText] = useState('')
  const [savingName, setSavingName] = useState(false)

  // Account info
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email ?? null)
      setEmailVerified(!!user.email_confirmed_at)
      setAccountCreatedAt(user.created_at ?? null)
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (data) {
        const p = data as unknown as Profile
        setProfile(p)
        setNameText(p.name ?? '')
        setVisibility(p.profile_visibility)
        setLocationAccuracy(p.location_accuracy ?? 'exact')
      }
      // Theme is handled by ThemeProvider
    }
    load()
  }, [supabase])

  const handleSave = useCallback(async () => {
    if (!profile) return
    setSaving(true)
    try {
      await (supabase.from('profiles') as any).update({
        profile_visibility: visibility,
        location_accuracy: locationAccuracy,
        notifications_enabled: notifPrefs.preferences.messages,
      }).eq('id', profile.id)
      setDirty(false)
      Alert.alert(t('common.success'), t('settings.settingsSaved'))
    } catch {
      Alert.alert(t('common.error'), t('settings.settingsSaveFailed'))
    } finally { setSaving(false) }
  }, [profile, visibility, locationAccuracy, notifPrefs.preferences.messages, theme, supabase, t])

  const handleSaveName = useCallback(async () => {
    if (!profile || !nameText.trim()) return
    setSavingName(true)
    try {
      await (supabase.from('profiles') as any).update({ name: nameText.trim() }).eq('id', profile.id)
      setProfile(prev => prev ? { ...prev, name: nameText.trim() } : null)
      setEditingName(false)
      Alert.alert(t('common.success'), t('settings.settingsSaved'))
    } catch {
      Alert.alert(t('common.error'), t('settings.settingsSaveFailed'))
    } finally { setSavingName(false) }
  }, [profile, nameText, supabase, t])

  const handleChangePassword = useCallback(async () => {
    if (!currentPw) {
      Alert.alert(t('common.error'), t('settings.currentPasswordRequired'))
      return
    }
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
      // Verify current password by attempting to sign in
      if (userEmail) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: userEmail,
          password: currentPw,
        })
        if (signInError) {
          Alert.alert(t('common.error'), t('settings.currentPasswordWrong'))
          setChangingPw(false)
          return
        }
      }
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw error
      Alert.alert(t('common.success'), t('settings.passwordChanged'))
      setCurrentPw('')
      setNewPw('')
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message ?? t('settings.passwordChangeFailed'))
    } finally { setChangingPw(false) }
  }, [currentPw, newPw, userEmail, supabase, t])

  const handleExport = useCallback(async () => {
    if (!profile) return
    setExporting(true)
    setExportProgress('1/6')
    try {
      // Batch 1: posts, messages, reviews
      const [postsRes, msgsRes, reviewsRes] = await Promise.allSettled([
        supabase.from('posts').select('*').eq('user_id', profile.id),
        supabase.from('messages').select('*').eq('sender_id', profile.id),
        supabase.from('reviews').select('*').eq('reviewer_id', profile.id),
      ])

      setExportProgress('2/6')
      // Batch 2: saved posts, saved events, post likes
      const [savedPostsRes, savedEventsRes, postLikesRes] = await Promise.allSettled([
        supabase.from('saved_posts').select('*').eq('user_id', profile.id),
        supabase.from('saved_events').select('*').eq('user_id', profile.id),
        supabase.from('post_likes').select('*').eq('user_id', profile.id),
      ])

      setExportProgress('3/6')
      // Batch 3: comments, follows (both directions)
      const [commentsRes, followersRes, followingRes] = await Promise.allSettled([
        supabase.from('post_comments').select('*').eq('user_id', profile.id),
        supabase.from('user_follows').select('*').eq('followed_id', profile.id),
        supabase.from('user_follows').select('*').eq('follower_id', profile.id),
      ])

      setExportProgress('4/6')
      // Batch 4: notification preferences, conversations, badges
      const [notifPrefsRes, conversationsRes, badgesRes] = await Promise.allSettled([
        supabase.from('notification_preferences').select('*').eq('user_id', profile.id),
        isValidUUID(profile.id) ? supabase.from('conversations').select('id, user1_id, user2_id, post_id, created_at, updated_at').or(`user1_id.eq.${profile.id},user2_id.eq.${profile.id}`) : Promise.resolve({ data: [] }),
        supabase.from('user_badges').select('*').eq('user_id', profile.id),
      ])

      setExportProgress('5/6')
      // Batch 5: payments, bookings, thanks, points
      if (!isValidUUID(profile.id)) throw new Error('Invalid profile ID')
      const [paymentsRes, rentalBookingsRes, serviceBookingsRes, thanksRes, pointsRes] = await Promise.allSettled([
        supabase.from('payments').select('*').eq('user_id', profile.id),
        supabase.from('rental_bookings').select('*').or(`borrower_id.eq.${profile.id},lender_id.eq.${profile.id}`),
        supabase.from('service_bookings').select('*').or(`buyer_id.eq.${profile.id},provider_id.eq.${profile.id}`),
        supabase.from('thanks').select('*').or(`from_user_id.eq.${profile.id},to_user_id.eq.${profile.id}`),
        supabase.from('user_points').select('*').eq('user_id', profile.id),
      ])

      setExportProgress('6/6')
      const r = (res: PromiseSettledResult<any>) => res.status === 'fulfilled' ? (res.value?.data ?? []) : []
      const exportData = {
        profile,
        posts: r(postsRes),
        messages: r(msgsRes),
        reviews: r(reviewsRes),
        saved_posts: r(savedPostsRes),
        saved_events: r(savedEventsRes),
        post_likes: r(postLikesRes),
        post_comments: r(commentsRes),
        followers: r(followersRes),
        following: r(followingRes),
        notification_preferences: r(notifPrefsRes),
        conversations: r(conversationsRes),
        user_badges: r(badgesRes),
        payments: r(paymentsRes),
        rental_bookings: r(rentalBookingsRes),
        service_bookings: r(serviceBookingsRes),
        thanks: r(thanksRes),
        user_points: r(pointsRes),
        exported_at: new Date().toISOString(),
      }

      const jsonStr = JSON.stringify(exportData, null, 2)
      const filename = `tackbird-export-${new Date().toISOString().slice(0, 10)}.json`

      // Try native file sharing via expo-file-system + expo-sharing
      if (Platform.OS !== 'web') {
        try {
          const FileSystem = require('expo-file-system')
          const Sharing = require('expo-sharing')
          const fileUri = FileSystem.documentDirectory + filename
          await FileSystem.writeAsStringAsync(fileUri, jsonStr, { encoding: FileSystem.EncodingType.UTF8 })
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: t('settings.export') })
          } else {
            await downloadAsFile(jsonStr, filename)
          }
        } catch {
          // Fallback if modules not available
          await downloadAsFile(jsonStr, filename)
        }
      } else {
        await downloadAsFile(jsonStr, filename)
      }
    } catch {
      Alert.alert(t('common.error'))
    } finally {
      setExporting(false)
      setExportProgress('')
    }
  }, [profile, supabase, t])

  const handleDeleteAccount = () => {
    Alert.alert(t('settings.deleteAccount'), t('settings.deleteFirstConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deletePermanently'), style: 'destructive',
        onPress: () => {
          setDeleteConfirmText('')
          setDeleteModalVisible(true)
        },
      },
    ])
  }

  const handleConfirmDelete = useCallback(async () => {
    if (deleteConfirmText !== t('settings.deleteConfirmWord') || deletingAccount) return
    setDeletingAccount(true)
    try {
      // Try RPC first, fallback to signout
      try {
        await supabase.rpc('delete_user_account')
      } catch {
        // RPC may not exist — just sign out
      }
      await supabase.auth.signOut()
      setDeleteModalVisible(false)
      router.replace('/(auth)/login')
    } catch {
      Alert.alert(t('common.error'), t('settings.accountDeleteFailed'))
    } finally {
      setDeletingAccount(false)
    }
  }, [deleteConfirmText, deletingAccount, supabase, router, t])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  const markDirty = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true) }

  const langLabel = (l: Locale) => ({ fi: 'Suomi', en: 'English', sv: 'Svenska', et: 'Eesti', ru: 'Русский' }[l])

  const appVersion = Constants.expoConfig?.version ?? '1.0.0'

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
        {/* Email verification status */}
        {userEmail && (
          <>
            <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.email')}</Text>
            <View style={[s.card, { backgroundColor: colors.card }]}>
              <View style={s.row}>
                <Mail size={18} color={colors.mutedForeground} />
                <Text style={[s.rowText, { color: colors.foreground }]} numberOfLines={1}>{userEmail}</Text>
                {emailVerified ? (
                  <View style={s.verifiedBadge}>
                    <CheckCircle size={14} color={colors.success} />
                    <Text style={[s.verifiedText, { color: colors.success }]}>{t('settings.emailVerified')}</Text>
                  </View>
                ) : (
                  <View style={s.verifiedBadge}>
                    <AlertCircle size={14} color={colors.pro} />
                    <Text style={[s.verifiedText, { color: colors.pro }]}>{t('settings.emailUnverified')}</Text>
                  </View>
                )}
              </View>
            </View>
          </>
        )}

        {/* Display name */}
        {profile && (
          <>
            <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.displayName') ?? 'Nimi'}</Text>
            <View style={[s.card, { backgroundColor: colors.card }]}>
              {editingName ? (
                <View style={{ padding: 16, gap: 10 }}>
                  <TextInput
                    style={[s.input, { backgroundColor: colors.muted, color: colors.foreground }]}
                    value={nameText}
                    onChangeText={setNameText}
                    placeholder={t('profile.name') ?? 'Nimi'}
                    placeholderTextColor={colors.mutedForeground}
                    maxLength={50}
                    autoFocus
                  />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={() => { setEditingName(false); setNameText(profile.name ?? '') }} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: colors.muted }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground }}>{t('common.cancel')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleSaveName}
                      disabled={savingName || !nameText.trim()}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary, opacity: savingName || !nameText.trim() ? 0.5 : 1 }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primaryForeground }}>
                        {savingName ? '...' : t('common.save')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable onPress={() => setEditingName(true)} style={s.row}>
                  <User size={18} color={colors.mutedForeground} />
                  <Text style={[s.rowText, { color: colors.foreground }]}>{profile.name}</Text>
                  <Pencil size={14} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
          </>
        )}

        {/* Account info */}
        {accountCreatedAt && (
          <>
            <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.accountInfo') ?? 'Tilin tiedot'}</Text>
            <View style={[s.card, { backgroundColor: colors.card }]}>
              <View style={s.row}>
                <CalendarDays size={18} color={colors.mutedForeground} />
                <Text style={[s.rowText, { color: colors.foreground }]}>
                  {t('settings.memberSince') ?? 'Jäsen alkaen'}: {new Date(accountCreatedAt).toLocaleDateString(locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* Language */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.language')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          {(['fi', 'en', 'sv', 'et', 'ru'] as Locale[]).map((l) => (
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
            <Pressable key={key} onPress={() => { setAppTheme(key as 'system' | 'light' | 'dark'); setDirty(true) }} style={s.row}>
              <Icon size={18} color={colors.mutedForeground} />
              <Text style={[s.rowText, { color: colors.foreground }]}>{t(label)}</Text>
              <View style={[theme === key ? [s.radio, { backgroundColor: colors.primary }] : [s.radioEmpty, { borderColor: colors.border }]]} />
            </Pressable>
          ))}
        </View>

        {/* Neighborhood — allows user to change neighborhood after onboarding */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('onboarding.chooseNeighborhood')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Pressable onPress={() => {
            // Navigate to feed where NeighborhoodPicker is accessible
            router.push({ pathname: '/', params: { openNeighborhoodPicker: '1' } })
          }} style={s.row}>
            <MapPin size={18} color={colors.primary} />
            <Text style={[s.rowText, { color: colors.foreground }]}>
              {profile?.naapurusto ?? 'Helsinki'}
            </Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>
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

        {/* Location Accuracy */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.locationAccuracy')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          {LOCATION_ACCURACY_OPTIONS.map(({ key, label, desc }) => (
            <Pressable key={key} onPress={() => markDirty(setLocationAccuracy)(key)} style={s.row}>
              <MapPin size={18} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[s.rowText, { color: colors.foreground, flex: undefined }]}>{t(label)}</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{t(desc)}</Text>
              </View>
              <View style={[locationAccuracy === key ? [s.radio, { backgroundColor: colors.primary }] : [s.radioEmpty, { borderColor: colors.border }]]} />
            </Pressable>
          ))}
        </View>

        {/* Notifications — granular preferences */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.notifSection')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          {notifPrefs.loading ? (
            <View style={s.toggleRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[s.rowText, { color: colors.mutedForeground }]}>{t('common.loading')}</Text>
            </View>
          ) : (
            ([
              { type: 'nearby_posts' as NotificationType, label: 'settings.notifNearbyPosts', Icon: MapPin },
              { type: 'events' as NotificationType, label: 'settings.notifEvents', Icon: CalendarDays },
              { type: 'messages' as NotificationType, label: 'settings.notifMessagesGranular', Icon: MessageCircle },
              { type: 'likes' as NotificationType, label: 'settings.notifLikes', Icon: Heart },
              { type: 'comments' as NotificationType, label: 'settings.notifComments', Icon: MessageSquare },
              { type: 'follows' as NotificationType, label: 'settings.notifFollows', Icon: UserPlus },
              { type: 'nappaa' as NotificationType, label: 'settings.notifNappaa', Icon: Zap },
            ]).map(({ type, label, Icon }) => (
              <View key={type} style={s.toggleRow}>
                <Icon size={18} color={notifPrefs.preferences[type] ? colors.primary : colors.mutedForeground} />
                <Text style={[s.rowText, { color: colors.foreground }]}>{t(label)}</Text>
                <Switch
                  value={notifPrefs.preferences[type]}
                  onValueChange={(val) => { notifPrefs.updatePreference(type, val); setDirty(true) }}
                  trackColor={{ false: colors.muted, true: `${colors.primary}66` }}
                  thumbColor={notifPrefs.preferences[type] ? colors.primary : colors.mutedForeground}
                />
              </View>
            ))
          )}
          {push.isSupported && (
            <View style={s.toggleRow}>
              <Bell size={18} color={push.isSubscribed ? colors.primary : colors.mutedForeground} />
              <Text style={[s.rowText, { color: colors.foreground }]}>{t('settings.pushNotifications')}</Text>
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
          <Pressable onPress={() => router.push('/pro')} style={s.row}>
            <Crown size={18} color={colors.pro} />
            <Text style={[s.rowText, { color: colors.foreground }]}>TackBird Pro</Text>
            {profile?.is_pro ? (
              <Text style={[s.proBadge, { color: colors.pro }]}>{t('profile.proActive')}</Text>
            ) : (
              <Pressable onPress={() => router.push('/pro')} style={[s.upgradeBtn, { backgroundColor: colors.pro }]}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>
                  4,99 {'\u20AC'}{t('pro.perMonth')}
                </Text>
              </Pressable>
            )}
          </Pressable>
          {profile?.is_pro && profile?.pro_expires_at && (
            <Text style={{ fontSize: 12, color: colors.mutedForeground, paddingHorizontal: 16, paddingBottom: 12 }}>
              {t('pro.renewsOn', { date: new Date(profile.pro_expires_at).toLocaleDateString(locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB') })}
            </Text>
          )}
        </View>

        {/* Business account */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('business.upgrade')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Pressable
            onPress={() => router.push(profile?.is_business ? '/organization' : '/upgrade-business')}
            style={s.row}
          >
            <Crown size={18} color={colors.primary} />
            <Text style={[s.rowText, { color: colors.foreground }]}>
              {profile?.is_business ? t('business.dashboard') : t('business.upgradeCTA')}
            </Text>
            {profile?.is_business ? (
              <Text style={[s.proBadge, { color: colors.success }]}>{t('business.active')}</Text>
            ) : (
              <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{t('business.monthlyPrice')}</Text>
            )}
          </Pressable>
        </View>

        {/* Security */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.security')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <View style={{ padding: 16, gap: 10 }}>
            <Text style={[s.rowText, { color: colors.foreground, fontWeight: '600' }]}>{t('settings.changePassword')}</Text>
            <TextInput
              style={[s.input, { backgroundColor: colors.muted, color: colors.foreground }]}
              value={currentPw}
              onChangeText={setCurrentPw}
              placeholder={t('settings.currentPasswordPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry
            />
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
              disabled={changingPw || !newPw || !currentPw}
              style={[s.changePwBtn, { backgroundColor: colors.primary, opacity: changingPw || !newPw || !currentPw ? 0.5 : 1 }]}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primaryForeground }}>
                {changingPw ? t('settings.changingPassword') : t('settings.changePassword')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Saved items */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('saved.title')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Pressable onPress={() => router.push('/saved')} style={s.row}>
            <Bookmark size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('saved.title')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Payment Settings */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('payment.settings')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Pressable onPress={() => router.push('/payment-settings' as any)} style={s.row}>
            <CreditCard size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('payment.settings')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={() => router.push('/payment-history' as any)} style={s.row}>
            <CreditCard size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('settings.paymentHistory')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Data export */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.export')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Pressable onPress={handleExport} disabled={exporting} style={s.row}>
            {exporting ? <ActivityIndicator size="small" color={colors.primary} /> : <Download size={18} color={colors.mutedForeground} />}
            <View style={{ flex: 1 }}>
              <Text style={[s.rowText, { color: colors.foreground }]}>{exporting ? t('settings.exportLoading') : t('settings.export')}</Text>
              {exporting && exportProgress ? (
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{exportProgress}</Text>
              ) : null}
            </View>
            {!exporting && <ChevronRight size={16} color={colors.mutedForeground} />}
          </Pressable>
        </View>

        {/* Blocked users */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.blockedUsers')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Pressable onPress={() => router.push('/blocked')} style={s.row}>
            <ShieldBan size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('settings.blockedUsers')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* About & info links */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.about')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Pressable onPress={() => router.push('/about' as any)} style={s.row}>
            <Info size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('about.title')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={() => router.push('/help' as any)} style={s.row}>
            <HelpCircle size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('help.title')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={() => router.push('/privacy')} style={s.row}>
            <Lock size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('settings.privacy')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={() => router.push('/terms')} style={s.row}>
            <FileText size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('settings.terms')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={() => Linking.openURL('mailto:tuki@tackbird.fi?subject=TackBird%20palaute')} style={s.row}>
            <Bug size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('settings.feedback') ?? 'Palaute / Ilmoita virhe'}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        {/* Admin panel — only visible for admins */}
        {(profile as any)?.is_admin && (
          <>
            <Text style={[s.section, { color: colors.mutedForeground }]}>{t('admin.title')}</Text>
            <View style={[s.card, { backgroundColor: colors.card }]}>
              <Pressable onPress={() => router.push('/admin' as any)} style={s.row}>
                <Shield size={18} color={colors.destructive} />
                <Text style={[s.rowText, { color: colors.foreground }]}>{t('admin.title')}</Text>
                <ChevronRight size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </>
        )}

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

        {/* App version */}
        <Text style={[s.versionText, { color: colors.mutedForeground }]}>
          TackBird v{appVersion}
        </Text>
      </ScrollView>

      {/* Delete Account Confirmation Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
        <Pressable style={s.deleteBackdrop} onPress={() => setDeleteModalVisible(false)}>
          <Pressable style={[s.deleteCard, { backgroundColor: colors.card }]} onPress={() => {}}>
            <View style={s.deleteHeader}>
              <Trash2 size={24} color={colors.destructive} />
              <Text style={[s.deleteTitle, { color: colors.destructive }]}>{t('settings.deleteAccount')}</Text>
            </View>
            <Text style={[s.deleteDesc, { color: colors.foreground }]}>{t('settings.deleteSecondConfirm')}</Text>
            <Text style={[s.deleteLabel, { color: colors.mutedForeground }]}>{t('settings.deleteConfirmLabel')}</Text>
            <TextInput
              style={[s.deleteInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder={t('settings.deleteConfirmPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="characters"
            />
            <View style={s.deleteActions}>
              <Pressable onPress={() => setDeleteModalVisible(false)} style={[s.deleteCancelBtn, { backgroundColor: colors.muted }]}>
                <Text style={[s.deleteCancelText, { color: colors.foreground }]}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmDelete}
                disabled={deleteConfirmText !== t('settings.deleteConfirmWord') || deletingAccount}
                style={[s.deleteConfirmBtn, { backgroundColor: colors.destructive, opacity: deleteConfirmText !== t('settings.deleteConfirmWord') || deletingAccount ? 0.5 : 1 }]}
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={s.deleteConfirmText}>{t('settings.deletePermanently')}</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
  },
  saveBtnText: { fontSize: 13, fontWeight: '600' },
  content: { padding: 16, gap: 8, paddingBottom: 100 },
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
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  verifiedText: { fontSize: 12, fontWeight: '500' },
  versionText: {
    fontSize: 12, textAlign: 'center', marginTop: 24, marginBottom: 8,
  },
  deleteBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  deleteCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  deleteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deleteTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  deleteDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  deleteLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  deleteInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  deleteCancelBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  deleteConfirmBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
