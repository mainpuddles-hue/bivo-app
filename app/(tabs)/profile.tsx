import { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet, Alert, Modal, FlatList } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import {
  Settings, LogOut, MapPin, Star, Users, Pencil, Camera, X,
  BadgeCheck, Crown, Shield, Flame, Heart, FileText, CalendarDays, Package,
  HandHelping, TrendingUp, BookOpen, Award, Zap,
} from 'lucide-react-native'
import { ProfileSkeleton } from '@/components/SkeletonLoaders'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { formatTimeAgo } from '@/lib/format'
import { PostCard } from '@/components/PostCard'
import { fonts } from '@/lib/fonts'
import type { Profile, Post, Review, UserBadge } from '@/lib/types'

const BADGE_ICONS: Record<string, { icon: React.ComponentType<any>; color: string }> = {
  verified: { icon: BadgeCheck, color: '#3B82F6' },
  pro: { icon: Crown, color: '#F59E0B' },
  trusted: { icon: Shield, color: '#10B981' },
  active: { icon: Flame, color: '#EF4444' },
  first_post: { icon: Star, color: '#4CAF6A' },
  helper: { icon: HandHelping, color: '#3B7DD8' },
  popular: { icon: TrendingUp, color: '#E8A050' },
  lender: { icon: BookOpen, color: '#C98B2E' },
  event_creator: { icon: CalendarDays, color: '#2B8A62' },
  weekly_active: { icon: Flame, color: '#EF4444' },
  neighborhood_hero: { icon: Award, color: '#8E44AD' },
}

interface ActivityItem {
  id: string
  type: 'post' | 'event' | 'review_given' | 'review_received'
  title: string
  date: string
  meta?: string
}

