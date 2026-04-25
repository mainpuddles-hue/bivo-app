declare const __DEV__: boolean

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import {
  Droplets,
  Zap,
  Flame,
  ArrowUpDown,
  Building2,
  Trees,
  Shield,
  HelpCircle,
  ThumbsUp,
  Send,
  AlertCircle,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useToast } from '@/components/Toast'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts, typeScale } from '@/lib/fonts'
import { formatTimeAgo } from '@/lib/format'
import { getCachedUserId } from '@/lib/authCache'
import { getImageUrl } from '@/lib/imageUtils'
import { Avatar } from '@/components/Avatar'
import { BackButton, PressableOpacity } from '@/components/ui'
import { getShadow } from '@/lib/shadows'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { isValidUUID } from '@/lib/validation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MaintenanceStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
type MaintenanceCategory =
  | 'plumbing'
  | 'electrical'
  | 'heating'
  | 'elevator'
  | 'common_area'
  | 'outdoor'
  | 'security'
  | 'other'

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
  assigned_to: string | null
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null
  upvote_count: number
  created_at: string
  reporter?: {
    id: string
    name: string | null
    avatar_url: string | null
  }
}

interface MaintenanceComment {
  id: string
  request_id: string
  author_id: string
  body: string
  is_official: boolean
  created_at: string
  author?: {
    id: string
    name: string | null
    avatar_url: string | null
  }
}

type UserRole = 'admin' | 'manager' | 'board' | 'member' | null

// ---------------------------------------------------------------------------
// Category icon map
// ---------------------------------------------------------------------------

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

const CATEGORY_TRANSLATION_KEYS: Record<MaintenanceCategory, string> = {
  plumbing: 'building.categoryPlumbing',
  electrical: 'building.categoryElectrical',
  heating: 'building.categoryHeating',
  elevator: 'building.categoryElevator',
  common_area: 'building.categoryCommonArea',
  outdoor: 'building.categoryOutdoor',
  security: 'building.categorySecurity',
  other: 'building.categoryOther',
}

