declare const __DEV__: boolean

import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowLeft, AlertTriangle, AlertCircle, Pin } from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { Avatar } from '@/components/Avatar'
import { PressableOpacity } from '@/components/ui'
import { fonts } from '@/lib/fonts'
import { formatTimeAgo } from '@/lib/format'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { isValidUUID } from '@/lib/validation'

interface Announcement {
  id: string
  title: string
  body: string
  priority: 'normal' | 'important' | 'urgent'
  pinned: boolean
  read_count: number
  created_at: string
  author?: { id: string; name: string; avatar_url: string | null }
}

function AnnouncementDetailInner() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const supabase = useSupabase()

  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id || !isValidUUID(id)) return
    let mounted = true

    async function load() {
      try {
        const { data } = await supabase
          .from('announcements')
          .select('id, title, body, priority, pinned, read_count, created_at, author:profiles!announcements_author_id_fkey(id, name, avatar_url)')
          .eq('id', id)
          .single()

        if (!mounted) return
        if (data) setAnnouncement(data as any)

        // Mark as read
        const { data: { user } } = await supabase.auth.getUser()
        if (user && mounted) {
          await (supabase.from('announcement_reads') as any)
            .upsert({ announcement_id: id, user_id: user.id }, { onConflict: 'announcement_id,user_id' })

          // Increment read count
          await (supabase.from('announcements') as any)
            .update({ read_count: ((data as any)?.read_count ?? 0) + 1 })
            .eq('id', id)
        }
      } catch (err) {
        if (__DEV__) console.warn('[announcement] load error:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => { mounted = false }
  }, [id, supabase])

  const priorityConfig = {
    urgent: { color: colors.destructive, icon: AlertTriangle, label: t('building.priorityUrgent') },
    important: { color: '#F59E0B', icon: AlertCircle, label: t('building.priorityImportant') },
    normal: { color: colors.mutedForeground, icon: null, label: t('building.priorityNormal') },
  }

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.foreground} />
      </View>
    )
  }

  if (!announcement) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: fonts.body }}>
          {t('common.notFound') ?? 'Not found'}
        </Text>
      </View>
    )
  }

  const pCfg = priorityConfig[announcement.priority]

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 4, borderBottomColor: colors.border }]}>
        <PressableOpacity onPress={() => router.back()} hitSlop={12} style={[s.circleBack, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ArrowLeft size={20} color={colors.foreground} />
        </PressableOpacity>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>
          {t('building.announcements')}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* Priority + Pinned badges */}
        <View style={s.badgeRow}>
          {announcement.priority !== 'normal' && (
            <View style={[s.priorityBadge, { backgroundColor: `${pCfg.color}15` }]}>
              {pCfg.icon && <pCfg.icon size={12} color={pCfg.color} />}
              <Text style={[s.priorityText, { color: pCfg.color }]}>{pCfg.label}</Text>
            </View>
          )}
          {announcement.pinned && (
            <View style={[s.priorityBadge, { backgroundColor: `${colors.foreground}10` }]}>
              <Pin size={12} color={colors.foreground} />
              <Text style={[s.priorityText, { color: colors.foreground }]}>{t('building.pinned')}</Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={[s.title, { color: colors.foreground }]}>
          {announcement.title}
        </Text>

        {/* Author */}
        <View style={s.authorRow}>
          <Avatar url={announcement.author?.avatar_url ?? null} name={announcement.author?.name ?? ''} size={32} />
          <View style={{ flex: 1 }}>
            <Text style={[s.authorName, { color: colors.foreground }]}>
              {announcement.author?.name ?? t('common.user')}
            </Text>
            <Text style={[s.authorTime, { color: colors.mutedForeground }]}>
              {formatTimeAgo(announcement.created_at, t, locale)}
            </Text>
          </View>
        </View>

        {/* Body */}
        <Text style={[s.body, { color: colors.foreground }]}>
          {announcement.body}
        </Text>

        {/* Read count */}
        <Text style={[s.readCount, { color: colors.mutedForeground }]}>
          {t('building.readBy', { count: announcement.read_count })}
        </Text>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  circleBack: {
    width: 36, height: 36, borderRadius: 999,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    flex: 1, textAlign: 'center', fontSize: 15,
    fontFamily: fonts.headingSemi, lineHeight: 22,
  },
  content: { padding: 20, gap: 16 },
  badgeRow: { flexDirection: 'row', gap: 8 },
  priorityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  priorityText: { fontSize: 12, fontFamily: fonts.bodySemi, lineHeight: 16 },
  title: {
    fontSize: 24, fontFamily: fonts.display, fontWeight: '700',
    lineHeight: 30, letterSpacing: -0.4,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorName: { fontSize: 14, fontFamily: fonts.bodySemi, lineHeight: 20 },
  authorTime: { fontSize: 12, fontFamily: fonts.body, lineHeight: 16 },
  body: { fontSize: 16, fontFamily: fonts.body, lineHeight: 24 },
  readCount: { fontSize: 12, fontFamily: fonts.body, lineHeight: 16, marginTop: 8 },
})

export default function AnnouncementDetailScreen() {
  return (
    <ScreenErrorBoundary screenName="AnnouncementDetail">
      <AnnouncementDetailInner />
    </ScreenErrorBoundary>
  )
}
