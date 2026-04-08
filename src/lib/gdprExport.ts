/**
 * GDPR Article 20 — Right to Data Portability.
 *
 * Exports all user data in machine-readable JSON format.
 * Called from Settings → Privacy → Export Data.
 */
import { createClient } from '@/lib/supabase/client'
import { downloadAsFile } from '@/lib/share'

interface ExportedData {
  exportDate: string
  user: {
    id: string
    email: string
    created_at: string
  }
  profile: Record<string, unknown> | null
  posts: Record<string, unknown>[]
  comments: Record<string, unknown>[]
  messages: Record<string, unknown>[]
  likes: Record<string, unknown>[]
  savedPosts: Record<string, unknown>[]
  reviews: Record<string, unknown>[]
  follows: { following: string[]; followers: string[] }
  notifications: Record<string, unknown>[]
  points: Record<string, unknown>[]
  scheduledNotifications: Record<string, unknown>[]
  auditLog: Record<string, unknown>[]
  webhookEvents: Record<string, unknown>[]
  conversationMemberships: Record<string, unknown>[]
  boostPurchases: Record<string, unknown>[]
}

export async function exportUserData(userId: string): Promise<boolean> {
  const supabase = createClient()

  // Fetch all user data in parallel
  const [
    profileRes,
    postsRes,
    commentsRes,
    messagesRes,
    likesRes,
    savedRes,
    reviewsGivenRes,
    reviewsReceivedRes,
    followingRes,
    followersRes,
    notificationsRes,
    pointsRes,
    scheduledNotificationsRes,
    auditLogRes,
    webhookEventsRes,
    conversationMembersRes,
    boostPurchasesRes,
    userRes,
  ] = await Promise.allSettled([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('posts').select('id, title, description, type, location, created_at, is_active').eq('user_id', userId),
    (supabase.from('post_comments') as any).select('id, content, created_at, post_id').eq('user_id', userId),
    supabase.from('messages').select('id, content, created_at, conversation_id').eq('sender_id', userId),
    (supabase.from('post_likes') as any).select('post_id, created_at').eq('user_id', userId),
    (supabase.from('saved_posts') as any).select('post_id, created_at').eq('user_id', userId),
    supabase.from('reviews').select('id, rating, comment, created_at, reviewed_id').eq('reviewer_id', userId),
    supabase.from('reviews').select('id, rating, comment, created_at, reviewer_id').eq('reviewed_id', userId),
    supabase.from('user_follows').select('followed_id').eq('follower_id', userId),
    supabase.from('user_follows').select('follower_id').eq('followed_id', userId),
    supabase.from('notifications').select('id, type, title, body, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
    (supabase.from('user_points') as any).select('action, points, created_at').eq('user_id', userId),
    (supabase.from('scheduled_notifications') as any).select('id, type, title, body, send_at, created_at').eq('user_id', userId),
    (supabase.from('audit_log') as any).select('id, action, entity_type, entity_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(500),
    (supabase.from('webhook_events') as any).select('id, event_type, payload, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(200),
    (supabase.from('conversation_members') as any).select('conversation_id, role, joined_at').eq('user_id', userId),
    (supabase.from('boost_purchases') as any).select('id, post_id, boost_type, amount, currency, created_at, expires_at').eq('user_id', userId),
    supabase.auth.getUser(),
  ])

  const getData = (res: PromiseSettledResult<any>) =>
    res.status === 'fulfilled' ? (res.value?.data ?? []) : []

  const user = userRes.status === 'fulfilled' ? userRes.value?.data?.user : null

  const exported: ExportedData = {
    exportDate: new Date().toISOString(),
    user: {
      id: userId,
      email: user?.email ?? 'unknown',
      created_at: user?.created_at ?? '',
    },
    profile: profileRes.status === 'fulfilled' ? profileRes.value?.data : null,
    posts: getData(postsRes),
    comments: getData(commentsRes),
    messages: getData(messagesRes),
    likes: getData(likesRes),
    savedPosts: getData(savedRes),
    reviews: [...getData(reviewsGivenRes), ...getData(reviewsReceivedRes)],
    follows: {
      following: getData(followingRes).map((f: any) => f.followed_id),
      followers: getData(followersRes).map((f: any) => f.follower_id),
    },
    notifications: getData(notificationsRes),
    points: getData(pointsRes),
    scheduledNotifications: getData(scheduledNotificationsRes),
    auditLog: getData(auditLogRes),
    webhookEvents: getData(webhookEventsRes),
    conversationMemberships: getData(conversationMembersRes),
    boostPurchases: getData(boostPurchasesRes),
  }

  // Strip sensitive fields from profile
  if (exported.profile) {
    delete (exported.profile as any).push_token
    delete (exported.profile as any).is_banned
  }

  const json = JSON.stringify(exported, null, 2)
  const filename = `tackbird-data-export-${new Date().toISOString().slice(0, 10)}.json`

  return downloadAsFile(json, filename, 'application/json')
}