const STATUS_TRANSLATION_KEYS: Record<MaintenanceStatus, string> = {
  open: 'building.statusOpen',
  in_progress: 'building.statusInProgress',
  resolved: 'building.statusResolved',
  closed: 'building.statusClosed',
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

function MaintenanceDetailInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  // State
  const [request, setRequest] = useState<MaintenanceRequest | null>(null)
  const [comments, setComments] = useState<MaintenanceComment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<UserRole>(null)
  const [hasUpvoted, setHasUpvoted] = useState(false)
  const [upvoteCount, setUpvoteCount] = useState(0)
  const [commentText, setCommentText] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [showResolutionInput, setShowResolutionInput] = useState(false)
  const [resolutionNote, setResolutionNote] = useState('')

  const upvotingRef = useRef(false)

  // ------- Helpers -------

  const isManager = userRole === 'admin' || userRole === 'manager' || userRole === 'board'

  const statusColor = useMemo(() => {
    if (!request) return colors.mutedForeground
    switch (request.status) {
      case 'open':
        return colors.info
      case 'in_progress':
        return colors.secondary
      case 'resolved':
        return colors.success
      case 'closed':
        return colors.mutedForeground
    }
  }, [request?.status, colors])

  // ------- Data loading -------

  const loadData = useCallback(async () => {
    if (!id || !isValidUUID(id)) return
    try {
      const uid = await getCachedUserId()
      if (mountedRef.current) setUserId(uid)

      // Fetch request with reporter profile
      const { data: req, error: reqError } = await (supabase
        .from('maintenance_requests') as any)
        .select('*, reporter:profiles!reporter_id(id, name, avatar_url)')
        .eq('id', id)
        .single() as { data: any; error: any }

      if (reqError || !req) {
        if (mountedRef.current) {
          setLoading(false)
          toast.show({ message: t('building.errorLoadingRequest'), type: 'error' })
        }
        return
      }

      if (mountedRef.current) {
        setRequest(req as MaintenanceRequest)
        setUpvoteCount(req.upvote_count ?? 0)
      }

      // Fetch comments with author profiles
      const { data: cmts } = await (supabase
        .from('maintenance_comments') as any)
        .select('*, author:profiles!author_id(id, name, avatar_url)')
        .eq('request_id', id)
        .order('created_at', { ascending: true }) as { data: any[] | null; error: any }

      if (mountedRef.current && cmts) {
        setComments(cmts as MaintenanceComment[])
      }

      // Fetch user role in the organization
      if (uid && req.org_id) {
        const { data: membership } = await (supabase
          .from('organization_members') as any)
          .select('role')
          .eq('org_id', req.org_id)
          .eq('user_id', uid)
          .single() as { data: any; error: any }

        if (mountedRef.current && membership) {
          setUserRole(membership.role as UserRole)
        }
      }

      // Check if user has upvoted
      if (uid) {
        const { data: upvoteData } = await (supabase
          .from('maintenance_upvotes') as any)
          .select('id')
          .eq('request_id', id)
          .eq('user_id', uid)
          .maybeSingle() as { data: any; error: any }

        if (mountedRef.current) {
          setHasUpvoted(!!upvoteData)
        }
      }
    } catch (err) {
      if (__DEV__) console.warn('[MaintenanceDetail] loadData error:', err)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [id, supabase, t, toast])

  useEffect(() => { loadData() }, [loadData])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    loadData()
  }, [loadData])

  // ------- Upvote -------

  const handleUpvote = useCallback(async () => {
    if (!userId || !id || upvotingRef.current) return
    upvotingRef.current = true
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    const wasUpvoted = hasUpvoted
    const prevCount = upvoteCount

    // Optimistic update
    setHasUpvoted(!wasUpvoted)
    setUpvoteCount(wasUpvoted ? prevCount - 1 : prevCount + 1)

    try {
      if (wasUpvoted) {
        await (supabase.from('maintenance_upvotes') as any)
          .delete()
          .eq('request_id', id)
          .eq('user_id', userId)
        await (supabase.from('maintenance_requests') as any)
          .update({ upvote_count: Math.max(0, prevCount - 1) })
          .eq('id', id)
      } else {
        await (supabase.from('maintenance_upvotes') as any)
          .insert({ request_id: id, user_id: userId })
        await (supabase.from('maintenance_requests') as any)
          .update({ upvote_count: prevCount + 1 })
          .eq('id', id)
      }
    } catch {
      // Revert on failure
      if (mountedRef.current) {
        setHasUpvoted(wasUpvoted)
        setUpvoteCount(prevCount)
      }
    } finally {
      upvotingRef.current = false
    }
  }, [userId, id, hasUpvoted, upvoteCount, supabase])

  // ------- Status actions -------

  const updateStatus = useCallback(async (newStatus: MaintenanceStatus, note?: string) => {
    if (!id || updatingStatus) return
    setUpdatingStatus(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    try {
      const updatePayload: Record<string, unknown> = { status: newStatus }
      if (newStatus === 'resolved' && note) {
        updatePayload.resolution_note = note
        updatePayload.resolved_at = new Date().toISOString()
        updatePayload.resolved_by = userId
      }

      const { error } = await (supabase.from('maintenance_requests') as any)
        .update(updatePayload)
        .eq('id', id)

      if (error) throw error

      if (mountedRef.current) {
        setRequest(prev => prev ? { ...prev, ...updatePayload as Partial<MaintenanceRequest> } : prev)
        setShowResolutionInput(false)
        setResolutionNote('')
        toast.show({ message: t('building.statusUpdated'), type: 'success' })
      }
    } catch {
      if (mountedRef.current) {
        toast.show({ message: t('building.errorUpdatingStatus'), type: 'error' })
      }
    } finally {
      if (mountedRef.current) setUpdatingStatus(false)
    }
  }, [id, userId, updatingStatus, supabase, t, toast])

  // ------- Add comment -------

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim() || !userId || !id || sendingComment) return
    setSendingComment(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    try {
      const { data, error } = await (supabase.from('maintenance_comments') as any)
        .insert({
          request_id: id,
          author_id: userId,
          body: commentText.trim(),
          is_official: isManager,
        })
        .select('*, author:profiles!author_id(id, name, avatar_url)')
        .single()

      if (error) throw error

      if (mountedRef.current && data) {
        setComments(prev => [...prev, data as unknown as MaintenanceComment])
        setCommentText('')
        toast.show({ message: t('building.commentAdded'), type: 'success' })
      }
    } catch {
      if (mountedRef.current) {
        toast.show({ message: t('building.errorAddingComment'), type: 'error' })
      }
    } finally {
      if (mountedRef.current) setSendingComment(false)
    }
  }, [commentText, userId, id, sendingComment, isManager, supabase, t, toast])

  // ------- Render -------

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!request) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <AlertCircle size={48} color={colors.mutedForeground} />
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
          {t('building.errorLoadingRequest')}
        </Text>
      </View>
    )
  }

  const CategoryIcon = CATEGORY_ICONS[request.category] || HelpCircle

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <BackButton />
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {t('building.maintenanceRequest')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* Status + Category badges */}
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: `${statusColor}18` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {t(STATUS_TRANSLATION_KEYS[request.status])}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.muted }]}>
            <CategoryIcon size={14} color={colors.mutedForeground} />
            <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
              {t(CATEGORY_TRANSLATION_KEYS[request.category])}
            </Text>
          </View>
        </View>

        {/* Content card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, getShadow(isDark, 'sm')]}>
          {/* Title */}
          <Text style={[styles.title, { color: colors.foreground }]}>
            {request.title}
          </Text>

          {/* Reporter */}
          <View style={styles.reporterRow}>
            <Avatar
              url={request.reporter?.avatar_url}
              name={request.reporter?.name}
              size={32}
            />
            <View style={styles.reporterInfo}>
              <Text style={[styles.reporterName, { color: colors.foreground }]}>
                {request.reporter?.name ?? t('building.reporter')}
              </Text>
              <Text style={[styles.reporterTime, { color: colors.mutedForeground }]}>
                {formatTimeAgo(request.created_at, t, locale)}
              </Text>
            </View>
          </View>

          {/* Description */}
          {request.description ? (
            <Text style={[styles.description, { color: colors.foreground }]}>
              {request.description}
            </Text>
          ) : null}

          {/* Images */}
          {request.image_urls && request.image_urls.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.imageScroll}
              style={styles.imageScrollContainer}
            >
              {request.image_urls.map((url, index) => (
                <Image
                  key={`img-${index}`}
                  source={{ uri: getImageUrl(url, 'medium')! }}
                  style={[styles.image, { borderColor: colors.border }]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              ))}
            </ScrollView>
          ) : null}

          {/* Resolution note */}
          {request.resolution_note && (request.status === 'resolved' || request.status === 'closed') ? (
            <View style={[styles.resolutionBox, { backgroundColor: `${colors.success}10`, borderColor: `${colors.success}30` }]}>
              <Text style={[styles.resolutionLabel, { color: colors.success }]}>
                {t('building.resolutionNote')}
              </Text>
              <Text style={[styles.resolutionText, { color: colors.foreground }]}>
                {request.resolution_note}
              </Text>
            </View>
          ) : null}

          {/* Upvote */}
          <View style={styles.upvoteRow}>
            <PressableOpacity
              onPress={handleUpvote}
              style={[
                styles.upvoteButton,
                {
                  backgroundColor: hasUpvoted ? `${colors.primary}10` : colors.muted,
                  borderColor: hasUpvoted ? colors.primary : colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('building.upvote')}
            >
              <ThumbsUp
                size={16}
                color={hasUpvoted ? colors.primary : colors.mutedForeground}
                fill={hasUpvoted ? colors.primary : 'none'}
              />
              <Text
                style={[
                  styles.upvoteText,
                  { color: hasUpvoted ? colors.primary : colors.mutedForeground },
                ]}
              >
                {hasUpvoted ? t('building.upvoted') : t('building.upvote')}
              </Text>
              {upvoteCount > 0 ? (
                <Text
                  style={[
                    styles.upvoteCount,
                    { color: hasUpvoted ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {upvoteCount}
                </Text>
              ) : null}
            </PressableOpacity>
          </View>
        </View>

        {/* Status actions (manager/board/admin only) */}
        {isManager && request.status !== 'closed' ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, getShadow(isDark, 'sm')]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {t('building.managerTools')}
            </Text>
            <View style={styles.actionButtons}>
              {request.status === 'open' ? (
                <PressableOpacity
                  onPress={() => updateStatus('in_progress')}
                  disabled={updatingStatus}
                  style={[styles.actionButton, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('building.takeInProgress')}
                >
                  {updatingStatus ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <Text style={[styles.actionButtonText, { color: colors.primaryForeground }]}>
                      {t('building.takeInProgress')}
                    </Text>
                  )}
                </PressableOpacity>
              ) : null}

              {request.status === 'open' || request.status === 'in_progress' ? (
                <PressableOpacity
                  onPress={() => setShowResolutionInput(true)}
                  disabled={updatingStatus}
                  style={[styles.actionButton, { backgroundColor: colors.success }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('building.resolveRequest')}
                >
                  <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>
                    {t('building.resolveRequest')}
                  </Text>
                </PressableOpacity>
              ) : null}

              <PressableOpacity
                onPress={() => updateStatus('closed')}
                disabled={updatingStatus}
                style={[styles.actionButtonOutline, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={t('building.closeRequest')}
              >
                <Text style={[styles.actionButtonOutlineText, { color: colors.mutedForeground }]}>
                  {t('building.closeRequest')}
                </Text>
              </PressableOpacity>
            </View>

            {/* Resolution note input */}
            {showResolutionInput ? (
              <View style={styles.resolutionInputContainer}>
                <TextInput
                  style={[
                    styles.resolutionInput,
                    {
                      color: colors.foreground,
                      backgroundColor: colors.muted,
                      borderColor: colors.borderStrong,
                    },
                  ]}
                  placeholder={t('building.resolutionNotePlaceholder')}
                  placeholderTextColor={colors.tertiaryForeground}
                  value={resolutionNote}
                  onChangeText={setResolutionNote}
                  multiline
                  textAlignVertical="top"
                />
                <View style={styles.resolutionActions}>
                  <PressableOpacity
                    onPress={() => {
                      setShowResolutionInput(false)
                      setResolutionNote('')
                    }}
                    style={[styles.resolutionCancelButton, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.resolutionCancelText, { color: colors.mutedForeground }]}>
                      {t('building.cancel')}
                    </Text>
                  </PressableOpacity>
                  <PressableOpacity
                    onPress={() => updateStatus('resolved', resolutionNote)}
                    disabled={updatingStatus}
                    style={[styles.resolutionConfirmButton, { backgroundColor: colors.success }]}
                  >
                    {updatingStatus ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={[styles.resolutionConfirmText]}>
                        {t('building.confirm')}
                      </Text>
                    )}
                  </PressableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Comments section */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, getShadow(isDark, 'sm')]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {t('building.comments')}
            {comments.length > 0 ? ` (${comments.length})` : ''}
          </Text>

          {comments.length === 0 ? (
            <View style={styles.emptyComments}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {t('building.noComments')}
              </Text>
              <Text style={[styles.emptyHint, { color: colors.tertiaryForeground }]}>
                {t('building.noCommentsHint')}
              </Text>
            </View>
          ) : (
            comments.map(comment => (
              <View
                key={comment.id}
                style={[
                  styles.commentItem,
                  comment.is_official && {
                    borderLeftWidth: 3,
                    borderLeftColor: colors.primary,
                    paddingLeft: 12,
                  },
                ]}
              >
                <View style={styles.commentHeader}>
                  <Avatar
                    url={comment.author?.avatar_url}
                    name={comment.author?.name}
                    size={28}
                  />
                  <View style={styles.commentMeta}>
                    <View style={styles.commentNameRow}>
                      <Text style={[styles.commentAuthor, { color: colors.foreground }]} numberOfLines={1}>
                        {comment.author?.name ?? ''}
                      </Text>
                      {comment.is_official ? (
                        <View style={[styles.officialBadge, { backgroundColor: `${colors.primary}10` }]}>
                          <Text style={[styles.officialBadgeText, { color: colors.primary }]}>
                            {t('building.officialResponse')}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.commentTime, { color: colors.tertiaryForeground }]}>
                      {formatTimeAgo(comment.created_at, t, locale)}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.commentBody, { color: colors.foreground }]}>
                  {comment.body}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Comment input (sticky bottom) */}
      <View
        style={[
          styles.commentInputContainer,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + 8,
          },
          getShadow(isDark, 'sm'),
        ]}
      >
        <TextInput
          style={[
            styles.commentInput,
            {
              color: colors.foreground,
              backgroundColor: colors.muted,
              borderColor: colors.border,
            },
          ]}
          placeholder={t('building.writeComment')}
          placeholderTextColor={colors.tertiaryForeground}
          value={commentText}
          onChangeText={setCommentText}
          multiline
          maxLength={2000}
        />
        <PressableOpacity
          onPress={handleAddComment}
          disabled={!commentText.trim() || sendingComment}
          style={[
            styles.sendButton,
            {
              backgroundColor: commentText.trim() ? colors.primary : colors.muted,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('building.addComment')}
        >
          {sendingComment ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Send
              size={18}
              color={commentText.trim() ? colors.primaryForeground : colors.tertiaryForeground}
            />
          )}
        </PressableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontFamily: fonts.body,
    ...typeScale.body,
    textAlign: 'center',
    marginTop: 8,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontFamily: fonts.display,
    ...typeScale.subtitle,
    textAlign: 'center',
  },
  headerRight: {
    width: 36,
  },

  // Scroll content
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },

  // Badges
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  badgeText: {
    fontFamily: fonts.bodySemi,
    ...typeScale.caption,
  },

  // Card
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 16,
  },

  // Title
  title: {
    fontFamily: fonts.display,
    ...typeScale.titleLarge,
  },

  // Reporter
  reporterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reporterInfo: {
    flex: 1,
    gap: 2,
  },
  reporterName: {
    fontFamily: fonts.bodySemi,
    ...typeScale.body,
  },
  reporterTime: {
    fontFamily: fonts.body,
    ...typeScale.caption,
  },

  // Description
  description: {
    fontFamily: fonts.body,
    ...typeScale.body,
  },

  // Images
  imageScrollContainer: {
    marginHorizontal: -16,
  },
  imageScroll: {
    paddingHorizontal: 16,
    gap: 10,
  },
  image: {
    width: 200,
    height: 150,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },

  // Resolution note
  resolutionBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  resolutionLabel: {
    fontFamily: fonts.bodySemi,
    ...typeScale.caption,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  resolutionText: {
    fontFamily: fonts.body,
    ...typeScale.body,
  },

  // Upvote
  upvoteRow: {
    flexDirection: 'row',
  },
  upvoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  upvoteText: {
    fontFamily: fonts.bodySemi,
    ...typeScale.bodySmall,
  },
  upvoteCount: {
    fontFamily: fonts.bodySemi,
    ...typeScale.bodySmall,
  },

  // Section title
  sectionTitle: {
    fontFamily: fonts.display,
    ...typeScale.subtitle,
  },

  // Action buttons
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  actionButtonText: {
    fontFamily: fonts.bodySemi,
    ...typeScale.body,
  },
  actionButtonOutline: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  actionButtonOutlineText: {
    fontFamily: fonts.bodySemi,
    ...typeScale.body,
  },

  // Resolution input
  resolutionInputContainer: {
    gap: 10,
  },
  resolutionInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontFamily: fonts.body,
    ...typeScale.body,
    minHeight: 80,
  },
  resolutionActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  resolutionCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  resolutionCancelText: {
    fontFamily: fonts.bodySemi,
    ...typeScale.bodySmall,
  },
  resolutionConfirmButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  resolutionConfirmText: {
    fontFamily: fonts.bodySemi,
    ...typeScale.bodySmall,
    color: '#FFFFFF',
  },

  // Comments
  emptyComments: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 4,
  },
  emptyText: {
    fontFamily: fonts.bodyMedium,
    ...typeScale.body,
  },
  emptyHint: {
    fontFamily: fonts.body,
    ...typeScale.caption,
  },
  commentItem: {
    gap: 8,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  commentMeta: {
    flex: 1,
    gap: 1,
  },
  commentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  commentAuthor: {
    fontFamily: fonts.bodySemi,
    ...typeScale.bodySmall,
    flexShrink: 1,
  },
  commentTime: {
    fontFamily: fonts.body,
    ...typeScale.caption,
  },
  commentBody: {
    fontFamily: fonts.body,
    ...typeScale.body,
  },

  // Official badge
  officialBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  officialBadgeText: {
    fontFamily: fonts.bodySemi,
    fontSize: 10,
    lineHeight: 14,
  },

  // Comment input (sticky)
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  commentInput: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: fonts.body,
    ...typeScale.body,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default function MaintenanceDetailScreen() {
  return (
    <ScreenErrorBoundary screenName="MaintenanceDetail">
      <MaintenanceDetailInner />
    </ScreenErrorBoundary>
  )
}
