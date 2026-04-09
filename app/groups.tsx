declare const __DEV__: boolean

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  View, Text, FlatList, RefreshControl, ScrollView, StyleSheet,
  Pressable, ActivityIndicator, TextInput, Modal, Switch,
  Platform, Alert, Animated, Dimensions, KeyboardAvoidingView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import * as Haptics from 'expo-haptics'
import {
  ArrowLeft, Plus, ChevronRight, Search, X, Users, Lock, Globe,
} from 'lucide-react-native'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { PressableOpacity, KeyboardDoneAccessory, KEYBOARD_DONE_ID } from '@/components/ui'
import { useShimmer } from '@/components/SkeletonLoaders'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { fonts } from '@/lib/fonts'
import { cardShadow, cardShadowDark } from '@/lib/shadows'
import { useSupabase } from '@/hooks/useSupabase'
import { NEIGHBORHOODS, GROUP_CATEGORY_COLORS as CATEGORY_COLORS } from '@/lib/constants'

// ── Group categories ──
type GroupCategory = 'general' | 'sports' | 'kids' | 'pets' | 'garden' | 'food' | 'culture' | 'other'

interface GroupCategoryDef {
  key: GroupCategory
  labelKey: string
  color: string
}

const GROUP_CATEGORIES: GroupCategoryDef[] = [
  { key: 'general', labelKey: 'groups.general', color: '#2D6B5E' },
  { key: 'sports', labelKey: 'groups.sports', color: '#27AE60' },
  { key: 'kids', labelKey: 'groups.kids', color: '#FF9800' },
  { key: 'pets', labelKey: 'groups.pets', color: '#E8A050' },
  { key: 'garden', labelKey: 'groups.garden', color: '#4CAF6A' },
  { key: 'food', labelKey: 'groups.food', color: '#E74C3C' },
  { key: 'culture', labelKey: 'groups.culture', color: '#8E44AD' },
  { key: 'other', labelKey: 'groups.other', color: '#607D8B' },
]

// ── Types ──
interface Group {
  id: string
  name: string
  description: string | null
  category: GroupCategory
  neighborhood: string | null
  is_public: boolean
  member_count: number
  new_post_count: number
  created_at: string
  created_by: string
}

