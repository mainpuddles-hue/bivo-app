declare const __DEV__: boolean

import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, Switch, TextInput, StyleSheet, Alert, ActivityIndicator, Platform, Modal, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { ArrowLeft, Globe, Bell, Crown, Trash2, LogOut, Sun, Moon, Smartphone, Eye, Download, Info, ChevronRight, Save, Bookmark, ShieldBan, Shield, FileText, Lock, CreditCard, HelpCircle, Mail, CheckCircle, AlertCircle, MapPin, CalendarDays, MessageCircle, Heart, MessageSquare, UserPlus, Zap, User, Pencil, Bug, Building2 } from 'lucide-react-native'
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
import { clearExpiredPro } from '@/lib/proExpiry'
import { fonts } from '@/lib/fonts'
import { FEATURES } from '@/lib/featureFlags'
import { clearAuthCache } from '@/lib/authCache'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { NeighborhoodPicker } from '@/components/NeighborhoodPicker'
import { BackButton, PressableOpacity } from '@/components/ui'
import { useReferral, type ApplyResult } from '@/hooks/useReferral'
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
  const { recovery } = useLocalSearchParams<{ recovery?: string }>()

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
  // Password recovery mode: only trust if Supabase auth confirms it (not just URL param)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  useEffect(() => {
    if (recovery !== 'true') return
    // Verify via auth state — only enable if there's actually a recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.recovery_sent_at) setIsPasswordRecovery(true)
    }).catch(() => {})
  }, [recovery, supabase])

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

  // City
  const [userCityId, setUserCityId] = useState<string>('helsinki')
  const [userCityName, setUserCityName] = useState<string>('Helsinki')
  const [showCityPicker, setShowCityPicker] = useState(false)
  const [availableCities, setAvailableCities] = useState<{ id: string; name: string }[]>([])

  // Neighborhood picker
  const [showNeighborhoodPicker, setShowNeighborhoodPicker] = useState(false)

  // Referral code
  const referral = useReferral(profile?.id ?? null)
  const [referralInput, setReferralInput] = useState('')
  const [referralStatus, setReferralStatus] = useState<'idle' | 'loading' | ApplyResult>('idle')

  // Account info
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null)

  // OAuth-only user (no password to change)
  const [isOAuthUser, setIsOAuthUser] = useState(false)
  const [oauthProvider, setOauthProvider] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email ?? null)
      setEmailVerified(!!user.email_confirmed_at)
      setAccountCreatedAt(user.created_at ?? null)
      // Detect OAuth-only users (no email/password identity)
      const identities = user.identities ?? []
      const hasEmailIdentity = identities.some((id: any) => id.provider === 'email')
      if (!hasEmailIdentity && identities.length > 0) {
        setIsOAuthUser(true)
        const providerName = identities[0]?.provider ?? null
        setOauthProvider(providerName)
      }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (data) {
        // Pro expiry defense-in-depth: if Pro expired, clear it locally and in DB
        await clearExpiredPro(supabase, user.id, data as any)
        const p = data as unknown as Profile
        setProfile(p)
        setNameText(p.name ?? '')
        setVisibility(p.profile_visibility ?? 'everyone')
        setLocationAccuracy(p.location_accuracy ?? 'exact')
        // City
        const cid = (data as any).city_id ?? 'helsinki'
        setUserCityId(cid)
        try {
          const { data: cityData } = await supabase.from('cities').select('name').eq('id', cid).maybeSingle()
          if (cityData) setUserCityName((cityData as any).name)
        } catch {} // Intentional: cities table may not exist
      }
      // Only Helsinki for MVP launch — multi-city later
      setAvailableCities([{ id: 'helsinki', name: 'Helsinki' }])
      // Theme is handled by ThemeProvider
      } catch (err) {
        if (__DEV__) console.warn('[settings] load failed:', err)
      }
    }
    load()
  }, [supabase])

  // Detect if user arrived via password recovery flow
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      }
    })
    return () => { subscription.unsubscribe() }
  }, [supabase])

  const handleSave = useCallback(async () => {
    if (!profile) return
    setSaving(true)
    try {
      const { error: saveError } = await (supabase.from('profiles') as any).update({
        profile_visibility: visibility,
        location_accuracy: locationAccuracy,
      }).eq('id', profile.id)
      if (saveError) {
        Alert.alert(t('common.error'), t('settings.settingsSaveFailed'))
        return
      }
      setDirty(false)
      Alert.alert(t('common.success'), t('settings.settingsSaved'))
    } catch {
      Alert.alert(t('common.error'), t('settings.settingsSaveFailed'))
    } finally { setSaving(false) }
  }, [profile, visibility, locationAccuracy, theme, supabase, t])

  const handleSaveName = useCallback(async () => {
    if (!profile || !nameText.trim()) return
    setSavingName(true)
    try {
      const { error: nameError } = await (supabase.from('profiles') as any).update({ name: nameText.trim() }).eq('id', profile.id)
      if (nameError) {
        Alert.alert(t('common.error'), t('settings.settingsSaveFailed'))
        return
      }
      setProfile(prev => prev ? { ...prev, name: nameText.trim() } : null)
      setEditingName(false)
      Alert.alert(t('common.success'), t('settings.settingsSaved'))
    } catch {
      Alert.alert(t('common.error'), t('settings.settingsSaveFailed'))
    } finally { setSavingName(false) }
  }, [profile, nameText, supabase, t])

  const handleChangePassword = useCallback(async () => {
    if (!isPasswordRecovery && !currentPw) {
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
      // Skip current password verification in recovery mode
      if (!isPasswordRecovery && userEmail) {
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
      setIsPasswordRecovery(false)
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message ?? t('settings.passwordChangeFailed'))
    } finally { setChangingPw(false) }
  }, [currentPw, newPw, userEmail, supabase, t, isPasswordRecovery])

  const handleExport = useCallback(async () => {
    if (!profile) return
    setExporting(true)
    setExportProgress('1/6')
    try {
      // Track per-table errors so export continues even if some tables fail
      const tableErrors: Record<string, string> = {}
      const rejected = { status: 'rejected' as const, reason: new Error('Batch skipped') }
      const r = (res: PromiseSettledResult<any>, tableName: string) => {
        if (res.status === 'rejected') {
          tableErrors[tableName] = res.reason?.message ?? 'Promise rejected'
          return []
        }
        const val = res.value
        if (val?.error) {
          tableErrors[tableName] = val.error.message ?? val.error.code ?? 'Query error'
          return []
        }
        return val?.data ?? []
      }

      // Batch 1: posts, messages, reviews
      let postsRes: PromiseSettledResult<any> = rejected
      let msgsRes: PromiseSettledResult<any> = rejected
      let reviewsRes: PromiseSettledResult<any> = rejected
      try {
        ;[postsRes, msgsRes, reviewsRes] = await Promise.allSettled([
          supabase.from('posts').select('*').eq('user_id', profile.id),
          supabase.from('messages').select('*').eq('sender_id', profile.id),
          supabase.from('reviews').select('*').eq('reviewer_id', profile.id),
        ])
      } catch (e: any) {
        tableErrors['batch1_posts_messages_reviews'] = e?.message ?? 'Batch failed'
      }

      setExportProgress('2/6')
      // Batch 2: saved posts, saved events, post likes
      let savedPostsRes: PromiseSettledResult<any> = rejected
      let savedEventsRes: PromiseSettledResult<any> = rejected
      let postLikesRes: PromiseSettledResult<any> = rejected
      try {
        ;[savedPostsRes, savedEventsRes, postLikesRes] = await Promise.allSettled([
          supabase.from('saved_posts').select('*').eq('user_id', profile.id),
          supabase.from('saved_events').select('*').eq('user_id', profile.id),
          supabase.from('post_likes').select('*').eq('user_id', profile.id),
        ])
      } catch (e: any) {
        tableErrors['batch2_saved_likes'] = e?.message ?? 'Batch failed'
      }

      setExportProgress('3/6')
      // Batch 3: comments, follows (both directions)
      let commentsRes: PromiseSettledResult<any> = rejected
      let followersRes: PromiseSettledResult<any> = rejected
      let followingRes: PromiseSettledResult<any> = rejected
      try {
        ;[commentsRes, followersRes, followingRes] = await Promise.allSettled([
          supabase.from('post_comments').select('*').eq('user_id', profile.id),
          supabase.from('user_follows').select('*').eq('followed_id', profile.id),
          supabase.from('user_follows').select('*').eq('follower_id', profile.id),
        ])
      } catch (e: any) {
        tableErrors['batch3_comments_follows'] = e?.message ?? 'Batch failed'
      }

      setExportProgress('4/6')
      // Batch 4: notification preferences, conversations, badges
      let notifPrefsRes: PromiseSettledResult<any> = rejected
      let conversationsRes: PromiseSettledResult<any> = rejected
      let badgesRes: PromiseSettledResult<any> = rejected
      try {
        ;[notifPrefsRes, conversationsRes, badgesRes] = await Promise.allSettled([
          supabase.from('notification_preferences').select('*').eq('user_id', profile.id),
          isValidUUID(profile.id) ? supabase.from('conversations').select('id, user1_id, user2_id, post_id, created_at, updated_at').or(`user1_id.eq.${profile.id},user2_id.eq.${profile.id}`) : Promise.resolve({ data: [] }),
          supabase.from('user_badges').select('*').eq('user_id', profile.id),
        ])
      } catch (e: any) {
        tableErrors['batch4_notif_conversations_badges'] = e?.message ?? 'Batch failed'
      }

      setExportProgress('5/6')
      // Batch 5: payments, bookings, thanks, points
      let paymentsRes: PromiseSettledResult<any> = rejected
      let rentalBookingsRes: PromiseSettledResult<any> = rejected
      let serviceBookingsRes: PromiseSettledResult<any> = rejected
      let thanksRes: PromiseSettledResult<any> = rejected
      let pointsRes: PromiseSettledResult<any> = rejected
      if (isValidUUID(profile.id)) {
        try {
          ;[paymentsRes, rentalBookingsRes, serviceBookingsRes, thanksRes, pointsRes] = await Promise.allSettled([
            supabase.from('payments').select('*').eq('user_id', profile.id),
            supabase.from('rental_bookings').select('*').or(`borrower_id.eq.${profile.id},lender_id.eq.${profile.id}`),
            supabase.from('service_bookings').select('*').or(`buyer_id.eq.${profile.id},provider_id.eq.${profile.id}`),
            supabase.from('thanks').select('*').or(`from_user_id.eq.${profile.id},to_user_id.eq.${profile.id}`),
            supabase.from('user_points').select('*').eq('user_id', profile.id),
          ])
        } catch (e: any) {
          tableErrors['batch5_payments_bookings_thanks_points'] = e?.message ?? 'Batch failed'
        }
      } else {
        tableErrors['batch5_payments_bookings_thanks_points'] = 'Invalid profile ID — skipped .or() queries'
      }

      setExportProgress('6/6')
      const exportData = {
        profile,
        posts: r(postsRes, 'posts'),
        messages: r(msgsRes, 'messages'),
        reviews: r(reviewsRes, 'reviews'),
        saved_posts: r(savedPostsRes, 'saved_posts'),
        saved_events: r(savedEventsRes, 'saved_events'),
        post_likes: r(postLikesRes, 'post_likes'),
        post_comments: r(commentsRes, 'post_comments'),
        followers: r(followersRes, 'followers'),
        following: r(followingRes, 'following'),
        notification_preferences: r(notifPrefsRes, 'notification_preferences'),
        conversations: r(conversationsRes, 'conversations'),
        user_badges: r(badgesRes, 'user_badges'),
        payments: r(paymentsRes, 'payments'),
        rental_bookings: r(rentalBookingsRes, 'rental_bookings'),
        service_bookings: r(serviceBookingsRes, 'service_bookings'),
        thanks: r(thanksRes, 'thanks'),
        user_points: r(pointsRes, 'user_points'),
        exported_at: new Date().toISOString(),
        ...(Object.keys(tableErrors).length > 0 ? { errors: tableErrors } : {}),
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
    if (deleteConfirmText.toUpperCase() !== (t('settings.deleteConfirmWord') ?? '').toUpperCase() || deletingAccount) return
    setDeletingAccount(true)
    try {
      // Try RPC first for server-side cascade deletion
      const { error: rpcError } = await (supabase.rpc as any)('delete_user_account')
      if (!rpcError) {
        Alert.alert(t('common.success'), t('settings.accountDeleted'))
      } else if (rpcError) {
        // RPC failed — attempt manual cleanup of user data before signout
        // Note: fallback cannot delete the Supabase auth record (requires service role).
        // User may need to contact support for full account removal.
        const uid = profile?.id
        if (uid) {
          await Promise.allSettled([
            // Posts & related
            (supabase.from('posts') as any).update({ is_active: false }).eq('user_id', uid),
            (supabase.from('post_likes') as any).delete().eq('user_id', uid),
            (supabase.from('post_comments') as any).delete().eq('user_id', uid),
            (supabase.from('post_boosts') as any).delete().eq('user_id', uid),
            // Social
            (supabase.from('user_follows') as any).delete().eq('follower_id', uid),
            (supabase.from('user_follows') as any).delete().eq('followed_id', uid),
            (supabase.from('thanks') as any).delete().eq('from_user_id', uid),
            (supabase.from('reviews') as any).delete().eq('reviewer_id', uid),
            // Saved
            (supabase.from('saved_posts') as any).delete().eq('user_id', uid),
            (supabase.from('saved_events') as any).delete().eq('user_id', uid),
            // Messages — anonymize sent messages, remove from conversations
            (supabase.from('messages') as any).update({ content: null, image_url: null }).eq('sender_id', uid),
            (supabase.from('conversation_members') as any).delete().eq('user_id', uid),
            // Groups & activities
            (supabase.from('group_members') as any).delete().eq('user_id', uid),
            (supabase.from('group_post_likes') as any).delete().eq('user_id', uid),
            (supabase.from('activity_members') as any).delete().eq('user_id', uid),
            (supabase.from('community_event_participants') as any).delete().eq('user_id', uid),
            (supabase.from('event_attendees') as any).delete().eq('user_id', uid),
            // Forum
            (supabase.from('forum_votes') as any).delete().eq('user_id', uid),
            // Notifications & points
            (supabase.from('notifications') as any).delete().eq('user_id', uid),
            (supabase.from('notification_preferences') as any).delete().eq('user_id', uid),
            (supabase.from('user_points') as any).delete().eq('user_id', uid),
            (supabase.from('user_boosts') as any).delete().eq('user_id', uid),
            (supabase.from('boost_purchases') as any).delete().eq('user_id', uid),
            // Profile — anonymize all PII
            (supabase.from('profiles') as any).update({
              name: t('settings.deletedUser'),
              bio: null,
              avatar_url: null,
              push_token: null,
              naapurusto: null,
              email: null,
              business_name: null,
              business_phone: null,
              business_website: null,
              invite_code: null,
              stripe_customer_id: null,
              stripe_subscription_id: null,
            }).eq('id', uid),
          ])
        }
        // Inform user that full deletion requires support contact
        Alert.alert(
          t('settings.accountDeleted'),
          t('settings.accountDeletePartial'),
        )
      }
      clearAuthCache()
      await supabase.auth.signOut()
      setDeleteModalVisible(false)
      router.replace('/(auth)/login')
    } catch {
      Alert.alert(t('common.error'), t('settings.accountDeleteFailed'))
    } finally {
      setDeletingAccount(false)
    }
  }, [deleteConfirmText, deletingAccount, supabase, router, t, profile])

  const handleLogout = () => {
    Alert.alert(
      t('settings.logout'),
      t('settings.logoutConfirm') ?? t('settings.logout'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logout'),
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.auth.signOut()
            } catch {
              // Sign out may fail on network — proceed anyway
            }
            clearAuthCache()
            // Note: onboarding_complete is intentionally kept — the onboarding guard
            // checks the profile's naapurusto field, AsyncStorage is just a cache.
            router.replace('/(auth)/login')
          },
        },
      ],
    )
  }

  const markDirty = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true) }

  const langLabel = (l: Locale) => ({ fi: 'Suomi', en: 'English', sv: 'Svenska', et: 'Eesti', ru: 'Русский' }[l])

  const appVersion = Constants.expoConfig?.version ?? '1.0.0'

  return (
    <ScreenErrorBoundary screenName="Settings">
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <BackButton />
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('settings.title')}</Text>
        <View style={{ flex: 1 }} />
        {dirty && (
          <Pressable onPress={handleSave} disabled={saving} style={({ pressed }) => [s.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : pressed ? 0.7 : 1 }]}>
            {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Save size={16} color={colors.primaryForeground} />}
            <Text style={[s.saveBtnText, { color: colors.primaryForeground }]}>{t('common.save')}</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
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
                <View style={{ padding: 16, gap: 12 }}>
                  <TextInput
                    style={[s.input, { backgroundColor: colors.muted, color: colors.foreground }]}
                    value={nameText}
                    onChangeText={setNameText}
                    placeholder={t('profile.name') ?? 'Nimi'}
                    placeholderTextColor={colors.mutedForeground}
                    maxLength={50}
                    autoFocus
                    accessibilityLabel={t('settings.displayName')}
                  />
                  <Text style={{ fontSize: 11, color: nameText.length >= 45 ? colors.destructive : colors.mutedForeground, textAlign: 'right', marginTop: 2, fontFamily: fonts.body, lineHeight: 16 }}>
                    {nameText.length}/50
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <PressableOpacity onPress={() => { setEditingName(false); setNameText(profile.name ?? '') }} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.muted }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground, fontFamily: fonts.bodySemi, lineHeight: 18 }}>{t('common.cancel')}</Text>
                    </PressableOpacity>
                    <PressableOpacity
                      onPress={handleSaveName}
                      disabled={savingName || !nameText.trim()}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: colors.primary, opacity: savingName || !nameText.trim() ? 0.5 : 1 }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primaryForeground, fontFamily: fonts.bodySemi, lineHeight: 18 }}>
                        {savingName ? '...' : t('common.save')}
                      </Text>
                    </PressableOpacity>
                  </View>
                </View>
              ) : (
                <PressableOpacity onPress={() => setEditingName(true)} style={s.row} accessibilityRole="button" accessibilityLabel={t('settings.displayName')}>
                  <User size={18} color={colors.mutedForeground} />
                  <Text style={[s.rowText, { color: colors.foreground }]}>{profile.name}</Text>
                  <Pencil size={14} color={colors.mutedForeground} />
                </PressableOpacity>
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
          {(['fi', 'en', 'sv'] as Locale[]).map((l) => (
            <PressableOpacity key={l} onPress={() => setLocale(l)} style={s.row} accessibilityRole="radio" accessibilityState={{ checked: locale === l }} accessibilityLabel={langLabel(l)}>
              <Globe size={18} color={colors.mutedForeground} />
              <Text style={[s.rowText, { color: colors.foreground }]}>{langLabel(l)}</Text>
              <View style={[locale === l ? [s.radio, { backgroundColor: colors.primary }] : [s.radioEmpty, { borderColor: colors.border }]]} />
            </PressableOpacity>
          ))}
        </View>

        {/* Theme */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.theme')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          {THEME_OPTIONS.map(({ key, label, icon: Icon }) => (
            <PressableOpacity key={key} onPress={() => { setAppTheme(key as 'system' | 'light' | 'dark') }} style={s.row} accessibilityRole="radio" accessibilityState={{ checked: theme === key }} accessibilityLabel={t(label)}>
              <Icon size={18} color={colors.mutedForeground} />
              <Text style={[s.rowText, { color: colors.foreground }]}>{t(label)}</Text>
              <View style={[theme === key ? [s.radio, { backgroundColor: colors.primary }] : [s.radioEmpty, { borderColor: colors.border }]]} />
            </PressableOpacity>
          ))}
        </View>

        {/* City — hidden until multi-city launch (only Helsinki supported) */}
        {availableCities.length > 1 && (
          <>
            <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.city')}</Text>
            <View style={[s.card, { backgroundColor: colors.card }]}>
              {showCityPicker ? (
                <>
                  {availableCities.map((city) => (
                    <PressableOpacity
                      key={city.id}
                      onPress={async () => {
                        if (city.id === userCityId) { setShowCityPicker(false); return }
                        if (profile) {
                          try {
                            const { error } = await (supabase.from('profiles') as any).update({ city_id: city.id, naapurusto: null }).eq('id', profile.id)
                            if (error) throw error
                            setUserCityId(city.id)
                            setUserCityName(city.name)
                            setShowCityPicker(false)
                            setProfile(prev => prev ? { ...prev, naapurusto: null as any } : null)
                            // After changing city, neighborhood is reset — prompt user to pick a new one
                            Alert.alert(
                              t('settings.cityChanged') ?? city.name,
                              t('settings.pickNewNeighborhood') ?? t('onboarding.neighborhoodSubtitle'),
                              [{
                                text: t('common.ok') ?? 'OK',
                                onPress: () => setShowNeighborhoodPicker(true),
                              }]
                            )
                          } catch {
                            Alert.alert(t('common.error'), t('settings.saveFailed'))
                          }
                        } else {
                          setUserCityId(city.id)
                          setUserCityName(city.name)
                          setShowCityPicker(false)
                        }
                      }}
                      style={s.row}
                    >
                      <MapPin size={18} color={city.id === userCityId ? colors.primary : colors.mutedForeground} />
                      <Text style={[s.rowText, { color: colors.foreground }]}>{city.name}</Text>
                      <View style={[city.id === userCityId ? [s.radio, { backgroundColor: colors.primary }] : [s.radioEmpty, { borderColor: colors.border }]]} />
                    </PressableOpacity>
                  ))}
                </>
              ) : (
                <PressableOpacity onPress={() => setShowCityPicker(true)} style={s.row}>
                  <MapPin size={18} color={colors.primary} />
                  <Text style={[s.rowText, { color: colors.foreground }]}>{userCityName}</Text>
                  <ChevronRight size={16} color={colors.mutedForeground} />
                </PressableOpacity>
              )}
            </View>
          </>
        )}

        {/* Neighborhood — allows user to change neighborhood after onboarding */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('onboarding.chooseNeighborhood')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <PressableOpacity onPress={() => setShowNeighborhoodPicker(true)} style={s.row}>
            <MapPin size={18} color={colors.primary} />
            <Text style={[s.rowText, { color: colors.foreground }]}>
              {profile?.naapurusto ?? userCityName}
            </Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </PressableOpacity>
        </View>

        {/* Profile Visibility */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.profileVisibility')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          {VISIBILITY_OPTIONS.map(({ key, label }) => (
            <PressableOpacity key={key} onPress={() => markDirty(setVisibility)(key)} style={s.row} accessibilityRole="radio" accessibilityState={{ checked: visibility === key }} accessibilityLabel={t(label)}>
              <Eye size={18} color={colors.mutedForeground} />
              <Text style={[s.rowText, { color: colors.foreground }]}>{t(label)}</Text>
              <View style={[visibility === key ? [s.radio, { backgroundColor: colors.primary }] : [s.radioEmpty, { borderColor: colors.border }]]} />
            </PressableOpacity>
          ))}
        </View>

        {/* Location Accuracy */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.locationAccuracy')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          {LOCATION_ACCURACY_OPTIONS.map(({ key, label, desc }) => (
            <PressableOpacity key={key} onPress={() => markDirty(setLocationAccuracy)(key)} style={s.row} accessibilityRole="radio" accessibilityState={{ checked: locationAccuracy === key }} accessibilityLabel={t(label)}>
              <MapPin size={18} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[s.rowText, { color: colors.foreground, flex: undefined }]}>{t(label)}</Text>
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2, fontFamily: fonts.body, lineHeight: 16 }}>{t(desc)}</Text>
              </View>
              <View style={[locationAccuracy === key ? [s.radio, { backgroundColor: colors.primary }] : [s.radioEmpty, { borderColor: colors.border }]]} />
            </PressableOpacity>
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
                  onValueChange={(val) => { notifPrefs.updatePreference(type, val) }}
                  trackColor={{ false: colors.muted, true: `${colors.primary}66` }}
                  thumbColor={notifPrefs.preferences[type] ? colors.primary : colors.mutedForeground}
                  accessibilityLabel={t(label)}
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
                accessibilityLabel={t('settings.pushNotifications')}
              />
            </View>
          )}
        </View>

        {/* Pro */}
        {FEATURES.PRO_SUBSCRIPTION && (
          <>
            <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.proSubscription')}</Text>
            <View style={[s.card, { backgroundColor: colors.card }]}>
              <PressableOpacity onPress={() => router.push('/pro')} style={s.row}>
                <Crown size={18} color={colors.pro} />
                <Text style={[s.rowText, { color: colors.foreground }]}>TackBird Pro</Text>
                {profile?.is_pro ? (
                  <Text style={[s.proBadge, { color: colors.pro }]}>{t('profile.proActive')}</Text>
                ) : (
                  <PressableOpacity onPress={() => router.push('/pro')} style={[s.upgradeBtn, { backgroundColor: colors.pro }]}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.foreground, fontFamily: fonts.bodySemi, lineHeight: 16 }}>
                      4,99 {'\u20AC'}{t('pro.perMonth')}
                    </Text>
                  </PressableOpacity>
                )}
              </PressableOpacity>
              {profile?.is_pro && profile?.pro_expires_at && (
                <Text style={{ fontSize: 12, color: colors.mutedForeground, paddingHorizontal: 16, paddingBottom: 12, fontFamily: fonts.body, lineHeight: 16 }}>
                  {t('pro.renewsOn', { date: new Date(profile.pro_expires_at).toLocaleDateString(locale === 'fi' ? 'fi-FI' : locale === 'sv' ? 'sv-SE' : 'en-GB') })}
                </Text>
              )}
            </View>
          </>
        )}

        {/* Business account */}
        {FEATURES.BUSINESS_ACCOUNT && (
          <>
            <Text style={[s.section, { color: colors.mutedForeground }]}>{t('business.upgrade')}</Text>
            <View style={[s.card, { backgroundColor: colors.card }]}>
              <PressableOpacity
                onPress={() => router.push(profile?.is_business ? '/organization' : '/upgrade-business')}
                style={s.row}
              >
                <Building2 size={18} color={colors.primary} />
                <Text style={[s.rowText, { color: colors.foreground }]}>
                  {profile?.is_business ? t('business.dashboard') : t('business.upgradeCTA')}
                </Text>
                {profile?.is_business ? (
                  <Text style={[s.proBadge, { color: colors.success }]}>{t('business.active')}</Text>
                ) : (
                  <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.body, lineHeight: 16 }}>{t('business.monthlyPrice')}</Text>
                )}
              </PressableOpacity>
            </View>
          </>
        )}

        {/* Security */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.security')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <View style={{ padding: 16, gap: 12 }}>
            <Text style={[s.rowText, { color: colors.foreground, fontWeight: '600' }]}>{t('settings.changePassword')}</Text>
            {isOAuthUser ? (
              <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: fonts.body, lineHeight: 18 }}>
                {t('settings.passwordManagedByOAuth', { provider: (oauthProvider ?? 'OAuth').charAt(0).toUpperCase() + (oauthProvider ?? 'OAuth').slice(1) })}
              </Text>
            ) : (
              <>
                {!isPasswordRecovery && (
                  <TextInput
                    style={[s.input, { backgroundColor: colors.muted, color: colors.foreground }]}
                    value={currentPw}
                    onChangeText={setCurrentPw}
                    placeholder={t('settings.currentPasswordPlaceholder')}
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry
                    textContentType="password"
                    accessibilityLabel={t('auth.password')}
                  />
                )}
                <TextInput
                  style={[s.input, { backgroundColor: colors.muted, color: colors.foreground }]}
                  value={newPw}
                  onChangeText={setNewPw}
                  placeholder={t('settings.newPasswordPlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry
                  textContentType="newPassword"
                  accessibilityLabel={t('auth.newPassword')}
                />
                {/* Inline password strength feedback (error prevention) */}
                {newPw.length > 0 && (
                  <View style={{ gap: 2, marginTop: 2 }}>
                    {newPw.length < 8 && (
                      <Text style={{ fontSize: 11, color: colors.destructive, fontFamily: fonts.body, lineHeight: 16 }}>{t('settings.passwordTooShort')}</Text>
                    )}
                    {newPw.length >= 8 && !/[A-Z]/.test(newPw) && (
                      <Text style={{ fontSize: 11, color: colors.pro, fontFamily: fonts.body, lineHeight: 16 }}>{t('settings.passwordNeedsUppercase')}</Text>
                    )}
                    {newPw.length >= 8 && !/[0-9]/.test(newPw) && (
                      <Text style={{ fontSize: 11, color: colors.pro, fontFamily: fonts.body, lineHeight: 16 }}>{t('settings.passwordNeedsNumber')}</Text>
                    )}
                    {newPw.length >= 8 && /[A-Z]/.test(newPw) && /[0-9]/.test(newPw) && (
                      <Text style={{ fontSize: 11, color: colors.success, fontFamily: fonts.body, lineHeight: 16 }}>{t('settings.passwordStrong')}</Text>
                    )}
                  </View>
                )}
                <PressableOpacity
                  onPress={handleChangePassword}
                  disabled={changingPw || !newPw || (!isPasswordRecovery && !currentPw)}
                  style={[s.changePwBtn, { backgroundColor: colors.primary, opacity: changingPw || !newPw || (!isPasswordRecovery && !currentPw) ? 0.5 : 1 }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primaryForeground, fontFamily: fonts.bodySemi, lineHeight: 18 }}>
                    {changingPw ? t('settings.changingPassword') : t('settings.changePassword')}
                  </Text>
                </PressableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Referral code — only show if user hasn't used one yet */}
        {!referral.invitedBy && !referral.loading && (
          <>
            <Text style={[s.section, { color: colors.mutedForeground }]}>{t('referral.applyCodeTitle')}</Text>
            <View style={[s.card, { backgroundColor: colors.card, padding: 16, gap: 12 }]}>
              <Text style={{ fontSize: 13, lineHeight: 18, color: colors.mutedForeground, fontFamily: fonts.body }}>
                {t('referral.applyCodeDesc')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={referralInput}
                  onChangeText={(text) => { setReferralInput(text.toUpperCase()); setReferralStatus('idle') }}
                  placeholder={t('referral.applyCodePlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  style={[s.input, {
                    flex: 1,
                    backgroundColor: colors.muted,
                    color: colors.foreground,
                    borderColor: referralStatus === 'success' ? colors.success : referralStatus === 'invalid' || referralStatus === 'self' || referralStatus === 'error' ? colors.destructive : colors.border,
                    fontFamily: fonts.body,
                    letterSpacing: 2,
                  }]}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={12}
                />
                <PressableOpacity
                  onPress={async () => {
                    const code = referralInput.trim()
                    if (code.length < 4) return
                    setReferralStatus('loading')
                    const result = await referral.applyInviteCode(code)
                    setReferralStatus(result)
                  }}
                  disabled={referralInput.trim().length < 4 || referralStatus === 'loading'}
                  style={[s.changePwBtn, {
                    backgroundColor: colors.primary,
                    paddingHorizontal: 20,
                    opacity: referralInput.trim().length < 4 || referralStatus === 'loading' ? 0.5 : 1,
                  }]}
                >
                  {referralStatus === 'loading' ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primaryForeground, fontFamily: fonts.bodySemi }}>
                      {t('referral.applyCodeSubmit')}
                    </Text>
                  )}
                </PressableOpacity>
              </View>
              {referralStatus === 'success' && (
                <Text style={{ fontSize: 12, color: colors.success, fontFamily: fonts.body }}>{t('referral.applyCodeSuccess')}</Text>
              )}
              {referralStatus === 'already_referred' && (
                <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: fonts.body }}>{t('referral.applyCodeAlreadyReferred')}</Text>
              )}
              {referralStatus === 'invalid' && (
                <Text style={{ fontSize: 12, color: colors.destructive, fontFamily: fonts.body }}>{t('referral.applyCodeNotFound')}</Text>
              )}
              {referralStatus === 'self' && (
                <Text style={{ fontSize: 12, color: colors.destructive, fontFamily: fonts.body }}>{t('referral.applyCodeSelfReferral')}</Text>
              )}
              {referralStatus === 'error' && (
                <Text style={{ fontSize: 12, color: colors.destructive, fontFamily: fonts.body }}>{t('referral.applyCodeError')}</Text>
              )}
            </View>
          </>
        )}

        {/* Saved items */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('saved.title')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <PressableOpacity onPress={() => router.push('/saved')} style={s.row} accessibilityRole="button" accessibilityLabel={t('saved.title')}>
            <Bookmark size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('saved.title')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </PressableOpacity>
        </View>

        {/* Payment Settings */}
        {FEATURES.PAYMENTS && (
          <>
            <Text style={[s.section, { color: colors.mutedForeground }]}>{t('payment.settings')}</Text>
            <View style={[s.card, { backgroundColor: colors.card }]}>
              <PressableOpacity onPress={() => router.push('/payment-settings' as any)} style={s.row} accessibilityRole="button" accessibilityLabel={t('payment.settings')}>
                <CreditCard size={18} color={colors.mutedForeground} />
                <Text style={[s.rowText, { color: colors.foreground }]}>{t('payment.settings')}</Text>
                <ChevronRight size={16} color={colors.mutedForeground} />
              </PressableOpacity>
              <PressableOpacity onPress={() => router.push('/payment-history' as any)} style={s.row} accessibilityRole="button" accessibilityLabel={t('settings.paymentHistory')}>
                <CreditCard size={18} color={colors.mutedForeground} />
                <Text style={[s.rowText, { color: colors.foreground }]}>{t('settings.paymentHistory')}</Text>
                <ChevronRight size={16} color={colors.mutedForeground} />
              </PressableOpacity>
            </View>
          </>
        )}

        {/* Data export */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.export')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <PressableOpacity onPress={handleExport} disabled={exporting} style={s.row} accessibilityRole="button" accessibilityLabel={t('settings.export')}>
            {exporting ? <ActivityIndicator size="small" color={colors.primary} /> : <Download size={18} color={colors.mutedForeground} />}
            <View style={{ flex: 1 }}>
              <Text style={[s.rowText, { color: colors.foreground }]}>{exporting ? t('settings.exportLoading') : t('settings.export')}</Text>
              {exporting && exportProgress ? (
                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2, fontFamily: fonts.body, lineHeight: 16 }}>{exportProgress}</Text>
              ) : null}
            </View>
            {!exporting && <ChevronRight size={16} color={colors.mutedForeground} />}
          </PressableOpacity>
        </View>

        {/* Blocked users */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.blockedUsers')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <PressableOpacity onPress={() => router.push('/blocked')} style={s.row} accessibilityRole="button" accessibilityLabel={t('settings.blockedUsers')}>
            <ShieldBan size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('settings.blockedUsers')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </PressableOpacity>
        </View>

        {/* About & info links */}
        <Text style={[s.section, { color: colors.mutedForeground }]}>{t('settings.about')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <PressableOpacity onPress={() => router.push('/about' as any)} style={s.row} accessibilityRole="button" accessibilityLabel={t('about.title')}>
            <Info size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('about.title')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </PressableOpacity>
          <PressableOpacity onPress={() => router.push('/help' as any)} style={s.row} accessibilityRole="button" accessibilityLabel={t('help.title')}>
            <HelpCircle size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('help.title')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </PressableOpacity>
          <PressableOpacity onPress={() => router.push('/privacy')} style={s.row} accessibilityRole="button" accessibilityLabel={t('settings.privacy')}>
            <Lock size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('settings.privacy')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </PressableOpacity>
          <PressableOpacity onPress={() => router.push('/terms')} style={s.row} accessibilityRole="button" accessibilityLabel={t('settings.terms')}>
            <FileText size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('settings.terms')}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </PressableOpacity>
          <PressableOpacity onPress={() => Linking.openURL('mailto:tuki@tackbird.com?subject=TackBird%20palaute').catch(() => {})} style={s.row} accessibilityRole="button" accessibilityLabel={t('settings.feedback') ?? 'Palaute / Ilmoita virhe'}>
            <Bug size={18} color={colors.mutedForeground} />
            <Text style={[s.rowText, { color: colors.foreground }]}>{t('settings.feedback') ?? 'Palaute / Ilmoita virhe'}</Text>
            <ChevronRight size={16} color={colors.mutedForeground} />
          </PressableOpacity>
        </View>

        {/* Admin panel — only visible for admins */}
        {(profile as any)?.is_admin && (
          <>
            <Text style={[s.section, { color: colors.mutedForeground }]}>{t('admin.title')}</Text>
            <View style={[s.card, { backgroundColor: colors.card }]}>
              <PressableOpacity onPress={() => router.push('/admin' as any)} style={s.row} accessibilityRole="button" accessibilityLabel={t('admin.title')}>
                <Shield size={18} color={colors.destructive} />
                <Text style={[s.rowText, { color: colors.foreground }]}>{t('admin.title')}</Text>
                <ChevronRight size={16} color={colors.mutedForeground} />
              </PressableOpacity>
            </View>
          </>
        )}

        {/* Danger zone */}
        <Text style={[s.section, { color: colors.destructive }]}>{t('settings.deleteAccount')}</Text>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <PressableOpacity onPress={handleDeleteAccount} style={s.row} accessibilityRole="button" accessibilityLabel={t('settings.deleteAccount')}>
            <Trash2 size={18} color={colors.destructive} />
            <Text style={[s.rowText, { color: colors.destructive }]}>{t('settings.deletePermanently')}</Text>
          </PressableOpacity>
        </View>

        {/* Logout */}
        <PressableOpacity onPress={handleLogout} style={[s.logoutBtn, { backgroundColor: colors.card }]} accessibilityRole="button" accessibilityLabel={t('settings.logout')}>
          <LogOut size={18} color={colors.destructive} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.destructive, fontFamily: fonts.bodySemi, lineHeight: 20 }}>{t('settings.logout')}</Text>
        </PressableOpacity>

        {/* App version */}
        <Text style={[s.versionText, { color: colors.mutedForeground }]}>
          TackBird v{appVersion}
        </Text>
      </ScrollView>

      {/* Neighborhood Picker */}
      <NeighborhoodPicker
        visible={showNeighborhoodPicker}
        onClose={() => setShowNeighborhoodPicker(false)}
        selectedNeighborhood={profile?.naapurusto ?? null}
        onSelect={async (nh) => {
          if (!profile) return
          try {
            const { error } = await (supabase.from('profiles') as any).update({ naapurusto: nh }).eq('id', profile.id)
            if (error) throw error
            setProfile(prev => prev ? { ...prev, naapurusto: nh as any } : null)
            setShowNeighborhoodPicker(false)
          } catch {
            Alert.alert(t('common.error'), t('settings.saveFailed'))
          }
        }}
      />

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
              <PressableOpacity onPress={() => setDeleteModalVisible(false)} style={[s.deleteCancelBtn, { backgroundColor: colors.muted }]}>
                <Text style={[s.deleteCancelText, { color: colors.foreground }]}>{t('common.cancel')}</Text>
              </PressableOpacity>
              <PressableOpacity
                onPress={handleConfirmDelete}
                disabled={deleteConfirmText.toUpperCase() !== (t('settings.deleteConfirmWord') ?? '').toUpperCase() || deletingAccount}
                style={[s.deleteConfirmBtn, { backgroundColor: colors.destructive, opacity: deleteConfirmText.toUpperCase() !== (t('settings.deleteConfirmWord') ?? '').toUpperCase() || deletingAccount ? 0.5 : 1 }]}
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={s.deleteConfirmText}>{t('settings.deletePermanently')}</Text>
                )}
              </PressableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
    </ScreenErrorBoundary>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, letterSpacing: -0.3, lineHeight: 28, fontFamily: fonts.headingSemi },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, minHeight: 44,
  },
  saveBtnText: { fontSize: 13, lineHeight: 18, fontWeight: '600', fontFamily: fonts.bodySemi },
  content: { padding: 16, gap: 12, paddingBottom: 100 },
  section: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 16, paddingHorizontal: 4, fontFamily: fonts.bodySemi },
  card: { borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  rowText: { fontSize: 14, lineHeight: 20, flex: 1, fontFamily: fonts.body },
  radio: { width: 18, height: 18, borderRadius: 9 },
  radioEmpty: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  proBadge: { fontSize: 13, lineHeight: 18, fontWeight: '600', fontFamily: fonts.bodySemi },
  upgradeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  input: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16, fontSize: 14, lineHeight: 20, borderWidth: StyleSheet.hairlineWidth, fontFamily: fonts.body },
  changePwBtn: { borderRadius: 12, paddingVertical: 16, alignItems: 'center', minHeight: 48 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 16, borderRadius: 12, marginTop: 16,
  },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  verifiedText: { fontSize: 12, lineHeight: 16, fontWeight: '500', fontFamily: fonts.bodyMedium },
  versionText: {
    fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: 24, marginBottom: 8, fontFamily: fonts.body,
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
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  deleteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    fontFamily: fonts.headingSemi,
  },
  deleteDesc: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
  },
  deleteLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 4,
    fontFamily: fonts.bodySemi,
  },
  deleteInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  deleteCancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteCancelText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  deleteConfirmBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteConfirmText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: fonts.bodySemi,
  },
})
