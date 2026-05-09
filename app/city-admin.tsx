import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, Pressable, TextInput, StyleSheet,
  ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native'
import { PressableOpacity } from '@/components/ui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useFocusEffect } from 'expo-router'
import {
  ArrowLeft, Landmark, MapPin, Megaphone, CalendarPlus, Plus,
  Users, Calendar, Shield,
} from 'lucide-react-native'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { useSupabase } from '@/hooks/useSupabase'
import { fonts } from '@/lib/fonts'
import { ScreenErrorBoundary } from '@/components/ScreenErrorBoundary'
import { useToast } from '@/components/Toast'
import { formatTimeAgo } from '@/lib/format'
import { safeBack } from '@/lib/navigation'

type Tab = 'neighborhoods' | 'announcements' | 'events'

interface NeighborhoodRow {
  naapurusto: string
  count: number
}

interface CityAnnouncement {
  id: string
  title: string
  description: string | null
  category: string
  created_at: string
}

interface CityEvent {
  id: string
  title: string
  description: string | null
  event_date: string | null
  location: string | null
  created_at: string
}

function CityAdminScreenInner() {
  const { colors } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useSupabase()
  const toast = useToast()

  const [isCityOfficial, setIsCityOfficial] = useState<boolean | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('neighborhoods')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Neighborhoods state
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodRow[]>([])

  // Announcements state
  const [announcements, setAnnouncements] = useState<CityAnnouncement[]>([])
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false)
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [annPriority, setAnnPriority] = useState<'normal' | 'important'>('normal')
  const [creatingAnn, setCreatingAnn] = useState(false)

  // Events state
  const [events, setEvents] = useState<CityEvent[]>([])
  const [showEventForm, setShowEventForm] = useState(false)
  const [evtTitle, setEvtTitle] = useState('')
  const [evtDesc, setEvtDesc] = useState('')
  const [evtDate, setEvtDate] = useState('')
  const [evtLocation, setEvtLocation] = useState('')
  const [creatingEvt, setCreatingEvt] = useState(false)

  // Check city official status — redirect non-officials
  useEffect(() => {
    async function checkOfficial() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/(auth)/login'); return }
      const { data } = await supabase
        .from('profiles')
        .select('is_city_official')
        .eq('id', user.id)
        .maybeSingle()
      const official = !!(data as any)?.is_city_official
      if (!official) { setIsCityOfficial(false); setLoading(false); return }
      setUserId(user.id)
      setIsCityOfficial(true)
      setLoading(false)
    }
    checkOfficial()
  }, [supabase, router])

  // Load data for active tab
  const loadData = useCallback(async () => {
    if (!isCityOfficial) return
    try {
      if (activeTab === 'neighborhoods') {
        const { data } = await supabase
          .rpc('get_neighborhood_counts' as any)
          .then((res: any) => {
            // If RPC doesn't exist, fall back to manual query
            if (res.error) return { data: null }
            return res
          })

        if (data) {
          setNeighborhoods(data as unknown as NeighborhoodRow[])
        } else {
          // Fallback: fetch profiles and count manually
          const { data: profiles } = await supabase
            .from('profiles')
            .select('naapurusto')
          if (profiles) {
            const counts: Record<string, number> = {}
            for (const p of profiles as any[]) {
              if (p.naapurusto) {
                counts[p.naapurusto] = (counts[p.naapurusto] || 0) + 1
              }
            }
            const rows: NeighborhoodRow[] = Object.entries(counts)
              .map(([naapurusto, count]) => ({ naapurusto, count }))
              .sort((a, b) => b.count - a.count)
            setNeighborhoods(rows)
          }
        }
      } else if (activeTab === 'announcements') {
        const { data } = await supabase
          .from('posts')
          .select('id, title, description, category, created_at')
          .eq('category', 'kaupunki')
          .order('created_at', { ascending: false })
          .limit(50)
        setAnnouncements((data ?? []) as unknown as CityAnnouncement[])
      } else if (activeTab === 'events') {
        const { data } = await supabase
          .from('city_events')
          .select('id, title, description, event_date, location, created_at')
          .order('created_at', { ascending: false })
          .limit(50)
        setEvents((data ?? []) as unknown as CityEvent[])
      }
    } catch (err) {
      if (__DEV__) console.warn('[city-admin] loadData failed:', err)
    }
  }, [activeTab, isCityOfficial, supabase])

  useFocusEffect(useCallback(() => { loadData() }, [loadData]))

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  // Create announcement
  const createAnnouncement = useCallback(async () => {
    if (!annTitle.trim() || !annBody.trim() || !userId) return
    setCreatingAnn(true)
    try {
      const { error } = await (supabase.from('posts') as any).insert({
        user_id: userId,
        title: annTitle.trim(),
        description: annBody.trim(),
        category: 'kaupunki',
        is_active: true,
        priority: annPriority,
      })
      if (error) {
        toast.show({ message: t('common.error'), type: 'error' })
        if (__DEV__) console.warn('[city-admin] createAnnouncement error:', error)
      } else {
        toast.show({ message: t('cityAdmin.announcementCreated'), type: 'success' })
        setAnnTitle('')
        setAnnBody('')
        setAnnPriority('normal')
        setShowAnnouncementForm(false)
        loadData()
      }
    } catch (err) {
      if (__DEV__) console.warn('[city-admin] createAnnouncement failed:', err)
      toast.show({ message: t('common.error'), type: 'error' })
    }
    setCreatingAnn(false)
  }, [annTitle, annBody, annPriority, userId, supabase, t, toast, loadData])

  // Create event
  const createEvent = useCallback(async () => {
    if (!evtTitle.trim()) return
    setCreatingEvt(true)
    try {
      const { error } = await (supabase.from('city_events') as any).insert({
        title: evtTitle.trim(),
        description: evtDesc.trim() || null,
        event_date: evtDate.trim() || null,
        location: evtLocation.trim() || null,
      })
      if (error) {
        toast.show({ message: t('common.error'), type: 'error' })
        if (__DEV__) console.warn('[city-admin] createEvent error:', error)
      } else {
        toast.show({ message: t('cityAdmin.eventCreated'), type: 'success' })
        setEvtTitle('')
        setEvtDesc('')
        setEvtDate('')
        setEvtLocation('')
        setShowEventForm(false)
        loadData()
      }
    } catch (err) {
      if (__DEV__) console.warn('[city-admin] createEvent failed:', err)
      toast.show({ message: t('common.error'), type: 'error' })
    }
    setCreatingEvt(false)
  }, [evtTitle, evtDesc, evtDate, evtLocation, supabase, t, toast, loadData])

  // Loading state
  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <ActivityIndicator size="large" color={colors.foreground} style={{ marginTop: 80 }} />
      </View>
    )
  }

  // Access denied
  if (!isCityOfficial) {
    return (
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => safeBack(router, '/(tabs)')}
            hitSlop={12}
            style={[s.circleBack, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <ArrowLeft size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[s.headerTitle, { color: colors.foreground }]} accessibilityRole="header">{t('cityAdmin.accessDenied')}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.emptyContainer}>
          <Shield size={48} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('cityAdmin.accessDeniedDesc')}</Text>
        </View>
      </View>
    )
  }

  const TAB_CONFIG: { key: Tab; label: string; icon: typeof Landmark }[] = [
    { key: 'neighborhoods', label: t('cityAdmin.neighborhoods'), icon: MapPin },
    { key: 'announcements', label: t('cityAdmin.announcements'), icon: Megaphone },
    { key: 'events', label: t('cityAdmin.events'), icon: Calendar },
  ]

  return (
    <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => safeBack(router, '/(tabs)')}
          hitSlop={12}
          style={[s.circleBack, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <ArrowLeft size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[s.headerTitle, { color: colors.foreground }]} accessibilityRole="header">{t('cityAdmin.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab chips -- monochrome */}
      <View style={s.tabs}>
        {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
          <PressableOpacity
            key={key}
            onPress={() => setActiveTab(key)}
            accessibilityLabel={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === key }}
            style={[
              s.tab,
              {
                backgroundColor: activeTab === key ? colors.foreground : colors.card,
                borderColor: activeTab === key ? colors.foreground : colors.border,
              },
            ]}
          >
            <Icon size={14} color={activeTab === key ? colors.primaryForeground : colors.mutedForeground} />
            <Text style={[s.tabText, { color: activeTab === key ? colors.primaryForeground : colors.mutedForeground }]}>
              {label}
            </Text>
          </PressableOpacity>
        ))}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={s.content}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.foreground} />}
        >
          {/* NEIGHBORHOODS TAB */}
          {activeTab === 'neighborhoods' && (
            <>
              {neighborhoods.length === 0 ? (
                <View style={s.emptyContainer}>
                  <MapPin size={40} color={colors.mutedForeground} />
                  <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('cityAdmin.noNeighborhoods')}</Text>
                </View>
              ) : (
                neighborhoods.map(row => (
                  <View key={row.naapurusto} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={s.neighborhoodRow}>
                      <View style={[s.neighborhoodIcon, { backgroundColor: colors.muted }]}>
                        <MapPin size={16} color={colors.foreground} />
                      </View>
                      <View style={s.neighborhoodInfo}>
                        <Text style={[s.neighborhoodName, { color: colors.foreground }]} numberOfLines={1}>
                          {row.naapurusto}
                        </Text>
                        <Text style={[s.neighborhoodCount, { color: colors.mutedForeground }]}>
                          {(t('cityAdmin.residents') ?? '').replace('{count}', String(row.count))}
                        </Text>
                      </View>
                      <View style={[s.countBadge, { backgroundColor: colors.foreground }]}>
                        <Text style={[s.countBadgeText, { color: colors.primaryForeground }]}>{row.count}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* ANNOUNCEMENTS TAB */}
          {activeTab === 'announcements' && (
            <>
              <PressableOpacity
                onPress={() => setShowAnnouncementForm(prev => !prev)}
                style={[s.createBtn, { backgroundColor: colors.foreground }]}
                accessibilityLabel={t('cityAdmin.createAnnouncement')}
                accessibilityRole="button"
              >
                <Plus size={16} color={colors.primaryForeground} />
                <Text style={[s.createBtnText, { color: colors.primaryForeground }]}>
                  {t('cityAdmin.createAnnouncement')}
                </Text>
              </PressableOpacity>

              {showAnnouncementForm && (
                <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TextInput
                    value={annTitle}
                    onChangeText={setAnnTitle}
                    placeholder={t('cityAdmin.announcementTitle')}
                    placeholderTextColor={colors.mutedForeground}
                    style={[s.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                    returnKeyType="next"
                    accessibilityLabel={t('cityAdmin.announcementTitle')}
                  />
                  <TextInput
                    value={annBody}
                    onChangeText={setAnnBody}
                    placeholder={t('cityAdmin.announcementBody')}
                    placeholderTextColor={colors.mutedForeground}
                    style={[s.input, s.multilineInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                    returnKeyType="default"
                    accessibilityLabel={t('cityAdmin.announcementBody')}
                  />

                  {/* Priority toggle */}
                  <View style={s.priorityRow}>
                    {(['normal', 'important'] as const).map(p => (
                      <PressableOpacity
                        key={p}
                        onPress={() => setAnnPriority(p)}
                        style={[
                          s.priorityChip,
                          {
                            backgroundColor: annPriority === p ? colors.foreground : colors.card,
                            borderColor: annPriority === p ? colors.foreground : colors.border,
                          },
                        ]}
                        accessibilityLabel={p}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: annPriority === p }}
                      >
                        <Text style={[s.priorityText, { color: annPriority === p ? colors.primaryForeground : colors.mutedForeground }]}>
                          {p === 'normal' ? 'Normal' : 'Important'}
                        </Text>
                      </PressableOpacity>
                    ))}
                  </View>

                  <PressableOpacity
                    onPress={createAnnouncement}
                    disabled={creatingAnn || !annTitle.trim() || !annBody.trim()}
                    style={[
                      s.submitBtn,
                      {
                        backgroundColor: (annTitle.trim() && annBody.trim()) ? colors.foreground : colors.muted,
                      },
                    ]}
                    accessibilityLabel={t('common.save')}
                    accessibilityRole="button"
                  >
                    {creatingAnn ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <Text style={[s.submitBtnText, { color: (annTitle.trim() && annBody.trim()) ? colors.primaryForeground : colors.mutedForeground }]}>
                        {t('common.save')}
                      </Text>
                    )}
                  </PressableOpacity>
                </View>
              )}

              {announcements.length === 0 && !showAnnouncementForm ? (
                <View style={s.emptyContainer}>
                  <Megaphone size={40} color={colors.mutedForeground} />
                  <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('cityAdmin.noAnnouncements')}</Text>
                </View>
              ) : (
                announcements.map(ann => (
                  <View key={ann.id} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {ann.title}
                    </Text>
                    {ann.description && (
                      <Text style={[s.cardDesc, { color: colors.mutedForeground }]} numberOfLines={3}>
                        {ann.description}
                      </Text>
                    )}
                    <Text style={[s.cardDate, { color: colors.mutedForeground }]}>
                      {formatTimeAgo(ann.created_at, t, locale)}
                    </Text>
                  </View>
                ))
              )}
            </>
          )}

          {/* EVENTS TAB */}
          {activeTab === 'events' && (
            <>
              <PressableOpacity
                onPress={() => setShowEventForm(prev => !prev)}
                style={[s.createBtn, { backgroundColor: colors.foreground }]}
                accessibilityLabel={t('cityAdmin.createEvent')}
                accessibilityRole="button"
              >
                <Plus size={16} color={colors.primaryForeground} />
                <Text style={[s.createBtnText, { color: colors.primaryForeground }]}>
                  {t('cityAdmin.createEvent')}
                </Text>
              </PressableOpacity>

              {showEventForm && (
                <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TextInput
                    value={evtTitle}
                    onChangeText={setEvtTitle}
                    placeholder={t('cityAdmin.eventTitle')}
                    placeholderTextColor={colors.mutedForeground}
                    style={[s.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                    returnKeyType="next"
                    accessibilityLabel={t('cityAdmin.eventTitle')}
                  />
                  <TextInput
                    value={evtDesc}
                    onChangeText={setEvtDesc}
                    placeholder={t('cityAdmin.eventDescription')}
                    placeholderTextColor={colors.mutedForeground}
                    style={[s.input, s.multilineInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    returnKeyType="default"
                    accessibilityLabel={t('cityAdmin.eventDescription')}
                  />
                  <TextInput
                    value={evtDate}
                    onChangeText={setEvtDate}
                    placeholder={`${t('cityAdmin.eventDate')} (YYYY-MM-DD)`}
                    placeholderTextColor={colors.mutedForeground}
                    style={[s.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                    returnKeyType="next"
                    accessibilityLabel={t('cityAdmin.eventDate')}
                  />
                  <TextInput
                    value={evtLocation}
                    onChangeText={setEvtLocation}
                    placeholder={t('cityAdmin.eventLocation')}
                    placeholderTextColor={colors.mutedForeground}
                    style={[s.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
                    returnKeyType="done"
                    accessibilityLabel={t('cityAdmin.eventLocation')}
                  />

                  <PressableOpacity
                    onPress={createEvent}
                    disabled={creatingEvt || !evtTitle.trim()}
                    style={[
                      s.submitBtn,
                      {
                        backgroundColor: evtTitle.trim() ? colors.foreground : colors.muted,
                      },
                    ]}
                    accessibilityLabel={t('common.save')}
                    accessibilityRole="button"
                  >
                    {creatingEvt ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <Text style={[s.submitBtnText, { color: evtTitle.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
                        {t('common.save')}
                      </Text>
                    )}
                  </PressableOpacity>
                </View>
              )}

              {events.length === 0 && !showEventForm ? (
                <View style={s.emptyContainer}>
                  <Calendar size={40} color={colors.mutedForeground} />
                  <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('cityAdmin.noEvents')}</Text>
                </View>
              ) : (
                events.map(evt => (
                  <View key={evt.id} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[s.cardTitle, { color: colors.foreground }]} numberOfLines={2}>
                      {evt.title}
                    </Text>
                    {evt.description && (
                      <Text style={[s.cardDesc, { color: colors.mutedForeground }]} numberOfLines={3}>
                        {evt.description}
                      </Text>
                    )}
                    <View style={s.eventMeta}>
                      {evt.event_date && (
                        <View style={s.metaRow}>
                          <Calendar size={12} color={colors.mutedForeground} />
                          <Text style={[s.metaText, { color: colors.mutedForeground }]}>{evt.event_date}</Text>
                        </View>
                      )}
                      {evt.location && (
                        <View style={s.metaRow}>
                          <MapPin size={12} color={colors.mutedForeground} />
                          <Text style={[s.metaText, { color: colors.mutedForeground }]}>{evt.location}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[s.cardDate, { color: colors.mutedForeground }]}>
                      {formatTimeAgo(evt.created_at, t, locale)}
                    </Text>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  circleBack: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: fonts.headingSemi,
    letterSpacing: -0.3,
    lineHeight: 22,
    textAlign: 'center',
    flex: 1,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    paddingTop: 12,
    marginBottom: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.bodyMedium,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginBottom: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 16,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.bodyMedium,
    textAlign: 'center',
    maxWidth: 280,
  },
  // Neighborhoods
  neighborhoodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  neighborhoodIcon: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  neighborhoodInfo: {
    flex: 1,
  },
  neighborhoodName: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.bodySemi,
  },
  neighborhoodCount: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
    marginTop: 2,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    minWidth: 36,
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.bodySemi,
  },
  // Create button
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
    marginBottom: 12,
    minHeight: 44,
  },
  createBtnText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.bodySemi,
  },
  // Form inputs
  input: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.body,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  multilineInput: {
    minHeight: 80,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  priorityChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  priorityText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.bodyMedium,
  },
  submitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    minHeight: 44,
  },
  submitBtnText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.bodySemi,
  },
  // Card content
  cardTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.bodySemi,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.body,
    marginBottom: 8,
  },
  cardDate: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
  },
  // Event meta
  eventMeta: {
    gap: 4,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
  },
})

export default function CityAdminScreen() {
  return (
    <ScreenErrorBoundary screenName="CityAdmin">
      <CityAdminScreenInner />
    </ScreenErrorBoundary>
  )
}
