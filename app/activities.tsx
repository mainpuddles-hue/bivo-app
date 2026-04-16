declare const __DEV__: boolean

import { useState, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, FlatList, RefreshControl, ScrollView, StyleSheet,
  Pressable, Modal, TextInput, Alert, KeyboardAvoidingView,
  Platform, Animated, ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import { getBlockedUserIds } from '@/lib/blockedUsers'
import * as Haptics from 'expo-haptics'
import {
  ArrowLeft, Plus, MapPin, Users, X, Clock,
  Dumbbell, Palette, Baby, Home, Sparkles, HeartPulse, Grid2x2,
  RefreshCw, Check,
} from 'lucide-react-native'
import { PressableOpacity, KeyboardDoneAccessory, KEYBOARD_DONE_ID } from '@/components/ui'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { Avatar } from '@/components/Avatar'
import { useShimmer } from '@/components/SkeletonLoaders'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'

// ── Types ──

interface Activity {
  id: string
  creator_id: string
  title: string
  description: string | null
  category: string
  naapurusto: string
  location_name: string | null
  location_lat: number | null
  location_lng: number | null
  schedule_type: string
  schedule_day: number | null
  schedule_time: string | null
  max_members: number | null
  icon: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  member_count?: number
  is_member?: boolean
  creator?: { id: string; name: string; avatar_url: string | null }
}

// ── Category config ──

type ActivityCategory = 'sport' | 'social' | 'hobby' | 'childcare' | 'neighborhood' | 'creative' | 'health' | 'other'

interface CategoryDef {
  key: ActivityCategory
  labelKey: string
  color: string
  Icon: React.ComponentType<any>
}

const CATEGORIES: CategoryDef[] = [
  { key: 'sport', labelKey: 'activity.categorySport', color: '#EF4444', Icon: Dumbbell },
  { key: 'social', labelKey: 'activity.categorySocial', color: '#8B5CF6', Icon: Users },
  { key: 'hobby', labelKey: 'activity.categoryHobby', color: '#F59E0B', Icon: Palette },
  { key: 'childcare', labelKey: 'activity.categoryChildcare', color: '#EC4899', Icon: Baby },
  { key: 'neighborhood', labelKey: 'activity.categoryNeighborhood', color: '#10B981', Icon: Home },
  { key: 'creative', labelKey: 'activity.categoryCreative', color: '#6366F1', Icon: Sparkles },
  { key: 'health', labelKey: 'activity.categoryHealth', color: '#14B8A6', Icon: HeartPulse },
  { key: 'other', labelKey: 'activity.categoryOther', color: '#6B7280', Icon: Grid2x2 },
]

const CATEGORY_COLOR_MAP: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]))
const CATEGORY_ICON_MAP: Record<string, React.ComponentType<any>> = Object.fromEntries(CATEGORIES.map(c => [c.key, c.Icon]))

const ActivityItemSeparator = () => <View style={{ height: 12 }} />

// ── Filter chips (includes "all") ──

const FILTER_CHIPS: { key: string; labelKey: string }[] = [
  { key: 'all', labelKey: 'common.all' },
  { key: 'sport', labelKey: 'activity.categorySport' },
  { key: 'social', labelKey: 'activity.categorySocial' },
  { key: 'hobby', labelKey: 'activity.categoryHobby' },
  { key: 'childcare', labelKey: 'activity.categoryChildcare' },
  { key: 'neighborhood', labelKey: 'activity.categoryNeighborhood' },
  { key: 'creative', labelKey: 'activity.categoryCreative' },
  { key: 'health', labelKey: 'activity.categoryHealth' },
  { key: 'other', labelKey: 'activity.categoryOther' },
]

// ── Schedule types ──

interface ScheduleTypeDef {
  key: string
  labelKey: string
}

const SCHEDULE_TYPES: ScheduleTypeDef[] = [
  { key: 'daily', labelKey: 'activities.daily' },
  { key: 'weekly', labelKey: 'activity.scheduleWeekly' },
  { key: 'biweekly', labelKey: 'activity.scheduleBiweekly' },
  { key: 'monthly', labelKey: 'activities.monthly' },
]

