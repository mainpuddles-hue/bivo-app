import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, Alert, ActivityIndicator, Platform, Modal, Linking, KeyboardAvoidingView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { Globe, Bell, Trash2, LogOut, Sun, Moon, Smartphone, Eye, Download, Info, ChevronRight, ChevronLeft, Save, Bookmark, ShieldBan, Shield, FileText, Lock, CreditCard, HelpCircle, Mail, CheckCircle, AlertCircle, MapPin, CalendarDays, MessageCircle, Heart, MessageSquare, UserPlus, Zap, User, Pencil, Bug, Check, Banknote, Search, BellOff, BellRing, Key } from 'lucide-react-native'
import { Image } from 'expo-image'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { useTheme } from '@/hooks/useTheme'
import { useI18n, type Locale } from '@/lib/i18n'
import { useToast } from '@/components/Toast'
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
import { PressableOpacity } from '@/components/ui'
import { SettingsRow as Row, SettingsGroup as Group, SettingsSectionLabel as SectionLabel } from '@/components/SettingsUI'
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

// Danger red for logout row — uses semantic theme token `colors.danger`

export default function SettingsScreen() {
  const { colors, isDark, theme, setTheme: setAppTheme } = useTheme()
  const { t, locale, setLocale } = useI18n()
  const toast = useToast()
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
    }).catch((e) => { if (__DEV__) console.warn('Recovery session check failed:', e) })
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

  // Feedback
  const [feedbackVisible, setFeedbackVisible] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [sendingFeedback, setSendingFeedback] = useState(false)

  const handleSendFeedback = useCallback(async () => {
    if (!feedbackText.trim() || sendingFeedback) return
    setSendingFeedback(true)
    try {
      const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`${FUNCTIONS_URL}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
          'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({
          to: 'puddles@puddles.fi',
          subject: t('settings.feedbackSubject', { name: profile?.name ?? '—' }),
          body: `${feedbackText.trim()}\n\n---\n${t('settings.feedbackBodyPrefix')}: ${profile?.name ?? '—'}\n${t('settings.feedbackBodyEmail')}: ${userEmail ?? '—'}\nID: ${profile?.id ?? '—'}\n${t('settings.feedbackBodyVersion')}: ${Constants.expoConfig?.version ?? '?'}`,
        }),
      })
      toast.show({ message: t('settings.feedbackSent') ?? 'Palaute lähetetty!', type: 'success' })
      setFeedbackText('')
      setFeedbackVisible(false)
    } catch {
      toast.show({ message: t('common.error') ?? 'Virhe', type: 'error' })
    } finally {
      setSendingFeedback(false)
    }
  }, [feedbackText, sendingFeedback, supabase, profile, userEmail, toast, t])

  // Saved searches
  const [savedSearches, setSavedSearches] = useState<{ id: string; query: string; push_enabled: boolean }[]>([])
  const [loadingSearches, setLoadingSearches] = useState(false)

  // Account info
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null)

  // OAuth-only user (no password to change)
  const [isOAuthUser, setIsOAuthUser] = useState(false)
  const [oauthProvider, setOauthProvider] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!mounted || !user) return
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
      const { data } = await supabase.from('profiles').select('id, name, avatar_url, naapurusto, profile_visibility, location_accuracy, is_pro, pro_expires_at, stripe_subscription_id, city_id').eq('id', user.id).maybeSingle()
      if (!mounted) return
      if (data) {
        // Pro expiry defense-in-depth: if Pro expired, clear it locally and in DB
        await clearExpiredPro(supabase, user.id, data as any)
        if (!mounted) return
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
          if (mounted && cityData) setUserCityName((cityData as any).name)
        } catch {} // Intentional: cities table may not exist
      }
      // Only Helsinki for MVP launch — multi-city later
      if (mounted) setAvailableCities([{ id: 'helsinki', name: 'Helsinki' }])
      // Theme is handled by ThemeProvider
      } catch (err) {
        if (__DEV__) console.warn('[settings] load failed:', err)
      }
    }
    load()
    return () => { mounted = false }
  }, [supabase])

  // Load saved searches
  useEffect(() => {
    if (!profile?.id) return
    setLoadingSearches(true)
    Promise.resolve(
      supabase
        .from('saved_searches')
        .select('id, query, push_enabled')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
    ).then(({ data }) => {
        if (data) setSavedSearches(data as any)
      })
      .catch((e) => { if (__DEV__) console.warn('Settings sync failed:', e) })
      .finally(() => setLoadingSearches(false))
  }, [profile?.id, supabase])

  const toggleSearchPush = useCallback(async (searchId: string, enabled: boolean) => {
    const { error } = await (supabase.from('saved_searches') as any).update({ push_enabled: enabled }).eq('id', searchId)
    if (error) {
      toast.show({ message: t('common.error') ?? 'Virhe', type: 'error' })
      return
    }
    setSavedSearches(prev => prev.map(s => s.id === searchId ? { ...s, push_enabled: enabled } : s))
  }, [supabase, toast, t])

  const deleteSearch = useCallback(async (searchId: string) => {
    const { error } = await (supabase.from('saved_searches') as any).delete().eq('id', searchId)
    if (error) {
      toast.show({ message: t('common.error') ?? 'Virhe', type: 'error' })
      return
    }
    setSavedSearches(prev => prev.filter(s => s.id !== searchId))
    toast.show({ message: t('savedSearch.deleted') ?? 'Deleted', type: 'success' })
  }, [supabase, toast, t])

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
        toast.show({ message: t('settings.settingsSaveFailed'), type: 'error' })
        return
      }
      setDirty(false)
      toast.show({ message: t('settings.settingsSaved'), type: 'success' })
    } catch {
      toast.show({ message: t('settings.settingsSaveFailed'), type: 'error' })
    } finally { setSaving(false) }
  }, [profile, visibility, locationAccuracy, theme, supabase, t, toast])

  const handleSaveName = useCallback(async () => {
    if (!profile || !nameText.trim()) return
    setSavingName(true)
    try {
      const { error: nameError } = await (supabase.from('profiles') as any).update({ name: nameText.trim() }).eq('id', profile.id)
      if (nameError) {
        toast.show({ message: t('settings.settingsSaveFailed'), type: 'error' })
        return
      }
      setProfile(prev => prev ? { ...prev, name: nameText.trim() } : null)
      setEditingName(false)
      toast.show({ message: t('settings.settingsSaved'), type: 'success' })
    } catch {
      toast.show({ message: t('settings.settingsSaveFailed'), type: 'error' })
    } finally { setSavingName(false) }
  }, [profile, nameText, supabase, t, toast])

  const handleChangePassword = useCallback(async () => {
    if (!isPasswordRecovery && !currentPw) {
      toast.show({ message: t('settings.currentPasswordRequired'), type: 'error' })
      return
    }
    if (!newPw || newPw.length < 8) {
      toast.show({ message: t('settings.passwordTooShort'), type: 'error' })
      return
    }
    if (!/[A-Z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      toast.show({ message: t('settings.passwordTooWeak'), type: 'error' })
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
          toast.show({ message: t('settings.currentPasswordWrong'), type: 'error' })
          setChangingPw(false)
          return
        }
      }
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw error
      toast.show({ message: t('settings.passwordChanged'), type: 'success' })
      setCurrentPw('')
      setNewPw('')
      setIsPasswordRecovery(false)
    } catch (err: any) {
      toast.show({ message: err.message ?? t('settings.passwordChangeFailed'), type: 'error' })
    } finally { setChangingPw(false) }
  }, [currentPw, newPw, userEmail, supabase, t, isPasswordRecovery, toast])

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
          supabase.from('saved_posts').select('*').eq('user_id', profile.id).limit(10000),
          supabase.from('saved_events').select('*').eq('user_id', profile.id).limit(10000),
          supabase.from('post_likes').select('*').eq('user_id', profile.id).limit(10000),
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
          supabase.from('post_comments').select('*').eq('user_id', profile.id).limit(10000),
          supabase.from('user_follows').select('*').eq('followed_id', profile.id).limit(10000),
          supabase.from('user_follows').select('*').eq('follower_id', profile.id).limit(10000),
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
      const filename = `bivo-export-${new Date().toISOString().slice(0, 10)}.json`

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
      toast.show({ message: t('common.error'), type: 'error' })
    } finally {
      setExporting(false)
      setExportProgress('')
    }
  }, [profile, supabase, t, toast])

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
      // Full deletion via Edge Function (service_role). This removes the
      // auth.users row along with all user data — the previous RPC-only
      // path left the auth record intact, so the email stayed bound to a
      // valid login after "deletion" (GDPR non-compliance).
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.show({ message: t('auth.loginRequired'), type: 'error' })
        setDeletingAccount(false)
        return
      }

      const FUNCTIONS_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1`
      const res = await fetch(`${FUNCTIONS_URL}/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({ deletedUserLabel: t('settings.deletedUser') }),
      })

      if (res.ok) {
        toast.show({ message: t('settings.accountDeleted'), type: 'success' })
      } else {
        // Edge Function missing / network down / auth deletion failed.
        // Fall back to legacy RPC + client-side cleanup so the user still
        // gets PII removed even if the full auth-record deletion couldn't
        // run. They may need to contact support to finish the job.
        if (__DEV__) {
          const body = await res.json().catch(() => ({}))
          console.warn('[settings] delete-account edge function failed:', res.status, body)
        }
        const { error: rpcError } = await (supabase.rpc as any)('delete_user_account')
        if (rpcError) {
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
        }
        // Inform user that full deletion requires support contact
        toast.show({ message: t('settings.accountDeletePartial') ?? t('settings.accountDeleted'), type: 'info' })
      }
      clearAuthCache()
      await supabase.auth.signOut()
      setDeleteModalVisible(false)
      router.replace('/(auth)/login')
    } catch {
      toast.show({ message: t('settings.accountDeleteFailed'), type: 'error' })
    } finally {
      setDeletingAccount(false)
    }
  }, [deleteConfirmText, deletingAccount, supabase, router, t, profile, toast])

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

  const langLabel = (l: Locale) => ({ fi: 'Suomi', en: 'English', sv: 'Svenska' }[l])

  const appVersion = Constants.expoConfig?.version ?? '1.0.0'

  // Joined year for profile card subtitle
  const joinedYear = accountCreatedAt ? new Date(accountCreatedAt).getFullYear().toString() : null

  // Warm tint for logout icon bg per mockup 22
  const warmTintBg = isDark ? colors.surfaceTinted : colors.warmTint

  // Verification count for display
  const verificationCount = [emailVerified, !!profile?.naapurusto, !!profile?.avatar_url].filter(Boolean).length

  return (
    <ScreenErrorBoundary screenName="Settings">
    <KeyboardAvoidingView style={[s.container, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* ── Header Bar (mockup 22) ── */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <PressableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={[s.headerBackCircle, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ChevronLeft size={20} color={colors.foreground} strokeWidth={1.8} />
        </PressableOpacity>
        <View style={s.headerCenter}>
          <Text style={[s.headerTitle, { color: colors.foreground }]} accessibilityRole="header">{t('settings.title')}</Text>
        </View>
        <View style={s.headerRightSpacer}>
          {dirty && (
            <PressableOpacity onPress={handleSave} disabled={saving} style={[s.headerSaveBtn, { backgroundColor: colors.foreground }]} accessibilityRole="button" accessibilityLabel={t('common.save') ?? 'Save'}>
              {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Save size={14} color={colors.primaryForeground} />}
            </PressableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        {/* ── Profile Card ── */}
        {profile && (
          <View style={s.profileCardWrapper}>
            <PressableOpacity
              onPress={() => router.push('/(tabs)/profile')}
              style={[s.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={profile.name ?? t('settings.displayName')}
            >
              <View style={[s.profileAvatarOuter, { borderColor: colors.border }]}>
                <View style={[s.profileAvatar, { borderColor: colors.card }]}>
                  {profile.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={s.profileAvatarImage} contentFit="cover" />
                  ) : (
                    <View style={[s.profileAvatarFallback, { backgroundColor: colors.muted }]}>
                      <User size={24} color={colors.mutedForeground} />
                    </View>
                  )}
                </View>
              </View>
              <View style={s.profileInfo}>
                <Text style={[s.profileName, { color: colors.foreground }]} numberOfLines={1}>
                  {profile.name ?? t('settings.displayName')}
                </Text>
                <Text style={[s.profileSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {profile.naapurusto ?? userCityName}
                  {joinedYear ? ` \u00B7 ${t('profile.joined') ?? 'liittyi'} ${joinedYear}` : ''}
                </Text>
                {emailVerified && (
                  <View style={s.profileVerifiedRow}>
                    <Check size={10} color={colors.foreground} strokeWidth={2.5} />
                    <Text style={[s.profileVerifiedText, { color: colors.foreground }]}>
                      {t('settings.emailVerified') ?? 'Verified'}
                    </Text>
                  </View>
                )}
              </View>
              <ChevronRight size={14} color={colors.tertiaryForeground} />
            </PressableOpacity>
          </View>
        )}

        {/* ── Section: Tili (Account) ── */}
        <Group label={t('settings.sectionAccount')} colors={colors}>
          <Row
            icon={<User size={16} color={colors.foreground} strokeWidth={1.8} />}
            label={t('settings.displayName') ?? 'Nimi'}
            value={profile?.name ?? ''}
            onPress={() => {
              if (editingName) return
              setEditingName(true)
            }}
            colors={colors}
            isDark={isDark}
          />
          <Row
            icon={<Shield size={16} color={colors.foreground} strokeWidth={1.8} />}
            label={t('settings.security') ?? 'Security'}
            value={`${verificationCount} / 3`}
            onPress={() => router.push('/verification')}
            colors={colors}
            isDark={isDark}
          />
          {FEATURES.PAYMENTS && (
            <Row
              icon={<CreditCard size={16} color={colors.foreground} strokeWidth={1.8} />}
              label={t('payment.settings') ?? 'Payment methods'}
              onPress={() => router.push('/payment-settings' as any)}
              colors={colors}
              isDark={isDark}
            />
          )}
          {FEATURES.PAYMENTS && (
            <Row
              icon={<CreditCard size={16} color={colors.foreground} strokeWidth={1.8} />}
              label={t('payment.history') ?? 'Payment history'}
              onPress={() => router.push('/payment-history' as any)}
              colors={colors}
              isDark={isDark}
            />
          )}
          {FEATURES.LENDING_PAYMENTS && (
            <Row
              icon={<Banknote size={16} color={colors.foreground} strokeWidth={1.8} />}
              label={t('settings.earnings')}
              onPress={() => router.push('/payouts' as any)}
              colors={colors}
              isDark={isDark}
            />
          )}
        </Group>

        {/* ── Section: Sovellus (App) ── */}
        <Group label={t('settings.sectionAppearance') ?? 'App'} colors={colors}>
          <Row
            icon={<Bell size={16} color={colors.foreground} strokeWidth={1.8} />}
            label={t('settings.notifSection') ?? 'Notifications'}
            switchValue={push.isSubscribed}
            onSwitchChange={(val) => val ? push.subscribe() : push.unsubscribe()}
            disabled={push.isLoading}
            colors={colors}
            isDark={isDark}
          />
          <Row
            icon={<MapPin size={16} color={colors.foreground} strokeWidth={1.8} />}
            label={t('onboarding.chooseNeighborhood') ?? 'Location'}
            value={`${profile?.naapurusto ?? userCityName}`}
            onPress={() => setShowNeighborhoodPicker(true)}
            colors={colors}
            isDark={isDark}
          />
          <Row
            icon={<Moon size={16} color={colors.foreground} strokeWidth={1.8} />}
            label={t('settings.themeDark') ?? 'Dark mode'}
            switchValue={isDark}
            onSwitchChange={(val) => setAppTheme(val ? 'dark' : 'light')}
            colors={colors}
            isDark={isDark}
          />
          <Row
            icon={<Globe size={16} color={colors.foreground} strokeWidth={1.8} />}
            label={t('settings.language') ?? 'Language'}
            value={langLabel(locale) ?? locale}
            onPress={() => {
              const locales: Locale[] = ['fi', 'en', 'sv']
              const currentIdx = locales.indexOf(locale)
              const nextLocale = locales[(currentIdx + 1) % locales.length]
              setLocale(nextLocale)
            }}
            colors={colors}
            isDark={isDark}
          />
        </Group>

        {/* ── Section: Yksityisyys (Privacy) ── */}
        <Group label={t('settings.sectionPrivacy') ?? 'Privacy'} colors={colors}>
          <Row
            icon={<Lock size={16} color={colors.foreground} strokeWidth={1.8} />}
            label={t('settings.profileVisibility') ?? 'Profile visibility'}
            value={t(VISIBILITY_OPTIONS.find(v => v.key === visibility)?.label ?? '') ?? visibility}
            onPress={() => {
              const keys = VISIBILITY_OPTIONS.map(v => v.key)
              const idx = keys.indexOf(visibility)
              const next = keys[(idx + 1) % keys.length]
              markDirty(setVisibility)(next)
            }}
            colors={colors}
            isDark={isDark}
          />
          <Row
            icon={<Shield size={16} color={colors.foreground} strokeWidth={1.8} />}
            label={t('settings.privacy') ?? 'Privacy policy'}
            onPress={() => router.push('/privacy')}
            colors={colors}
            isDark={isDark}
          />
        </Group>

        {/* ── Section: Tuki (Support) ── */}
        <Group label={t('settings.sectionAbout') ?? 'Support'} colors={colors}>
          <Row
            icon={<HelpCircle size={16} color={colors.foreground} strokeWidth={1.8} />}
            label={t('help.title') ?? 'Help'}
            onPress={() => router.push('/help' as any)}
            colors={colors}
            isDark={isDark}
          />
          <Row
            icon={<Mail size={16} color={colors.foreground} strokeWidth={1.8} />}
            label={t('settings.feedback') ?? 'Palaute'}
            onPress={() => setFeedbackVisible(true)}
            colors={colors}
            isDark={isDark}
          />
          <Row
            icon={<FileText size={16} color={colors.foreground} strokeWidth={1.8} />}
            label={t('settings.terms') ?? 'Terms & legal'}
            onPress={() => router.push('/terms')}
            colors={colors}
            isDark={isDark}
          />
        </Group>


        {/* ── Saved items ── */}
        <Group colors={colors}>
          <Row
            icon={<Bookmark size={16} color={colors.foreground} strokeWidth={1.8} />}
            label={t('saved.title') ?? 'Saved'}
            onPress={() => router.push('/saved')}
            colors={colors}
            isDark={isDark}
          />
        </Group>

        {/* ── Saved searches ── */}
        <Group colors={colors}>
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
            <Text style={{ fontSize: 12, fontFamily: fonts.bodySemi, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('savedSearch.savedSearches') ?? 'Saved searches'}
            </Text>
          </View>
          {loadingSearches && <ActivityIndicator size="small" color={colors.foreground} style={{ padding: 12 }} />}
          {!loadingSearches && savedSearches.length === 0 && (
            <Text style={{ fontSize: 13, fontFamily: fonts.body, color: colors.mutedForeground, paddingHorizontal: 16, paddingVertical: 12 }}>
              {t('savedSearch.noSavedSearches') ?? 'No saved searches yet'}
            </Text>
          )}
          {savedSearches.map(s => (
            <Row
              key={s.id}
              icon={<Search size={16} color={colors.foreground} strokeWidth={1.8} />}
              label={s.query}
              colors={colors}
              isDark={isDark}
              onPress={() => {
                Alert.alert(
                  t('savedSearch.delete') ?? 'Delete saved search',
                  s.query,
                  [
                    { text: t('common.cancel') ?? 'Cancel', style: 'cancel' },
                    { text: t('common.delete') ?? 'Delete', style: 'destructive', onPress: () => deleteSearch(s.id) },
                  ]
                )
              }}
            >
              <PressableOpacity
                onPress={() => toggleSearchPush(s.id, !s.push_enabled)}
                hitSlop={8}
                style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                accessibilityLabel={s.push_enabled ? (t('savedSearch.notifyOff') ?? 'Turn off notifications') : (t('savedSearch.notifyOn') ?? 'Turn on notifications')}
              >
                {s.push_enabled
                  ? <BellRing size={16} color={colors.primary} strokeWidth={1.8} />
                  : <BellOff size={16} color={colors.mutedForeground} strokeWidth={1.8} />}
              </PressableOpacity>
            </Row>
          ))}
        </Group>

        {/* ── Data export ── */}
        <Group colors={colors}>
          <Row
            icon={exporting ? undefined : <Download size={16} color={colors.foreground} strokeWidth={1.8} />}
            label={exporting ? (t('settings.exportLoading') ?? 'Loading...') : (t('settings.export') ?? 'Download your data')}
            meta={exporting && exportProgress ? exportProgress : undefined}
            onPress={exporting ? undefined : handleExport}
            disabled={exporting}
            colors={colors}
            isDark={isDark}
          >
            {exporting && <ActivityIndicator size="small" color={colors.foreground} />}
          </Row>
        </Group>

        {/* ── Admin panel ── */}
        {(profile as any)?.is_admin && (
          <Group colors={colors}>
            <Row
              icon={<Shield size={16} color={colors.destructive} strokeWidth={1.8} />}
              label={t('admin.title') ?? 'Admin'}
              onPress={() => router.push('/admin' as any)}
              colors={colors}
              isDark={isDark}
            />
          </Group>
        )}

        {/* ── Security section (expanded inline) ── */}
        <Group label={t('settings.security') ?? 'Turvallisuus'} colors={colors}>
          {isOAuthUser ? (
            <Row
              icon={<Lock size={16} color={colors.foreground} strokeWidth={1.8} />}
              label={t('settings.changePassword') ?? 'Change password'}
              meta={t('settings.passwordManagedByOAuth', { provider: (oauthProvider ?? 'OAuth').charAt(0).toUpperCase() + (oauthProvider ?? 'OAuth').slice(1) }) ?? undefined}
              chevron={false}
              colors={colors}
              isDark={isDark}
            />
          ) : (
            <View style={s.securityBlock}>
              <Text style={[s.securityTitle, { color: colors.foreground }]}>{t('settings.changePassword')}</Text>
              {!isPasswordRecovery && (
                <TextInput
                  style={[s.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                  value={currentPw}
                  onChangeText={setCurrentPw}
                  placeholder={t('settings.currentPasswordPlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry
                  textContentType="password"
                  returnKeyType="next"
                  accessibilityLabel={t('auth.password')}
                />
              )}
              <TextInput
                style={[s.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                value={newPw}
                onChangeText={setNewPw}
                placeholder={t('settings.newPasswordPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                textContentType="newPassword"
                returnKeyType="done"
                accessibilityLabel={t('auth.newPassword')}
              />
              {/* Inline password strength feedback */}
              {newPw.length > 0 && (
                <View style={{ gap: 2 }}>
                  {newPw.length < 8 && (
                    <Text style={[s.pwFeedback, { color: colors.destructive }]}>{t('settings.passwordTooShort')}</Text>
                  )}
                  {newPw.length >= 8 && !/[A-Z]/.test(newPw) && (
                    <Text style={[s.pwFeedback, { color: colors.foreground }]}>{t('settings.passwordNeedsUppercase')}</Text>
                  )}
                  {newPw.length >= 8 && !/[0-9]/.test(newPw) && (
                    <Text style={[s.pwFeedback, { color: colors.foreground }]}>{t('settings.passwordNeedsNumber')}</Text>
                  )}
                  {newPw.length >= 8 && /[A-Z]/.test(newPw) && /[0-9]/.test(newPw) && (
                    <Text style={[s.pwFeedback, { color: colors.success }]}>{t('settings.passwordStrong')}</Text>
                  )}
                </View>
              )}
              <PressableOpacity
                onPress={handleChangePassword}
                disabled={changingPw || !newPw || (!isPasswordRecovery && !currentPw)}
                style={[s.changePwBtn, { backgroundColor: colors.foreground, opacity: changingPw || !newPw || (!isPasswordRecovery && !currentPw) ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={changingPw ? t('settings.changingPassword') : t('settings.changePassword')}
              >
                <Text style={[s.changePwBtnText, { color: colors.primaryForeground }]}>
                  {changingPw ? t('settings.changingPassword') : t('settings.changePassword')}
                </Text>
              </PressableOpacity>
            </View>
          )}
        </Group>


        {/* ── Name editing modal inline ── */}
        {editingName && profile && (
          <Group label={t('settings.displayName') ?? 'Nimi'} colors={colors}>
            <View style={s.nameEditBlock}>
              <TextInput
                style={[s.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                value={nameText}
                onChangeText={setNameText}
                placeholder={t('profile.name') ?? 'Nimi'}
                placeholderTextColor={colors.mutedForeground}
                maxLength={50}
                autoFocus
                accessibilityLabel={t('settings.displayName')}
              />
              <Text style={[s.nameCharCount, { color: nameText.length >= 45 ? colors.destructive : colors.mutedForeground }]}>
                {nameText.length}/50
              </Text>
              <View style={s.nameActions}>
                <PressableOpacity onPress={() => { setEditingName(false); setNameText(profile.name ?? '') }} style={[s.nameActionBtn, { backgroundColor: colors.muted }]}>
                  <Text style={[s.nameActionText, { color: colors.foreground }]}>{t('common.cancel')}</Text>
                </PressableOpacity>
                <PressableOpacity
                  onPress={handleSaveName}
                  disabled={savingName || !nameText.trim()}
                  style={[s.nameActionBtn, { backgroundColor: colors.foreground, opacity: savingName || !nameText.trim() ? 0.5 : 1 }]}
                >
                  <Text style={[s.nameActionText, { color: colors.primaryForeground }]}>
                    {savingName ? '...' : t('common.save')}
                  </Text>
                </PressableOpacity>
              </View>
            </View>
          </Group>
        )}

        {/* ── Danger: Delete account ── */}
        <Group colors={colors}>
          <Row
            icon={<Trash2 size={16} color={colors.destructive} strokeWidth={1.8} />}
            iconBg={warmTintBg}
            label={t('settings.deletePermanently') ?? 'Delete account'}
            danger
            chevron={false}
            onPress={handleDeleteAccount}
            colors={colors}
            isDark={isDark}
          />
        </Group>

        {/* ── Logout ── */}
        <Group colors={colors}>
          <Row
            icon={<LogOut size={16} color={isDark ? colors.destructive : colors.danger} strokeWidth={1.8} />}
            iconBg={warmTintBg}
            label={t('settings.logout')}
            danger
            dangerColor={isDark ? colors.destructive : colors.danger}
            chevron={false}
            onPress={handleLogout}
            colors={colors}
            isDark={isDark}
          />
        </Group>

        {/* ── Version text ── */}
        <Text style={[s.versionText, { color: colors.tertiaryForeground }]}>
          Bivo v{appVersion}
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
            toast.show({ message: t('settings.saveFailed'), type: 'error' })
          }
        }}
      />

      {/* Feedback Modal */}
      <Modal visible={feedbackVisible} transparent animationType="fade" onRequestClose={() => setFeedbackVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.deleteBackdrop} onPress={() => setFeedbackVisible(false)}>
            <Pressable style={[s.deleteCard, { backgroundColor: colors.card, gap: 12 }]} onPress={() => {}}>
              <Text style={{ fontFamily: fonts.heading, fontSize: 18, color: colors.foreground }}>
                {t('settings.feedback') ?? 'Palaute'}
              </Text>
              <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.mutedForeground, lineHeight: 18 }}>
                {t('settings.feedbackDesc') ?? 'Kerro meille palautteesi, ehdotuksesi tai ilmoita virheestä.'}
              </Text>
              <TextInput
                value={feedbackText}
                onChangeText={setFeedbackText}
                placeholder={t('settings.feedbackPlaceholder') ?? 'Kirjoita palautteesi tähän...'}
                placeholderTextColor={colors.mutedForeground}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                style={{
                  minHeight: 120,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  padding: 12,
                  fontFamily: fonts.body,
                  fontSize: 14,
                  color: colors.foreground,
                  backgroundColor: colors.muted,
                }}
                maxLength={2000}
                autoFocus
              />
              <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.tertiaryForeground, textAlign: 'right' }}>
                {feedbackText.length}/2000
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <PressableOpacity
                  onPress={() => { setFeedbackVisible(false); setFeedbackText('') }}
                  style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.muted, justifyContent: 'center', alignItems: 'center' }}
                >
                  <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.foreground }}>{t('common.cancel')}</Text>
                </PressableOpacity>
                <PressableOpacity
                  onPress={handleSendFeedback}
                  disabled={!feedbackText.trim() || sendingFeedback}
                  style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: colors.foreground, justifyContent: 'center', alignItems: 'center', opacity: !feedbackText.trim() || sendingFeedback ? 0.5 : 1 }}
                >
                  {sendingFeedback ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: colors.primaryForeground }}>
                      {t('settings.sendFeedback') ?? 'Lähetä'}
                    </Text>
                  )}
                </PressableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

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
                  <ActivityIndicator size="small" color={colors.primaryForeground} />
                ) : (
                  <Text style={[s.deleteConfirmText, { color: colors.primaryForeground }]}>{t('settings.deletePermanently')}</Text>
                )}
              </PressableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
    </ScreenErrorBoundary>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },

  // ── Header (mockup 22) ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingBottom: 12,
    gap: 12,
  },
  headerBackCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    letterSpacing: -0.15,
  },
  headerRightSpacer: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSaveBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Profile card ──
  profileCardWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  profileAvatarOuter: {
    width: 60,
    height: 60,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 999,
    borderWidth: 2,
    overflow: 'hidden',
  },
  profileAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  profileAvatarFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.display,
    letterSpacing: -0.15,
  },
  profileSubtitle: {
    fontSize: 12,
    fontFamily: fonts.body,
    marginTop: 4,
  },
  profileVerifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  profileVerifiedText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },

  inlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // ── Security block ──
  securityBlock: {
    padding: 16,
    gap: 12,
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  input: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: fonts.body,
  },
  pwFeedback: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  changePwBtn: {
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 48,
  },
  changePwBtnText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },

  // ── Referral ──
  referralBlock: {
    padding: 16,
    gap: 12,
  },
  referralDesc: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.body,
  },
  referralRow: {
    flexDirection: 'row',
    gap: 8,
  },
  referralSubmitBtn: {
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralSubmitText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
  referralFeedback: {
    fontSize: 12,
    fontFamily: fonts.body,
  },

  // ── Name editing ──
  nameEditBlock: {
    padding: 16,
    gap: 12,
  },
  nameCharCount: {
    fontSize: 12,
    textAlign: 'right',
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  nameActions: {
    flexDirection: 'row',
    gap: 8,
  },
  nameActionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 999,
  },
  nameActionText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
    lineHeight: 18,
  },

  // ── Version ──
  versionText: {
    fontSize: 12,
    textAlign: 'center',
    paddingTop: 16,
    paddingBottom: 8,
    fontFamily: fonts.body,
  },

  // ── Delete modal ──
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
    borderRadius: 20,
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
    fontFamily: fonts.displayBold,
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
    borderRadius: 14,
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
    borderRadius: 999,
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
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteConfirmText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    fontFamily: fonts.bodySemi,
  },
})