// ── Skeleton ──
function GroupSkeleton({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  const opacity = useShimmer()

  return (
    <View style={[s.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Animated.View style={[s.skelCircle, { backgroundColor: colors.muted, opacity }]} />
      <View style={s.groupCardMiddle}>
        <Animated.View style={[s.skelLine, { width: '60%', height: 14, backgroundColor: colors.muted, opacity }]} />
        <Animated.View style={[s.skelLine, { width: '40%', height: 10, backgroundColor: colors.muted, opacity, marginTop: 6 }]} />
      </View>
    </View>
  )
}

export default function GroupsScreen() {
  const { colors, isDark } = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()

  // State
  const [myGroups, setMyGroups] = useState<Group[]>([])
  const [suggestedGroups, setSuggestedGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tableExists, setTableExists] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userNeighborhood, setUserNeighborhood] = useState<string | null>(null)
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newCategory, setNewCategory] = useState<GroupCategory>('general')
  const [newNeighborhood, setNewNeighborhood] = useState<string | null>(null)
  const [newIsPublic, setNewIsPublic] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showNeighborhoodPicker, setShowNeighborhoodPicker] = useState(false)

  // Fetch user
  useEffect(() => {
    async function fetchUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)
      try {
        const { data: profile } = await (supabase.from('profiles') as any)
          .select('naapurusto')
          .eq('id', user.id)
          .maybeSingle()
        if (profile?.naapurusto) setUserNeighborhood(profile.naapurusto as string)
      } catch {} // Intentional: profile table columns may be missing
    }
    fetchUser()
  }, [supabase])

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    if (!currentUserId) {
      setLoading(false)
      return
    }

    try {
      // My groups
      const { data: myData, error: myError } = await supabase
        .from('groups')
        .select('*, members:group_members!inner(user_id)')
        .eq('members.user_id', currentUserId)
        .order('created_at', { ascending: false })

      if (myError) {
        if (myError.code === '42P01' || myError.message?.includes('relation') || myError.message?.includes('does not exist')) {
          setTableExists(false)
        }
        setMyGroups([])
        setSuggestedGroups([])
        return
      }

      setTableExists(true)
      const myGroupsList = (myData ?? []) as unknown as Group[]
      setMyGroups(myGroupsList)

      const myIds = new Set(myGroupsList.map((g) => g.id))
      setJoinedIds(myIds)

      // Suggested groups
      const { data: sugData } = await supabase
        .from('groups')
        .select('*')
        .eq('is_public', true)
        .order('member_count', { ascending: false })
        .limit(20)

      const suggested = ((sugData ?? []) as unknown as Group[]).filter(
        (g) => !myIds.has(g.id)
      )
      setSuggestedGroups(suggested)
    } catch (err) {
      if (__DEV__) console.warn('[groups] fetchGroups failed:', err)
      setMyGroups([])
      setSuggestedGroups([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [supabase, currentUserId])

  useFocusEffect(useCallback(() => {
    if (currentUserId) {
      setLoading(true)
      fetchGroups()
    }
  }, [fetchGroups, currentUserId]))

  const handleRefresh = useCallback(() => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {} // Intentional: haptics unavailable on some platforms
    setRefreshing(true)
    fetchGroups()
  }, [fetchGroups])

  // Join group
  const joiningGroupRef = useRef(false)
  const handleJoin = useCallback(async (group: Group) => {
    if (!currentUserId) return
    if (joiningGroupRef.current) return
    joiningGroupRef.current = true
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} // Intentional: haptics unavailable on some platforms

    // Optimistic
    setJoinedIds((prev) => { const n = new Set(prev); n.add(group.id); return n })
    setSuggestedGroups((prev) => prev.filter((g) => g.id !== group.id))
    setMyGroups((prev) => [{ ...group, member_count: group.member_count + 1 }, ...prev])

    try {
      const { error: insertError } = await (supabase.from('group_members') as any).insert({
        group_id: group.id,
        user_id: currentUserId,
        role: 'member',
      })
      if (insertError) {
        if (insertError.code === '23505') {
          // Already a member — just refresh
          fetchGroups()
          return
        }
        throw insertError
      }
      // Fire-and-forget member count sync
      ;(supabase.from('groups') as any)
        .update({ member_count: group.member_count + 1 })
        .eq('id', group.id).then(() => {}).catch(() => {})
    } catch {
      // Revert
      setJoinedIds((prev) => { const n = new Set(prev); n.delete(group.id); return n })
      setSuggestedGroups((prev) => [group, ...prev])
      setMyGroups((prev) => prev.filter((g) => g.id !== group.id))
      Alert.alert(t('common.error'), t('groups.joinError'))
    } finally { joiningGroupRef.current = false }
  }, [currentUserId, supabase, t])

  // Create group
  const handleCreate = useCallback(async () => {
    if (!currentUserId) return
    if (!newName.trim()) {
      Alert.alert(t('common.error'), t('groups.nameRequired'))
      return
    }

    setCreating(true)
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {} // Intentional: haptics unavailable on some platforms

    try {
      const { data, error } = await (supabase.from('groups') as any)
        .insert({
          name: newName.trim(),
          description: newDescription.trim() || null,
          category: newCategory,
          neighborhood: newNeighborhood,
          naapurusto: newNeighborhood,
          is_public: newIsPublic,
          is_private: !newIsPublic,
          member_count: 1,
          new_post_count: 0,
          created_by: currentUserId,
          creator_id: currentUserId,
        })
        .select()
        .single()

      if (error) throw error

      // Add creator as admin member
      await (supabase.from('group_members') as any).insert({
        group_id: data.id,
        user_id: currentUserId,
        role: 'admin',
      })

      // Reset form
      setNewName('')
      setNewDescription('')
      setNewCategory('general')
      setNewNeighborhood(null)
      setNewIsPublic(true)
      setShowCreateModal(false)

      // Refresh
      fetchGroups()
    } catch {
      Alert.alert(t('common.error'), t('groups.createError'))
    } finally {
      setCreating(false)
    }
  }, [currentUserId, supabase, newName, newDescription, newCategory, newNeighborhood, newIsPublic, t, fetchGroups])

  // Filter by search
  const filteredMyGroups = useMemo(() => {
    if (!searchQuery.trim()) return myGroups
    const q = searchQuery.toLowerCase()
    return myGroups.filter((g) => g.name.toLowerCase().includes(q))
  }, [myGroups, searchQuery])

  const filteredSuggested = useMemo(() => {
    if (!searchQuery.trim()) return suggestedGroups
    const q = searchQuery.toLowerCase()
    return suggestedGroups.filter((g) => g.name.toLowerCase().includes(q))
  }, [suggestedGroups, searchQuery])

  // ── Render group card ──
  const renderGroupCard = useCallback((group: Group, isMine: boolean) => {
    const catColor = CATEGORY_COLORS[group.category] || colors.primary
    return (
      <PressableOpacity
        key={group.id}
        style={[s.groupCard, {
          backgroundColor: colors.card,
          borderColor: colors.border,
        }, isDark ? cardShadowDark : cardShadow]}
        onPress={() => router.push(`/groups/${group.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${group.name}, ${group.member_count} ${t('groups.members')}`}
      >
        <View style={[s.groupAvatar, { backgroundColor: catColor }]}>
          <Text style={[s.groupAvatarText, { color: colors.primaryForeground }]}>
            {(group.name || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={s.groupCardMiddle}>
          <Text style={[s.groupName, { color: colors.foreground }]} numberOfLines={1}>
            {group.name}
          </Text>
          <View style={s.groupMeta}>
            <Text style={[s.groupMetaText, { color: group.member_count <= 1 ? colors.primary : colors.mutedForeground }]}>
              {group.member_count <= 1 ? t('groups.inviteMembers') : `${group.member_count} ${t('groups.members')}`}
            </Text>
            {(group.new_post_count ?? 0) > 0 && (
              <Text style={[s.groupMetaText, { color: colors.accent }]}>
                {' '}{group.new_post_count} {t('groups.newPosts')}
              </Text>
            )}
          </View>
        </View>
        {isMine ? (
          <ChevronRight size={18} color={colors.mutedForeground} strokeWidth={1.8} />
        ) : (
          <Pressable
            style={[s.joinButton, { backgroundColor: colors.accent }]}
            onPress={() => {
              handleJoin(group)
            }}
            onStartShouldSetResponder={() => true}
            accessibilityRole="button"
            accessibilityLabel={t('groups.join')}
          >
            <Text style={[s.joinButtonText, { color: colors.accentForeground }]}>
              {t('groups.join')}
            </Text>
          </Pressable>
        )}
      </PressableOpacity>
    )
  }, [colors, isDark, t, router, handleJoin])

  // ── Coming soon empty state ──
  if (!loading && !tableExists) {
    return (
      <ScreenErrorBoundary screenName="Groups">
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <PressableOpacity onPress={() => router.back()} style={s.headerBack} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <ArrowLeft size={24} color={colors.foreground} />
          </PressableOpacity>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>
            {t('groups.title')}
          </Text>
          <View style={s.headerRight} />
        </View>
        <View style={s.emptyContainer}>
          <Users size={48} color={colors.mutedForeground} strokeWidth={1.3} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
            {t('groups.comingSoon')}
          </Text>
        </View>
      </View>
      </ScreenErrorBoundary>
    )
  }

  return (
    <ScreenErrorBoundary screenName="Groups">
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <PressableOpacity onPress={() => router.back()} style={s.headerBack} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={24} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>
          {t('groups.title')}
        </Text>
        <PressableOpacity onPress={() => setShowSearch(!showSearch)} style={s.headerBack} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.search')}>
          <Search size={20} color={colors.mutedForeground} strokeWidth={1.8} />
        </PressableOpacity>
      </View>

      {/* Search bar */}
      {showSearch && (
        <View style={[s.searchBar, { backgroundColor: colors.muted, borderBottomColor: colors.border }]}>
          <Search size={16} color={colors.mutedForeground} strokeWidth={1.8} />
          <TextInput
            style={[s.searchInput, { color: colors.foreground }]}
            placeholder={t('common.search')}
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoFocus
          />
          {searchQuery.length > 0 && (
            <PressableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
              <X size={16} color={colors.mutedForeground} strokeWidth={1.8} />
            </PressableOpacity>
          )}
        </View>
      )}

      {/* Content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {loading ? (
          <ScrollView style={s.scrollContent} contentContainerStyle={s.scrollContainer} keyboardShouldPersistTaps="handled">
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('groups.myGroups')}</Text>
            {[1, 2, 3].map((i) => <GroupSkeleton key={i} colors={colors} />)}
            <Text style={[s.sectionTitle, { color: colors.foreground, marginTop: 24 }]}>{t('groups.suggested')}</Text>
            {[4, 5].map((i) => <GroupSkeleton key={i} colors={colors} />)}
          </ScrollView>
        ) : (
          <ScrollView
            style={s.scrollContent}
            contentContainerStyle={[s.scrollContainer, { paddingBottom: insets.bottom + 80 }]}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
            }
          >
            {/* My groups */}
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>
              {t('groups.myGroups')}
            </Text>
            {filteredMyGroups.length === 0 ? (
              <View style={[s.emptySection, { backgroundColor: colors.card }]}>
                <Users size={28} color={colors.mutedForeground} strokeWidth={1.6} />
                <Text style={[s.emptySectionText, { color: colors.mutedForeground }]}>
                  {t('groups.noGroups')}
                </Text>
                <Text style={[s.emptySectionSub, { color: colors.mutedForeground }]}>
                  {t('groups.joinFirst')}
                </Text>
              </View>
            ) : (
              filteredMyGroups.map((g) => renderGroupCard(g, true))
            )}

            {/* Suggested */}
            <Text style={[s.sectionTitle, { color: colors.foreground, marginTop: 24 }]}>
              {t('groups.suggested')}
            </Text>
            {filteredSuggested.length === 0 ? (
              <View style={[s.emptySection, { backgroundColor: colors.card }]}>
                <Text style={[s.emptySectionText, { color: colors.mutedForeground }]}>
                  {t('groups.noSuggested')}
                </Text>
              </View>
            ) : (
              filteredSuggested.map((g) => renderGroupCard(g, false))
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* FAB */}
      <PressableOpacity
        style={[s.fab, { backgroundColor: colors.accent, bottom: insets.bottom + 20 }]}
        onPress={() => {
          try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {} // Intentional: haptics unavailable on some platforms
          setShowCreateModal(true)
        }}
        accessibilityRole="button"
        accessibilityLabel={t('groups.create')}
      >
        <Plus size={24} color={colors.accentForeground} strokeWidth={2} />
      </PressableOpacity>

      {/* Create Group Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
        <Pressable style={[s.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={() => setShowCreateModal(false)}>
          <Pressable style={[s.modalContent, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
            {/* Modal header */}
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.foreground }]}>
                {t('groups.create')}
              </Text>
              <PressableOpacity onPress={() => setShowCreateModal(false)} hitSlop={8}>
                <X size={22} color={colors.mutedForeground} strokeWidth={1.8} />
              </PressableOpacity>
            </View>

            <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Name */}
              <Text style={[s.inputLabel, { color: colors.foreground }]}>
                {t('groups.name')}
              </Text>
              <TextInput
                style={[s.textInput, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                placeholder={t('groups.name')}
                placeholderTextColor={colors.mutedForeground}
                value={newName}
                onChangeText={setNewName}
                maxLength={100}
              />

              {/* Description */}
              <Text style={[s.inputLabel, { color: colors.foreground }]}>
                {t('groups.description')}
              </Text>
              <TextInput
                style={[s.textArea, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
                placeholder={t('groups.description')}
                placeholderTextColor={colors.mutedForeground}
                value={newDescription}
                onChangeText={setNewDescription}
                multiline
                numberOfLines={3}
                maxLength={500}
                inputAccessoryViewID={KEYBOARD_DONE_ID}
              />

              {/* Category chips */}
              <Text style={[s.inputLabel, { color: colors.foreground }]}>
                {t('groups.category')}
              </Text>
              <View style={s.chipRow}>
                {GROUP_CATEGORIES.map((cat) => {
                  const isActive = newCategory === cat.key
                  return (
                    <PressableOpacity
                      key={cat.key}
                      style={[
                        s.chip,
                        {
                          backgroundColor: isActive ? cat.color : colors.muted,
                          borderColor: isActive ? cat.color : colors.border,
                        },
                      ]}
                      onPress={() => setNewCategory(cat.key)}
                    >
                      <Text style={[s.chipText, { color: isActive ? colors.primaryForeground : colors.foreground }]}>
                        {t(cat.labelKey)}
                      </Text>
                    </PressableOpacity>
                  )
                })}
              </View>

              {/* Neighborhood */}
              <Text style={[s.inputLabel, { color: colors.foreground }]}>
                {t('groups.neighborhood')}
              </Text>
              <PressableOpacity
                style={[s.textInput, s.pickerButton, { backgroundColor: colors.muted, borderColor: colors.border }]}
                onPress={() => setShowNeighborhoodPicker(true)}
              >
                <Text style={[s.pickerButtonText, { color: newNeighborhood ? colors.foreground : colors.mutedForeground }]}>
                  {newNeighborhood || t('groups.neighborhood')}
                </Text>
                <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.8} />
              </PressableOpacity>

              {/* Public/Private toggle */}
              <View style={s.toggleRow}>
                <View style={s.toggleInfo}>
                  {newIsPublic
                    ? <Globe size={18} color={colors.primary} strokeWidth={1.8} />
                    : <Lock size={18} color={colors.mutedForeground} strokeWidth={1.8} />
                  }
                  <Text style={[s.toggleLabel, { color: colors.foreground }]}>
                    {newIsPublic ? t('groups.public') : t('groups.private')}
                  </Text>
                </View>
                <Switch
                  value={newIsPublic}
                  onValueChange={setNewIsPublic}
                  trackColor={{ false: colors.muted, true: colors.primary }}
                  thumbColor={Platform.OS === 'android' ? colors.card : undefined}
                />
              </View>

              {/* Submit */}
              <PressableOpacity
                style={[s.submitButton, { backgroundColor: creating ? colors.muted : colors.accent }]}
                onPress={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color={colors.accentForeground} />
                ) : (
                  <Text style={[s.submitButtonText, { color: colors.accentForeground }]}>
                    {t('groups.create')}
                  </Text>
                )}
              </PressableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
        <KeyboardDoneAccessory />
      </Modal>

      {/* Neighborhood picker modal */}
      <Modal visible={showNeighborhoodPicker} animationType="slide" transparent onRequestClose={() => setShowNeighborhoodPicker(false)}>
        <Pressable style={[s.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={() => setShowNeighborhoodPicker(false)}>
          <Pressable style={[s.modalContent, { backgroundColor: colors.card, paddingBottom: insets.bottom + 20, maxHeight: '70%' }]} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.foreground }]}>
                {t('groups.neighborhood')}
              </Text>
              <PressableOpacity onPress={() => setShowNeighborhoodPicker(false)} hitSlop={8}>
                <X size={22} color={colors.mutedForeground} strokeWidth={1.8} />
              </PressableOpacity>
            </View>
            <FlatList
              data={NEIGHBORHOODS as readonly string[]}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <PressableOpacity
                  style={[s.neighborhoodItem, {
                    backgroundColor: newNeighborhood === item ? colors.muted : 'transparent',
                  }]}
                  onPress={() => {
                    setNewNeighborhood(item)
                    setShowNeighborhoodPicker(false)
                  }}
                >
                  <Text style={[s.neighborhoodText, {
                    color: newNeighborhood === item ? colors.primary : colors.foreground,
                  }]}>
                    {item}
                  </Text>
                </PressableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
    </ScreenErrorBoundary>
  )
}

// ── Styles ──
const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBack: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
  },
  headerRight: { width: 40 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
    paddingVertical: 4,
  },
  scrollContent: { flex: 1 },
  scrollContainer: { paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.headingSemi,
    marginBottom: 12,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  groupAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarText: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: fonts.heading,
  },
  groupCardMiddle: {
    flex: 1,
    gap: 2,
  },
  groupName: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.headingSemi,
  },
  groupMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupMetaText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
  },
  joinButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  joinButtonText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.bodySemi,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
  },
  emptySection: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 12,
    marginBottom: 8,
    gap: 8,
  },
  emptySectionText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
  },
  emptySectionSub: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: fonts.heading,
  },
  modalScroll: {
    paddingHorizontal: 20,
  },
  inputLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.bodySemi,
    marginBottom: 8,
    marginTop: 12,
  },
  textInput: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  textArea: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.bodyMedium,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerButtonText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingVertical: 4,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.bodyMedium,
  },
  submitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 20,
    marginBottom: 20,
    minHeight: 48,
  },
  submitButtonText: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.bodySemi,
  },
  neighborhoodItem: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  neighborhoodText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
  },
  // Skeleton
  skelCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  skelLine: {
    height: 10,
    borderRadius: 5,
  },
})
