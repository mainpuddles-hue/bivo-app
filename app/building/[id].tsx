declare const __DEV__: boolean

import { useState, useCallback, useRef, useMemo } from 'react'
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  TextInput, Modal, KeyboardAvoidingView, Platform, Alert, RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router'
import {
  Settings, Pin, ChevronUp, Plus,
  Droplets, Zap, Flame, ArrowUpDown, Building2, Trees, Shield, HelpCircle,
  X, AlertTriangle,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/components/Toast'
import { fonts, typeScale } from '@/lib/fonts'
import { useSupabase } from '@/hooks/useSupabase'
import { Avatar } from '@/components/Avatar'
import { BackButton, PressableOpacity } from '@/components/ui'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { formatTimeAgo } from '@/lib/format'
import { isValidUUID } from '@/lib/validation'
import { getCachedUserId } from '@/lib/authCache'
import type { ThemeColors } from '@/lib/theme'

// ── Types ──

type MemberRole = 'member' | 'board' | 'manager' | 'admin'
type AnnouncementPriority = 'normal' | 'important' | 'urgent'
type MaintenanceStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
type MaintenanceCategory = 'plumbing' | 'electrical' | 'heating' | 'elevator' | 'common_area' | 'outdoor' | 'security' | 'other'
type TabKey = 'announcements' | 'maintenance' | 'members' | 'rules'

interface Organization {
  id: string
  name: string
  street_address: string | null
  member_count: number
  rules_markdown: string | null
  neighborhood: string | null
  created_at: string
}

interface MemberProfile {
  id: string
  name: string
  avatar_url: string | null
}

interface OrgMember {
  org_id: string
  user_id: string
  role: MemberRole
  joined_at: string
  profiles: MemberProfile
}

interface Announcement {
  id: string
  org_id: string
  author_id: string
  title: string
  body: string
  priority: AnnouncementPriority
  pinned: boolean
  read_count: number
  created_at: string
  author: MemberProfile | null
}

interface MaintenanceRequest {
  id: string
  org_id: string
  reporter_id: string
  title: string
  description: string | null
  category: MaintenanceCategory
  status: MaintenanceStatus
  priority: string | null
  image_urls: string[] | null
  upvote_count: number
  created_at: string
  reporter: MemberProfile | null
}

// ── Constants ──

const TABS: TabKey[] = ['announcements', 'maintenance', 'members', 'rules']

const TAB_LABEL_KEYS: Record<TabKey, string> = {
  announcements: 'building.announcements',
  maintenance: 'building.maintenance',
  members: 'building.members',
  rules: 'building.rules',
}

const CATEGORY_ICONS: Record<MaintenanceCategory, typeof Droplets> = {
  plumbing: Droplets,
  electrical: Zap,
  heating: Flame,
  elevator: ArrowUpDown,
  common_area: Building2,
  outdoor: Trees,
  security: Shield,
  other: HelpCircle,
}

const CATEGORY_LABEL_KEYS: Record<MaintenanceCategory, string> = {
  plumbing: 'building.categoryPlumbing',
  electrical: 'building.categoryElectrical',
  heating: 'building.categoryHeating',
  elevator: 'building.categoryElevator',
  common_area: 'building.categoryCommonArea',
  outdoor: 'building.categoryOutdoor',
  security: 'building.categorySecurity',
  other: 'building.categoryOther',
}

const MAINTENANCE_CATEGORIES: MaintenanceCategory[] = [
  'plumbing', 'electrical', 'heating', 'elevator', 'common_area', 'outdoor', 'security', 'other',
]

const PRIORITY_OPTIONS: AnnouncementPriority[] = ['normal', 'important', 'urgent']

// ── Helpers ──

function getStatusColor(status: MaintenanceStatus, colors: ThemeColors): string {
  switch (status) {
    case 'open': return colors.success
    case 'in_progress': return colors.pro
    case 'resolved': return colors.info
    case 'closed': return colors.mutedForeground
  }
}

function getPriorityColor(priority: AnnouncementPriority, colors: ThemeColors): string {
  switch (priority) {
    case 'urgent': return colors.destructive
    case 'important': return colors.pro
    case 'normal': return colors.mutedForeground
  }
}

function getRoleBadgeLabel(role: MemberRole, t: (k: string) => string): string {
  switch (role) {
    case 'admin': return t('building.roleAdmin')
    case 'manager': return t('building.roleManager')
    case 'board': return t('building.roleBoard')
    default: return ''
  }
}

// ── Main Screen ──

function BuildingScreenInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const mountedRef = useRef(true)

  // ── State ──
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [myRole, setMyRole] = useState<MemberRole | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('announcements')

  // Data lists
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([])
  const [members, setMembers] = useState<OrgMember[]>([])

  // Modals
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false)

  // Announcement form
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [annPriority, setAnnPriority] = useState<AnnouncementPriority>('normal')
  const [annPinned, setAnnPinned] = useState(false)
  const [submittingAnn, setSubmittingAnn] = useState(false)

  // Maintenance form
  const [maintTitle, setMaintTitle] = useState('')
  const [maintDesc, setMaintDesc] = useState('')
  const [maintCategory, setMaintCategory] = useState<MaintenanceCategory>('other')
  const [submittingMaint, setSubmittingMaint] = useState(false)

  // Upvoting ref
  const upvotingRef = useRef(false)

  // ── Derived ──
  const isPrivileged = myRole === 'board' || myRole === 'manager' || myRole === 'admin'

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    if (!id || !isValidUUID(id)) {
      setLoading(false)
      return
    }
    try {
      const cachedId = await getCachedUserId()
      if (!mountedRef.current) return
      if (cachedId) setUserId(cachedId)

      // Parallel fetches
      const [orgResult, membersResult, annResult, maintResult] = await Promise.all([
        supabase.from('organizations').select('*').eq('id', id).maybeSingle(),
        (supabase.from('organization_members').select('*, profiles:profiles(id, name, avatar_url)') as any).eq('org_id', id),
        (supabase.from('announcements').select('*, author:profiles!announcements_author_id_fkey(id, name, avatar_url)') as any)
          .eq('org_id', id).order('pinned', { ascending: false }).order('created_at', { ascending: false }),
        (supabase.from('maintenance_requests').select('*, reporter:profiles!maintenance_requests_reporter_id_fkey(id, name, avatar_url)') as any)
          .eq('org_id', id).order('created_at', { ascending: false }),
      ])

      if (!mountedRef.current) return

      if (orgResult.error || !orgResult.data) {
        if (__DEV__) console.log('[building] org fetch error:', orgResult.error?.message)
        setLoading(false)
        return
      }

      setOrg(orgResult.data as Organization)
      const membersList = (membersResult.data ?? []) as OrgMember[]
      setMembers(membersList)
      setAnnouncements((annResult.data ?? []) as Announcement[])
      setMaintenanceRequests((maintResult.data ?? []) as MaintenanceRequest[])

      // Find current user's role
      if (cachedId) {
        const myMembership = membersList.find(m => m.user_id === cachedId)
        setMyRole(myMembership?.role ?? null)
      }
    } catch (err) {
      if (__DEV__) console.log('[building] error:', err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [id, supabase])

  useFocusEffect(useCallback(() => {
    mountedRef.current = true
    fetchData()
    return () => { mountedRef.current = false }
  }, [fetchData]))

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }, [fetchData])

  // ── Announcement submit ──
  const handleSubmitAnnouncement = useCallback(async () => {
    if (!annTitle.trim() || !annBody.trim() || !userId || !org) return
    setSubmittingAnn(true)
    try {
      const { error } = await (supabase.from('announcements') as any).insert({
        org_id: org.id,
        author_id: userId,
        title: annTitle.trim(),
        body: annBody.trim(),
        priority: annPriority,
        pinned: annPinned,
      })
      if (error) {
        toast.show({ message: t('common.error'), type: 'error' })
      } else {
        toast.show({ message: t('common.success'), type: 'success' })
        setShowAnnouncementModal(false)
        setAnnTitle('')
        setAnnBody('')
        setAnnPriority('normal')
        setAnnPinned(false)
        await fetchData()
      }
    } catch {
      toast.show({ message: t('common.error'), type: 'error' })
    } finally {
      setSubmittingAnn(false)
    }
  }, [annTitle, annBody, annPriority, annPinned, userId, org, supabase, t, toast, fetchData])

  // ── Maintenance submit ──
  const handleSubmitMaintenance = useCallback(async () => {
    if (!maintTitle.trim() || !userId || !org) return
    setSubmittingMaint(true)
    try {
      const { error } = await (supabase.from('maintenance_requests') as any).insert({
        org_id: org.id,
        reporter_id: userId,
        title: maintTitle.trim(),
        description: maintDesc.trim() || null,
        category: maintCategory,
        status: 'open',
      })
      if (error) {
        toast.show({ message: t('common.error'), type: 'error' })
      } else {
        toast.show({ message: t('common.success'), type: 'success' })
        setShowMaintenanceModal(false)
        setMaintTitle('')
        setMaintDesc('')
        setMaintCategory('other')
        await fetchData()
      }
    } catch {
      toast.show({ message: t('common.error'), type: 'error' })
    } finally {
      setSubmittingMaint(false)
    }
  }, [maintTitle, maintDesc, maintCategory, userId, org, supabase, t, toast, fetchData])

  // ── Upvote ──
  const handleUpvote = useCallback(async (requestId: string) => {
    if (!userId || upvotingRef.current) return
    upvotingRef.current = true
    try {
      // Optimistic update
      setMaintenanceRequests(prev =>
        prev.map(r => r.id === requestId ? { ...r, upvote_count: r.upvote_count + 1 } : r)
      )
      const { error } = await (supabase.from('maintenance_upvotes') as any)
        .insert({ request_id: requestId, user_id: userId })
      if (!error) {
        // Sync count to DB — count actual upvotes for accuracy
        const { count } = await (supabase.from('maintenance_upvotes') as any)
          .select('id', { count: 'exact', head: true })
          .eq('request_id', requestId)
        if (typeof count === 'number') {
          await (supabase.from('maintenance_requests') as any)
            .update({ upvote_count: count })
            .eq('id', requestId)
          // Sync local state with actual DB count
          setMaintenanceRequests(prev =>
            prev.map(r => r.id === requestId ? { ...r, upvote_count: count } : r)
          )
        }
      }
      if (error) {
        // Revert
        setMaintenanceRequests(prev =>
          prev.map(r => r.id === requestId ? { ...r, upvote_count: Math.max(0, r.upvote_count - 1) } : r)
        )
        if (error.code !== '23505') { // Not a duplicate
          toast.show({ message: t('common.error'), type: 'error' })
        }
      }
    } catch {
      // Revert on network error
      setMaintenanceRequests(prev =>
        prev.map(r => r.id === requestId ? { ...r, upvote_count: Math.max(0, r.upvote_count - 1) } : r)
      )
    } finally {
      upvotingRef.current = false
    }
  }, [userId, supabase, t, toast])

  // ── Mark announcement read ──
  const readAnnouncementsRef = useRef(new Set<string>())
  const handleMarkRead = useCallback(async (announcementId: string) => {
    if (!userId) return
    // Prevent duplicate increments for announcements already read this session
    if (readAnnouncementsRef.current.has(announcementId)) return
    readAnnouncementsRef.current.add(announcementId)
    try {
      const { error } = await (supabase.from('announcement_reads') as any)
        .upsert({ announcement_id: announcementId, user_id: userId }, { onConflict: 'announcement_id,user_id' })
      // Increment read count optimistically (only if this is a new read)
      if (!error) {
        setAnnouncements(prev =>
          prev.map(a => a.id === announcementId ? { ...a, read_count: a.read_count + 1 } : a)
        )
      }
    } catch {
      // Allow retry on error
      readAnnouncementsRef.current.delete(announcementId)
    }
  }, [userId, supabase])

  // ── Loading state ──
  if (loading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.foreground} />
      </View>
    )
  }

  if (!org) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={[s.emptyTitle, { color: colors.mutedForeground, fontFamily: fonts.body }]}>
          {t('common.error')}
        </Text>
      </View>
    )
  }

  // ── Sorted announcements (pinned first) ──
  const sortedAnnouncements = useMemo(() => {
    return [...announcements].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [announcements])

  // ── Render ──
  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <BackButton />
        <Text
          style={[s.headerTitle, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {org.name}
        </Text>
        {isPrivileged ? (
          <PressableOpacity
            onPress={() => {
              // Settings action — placeholder
              Alert.alert(t('building.buildingSettings'))
            }}
            accessibilityLabel={t('building.buildingSettings')}
          >
            <Settings size={22} color={colors.foreground} />
          </PressableOpacity>
        ) : (
          <View style={s.headerSpacer} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.foreground} />
        }
      >
        {/* Building info card */}
        <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {org.street_address ? (
            <Text style={[s.infoAddress, { color: colors.foreground }]}>{org.street_address}</Text>
          ) : null}
          <View style={s.infoRow}>
            <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>
              {t('building.memberCount', { count: members.length })}
            </Text>
            {org.neighborhood ? (
              <>
                <Text style={[s.infoDot, { color: colors.border }]}>{' \u00B7 '}</Text>
                <Text style={[s.infoLabel, { color: colors.mutedForeground }]}>{org.neighborhood}</Text>
              </>
            ) : null}
          </View>
        </View>

        {/* Segmented tabs */}
        <View style={[s.tabBar, { backgroundColor: colors.muted }]}>
          {TABS.map(tab => {
            const isActive = tab === activeTab
            return (
              <PressableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[
                  s.tabPill,
                  isActive && { backgroundColor: colors.card },
                  isActive && { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
                ]}
              >
                <Text
                  style={[
                    s.tabLabel,
                    { color: isActive ? colors.foreground : colors.mutedForeground },
                    isActive && { fontFamily: fonts.bodySemi },
                  ]}
                  numberOfLines={1}
                >
                  {t(TAB_LABEL_KEYS[tab])}
                </Text>
              </PressableOpacity>
            )
          })}
        </View>

        {/* Tab content */}
        {activeTab === 'announcements' && (
          <AnnouncementsTab
            announcements={sortedAnnouncements}
            colors={colors}
            t={t}
            locale={locale}
            onMarkRead={handleMarkRead}
          />
        )}
        {activeTab === 'maintenance' && (
          <MaintenanceTab
            requests={maintenanceRequests}
            colors={colors}
            t={t}
            locale={locale}
            onUpvote={handleUpvote}
          />
        )}
        {activeTab === 'members' && (
          <MembersTab
            members={members}
            colors={colors}
            t={t}
            router={router}
          />
        )}
        {activeTab === 'rules' && (
          <RulesTab
            rulesMarkdown={org.rules_markdown}
            colors={colors}
            t={t}
          />
        )}
      </ScrollView>

      {/* FAB */}
      {activeTab === 'announcements' && isPrivileged && (
        <PressableOpacity
          onPress={() => setShowAnnouncementModal(true)}
          style={[s.fab, { backgroundColor: colors.foreground, bottom: insets.bottom + 20 }]}
          accessibilityLabel={t('building.createAnnouncement')}
        >
          <Plus size={24} color={colors.primaryForeground} />
        </PressableOpacity>
      )}
      {activeTab === 'maintenance' && myRole != null && (
        <PressableOpacity
          onPress={() => setShowMaintenanceModal(true)}
          style={[s.fab, { backgroundColor: colors.foreground, bottom: insets.bottom + 20 }]}
          accessibilityLabel={t('building.createMaintenance')}
        >
          <Plus size={24} color={colors.primaryForeground} />
        </PressableOpacity>
      )}

      {/* Create Announcement Modal */}
      <CreateAnnouncementModal
        visible={showAnnouncementModal}
        onClose={() => { setShowAnnouncementModal(false); setAnnTitle(''); setAnnBody(''); setAnnPriority('normal'); setAnnPinned(false) }}
        colors={colors}
        t={t}
        title={annTitle}
        onTitleChange={setAnnTitle}
        body={annBody}
        onBodyChange={setAnnBody}
        priority={annPriority}
        onPriorityChange={setAnnPriority}
        pinned={annPinned}
        onPinnedChange={setAnnPinned}
        submitting={submittingAnn}
        onSubmit={handleSubmitAnnouncement}
      />

      {/* Create Maintenance Modal */}
      <CreateMaintenanceModal
        visible={showMaintenanceModal}
        onClose={() => { setShowMaintenanceModal(false); setMaintTitle(''); setMaintDesc(''); setMaintCategory('plumbing') }}
        colors={colors}
        t={t}
        title={maintTitle}
        onTitleChange={setMaintTitle}
        description={maintDesc}
        onDescriptionChange={setMaintDesc}
        category={maintCategory}
        onCategoryChange={setMaintCategory}
        submitting={submittingMaint}
        onSubmit={handleSubmitMaintenance}
      />
    </View>
  )
}

// ── Announcements Tab ──

function AnnouncementsTab({
  announcements,
  colors,
  t,
  locale,
  onMarkRead,
}: {
  announcements: Announcement[]
  colors: ThemeColors
  t: (k: string, p?: Record<string, string | number>) => string
  locale: string
  onMarkRead: (id: string) => void
}) {
  if (announcements.length === 0) {
    return (
      <View style={s.emptyState}>
        <Text style={[s.emptyTitle, { color: colors.mutedForeground }]}>{t('building.noAnnouncements')}</Text>
        <Text style={[s.emptyHint, { color: colors.tertiaryForeground }]}>{t('building.noAnnouncementsHint')}</Text>
      </View>
    )
  }

  return (
    <View style={s.listContainer}>
      {announcements.map(ann => (
        <PressableOpacity
          key={ann.id}
          onPress={() => onMarkRead(ann.id)}
          style={[s.announcementCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          {/* Top row: priority + pinned */}
          <View style={s.announcementTopRow}>
            <View style={s.badgeRow}>
              {ann.pinned && (
                <View style={[s.badge, { backgroundColor: colors.foreground }]}>
                  <Pin size={10} color={colors.primaryForeground} />
                  <Text style={[s.badgeText, { color: colors.primaryForeground }]}>{t('building.pinned')}</Text>
                </View>
              )}
              <View style={[s.badge, { backgroundColor: getPriorityColor(ann.priority, colors) + '18' }]}>
                {ann.priority === 'urgent' && <AlertTriangle size={10} color={getPriorityColor(ann.priority, colors)} />}
                <Text style={[s.badgeText, { color: getPriorityColor(ann.priority, colors) }]}>
                  {t(`building.priority${ann.priority.charAt(0).toUpperCase()}${ann.priority.slice(1)}`)}
                </Text>
              </View>
            </View>
          </View>

          {/* Title + body */}
          <Text style={[s.announcementTitle, { color: colors.foreground }]} numberOfLines={2}>
            {ann.title}
          </Text>
          <Text style={[s.announcementBody, { color: colors.mutedForeground }]} numberOfLines={2}>
            {ann.body}
          </Text>

          {/* Meta row */}
          <View style={s.metaRow}>
            <Text style={[s.metaText, { color: colors.tertiaryForeground }]}>
              {ann.author?.name ?? ''}
            </Text>
            <Text style={[s.metaDot, { color: colors.border }]}>{' \u00B7 '}</Text>
            <Text style={[s.metaText, { color: colors.tertiaryForeground }]}>
              {formatTimeAgo(ann.created_at, t, locale)}
            </Text>
            {ann.read_count > 0 && (
              <>
                <Text style={[s.metaDot, { color: colors.border }]}>{' \u00B7 '}</Text>
                <Text style={[s.metaText, { color: colors.tertiaryForeground }]}>
                  {t('building.readBy', { count: ann.read_count })}
                </Text>
              </>
            )}
          </View>
        </PressableOpacity>
      ))}
    </View>
  )
}

// ── Maintenance Tab ──

function MaintenanceTab({
  requests,
  colors,
  t,
  locale,
  onUpvote,
}: {
  requests: MaintenanceRequest[]
  colors: ThemeColors
  t: (k: string, p?: Record<string, string | number>) => string
  locale: string
  onUpvote: (id: string) => void
}) {
  if (requests.length === 0) {
    return (
      <View style={s.emptyState}>
        <Text style={[s.emptyTitle, { color: colors.mutedForeground }]}>{t('building.noMaintenance')}</Text>
        <Text style={[s.emptyHint, { color: colors.tertiaryForeground }]}>{t('building.noMaintenanceHint')}</Text>
      </View>
    )
  }

  return (
    <View style={s.listContainer}>
      {requests.map(req => {
        const CategoryIcon = CATEGORY_ICONS[req.category] ?? HelpCircle
        const statusKey = `building.status${req.status.charAt(0).toUpperCase()}${req.status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()).slice(1)}`
        const statusColor = getStatusColor(req.status, colors)

        return (
          <View key={req.id} style={[s.maintenanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.maintenanceTop}>
              {/* Category icon */}
              <View style={[s.categoryIconWrap, { backgroundColor: colors.muted }]}>
                <CategoryIcon size={18} color={colors.mutedForeground} />
              </View>

              {/* Content */}
              <View style={s.maintenanceContent}>
                <View style={s.maintenanceTitleRow}>
                  <Text style={[s.maintenanceTitle, { color: colors.foreground }]} numberOfLines={1}>
                    {req.title}
                  </Text>
                  <View style={[s.statusBadge, { backgroundColor: statusColor + '18' }]}>
                    <Text style={[s.statusBadgeText, { color: statusColor }]}>
                      {t(statusKey)}
                    </Text>
                  </View>
                </View>

                {req.description ? (
                  <Text style={[s.maintenanceDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {req.description}
                  </Text>
                ) : null}

                {/* Meta */}
                <View style={s.metaRow}>
                  <Text style={[s.metaText, { color: colors.tertiaryForeground }]}>
                    {req.reporter?.name ?? ''}
                  </Text>
                  <Text style={[s.metaDot, { color: colors.border }]}>{' \u00B7 '}</Text>
                  <Text style={[s.metaText, { color: colors.tertiaryForeground }]}>
                    {formatTimeAgo(req.created_at, t, locale)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Upvote */}
            <View style={s.upvoteRow}>
              <PressableOpacity onPress={() => onUpvote(req.id)} style={[s.upvoteBtn, { borderColor: colors.border }]}>
                <ChevronUp size={16} color={colors.mutedForeground} />
                <Text style={[s.upvoteCount, { color: colors.mutedForeground }]}>{req.upvote_count}</Text>
              </PressableOpacity>
              <Text style={[s.upvoteLabel, { color: colors.tertiaryForeground }]}>{t('building.upvote')}</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

// ── Members Tab ──

function MembersTab({
  members,
  colors,
  t,
  router,
}: {
  members: OrgMember[]
  colors: ThemeColors
  t: (k: string) => string
  router: ReturnType<typeof useRouter>
}) {
  if (members.length === 0) {
    return (
      <View style={s.emptyState}>
        <Text style={[s.emptyTitle, { color: colors.mutedForeground }]}>{t('building.noMembers')}</Text>
      </View>
    )
  }

  return (
    <View style={s.membersGrid}>
      {members.map(m => {
        const roleLabel = getRoleBadgeLabel(m.role, t)
        return (
          <PressableOpacity
            key={m.user_id}
            onPress={() => { if (isValidUUID(m.user_id)) router.push(`/profile/${m.user_id}`) }}
            style={s.memberCell}
          >
            <Avatar url={m.profiles.avatar_url} name={m.profiles.name} size={48} />
            <Text style={[s.memberName, { color: colors.foreground }]} numberOfLines={1}>
              {m.profiles.name}
            </Text>
            {roleLabel ? (
              <View style={[s.roleBadge, { backgroundColor: colors.foreground }]}>
                <Text style={[s.roleBadgeText, { color: colors.primaryForeground }]}>{roleLabel}</Text>
              </View>
            ) : null}
          </PressableOpacity>
        )
      })}
    </View>
  )
}

// ── Rules Tab ──

function RulesTab({
  rulesMarkdown,
  colors,
  t,
}: {
  rulesMarkdown: string | null
  colors: ThemeColors
  t: (k: string) => string
}) {
  if (!rulesMarkdown) {
    return (
      <View style={s.emptyState}>
        <Text style={[s.emptyTitle, { color: colors.mutedForeground }]}>{t('building.noRules')}</Text>
      </View>
    )
  }

  return (
    <View style={s.rulesContainer}>
      <Text style={[s.rulesText, { color: colors.foreground }]}>{rulesMarkdown}</Text>
    </View>
  )
}

// ── Create Announcement Modal ──

function CreateAnnouncementModal({
  visible,
  onClose,
  colors,
  t,
  title,
  onTitleChange,
  body,
  onBodyChange,
  priority,
  onPriorityChange,
  pinned,
  onPinnedChange,
  submitting,
  onSubmit,
}: {
  visible: boolean
  onClose: () => void
  colors: ThemeColors
  t: (k: string) => string
  title: string
  onTitleChange: (v: string) => void
  body: string
  onBodyChange: (v: string) => void
  priority: AnnouncementPriority
  onPriorityChange: (v: AnnouncementPriority) => void
  pinned: boolean
  onPinnedChange: (v: boolean) => void
  submitting: boolean
  onSubmit: () => void
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.modalOverlay}
      >
        <View style={[s.modalContent, { backgroundColor: colors.card }]}>
          {/* Modal header */}
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>
              {t('building.createAnnouncement')}
            </Text>
            <PressableOpacity onPress={onClose} accessibilityLabel={t('common.close')}>
              <X size={22} color={colors.mutedForeground} />
            </PressableOpacity>
          </View>

          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            {/* Title input */}
            <Text style={[s.inputLabel, { color: colors.foreground }]}>{t('building.announcementTitle')}</Text>
            <TextInput
              style={[s.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={title}
              onChangeText={onTitleChange}
              placeholder={t('building.announcementTitle')}
              placeholderTextColor={colors.tertiaryForeground}
              maxLength={200}
            />

            {/* Body input */}
            <Text style={[s.inputLabel, { color: colors.foreground }]}>{t('building.announcementBody')}</Text>
            <TextInput
              style={[s.textInput, s.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={body}
              onChangeText={onBodyChange}
              placeholder={t('building.announcementBody')}
              placeholderTextColor={colors.tertiaryForeground}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={2000}
            />

            {/* Priority picker */}
            <Text style={[s.inputLabel, { color: colors.foreground }]}>{t('building.announcementPriority')}</Text>
            <View style={s.priorityRow}>
              {PRIORITY_OPTIONS.map(opt => {
                const isActive = opt === priority
                const color = getPriorityColor(opt, colors)
                return (
                  <PressableOpacity
                    key={opt}
                    onPress={() => onPriorityChange(opt)}
                    style={[
                      s.priorityPill,
                      { borderColor: isActive ? color : colors.border },
                      isActive && { backgroundColor: color + '18' },
                    ]}
                  >
                    <Text style={[s.priorityPillText, { color: isActive ? color : colors.mutedForeground }]}>
                      {t(`building.priority${opt.charAt(0).toUpperCase()}${opt.slice(1)}`)}
                    </Text>
                  </PressableOpacity>
                )
              })}
            </View>

            {/* Pinned toggle */}
            <PressableOpacity
              onPress={() => onPinnedChange(!pinned)}
              style={[s.pinnedToggle, { borderColor: colors.border }]}
            >
              <Pin size={16} color={pinned ? colors.foreground : colors.mutedForeground} />
              <Text style={[s.pinnedToggleText, { color: pinned ? colors.foreground : colors.mutedForeground }]}>
                {t('building.pinned')}
              </Text>
              <View style={[s.checkCircle, pinned && { backgroundColor: colors.foreground }]}>
                {pinned && <Text style={{ color: colors.primaryForeground, fontSize: 10 }}>{'\u2713'}</Text>}
              </View>
            </PressableOpacity>
          </ScrollView>

          {/* Submit button */}
          <View style={[s.modalFooter, { borderTopColor: colors.border }]}>
            <PressableOpacity
              onPress={onSubmit}
              disabled={submitting || !title.trim() || !body.trim()}
              style={[
                s.submitBtn,
                { backgroundColor: colors.foreground },
                (submitting || !title.trim() || !body.trim()) && { opacity: 0.4 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[s.submitBtnText, { color: colors.primaryForeground }]}>
                  {t('building.createAnnouncement')}
                </Text>
              )}
            </PressableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ── Create Maintenance Modal ──

function CreateMaintenanceModal({
  visible,
  onClose,
  colors,
  t,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  category,
  onCategoryChange,
  submitting,
  onSubmit,
}: {
  visible: boolean
  onClose: () => void
  colors: ThemeColors
  t: (k: string) => string
  title: string
  onTitleChange: (v: string) => void
  description: string
  onDescriptionChange: (v: string) => void
  category: MaintenanceCategory
  onCategoryChange: (v: MaintenanceCategory) => void
  submitting: boolean
  onSubmit: () => void
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.modalOverlay}
      >
        <View style={[s.modalContent, { backgroundColor: colors.card }]}>
          {/* Modal header */}
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>
              {t('building.createMaintenance')}
            </Text>
            <PressableOpacity onPress={onClose} accessibilityLabel={t('common.close')}>
              <X size={22} color={colors.mutedForeground} />
            </PressableOpacity>
          </View>

          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            {/* Title */}
            <Text style={[s.inputLabel, { color: colors.foreground }]}>{t('building.maintenanceTitle')}</Text>
            <TextInput
              style={[s.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={title}
              onChangeText={onTitleChange}
              placeholder={t('building.maintenanceTitle')}
              placeholderTextColor={colors.tertiaryForeground}
              maxLength={200}
            />

            {/* Description */}
            <Text style={[s.inputLabel, { color: colors.foreground }]}>{t('building.maintenanceDescription')}</Text>
            <TextInput
              style={[s.textInput, s.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={description}
              onChangeText={onDescriptionChange}
              placeholder={t('building.maintenanceDescription')}
              placeholderTextColor={colors.tertiaryForeground}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={2000}
            />

            {/* Category picker */}
            <Text style={[s.inputLabel, { color: colors.foreground }]}>{t('building.maintenanceCategory')}</Text>
            <View style={s.categoryGrid}>
              {MAINTENANCE_CATEGORIES.map(cat => {
                const Icon = CATEGORY_ICONS[cat]
                const isActive = cat === category
                return (
                  <PressableOpacity
                    key={cat}
                    onPress={() => onCategoryChange(cat)}
                    style={[
                      s.categoryChip,
                      { borderColor: isActive ? colors.foreground : colors.border },
                      isActive && { backgroundColor: colors.foreground + '0A' },
                    ]}
                  >
                    <Icon size={14} color={isActive ? colors.foreground : colors.mutedForeground} />
                    <Text
                      style={[
                        s.categoryChipText,
                        { color: isActive ? colors.foreground : colors.mutedForeground },
                      ]}
                      numberOfLines={1}
                    >
                      {t(CATEGORY_LABEL_KEYS[cat])}
                    </Text>
                  </PressableOpacity>
                )
              })}
            </View>
          </ScrollView>

          {/* Submit */}
          <View style={[s.modalFooter, { borderTopColor: colors.border }]}>
            <PressableOpacity
              onPress={onSubmit}
              disabled={submitting || !title.trim()}
              style={[
                s.submitBtn,
                { backgroundColor: colors.foreground },
                (submitting || !title.trim()) && { opacity: 0.4 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[s.submitBtnText, { color: colors.primaryForeground }]}>
                  {t('building.createMaintenance')}
                </Text>
              )}
            </PressableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ── Default export with error boundary ──

export default function BuildingScreen() {
  return (
    <ScreenErrorBoundary screenName="building">
      <BuildingScreenInner />
    </ScreenErrorBoundary>
  )
}

// ── Styles ──

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.display,
    ...typeScale.titleLarge,
  },
  headerSpacer: {
    width: 22,
  },

  // Info card
  infoCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoAddress: {
    fontFamily: fonts.bodySemi,
    ...typeScale.body,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoLabel: {
    fontFamily: fonts.body,
    ...typeScale.bodySmall,
  },
  infoDot: {
    fontFamily: fonts.body,
    ...typeScale.bodySmall,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  tabPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontFamily: fonts.body,
    ...typeScale.caption,
    textAlign: 'center',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontFamily: fonts.bodySemi,
    ...typeScale.body,
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyHint: {
    fontFamily: fonts.body,
    ...typeScale.bodySmall,
    textAlign: 'center',
  },

  // List container
  listContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },

  // Announcement card
  announcementCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  announcementTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: fonts.bodySemi,
    ...typeScale.caption,
  },
  announcementTitle: {
    fontFamily: fonts.bodySemi,
    ...typeScale.bodyLarge,
    marginBottom: 4,
  },
  announcementBody: {
    fontFamily: fonts.body,
    ...typeScale.body,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaText: {
    fontFamily: fonts.body,
    ...typeScale.caption,
  },
  metaDot: {
    fontFamily: fonts.body,
    ...typeScale.caption,
  },

  // Maintenance card
  maintenanceCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  maintenanceTop: {
    flexDirection: 'row',
    gap: 12,
  },
  categoryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  maintenanceContent: {
    flex: 1,
  },
  maintenanceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  maintenanceTitle: {
    flex: 1,
    fontFamily: fonts.bodySemi,
    ...typeScale.body,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontFamily: fonts.bodySemi,
    ...typeScale.caption,
  },
  maintenanceDesc: {
    fontFamily: fonts.body,
    ...typeScale.bodySmall,
    marginBottom: 6,
  },

  // Upvote
  upvoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8EAEC20',
  },
  upvoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  upvoteCount: {
    fontFamily: fonts.bodySemi,
    ...typeScale.caption,
  },
  upvoteLabel: {
    fontFamily: fonts.body,
    ...typeScale.caption,
  },

  // Members grid
  membersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  memberCell: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  memberName: {
    fontFamily: fonts.body,
    ...typeScale.caption,
    marginTop: 6,
    textAlign: 'center',
  },
  roleBadge: {
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
  },
  roleBadgeText: {
    fontFamily: fonts.bodySemi,
    fontSize: 9,
    lineHeight: 12,
  },

  // Rules
  rulesContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  rulesText: {
    fontFamily: fonts.body,
    ...typeScale.body,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontFamily: fonts.display,
    ...typeScale.subtitle,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },

  // Form inputs
  inputLabel: {
    fontFamily: fonts.bodySemi,
    ...typeScale.bodySmall,
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    fontFamily: fonts.body,
    ...typeScale.body,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textArea: {
    minHeight: 100,
  },

  // Priority row
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  priorityPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  priorityPillText: {
    fontFamily: fonts.bodySemi,
    ...typeScale.bodySmall,
  },

  // Pinned toggle
  pinnedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 10,
  },
  pinnedToggleText: {
    flex: 1,
    fontFamily: fonts.body,
    ...typeScale.body,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Category grid
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  categoryChipText: {
    fontFamily: fonts.body,
    ...typeScale.bodySmall,
  },

  // Submit button
  submitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontFamily: fonts.bodySemi,
    ...typeScale.body,
  },
})