export default function ProfileScreen() {
  const { colors, isDark } = useTheme()
  const { t, locale } = useI18n()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'activity'>('overview')
  const [postCount, setPostCount] = useState(0)
  const [followerCount, setFollowerCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [avgRating, setAvgRating] = useState<number | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [badges, setBadges] = useState<UserBadge[]>([])
  const [recentPosts, setRecentPosts] = useState<Post[]>([])
  const [savedCount, setSavedCount] = useState(0)
  const [thanksCount, setThanksCount] = useState(0)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [editingBio, setEditingBio] = useState(false)
  const [bioText, setBioText] = useState('')
  const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null)
  const [followList, setFollowList] = useState<{ id: string; name: string; avatar_url: string | null }[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setProfileLoading(false); return }

      // Profile
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (p) { setProfile(p as unknown as Profile); setBioText((p as any).bio ?? '') }

      // Counts
      const [postsRes, followersRes, followingRes, savedRes, thanksRes] = await Promise.all([
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
        supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('followed_id', user.id),
        supabase.from('user_follows').select('id', { count: 'exact', head: true }).eq('follower_id', user.id),
        supabase.from('saved_posts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('thanks').select('id', { count: 'exact', head: true }).eq('to_user_id', user.id),
      ])
      setPostCount(postsRes.count ?? 0)
      setFollowerCount(followersRes.count ?? 0)
      setFollowingCount(followingRes.count ?? 0)
      setSavedCount(savedRes.count ?? 0)
      setThanksCount(thanksRes.count ?? 0)

      // Reviews received
      const { data: revs } = await supabase
        .from('reviews')
        .select('*, reviewer:profiles!reviews_reviewer_id_fkey(id, name, avatar_url)')
        .eq('reviewed_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
      setReviews((revs ?? []) as unknown as Review[])
      if (revs && revs.length > 0) {
        const avg = (revs as any[]).reduce((sum: number, r: any) => sum + r.rating, 0) / revs.length
        setAvgRating(Math.round(avg * 10) / 10)
      }

      // Badges
      const { data: bdg } = await supabase.from('user_badges').select('badge_type').eq('user_id', user.id)
      setBadges((bdg ?? []) as UserBadge[])

      // Recent posts
      const { data: posts } = await supabase
        .from('posts')
        .select('id, type, title, created_at, image_url, like_count, comment_count, location, user_id, description, is_pro_listing, tags, daily_fee, is_active, updated_at')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(5)
      setRecentPosts((posts ?? []) as unknown as Post[])

      // Activity feed
      const activities: ActivityItem[] = []
      // Posts
      ;(posts ?? []).forEach((p: any) => {
        activities.push({ id: `post-${p.id}`, type: 'post', title: p.title, date: p.created_at })
      })
      // Reviews given
      const { data: givenRevs } = await supabase
        .from('reviews')
        .select('id, rating, created_at, reviewed_id')
        .eq('reviewer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)
      ;(givenRevs ?? []).forEach((r: any) => {
        activities.push({ id: `rev-${r.id}`, type: 'review_given', title: t('profile.activityReviewGiven'), date: r.created_at, meta: `${r.rating}/5` })
      })
      // Reviews received
      ;(revs ?? []).slice(0, 5).forEach((r: any) => {
        activities.push({ id: `revr-${r.id}`, type: 'review_received', title: t('profile.activityReviewReceived'), date: r.created_at, meta: `${r.rating}/5` })
      })
      activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setActivity(activities.slice(0, 15))
      setProfileLoading(false)
    }
    load()
  }, [supabase, t])

  const handleAvatarUpload = useCallback(async () => {
    if (!profile) return
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 })
    if (result.canceled || !result.assets[0]) return
    try {
      const uri = result.assets[0].uri
      const ext = uri.split('.').pop() ?? 'jpg'
      const path = `avatars/${profile.id}.${ext}`
      const response = await fetch(uri)
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      await supabase.storage.from('avatars').upload(path, arrayBuffer, { contentType: `image/${ext}`, upsert: true })
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      await (supabase.from('profiles') as any).update({ avatar_url: urlData.publicUrl }).eq('id', profile.id)
      setProfile(prev => prev ? { ...prev, avatar_url: urlData.publicUrl } : null)
      Alert.alert(t('common.success'), t('profile.avatarUpdated'))
    } catch { Alert.alert(t('common.error'), t('profile.avatarUploadFailed')) }
  }, [profile, supabase, t])

  const handleSaveBio = useCallback(async () => {
    if (!profile) return
    await (supabase.from('profiles') as any).update({ bio: bioText.trim() }).eq('id', profile.id)
    setProfile(prev => prev ? { ...prev, bio: bioText.trim() } : null)
    setEditingBio(false)
  }, [profile, bioText, supabase])

  const openFollowList = useCallback(async (type: 'followers' | 'following') => {
    if (!profile) return
    setFollowModal(type)
    const col = type === 'followers' ? 'followed_id' : 'follower_id'
    const joinCol = type === 'followers' ? 'follower_id' : 'followed_id'
    const { data } = await supabase
      .from('user_follows')
      .select(`${joinCol}, user:profiles!user_follows_${joinCol}_fkey(id, name, avatar_url)`)
      .eq(col, profile.id)
      .limit(50)
    setFollowList((data ?? []).map((d: any) => d.user).filter(Boolean))
  }, [profile, supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/(auth)/login')
  }

  if (profileLoading) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: 12 }]}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        </View>
        <ProfileSkeleton />
      </View>
    )
  }

  if (!profile) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <View style={[s.header, { paddingTop: 12 }]}>
          <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        </View>
        <Pressable onPress={() => router.push('/(auth)/login')} style={[s.loginBtn, { backgroundColor: colors.primary }]}>
          <Text style={[s.loginBtnText, { color: colors.primaryForeground }]}>{t('auth.login')}</Text>
        </Pressable>
      </View>
    )
  }

  const renderStars = (rating: number) => (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={12} color={i <= rating ? colors.pro : colors.muted} fill={i <= rating ? colors.pro : 'transparent'} />
      ))}
    </View>
  )

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'post': return <FileText size={16} color={colors.primary} />
      case 'event': return <CalendarDays size={16} color="#2B8A62" />
      case 'review_given': case 'review_received': return <Star size={16} color={colors.pro} />
      default: return <FileText size={16} color={colors.mutedForeground} />
    }
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: 12, borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>{t('profile.title')}</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
          <Settings size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.hero}>
          <Pressable onPress={handleAvatarUpload}>
            {profile.avatar_url ? (
              <View>
                <Image source={{ uri: profile.avatar_url }} style={[s.bigAvatar, profile.is_pro && { borderWidth: 3, borderColor: colors.pro }]} />
                <View style={[s.cameraBtn, { backgroundColor: colors.primary }]}>
                  <Camera size={12} color={colors.primaryForeground} />
                </View>
              </View>
            ) : (
              <View>
                <View style={[s.bigAvatar, s.bigAvatarFb, { backgroundColor: colors.muted }]}>
                  <Text style={[s.bigAvatarInit, { color: colors.mutedForeground }]}>{profile.name?.charAt(0)?.toUpperCase()}</Text>
                </View>
                <View style={[s.cameraBtn, { backgroundColor: colors.primary }]}>
                  <Camera size={12} color={colors.primaryForeground} />
                </View>
              </View>
            )}
          </Pressable>
          <Text style={[s.profileName, { color: colors.foreground }]}>{profile.name}</Text>
          {profile.naapurusto && (
            <View style={s.nhRow}>
              <MapPin size={14} color={colors.primary} />
              <Text style={[s.nhText, { color: colors.primary }]}>{profile.naapurusto}</Text>
            </View>
          )}

          {/* Bio - editable */}
          {editingBio ? (
            <View style={s.bioEditWrap}>
              <TextInput
                style={[s.bioInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                value={bioText}
                onChangeText={setBioText}
                multiline
                maxLength={200}
                placeholder={t('profile.bioPlaceholder')}
                placeholderTextColor={colors.mutedForeground}
              />
              <View style={s.bioActions}>
                <Pressable onPress={() => setEditingBio(false)}><X size={20} color={colors.mutedForeground} /></Pressable>
                <Pressable onPress={handleSaveBio} style={[s.bioSaveBtn, { backgroundColor: colors.primary }]}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primaryForeground, fontFamily: fonts.bodySemi }}>{t('common.save')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setEditingBio(true)}>
              <Text style={[s.bio, { color: profile.bio ? colors.mutedForeground : colors.primary }]}>
                {profile.bio || t('profile.clickToAddBio')}
              </Text>
              <Pencil size={12} color={colors.mutedForeground} style={{ alignSelf: 'center', marginTop: 2 }} />
            </Pressable>
          )}

          {/* Badges */}
          {badges.length > 0 && (
            <View style={s.badgesSection}>
              <Text style={[s.badgesSectionTitle, { color: colors.foreground }]}>Saavutukset</Text>
              <View style={s.badgesRow}>
                {badges.map((b) => {
                  const cfg = BADGE_ICONS[b.badge_type]
                  if (!cfg) return null
                  const Icon = cfg.icon
                  return (
                    <View key={b.badge_type} style={[s.badgeChip, { backgroundColor: `${cfg.color}20` }]}>
                      <Icon size={12} color={cfg.color} />
                      <Text style={[s.badgeText, { color: cfg.color }]}>{t(`badges.${b.badge_type}`)}</Text>
                    </View>
                  )
                })}
              </View>
            </View>
          )}

          {profile.is_pro && (
            <View style={[s.proBadge, { backgroundColor: `${colors.pro}20` }]}>
              <Crown size={14} color={colors.pro} fill={colors.pro} />
              <Text style={[s.proText, { color: colors.pro }]}>Pro</Text>
            </View>
          )}
        </View>

        {/* Stats */}
        <View style={[s.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Pressable style={s.stat} onPress={() => openFollowList('followers')}>
            <Text style={[s.statNum, { color: colors.foreground }]}>{followerCount}</Text>
            <Text numberOfLines={1} style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.followers')}</Text>
          </Pressable>
          <View style={[s.statDiv, { backgroundColor: colors.border }]} />
          <Pressable style={s.stat} onPress={() => openFollowList('following')}>
            <Text style={[s.statNum, { color: colors.foreground }]}>{followingCount}</Text>
            <Text numberOfLines={1} style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.following')}</Text>
          </Pressable>
          <View style={[s.statDiv, { backgroundColor: colors.border }]} />
          <View style={s.stat}>
            <Text style={[s.statNum, { color: colors.foreground }]}>{postCount}</Text>
            <Text numberOfLines={1} style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.posts')}</Text>
          </View>
          <View style={[s.statDiv, { backgroundColor: colors.border }]} />
          <View style={s.stat}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={[s.statNum, { color: colors.foreground }]}>{thanksCount}</Text>
              <Heart size={12} color={colors.destructive} fill={colors.destructive} />
            </View>
            <Text numberOfLines={1} style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.thanks')}</Text>
          </View>
          <View style={[s.statDiv, { backgroundColor: colors.border }]} />
          <View style={s.stat}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={[s.statNum, { color: colors.foreground }]}>{(postCount * 5) + (reviews.length * 10) + (thanksCount * 3) + (followerCount * 2)}</Text>
              <Zap size={12} color={colors.pro} fill={colors.pro} />
            </View>
            <Text numberOfLines={1} style={[s.statLabel, { color: colors.mutedForeground }]}>{t('profile.karma')}</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={[s.tabRow, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setActiveTab('overview')} style={[s.tab, activeTab === 'overview' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'overview' ? colors.primary : colors.mutedForeground }]}>{t('profile.overview')}</Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab('activity')} style={[s.tab, activeTab === 'activity' && [s.tabActive, { borderBottomColor: colors.primary }]]}>
            <Text style={[s.tabText, { color: activeTab === 'activity' ? colors.primary : colors.mutedForeground }]}>{t('profile.activity')}</Text>
          </Pressable>
        </View>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <View style={s.tabContent}>
            {/* Impact Dashboard */}
            <View style={[impactStyles.card, { backgroundColor: colors.card }]}>
              <Text style={[impactStyles.title, { color: colors.foreground }]}>{t('profile.yourImpact')}</Text>
              <View style={impactStyles.statsRow}>
                <View style={impactStyles.statItem}>
                  <Text style={[impactStyles.statNumber, { color: colors.primary }]}>{thanksCount}</Text>
                  <Text style={[impactStyles.statLabel, { color: colors.mutedForeground }]}>{t('profile.helped')}</Text>
                </View>
                <View style={impactStyles.statItem}>
                  <Text style={[impactStyles.statNumber, { color: colors.primary }]}>{postCount}</Text>
                  <Text style={[impactStyles.statLabel, { color: colors.mutedForeground }]}>{t('profile.shared')}</Text>
                </View>
                <View style={impactStyles.statItem}>
                  <Text style={[impactStyles.statNumber, { color: colors.primary }]}>{savedCount}</Text>
                  <Text style={[impactStyles.statLabel, { color: colors.mutedForeground }]}>{t('profile.impactSaved')}</Text>
                </View>
              </View>
              {(profile?.current_streak ?? 0) > 0 && (
                <View style={[impactStyles.streakRow, { borderTopColor: colors.border }]}>
                  <Flame size={16} color="#EF4444" />
                  <Text style={[impactStyles.streakText, { color: colors.foreground }]}>
                    {t('profile.streakDays', { count: profile?.current_streak ?? 0 })}
                  </Text>
                  <Text style={[impactStyles.pointsText, { color: colors.mutedForeground }]}>
                    · {profile?.total_points ?? 0} {t('profile.points')}
                  </Text>
                </View>
              )}
            </View>

            {/* Badge Showcase */}
            {badges.length > 0 && (
              <View style={[impactStyles.card, { backgroundColor: colors.card }]}>
                <Text style={[impactStyles.title, { color: colors.foreground }]}>{t('profile.badges')}</Text>
                <View style={badgeStyles.grid}>
                  {badges.map(badge => {
                    const info = BADGE_ICONS[badge.badge_type]
                    if (!info) return null
                    const Icon = info.icon
                    return (
                      <View key={badge.badge_type} style={badgeStyles.item}>
                        <View style={[badgeStyles.circle, { backgroundColor: `${info.color}18` }]}>
                          <Icon size={20} color={info.color} />
                        </View>
                        <Text style={[badgeStyles.label, { color: colors.foreground }]} numberOfLines={1}>
                          {t(`badges.${badge.badge_type}`)}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              </View>
            )}

            {/* Saved posts count */}
            <Pressable style={[s.overviewCard, { backgroundColor: colors.card }]}>
              <Heart size={18} color={colors.primary} />
              <Text style={[s.overviewText, { color: colors.foreground }]}>{t('profile.saved', { count: savedCount })}</Text>
            </Pressable>

            {/* Reviews */}
            <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('profile.reviewsCount', { count: reviews.length })}</Text>
            {reviews.length === 0 ? (
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.noReviews')}</Text>
            ) : (
              reviews.map((rev) => (
                <View key={rev.id} style={[s.reviewCard, { backgroundColor: colors.card }]}>
                  <View style={s.reviewHeader}>
                    {rev.reviewer?.avatar_url ? (
                      <Image source={{ uri: rev.reviewer.avatar_url }} style={s.reviewAvatar} />
                    ) : (
                      <View style={[s.reviewAvatar, { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={{ fontSize: 10, color: colors.mutedForeground, fontWeight: '600', fontFamily: fonts.bodySemi }}>{rev.reviewer?.name?.charAt(0)?.toUpperCase()}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[s.reviewName, { color: colors.foreground }]}>{rev.reviewer?.name}</Text>
                      {renderStars(rev.rating)}
                    </View>
                    <Text style={[s.reviewTime, { color: colors.mutedForeground }]}>{formatTimeAgo(rev.created_at, t, locale)}</Text>
                  </View>
                  {rev.comment && <Text style={[s.reviewComment, { color: colors.foreground }]}>{rev.comment}</Text>}
                </View>
              ))
            )}

            {/* Recent posts */}
            {recentPosts.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { color: colors.foreground }]}>{t('profile.ownPosts', { count: postCount })}</Text>
                {recentPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </>
            )}
          </View>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <View style={s.tabContent}>
            {activity.length === 0 ? (
              <View style={s.emptyActivity}>
                <Text style={[s.emptyText, { color: colors.mutedForeground }]}>{t('profile.noActivity')}</Text>
                <Text style={[s.emptyHint, { color: colors.mutedForeground }]}>{t('profile.noActivityHint')}</Text>
              </View>
            ) : (
              activity.map((item) => (
                <View key={item.id} style={[s.activityItem, { borderLeftColor: colors.primary }]}>
                  <View style={[s.activityDot, { backgroundColor: colors.card, borderColor: colors.primary }]}>
                    {getActivityIcon(item.type)}
                  </View>
                  <View style={s.activityContent}>
                    <Text style={[s.activityTitle, { color: colors.foreground }]}>{item.title}</Text>
                    <View style={s.activityMeta}>
                      <Text style={[s.activityTime, { color: colors.mutedForeground }]}>{formatTimeAgo(item.date, t, locale)}</Text>
                      {item.meta && <Text style={[s.activityMetaBadge, { color: colors.pro }]}>{item.meta}</Text>}
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Actions */}
        <View style={{ gap: 8, marginTop: 8 }}>
          <Pressable onPress={handleLogout} style={[s.menuItem, { backgroundColor: colors.card }]}>
            <LogOut size={20} color={colors.destructive} />
            <Text style={[s.menuText, { color: colors.destructive }]}>{t('profile.logout')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Followers/Following Modal */}
      <Modal visible={followModal !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFollowModal(null)}>
        <View style={[s.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.modalTitle, { color: colors.foreground }]}>
              {followModal === 'followers' ? t('profile.followersList', { count: followerCount }) : t('profile.followingList', { count: followingCount })}
            </Text>
            <Pressable onPress={() => setFollowModal(null)} hitSlop={12}>
              <X size={24} color={colors.foreground} />
            </Pressable>
          </View>
          <FlatList
            data={followList}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={s.followItem}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={s.followAvatar} />
                ) : (
                  <View style={[s.followAvatar, { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.mutedForeground, fontFamily: fonts.bodySemi }}>{item.name?.charAt(0)?.toUpperCase()}</Text>
                  </View>
                )}
                <Text style={[s.followName, { color: colors.foreground }]}>{item.name}</Text>
              </View>
            )}
            ListEmptyComponent={
              <Text style={[s.emptyText, { color: colors.mutedForeground, textAlign: 'center', marginTop: 40 }]}>
                {followModal === 'followers' ? t('profile.noFollowers') : t('profile.noFollowing')}
              </Text>
            }
          />
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, fontFamily: fonts.headingSemi },
  content: { padding: 16, gap: 16, paddingBottom: 100 },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  bigAvatar: { width: 80, height: 80, borderRadius: 40 },
  bigAvatarFb: { alignItems: 'center', justifyContent: 'center' },
  bigAvatarInit: { fontSize: 32, fontWeight: '700', fontFamily: fonts.heading },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  profileName: { fontSize: 20, fontWeight: '700', fontFamily: fonts.heading },
  nhRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nhText: { fontSize: 14, fontWeight: '500', fontFamily: fonts.bodyMedium },
  bio: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 16, fontFamily: fonts.body },
  bioEditWrap: { width: '100%', gap: 8, paddingHorizontal: 8 },
  bioInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, minHeight: 60, textAlignVertical: 'top', fontFamily: fonts.body },
  bioActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, alignItems: 'center' },
  bioSaveBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  badgesSection: { alignItems: 'center', gap: 6, width: '100%' },
  badgesSectionTitle: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodySemi },
  badgesRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  badgeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600', fontFamily: fonts.bodySemi },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  proText: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodySemi },
  statsRow: { flexDirection: 'row', borderRadius: 12, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { fontSize: 18, fontWeight: '700', fontFamily: fonts.heading },
  statLabel: { fontSize: 11, fontFamily: fonts.body },
  statDiv: { width: 1 },
  tabRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2 },
  tabText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.bodyMedium },
  tabContent: { gap: 12 },
  overviewCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12 },
  overviewText: { fontSize: 14, fontWeight: '500', fontFamily: fonts.body },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 4, fontFamily: fonts.headingSemi },
  reviewCard: { borderRadius: 12, padding: 14, gap: 8 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewAvatar: { width: 32, height: 32, borderRadius: 16 },
  reviewName: { fontSize: 13, fontWeight: '600', fontFamily: fonts.bodyMedium },
  reviewTime: { fontSize: 11, fontFamily: fonts.body },
  reviewComment: { fontSize: 14, lineHeight: 19, fontFamily: fonts.body },
  emptyText: { fontSize: 14, fontFamily: fonts.body },
  emptyHint: { fontSize: 13, marginTop: 4, fontFamily: fonts.body },
  emptyActivity: { alignItems: 'center', paddingTop: 20, gap: 4 },
  activityItem: { flexDirection: 'row', gap: 12, paddingLeft: 16, borderLeftWidth: 2, paddingVertical: 8 },
  activityDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: -25 },
  activityContent: { flex: 1, gap: 2 },
  activityTitle: { fontSize: 14, fontWeight: '500', fontFamily: fonts.body },
  activityMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  activityTime: { fontSize: 12, fontFamily: fonts.body },
  activityMetaBadge: { fontSize: 12, fontWeight: '600', fontFamily: fonts.bodySemi },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12 },
  menuText: { fontSize: 15, fontWeight: '500', fontFamily: fonts.bodyMedium },
  loginBtn: { marginHorizontal: 16, marginTop: 60, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  loginBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.bodySemi },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 18, fontWeight: '700', fontFamily: fonts.headingSemi },
  followItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  followAvatar: { width: 40, height: 40, borderRadius: 20 },
  followName: { fontSize: 15, fontWeight: '500', fontFamily: fonts.bodyMedium },
})

const impactStyles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, gap: 12 },
  title: { fontSize: 16, fontFamily: fonts.headingSemi, letterSpacing: -0.16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 4 },
  statNumber: { fontSize: 24, fontFamily: fonts.heading },
  statLabel: { fontSize: 11, fontFamily: fonts.body },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  streakText: { fontSize: 13, fontFamily: fonts.bodySemi },
  pointsText: { fontSize: 13, fontFamily: fonts.body },
})

const badgeStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  item: { alignItems: 'center', gap: 6, width: 72 },
  circle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontFamily: fonts.body, textAlign: 'center' },
})