// ── Days of week ──

const DAYS_OF_WEEK: { key: number; labelKey: string; shortKey: string }[] = [
  { key: 1, labelKey: 'time.monday', shortKey: 'days.monShort' },
  { key: 2, labelKey: 'time.tuesday', shortKey: 'days.tueShort' },
  { key: 3, labelKey: 'time.wednesday', shortKey: 'days.wedShort' },
  { key: 4, labelKey: 'time.thursday', shortKey: 'days.thuShort' },
  { key: 5, labelKey: 'time.friday', shortKey: 'days.friShort' },
  { key: 6, labelKey: 'time.saturday', shortKey: 'days.satShort' },
  { key: 0, labelKey: 'time.sunday', shortKey: 'days.sunShort' },
]

// ── Schedule display helper ──

function formatSchedule(
  scheduleType: string,
  scheduleDay: number | null,
  scheduleTime: string | null,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const dayNames: Record<number, string> = {
    0: t('time.sunday'),
    1: t('time.monday'),
    2: t('time.tuesday'),
    3: t('time.wednesday'),
    4: t('time.thursday'),
    5: t('time.friday'),
    6: t('time.saturday'),
  }
  const dayName = scheduleDay != null ? dayNames[scheduleDay] ?? '' : ''
  const timeStr = scheduleTime ?? ''

  switch (scheduleType) {
    case 'daily':
      return t('activities.daily') + (timeStr ? ` ${t('time.atTime') ?? 'klo'} ${timeStr}` : '')
    case 'weekly':
      return t('activity.scheduleWeeklyFormat', { day: dayName, time: timeStr })
    case 'biweekly':
      return t('activity.scheduleBiweeklyFormat', { day: dayName, time: timeStr })
    case 'monthly':
      return t('activities.monthly') + (timeStr ? ` ${t('time.atTime') ?? 'klo'} ${timeStr}` : '')
    default:
      return timeStr ? `${t('time.atTime') ?? 'klo'} ${timeStr}` : ''
  }
}

// ── Skeleton ──

function ActivitySkeleton({ colors }: { colors: ReturnType<typeof import('@/hooks/useTheme').useTheme>['colors'] }) {
  const opacity = useShimmer()

  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={[st.card, { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
          <View style={st.cardTop}>
            <Animated.View style={[{ width: 44, height: 44, borderRadius: 16, backgroundColor: colors.muted }, { opacity }]} />
            <View style={st.cardContent}>
              <Animated.View style={[{ width: '70%', height: 14, borderRadius: 4, backgroundColor: colors.muted }, { opacity }]} />
              <Animated.View style={[{ width: '50%', height: 10, borderRadius: 4, backgroundColor: colors.muted, marginTop: 6 }, { opacity }]} />
              <Animated.View style={[{ width: '40%', height: 10, borderRadius: 4, backgroundColor: colors.muted, marginTop: 4 }, { opacity }]} />
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}

// ══════════════════════════════════════════════════════
//  Main screen
// ══════════════════════════════════════════════════════

function ActivitiesScreenInner() {
  const { colors } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  // ── State ──
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState('all')
  const [showCreateModal, setShowCreateModal] = useState(false)

  // ── Create form state ──
  const [createTitle, setCreateTitle] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createCategory, setCreateCategory] = useState<string>('')
  const [createScheduleType, setCreateScheduleType] = useState<string>('')
  const [createScheduleDay, setCreateScheduleDay] = useState<number | null>(null)
  const [createScheduleTime, setCreateScheduleTime] = useState('')
  const [createLocation, setCreateLocation] = useState('')
  const [createMaxMembers, setCreateMaxMembers] = useState('')
  const [creating, setCreating] = useState(false)

  // ── Fetch activities ──
  const fetchActivities = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      const { data, error } = await supabase
        .from('activities')
        .select('*, creator:profiles!activities_creator_id_fkey(id, name, avatar_url)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) {
        if (__DEV__) console.log('[activities] fetch error:', error.message)
        return
      }

      let activityList = (data ?? []) as unknown as Activity[]

      // Fetch member counts
      if (activityList.length > 0) {
        const ids = activityList.map(a => a.id)
        const { data: memberData } = await supabase
          .from('activity_members')
          .select('activity_id')
          .in('activity_id', ids)

        const countMap: Record<string, number> = {}
        ;(memberData ?? []).forEach((m: any) => {
          countMap[m.activity_id] = (countMap[m.activity_id] ?? 0) + 1
        })

        // Check which ones the user is a member of
        let memberSet = new Set<string>()
        if (user) {
          const { data: myMemberships } = await supabase
            .from('activity_members')
            .select('activity_id')
            .eq('user_id', user.id)
            .in('activity_id', ids)

          memberSet = new Set((myMemberships ?? []).map((m: any) => m.activity_id))
        }

        activityList = activityList.map(a => ({
          ...a,
          member_count: countMap[a.id] ?? 0,
          is_member: memberSet.has(a.id),
        }))
      }

      // Filter out activities from blocked users
      if (user) {
        const blocked = await getBlockedUserIds(user.id)
        if (blocked.size > 0) activityList = activityList.filter(a => !blocked.has((a as any).creator_id))
      }
      setActivities(activityList)
    } catch (err) {
      if (__DEV__) console.log('[activities] fetchActivities error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase])

  useFocusEffect(useCallback(() => { fetchActivities() }, [fetchActivities]))

  // ── Toggle membership ──
  const togglingRef = useRef(false)
  const toggleMembership = useCallback(async (activityId: string) => {
    if (!userId) { router.push('/(auth)/login'); return }
    if (togglingRef.current) return
    togglingRef.current = true

    const act = activities.find(a => a.id === activityId)
    if (!act) { togglingRef.current = false; return }

    try {
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }

      if (act.is_member) {
        // Leave
        const { error } = await supabase
          .from('activity_members')
          .delete()
          .eq('activity_id', activityId)
          .eq('user_id', userId)
        if (error) throw error
        setActivities(prev => prev.map(a =>
          a.id === activityId
            ? { ...a, is_member: false, member_count: Math.max(0, (a.member_count ?? 1) - 1) }
            : a
        ))
      } else {
        // Join — check if full
        if (act.max_members && (act.member_count ?? 0) >= act.max_members) {
          Alert.alert(t('activity.activityFull'))
          return
        }
        const { error } = await (supabase.from('activity_members') as any).insert({
          activity_id: activityId,
          user_id: userId,
        })
        if (error) {
          if (error.code === '23505') {
            setActivities(prev => prev.map(a => a.id === activityId ? { ...a, is_member: true } : a))
            return
          }
          throw error
        }
        const { count } = await supabase.from('activity_members').select('*', { count: 'exact', head: true }).eq('activity_id', activityId)
        setActivities(prev => prev.map(a =>
          a.id === activityId
            ? { ...a, is_member: true, member_count: count ?? (a.member_count ?? 0) + 1 }
            : a
        ))
      }
    } catch (err) {
      if (__DEV__) console.log('[activities] toggleMembership error:', err)
      Alert.alert(t('common.error'), act.is_member ? t('activity.leaveFailed') : t('activity.joinFailed'))
    } finally { togglingRef.current = false }
  }, [userId, activities, supabase, router, t])

  // ── Create activity ──
  const handleCreate = useCallback(async () => {
    if (!userId) { router.push('/(auth)/login'); return }

    // Validation
    if (!createTitle.trim()) {
      Alert.alert(t('activity.titleRequired'))
      return
    }
    if (!createCategory) {
      Alert.alert(t('activity.categoryRequired'))
      return
    }
    if (!createScheduleType) {
      Alert.alert(t('activities.scheduleRequired'))
      return
    }

    setCreating(true)
    try {
      // Get user's profile for naapurusto
      const { data: profile } = await supabase
        .from('profiles')
        .select('naapurusto')
        .eq('id', userId)
        .maybeSingle()

      const maxMembersNum = createMaxMembers.trim() ? parseInt(createMaxMembers, 10) : null

      const { error } = await (supabase.from('activities') as any).insert({
        creator_id: userId,
        title: createTitle.trim(),
        description: createDescription.trim() || null,
        category: createCategory,
        naapurusto: (profile as any)?.naapurusto ?? 'kallio',
        location_name: createLocation.trim() || null,
        schedule_type: createScheduleType,
        schedule_day: (createScheduleType === 'weekly' || createScheduleType === 'biweekly') ? createScheduleDay : null,
        schedule_time: createScheduleTime.trim() || null,
        max_members: maxMembersNum && maxMembersNum > 0 ? maxMembersNum : null,
        icon: createCategory,
        is_active: true,
      })

      if (error) throw error

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      }

      Alert.alert(t('activity.created'))
      setShowCreateModal(false)
      resetForm()
      await fetchActivities()
    } catch (err) {
      if (__DEV__) console.log('[activities] create error:', err)
      Alert.alert(t('common.error'), t('activity.createFailed'))
    } finally {
      setCreating(false)
    }
  }, [userId, createTitle, createDescription, createCategory, createScheduleType, createScheduleDay, createScheduleTime, createLocation, createMaxMembers, supabase, router, t, fetchActivities])

  const resetForm = () => {
    setCreateTitle('')
    setCreateDescription('')
    setCreateCategory('')
    setCreateScheduleType('')
    setCreateScheduleDay(null)
    setCreateScheduleTime('')
    setCreateLocation('')
    setCreateMaxMembers('')
  }

  // ── Filtered activities ──
  const filteredActivities = useMemo(() => {
    if (filterCategory === 'all') return activities
    return activities.filter(a => a.category === filterCategory)
  }, [activities, filterCategory])

  // ── Render Activity Card ──
  const renderActivity = useCallback(({ item }: { item: Activity }) => {
    const catColor = CATEGORY_COLOR_MAP[item.category] ?? '#6B7280'
    const CatIcon = CATEGORY_ICON_MAP[item.category] ?? Grid2x2
    const isFull = item.max_members ? (item.member_count ?? 0) >= item.max_members : false

    return (
      <View style={[st.card, { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
        <View style={st.cardTop}>
          <View style={[st.iconBox, { backgroundColor: colors.muted }]}>
            <CatIcon size={20} color={catColor} />
          </View>
          <View style={st.cardContent}>
            <Text style={[st.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={st.scheduleRow}>
              <Clock size={12} color={colors.mutedForeground} />
              <Text style={[st.scheduleText, { color: colors.mutedForeground }]}>
                {formatSchedule(item.schedule_type, item.schedule_day, item.schedule_time, t)}
              </Text>
            </View>
            {item.location_name && (
              <View style={st.metaRow}>
                <MapPin size={12} color={colors.mutedForeground} />
                <Text style={[st.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {item.location_name}
                </Text>
              </View>
            )}
            <View style={st.metaRow}>
              <Users size={12} color={colors.mutedForeground} />
              <Text style={[st.metaText, { color: colors.mutedForeground }]}>
                {item.max_members
                  ? t('activity.membersOfMax', { count: item.member_count ?? 0, max: item.max_members })
                  : t('activity.members', { count: item.member_count ?? 0 })}
              </Text>
            </View>
            {/* Creator */}
            {item.creator && (
              <PressableOpacity
                onPress={() => router.push(`/profile/${item.creator!.id}` as any)}
                style={st.creatorRow}
              >
                <Avatar url={item.creator.avatar_url} name={item.creator.name} size={18} />
                <Text style={[st.metaText, { color: colors.primary }]} numberOfLines={1}>
                  {item.creator.name}
                </Text>
              </PressableOpacity>
            )}
          </View>
          {/* Category dot + label */}
          <View style={st.categoryBadge}>
            <View style={[st.categoryDot, { backgroundColor: catColor }]} />
            <Text style={[st.categoryBadgeText, { color: colors.mutedForeground }]}>
              {t(CATEGORIES.find(c => c.key === item.category)?.labelKey ?? 'activity.categoryOther')}
            </Text>
          </View>
        </View>

        <View style={st.cardBottom}>
          {isFull && !item.is_member ? (
            <View style={[st.joinBtn, { backgroundColor: colors.muted }]}>
              <Text style={[st.joinBtnText, { color: colors.mutedForeground }]}>{t('activity.full')}</Text>
            </View>
          ) : (
            <PressableOpacity
              onPress={() => toggleMembership(item.id)}
              style={[
                st.joinBtn,
                item.is_member
                  ? { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }
                  : { backgroundColor: colors.foreground },
              ]}
            >
              {item.is_member && <Check size={14} color={colors.mutedForeground} strokeWidth={2.5} />}
              <Text style={[st.joinBtnText, { color: item.is_member ? colors.mutedForeground : colors.background }]}>
                {item.is_member ? t('activity.joined') : t('activity.joinActivity')}
              </Text>
            </PressableOpacity>
          )}
        </View>
      </View>
    )
  }, [colors, t, toggleMembership])

  // ── Need weekly/biweekly day picker? ──
  const needsDayPicker = createScheduleType === 'weekly' || createScheduleType === 'biweekly'

  return (
    <View style={[st.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      {/* ── Header ── */}
      <View style={[st.header, { borderBottomColor: colors.border }]}>
        <PressableOpacity onPress={() => router.back()} hitSlop={12} style={st.backBtn} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={24} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[st.headerTitle, { color: colors.foreground }]}>
          {t('activities.title')}
        </Text>
        <PressableOpacity
          onPress={() => {
            if (!userId) { router.push('/(auth)/login'); return }
            setShowCreateModal(true)
          }}
          style={[st.addBtn, { backgroundColor: colors.foreground }]}
        >
          <Plus size={18} color={colors.background} strokeWidth={2.5} />
        </PressableOpacity>
      </View>

      {/* ── Filter chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={st.filterRow}
      >
        {FILTER_CHIPS.map((chip) => {
          const isActive = filterCategory === chip.key
          return (
            <PressableOpacity
              key={chip.key}
              onPress={() => setFilterCategory(chip.key)}
              style={[
                st.filterChip,
                isActive
                  ? { backgroundColor: colors.foreground }
                  : { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
              ]}
            >
              <Text style={[
                st.filterChipText,
                { color: isActive ? colors.background : colors.mutedForeground },
              ]}>
                {t(chip.labelKey)}
              </Text>
            </PressableOpacity>
          )
        })}
      </ScrollView>

      {/* ── Activity list ── */}
      {loading ? (
        <View style={st.listPad}>
          <ActivitySkeleton colors={colors} />
        </View>
      ) : (
        <FlatList
          data={filteredActivities}
          keyExtractor={item => item.id}
          renderItem={renderActivity}
          contentContainerStyle={[st.list, { paddingBottom: insets.bottom + 80 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchActivities() }}
              tintColor={colors.primary}
            />
          }
          ItemSeparatorComponent={ActivityItemSeparator}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={st.empty}>
              <RefreshCw size={48} color={colors.mutedForeground} />
              <Text style={[st.emptyTitle, { color: colors.foreground }]}>
                {t('activity.noActivities')}
              </Text>
              <Text style={[st.emptyHint, { color: colors.mutedForeground }]}>
                {t('activity.noActivitiesHint')}
              </Text>
              <PressableOpacity
                onPress={() => {
                  if (!userId) { router.push('/(auth)/login'); return }
                  setShowCreateModal(true)
                }}
                style={[st.emptyBtn, { backgroundColor: colors.foreground }]}
              >
                <Plus size={16} color={colors.background} strokeWidth={2.5} />
                <Text style={[st.emptyBtnText, { color: colors.background }]}>
                  {t('activities.create')}
                </Text>
              </PressableOpacity>
            </View>
          }
        />
      )}

      {/* ── FAB ── */}
      <PressableOpacity
        onPress={() => {
          if (!userId) { router.push('/(auth)/login'); return }
          setShowCreateModal(true)
        }}
        style={[st.fab, { backgroundColor: colors.foreground, bottom: insets.bottom + 16 }]}
        accessibilityRole="button"
        accessibilityLabel={t('activities.create')}
      >
        <Plus size={24} color={colors.background} strokeWidth={2.5} />
      </PressableOpacity>

      {/* ══════════════════════════════════════════════════
           Create Activity Modal
         ══════════════════════════════════════════════════ */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={[st.modalContainer, { backgroundColor: colors.background }]}>
            {/* Modal header */}
            <View style={[st.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[st.modalTitle, { color: colors.foreground }]}>
                {t('activities.create')}
              </Text>
              <PressableOpacity onPress={() => setShowCreateModal(false)} hitSlop={12}>
                <X size={24} color={colors.foreground} />
              </PressableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={st.modalBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Title */}
              <View style={st.field}>
                <Text style={[st.label, { color: colors.foreground }]}>{t('activity.title')} *</Text>
                <TextInput
                  value={createTitle}
                  onChangeText={setCreateTitle}
                  placeholder={t('activity.titlePlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  style={[st.input, { backgroundColor: colors.muted, color: colors.foreground, borderWidth: 0 }]}
                  maxLength={100}
                />
              </View>

              {/* Description */}
              <View style={st.field}>
                <Text style={[st.label, { color: colors.foreground }]}>{t('activity.description')}</Text>
                <TextInput
                  value={createDescription}
                  onChangeText={setCreateDescription}
                  placeholder={t('activity.descriptionPlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  style={[st.textArea, { backgroundColor: colors.muted, color: colors.foreground, borderWidth: 0 }]}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                  textAlignVertical="top"
                  inputAccessoryViewID={KEYBOARD_DONE_ID}
                />
              </View>

              {/* Category */}
              <View style={st.field}>
                <Text style={[st.label, { color: colors.foreground }]}>{t('activity.selectCategory')} *</Text>
                <View style={st.chipGrid}>
                  {CATEGORIES.map((cat) => {
                    const isSelected = createCategory === cat.key
                    return (
                      <PressableOpacity
                        key={cat.key}
                        onPress={() => setCreateCategory(cat.key)}
                        style={[
                          st.catChip,
                          isSelected
                            ? { backgroundColor: colors.foreground }
                            : { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
                        ]}
                      >
                        <cat.Icon size={14} color={isSelected ? colors.background : cat.color} />
                        <Text style={[st.catChipText, { color: isSelected ? colors.background : cat.color }]}>
                          {t(cat.labelKey)}
                        </Text>
                      </PressableOpacity>
                    )
                  })}
                </View>
              </View>

              {/* Schedule type */}
              <View style={st.field}>
                <Text style={[st.label, { color: colors.foreground }]}>{t('activity.selectSchedule')} *</Text>
                <View style={st.chipGrid}>
                  {SCHEDULE_TYPES.map((sched) => {
                    const isSelected = createScheduleType === sched.key
                    return (
                      <PressableOpacity
                        key={sched.key}
                        onPress={() => setCreateScheduleType(sched.key)}
                        style={[
                          st.schedChip,
                          isSelected
                            ? { backgroundColor: colors.foreground }
                            : { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
                        ]}
                      >
                        <Text style={[st.schedChipText, { color: isSelected ? colors.background : colors.mutedForeground }]}>
                          {t(sched.labelKey)}
                        </Text>
                      </PressableOpacity>
                    )
                  })}
                </View>
              </View>

              {/* Day picker (for weekly/biweekly) */}
              {needsDayPicker && (
                <View style={st.field}>
                  <Text style={[st.label, { color: colors.foreground }]}>{t('activity.selectDay')}</Text>
                  <View style={st.dayRow}>
                    {DAYS_OF_WEEK.map((day) => {
                      const isSelected = createScheduleDay === day.key
                      return (
                        <PressableOpacity
                          key={day.key}
                          onPress={() => setCreateScheduleDay(day.key)}
                          style={[
                            st.dayChip,
                            isSelected
                              ? { backgroundColor: colors.foreground }
                              : { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
                          ]}
                        >
                          <Text style={[st.dayChipText, { color: isSelected ? colors.background : colors.mutedForeground }]}>
                            {t(day.labelKey).slice(0, 2).toUpperCase()}
                          </Text>
                        </PressableOpacity>
                      )
                    })}
                  </View>
                </View>
              )}

              {/* Time */}
              <View style={st.field}>
                <Text style={[st.label, { color: colors.foreground }]}>{t('activity.selectTime')}</Text>
                <TextInput
                  value={createScheduleTime}
                  onChangeText={setCreateScheduleTime}
                  placeholder="18:00"
                  placeholderTextColor={colors.mutedForeground}
                  style={[st.input, { backgroundColor: colors.muted, color: colors.foreground, borderWidth: 0 }]}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>

              {/* Location */}
              <View style={st.field}>
                <Text style={[st.label, { color: colors.foreground }]}>{t('activity.location')}</Text>
                <TextInput
                  value={createLocation}
                  onChangeText={setCreateLocation}
                  placeholder={t('activity.locationPlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  style={[st.input, { backgroundColor: colors.muted, color: colors.foreground, borderWidth: 0 }]}
                  maxLength={200}
                />
              </View>

              {/* Max members */}
              <View style={st.field}>
                <Text style={[st.label, { color: colors.foreground }]}>{t('activities.maxMembers')}</Text>
                <TextInput
                  value={createMaxMembers}
                  onChangeText={setCreateMaxMembers}
                  placeholder={t('activity.maxMembersPlaceholder')}
                  placeholderTextColor={colors.mutedForeground}
                  style={[st.input, { backgroundColor: colors.muted, color: colors.foreground, borderWidth: 0 }]}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>

              {/* Create button */}
              <PressableOpacity
                onPress={handleCreate}
                disabled={creating}
                style={[st.createBtn, { backgroundColor: creating ? colors.muted : colors.foreground }]}
              >
                {creating ? (
                  <ActivityIndicator size="small" color={colors.mutedForeground} />
                ) : (
                  <>
                    <Plus size={18} color={colors.background} strokeWidth={2.5} />
                    <Text style={[st.createBtnText, { color: colors.background }]}>
                      {t('activities.create')}
                    </Text>
                  </>
                )}
              </PressableOpacity>
            </ScrollView>
          </View>
          <KeyboardDoneAccessory />
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

// ══════════════════════════════════════════════════════
//  Styles
// ══════════════════════════════════════════════════════

const st = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: { padding: 2, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    letterSpacing: -0.3,
    fontFamily: fonts.headingSemi,
    lineHeight: 28,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Filters
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    lineHeight: 16,
  },

  // List
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  listPad: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // Card
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row',
    padding: 12,
    gap: 12,
    alignItems: 'flex-start',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.headingSemi,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scheduleText: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    flex: 1,
    fontFamily: fonts.body,
    lineHeight: 17,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontFamily: fonts.body,
    lineHeight: 16,
  },
  cardBottom: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
    alignItems: 'center',
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    minWidth: 90,
    justifyContent: 'center',
  },
  joinBtnText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 16,
    textAlign: 'center',
    fontFamily: fonts.headingSemi,
    lineHeight: 24,
  },
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    fontFamily: fonts.body,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    marginTop: 8,
  },
  emptyBtnText: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: fonts.headingSemi,
    lineHeight: 24,
  },
  modalBody: {
    padding: 16,
    gap: 20,
    paddingBottom: 40,
  },

  // Form fields
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontFamily: fonts.bodySemi,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    minHeight: 80,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  catChipText: {
    fontSize: 13,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  schedChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  schedChipText: {
    fontSize: 13,
    fontFamily: fonts.bodyMedium,
    lineHeight: 16,
  },
  dayRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dayChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 16,
  },
  dayChipText: {
    fontSize: 12,
    fontFamily: fonts.bodySemi,
    lineHeight: 16,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 8,
    minHeight: 48,
  },
  createBtnText: {
    fontSize: 16,
    fontFamily: fonts.bodySemi,
    lineHeight: 24,
  },
})

export default function ActivitiesScreen() {
  return (
    <ScreenErrorBoundary screenName="Activities">
      <ActivitiesScreenInner />
    </ScreenErrorBoundary>
  )
}
